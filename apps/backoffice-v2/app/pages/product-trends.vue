<template>
  <div class="product-trends-page">
    <div class="product-trends-toolbar">
      <div class="product-trends-toolbar-main">
        <StatusBadge :label="selectedPeriodLabel" variant="neutral" />
        <StatusBadge v-if="selectedMonth !== 'all' && productWeekFilter" :label="weekLabelFromCode(selectedMonth, productWeekFilter)" variant="info" />
      </div>
      <div class="product-trends-actions">
        <select v-if="selectedMonth !== 'all'" v-model="productWeekFilter" class="select select-compact">
          <option value="">주차 전체</option>
          <option v-for="week in productWeekOptions" :key="week.value" :value="week.value">{{ week.label }}</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="card product-trends-loading">상품 구매 추이를 불러오는 중입니다.</div>

    <template v-else>
      <div class="product-trends-layout">
        <div class="card product-list-card">
          <div class="card-header product-card-header">
            <h3 class="card-title">상품 목록</h3>
            <StatusBadge :label="`${filteredProductSummaries.length}개 상품`" variant="neutral" />
          </div>
          <SearchInput v-model="productSearchQuery" placeholder="상품명 또는 옵션 검색..." width="100%" />
          <div v-if="filteredProductSummaries.length === 0" class="empty-inline">조건에 맞는 상품이 없습니다.</div>
          <div v-else class="product-list">
            <button
              v-for="product in filteredProductSummaries"
              :key="product.key"
              type="button"
              class="product-list-item"
              :class="{ active: product.key === selectedProductKey }"
              @click="selectedProductKey = product.key"
            >
              <div class="product-list-main">
                <strong>{{ product.name }}</strong>
                <span>옵션 {{ product.optionInfo }}</span>
                <span>{{ formatQuantityCount(product.totalQuantity) }}개 · 최근 {{ product.lastOrder || '-' }}</span>
              </div>
              <StatusBadge :label="product.growthLabel" :variant="product.growthVariant" />
            </button>
          </div>
        </div>

        <div class="product-trends-main">
          <template v-if="selectedProductSummary">
            <div class="product-summary-grid">
              <div class="card product-summary-card">
                <span class="product-summary-label">총 실구매 수량</span>
                <strong class="product-summary-value">{{ formatQuantityCount(selectedProductSummary.totalQuantity) }}개</strong>
                <span class="product-summary-meta">{{ trendRangeLabel }} · 옵션 {{ selectedProductSummary.optionInfo }}</span>
              </div>
              <div class="card product-summary-card">
                <span class="product-summary-label">최근 구간 수량</span>
                <strong class="product-summary-value">{{ formatQuantityCount(latestProductValue) }}개</strong>
                <span class="product-summary-meta">{{ latestProductLabel }}</span>
              </div>
              <div class="card product-summary-card">
                <span class="product-summary-label">최근 구간 변화율</span>
                <strong class="product-summary-value">{{ formatTrendGrowthRate(latestProductGrowthRate) }}</strong>
                <span class="product-summary-meta">{{ latestProductTransitionLabel }}</span>
              </div>
              <div class="card product-summary-card">
                <span class="product-summary-label">실구매 일수</span>
                <strong class="product-summary-value">{{ selectedProductSummary.purchaseDateCount }}일</strong>
                <span class="product-summary-meta">최근 주문 {{ selectedProductSummary.lastOrder || '-' }}</span>
              </div>
            </div>

            <div class="card">
              <div class="card-header product-card-header">
                <h3 class="card-title">{{ selectedProductSummary.name }}</h3>
                <div class="product-card-header-meta">
                  <StatusBadge :label="`옵션 ${selectedProductSummary.optionInfo}`" variant="neutral" />
                  <StatusBadge :label="trendRangeLabel" variant="neutral" />
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
                <h3 class="card-title">구간별 성장률</h3>
              </div>
              <div v-if="selectedProductFlowPoints.length" class="period-flow">
                <template v-for="(point, index) in selectedProductFlowPoints" :key="point.key">
                  <div class="period-flow-point">
                    <span class="period-flow-label">{{ point.label }}</span>
                    <strong class="period-flow-value">{{ point.valueLabel }}</strong>
                  </div>
                  <div v-if="selectedProductTransitionRows[index]" class="period-flow-bridge">
                    <strong class="period-breakdown-rate" :class="`is-${selectedProductTransitionRows[index]?.variant}`">
                      {{ selectedProductTransitionRows[index]?.rateLabel }}
                    </strong>
                  </div>
                </template>
              </div>
              <div v-else class="empty-inline">비교할 이전 구간이 없습니다.</div>
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
import { computePurchaseQuantity, formatQuantityCount } from '~/composables/usePurchaseQuantity'
import { purchaseQuantityInput, purchaseSelectColumns, supportsPurchaseSourceColumns } from '~/composables/usePurchaseSourceFields'
import { buildWeekOptions, weekCodeFromDate, weekDateTokensFromCode, weekLabelFromCode } from '~/composables/useWeekFilter'
import { computeTrendGrowthRates, formatTrendGrowthRate, trendGrowthVariant, type TrendGrowthRate } from '~/composables/useTrendGrowth'

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
  order_date: string
  target_month: string
  is_fake: boolean
  needs_review: boolean
  filter_ver: string | null
}

