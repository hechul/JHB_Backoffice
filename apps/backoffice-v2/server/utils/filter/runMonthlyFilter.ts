import { createClient } from '@supabase/supabase-js'
import {
  buildMatchingResult,
  type FilterExperienceRow,
  type FilterPurchaseRow,
} from '../../../app/composables/useFilterMatching.ts'
import { FILTER_VER } from '../../../shared/filterVersion.ts'

// 서버/백그라운드 월별 재필터에서 쓰는 기본 단위
const FETCH_PAGE_SIZE = 1000
const UPDATE_CONCURRENCY = 30

interface PurchaseFilterRow extends FilterPurchaseRow {
  target_month: string
  match_reason: string | null
  match_rank: number | null
  needs_review: boolean
  filter_ver: string | null
  quantity_warning: boolean
}

interface ExperienceFilterRow extends FilterExperienceRow {
  target_month: string
  campaign_id: number
  unmatch_reason: string | null
}

interface PersistFilterLogInput {
  month: string
  actorName: string
  actorId: string | null
  status: 'success' | 'error'
  durationSec?: number
  rankCounts?: Record<number, number>
  totalMatched?: number
  totalUnmatchedExp?: number
  totalPurchasesProcessed?: number
  totalExpProcessed?: number
  newMatches?: number
  removedMatches?: number
  protectedCount?: number
  ambiguousCount?: number
  errorMessage?: string
}

export interface MonthlyFilterRunResult {
  month: string
  status: 'filtered' | 'skipped_no_purchases' | 'reset_no_experiences'
  totalPurchases: number
  totalExperiences: number
  matchedCount: number
  unmatchedExperienceCount: number
  pendingReviewCount: number
}

// 브라우저 세션 없이 서버에서 직접 Supabase를 다루기 위한 admin client
function getAdminClient() {
  const supabaseUrl = String(process.env.NUXT_PUBLIC_SUPABASE_URL || '').trim()
  const serviceKey = String(process.env.SUPABASE_SERVICE_KEY || '').trim()
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_KEY 또는 NUXT_PUBLIC_SUPABASE_URL 환경변수가 설정되지 않았습니다.')
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })
}

// YYYY-MM 형식 검증
function normalizeMonth(value: unknown): string | null {
  const normalized = String(value || '').trim()
  return /^\d{4}-\d{2}$/.test(normalized) ? normalized : null
}

export function normalizeTargetMonths(months: readonly unknown[]): string[] {
  return Array.from(
    new Set(
      months
        .map((month) => normalizeMonth(month))
        .filter((month): month is string => Boolean(month)),
    ),
  ).sort()
}

// 대량 update를 일정 개수씩 병렬 처리
async function runConcurrentUpdates<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  chunkSize = UPDATE_CONCURRENCY,
) {
  for (let index = 0; index < items.length; index += chunkSize) {
    const batch = items.slice(index, index + chunkSize)
    await Promise.all(batch.map((item) => worker(item)))
  }
}

