import {
  purchaseAmountSelectColumns,
  purchaseSourceScopeSelectColumns,
  supportsPurchaseAmountColumns,
  supportsPurchaseSourceScopeColumns,
} from './usePurchaseSourceFields'

export interface DataTrustMonthOption {
  value: string
  label?: string
  count?: number
}

export interface DataTrustPurchaseRow {
  purchase_id: string
  source_channel?: string | null
  source_fulfillment_type?: string | null
  payment_amount?: number | null
  expected_settlement_amount?: number | null
  order_date?: string | null
  target_month?: string | null
  is_fake?: boolean | null
  needs_review?: boolean | null
  filter_ver?: string | null
}

export interface DataTrustCursorRow {
  source_channel?: string | null
  source_fulfillment_type?: string | null
  last_success_to?: string | null
  updated_at?: string | null
  last_run_id?: string | null
}

export interface DataTrustRunRow {
  id: string
  source_channel?: string | null
  source_fulfillment_type?: string | null
  status?: string | null
  requested_from?: string | null
  requested_to?: string | null
  started_at?: string | null
  completed_at?: string | null
  error_message?: string | null
}

export interface DataTrustScopeSummary {
  key: string
  label: string
  sourceChannel: string
  sourceFulfillmentType: string
  basisLabel: string
  eligibleRows: number
  paymentCoveredRows: number
  settlementCoveredRows: number
  paymentCoverage: number
  settlementCoverage: number
  latestOrderDate: string
  latestSuccessAt: string
  latestRunStatus: string
  latestRunStatusLabel: string
  latestRunError: string
  coverageVariant: 'success' | 'warning' | 'danger' | 'neutral'
  settlementVariant: 'success' | 'warning' | 'danger' | 'neutral'
  statusLabel: string
}

export interface DataTrustSummary {
  selectedMonth: string
  resolvedMonth: string
  resolvedLabel: string
  usedFallbackMonth: boolean
  totalEligibleRows: number
  totalPaymentCoveredRows: number
  totalSettlementCoveredRows: number
  totalPaymentCoverage: number
  totalSettlementCoverage: number
  paymentVariant: 'success' | 'warning' | 'danger' | 'neutral'
  settlementVariant: 'success' | 'warning' | 'danger' | 'neutral'
  blockingMessage: string
  items: DataTrustScopeSummary[]
  recentRuns: DataTrustRunRow[]
}

interface DataTrustSnapshotInput {
  supabase: any
  selectedMonth: string
  availableMonths: DataTrustMonthOption[]
}

interface EffectiveDataTrustMonth {
  selectedMonth: string
  resolvedMonth: string
  resolvedLabel: string
  usedFallbackMonth: boolean
}

interface DataTrustScopeAggregate {
  key: string
  sourceChannel: string
  sourceFulfillmentType: string
  eligibleRows: number
  paymentCoveredRows: number
  settlementCoveredRows: number
  latestOrderDate: string
}

const PURCHASE_PAGE_SIZE = 1000

function isValidMonthToken(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value)
}

function currentMonthToken(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function formatMonthLabel(value: string): string {
  if (!isValidMonthToken(value)) return value
  const [year, month] = value.split('-')
  return `${Number(year)}년 ${Number(month)}월`
}

function monthBoundary(value: string): { fromIso: string; toIsoExclusive: string } {
  const [yearRaw, monthRaw] = value.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0))
  return {
    fromIso: start.toISOString(),
    toIsoExclusive: end.toISOString(),
  }
}

function normalizeScopeValue(value: unknown, fallback: string): string {
  return String(value || '').trim() || fallback
}

function roundCoverage(coveredRows: number, eligibleRows: number): number {
  if (eligibleRows <= 0) return 0
  return Math.round((coveredRows / eligibleRows) * 100)
}

export function resolveCoverageVariant(
  coverage: number,
  eligibleRows: number,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (eligibleRows <= 0) return 'neutral'
  if (coverage < 80) return 'danger'
  if (coverage < 98) return 'warning'
  return 'success'
}

export function resolveCoverageLabel(coverage: number, eligibleRows: number): string {
  if (eligibleRows <= 0) return '데이터 없음'
  if (coverage < 80) return '집계 보류'
  if (coverage < 98) return '부분 반영'
  return '신뢰 가능'
}

