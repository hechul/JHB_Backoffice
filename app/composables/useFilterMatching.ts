/**
 * 필터링 매칭 엔진 — 키워드 추출 + 5‑Rank 순차 매칭
 *
 * 변경점(2026-03-03):
 *   - 상품명 비교: 전체 문자열 → 핵심 키워드 추출 후 일치 비교
 *   - 옵션 비교: 전체 문자열 → 상품별 키워드 추출 후 일치 비교
 *   - 체험단 미지원 상품(샘플팩/맛보기/동결건조 리뉴얼전): 매칭 대상 제외
 *   - 디스펜서(츄르짜개)는 옵션 비교를 생략
 */

/* ─── 공통 인터페이스 ─── */

export interface FilterPurchaseRow {
  purchase_id: string
  buyer_id: string
  buyer_name: string
  receiver_name: string | null
  product_id: string
  product_name: string
  option_info: string | null
  quantity: number
  order_date: string
  is_manual: boolean
  matched_exp_id: number | null
}

export interface FilterExperienceRow {
  id: number
  mission_product_name: string
  mapped_product_id: string | null
  option_info: string | null
  receiver_name: string
  naver_id: string
  purchase_date: string
}

export interface FilterMatchRecord {
  purchaseId: string
  expId: number
  rank: number
  reason: string
  needsReview: boolean
  quantityWarning: boolean
}

export interface FilterMatchExecutionResult {
  matches: FilterMatchRecord[]
  unmatchedReasons: Map<number, string>
  rankCounts: Record<number, number>
  protectedCount: number
  newMatches: number
  removedMatches: number
  reviewPurchaseIds: string[]
  ambiguousCount: number
}

type NameMatchType = 'none' | 'buyer' | 'receiver' | 'both'

/* ─── 문자열 정규화 헬퍼 ─── */

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[^0-9a-z가-힣]/g, '')
}

function idPrefix(value: unknown): string {
  return normalizeText(value).slice(0, 4)
}

