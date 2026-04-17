<template>
  <div class="channel-analysis-page">
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">채널 성과</h1>
        <span class="page-caption">{{ selectedPeriodLabel }} 기준 네이버 · 쿠팡 비교</span>
      </div>
      <div class="page-header-actions">
        <select v-if="selectedMonth !== 'all'" v-model="channelWeekFilter" class="select select-compact header-select">
          <option value="">주차 전체</option>
          <option v-for="week in channelWeekOptions" :key="week.value" :value="week.value">{{ week.label }}</option>
        </select>
      </div>
    </div>
    <div class="kpi-grid">
      <KpiCard
        label="총 결제 금액"
        :value="overviewMetrics.paymentAmount"
        :icon="BarChart3"
        format="currency"
        icon-bg="#EAF2FF"
        icon-color="#1D63E9"
      />
      <KpiCard
        label="네이버 정산 예정"
        :value="naverSettlementMetrics.expectedSettlementAmount"
        :icon="Users"
        format="currency"
        icon-bg="#ECFDF5"
        icon-color="#10B981"
      />
      <KpiCard
        label="네이버 총 수수료"
        :value="naverSettlementMetrics.paymentCommissionAmount"
        :icon="Package"
        format="currency"
        icon-bg="#FFF7E8"
        icon-color="#F59E0B"
      />
      <KpiCard
        label="평균 주문 금액"
        :value="averageOrderValue"
        :icon="PieChart"
        format="currency"
        icon-bg="#EEF2FF"
        icon-color="#5B6FD6"
      />
    </div>

    <div v-if="!loading && channelLeadSummary.leader" class="card compare-hero-card">
      <div class="compare-hero-copy">
        <span class="compare-hero-label">채널 비교 요약</span>
        <h2 class="compare-hero-title">{{ channelLeadSummary.leader.label }} 우세</h2>
        <p class="compare-hero-caption">
          {{ channelLeadSummary.runnerUp ? `${channelLeadSummary.runnerUp.label} 대비 ${formatCurrencyAmount(channelLeadSummary.gapAmount)} 차이` : `${selectedPeriodLabel} 기준 집계` }}
        </p>
      </div>
      <div class="compare-hero-stats">
        <div class="compare-hero-stat compare-hero-stat--primary">
          <span>선두 채널</span>
          <strong>{{ channelLeadSummary.leader.label }}</strong>
          <small>{{ formatCurrencyAmount(channelLeadSummary.leader.paymentAmount) }} · 비중 {{ channelLeadSummary.leader.shareOfRevenue }}%</small>
        </div>
        <div v-if="channelLeadSummary.runnerUp" class="compare-hero-stat">
          <span>다음 채널</span>
          <strong>{{ channelLeadSummary.runnerUp.label }}</strong>
          <small>{{ formatCurrencyAmount(channelLeadSummary.runnerUp.paymentAmount) }} · 비중 {{ channelLeadSummary.runnerUp.shareOfRevenue }}%</small>
        </div>
        <div class="compare-hero-stat">
          <span>채널 평균 주문 금액</span>
          <strong>{{ formatCurrencyAmount(averageOrderValue) }}</strong>
          <small>{{ overviewMetrics.realOrders.toLocaleString() }}건 기준</small>
        </div>
      </div>
    </div>

    <div v-if="loading" class="card loading-card">채널 데이터를 불러오는 중입니다.</div>

    <template v-else>
      <div v-if="channelMetrics.length === 0" class="card empty-card">
        <strong>분석 가능한 채널 데이터가 없습니다.</strong>
        <span>주문 동기화 이후 다시 확인해 주세요.</span>
      </div>

      <div v-else class="channel-grid">
        <button
          v-for="channel in channelMetrics"
          :key="channel.key"
          type="button"
          class="card channel-card"
          :class="`channel-card--${channel.tone}`"
          @click="navigateToChannelCustomers(channel.key)"
        >
          <div class="channel-card-top">
            <div>
              <strong class="channel-card-title">{{ channel.label }}</strong>
              <span class="channel-card-sub">{{ channel.lastOrderLabel }}</span>
            </div>
            <StatusBadge :label="`${channel.shareOfRevenue}%`" :variant="channel.badgeVariant" />
          </div>

          <div class="channel-primary">
            <span class="channel-primary-label">결제 금액</span>
            <strong class="channel-primary-value">{{ formatCurrencyAmount(channel.paymentAmount) }}</strong>
          </div>

          <div class="channel-stat-list">
            <div class="channel-stat-row">
              <span>{{ channel.key === 'naver' ? '정산 예정' : '실구매 수량' }}</span>
              <strong>
                {{ channel.key === 'naver' ? formatCurrencyAmount(channel.expectedSettlementAmount) : `${formatQuantityCount(channel.totalQuantity)}개` }}
              </strong>
            </div>
            <div class="channel-stat-row">
              <span>구매 주문</span>
              <strong>{{ channel.realOrders.toLocaleString() }}건</strong>
            </div>
            <div class="channel-stat-row">
              <span>구매 고객</span>
              <strong>{{ channel.realCustomers.toLocaleString() }}명</strong>
            </div>
            <div class="channel-stat-row">
              <span>건당 매출</span>
              <strong>{{ formatCurrencyAmount(channel.averageOrderValue) }}</strong>
            </div>
          </div>

          <div class="channel-share">
            <div class="channel-share-head">
              <span>매출 비중</span>
              <span>{{ channel.shareOfRevenue }}%</span>
            </div>
            <div class="channel-share-track">
              <div class="channel-share-fill" :style="{ width: `${channel.shareOfRevenue}%` }"></div>
            </div>
          </div>

          <div class="channel-card-footer">
            <span>대표 상품 {{ channel.topProductLabel }}</span>
            <MoveRight :size="14" :stroke-width="2" />
          </div>
        </button>
      </div>

      <div class="analysis-grid">
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">기간별 결제 비교</h3>
              <span class="section-caption">같은 구간에서 네이버와 쿠팡의 금액 흐름을 바로 비교합니다.</span>
            </div>
            <StatusBadge :label="trendRangeLabel" variant="neutral" />
          </div>

          <div v-if="trendLabels.length === 0" class="empty-inline">흐름 데이터가 없습니다.</div>
          <div v-else class="trend-timeline">
            <div v-for="(label, index) in trendLabels" :key="`trend-period-${label}-${index}`" class="trend-timeline-row">
              <div class="trend-timeline-label">
                <strong>{{ displayTrendLabel(label) }}</strong>
                <span>{{ trendRangeLabel }}</span>
              </div>
              <div class="trend-timeline-values">
                <div
                  v-for="channel in channelMetrics"
                  :key="`${channel.key}-${label}-${index}`"
                  class="trend-timeline-item"
                  :class="`trend-timeline-item--${channel.tone}`"
                >
                  <div class="trend-timeline-copy">
                    <span>{{ channel.label }}</span>
                    <strong>{{ formatCompactCurrency(channel.trendValues[index] || 0) }}</strong>
                  </div>
                  <div class="trend-timeline-track">
                    <div class="trend-timeline-fill" :style="{ width: `${trendValueWidth(channel.trendValues[index] || 0, index)}%` }"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">쿠팡 주문 구조</h3>
            <StatusBadge :label="`${coupangFulfillmentRows.length}개 구분`" variant="neutral" />
          </div>

          <div v-if="coupangFulfillmentRows.length === 0" class="empty-inline">쿠팡 데이터가 없습니다.</div>
          <div v-else class="fulfillment-list">
            <div v-for="row in coupangFulfillmentRows" :key="row.key" class="fulfillment-row">
              <div class="fulfillment-copy">
                <strong>{{ row.label }}</strong>
                <span>{{ formatCurrencyAmount(row.amount) }} · {{ row.orders.toLocaleString() }}건</span>
              </div>
              <div class="fulfillment-progress">
                <div class="fulfillment-progress-fill" :style="{ width: `${row.share}%` }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">채널별 대표 상품</h3>
            <span class="section-caption">채널별로 금액 기여가 큰 상품만 먼저 읽히도록 정리했습니다.</span>
          </div>
          <StatusBadge :label="`${channelProductSections.length}개 채널`" variant="neutral" />
        </div>

        <div class="channel-product-grid">
          <div v-for="section in channelProductSections" :key="section.key" class="channel-product-panel">
            <div class="product-section-head">
              <strong>{{ section.label }}</strong>
              <span>{{ section.items.length }}개</span>
            </div>
            <div v-if="section.items.length === 0" class="empty-inline">데이터가 없습니다.</div>
            <div v-else class="channel-product-body">
              <div class="channel-product-featured">
                <div class="product-rank">1</div>
                <div class="channel-product-featured-copy">
                  <strong>{{ section.items[0]?.name }}</strong>
                  <span>{{ formatCurrencyAmount(section.items[0]?.amount || 0) }}</span>
                  <small>{{ formatQuantityCount(section.items[0]?.quantity || 0) }}개</small>
                </div>
              </div>
              <div class="product-list">
                <div
                  v-for="(item, index) in section.items.slice(1)"
                  :key="`${section.key}-${item.name}-${index + 1}`"
                  class="product-row"
                >
                  <div class="product-rank">{{ index + 2 }}</div>
                  <div class="product-copy">
                    <strong>{{ item.name }}</strong>
                    <span>{{ formatCurrencyAmount(item.amount) }} · {{ formatQuantityCount(item.quantity) }}개</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  BarChart3,
  MoveRight,
  Package,
  PieChart,
  Users,
} from 'lucide-vue-next'
import { formatCompactCurrency, formatCurrency } from '~/composables/useMoneyFormat'
import { computePurchaseQuantity, formatQuantityCount } from '~/composables/usePurchaseQuantity'
import {
  normalizePurchaseSourceScope,
  purchaseAmountSelectColumns,
  purchaseQuantityInput,
  purchaseSelectColumns,
  purchaseSourceScopeSelectColumns,
  resolvePurchaseCommissionTotal,
  resolvePurchaseExpectedSettlementAmount,
  resolvePurchasePaymentAmount,
  supportsPurchaseAmountColumns,
  supportsPurchaseSourceColumns,
  supportsPurchaseSourceScopeColumns,
} from '~/composables/usePurchaseSourceFields'
import { buildWeekOptions, weekCodeFromDate, weekDateTokensFromCode, weekLabelFromCode } from '~/composables/useWeekFilter'