export function resolveDataTrustScopeLabel(sourceChannel: string, sourceFulfillmentType: string): string {
  if (sourceChannel === 'naver') return '네이버'
  if (sourceChannel === 'coupang' && sourceFulfillmentType === 'marketplace') return '쿠팡 마켓플레이스'
  if (sourceChannel === 'coupang' && sourceFulfillmentType === 'rocket_growth') return '쿠팡 로켓그로스'
  if (sourceChannel === 'coupang') return '쿠팡'
  if (sourceChannel === 'excel') return '엑셀'
  return sourceFulfillmentType === 'default'
    ? sourceChannel
    : `${sourceChannel} · ${sourceFulfillmentType}`
}

export function resolveDataTrustBasisLabel(sourceChannel: string, sourceFulfillmentType: string): string {
  if (sourceChannel === 'coupang' && sourceFulfillmentType === 'marketplace') return '주문기준'
  if (sourceChannel === 'coupang' && sourceFulfillmentType === 'rocket_growth') return '결제기준'
  if (sourceChannel === 'naver') return '결제기준'
  return '주문기준'
}

function normalizeRunStatus(status: unknown): string {
  return String(status || '').trim().toLowerCase()
}

function resolveRunStatusLabel(status: string): string {
  if (status === 'done') return '동기화 완료'
  if (status === 'partial') return '부분 성공'
  if (status === 'failed') return '동기화 실패'
  if (status === 'running') return '동기화 중'
  if (status === 'pending') return '대기 중'
  return '상태 미상'
}