interface ProductTrendSummary {
  key: string
  name: string
  optionInfo: string
  totalQuantity: number
  purchaseDateCount: number
  lastOrder: string
  seriesValues: number[]
  growthRates: Array<number | null>
  latestGrowthRate: TrendGrowthRate
  growthLabel: string
  growthVariant: 'success' | 'danger' | 'neutral'
}

interface ProductTransitionRow {
  key: string
  label: string
  rateLabel: string
  valueLabel: string
  variant: 'success' | 'danger' | 'neutral'
}

interface ProductFlowPoint {
  key: string
  label: string
  valueLabel: string
}

const supabase = useSupabaseClient()
const toast = useToast()
const { selectedMonth, selectedPeriodLabel, availableMonths } = useAnalysisPeriod()
const { profileLoaded, profileRevision } = useCurrentUser()

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

const productWeekOptions = computed(() => {
  if (selectedMonth.value === 'all') return []
  return buildWeekOptions(selectedMonth.value)
})

const trendTitle = computed(() => {
  if (selectedMonth.value === 'all') return '월별 구매 추이'
  if (productWeekFilter.value) return '일별 구매 추이'
  return '주차별 구매 추이'
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
  return productSummaries.value.filter((item) => matchesSearchQuery(query, item.name, item.optionInfo))
})

const selectedProductSummary = computed(() => {
  return filteredProductSummaries.value.find((item) => item.key === selectedProductKey.value)
    || productSummaries.value.find((item) => item.key === selectedProductKey.value)
    || null
})

const latestProductValue = computed(() => {
  return productTrendValues.value[productTrendValues.value.length - 1] || 0
})

const latestProductLabel = computed(() => {
  return productTrendLabels.value[productTrendLabels.value.length - 1] || trendRangeLabel.value
})

const latestProductGrowthRate = computed<TrendGrowthRate>(() => {
  return selectedProductSummary.value?.latestGrowthRate ?? productTrendGrowthRates.value[productTrendGrowthRates.value.length - 1] ?? null
})

const latestProductTransitionLabel = computed(() => {
  const latestTransition = selectedProductTransitionRows.value[selectedProductTransitionRows.value.length - 1]
  return latestTransition?.label || '비교 구간 없음'
})

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
      valueLabel: `${formatQuantityCount(previousValue)}개 -> ${formatQuantityCount(currentValue)}개`,
      variant: trendGrowthVariant(growthRate),
    })
  }
  return rows
})