interface PurchaseRow {
  purchase_id: string
  customer_key: string
  buyer_name: string
  buyer_id: string
  product_name: string
  option_info: string
  source_product_name?: string
  source_option_info?: string
  source_product_id?: string
  source_option_code?: string
  source_channel?: string | null
  source_fulfillment_type?: string | null
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
  is_fake: boolean
  needs_review: boolean
  filter_ver: string | null
}

interface ChannelMetric {
  key: string
  label: string
  tone: 'naver' | 'coupang' | 'excel' | 'neutral'
  badgeVariant: 'primary' | 'success' | 'warning' | 'info' | 'neutral'
  paymentAmount: number
  expectedSettlementAmount: number
  paymentCommissionAmount: number
  realOrders: number
  realCustomers: number
  totalQuantity: number
  repeatCustomers: number
  averageOrderValue: number
  shareOfRevenue: number
  topProductLabel: string
  lastOrderLabel: string
  trendValues: number[]
}

interface FulfillmentMetricRow {
  key: string
  label: string
  amount: number
  orders: number
  quantity: number
  share: number
}

interface ChannelProductItem {
  name: string
  amount: number
  quantity: number
}

interface ChannelProductSection {
  key: string
  label: string
  items: ChannelProductItem[]
}

const supabase = useSupabaseClient()
const toast = useToast()
const router = useRouter()
const { selectedMonth, selectedPeriodLabel } = useAnalysisPeriod()
const { profileLoaded, profileRevision } = useCurrentUser()

