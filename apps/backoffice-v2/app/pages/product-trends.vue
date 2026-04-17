<template>
  <div class="product-trends-page">
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">상품 성과</h1>
        <span class="page-caption">{{ selectedPeriodLabel }} 기준 선택 상품의 결제 흐름과 상태</span>
      </div>
      <div class="page-header-actions">
        <select v-if="selectedMonth !== 'all'" v-model="productWeekFilter" class="select select-compact header-select">
          <option value="">주차 전체</option>
          <option v-for="week in productWeekOptions" :key="week.value" :value="week.value">{{ week.label }}</option>
        </select>
      </div>
    </div>
    <div v-if="loading" class="card product-trends-loading">상품 성과를 불러오는 중입니다.</div>

    <template v-else>
      <div class="product-trends-layout">
        <div class="card product-list-card">
          <div class="card-header product-card-header">
            <div>
              <h3 class="card-title">상품 목록</h3>
              <span class="product-list-caption">결제 금액 순</span>
            </div>
            <StatusBadge :label="`${filteredProductSummaries.length}개 상품`" variant="neutral" />
          </div>
          <SearchInput v-model="productSearchQuery" placeholder="상품명 검색..." width="100%" />
          <div v-if="filteredProductSummaries.length === 0" class="empty-inline">조건에 맞는 상품이 없습니다.</div>
          <div v-else class="product-list">
            <button
              v-for="(product, index) in filteredProductSummaries"
              :key="product.key"
              type="button"
              class="product-list-item"
              :class="{ active: product.key === selectedProductKey }"
              @click="selectedProductKey = product.key"
            >
              <span class="product-list-rank">{{ index + 1 }}</span>
              <div class="product-list-main">
                <strong>{{ product.name }}</strong>
                <span>최근 주문 {{ formatShortDate(product.lastOrder) }}</span>
              </div>
              <div class="product-list-value">
                <strong class="product-list-count">{{ formatCurrencyAmount(product.totalPaymentAmount) }}</strong>
                <span>실구매 {{ formatQuantityCount(product.totalQuantity) }}개</span>
              </div>
            </button>
          </div>
        </div>

        <div class="product-trends-main">
          <template v-if="selectedProductSummary">
            <div class="card product-summary-card">
              <div class="product-summary-top">
                <div class="product-summary-copy">
                  <span class="product-summary-label">선택 상품</span>
                  <h2 class="product-summary-title">{{ selectedProductSummary.name }}</h2>
                  <span class="product-summary-subtitle">
                    최근 주문 {{ formatShortDate(selectedProductSummary.lastOrder) }} · {{ selectedProductSummary.purchaseDateCount.toLocaleString() }}일에 걸쳐 판매
                  </span>
                </div>
                <div class="product-summary-highlight">
                  <span>매출 비중</span>
                  <strong>{{ formatCurrencyAmount(selectedProductSummary.totalPaymentAmount) }}</strong>
                  <small>전체 상품 중 매출 비중 {{ selectedProductShareRate }}%</small>
                </div>
              </div>

              <div class="product-summary-stats">
                <div class="product-summary-stat">
                  <span>결제 금액</span>
                  <strong>{{ formatCurrencyAmount(selectedProductSummary.totalPaymentAmount) }}</strong>
                </div>
                <div class="product-summary-stat">
                  <span>정산 예정</span>
                  <strong>{{ formatCurrencyAmount(selectedProductSummary.totalExpectedSettlementAmount) }}</strong>
                </div>
                <div class="product-summary-stat">
                  <span>주문 건수</span>
                  <strong>{{ selectedProductSummary.orderCount.toLocaleString() }}건</strong>
                  <small>{{ selectedProductSummary.purchaseDateCount.toLocaleString() }}일에 걸쳐 판매</small>
                </div>
                <div class="product-summary-stat">
                  <span>실구매 수량</span>
                  <strong>{{ formatQuantityCount(selectedProductSummary.totalQuantity) }}개</strong>
                </div>
                <div class="product-summary-stat">
                  <span>최근 변화율</span>
                  <strong>{{ formatTrendGrowthRate(latestProductGrowthRate) }}</strong>
                  <small>{{ latestProductTransitionLabel }}</small>
                </div>
              </div>
            </div>

            <div class="product-detail-grid">
              <div class="card">
                <div class="card-header product-card-header">
                  <div>
                    <h3 class="card-title">결제 금액 추이</h3>
                    <span class="product-chart-caption">{{ trendTitle }}</span>
                  </div>
                  <div class="product-card-header-meta">
                    <StatusBadge :label="formatCurrencyAmount(latestProductValue)" variant="info" />
                  </div>
                </div>
                <div class="trend-chart">
                  <div class="trend-chart-area">
                    <canvas ref="productTrendChartCanvas"></canvas>
                  </div>
                </div>
              </div>

              <div class="card">
                <div class="card-header product-card-header">
                  <div>
                    <h3 class="card-title">흐름 변화</h3>
                    <span class="product-chart-caption">직전 구간과 비교해 흐름이 어떻게 바뀌는지 정리했습니다.</span>
                  </div>
                  <StatusBadge :label="`${selectedProductTransitionRows.length}개 구간`" variant="neutral" />
                </div>
                <div v-if="selectedProductTransitionRows.length === 0" class="empty-inline">비교할 구간이 없습니다.</div>
                <div v-else class="product-insight-list">
                  <div v-for="item in selectedProductTransitionRows" :key="item.key" class="product-insight-item">
                    <div class="product-insight-copy">
                      <strong>{{ item.label }}</strong>
                      <span>{{ item.valueLabel }}</span>
                    </div>
                    <div class="product-status-stat">
                      <StatusBadge :label="item.rateLabel" :variant="item.variant" />
                      <div class="product-insight-bar-wrap">
                        <div class="product-insight-bar" :style="{ width: `${transitionInsightWidth(item.rate)}%` }"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-header product-card-header">
                <div>
                  <h3 class="card-title">주문 상태 흐름</h3>
                  <span class="product-chart-caption">선택 상품 주문이 어느 상태에 가장 많이 모이는지 정리했습니다.</span>
                </div>
                <StatusBadge :label="`${statusDistributionRows.length}개 상태`" variant="neutral" />
              </div>
              <div v-if="statusDistributionRows.length === 0" class="empty-inline">주문상태 데이터가 없습니다.</div>
              <div v-else class="product-insight-list">
                <div v-for="item in statusDistributionRows" :key="item.key" class="product-insight-item">
                  <div class="product-insight-copy">
                    <strong>{{ item.label }}</strong>
                    <span>{{ item.count }}건 · {{ item.percent }}%</span>
                  </div>
                  <div class="product-status-stat">
                    <StatusBadge :label="`${item.percent}%`" :variant="item.variant" />
                    <div class="product-insight-bar-wrap">
                      <div class="product-insight-bar" :style="{ width: `${item.percent}%` }"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <div v-else class="card empty-inline">선택할 상품이 없습니다.</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { formatCompactCurrency, formatCurrency } from '~/composables/useMoneyFormat'
