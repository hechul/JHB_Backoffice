<template>
  <div class="channel-analysis-page">
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">채널 분석</h1>
        <span class="page-caption">채널별 실구매 비교</span>
      </div>
      <div class="page-header-actions">
        <StatusBadge :label="selectedPeriodLabel" variant="neutral" />
        <StatusBadge v-if="selectedMonth !== 'all' && channelWeekFilter" :label="weekLabelFromCode(selectedMonth, channelWeekFilter)" variant="info" />
        <StatusBadge v-if="loading" label="불러오는 중" variant="info" />
        <select v-if="selectedMonth !== 'all'" v-model="channelWeekFilter" class="select select-compact header-select">
          <option value="">주차 전체</option>
          <option v-for="week in channelWeekOptions" :key="week.value" :value="week.value">{{ week.label }}</option>
        </select>
      </div>
    </div>

    <div class="kpi-grid">
      <KpiCard
        label="실구매 주문"
        :value="overviewMetrics.realOrders"
        :icon="BarChart3"
        icon-bg="#EAF2FF"
        icon-color="#1D63E9"
      />
      <KpiCard
        label="실구매 고객"
        :value="overviewMetrics.realCustomers"
        :icon="Users"
        icon-bg="#ECFDF5"
        icon-color="#10B981"
      />
      <KpiCard
        label="총 판매수량"
        :value="overviewMetrics.totalQuantity"
        :icon="Package"
        icon-bg="#FFF7E8"
        icon-color="#F59E0B"
      />
      <KpiCard
        label="활성 채널"
        :value="channelMetrics.length"
        :icon="PieChart"
        icon-bg="#EEF2FF"
        icon-color="#5B6FD6"
      />
    </div>

    <div v-if="loading" class="card loading-card">채널 데이터를 불러오는 중입니다.</div>

    <template v-else>
      <div v-if="channelMetrics.length === 0" class="card empty-card">
        <strong>분석 가능한 채널 데이터가 없습니다.</strong>
        <span>주문 동기화 또는 업로드 이후 다시 확인해 주세요.</span>
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
            <StatusBadge :label="`${channel.shareOfOrders}%`" :variant="channel.badgeVariant" />
          </div>

          <div class="channel-primary">
            <span class="channel-primary-label">실구매 주문</span>
            <strong class="channel-primary-value">{{ channel.realOrders.toLocaleString() }}</strong>
          </div>

          <div class="channel-stat-list">
            <div class="channel-stat-row">
              <span>실구매 고객</span>
              <strong>{{ channel.realCustomers.toLocaleString() }}명</strong>
            </div>
            <div class="channel-stat-row">
              <span>총 판매수량</span>
              <strong>{{ formatQuantityCount(channel.totalQuantity) }}개</strong>
            </div>
            <div class="channel-stat-row">
              <span>재구매 고객</span>
              <strong>{{ channel.repeatCustomers.toLocaleString() }}명</strong>
            </div>
          </div>

          <div class="channel-share">
            <div class="channel-share-head">
              <span>채널 점유율</span>
              <span>{{ channel.shareOfOrders }}%</span>
            </div>
            <div class="channel-share-track">
              <div class="channel-share-fill" :style="{ width: `${channel.shareOfOrders}%` }"></div>
            </div>
          </div>

          <div class="channel-card-footer">
            <span>{{ channel.topProductLabel }}</span>
            <MoveRight :size="14" :stroke-width="2" />
          </div>
        </button>
      </div>

      <div class="analysis-grid">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">최근 흐름</h3>
            <StatusBadge :label="trendRangeLabel" variant="neutral" />
          </div>

          <div class="trend-stack">
            <div v-for="channel in channelMetrics" :key="`trend-${channel.key}`" class="trend-channel-row">
              <div class="trend-channel-head">
                <strong>{{ channel.label }}</strong>
                <span>{{ channel.realOrders.toLocaleString() }}건</span>
              </div>
              <div class="trend-bars">
                <div
                  v-for="(value, index) in channel.trendValues"
                  :key="`${channel.key}-${trendLabels[index] || index}`"
                  class="trend-bar"
                  :title="`${trendLabels[index] || ''} · ${value.toLocaleString()}건`"
                >
                  <div class="trend-bar-fill" :style="{ height: `${trendBarHeight(value)}%` }"></div>
                  <span class="trend-bar-label">{{ trendLabels[index] }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">쿠팡 풀필먼트</h3>
            <StatusBadge :label="`${coupangFulfillmentRows.length}개 구분`" variant="neutral" />
          </div>

          <div v-if="coupangFulfillmentRows.length === 0" class="empty-inline">쿠팡 데이터가 없습니다.</div>
          <div v-else class="fulfillment-list">
            <div v-for="row in coupangFulfillmentRows" :key="row.key" class="fulfillment-row">
              <div class="fulfillment-copy">
                <strong>{{ row.label }}</strong>
                <span>{{ row.orders.toLocaleString() }}건 · {{ row.quantity.toLocaleString() }}개</span>
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
          <h3 class="card-title">채널별 인기 상품</h3>
          <StatusBadge :label="`${channelProductSections.length}개 채널`" variant="neutral" />
        </div>

        <div class="product-section-grid">
          <div v-for="section in channelProductSections" :key="section.key" class="product-section">
            <div class="product-section-head">
              <strong>{{ section.label }}</strong>
              <span>{{ section.items.length }}개</span>
            </div>
            <div v-if="section.items.length === 0" class="empty-inline">데이터가 없습니다.</div>
            <div v-else class="product-list">
              <div v-for="(item, index) in section.items" :key="`${section.key}-${item.name}-${index}`" class="product-row">
                <div class="product-rank">{{ index + 1 }}</div>
                <div class="product-copy">
                  <strong>{{ item.name }}</strong>
                  <span>{{ item.quantity.toLocaleString() }}개</span>
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
import { computePurchaseQuantity, formatQuantityCount } from '~/composables/usePurchaseQuantity'
import {
  normalizePurchaseSourceScope,
  purchaseQuantityInput,
  purchaseSelectColumns,
  purchaseSourceScopeSelectColumns,
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
  realOrders: number
  realCustomers: number
  totalQuantity: number
  repeatCustomers: number
  shareOfOrders: number
  topProductLabel: string
  lastOrderLabel: string
  trendValues: number[]
}

interface FulfillmentMetricRow {
  key: string
  label: string
  orders: number
  quantity: number
  share: number
}

interface ChannelProductItem {
  name: string
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
  const quantities = realRows.value.reduce((sum, row) => {
    customers.add(row.customer_key)
    return sum + resolveRowQuantity(row)
  }, 0)

  return {
    realOrders: realRows.value.length,
    realCustomers: customers.size,
    totalQuantity: Math.round(quantities * 100) / 100,
  }
})