const loading = ref(false)
const fetchSeq = ref(0)
const purchaseRows = ref<PurchaseRow[]>([])
const channelWeekFilter = ref('')

const channelWeekOptions = computed(() => {
  if (selectedMonth.value === 'all') return []
  return buildWeekOptions(selectedMonth.value)
})

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

function resolveRowPaymentCommissionAmount(row: Pick<PurchaseRow, 'payment_commission' | 'sale_commission'>): number {
  return resolvePurchaseCommissionTotal(row)
}

const scopedRows = computed(() => {
  const monthSnapshot = selectedMonth.value
  const weekSnapshot = monthSnapshot !== 'all' ? channelWeekFilter.value : ''
  const monthRows = monthSnapshot === 'all'
    ? purchaseRows.value
    : purchaseRows.value.filter((row) => row.target_month === monthSnapshot)

  if (monthSnapshot !== 'all' && weekSnapshot) {
    return monthRows.filter((row) => weekCodeFromDate(row.order_date, monthSnapshot) === weekSnapshot)
  }

  return monthRows
})

const realRows = computed(() => scopedRows.value.filter((row) => !row.is_fake && !row.needs_review && !!row.filter_ver))

const trendLabels = computed(() => {
  if (selectedMonth.value === 'all') {
    return [...new Set(realRows.value.map((row) => row.target_month))].sort().slice(-6)
  }

  if (channelWeekFilter.value) {
    return weekDateTokensFromCode(selectedMonth.value, channelWeekFilter.value).map((token) => token.slice(5).replace('-', '.'))
  }

  return channelWeekOptions.value.map((week) => week.value)
})