const selectedProductFlowPoints = computed<ProductFlowPoint[]>(() => {
  return productTrendLabels.value.map((label, index) => ({
    key: `${label}-${index}`,
    label,
    valueLabel: `${formatQuantityCount(productTrendValues.value[index] || 0)}개`,
  }))
})

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

function normalizeOptionInfo(value: string): string {
  return String(value || '').trim() || '-'
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

function purchaseDateKey(row: Pick<PurchaseRow, 'order_date'>): string {
  return String(row.order_date || '').slice(0, 10)
}

function productGroupKey(row: Pick<PurchaseRow, 'product_id' | 'product_name' | 'option_info'>): string {
  const optionKey = normalizeForMatch(normalizeOptionInfo(String(row.option_info || '')))
  const productId = String(row.product_id || '').trim()
  if (productId) return `id:${productId}:option:${optionKey || '-'}`

  const canonicalName = normalizeMissionProductName(String(row.product_name || ''))
  const normalized = normalizeForMatch(canonicalName || String(row.product_name || ''))
  if (normalized) return `name:${normalized}:option:${optionKey || '-'}`
  return `raw:${String(row.product_name || '').trim()}:option:${optionKey || '-'}`
}

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

async function fetchPurchases(): Promise<PurchaseRow[]> {
  const rows: PurchaseRow[] = []
  const includeSourceColumns = await supportsPurchaseSourceColumns(supabase)
  const baseColumns = 'purchase_id, customer_key, buyer_name, buyer_id, product_id, product_name, option_info, quantity, order_date, target_month, is_fake, needs_review, filter_ver'
  const PAGE_SIZE = 1000

  for (let from = 0; ; from += PAGE_SIZE) {
    const query = supabase
      .from('purchases')
      .select(purchaseSelectColumns(baseColumns, includeSourceColumns))
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
      order_date: String(row.order_date || ''),
      target_month: String(row.target_month || ''),
      is_fake: Boolean(row.is_fake),
      needs_review: Boolean(row.needs_review),
      filter_ver: row.filter_ver ? String(row.filter_ver) : null,
    })))

    if (chunk.length < PAGE_SIZE) break
  }

  return rows
}

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

function applyProductScope() {
  const monthSnapshot = selectedMonth.value
  const weekSnapshot = monthSnapshot !== 'all' ? productWeekFilter.value : ''
  const monthRows = monthSnapshot === 'all'
    ? purchaseRows.value
    : purchaseRows.value.filter((row) => row.target_month === monthSnapshot)
  const scopeRows = monthSnapshot !== 'all' && weekSnapshot
    ? monthRows.filter((row) => weekCodeFromDate(row.order_date, monthSnapshot) === weekSnapshot)
    : monthRows

  const axis = buildAxis(monthSnapshot, weekSnapshot)
  const summaryMap = new Map<string, {
    name: string
    optionInfo: string
    totalQuantity: number
    purchaseDates: Set<string>
    lastOrder: string
    seriesMap: Map<string, number>
  }>()

  for (const row of scopeRows) {
    const key = productGroupKey(row)
    const quantity = computePurchaseQuantity(purchaseQuantityInput(row)).totalCount
    const displayName = normalizeMissionProductName(String(row.product_name || '').trim()) || String(row.product_name || '').trim() || '-'
    const optionInfo = normalizeOptionInfo(String(row.option_info || ''))
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        name: displayName,
        optionInfo,
        totalQuantity: 0,
        purchaseDates: new Set<string>(),
        lastOrder: purchaseDateKey(row),
        seriesMap: new Map<string, number>(axis.keys.map((axisKey) => [axisKey, 0])),
      })
    }

    const summary = summaryMap.get(key)!
    summary.totalQuantity += quantity
    summary.purchaseDates.add(purchaseDateKey(row))
    if (parseOrderDate(row.order_date).getTime() > parseOrderDate(summary.lastOrder).getTime()) {
      summary.lastOrder = purchaseDateKey(row)
    }
    const axisKey = axis.resolveKey(row)
    if (summary.seriesMap.has(axisKey)) {
      summary.seriesMap.set(axisKey, (summary.seriesMap.get(axisKey) || 0) + quantity)
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
        optionInfo: summary.optionInfo,
        totalQuantity: summary.totalQuantity,
        purchaseDateCount: summary.purchaseDates.size,
        lastOrder: summary.lastOrder,
        seriesValues,
        growthRates,
        latestGrowthRate,
        growthLabel: latestGrowthRate === null ? '최근 변화 -' : `최근 변화 ${formatTrendGrowthRate(latestGrowthRate)}`,
        growthVariant: trendGrowthVariant(latestGrowthRate),
      } satisfies ProductTrendSummary
    })
    .sort((a, b) => {
      const byQuantity = b.totalQuantity - a.totalQuantity
      if (byQuantity !== 0) return byQuantity
      const byName = a.name.localeCompare(b.name, 'ko')
      if (byName !== 0) return byName
      return a.optionInfo.localeCompare(b.optionInfo, 'ko')
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
          label: '실구매 수량',
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
            label: (ctx) => `실구매 ${formatQuantityCount(Number(ctx.parsed.y || 0))}개`,
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
            callback: (value) => formatQuantityCount(Number(value)),
          },
          beginAtZero: true,
        },
      },
    },
  })
}

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