const channelMetrics = computed<ChannelMetric[]>(() => {
  const totals = overviewMetrics.value
  const orderBase = Math.max(totals.realOrders, 1)
  const bucketKeys = trendLabels.value
  const metrics = new Map<string, {
    label: string
    tone: ChannelMetric['tone']
    badgeVariant: ChannelMetric['badgeVariant']
    orders: number
    quantity: number
    customers: Set<string>
    customerOrderCounts: Map<string, number>
    products: Map<string, number>
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
    metric.customers.add(row.customer_key)
    metric.customerOrderCounts.set(row.customer_key, (metric.customerOrderCounts.get(row.customer_key) || 0) + 1)
    metric.products.set(row.product_name, (metric.products.get(row.product_name) || 0) + quantity)
    metric.lastOrder = metric.lastOrder > row.order_date ? metric.lastOrder : row.order_date

    if (bucketKey) {
      metric.buckets.set(bucketKey, (metric.buckets.get(bucketKey) || 0) + 1)
    }
  }

  const orderedKeys = ['naver', 'coupang', 'excel']
  const remainingKeys = [...metrics.keys()].filter((key) => !orderedKeys.includes(key)).sort()

  return [...orderedKeys, ...remainingKeys]
    .filter((key) => metrics.has(key))
    .map((key) => {
      const metric = metrics.get(key)!
      const repeatCustomers = [...metric.customerOrderCounts.values()].filter((count) => count >= 2).length
      const topProduct = [...metric.products.entries()].sort((a, b) => b[1] - a[1])[0]

      return {
        key,
        label: metric.label,
        tone: metric.tone,
        badgeVariant: metric.badgeVariant,
        realOrders: metric.orders,
        realCustomers: metric.customers.size,
        totalQuantity: Math.round(metric.quantity * 100) / 100,
        repeatCustomers,
        shareOfOrders: Math.round((metric.orders / orderBase) * 100),
        topProductLabel: topProduct ? topProduct[0] : '대표 상품 없음',
        lastOrderLabel: metric.lastOrder ? `최근 주문 ${metric.lastOrder.slice(0, 10)}` : '주문 이력 없음',
        trendValues: bucketKeys.map((keyLabel) => metric.buckets.get(keyLabel) || 0),
      }
    })
})