import { computePurchaseQuantity, formatQuantityCount } from '~/composables/usePurchaseQuantity'
import { purchaseAmountSelectColumns, purchaseQuantityInput, purchaseSelectColumns, resolvePurchaseExpectedSettlementAmount, resolvePurchasePaymentAmount, supportsPurchaseAmountColumns, supportsPurchaseSourceColumns } from '~/composables/usePurchaseSourceFields'
import { buildWeekOptions, weekCodeFromDate, weekDateTokensFromCode, weekLabelFromCode } from '~/composables/useWeekFilter'
import { computeTrendGrowthRates, formatTrendGrowthRate, trendGrowthVariant, type TrendGrowthRate } from '~/composables/useTrendGrowth'
import { formatOrderStatusLabel, orderStatusBadgeVariant } from '~/composables/useOrderStatusLabel'

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler)

interface PurchaseRow {
  purchase_id: string
  customer_key: string
  buyer_name: string
  buyer_id: string
  product_id: string
  product_name: string
  option_info: string
  source_product_name?: string
  source_option_info?: string
  quantity: number
  payment_amount: number | null
  order_discount_amount: number | null
  delivery_fee_amount: number | null
  delivery_discount_amount: number | null
  expected_settlement_amount: number | null
  payment_commission: number | null
  sale_commission: number | null
  order_date: string
  target_month: string
  order_status: string
  claim_status: string
  is_fake: boolean
  needs_review: boolean
  filter_ver: string | null
}

interface ProductTrendSummary {
  key: string
  name: string
  totalQuantity: number
  totalPaymentAmount: number
  totalExpectedSettlementAmount: number
  orderCount: number
  purchaseDateCount: number
  lastOrder: string
  seriesValues: number[]
  growthRates: Array<number | null>
  latestGrowthRate: TrendGrowthRate
}

interface ProductTransitionRow {
  key: string
  label: string
  rateLabel: string
  rate: number
  valueLabel: string
  variant: 'success' | 'danger' | 'neutral'
}

interface StatusDistributionRow {
  key: string
  label: string
  count: number
  percent: number
  variant: 'primary' | 'info' | 'warning' | 'success' | 'danger' | 'neutral'
}