// 특정 월의 purchases / experiences 원본을 서버에서 직접 읽는다.
async function loadFilterRows(month: string): Promise<{
  purchases: PurchaseFilterRow[]
  experiences: ExperienceFilterRow[]
}> {
  const admin = getAdminClient()
  const purchaseRows: PurchaseFilterRow[] = []
  const experienceRows: ExperienceFilterRow[] = []

  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await admin
      .from('purchases')
      .select('purchase_id, target_month, buyer_id, buyer_name, receiver_name, product_id, product_name, option_info, quantity, order_date, is_manual, matched_exp_id, match_reason, match_rank, needs_review, filter_ver, quantity_warning')
      .eq('target_month', month)
      .order('order_date', { ascending: true })
      .order('purchase_id', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1)

    if (error) throw error

    const rows = data || []
    purchaseRows.push(...rows.map((row: any) => ({
      purchase_id: String(row.purchase_id || ''),
      target_month: String(row.target_month || ''),
      buyer_id: String(row.buyer_id || ''),
      buyer_name: String(row.buyer_name || ''),
      receiver_name: row.receiver_name || '',
      product_id: String(row.product_id || ''),
      product_name: String(row.product_name || ''),
      option_info: row.option_info || '',
      quantity: Number(row.quantity || 0),
      order_date: String(row.order_date || ''),
      is_manual: Boolean(row.is_manual),
      matched_exp_id: row.matched_exp_id ? Number(row.matched_exp_id) : null,
      match_reason: row.match_reason || null,
      match_rank: row.match_rank ? Number(row.match_rank) : null,
      needs_review: Boolean(row.needs_review),
      filter_ver: row.filter_ver || null,
      quantity_warning: Boolean(row.quantity_warning),
    })))

    if (rows.length < FETCH_PAGE_SIZE) break
  }

  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await admin
      .from('experiences')
      .select('id, target_month, campaign_id, mission_product_name, mapped_product_id, option_info, receiver_name, naver_id, purchase_date, unmatch_reason')
      .eq('target_month', month)
      .order('purchase_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1)

    if (error) throw error

    const rows = data || []
    experienceRows.push(...rows.map((row: any) => ({
      id: Number(row.id),
      target_month: String(row.target_month || ''),
      campaign_id: Number(row.campaign_id || 0),
      mission_product_name: String(row.mission_product_name || ''),
      mapped_product_id: row.mapped_product_id || null,
      option_info: row.option_info || '',
      receiver_name: String(row.receiver_name || ''),
      naver_id: String(row.naver_id || ''),
      purchase_date: String(row.purchase_date || ''),
      unmatch_reason: row.unmatch_reason || null,
    })))

    if (rows.length < FETCH_PAGE_SIZE) break
  }

  return {
    purchases: purchaseRows,
    experiences: experienceRows,
  }
}

// 백그라운드 재필터도 수동 필터와 동일한 형식으로 실행 로그를 남긴다.
async function persistFilterLog(input: PersistFilterLogInput) {
  const admin = getAdminClient()
  const totalMatched = Number(input.totalMatched || 0)
  const rankBreakdown = input.rankCounts
    ? [1, 2, 3, 4, 5].map((rank) => {
        const count = Number(input.rankCounts?.[rank] || 0)
        return {
          rank,
          count,
          percent: totalMatched > 0 ? Math.round((count / totalMatched) * 100) : 0,
        }
      })
    : []

  const { error } = await admin.from('filter_logs').insert({
    executed_by_account_id: input.actorId,
    executed_by: input.actorName,
    filter_ver: FILTER_VER,
    target_month: input.month,
    status: input.status,
    summary_json: {
      duration_sec: Number(input.durationSec || 0),
      rank_breakdown: rankBreakdown,
      new_matches: Number(input.newMatches || 0),
      removed_matches: Number(input.removedMatches || 0),
      protected_count: Number(input.protectedCount || 0),
      ambiguous_count: Number(input.ambiguousCount || 0),
    },
    error_message: input.errorMessage || null,
    total_purchases_processed: Number(input.totalPurchasesProcessed || 0),
    total_exp_processed: Number(input.totalExpProcessed || 0),
    total_matched: totalMatched,
    total_unmatched_exp: Number(input.totalUnmatchedExp || 0),
  })

  if (error) throw error
}

// 확인 필요 건수 집계
async function countPendingReviews(month: string): Promise<number> {
  const admin = getAdminClient()
  const { count, error } = await admin
    .from('purchases')
    .select('purchase_id', { count: 'exact', head: true })
    .eq('target_month', month)
    .eq('needs_review', true)

  if (error) throw error
  return Number(count || 0)
}

// 체험단이 없는 달은 자동 판정 흔적만 초기화하면 실구매 상태로 정리할 수 있다.
async function resetMonthMatchingState(
  admin: ReturnType<typeof getAdminClient>,
  month: string,
) {
  const { error } = await admin
    .from('purchases')
    .update({
      is_fake: false,
      match_reason: null,
      match_rank: null,
      matched_exp_id: null,
      needs_review: false,
    })
    .eq('target_month', month)
    .eq('is_manual', false)

  if (error) throw error
}

/**
 * 주어진 월 목록 중 experiences 테이블에 실제 데이터가 있는 월만 반환한다.
 * 이유: 동기화 후 자동 재필터 시 체험단 유무에 따라 처리 경로가 다르다.
 *       체험단 있는 월 → 무거운 매칭 알고리즘 → 백그라운드 프로세스
 *       체험단 없는 월 → 간단한 초기화만 → 인라인 즉시 실행
 */