const coupangFulfillmentRows = computed<FulfillmentMetricRow[]>(() => {
  const targetRows = realRows.value.filter((row) => normalizeChannelKey(normalizePurchaseSourceScope(row).sourceChannel) === 'coupang')
  const totals = Math.max(targetRows.length, 1)
  const grouped = new Map<string, { label: string; orders: number; quantity: number }>()

  for (const row of targetRows) {
    const scope = normalizePurchaseSourceScope(row)
    const key = scope.sourceFulfillmentType || 'default'
    const label = fulfillmentLabel(key)
    const current = grouped.get(key) || { label, orders: 0, quantity: 0 }
    current.orders += 1
    current.quantity += resolveRowQuantity(row)
    grouped.set(key, current)
  }

  return [...grouped.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      orders: value.orders,
      quantity: Math.round(value.quantity * 100) / 100,
      share: Math.round((value.orders / totals) * 100),
    }))
    .sort((a, b) => b.orders - a.orders)
})

const channelProductSections = computed<ChannelProductSection[]>(() => {
  return channelMetrics.value.map((channel) => {
    const grouped = new Map<string, number>()
    for (const row of realRows.value) {
      const scope = normalizePurchaseSourceScope(row)
      if (normalizeChannelKey(scope.sourceChannel) !== channel.key) continue
      grouped.set(row.product_name, (grouped.get(row.product_name) || 0) + resolveRowQuantity(row))
    }

    return {
      key: channel.key,
      label: channel.label,
      items: [...grouped.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, quantity]) => ({ name, quantity: Math.round(quantity * 100) / 100 })),
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
    orders: number
    quantity: number
    customers: Set<string>
    customerOrderCounts: Map<string, number>
    products: Map<string, number>
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
    orders: 0,
    quantity: 0,
    customers: new Set<string>(),
    customerOrderCounts: new Map<string, number>(),
    products: new Map<string, number>(),
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

function trendBarHeight(value: number) {
  const maxValue = Math.max(...channelMetrics.value.flatMap((channel) => channel.trendValues), 1)
  return Math.max(8, Math.round((value / maxValue) * 100))
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
  const baseColumns = 'purchase_id, customer_key, buyer_name, buyer_id, product_name, option_info, quantity, order_date, target_month, is_fake, needs_review, filter_ver'
  const selectColumns = purchaseSourceScopeSelectColumns(
    purchaseSelectColumns(baseColumns, includeSourceColumns),
    includeSourceScopeColumns,
  )

  let query = supabase
    .from('purchases')
    .select(selectColumns)
    .not('filter_ver', 'is', null)
    .order('order_date', { ascending: true })

  if (selectedMonth.value !== 'all') {
    query = query.eq('target_month', selectedMonth.value)
  }

  const { data, error } = await query
  if (error) throw error

  return (data || []).map((row: any) => ({
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
    order_date: String(row.order_date || ''),
    target_month: String(row.target_month || ''),
    is_fake: Boolean(row.is_fake),
    needs_review: Boolean(row.needs_review),
    filter_ver: row.filter_ver ? String(row.filter_ver) : null,
  })) as PurchaseRow[]
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
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--color-text);
}

.page-caption {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.channel-card {
  padding: 22px;
  text-align: left;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.channel-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
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
  font-size: 1.02rem;
  font-weight: 700;
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
  margin-bottom: 16px;
}

.channel-primary-label {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.channel-primary-value {
  font-size: 2.15rem;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.05em;
  color: var(--color-text);
}

.channel-stat-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 2px;
}

.channel-stat-row strong,
.trend-channel-head strong,
.product-section-head strong,
.product-copy strong {
  color: var(--color-text);
}

.channel-share {
  margin-top: 16px;
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
  background: linear-gradient(90deg, #3182F6 0%, #5B8EFF 100%);
}

.channel-card-footer {
  margin-top: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: 16px;
}

.trend-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.trend-channel-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trend-bars {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
  gap: 10px;
  align-items: end;
}

.trend-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 108px;
  justify-content: flex-end;
}

.trend-bar-fill {
  width: 100%;
  max-width: 34px;
  min-height: 8px;
  border-radius: 12px 12px 6px 6px;
  background: linear-gradient(180deg, #66A4FF 0%, #1D63E9 100%);
  box-shadow: 0 8px 18px rgba(49, 130, 246, 0.16);
}

.trend-bar-label {
  font-size: 0.72rem;
  color: var(--color-text-muted);
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

.product-section-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.product-section {
  padding: 18px;
  border-radius: 18px;
  background: #FAFBFD;
  border: 1px solid var(--color-border-light);
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
  .kpi-grid,
  .channel-grid,
  .product-section-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .analysis-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
  }

  .page-header-actions,
  .kpi-grid,
  .channel-grid,
  .product-section-grid {
    grid-template-columns: 1fr;
  }
}
</style>