const supabase = useSupabaseClient()
const toast = useToast()
const { selectedMonth, selectedPeriodLabel, availableMonths } = useAnalysisPeriod()
const { profileLoaded, profileRevision } = useCurrentUser()

// 판매분석 화면의 원본/가공 상태
// purchases 원본을 읽고 -> 선택 범위/선택 상품 기준으로 다시 가공한다.
const loading = ref(false)
const fetchSeq = ref(0)
const purchaseRows = ref<PurchaseRow[]>([])
const productWeekFilter = ref('')
const productSearchQuery = ref('')
const selectedProductKey = ref('')
const productTrendChartCanvas = ref<HTMLCanvasElement | null>(null)
const productTrendChartInstance = shallowRef<Chart | null>(null)

const productTrendLabels = ref<string[]>([])
const productTrendValues = ref<number[]>([])
const productTrendGrowthRates = ref<Array<number | null>>([])
const productSummaries = ref<ProductTrendSummary[]>([])
const scopedPurchaseRows = ref<PurchaseRow[]>([])

function normalizeAmount(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed)
}

function formatCurrencyAmount(value: number): string {
  return formatCurrency(value)
}

function resolveRowPaymentAmount(row: Pick<PurchaseRow, 'payment_amount'>): number {
  return resolvePurchasePaymentAmount(row)
}

function resolveRowExpectedSettlementAmount(row: Pick<PurchaseRow, 'expected_settlement_amount'>): number {
  return resolvePurchaseExpectedSettlementAmount(row)
}

// 현재 월에서 선택 가능한 주차 목록
const productWeekOptions = computed(() => {
  if (selectedMonth.value === 'all') return []
  return buildWeekOptions(selectedMonth.value)
})

// 대표 추이 차트 제목/범위 라벨
const trendTitle = computed(() => {
  if (selectedMonth.value === 'all') return '월별 결제 금액 추이'
  if (productWeekFilter.value) return '일별 결제 금액 추이'
  return '주차별 결제 금액 추이'
})

const trendRangeLabel = computed(() => {
  if (selectedMonth.value === 'all') {
    if (productTrendLabels.value.length === 0) return '최근 6개월'
    if (productTrendLabels.value.length === 1) return productTrendLabels.value[0]
    return `${productTrendLabels.value[0]} ~ ${productTrendLabels.value[productTrendLabels.value.length - 1]}`
  }
  if (productWeekFilter.value) return weekLabelFromCode(selectedMonth.value, productWeekFilter.value)
  return `${selectedPeriodLabel.value} 기준`
})

const filteredProductSummaries = computed(() => {
  const query = productSearchQuery.value.trim()
  if (!query) return productSummaries.value
  return productSummaries.value.filter((item) => matchesSearchQuery(query, item.name))
})

// 좌측 리스트에서 선택된 상품 하나를 찾는다.
const selectedProductSummary = computed(() => {
  return filteredProductSummaries.value.find((item) => item.key === selectedProductKey.value)
    || productSummaries.value.find((item) => item.key === selectedProductKey.value)
    || null
})

// 선택한 상품 카드 상단에 보여줄 최근 구간 요약 값
const latestProductValue = computed(() => {
  return productTrendValues.value[productTrendValues.value.length - 1] || 0
})

const latestProductGrowthRate = computed<TrendGrowthRate>(() => {
  return selectedProductSummary.value?.latestGrowthRate ?? productTrendGrowthRates.value[productTrendGrowthRates.value.length - 1] ?? null
})

const selectedProductShareRate = computed(() => {
  if (!selectedProductSummary.value) return 0
  const totalAmount = productSummaries.value.reduce((sum, item) => sum + item.totalPaymentAmount, 0)
  if (totalAmount <= 0) return 0
  return Math.round((selectedProductSummary.value.totalPaymentAmount / totalAmount) * 100)
})

const latestProductTransitionLabel = computed(() => {
  const latestTransition = selectedProductTransitionRows.value[selectedProductTransitionRows.value.length - 1]
  return latestTransition?.label || '비교 구간 없음'
})