export async function findMonthsWithExperiences(months: readonly unknown[]): Promise<string[]> {
  const normalizedMonths = normalizeTargetMonths(months) // YYYY-MM 형식 정규화 + 중복 제거
  if (normalizedMonths.length === 0) return []

  const admin = getAdminClient()
  const matchedMonths = new Set<string>() // 체험단이 존재하는 월을 중복 없이 수집

  // FETCH_PAGE_SIZE(1000) 단위로 페이지네이션해서 전체 조회
  // (체험단이 매우 많은 경우를 대비해 한 번에 다 가져오지 않음)
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await admin
      .from('experiences')
      .select('target_month')                          // target_month 컬럼만 조회 (불필요한 데이터 최소화)
      .in('target_month', normalizedMonths)            // 대상 월에 해당하는 행만 필터
      .order('target_month', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1)

    if (error) throw error

    const rows = data || []
    for (const row of rows as any[]) {
      const month = normalizeMonth(row.target_month)
      if (month) matchedMonths.add(month) // Set이라 같은 월이 여러 행 나와도 중복 없이 수집
    }
    if (rows.length < FETCH_PAGE_SIZE) break // 마지막 페이지면 종료
  }

  // 입력된 월 중 실제로 체험단이 존재하는 월만 걸러서 반환
  return normalizedMonths.filter((month) => matchedMonths.has(month))
}