watch(
  () => [selectedMonth.value, profileLoaded.value, profileRevision.value],
  async ([month, loaded]) => {
    if (!month || !loaded) return
    await loadProductTrends()
  },
  { immediate: true },
)

watch(
  () => [selectedMonth.value, productWeekFilter.value, purchaseRows.value, selectedProductKey.value],
  () => {
    applyProductScope()
  },
  { deep: true },
)

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

watch(
  () => [productTrendLabels.value, productTrendValues.value],
  async () => {
    await nextTick()
    renderProductTrendChart()
  },
  { deep: true },
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

.product-trends-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
  flex-wrap: wrap;
}

.product-trends-toolbar-main {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.product-trends-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.product-trends-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: var(--space-lg);
  align-items: start;
}

.product-list-card,
.product-trends-main {
  min-width: 0;
}

.product-trends-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
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

.product-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-top: var(--space-md);
  max-height: 720px;
  overflow: auto;
}

.product-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: #fff;
  padding: 14px 16px;
  text-align: left;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.product-list-item:hover {
  border-color: rgba(37, 99, 235, 0.28);
  background: #F8FBFF;
  transform: translateY(-1px);
}

.product-list-item.active {
  border-color: rgba(37, 99, 235, 0.45);
  background: #EEF4FF;
}

.product-list-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.product-list-main strong {
  font-size: 0.95rem;
}

.product-list-main span {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.product-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-md);
}

.product-summary-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.product-summary-label {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.product-summary-value {
  font-size: 1.45rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.product-summary-meta {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.trend-chart {
  padding-top: var(--space-md);
}

.trend-chart-area {
  height: 320px;
}

.period-flow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.period-flow-point {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 64px;
}

.period-flow-label {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.period-flow-value {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
}

.period-flow-bridge {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.period-flow-bridge::before,
.period-flow-bridge::after {
  content: '';
  width: 14px;
  height: 1px;
  background: var(--color-border);
}

.period-breakdown-rate {
  font-size: 1rem;
  font-weight: 700;
}

.period-breakdown-rate.is-success {
  color: #16A34A;
}

.period-breakdown-rate.is-danger {
  color: #DC2626;
}

.period-breakdown-rate.is-neutral {
  color: var(--color-text);
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

  .product-list {
    max-height: 320px;
  }
}

@media (max-width: 900px) {
  .product-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .product-trends-toolbar,
  .product-card-header,
  .product-trends-actions {
    align-items: stretch;
  }

  .product-summary-grid {
    grid-template-columns: 1fr;
  }

  .product-list-item {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