function formatShortDate(dateToken: string): string {
  const value = String(dateToken || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '-'
  return value.slice(5).replace('-', '.')
}

const selectedProductRows = computed(() => {
  if (!selectedProductSummary.value) return []
  return scopedPurchaseRows.value.filter((row) => productGroupKey(row) === selectedProductSummary.value?.key)
})

// 현재 범위에서 주문상태가 어떻게 분포하는지 집계
const statusDistributionRows = computed<StatusDistributionRow[]>(() => {
  const statusMap = new Map<string, StatusDistributionRow>()
  for (const row of selectedProductRows.value) {
    const label = formatOrderStatusLabel(row.order_status, row.claim_status)
    const key = `${row.order_status}::${row.claim_status || ''}`
    if (!statusMap.has(key)) {
      statusMap.set(key, {
        key,
        label,
        count: 0,
        percent: 0,
        variant: orderStatusBadgeVariant(row.order_status, row.claim_status),
      })
    }
    statusMap.get(key)!.count += 1
  }

  const total = Math.max(selectedProductRows.value.length, 1)
  return Array.from(statusMap.values())
    .map((row) => ({
      ...row,
      percent: Math.round((row.count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count)
})

// 선택한 상품의 구간별 성장률을 차트 위에 바로 찍기 위한 계산 값
const selectedProductTransitionRows = computed<ProductTransitionRow[]>(() => {
  if (!selectedProductSummary.value) return []
  const rows: ProductTransitionRow[] = []
  for (let index = 1; index < productTrendLabels.value.length; index += 1) {
    const previousLabel = productTrendLabels.value[index - 1]
    const currentLabel = productTrendLabels.value[index]
    const previousValue = productTrendValues.value[index - 1] || 0
    const currentValue = productTrendValues.value[index] || 0
    const growthRate = productTrendGrowthRates.value[index] ?? null
    rows.push({
      key: `${previousLabel}-${currentLabel}-${index}`,
      label: `${previousLabel} -> ${currentLabel}`,
      rateLabel: formatTrendGrowthRate(growthRate),
      rate: growthRate === null ? 0 : Math.abs(growthRate),
      valueLabel: `${formatCurrencyAmount(previousValue)} -> ${formatCurrencyAmount(currentValue)}`,
      variant: trendGrowthVariant(growthRate),
    })
  }
  return rows
})

function transitionInsightWidth(rate: number): number {
  const maxRate = Math.max(...selectedProductTransitionRows.value.map((row) => Math.abs(row.rate)), 0)
  if (maxRate <= 0) return 16
  return Math.max(16, Math.round((Math.abs(rate) / maxRate) * 100))
}

// 날짜/검색/상품명 정규화 보조 함수
function parseOrderDate(value: string): Date {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? new Date('1970-01-01') : d
}

function normalizeForMatch(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '')
}

function matchesSearchQuery(query: string, ...targets: Array<string | number | null | undefined>) {
  const normalized = normalizeForMatch(query)
  if (!normalized) return true
  return targets.some((target) => normalizeForMatch(String(target || '')).includes(normalized))
}

function normalizeMissionProductName(rawName: string): string {
  const name = String(rawName || '').trim()
  if (!name) return ''

  const normalizedName = normalizeForMatch(name)
  const hasFreezeDried = normalizedName.includes('동결건조') || normalizedName.includes('동견건조')
  const hasAttachmentTreat = normalizedName.includes('애착트릿')
  if (hasFreezeDried && !hasAttachmentTreat) return '동결건조(리뉴얼전)'

  if (normalizedName.includes('애착트릿')) return '애착트릿'
  if (normalizedName.includes('츄라잇')) return '츄라잇'
  if (normalizedName.includes('케어푸')) return '케어푸'
  if (normalizedName.includes('두부모래')) return '두부모래'
  if (normalizedName.includes('이즈바이트')) return '이즈바이트'
  if (normalizedName.includes('엔자이츄')) return '엔자이츄'
  if (normalizedName.includes('트릿백')) return '미니 트릿백'
  if (normalizedName.includes('츄르짜개')) return '츄르짜개 (고양이 간식 디스펜서)'
  if (normalizedName.includes('도시락')) return '도시락 샘플팩'
  if (normalizedName.includes('맛보기')) return '전제품 맛보기 샘플'

  return name
}

// 판매분석 화면에서는 상품 단위 묶음을 기준으로 본다.
function purchaseDateKey(row: Pick<PurchaseRow, 'order_date'>): string {
  return String(row.order_date || '').slice(0, 10)
}

function productGroupKey(row: Pick<PurchaseRow, 'product_id' | 'product_name' | 'option_info'>): string {
  const productId = String(row.product_id || '').trim()
  if (productId) return `id:${productId}`

  const canonicalName = normalizeMissionProductName(String(row.product_name || ''))
  const normalized = normalizeForMatch(canonicalName || String(row.product_name || ''))
  if (normalized) return `name:${normalized}`
  return `raw:${String(row.product_name || '').trim()}`
}

// 차트 축 라벨 생성용 날짜 보조 함수들
function toMonthToken(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonthToken(token: string, offset: number): string {
  const [y, m] = token.split('-').map((part) => Number(part))
  if (!Number.isFinite(y) || !Number.isFinite(m)) return token
  const d = new Date(y, m - 1, 1)
  d.setMonth(d.getMonth() + offset)
  return toMonthToken(d)
}

function formatMonthLabel(token: string): string {
  const [y, m] = String(token || '').split('-')
  if (!y || !m) return token
  return `${y}.${m}`
}

function formatDayLabel(dateToken: string): string {
  const day = Number(String(dateToken || '').slice(8, 10))
  if (!Number.isFinite(day)) return dateToken
  return `${day}일`
}

function isMonthToken(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value)
}

function buildMonthTokenRange(fromMonth: string, toMonth: string): string[] {
  if (!isMonthToken(fromMonth) || !isMonthToken(toMonth) || fromMonth > toMonth) return []
  const result: string[] = []
  let cursor = fromMonth
  let guard = 0
  while (cursor <= toMonth && guard < 240) {
    result.push(cursor)
    if (cursor === toMonth) break
    cursor = shiftMonthToken(cursor, 1)
    guard += 1
  }
  return result
}

function buildTrendMonths(monthSnapshot: string, rows: Array<Pick<PurchaseRow, 'target_month'>> = []): string[] {
  const dataMonths = Array.from(new Set(
    rows
      .map((row) => String(row.target_month || '').trim())
      .filter(isMonthToken),
  )).sort((a, b) => a.localeCompare(b))

  if (dataMonths.length > 0) {
    return buildMonthTokenRange(dataMonths[0]!, dataMonths[dataMonths.length - 1]!)
  }

  const monthTokens = availableMonths.value
    .filter((item) => Number(item.count || 0) > 0)
    .map((item) => String(item.value || ''))
    .filter((token) => /^\d{4}-\d{2}$/.test(token))
    .sort((a, b) => a.localeCompare(b))

  if (monthTokens.length > 0) {
    return buildMonthTokenRange(monthTokens[0]!, monthTokens[monthTokens.length - 1]!)
  }

  const pivot = monthSnapshot !== 'all' && /^\d{4}-\d{2}$/.test(monthSnapshot)
    ? monthSnapshot
    : toMonthToken(new Date())
  const fallback: string[] = []
  for (let i = 5; i >= 0; i -= 1) {
    fallback.push(shiftMonthToken(pivot, -i))
  }
  return fallback
}

function buildWeekDateTokens(monthToken: string, weekCode: string): string[] {
  return weekDateTokensFromCode(monthToken, weekCode, 'inMonth')
}

// 판매분석 원본은 "실구매 + 확인필요 아님 + filter_ver 존재"인 purchases만 사용한다.
async function fetchPurchases(): Promise<PurchaseRow[]> {
  const rows: PurchaseRow[] = []
  const includeSourceColumns = await supportsPurchaseSourceColumns(supabase)
  const includeAmountColumns = await supportsPurchaseAmountColumns(supabase)
  const baseColumns = 'purchase_id, customer_key, buyer_name, buyer_id, product_id, product_name, option_info, quantity, order_date, target_month, order_status, claim_status, is_fake, needs_review, filter_ver'
  const selectColumns = purchaseAmountSelectColumns(
    purchaseSelectColumns(baseColumns, includeSourceColumns),
    includeAmountColumns,
  )
  const PAGE_SIZE = 1000

  for (let from = 0; ; from += PAGE_SIZE) {
    const query = supabase
      .from('purchases')
      .select(selectColumns)
      .not('filter_ver', 'is', null)
      .eq('is_fake', false)
      .eq('needs_review', false)
      .order('order_date', { ascending: true })
      .order('purchase_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    const { data, error } = await query
    if (error) throw error

    const chunk = (data || []) as any[]
    rows.push(...chunk.map((row) => ({
      purchase_id: String(row.purchase_id || ''),
      customer_key: String(row.customer_key || ''),
      buyer_name: String(row.buyer_name || ''),
      buyer_id: String(row.buyer_id || ''),
      product_id: String(row.product_id || ''),
      product_name: String(row.product_name || ''),
      option_info: String(row.option_info || ''),
      source_product_name: String(row.source_product_name || ''),
      source_option_info: String(row.source_option_info || ''),
      quantity: Number(row.quantity) || 1,
      payment_amount: includeAmountColumns ? normalizeAmount(row.payment_amount) : null,
      order_discount_amount: includeAmountColumns ? normalizeAmount(row.order_discount_amount) : null,
      delivery_fee_amount: includeAmountColumns ? normalizeAmount(row.delivery_fee_amount) : null,
      delivery_discount_amount: includeAmountColumns ? normalizeAmount(row.delivery_discount_amount) : null,
      expected_settlement_amount: includeAmountColumns ? normalizeAmount(row.expected_settlement_amount) : null,
      payment_commission: includeAmountColumns ? normalizeAmount(row.payment_commission) : null,
      sale_commission: includeAmountColumns ? normalizeAmount(row.sale_commission) : null,
      order_date: String(row.order_date || ''),
      target_month: String(row.target_month || ''),
      order_status: String(row.order_status || ''),
      claim_status: String(row.claim_status || ''),
      is_fake: Boolean(row.is_fake),
      needs_review: Boolean(row.needs_review),
      filter_ver: row.filter_ver ? String(row.filter_ver) : null,
    })))

    if (chunk.length < PAGE_SIZE) break
  }

  return rows
}

// 현재 월/주차 필터에 따라 차트 x축을 어떤 기준으로 만들지 결정
function buildAxis(monthSnapshot: string, weekSnapshot: string) {
  if (monthSnapshot === 'all') {
    const keys = buildTrendMonths(monthSnapshot, purchaseRows.value)
    return {
      keys,
      labels: keys.map((token) => formatMonthLabel(token)),
      resolveKey: (row: PurchaseRow) => String(row.target_month || ''),
    }
  }

  if (weekSnapshot) {
    const keys = buildWeekDateTokens(monthSnapshot, weekSnapshot)
    return {
      keys,
      labels: keys.map((token) => formatDayLabel(token)),
      resolveKey: (row: PurchaseRow) => String(row.order_date || '').slice(0, 10),
    }
  }

  const weekOptions = buildWeekOptions(monthSnapshot)
  const keys = weekOptions.map((option) => option.value)
  return {
    keys,
    labels: weekOptions.map((option) => option.label.split(' ')[0]),
    resolveKey: (row: PurchaseRow) => weekCodeFromDate(row.order_date, monthSnapshot),
  }
}

// 판매분석 화면의 핵심 집계 함수
// 1) 현재 월/주차에 맞게 원본 주문을 자르고
// 2) 상품별 summary를 만들고
// 3) 현재 선택 상품의 추이 시리즈를 만든다.
function applyProductScope() {
  const monthSnapshot = selectedMonth.value
  const weekSnapshot = monthSnapshot !== 'all' ? productWeekFilter.value : ''
  const monthRows = monthSnapshot === 'all'
    ? purchaseRows.value
    : purchaseRows.value.filter((row) => row.target_month === monthSnapshot)
  const scopeRows = monthSnapshot !== 'all' && weekSnapshot
    ? monthRows.filter((row) => weekCodeFromDate(row.order_date, monthSnapshot) === weekSnapshot)
    : monthRows
  scopedPurchaseRows.value = scopeRows

  const axis = buildAxis(monthSnapshot, weekSnapshot)
  const summaryMap = new Map<string, {
    name: string
    totalQuantity: number
    totalPaymentAmount: number
    totalExpectedSettlementAmount: number
    orderCount: number
    purchaseDates: Set<string>
    lastOrder: string
    seriesMap: Map<string, number>
  }>()

  for (const row of scopeRows) {
    const key = productGroupKey(row)
    const quantity = computePurchaseQuantity(purchaseQuantityInput(row)).totalCount
    const displayName = normalizeMissionProductName(String(row.product_name || '').trim()) || String(row.product_name || '').trim() || '-'
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        name: displayName,
        totalQuantity: 0,
        totalPaymentAmount: 0,
        totalExpectedSettlementAmount: 0,
        orderCount: 0,
        purchaseDates: new Set<string>(),
        lastOrder: purchaseDateKey(row),
        seriesMap: new Map<string, number>(axis.keys.map((axisKey) => [axisKey, 0])),
      })
    }

    const summary = summaryMap.get(key)!
    summary.totalQuantity += quantity
    summary.totalPaymentAmount += resolveRowPaymentAmount(row)
    summary.totalExpectedSettlementAmount += resolveRowExpectedSettlementAmount(row)
    summary.orderCount += 1
    summary.purchaseDates.add(purchaseDateKey(row))
    if (parseOrderDate(row.order_date).getTime() > parseOrderDate(summary.lastOrder).getTime()) {
      summary.lastOrder = purchaseDateKey(row)
    }
    const axisKey = axis.resolveKey(row)
    if (summary.seriesMap.has(axisKey)) {
      summary.seriesMap.set(axisKey, (summary.seriesMap.get(axisKey) || 0) + resolveRowPaymentAmount(row))
    }
  }

  const nextSummaries = Array.from(summaryMap.entries())
    .map(([key, summary]) => {
      const seriesValues = axis.keys.map((axisKey) => summary.seriesMap.get(axisKey) || 0)
      const growthRates = computeTrendGrowthRates(seriesValues)
      const latestGrowthRate = growthRates[growthRates.length - 1] ?? null
      return {
        key,
        name: summary.name,
        totalQuantity: summary.totalQuantity,
        totalPaymentAmount: summary.totalPaymentAmount,
        totalExpectedSettlementAmount: summary.totalExpectedSettlementAmount,
        orderCount: summary.orderCount,
        purchaseDateCount: summary.purchaseDates.size,
        lastOrder: summary.lastOrder,
        seriesValues,
        growthRates,
        latestGrowthRate,
      } satisfies ProductTrendSummary
    })
    .sort((a, b) => {
      const byAmount = b.totalPaymentAmount - a.totalPaymentAmount
      if (byAmount !== 0) return byAmount
      const byQuantity = b.totalQuantity - a.totalQuantity
      if (byQuantity !== 0) return byQuantity
      return a.name.localeCompare(b.name, 'ko')
    })

  productSummaries.value = nextSummaries

  if (!nextSummaries.some((item) => item.key === selectedProductKey.value)) {
    selectedProductKey.value = nextSummaries[0]?.key || ''
  }

  productTrendLabels.value = axis.labels
  const selected = nextSummaries.find((item) => item.key === selectedProductKey.value) || nextSummaries[0] || null
  productTrendValues.value = selected?.seriesValues || axis.keys.map(() => 0)
  productTrendGrowthRates.value = selected?.growthRates || axis.keys.map(() => null)
}

// 선택 상품 추이 차트 렌더링
function renderProductTrendChart() {
  if (!productTrendChartCanvas.value) return
  if (productTrendChartInstance.value) {
    productTrendChartInstance.value.destroy()
    productTrendChartInstance.value = null
  }

  productTrendChartInstance.value = new Chart(productTrendChartCanvas.value, {
    type: 'line',
    data: {
      labels: productTrendLabels.value,
      datasets: [
        {
          label: '결제 금액',
          data: productTrendValues.value,
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: '#2563EB',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            color: '#6B7280',
          },
        },
        tooltip: {
          backgroundColor: '#1E293B',
          titleFont: { size: 12 },
          bodyFont: { size: 13, weight: 'bold' as const },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => `결제 ${formatCurrency(Number(ctx.parsed.y || 0))}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11 },
            color: '#9CA3AF',
          },
        },
        y: {
          grid: {
            color: '#F3F4F6',
          },
          ticks: {
            font: { size: 11 },
            color: '#9CA3AF',
            callback: (value) => formatCompactCurrency(Number(value)),
          },
          beginAtZero: true,
        },
      },
    },
  })
}

// 실제 DB에서 purchases를 읽어오는 시작점
async function loadProductTrends() {
  if (!profileLoaded.value) return
  const seq = ++fetchSeq.value
  loading.value = true
  try {
    const rows = await fetchPurchases()
    if (seq !== fetchSeq.value) return
    purchaseRows.value = rows
  } catch (error: any) {
    console.error('Failed to load product trends:', error)
    toast.error(`상품 구매 추이를 불러오지 못했습니다: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    if (seq === fetchSeq.value) loading.value = false
  }
}

// 월이 바뀌면 주차 필터는 이전 월의 값을 그대로 들고 있으면 안 되므로 초기화한다.
watch(
  () => selectedMonth.value,
  (month, prevMonth) => {
    if (!prevMonth || month === prevMonth) return
    if (productWeekFilter.value) {
      productWeekFilter.value = ''
    }
  },
  { flush: 'sync' },
)

// 월 선택/프로필 로딩 완료 시 원본 purchases 재조회
watch(
  () => [selectedMonth.value, profileLoaded.value, profileRevision.value],
  async ([month, loaded]) => {
    if (!month || !loaded) return
    await loadProductTrends()
  },
  { immediate: true },
)

// 원본 데이터나 선택 상품이 바뀌면 집계를 다시 계산한다.
watch(
  () => [selectedMonth.value, productWeekFilter.value, purchaseRows.value, selectedProductKey.value],
  () => {
    applyProductScope()
  },
  { deep: true },
)

// 현재 월에 존재하지 않는 주차 필터가 남아 있으면 자동으로 비운다.
watch(
  () => [selectedMonth.value, productWeekOptions.value.map((option) => option.value).join(',')],
  () => {
    if (selectedMonth.value === 'all') {
      productWeekFilter.value = ''
      return
    }

    if (productWeekFilter.value && !productWeekOptions.value.some((option) => option.value === productWeekFilter.value)) {
      productWeekFilter.value = ''
    }
  },
)

// 차트 데이터가 바뀌면 실제 Chart.js를 다시 렌더링한다.
watch(
  () => [loading.value, productTrendChartCanvas.value, selectedProductSummary.value?.key, productTrendLabels.value, productTrendValues.value],
  async ([isLoading, canvas]) => {
    if (isLoading || !canvas || !selectedProductSummary.value) return
    await nextTick()
    renderProductTrendChart()
  },
  { deep: true, flush: 'post' },
)

onBeforeUnmount(() => {
  if (productTrendChartInstance.value) productTrendChartInstance.value.destroy()
})
</script>

<style scoped>
.product-trends-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-lg);
  flex-wrap: wrap;
  padding: 2px 0 4px;
}

.page-header-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.page-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 800;
  letter-spacing: -0.05em;
  color: var(--color-text);
}

.page-caption {
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.product-trends-layout {
  display: grid;
  grid-template-columns: 312px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.product-list-card,
.product-trends-main {
  min-width: 0;
}

.product-list-card {
  border: 1px solid rgba(148, 163, 184, 0.10);
  background: #FFFFFF;
  box-shadow: none;
  position: sticky;
  top: 28px;
}

.product-trends-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.product-detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.95fr);
  gap: 18px;
}

.product-insight-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.product-insight-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border-soft, #EEF2F7);
}

.product-insight-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.product-insight-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.product-insight-copy strong {
  font-size: 0.92rem;
  color: var(--color-text);
}

.product-insight-copy span {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.product-insight-value {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
}

.product-insight-stat,
.product-status-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  min-width: 140px;
}

.product-insight-bar-wrap {
  width: 140px;
  height: 6px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
  overflow: hidden;
}

.product-insight-bar {
  height: 100%;
  border-radius: 999px;
  background: #2563EB;
}

.product-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.product-card-header-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.product-list-card :deep(.search-input) {
  width: 100%;
}

.product-list-caption {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.product-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: var(--space-md);
  max-height: 680px;
  overflow: auto;
}

.product-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: #fff;
  padding: 15px 16px;
  text-align: left;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.product-list-item:hover {
  border-color: rgba(37, 99, 235, 0.18);
  background: #FAFCFF;
  transform: none;
}

.product-list-item.active {
  border-color: rgba(37, 99, 235, 0.24);
  background: #F6F9FF;
  box-shadow: none;
}

.product-list-rank {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: #F2F4F8;
  color: #4E5968;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 800;
  flex-shrink: 0;
}

.product-list-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.product-list-main strong {
  font-size: 0.95rem;
}

.product-list-main span {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.product-list-count {
  font-size: 0.94rem;
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
}

.product-list-value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.product-list-value span {
  font-size: 0.76rem;
  color: var(--color-text-muted);
}

.product-summary-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 26px 28px;
  border: 1px solid rgba(148, 163, 184, 0.10);
  background: #FFFFFF;
  box-shadow: none;
}

.product-summary-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-lg);
  flex-wrap: wrap;
}