const trendRangeLabel = computed(() => {
  if (selectedMonth.value === 'all') return '월별'
  if (channelWeekFilter.value) return weekLabelFromCode(selectedMonth.value, channelWeekFilter.value)
  return '주차별'
})

const overviewMetrics = computed(() => {
  const customers = new Set<string>()
  const totals = realRows.value.reduce((acc, row) => {
    customers.add(row.customer_key)
    acc.totalQuantity += resolveRowQuantity(row)
    acc.paymentAmount += resolveRowPaymentAmount(row)
    acc.expectedSettlementAmount += resolveRowExpectedSettlementAmount(row)
    acc.paymentCommissionAmount += resolveRowPaymentCommissionAmount(row)
    return acc
  }, {
    totalQuantity: 0,
    paymentAmount: 0,
    expectedSettlementAmount: 0,
    paymentCommissionAmount: 0,
  })

  return {
    paymentAmount: totals.paymentAmount,
    expectedSettlementAmount: totals.expectedSettlementAmount,
    paymentCommissionAmount: totals.paymentCommissionAmount,
    realOrders: realRows.value.length,
    realCustomers: customers.size,
    totalQuantity: Math.round(totals.totalQuantity * 100) / 100,
  }
})

const averageOrderValue = computed(() => {
  return overviewMetrics.value.realOrders > 0
    ? Math.round(overviewMetrics.value.paymentAmount / overviewMetrics.value.realOrders)
    : 0
})

const naverSettlementMetrics = computed(() => {
  const naver = channelMetrics.value.find((channel) => channel.key === 'naver')
  return {
    expectedSettlementAmount: naver?.expectedSettlementAmount || 0,
    paymentCommissionAmount: naver?.paymentCommissionAmount || 0,
  }
})

const channelMetrics = computed<ChannelMetric[]>(() => {
  const totals = overviewMetrics.value
  const revenueBase = Math.max(totals.paymentAmount, 1)
  const bucketKeys = trendLabels.value
  const metrics = new Map<string, {
    label: string
    tone: ChannelMetric['tone']
    badgeVariant: ChannelMetric['badgeVariant']
    paymentAmount: number
    expectedSettlementAmount: number
    paymentCommissionAmount: number
    orders: number
    quantity: number
    customers: Set<string>
    customerOrderCounts: Map<string, number>
    products: Map<string, { amount: number; quantity: number }>
    lastOrder: string
    buckets: Map<string, number>
  }>()

  for (const row of realRows.value) {
    const scope = normalizePurchaseSourceScope(row)
    const channel = normalizeChannelKey(scope.sourceChannel)
    const metric = ensureChannelMetric(metrics, channel)
    const quantity = resolveRowQuantity(row)
    const bucketKey = resolveTrendBucket(row)

    metric.orders += 1
    metric.quantity += quantity
    metric.paymentAmount += resolveRowPaymentAmount(row)
    metric.expectedSettlementAmount += resolveRowExpectedSettlementAmount(row)
    metric.paymentCommissionAmount += resolveRowPaymentCommissionAmount(row)
    metric.customers.add(row.customer_key)
    metric.customerOrderCounts.set(row.customer_key, (metric.customerOrderCounts.get(row.customer_key) || 0) + 1)
    const productMetric = metric.products.get(row.product_name) || { amount: 0, quantity: 0 }
    productMetric.amount += resolveRowPaymentAmount(row)
    productMetric.quantity += quantity
    metric.products.set(row.product_name, productMetric)
    metric.lastOrder = metric.lastOrder > row.order_date ? metric.lastOrder : row.order_date

    if (bucketKey) {
      metric.buckets.set(bucketKey, (metric.buckets.get(bucketKey) || 0) + resolveRowPaymentAmount(row))
    }
  }

  const orderedKeys = ['naver', 'coupang', 'excel']
  const remainingKeys = [...metrics.keys()].filter((key) => !orderedKeys.includes(key)).sort()

  return [...orderedKeys, ...remainingKeys]
    .filter((key) => metrics.has(key))
    .map((key) => {
      const metric = metrics.get(key)!
      const repeatCustomers = [...metric.customerOrderCounts.values()].filter((count) => count >= 2).length
      const topProduct = [...metric.products.entries()].sort((a, b) => b[1].amount - a[1].amount)[0]

      return {
        key,
        label: metric.label,
        tone: metric.tone,
        badgeVariant: metric.badgeVariant,
        paymentAmount: metric.paymentAmount,
        expectedSettlementAmount: metric.expectedSettlementAmount,
        paymentCommissionAmount: metric.paymentCommissionAmount,
        realOrders: metric.orders,
        realCustomers: metric.customers.size,
        totalQuantity: Math.round(metric.quantity * 100) / 100,
        repeatCustomers,
        averageOrderValue: metric.orders > 0 ? Math.round(metric.paymentAmount / metric.orders) : 0,
        shareOfRevenue: Math.round((metric.paymentAmount / revenueBase) * 100),
        topProductLabel: topProduct ? topProduct[0] : '대표 상품 없음',
        lastOrderLabel: metric.lastOrder ? `최근 주문 ${metric.lastOrder.slice(0, 10)}` : '주문 이력 없음',
        trendValues: bucketKeys.map((keyLabel) => metric.buckets.get(keyLabel) || 0),
      }
    })
})

