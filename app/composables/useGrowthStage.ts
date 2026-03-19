export type CustomerStageCode = 'Entry' | 'Growth' | 'Premium' | 'Core' | 'Other'
export type PurchaseIntensityCode = 'Dormant' | 'Low' | 'Medium' | 'High' | 'VeryHigh'

// 상품 단계 레이블 (products.vue 등 상품 표시용, 고객 단계와 별개)
const PRODUCT_STAGE_LABELS: Record<number, string> = {
  1: '입문',
  2: '성장',
  3: '핵심',
  4: '프리미엄',
}

const CUSTOMER_STAGE_LABELS: Record<CustomerStageCode, string> = {
  Entry: '신규',
  Growth: '성장',
  Premium: '단골',
  Core: '핵심',
  Other: '기타',
}

const PURCHASE_INTENSITY_LABELS: Record<PurchaseIntensityCode, string> = {
  Dormant: '휴면',
  Low: '낮음',
  Medium: '보통',
  High: '높음',
  VeryHigh: '매우 높음',
}

// 단계 순서: 신규(1) → 성장(2) → 단골(3) → 핵심(4)
const CUSTOMER_STAGE_ORDER: Record<Exclude<CustomerStageCode, 'Other'>, number> = {
  Entry: 1,
  Growth: 2,
  Premium: 3,
  Core: 4,
}

function parseDateValue(value: string | Date): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const cloned = new Date(value)
    cloned.setHours(0, 0, 0, 0)
    return cloned
  }

  const raw = String(value || '').trim()
  if (!raw) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function normalizeDateKey(value: string): string {
  const parsed = parseDateValue(value)
  if (!parsed) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function productStageLabel(stage: number | null | undefined): string {
  if (stage === null || stage === undefined) return '기타'
  return PRODUCT_STAGE_LABELS[stage] || '-'
}

export function customerStageLabel(stage: string | null | undefined): string {
  if (!stage) return '기타'
  return CUSTOMER_STAGE_LABELS[stage as CustomerStageCode] || stage
}

export function customerStagePercent(stage: string | null | undefined): number {
  if (!stage) return 0
  const order = CUSTOMER_STAGE_ORDER[stage as Exclude<CustomerStageCode, 'Other'>]
  return order ? order * 25 : 0
}

export function purchaseIntensityLabel(intensity: PurchaseIntensityCode | string | null | undefined): string {
  if (!intensity) return '휴면'
  return PURCHASE_INTENSITY_LABELS[intensity as PurchaseIntensityCode] || String(intensity)
}

export function purchaseIntensityBadgeVariant(intensity: PurchaseIntensityCode | string | null | undefined): 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (intensity === 'VeryHigh') return 'success'
  if (intensity === 'High') return 'primary'
  if (intensity === 'Medium') return 'info'
  if (intensity === 'Low') return 'neutral'
  return 'neutral'
}

export function countDistinctPurchaseMonths(values: string[]): number {
  const months = new Set<string>()
  for (const value of values) {
    const dateKey = normalizeDateKey(value)
    if (!dateKey) continue
    months.add(dateKey.slice(0, 7))
  }
  return months.size
}

export function countRecentPurchaseDays(
  values: string[],
  referenceDate: string | Date = new Date(),
  windowDays = 90,
): number {
  const reference = parseDateValue(referenceDate)
  if (!reference) return 0

  const start = new Date(reference)
  start.setDate(start.getDate() - Math.max(windowDays - 1, 0))

  const uniqueDates = new Set<string>()
  for (const value of values) {
    const dateKey = normalizeDateKey(value)
    if (!dateKey) continue
    uniqueDates.add(dateKey)
  }

  let count = 0
  for (const dateKey of uniqueDates) {
    const parsed = parseDateValue(dateKey)
    if (!parsed) continue
    if (parsed >= start && parsed <= reference) count += 1
  }
  return count
}

/**
 * 고객 성장 단계 결정
 *
 * 단계 기준:
 *   신규  — 고유 구매 연월 수 1~2개
 *   성장  — 고유 구매 연월 수 3~5개
 *   단골  — 고유 구매 연월 수 6~11개
 *   핵심  — 고유 구매 연월 수 12개 이상
 *
 * 구매 연월 수는 같은 달 여러 주문을 1개월로 카운트한다.
 */
export function computeCustomerStage(
  purchaseMonthCount: number,
): CustomerStageCode {
  if (purchaseMonthCount < 1) return 'Other'
  if (purchaseMonthCount >= 12) return 'Core'
  if (purchaseMonthCount >= 6) return 'Premium'
  if (purchaseMonthCount >= 3) return 'Growth'
  return 'Entry'
}

/**
 * 구매 강도 결정
 *
 * 기준:
 *   휴면      — 최근 90일 구매일 0일
 *   낮음      — 최근 90일 구매일 1일
 *   보통      — 최근 90일 구매일 2일
 *   높음      — 최근 90일 구매일 3~4일
 *   매우 높음 — 최근 90일 구매일 5일 이상
 */
export function computePurchaseIntensity(recentPurchaseDayCount: number): PurchaseIntensityCode {
  if (recentPurchaseDayCount <= 0) return 'Dormant'
  if (recentPurchaseDayCount === 1) return 'Low'
  if (recentPurchaseDayCount === 2) return 'Medium'
  if (recentPurchaseDayCount <= 4) return 'High'
  return 'VeryHigh'
}
