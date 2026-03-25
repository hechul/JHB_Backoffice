import { createClient } from '@supabase/supabase-js'
import {
  buildMatchingResult,
  type FilterExperienceRow,
  type FilterPurchaseRow,
} from '../../../app/composables/useFilterMatching.ts'
import { FILTER_VER } from '../../../shared/filterVersion.ts'

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
  status: 'filtered' | 'skipped_no_purchases' | 'skipped_no_experiences'
  totalPurchases: number
  totalExperiences: number
  matchedCount: number
  unmatchedExperienceCount: number
  pendingReviewCount: number
}

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

export async function findMonthsWithExperiences(months: readonly unknown[]): Promise<string[]> {
  const normalizedMonths = normalizeTargetMonths(months)
  if (normalizedMonths.length === 0) return []

  const admin = getAdminClient()
  const matchedMonths = new Set<string>()

  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await admin
      .from('experiences')
      .select('target_month')
      .in('target_month', normalizedMonths)
      .order('target_month', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1)

    if (error) throw error

    const rows = data || []
    for (const row of rows as any[]) {
      const month = normalizeMonth(row.target_month)
      if (month) matchedMonths.add(month)
    }
    if (rows.length < FETCH_PAGE_SIZE) break
  }

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
    const loaded = await loadFilterRows(normalizedMonth)
    purchases = loaded.purchases
    experiences = loaded.experiences

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

    if (experiences.length === 0) {
      return {
        month: normalizedMonth,
        status: 'skipped_no_experiences',
        totalPurchases: purchases.length,
        totalExperiences: 0,
        matchedCount: 0,
        unmatchedExperienceCount: 0,
        pendingReviewCount: 0,
      }
    }

    const matching = buildMatchingResult(purchases, experiences)

    const { error: resetError } = await admin
      .from('purchases')
      .update({
        is_fake: false,
        match_reason: null,
        match_rank: null,
        matched_exp_id: null,
        needs_review: false,
        filter_ver: null,
        quantity_warning: false,
      })
      .eq('target_month', normalizedMonth)
      .eq('is_manual', false)
    if (resetError) throw resetError

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