const channelLeadSummary = computed(() => {
  const ordered = [...channelMetrics.value].sort((a, b) => b.paymentAmount - a.paymentAmount)
  const leader = ordered[0] || null
  const runnerUp = ordered[1] || null

  return {
    leader,
    runnerUp,
    gapAmount: leader && runnerUp ? Math.max(leader.paymentAmount - runnerUp.paymentAmount, 0) : leader?.paymentAmount || 0,
  }
})

const coupangFulfillmentRows = computed<FulfillmentMetricRow[]>(() => {
  const targetRows = realRows.value.filter((row) => normalizeChannelKey(normalizePurchaseSourceScope(row).sourceChannel) === 'coupang')
  const totalAmount = Math.max(targetRows.reduce((sum, row) => sum + resolveRowPaymentAmount(row), 0), 1)
  const grouped = new Map<string, { label: string; amount: number; orders: number; quantity: number }>()

  for (const row of targetRows) {
    const scope = normalizePurchaseSourceScope(row)
    const key = scope.sourceFulfillmentType || 'default'
    const label = fulfillmentLabel(key)
    const current = grouped.get(key) || { label, amount: 0, orders: 0, quantity: 0 }
    current.amount += resolveRowPaymentAmount(row)
    current.orders += 1
    current.quantity += resolveRowQuantity(row)
    grouped.set(key, current)
  }

  return [...grouped.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      amount: value.amount,
      orders: value.orders,
      quantity: Math.round(value.quantity * 100) / 100,
      share: Math.round((value.amount / totalAmount) * 100),
    }))
    .sort((a, b) => b.amount - a.amount)
})

const channelProductSections = computed<ChannelProductSection[]>(() => {
  return channelMetrics.value.map((channel) => {
    const grouped = new Map<string, { amount: number; quantity: number }>()
    for (const row of realRows.value) {
      const scope = normalizePurchaseSourceScope(row)
      if (normalizeChannelKey(scope.sourceChannel) !== channel.key) continue
      const current = grouped.get(row.product_name) || { amount: 0, quantity: 0 }
      current.amount += resolveRowPaymentAmount(row)
      current.quantity += resolveRowQuantity(row)
      grouped.set(row.product_name, current)
    }

    return {
      key: channel.key,
      label: channel.label,
      items: [...grouped.entries()]
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 3)
        .map(([name, value]) => ({
          name,
          amount: value.amount,
          quantity: Math.round(value.quantity * 100) / 100,
        })),
    }
  })
})

function normalizeChannelKey(channel: string) {
  if (channel === 'naver' || channel === 'coupang' || channel === 'excel') return channel
  return channel || 'excel'
}