function toDate(value: string): Date | null {
  if (!value) return null
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function diffDays(a: string, b: string): number {
  const da = toDate(a)
  const db = toDate(b)
  if (!da || !db) return Number.POSITIVE_INFINITY
  const ms = Math.abs(da.getTime() - db.getTime())
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

/* ─── 상품명 키워드 추출 ─── */

/** 상품명에서 추출할 핵심 키워드 목록 (순서 = 우선순위) */
const PRODUCT_KEYWORDS: string[] = [
  '애착트릿',
  '츄라잇',
  '케어푸',
  '두부모래',
  '이즈바이트',
  '엔자이츄',
  '트릿백',
  '츄르짜개',
  '샘플팩',
  '맛보기',
]

/** 체험단 미지원 상품 키워드 — 필터링 매칭 대상에서 제외 */
const NON_CAMPAIGN_KEYWORDS: Set<string> = new Set([
  '샘플팩',
  '맛보기',
  '동결건조리뉴얼전',
])

/**
 * 상품명(스스 또는 체험단)에서 핵심 키워드를 추출.
 * 못 찾으면 null.
 */
export function extractProductKeyword(rawName: string): string | null {
  const name = normalizeText(rawName)
  if (!name) return null

  // "고양이 간식 디스펜서" 표현은 츄르짜개 라인으로 통합한다.
  if (name.includes('츄르짜개') || name.includes('디스펜서')) return '츄르짜개'

  // 리뉴얼 전 동결건조:
  // 동결건조(또는 오탈자 동견건조)가 포함되고 애착트릿이 없으면 별도 키워드로 분리.
  const hasFreezeDried = name.includes('동결건조') || name.includes('동견건조')
  const hasAttachmentTreat = name.includes('애착트릿')
  if (hasFreezeDried && !hasAttachmentTreat) return '동결건조리뉴얼전'

  for (const kw of PRODUCT_KEYWORDS) {
    if (name.includes(kw)) return kw
  }
  return null
}

/**
 * 해당 purchase가 체험단 미지원 상품인지 여부.
 * true이면 필터링 매칭 후보에서 제외.
 */
export function isNonCampaignProduct(productName: string): boolean {
  const kw = extractProductKeyword(productName)
  if (!kw) return false
  return NON_CAMPAIGN_KEYWORDS.has(kw)
}

/* ─── 옵션 키워드 추출 ─── */

interface OptionKeywordRule {
  product: string       // 상품 키워드 (예: '애착트릿')
  source: 'product_name' | 'option_info'  // 추출 소스 (스스 기준)
  keywords: string[]    // 추출 대상 키워드
}

const OPTION_KEYWORD_RULES: OptionKeywordRule[] = [
  { product: '애착트릿', source: 'product_name', keywords: ['북어', '연어', '치킨', '3종세트'] },
  { product: '츄라잇', source: 'option_info', keywords: ['데일리핏', '클린펫', '브라이트'] },
]

function normalizeOptionAlias(productKeyword: string, normalizedSource: string): string | null {
  if (productKeyword !== '애착트릿') return null
  if (normalizedSource.includes('닭가슴살') || normalizedSource.includes('닭고기')) return '치킨'
  return null
}

/**
 * 스마트스토어 purchase에서 옵션 키워드를 추출.
 * @param productKeyword - 이미 추출된 상품 키워드
 * @param productName    - purchase.product_name (원본)
 * @param optionInfo     - purchase.option_info (원본)
 * @returns 추출된 옵션 키워드 또는 null (규칙 미정의 상품)
 */
export function extractPurchaseOptionKeyword(
  productKeyword: string,
  productName: string,
  optionInfo: string,
): string | null {
  const rule = OPTION_KEYWORD_RULES.find((r) => r.product === productKeyword)
  if (!rule) return null // 규칙 미정의 → 옵션 비교 생략

  const source = rule.source === 'product_name'
    ? normalizeText(productName)
    : normalizeText(optionInfo)

  for (const kw of rule.keywords) {
    if (source.includes(kw)) return kw
  }

  const aliasFromSource = normalizeOptionAlias(productKeyword, source)
  if (aliasFromSource) return aliasFromSource

  // 실데이터 변형 대응:
  // 애착트릿은 상품명에 옵션 키워드가 주로 들어오지만,
  // 일부 파일은 옵션정보 컬럼으로 들어오므로 fallback 탐색을 허용한다.
  if (rule.source === 'product_name') {
    const optionSource = normalizeText(optionInfo)
    for (const kw of rule.keywords) {
      if (optionSource.includes(kw)) return kw
    }
    const aliasFromOption = normalizeOptionAlias(productKeyword, optionSource)
    if (aliasFromOption) return aliasFromOption
  }
  return null
}

/**
 * 체험단 experience에서 옵션 키워드를 추출.
 * @param productKeyword - 이미 추출된 상품 키워드
 * @param optionInfo     - experience.option_info (원본)
 * @returns 추출된 옵션 키워드 또는 null
 */
export function extractExperienceOptionKeyword(
  productKeyword: string,
  optionInfo: string,
): string | null {
  const rule = OPTION_KEYWORD_RULES.find((r) => r.product === productKeyword)
  if (!rule) return null // 규칙 미정의

  const normalized = normalizeText(optionInfo)
  for (const kw of rule.keywords) {
    if (normalized.includes(kw)) return kw
  }
  const alias = normalizeOptionAlias(productKeyword, normalized)
  if (alias) return alias
  return null
}

/* ─── 비교 함수(5‑Rank에서 사용) ─── */

function getNameMatchType(purchase: FilterPurchaseRow, exp: FilterExperienceRow): NameMatchType {
  const target = normalizeText(exp.receiver_name)
  if (!target) return 'none'
  const buyer = normalizeText(purchase.buyer_name)
  const receiver = normalizeText(purchase.receiver_name || '')
  const buyerMatched = Boolean(buyer) && target === buyer
  const receiverMatched = Boolean(receiver) && target === receiver
  if (buyerMatched && receiverMatched) return 'both'
  if (receiverMatched) return 'receiver'
  if (buyerMatched) return 'buyer'
  return 'none'
}

function namesMatch(purchase: FilterPurchaseRow, exp: FilterExperienceRow): boolean {
  return getNameMatchType(purchase, exp) !== 'none'
}

function idsMatch(purchase: FilterPurchaseRow, exp: FilterExperienceRow): boolean {
  const left = idPrefix(purchase.buyer_id)
  const right = idPrefix(exp.naver_id)
  return Boolean(left) && Boolean(right) && left === right
}

/**
 * 상품명 비교 — 키워드 추출 우선, 폴백으로 정규화 문자열 포함 비교.
 */
function productMatches(purchase: FilterPurchaseRow, exp: FilterExperienceRow): boolean {
  const purchaseKw = extractProductKeyword(purchase.product_name)
  const expKw = extractProductKeyword(exp.mission_product_name)

  // 양쪽 모두 키워드 추출 성공 → 키워드 비교
  if (purchaseKw && expKw) return purchaseKw === expKw

  // 한쪽이라도 키워드 없으면 → 정규화 문자열 포함 관계로 폴백
  const pName = normalizeText(purchase.product_name)
  const eName = normalizeText(exp.mission_product_name)
  if (!pName || !eName) return false
  return pName === eName || pName.includes(eName) || eName.includes(pName)
}

/**
 * 옵션 비교 — 상품별 키워드 추출 방식.
 * 키워드 규칙이 정의되지 않은 상품은 true(무조건 일치)를 반환한다.
 * 양쪽 모두 키워드 추출 실패 시에도 정규화 문자열 비교로 폴백한다.
 */
function optionsMatch(purchase: FilterPurchaseRow, exp: FilterExperienceRow): boolean {
  const productKw = extractProductKeyword(purchase.product_name)
  // 디스펜서(츄르짜개)는 색상/옵션 편차가 커서 옵션 비교에서 제외한다.
  if (productKw === '츄르짜개') return true

  if (!productKw) {
    // 키워드 규칙 없음 → 정규화 문자열 비교 폴백
    const pOpt = normalizeText(purchase.option_info)
    const eOpt = normalizeText(exp.option_info)
    if (!pOpt && !eOpt) return true
    if (!pOpt || !eOpt) return true // 한쪽 비어 있으면 비교 불능 → 일치 처리
    return pOpt === eOpt || pOpt.includes(eOpt) || eOpt.includes(pOpt)
  }

  const rule = OPTION_KEYWORD_RULES.find((r) => r.product === productKw)
  if (!rule) return true // 규칙 미정의 상품 → 무조건 일치

  const purchaseOptionKw = extractPurchaseOptionKeyword(productKw, purchase.product_name, purchase.option_info || '')
  const expOptionKw = extractExperienceOptionKeyword(productKw, exp.option_info || '')

  // 양쪽 모두 키워드 추출 못 하면 비교 불능 → 일치로 처리
  if (!purchaseOptionKw && !expOptionKw) return true
  // 한쪽만 못 찾으면 불일치
  if (!purchaseOptionKw || !expOptionKw) return false

  return purchaseOptionKw === expOptionKw
}

function isInDateRange(purchase: FilterPurchaseRow, exp: FilterExperienceRow, tolerance: number): boolean {
  return diffDays(purchase.order_date, exp.purchase_date) <= tolerance
}

/* ─── 미매칭 사유 ─── */

/**
 * 체험단 데이터 중복 제거.
 * 정확도 보존을 위해 과도한 축약을 피하고, 사실상 "완전중복"에 가까운 건만 제거한다.
 * - naver_id가 있으면: naver_id + 상품키워드 + 구매일 + 옵션
 * - naver_id가 없으면: 수취인명 + 상품키워드 + 구매일 + 옵션
 */
export function deduplicateExperiences(experiences: FilterExperienceRow[]): FilterExperienceRow[] {
  const groups = new Map<string, FilterExperienceRow>()
  for (const exp of experiences) {
    const naverId = normalizeText(exp.naver_id)
    const receiverName = normalizeText(exp.receiver_name)
    const productKey = extractProductKeyword(exp.mission_product_name) || normalizeText(exp.mission_product_name) || `__product_${exp.id}`
    const purchaseDate = String(exp.purchase_date || '')
    const optionKey = normalizeText(exp.option_info || '')
    const identityKey = naverId || (receiverName ? `receiver_${receiverName}` : `id_${exp.id}`)
    const groupKey = `${identityKey}::${productKey}::${purchaseDate}::${optionKey}`

    const existing = groups.get(groupKey)
    if (!existing) {
      groups.set(groupKey, exp)
    } else {
      // 더 긴 상품명(더 상세한 정보)을 대표로 선택
      if ((exp.mission_product_name || '').length > (existing.mission_product_name || '').length) {
        groups.set(groupKey, exp)
      }
    }
  }
  return Array.from(groups.values())
}

export function computeUnmatchReason(
  exp: FilterExperienceRow,
  purchases: FilterPurchaseRow[],
): string {
  if (!exp.mapped_product_id) return '상품매핑_실패'

  const expKw = extractProductKeyword(exp.mission_product_name)
  if (!expKw) {
    // 키워드 추출 못 하면 폴백으로 상품명 포함 비교 시도
    const eName = normalizeText(exp.mission_product_name)
    if (!eName) return '상품명_없음'
    const hasAnyProduct = purchases.some((p) => {
      const pName = normalizeText(p.product_name)
      return pName === eName || pName.includes(eName) || eName.includes(pName)
    })
    if (!hasAnyProduct) return '상품매핑_실패'
  }

  const hasDateCandidate = purchases.some((purchase) => {
    if (!productMatches(purchase, exp)) return false
    return isInDateRange(purchase, exp, 1)
  })
  if (!hasDateCandidate) return '기간외_주문없음'
  return '조건_불일치'
}

/* ─── 메인 매칭 엔진 ─── */

interface RankRule {
  rank: number
  reason: string
  matches: (p: FilterPurchaseRow, e: FilterExperienceRow) => boolean
}

interface CandidateScore {
  exp: FilterExperienceRow
  score: number
  dateGap: number
  nameScore: number
}

function getNameScore(matchType: NameMatchType): number {
  if (matchType === 'both') return 30
  if (matchType === 'receiver') return 20
  if (matchType === 'buyer') return 10
  return 0
}

function sortCandidateScore(a: CandidateScore, b: CandidateScore): number {
  if (b.score !== a.score) return b.score - a.score
  if (a.dateGap !== b.dateGap) return a.dateGap - b.dateGap
  if (b.nameScore !== a.nameScore) return b.nameScore - a.nameScore
  return a.exp.id - b.exp.id
}

function buildCandidateScores(
  purchase: FilterPurchaseRow,
  rule: RankRule,
  experiences: FilterExperienceRow[],
  matchedExpIds: Set<number>,
): CandidateScore[] {
  const result: CandidateScore[] = []
  for (const exp of experiences) {
    if (matchedExpIds.has(exp.id)) continue
    if (!rule.matches(purchase, exp)) continue

    const dateGap = diffDays(purchase.order_date, exp.purchase_date)
    const nameScore = getNameScore(getNameMatchType(purchase, exp))
    const optionBonus = optionsMatch(purchase, exp) ? 2 : 0
    const keywordBonus = extractProductKeyword(purchase.product_name) && extractProductKeyword(exp.mission_product_name) ? 1 : 0
    const dateBonus = dateGap === 0 ? 6 : (dateGap === 1 ? 3 : 0)
    const score = nameScore + dateBonus + optionBonus + keywordBonus

    result.push({
      exp,
      score,
      dateGap,
      nameScore,
    })
  }
  return result.sort(sortCandidateScore)
}

export function buildMatchingResult(
  purchases: FilterPurchaseRow[],
  experiences: FilterExperienceRow[],
): FilterMatchExecutionResult {
  // 수동 분류 보호
  const protectedPurchases = purchases.filter((row) => row.is_manual)
  const candidatePurchases = purchases.filter((row) => {
    if (row.is_manual) return false
    // 체험단 미지원 상품 제외
    if (isNonCampaignProduct(row.product_name)) return false
    return true
  })
  const previousMatched = new Set(
    purchases.filter((row) => !row.is_manual)
      .map((row) => Number(row.matched_exp_id))
      .filter((id) => Number.isFinite(id) && id > 0),
  )
  const protectedExpIds = new Set(
    protectedPurchases.map((row) => Number(row.matched_exp_id))
      .filter((id) => Number.isFinite(id) && id > 0),
  )
  const matchedExpIds = new Set<number>(protectedExpIds)
  const matchedPurchaseIds = new Set<string>()
  const matches: FilterMatchRecord[] = []
  const rankCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

  // 체험단 중복 제거: 같은 (naver_id + 상품키워드) 그룹에서 대표 1행만 사용
  // → 1인이 같은 상품으로 여러 행 있을 때 미매칭 부풀리기 방지
  const candidateExperiences = deduplicateExperiences(experiences)

  const rankRules: RankRule[] = [
      {
        rank: 1,
        reason: '완벽일치_매칭',
        matches: (p, e) =>
          idsMatch(p, e)
          && namesMatch(p, e)
          && productMatches(p, e)
          && optionsMatch(p, e)
          && diffDays(p.order_date, e.purchase_date) === 0,
      },
      {
        rank: 2,
        reason: '날짜오차_매칭',
        matches: (p, e) =>
          idsMatch(p, e)
          && namesMatch(p, e)
          && productMatches(p, e)
          && optionsMatch(p, e)
          && isInDateRange(p, e, 1),
      },
      {
        rank: 3,
        reason: '옵션불일치_매칭',
        matches: (p, e) =>
          idsMatch(p, e)
          && namesMatch(p, e)
          && productMatches(p, e)
          && isInDateRange(p, e, 1)
          && !optionsMatch(p, e),
      },
      {
        rank: 4,
        reason: 'ID불일치_매칭',
        matches: (p, e) =>
          namesMatch(p, e)
          && productMatches(p, e)
          && optionsMatch(p, e)
          && isInDateRange(p, e, 1)
          && !idsMatch(p, e),
      },
      {
        rank: 5,
        reason: '이름불일치_매칭',
        matches: (p, e) =>
          idsMatch(p, e)
          && productMatches(p, e)
          && optionsMatch(p, e)
          && isInDateRange(p, e, 1)
          && !namesMatch(p, e),
      },
    ]

  const reviewPurchaseIds = new Set<string>()
  let ambiguousCount = 0

  for (const rule of rankRules) {
    const pending = candidatePurchases.filter((purchase) => !matchedPurchaseIds.has(purchase.purchase_id))
    const orderedPurchases = pending
      .map((purchase) => ({
        purchase,
        candidates: buildCandidateScores(purchase, rule, candidateExperiences, matchedExpIds),
      }))
      .filter((entry) => entry.candidates.length > 0)
      // 후보 수가 적은 건부터 확정해, 후보 소비로 인한 오매칭을 줄인다.
      .sort((a, b) => {
        if (a.candidates.length !== b.candidates.length) return a.candidates.length - b.candidates.length
        return sortCandidateScore(a.candidates[0]!, b.candidates[0]!)
      })

    for (const entry of orderedPurchases) {
      const purchase = entry.purchase
      if (matchedPurchaseIds.has(purchase.purchase_id)) continue

      const candidates = buildCandidateScores(purchase, rule, candidateExperiences, matchedExpIds)
      if (candidates.length === 0) continue

      const top = candidates[0]!
      const second = candidates[1]

      // Rank 4/5는 허용 오차가 큰 단계이므로 동점 다중 후보는 자동 판정 대신 수동 검토로 보낸다.
      if (rule.rank >= 4 && second
        && top.score === second.score
        && top.dateGap === second.dateGap
        && top.nameScore === second.nameScore) {
        reviewPurchaseIds.add(purchase.purchase_id)
        matchedPurchaseIds.add(purchase.purchase_id)
        ambiguousCount++
        continue
      }

      const exp = top.exp

      matchedPurchaseIds.add(purchase.purchase_id)
      matchedExpIds.add(exp.id)
      rankCounts[rule.rank] = (rankCounts[rule.rank] || 0) + 1
      matches.push({
        purchaseId: purchase.purchase_id,
        expId: exp.id,
        rank: rule.rank,
        reason: rule.reason,
        quantityWarning: Number(purchase.quantity || 0) >= 2,
        needsReview: rule.rank >= 4 || Number(purchase.quantity || 0) >= 2,
      })
    }
  }

  // 미매칭 사유
  // NOTE:
  // 매칭은 deduplicateExperiences(experiences) 기준으로 수행하므로,
  // 미매칭 집계도 동일한 deduped 집합을 기준으로 계산해야
  // 중복 체험단 행이 "미매칭"으로 부풀려지는 현상을 막을 수 있다.
  const unmatchedReasons = new Map<number, string>()
  for (const exp of candidateExperiences) {
    if (matchedExpIds.has(exp.id)) continue
    unmatchedReasons.set(exp.id, computeUnmatchReason(exp, purchases))
  }

  const currentMatched = new Set(matches.map((item) => item.expId))
  const newMatches = Array.from(currentMatched).filter((id) => !previousMatched.has(id)).length
  const removedMatches = Array.from(previousMatched).filter((id) => !currentMatched.has(id)).length

  return {
    matches,
    unmatchedReasons,
    rankCounts,
    protectedCount: protectedPurchases.length,
    newMatches,
    removedMatches,
    reviewPurchaseIds: Array.from(reviewPurchaseIds),
    ambiguousCount,
  }
}