export async function runMonthlyFilter(
  month: string,
  options: { actorName?: string; actorId?: string | null } = {},
): Promise<MonthlyFilterRunResult> {
  const normalizedMonth = normalizeMonth(month)
  if (!normalizedMonth) {
    throw new Error(`유효하지 않은 target_month 입니다: ${month}`)
  }

  const actorName = String(options.actorName || '자동 재필터(sync)')
  const actorId = options.actorId || null
  const startedAt = Date.now()
  const admin = getAdminClient()

  let purchases: PurchaseFilterRow[] = []
  let experiences: ExperienceFilterRow[] = []

  try {
    // 1) 대상 월의 주문/체험단 원본 로딩
    const loaded = await loadFilterRows(normalizedMonth)
    purchases = loaded.purchases
    experiences = loaded.experiences

    // 주문이 하나도 없는 달은 더 진행할 필요가 없다.
    if (purchases.length === 0) {
      return {
        month: normalizedMonth,
        status: 'skipped_no_purchases',
        totalPurchases: 0,
        totalExperiences: experiences.length,
        matchedCount: 0,
        unmatchedExperienceCount: 0,
        pendingReviewCount: 0,
      }
    }

    // 체험단이 없는 달은 무거운 매칭 알고리즘 없이
    // "실구매 상태 초기화 + filter_ver 각인"만 해도 충분하다.
    if (experiences.length === 0) {
      await resetMonthMatchingState(admin, normalizedMonth)
      const { error: stampFilterVersionError } = await admin
        .from('purchases')
        .update({ filter_ver: FILTER_VER })
        .eq('target_month', normalizedMonth)
        .eq('is_manual', false)
        .is('filter_ver', null)
      if (stampFilterVersionError) throw stampFilterVersionError
      const pendingReviewCount = await countPendingReviews(normalizedMonth)
      const durationSec = (Date.now() - startedAt) / 1000

      await persistFilterLog({
        month: normalizedMonth,
        actorName,
        actorId,
        status: 'success',
        durationSec,
        totalMatched: 0,
        totalUnmatchedExp: 0,
        totalPurchasesProcessed: purchases.filter((row) => !row.is_manual).length,
        totalExpProcessed: 0,
        newMatches: 0,
        removedMatches: 0,
        protectedCount: 0,
        ambiguousCount: 0,
      })

      return {
        month: normalizedMonth,
        status: 'reset_no_experiences',
        totalPurchases: purchases.length,
        totalExperiences: 0,
        matchedCount: 0,
        unmatchedExperienceCount: 0,
        pendingReviewCount,
      }
    }

    // 체험단이 있는 달은 월 전체를 다시 계산한다.
    const matching = buildMatchingResult(purchases, experiences)

    // 2) 기존 자동 판정 초기화
    await resetMonthMatchingState(admin, normalizedMonth)

    // 자동 계산 메타도 함께 초기화
    const { error: resetMetaError } = await admin
      .from('purchases')
      .update({
        filter_ver: null,
        quantity_warning: false,
      })
      .eq('target_month', normalizedMonth)
      .eq('is_manual', false)
    if (resetMetaError) throw resetMetaError

    // 3) 체험단으로 판정된 주문 반영
    await runConcurrentUpdates(matching.matches, async (match) => {
      const { error } = await admin
        .from('purchases')
        .update({
          is_fake: true,
          match_reason: match.reason,
          match_rank: match.rank,
          matched_exp_id: match.expId,
          needs_review: match.needsReview,
          filter_ver: FILTER_VER,
          quantity_warning: match.quantityWarning,
        })
        .eq('purchase_id', match.purchaseId)
      if (error) throw error
    })

    // 4) 다중 후보라 사람이 확인해야 하는 주문 반영
    if (matching.reviewPurchaseIds.length > 0) {
      for (let index = 0; index < matching.reviewPurchaseIds.length; index += 50) {
        const batch = matching.reviewPurchaseIds.slice(index, index + 50)
        const { error } = await admin
          .from('purchases')
          .update({
            is_fake: false,
            match_reason: '다중후보_확인필요',
            match_rank: null,
            matched_exp_id: null,
            needs_review: true,
            filter_ver: FILTER_VER,
            quantity_warning: false,
          })
          .in('purchase_id', batch)
        if (error) throw error
      }
    }

    // 5) experiences.unmatch_reason 초기화 후 다시 기록
    const { error: clearReasonError } = await admin
      .from('experiences')
      .update({ unmatch_reason: null })
      .eq('target_month', normalizedMonth)
    if (clearReasonError) throw clearReasonError

    const unmatchedEntries = Array.from(matching.unmatchedReasons.entries())
    await runConcurrentUpdates(unmatchedEntries, async ([expId, reason]) => {
      const { error } = await admin
        .from('experiences')
        .update({ unmatch_reason: reason })
        .eq('id', expId)
      if (error) throw error
    })

    // 6) 실구매로 남은 주문도 분석 화면에서 읽히도록 filter_ver를 찍어준다.
    const { error: stampFilterVersionError } = await admin
      .from('purchases')
      .update({ filter_ver: FILTER_VER })
      .eq('target_month', normalizedMonth)
      .eq('is_manual', false)
      .is('filter_ver', null)
    if (stampFilterVersionError) throw stampFilterVersionError

    const pendingReviewCount = await countPendingReviews(normalizedMonth)
    const durationSec = (Date.now() - startedAt) / 1000

    // 7) 실행 로그 저장
    await persistFilterLog({
      month: normalizedMonth,
      actorName,
      actorId,
      status: 'success',
      durationSec,
      rankCounts: matching.rankCounts,
      totalMatched: matching.matches.length,
      totalUnmatchedExp: matching.unmatchedReasons.size,
      totalPurchasesProcessed: purchases.filter((row) => !row.is_manual).length,
      totalExpProcessed: experiences.length,
      newMatches: matching.newMatches,
      removedMatches: matching.removedMatches,
      protectedCount: matching.protectedCount,
      ambiguousCount: matching.ambiguousCount,
    })

    return {
      month: normalizedMonth,
      status: 'filtered',
      totalPurchases: purchases.length,
      totalExperiences: experiences.length,
      matchedCount: matching.matches.length,
      unmatchedExperienceCount: matching.unmatchedReasons.size,
      pendingReviewCount,
    }
  } catch (error) {
    // 실패 시에도 로그는 남겨서 운영에서 원인을 추적할 수 있게 한다.
    const durationSec = (Date.now() - startedAt) / 1000
    await persistFilterLog({
      month: normalizedMonth,
      actorName,
      actorId,
      status: 'error',
      durationSec,
      totalMatched: 0,
      totalUnmatchedExp: 0,
      totalPurchasesProcessed: purchases.filter((row) => !row.is_manual).length,
      totalExpProcessed: experiences.length,
      errorMessage: error instanceof Error ? error.message : String(error),
    }).catch((logError) => {
      console.error('[monthly-filter] failed to write error log', logError)
    })
    throw error
  }
}