function ensureChannelMetric(
  metrics: Map<string, {
    label: string
    tone: ChannelMetric['tone']
    badgeVariant: ChannelMetric['badgeVariant']
    paymentAmount: number
    expectedSettlementAmount: number
    paymentCommissionAmount: number
    orders: number
    quantity: number
    customers: Set<string>
    customerOrderCounts: Map<string, number>
    products: Map<string, { amount: number; quantity: number }>
    lastOrder: string
    buckets: Map<string, number>
  }>,
  channel: string,
) {
  const current = metrics.get(channel)
  if (current) return current

  const created = {
    label: channelLabel(channel),
    tone: channelTone(channel),
    badgeVariant: channelBadgeVariant(channel),
    paymentAmount: 0,
    expectedSettlementAmount: 0,
    paymentCommissionAmount: 0,
    orders: 0,
    quantity: 0,
    customers: new Set<string>(),
    customerOrderCounts: new Map<string, number>(),
    products: new Map<string, { amount: number; quantity: number }>(),
    lastOrder: '',
    buckets: new Map<string, number>(),
  }
  metrics.set(channel, created)
  return created
}

function channelLabel(channel: string) {
  if (channel === 'naver') return '네이버'
  if (channel === 'coupang') return '쿠팡'
  if (channel === 'excel') return '엑셀'
  return channel || '기타'
}

function channelTone(channel: string): ChannelMetric['tone'] {
  if (channel === 'naver') return 'naver'
  if (channel === 'coupang') return 'coupang'
  if (channel === 'excel') return 'excel'
  return 'neutral'
}

function channelBadgeVariant(channel: string): ChannelMetric['badgeVariant'] {
  if (channel === 'naver') return 'primary'
  if (channel === 'coupang') return 'warning'
  if (channel === 'excel') return 'neutral'
  return 'info'
}

function fulfillmentLabel(value: string) {
  if (value === 'rocket_growth') return '로켓그로스'
  if (value === 'seller_delivery') return '판매자배송'
  if (value === 'rocket') return '로켓배송'
  return value || '기본'
}

function resolveTrendBucket(row: PurchaseRow) {
  if (selectedMonth.value === 'all') {
    const bucket = row.target_month
    return trendLabels.value.includes(bucket) ? bucket : ''
  }

  if (channelWeekFilter.value) {
    const bucket = row.order_date.slice(5, 10).replace('-', '.')
    return trendLabels.value.includes(bucket) ? bucket : ''
  }

  const bucket = weekCodeFromDate(row.order_date, selectedMonth.value)
  return trendLabels.value.includes(bucket) ? bucket : ''
}

function resolveRowQuantity(row: PurchaseRow) {
  return computePurchaseQuantity(
    purchaseQuantityInput({
      product_name: row.product_name,
      option_info: row.option_info,
      source_product_name: row.source_product_name,
      source_option_info: row.source_option_info,
      source_product_id: row.source_product_id,
      source_option_code: row.source_option_code,
      quantity: row.quantity,
    })
  ).totalCount
}

function trendValueWidth(value: number, index: number) {
  const base = Math.max(...channelMetrics.value.map((channel) => channel.trendValues[index] || 0), 1)
  return Math.max(12, Math.round((value / base) * 100))
}

function displayTrendLabel(label: string) {
  if (selectedMonth.value === 'all') return label.replace('-', '.')
  if (channelWeekFilter.value) return label
  return weekLabelFromCode(selectedMonth.value, label).split(' ')[0] || label
}

function navigateToChannelCustomers(channel: string) {
  const query: Record<string, string> = { channel }
  if (selectedMonth.value !== 'all') query.month = selectedMonth.value
  if (selectedMonth.value !== 'all' && channelWeekFilter.value) query.week = channelWeekFilter.value
  router.push({ path: '/customers', query })
}