function formatShortDateTime(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}.${month}.${day} ${hours}:${minutes}`
}

export function resolveEffectiveDataTrustMonth(
  selectedMonth: string,
  availableMonths: DataTrustMonthOption[],
): EffectiveDataTrustMonth {
  if (isValidMonthToken(selectedMonth)) {
    const matched = availableMonths.find((item) => item.value === selectedMonth)
    return {
      selectedMonth,
      resolvedMonth: selectedMonth,
      resolvedLabel: matched?.label || formatMonthLabel(selectedMonth),
      usedFallbackMonth: false,
    }
  }

  const latestWithData = availableMonths.find((item) => Number(item.count || 0) > 0)
  const fallbackValue = latestWithData?.value || availableMonths[0]?.value || currentMonthToken()
  const fallbackLabel = latestWithData?.label || availableMonths[0]?.label || formatMonthLabel(fallbackValue)

  return {
    selectedMonth,
    resolvedMonth: fallbackValue,
    resolvedLabel: fallbackLabel,
    usedFallbackMonth: true,
  }
}

function buildScopeAggregates(rows: DataTrustPurchaseRow[]): Map<string, DataTrustScopeAggregate> {
  const map = new Map<string, DataTrustScopeAggregate>()

  for (const row of rows) {
    const sourceChannel = normalizeScopeValue(row.source_channel, 'excel')
    const sourceFulfillmentType = normalizeScopeValue(row.source_fulfillment_type, 'default')
    const key = `${sourceChannel}::${sourceFulfillmentType}`
    const orderDate = String(row.order_date || '').slice(0, 10)
    const current = map.get(key) || {
      key,
      sourceChannel,
      sourceFulfillmentType,
      eligibleRows: 0,
      paymentCoveredRows: 0,
      settlementCoveredRows: 0,
      latestOrderDate: '',
    }

    current.eligibleRows += 1
    if (row.payment_amount !== null && row.payment_amount !== undefined) current.paymentCoveredRows += 1
    if (row.expected_settlement_amount !== null && row.expected_settlement_amount !== undefined) current.settlementCoveredRows += 1
    if (orderDate && (!current.latestOrderDate || orderDate > current.latestOrderDate)) {
      current.latestOrderDate = orderDate
    }

    map.set(key, current)
  }

  return map
}

function findLatestCursor(
  cursors: DataTrustCursorRow[],
  sourceChannel: string,
  sourceFulfillmentType: string,
): DataTrustCursorRow | null {
  return cursors.find((cursor) =>
    normalizeScopeValue(cursor.source_channel, 'excel') === sourceChannel
    && normalizeScopeValue(cursor.source_fulfillment_type, 'default') === sourceFulfillmentType,
  ) || null
}

function findLatestRun(
  runs: DataTrustRunRow[],
  sourceChannel: string,
  sourceFulfillmentType: string,
): DataTrustRunRow | null {
  return runs.find((run) =>
    normalizeScopeValue(run.source_channel, 'excel') === sourceChannel
    && normalizeScopeValue(run.source_fulfillment_type, 'default') === sourceFulfillmentType,
  ) || null
}

export function buildDataTrustSummary(
  rows: DataTrustPurchaseRow[],
  cursors: DataTrustCursorRow[],
  runs: DataTrustRunRow[],
  month: EffectiveDataTrustMonth,
): DataTrustSummary {
  const eligibleRows = rows.filter((row) => !row.is_fake && !row.needs_review && !!row.filter_ver)
  const groups = buildScopeAggregates(eligibleRows)
  const items = Array.from(groups.values())
    .map((group) => {
      const paymentCoverage = roundCoverage(group.paymentCoveredRows, group.eligibleRows)
      const settlementCoverage = roundCoverage(group.settlementCoveredRows, group.eligibleRows)
      const latestCursor = findLatestCursor(cursors, group.sourceChannel, group.sourceFulfillmentType)
      const latestRun = findLatestRun(runs, group.sourceChannel, group.sourceFulfillmentType)
      const latestRunStatus = normalizeRunStatus(latestRun?.status)

      return {
        key: group.key,
        label: resolveDataTrustScopeLabel(group.sourceChannel, group.sourceFulfillmentType),
        sourceChannel: group.sourceChannel,
        sourceFulfillmentType: group.sourceFulfillmentType,
        basisLabel: resolveDataTrustBasisLabel(group.sourceChannel, group.sourceFulfillmentType),
        eligibleRows: group.eligibleRows,
        paymentCoveredRows: group.paymentCoveredRows,
        settlementCoveredRows: group.settlementCoveredRows,
        paymentCoverage,
        settlementCoverage,
        latestOrderDate: group.latestOrderDate,
        latestSuccessAt: String(latestCursor?.last_success_to || latestCursor?.updated_at || latestRun?.completed_at || latestRun?.started_at || ''),
        latestRunStatus,
        latestRunStatusLabel: resolveRunStatusLabel(latestRunStatus),
        latestRunError: String(latestRun?.error_message || '').trim(),
        coverageVariant: resolveCoverageVariant(paymentCoverage, group.eligibleRows),
        settlementVariant: resolveCoverageVariant(settlementCoverage, group.eligibleRows),
        statusLabel: resolveCoverageLabel(paymentCoverage, group.eligibleRows),
      } satisfies DataTrustScopeSummary
    })
    .sort((a, b) => {
      if (a.coverageVariant !== b.coverageVariant) {
        const weight = { danger: 0, warning: 1, neutral: 2, success: 3 } as const
        return weight[a.coverageVariant] - weight[b.coverageVariant]
      }
      return b.eligibleRows - a.eligibleRows
    })

  const totalEligibleRows = eligibleRows.length
  const totalPaymentCoveredRows = eligibleRows.filter((row) => row.payment_amount !== null && row.payment_amount !== undefined).length
  const totalSettlementCoveredRows = eligibleRows.filter((row) => row.expected_settlement_amount !== null && row.expected_settlement_amount !== undefined).length
  const totalPaymentCoverage = roundCoverage(totalPaymentCoveredRows, totalEligibleRows)
  const totalSettlementCoverage = roundCoverage(totalSettlementCoveredRows, totalEligibleRows)
  const blockingScopes = items.filter((item) => item.coverageVariant === 'danger')
  const blockingMessage = blockingScopes.length > 0
    ? `${blockingScopes[0].label} ${month.resolvedMonth} 금액 반영률 ${blockingScopes[0].paymentCoverage}%`
    : ''

  return {
    selectedMonth: month.selectedMonth,
    resolvedMonth: month.resolvedMonth,
    resolvedLabel: month.resolvedLabel,
    usedFallbackMonth: month.usedFallbackMonth,
    totalEligibleRows,
    totalPaymentCoveredRows,
    totalSettlementCoveredRows,
    totalPaymentCoverage,
    totalSettlementCoverage,
    paymentVariant: resolveCoverageVariant(totalPaymentCoverage, totalEligibleRows),
    settlementVariant: resolveCoverageVariant(totalSettlementCoverage, totalEligibleRows),
    blockingMessage,
    items,
    recentRuns: runs.slice(0, 8),
  }
}

async function fetchTrustPurchases(
  supabase: any,
  effectiveMonth: string,
): Promise<DataTrustPurchaseRow[]> {
  const includeScopeColumns = await supportsPurchaseSourceScopeColumns(supabase).catch(() => false)
  const includeAmountColumns = await supportsPurchaseAmountColumns(supabase).catch(() => false)
  const baseColumns = 'purchase_id, target_month, order_date, is_fake, needs_review, filter_ver'
  const selectColumns = purchaseAmountSelectColumns(
    purchaseSourceScopeSelectColumns(baseColumns, includeScopeColumns),
    includeAmountColumns,
  )

  const rows: DataTrustPurchaseRow[] = []
  for (let from = 0; ; from += PURCHASE_PAGE_SIZE) {
    let query = supabase
      .from('purchases')
      .select(selectColumns)
      .eq('target_month', effectiveMonth)
      .not('filter_ver', 'is', null)
      .order('order_date', { ascending: false })
      .order('purchase_id', { ascending: false })
      .range(from, from + PURCHASE_PAGE_SIZE - 1)

    const { data, error } = await query
    if (error) throw error
    const chunk = (data || []) as any[]
    rows.push(...chunk.map((row) => ({
      purchase_id: String(row.purchase_id || ''),
      source_channel: row.source_channel ? String(row.source_channel) : null,
      source_fulfillment_type: row.source_fulfillment_type ? String(row.source_fulfillment_type) : null,
      payment_amount: row.payment_amount ?? null,
      expected_settlement_amount: row.expected_settlement_amount ?? null,
      order_date: row.order_date ? String(row.order_date) : null,
      target_month: row.target_month ? String(row.target_month) : null,
      is_fake: Boolean(row.is_fake),
      needs_review: Boolean(row.needs_review),
      filter_ver: row.filter_ver ? String(row.filter_ver) : null,
    })))
    if (chunk.length < PURCHASE_PAGE_SIZE) break
  }

  return rows
}

async function fetchTrustCursors(supabase: any): Promise<DataTrustCursorRow[]> {
  try {
    const { data, error } = await (supabase as any)
      .from('commerce_sync_cursors')
      .select('source_channel, source_fulfillment_type, last_success_to, updated_at, last_run_id')
      .eq('source_account_key', 'default')
      .order('updated_at', { ascending: false })

    if (error) throw error
    return (data || []) as DataTrustCursorRow[]
  } catch {
    return []
  }
}

async function fetchTrustRuns(supabase: any, effectiveMonth: string): Promise<DataTrustRunRow[]> {
  try {
    const { fromIso, toIsoExclusive } = monthBoundary(effectiveMonth)
    const { data, error } = await (supabase as any)
      .from('commerce_sync_runs')
      .select('id, source_channel, source_fulfillment_type, status, requested_from, requested_to, started_at, completed_at, error_message')
      .eq('source_account_key', 'default')
      .lt('requested_from', toIsoExclusive)
      .gte('requested_to', fromIso)
      .order('started_at', { ascending: false })
      .limit(20)

    if (error) throw error
    return (data || []) as DataTrustRunRow[]
  } catch {
    return []
  }
}

export async function fetchDataTrustSnapshot(input: DataTrustSnapshotInput): Promise<DataTrustSummary> {
  const month = resolveEffectiveDataTrustMonth(input.selectedMonth, input.availableMonths)
  const [rows, cursors, runs] = await Promise.all([
    fetchTrustPurchases(input.supabase, month.resolvedMonth),
    fetchTrustCursors(input.supabase),
    fetchTrustRuns(input.supabase, month.resolvedMonth),
  ])

  return buildDataTrustSummary(rows, cursors, runs, month)
}

export function formatDataTrustTimestamp(value: string): string {
  return formatShortDateTime(value)
}