.product-summary-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.product-summary-highlight {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 220px;
  padding: 16px 18px;
  border-radius: 14px;
  background: #FFFFFF;
  border: 1px solid var(--color-border-light);
  box-shadow: none;
}

.product-summary-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.product-summary-highlight span {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.product-summary-highlight strong {
  font-size: 1.55rem;
  line-height: 1.1;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--color-text);
}

.product-summary-highlight small {
  font-size: 0.82rem;
  color: var(--color-text-secondary);
}

.product-summary-title {
  margin: 0;
  font-size: 1.55rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--color-text);
}

.product-summary-subtitle {
  font-size: 0.84rem;
  color: var(--color-text-secondary);
}

.product-summary-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(156px, 1fr));
  gap: 14px;
}

.product-summary-stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 17px;
  border-radius: 14px;
  background: #FAFBFD;
  border: 1px solid rgba(148, 163, 184, 0.10);
}

.product-summary-stat span {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.product-summary-stat strong {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--color-text);
}

.product-summary-stat small {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.product-chart-caption {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.trend-chart {
  padding-top: var(--space-md);
}

.trend-chart-area {
  height: 336px;
}

.product-trends-loading,
.empty-inline {
  padding: var(--space-lg);
  color: var(--color-text-secondary);
}

@media (max-width: 1200px) {
  .product-trends-layout {
    grid-template-columns: 1fr;
  }

  .product-detail-grid {
    grid-template-columns: 1fr;
  }

  .product-list {
    max-height: 320px;
  }

  .product-list-card {
    position: static;
  }
}

@media (max-width: 900px) {
  .product-summary-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .product-trends-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .page-header-actions,
  .product-card-header {
    align-items: stretch;
  }

  .product-summary-top,
  .product-list-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .product-list-value,
  .product-insight-stat,
  .product-status-stat {
    align-items: flex-start;
  }

  .product-insight-bar-wrap {
    width: 100%;
  }

  .product-summary-stats {
    grid-template-columns: 1fr;
  }

  .header-select {
    width: 100%;
  }
}
</style>