async function fetchChannelRows() {
  const includeSourceColumns = await supportsPurchaseSourceColumns(supabase)
  const includeSourceScopeColumns = await supportsPurchaseSourceScopeColumns(supabase)
  const includeAmountColumns = await supportsPurchaseAmountColumns(supabase)
  const baseColumns = 'purchase_id, customer_key, buyer_name, buyer_id, product_name, option_info, quantity, order_date, target_month, is_fake, needs_review, filter_ver'
  const selectColumns = purchaseAmountSelectColumns(
    purchaseSourceScopeSelectColumns(
      purchaseSelectColumns(baseColumns, includeSourceColumns),
      includeSourceScopeColumns,
    ),
    includeAmountColumns,
  )
  const rows: PurchaseRow[] = []
  const PAGE_SIZE = 1000

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('purchases')
      .select(selectColumns)
      .not('filter_ver', 'is', null)
      .order('order_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (selectedMonth.value !== 'all') {
      query = query.eq('target_month', selectedMonth.value)
    }

    const { data, error } = await query
    if (error) throw error

    const chunk = (data || []).map((row: any) => ({
      purchase_id: String(row.purchase_id || ''),
      customer_key: String(row.customer_key || ''),
      buyer_name: String(row.buyer_name || ''),
      buyer_id: String(row.buyer_id || ''),
      product_name: String(row.product_name || ''),
      option_info: String(row.option_info || ''),
      source_product_name: row.source_product_name ? String(row.source_product_name) : undefined,
      source_option_info: row.source_option_info ? String(row.source_option_info) : undefined,
      source_product_id: row.source_product_id ? String(row.source_product_id) : undefined,
      source_option_code: row.source_option_code ? String(row.source_option_code) : undefined,
      source_channel: row.source_channel ? String(row.source_channel) : null,
      source_fulfillment_type: row.source_fulfillment_type ? String(row.source_fulfillment_type) : null,
      quantity: Number(row.quantity || 0),
      payment_amount: includeAmountColumns ? normalizeAmount(row.payment_amount) : null,
      order_discount_amount: includeAmountColumns ? normalizeAmount(row.order_discount_amount) : null,
      delivery_fee_amount: includeAmountColumns ? normalizeAmount(row.delivery_fee_amount) : null,
      delivery_discount_amount: includeAmountColumns ? normalizeAmount(row.delivery_discount_amount) : null,
      expected_settlement_amount: includeAmountColumns ? normalizeAmount(row.expected_settlement_amount) : null,
      payment_commission: includeAmountColumns ? normalizeAmount(row.payment_commission) : null,
      sale_commission: includeAmountColumns ? normalizeAmount(row.sale_commission) : null,
      order_date: String(row.order_date || ''),
      target_month: String(row.target_month || ''),
      is_fake: Boolean(row.is_fake),
      needs_review: Boolean(row.needs_review),
      filter_ver: row.filter_ver ? String(row.filter_ver) : null,
    })) as PurchaseRow[]

    rows.push(...chunk)

    if (chunk.length < PAGE_SIZE) break
  }

  return rows
}

async function loadChannelAnalysis() {
  const requestSeq = ++fetchSeq.value
  if (!profileLoaded.value) return
  loading.value = true

  try {
    const rows = await fetchChannelRows()
    if (requestSeq !== fetchSeq.value) return
    purchaseRows.value = rows
  } catch (error: any) {
    console.error('Failed to fetch channel analysis:', error)
    if (requestSeq === fetchSeq.value) {
      purchaseRows.value = []
    }
    toast.error(`채널 분석 데이터를 불러오지 못했습니다: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    if (requestSeq === fetchSeq.value) {
      loading.value = false
    }
  }
}

watch(
  () => [selectedMonth.value, profileLoaded.value, profileRevision.value],
  async () => {
    if (selectedMonth.value === 'all') {
      channelWeekFilter.value = ''
    } else if (channelWeekFilter.value && !channelWeekOptions.value.some((week) => week.value === channelWeekFilter.value)) {
      channelWeekFilter.value = ''
    }
    await loadChannelAnalysis()
  },
  { immediate: true },
)
</script>

<style scoped>
.channel-analysis-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-lg);
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
  gap: 10px;
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

.section-caption {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.compare-hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.9fr);
  gap: 18px;
  align-items: stretch;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(229, 235, 242, 0.96);
  background: #FFFFFF;
  box-shadow: none;
}

.compare-hero-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 24px;
}

.compare-hero-label {
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.compare-hero-title {
  margin: 0;
  font-size: 1.42rem;
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--color-text);
}

.compare-hero-caption {
  margin: 0;
  font-size: 0.92rem;
  color: var(--color-text-secondary);
}

.compare-hero-stats {
  display: grid;
  gap: 12px;
  padding: 24px 24px 24px 0;
  align-content: center;
}

.compare-hero-stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 16px 15px;
  border-radius: 14px;
  background: #FAFBFD;
  border: 1px solid rgba(227, 233, 241, 0.9);
}

.compare-hero-stat--primary {
  background: #F6F9FF;
}

.compare-hero-stat span {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.compare-hero-stat strong {
  font-size: 1.08rem;
  font-weight: 800;
  color: var(--color-text);
}

.compare-hero-stat small {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.loading-card,
.empty-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 24px;
}

.channel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 18px;
}

.channel-card {
  padding: 24px;
  text-align: left;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  background: #FFFFFF;
  box-shadow: none;
}

.channel-card:hover {
  transform: translateY(-1px);
  box-shadow: none;
}

.channel-card--naver {
  border-color: rgba(49, 130, 246, 0.18);
}

.channel-card--coupang {
  border-color: rgba(245, 158, 11, 0.2);
}

.channel-card--excel {
  border-color: rgba(148, 163, 184, 0.2);
}

.channel-card-top,
.channel-card-footer,
.channel-share-head,
.channel-stat-row,
.trend-channel-head,
.product-section-head,
.product-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.channel-card-top {
  margin-bottom: 18px;
}

.channel-card-title {
  display: block;
  font-size: 1.06rem;
  font-weight: 800;
  color: var(--color-text);
}

.channel-card-sub,
.channel-card-footer,
.channel-share-head,
.channel-stat-row span,
.trend-channel-head span,
.product-section-head span,
.product-copy span {
  font-size: 0.82rem;
  color: var(--color-text-secondary);
}

.channel-primary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 18px;
}

.channel-primary-label {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.channel-primary-value {
  font-size: 2.35rem;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.05em;
  color: var(--color-text);
}

.channel-stat-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 2px;
}

.channel-stat-row strong,
.trend-channel-head strong,
.product-section-head strong,
.product-copy strong {
  color: var(--color-text);
}

.channel-share {
  margin-top: 18px;
}

.channel-share-track,
.fulfillment-progress {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: #EEF2F6;
  overflow: hidden;
}

.channel-share-fill,
.fulfillment-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: #3182F6;
}

.channel-card-footer {
  margin-top: 20px;
  font-weight: 600;
  color: var(--color-text);
}

.analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.95fr);
  gap: 18px;
}

.trend-timeline {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.trend-timeline-row {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.trend-timeline-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 4px;
}

.trend-timeline-label strong {
  font-size: 0.9rem;
  color: var(--color-text);
}

.trend-timeline-label span {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.trend-timeline-values {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.trend-timeline-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #FFFFFF;
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.trend-timeline-item--naver {
  background: #FFFFFF;
}

.trend-timeline-item--coupang {
  background: #FFFFFF;
}

.trend-timeline-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.trend-timeline-copy span {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.trend-timeline-copy strong {
  font-size: 0.9rem;
  color: var(--color-text);
}

.trend-timeline-track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: #E8EEF6;
  overflow: hidden;
}

.trend-timeline-fill {
  height: 100%;
  border-radius: inherit;
  background: #1D63E9;
}

.fulfillment-list,
.product-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fulfillment-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fulfillment-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.fulfillment-copy span {
  font-size: 0.82rem;
  color: var(--color-text-secondary);
}

.channel-product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 18px;
}

.channel-product-panel {
  padding: 20px;
  border-radius: 16px;
  background: #FFFFFF;
  border: 1px solid var(--color-border-light);
}

.channel-product-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.channel-product-featured {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.channel-product-featured-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.channel-product-featured-copy strong {
  font-size: 0.98rem;
  color: var(--color-text);
}

.channel-product-featured-copy span {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text);
}

.channel-product-featured-copy small {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

.product-rank {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #EEF5FF;
  color: #1D63E9;
  font-size: 0.78rem;
  font-weight: 700;
  flex-shrink: 0;
}

.product-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.product-copy strong {
  font-size: 0.92rem;
}

@media (max-width: 1200px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .compare-hero-card,
  .analysis-grid {
    grid-template-columns: 1fr;
  }

  .compare-hero-stats {
    padding: 0 24px 24px;
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    padding: 0;
  }

  .trend-timeline-row {
    grid-template-columns: 1fr;
  }

  .compare-hero-copy,
  .compare-hero-stats {
    padding-left: 22px;
    padding-right: 22px;
  }

  .page-header-actions {
    width: 100%;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
