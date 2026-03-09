<template>
  <div class="dashboard">
    <div class="status-row">
      <StatusBadge :label="selectedPeriodLabel" variant="neutral" />
      <StatusBadge v-if="dashboardLoading" label="데이터 불러오는 중" variant="info" />
      <span v-else class="text-xs text-muted">실구매 주문 {{ currentMetrics.realPurchase.toLocaleString() }}건 기준</span>
    </div>

    <div class="kpi-grid">
      <div class="card card-clickable kpi-wrapper" @click="navigateToCustomers()">
        <KpiCard
          label="실구매 고객 수"
          :value="currentMetrics.realCustomers"
          :icon="UserPlus"
          icon-bg="#EFF6FF"
          icon-color="#2563EB"
        />
      </div>
      <div class="card card-clickable kpi-wrapper" @click="navigateToCustomers()">
        <KpiCard
          label="실구매 건수"
          :value="currentMetrics.realPurchase"
          :icon="CheckCircle"
          icon-bg="#ECFDF5"
          icon-color="#10B981"
        />
      </div>
      <div class="card card-clickable kpi-wrapper" @click="navigateToCustomers({ purchaseCount: '2' })">
        <KpiCard
          label="재구매 고객"
          :value="currentMetrics.repeatCustomers"
          :icon="UserCheck"
          icon-bg="#F0FDF4"
          icon-color="#16A34A"
        />
      </div>
      <div class="card card-clickable kpi-wrapper" @click="navigateToCustomers({ churn: 'true' })">
        <KpiCard
          label="이탈 위험 고객"
          :value="currentMetrics.churnCount"
          :icon="MoveRight"
          icon-bg="#FEF2F2"
          icon-color="#DC2626"
        />
      </div>
    </div>

    <div class="charts-grid">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">월별 실구매 추이</h3>
          <StatusBadge :label="trendRangeLabel" variant="neutral" />
        </div>
        <div class="trend-chart">
          <div class="trend-chart-area">
            <canvas ref="trendChartCanvas"></canvas>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">실구매 고객 펫 타입</h3>
        </div>
        <div class="pet-chart">
          <div class="pet-donut">
            <canvas ref="petChartCanvas"></canvas>
          </div>
          <div class="pet-legend">
            <div v-for="p in petData" :key="p.label" class="pet-legend-item">
              <span class="legend-dot" :style="{ background: p.color }"></span>
              <span class="legend-label">{{ p.label }}</span>
              <span class="legend-value">{{ p.count }}명 · {{ p.value }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="bottom-grid">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">실구매 인기 상품 TOP 5</h3>
          <StatusBadge :label="`${selectedPeriodLabel} 기준`" variant="neutral" />
        </div>
        <div v-if="topProducts.length === 0" class="empty-inline">실구매 상품 데이터가 없습니다.</div>
        <div v-else class="top-products">
          <div v-for="(item, idx) in topProducts" :key="item.name + idx" class="top-product-item">
            <span class="top-product-rank" :class="'rank-' + (idx + 1)">{{ idx + 1 }}</span>
            <div class="top-product-info">
              <span class="top-product-name">{{ item.name }}</span>
              <span class="top-product-option">옵션: {{ item.optionInfo || '-' }}</span>
              <span class="top-product-meta">{{ item.pet }} · {{ item.stage }}</span>
            </div>
            <div class="top-product-stats">
              <span class="top-product-count">{{ formatQuantityCount(item.count) }}개</span>
              <div class="top-product-bar-wrap">
                <div class="top-product-bar" :style="{ width: item.percent + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">고객 성장 단계</h3>
        </div>
        <div class="stage-bars">
          <div v-for="s in stageData" :key="s.name" class="stage-item">
            <div class="stage-bar-outer">
              <div class="stage-bar-inner" :style="{ height: s.percent + '%' }"></div>
            </div>
            <span class="stage-count">{{ s.count }}</span>
            <span class="stage-name">{{ s.name }}</span>
          </div>
        </div>
        <div class="stage-actions">
          <button
            v-for="s in stageData"
            :key="`stage-action-${s.name}`"
            class="btn btn-ghost btn-sm stage-action-btn"
            @click="navigateToCustomers({ stage: stageQueryByName(s.name) })"
          >
            {{ s.name }} 고객 목록 보기
          </button>
        </div>
      </div>
    </div>

    <div class="single-grid">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">이탈 위험 고객</h3>
          <StatusBadge :label="`${currentMetrics.churnCount}명`" variant="danger" dot />
        </div>
        <div v-if="churnData.length === 0" class="empty-inline">현재 기준 이탈 위험 고객이 없습니다.</div>
        <div v-else class="churn-list">
          <div v-for="c in churnData" :key="`${c.name}-${c.id}`" class="churn-item">
            <div class="churn-info">
              <span class="churn-name">{{ c.name }}</span>
              <span class="churn-id">{{ c.id }}</span>
            </div>
            <div class="churn-meta">
              <span class="churn-days">{{ c.days }}일 경과</span>
              <StatusBadge :label="c.pet" :variant="c.pet === '강아지' ? 'primary' : c.pet === '고양이' ? 'warning' : 'neutral'" />
            </div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm mt-lg" style="width:100%;justify-content:center;" @click="navigateToCustomers({ churn: 'true' })">
          <MoveRight :size="14" :stroke-width="2" />
          전체 이탈 위험 고객 보기
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  CheckCircle,
  UserCheck,
  UserPlus,
  MoveRight,
} from 'lucide-vue-next'
import { Chart, DoughnutController, ArcElement, Tooltip, Legend, LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler } from 'chart.js'
import { customerStageLabel, progressiveCustomerStage, productStageLabel } from '~/composables/useGrowthStage'
import { computePurchaseQuantity, formatQuantityCount } from '~/composables/usePurchaseQuantity'

Chart.register(DoughnutController, ArcElement, Tooltip, Legend, LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler)

interface PurchaseRow {
  purchase_id: string
  customer_key: string
  buyer_name: string
  buyer_id: string
  product_id: string
  product_name: string
  option_info: string
  quantity: number
  order_date: string
  target_month: string
  is_fake: boolean
  needs_review: boolean
  filter_ver: string | null
}

interface ProductMeta {
  pet_type: 'DOG' | 'CAT' | 'BOTH'
  stage: number | null
}

interface CustomerAgg {
  name: string
  id: string
  petType: 'DOG' | 'CAT' | 'BOTH'
  stage: 'Entry' | 'Growth' | 'Core' | 'Premium' | 'Other'
  purchaseCount: number
  lastOrder: string
  daysSinceLastOrder: number
}

interface DashboardMetrics {
  realCustomers: number
  realPurchase: number
  repeatCustomers: number
  churnCount: number
}

interface PetDatum {
  label: '강아지' | '고양이' | '모두'
  count: number
  value: number
  color: string
}

interface TopProductRow {
  name: string
  optionInfo: string
  pet: string
  stage: string
  count: number
  percent: number
}

interface StageDatum {
  name: string
  count: number
  percent: number
}

interface ChurnRow {
  name: string
  id: string
  days: number
  pet: string
}

const router = useRouter()
const supabase = useSupabaseClient()
const toast = useToast()
const { selectedMonth, selectedPeriodLabel, availableMonths } = useAnalysisPeriod()
const { profileLoaded, profileRevision } = useCurrentUser()

const petChartCanvas = ref<HTMLCanvasElement | null>(null)
const trendChartCanvas = ref<HTMLCanvasElement | null>(null)
const petChartInstance = shallowRef<Chart | null>(null)
const trendChartInstance = shallowRef<Chart | null>(null)

const dashboardLoading = ref(false)
const currentMetrics = ref<DashboardMetrics>({
  realCustomers: 0,
  realPurchase: 0,
  repeatCustomers: 0,
  churnCount: 0,
})
const petData = ref<PetDatum[]>([
  { label: '강아지', count: 0, value: 0, color: '#2563EB' },
  { label: '고양이', count: 0, value: 0, color: '#F59E0B' },
  { label: '모두', count: 0, value: 0, color: '#94A3B8' },
])
const topProducts = ref<TopProductRow[]>([])
const stageData = ref<StageDatum[]>([
  { name: '입문', count: 0, percent: 0 },
  { name: '성장', count: 0, percent: 0 },
  { name: '핵심', count: 0, percent: 0 },
  { name: '프리미엄', count: 0, percent: 0 },
])
const churnData = ref<ChurnRow[]>([])
const trendMonthTokens = ref<string[]>([])
const trendValues = ref<number[]>([])

const productMetaById = ref<Record<string, ProductMeta>>({})
const productMetaByName = ref<Record<string, ProductMeta>>({})

const trendRangeLabel = computed(() => {
  if (trendMonthTokens.value.length === 0) return '최근 6개월'
  if (trendMonthTokens.value.length === 1) return `${formatMonthLabel(trendMonthTokens.value[0])}`
  const first = formatMonthLabel(trendMonthTokens.value[0])
  const last = formatMonthLabel(trendMonthTokens.value[trendMonthTokens.value.length - 1])
  return `${first} ~ ${last}`
})

function navigateToCustomers(query: Record<string, string> = {}) {
  const withMonth = selectedMonth.value !== 'all'
    ? { month: selectedMonth.value, ...query }
    : query
  router.push({ path: '/customers', query: withMonth })
}

function stageQueryByName(stageName: string): string {
  if (stageName === '입문') return 'Entry'
  if (stageName === '성장') return 'Growth'
  if (stageName === '핵심') return 'Core'
  if (stageName === '프리미엄') return 'Premium'
  return ''
}

function parseOrderDate(value: string): Date {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? new Date('1970-01-01') : d
}

function daysFromNow(dateStr: string): number {
  const ms = Date.now() - parseOrderDate(dateStr).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function normalizeForMatch(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '')
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

function sanitizePetType(value: unknown): ProductMeta['pet_type'] {
  const type = String(value || '').toUpperCase()
  if (type === 'DOG') return 'DOG'
  if (type === 'CAT') return 'CAT'
  if (type === 'BOTH' || type === 'ALL') return 'BOTH'
  return 'BOTH'
}

function stageLabelByCode(code: number | null | undefined): string {
  return productStageLabel(code)
}

function petLabel(type: ProductMeta['pet_type']): string {
  if (type === 'DOG') return '강아지'
  if (type === 'CAT') return '고양이'
  return '모두'
}

function inferPetTypeFromName(productName: string): ProductMeta['pet_type'] {
  const normalized = normalizeForMatch(productName)
  const hasDog = normalized.includes('강아지') || normalized.includes('강견') || normalized.includes('견')
  const hasCat = normalized.includes('고양이') || normalized.includes('묘') || normalized.includes('냥')
  if (hasDog && hasCat) return 'BOTH'
  if (hasDog) return 'DOG'
  if (hasCat) return 'CAT'
  return 'BOTH'
}

function customerGroupKey(row: PurchaseRow): string {
  return String(row.customer_key || '').trim() || `${String(row.buyer_id || '').trim()}_${String(row.buyer_name || '').trim()}`
}

function purchaseDateKey(row: Pick<PurchaseRow, 'order_date'>): string {
  return String(row.order_date || '').slice(0, 10)
}

function derivePetType(rows: PurchaseRow[]): ProductMeta['pet_type'] {
  let hasDog = false
  let hasCat = false

  for (const row of rows) {
    const idKey = String(row.product_id || '').trim()
    const metaById = idKey ? productMetaById.value[idKey] : null
    const nameKey = normalizeForMatch(normalizeMissionProductName(row.product_name || ''))
    const metaByName = nameKey ? productMetaByName.value[nameKey] : null
    const petType = metaById?.pet_type || metaByName?.pet_type || inferPetTypeFromName(row.product_name || '')

    if (petType === 'BOTH') return 'BOTH'
    if (petType === 'DOG') hasDog = true
    if (petType === 'CAT') hasCat = true
    if (hasDog && hasCat) return 'BOTH'
  }

  if (hasDog) return 'DOG'
  if (hasCat) return 'CAT'
  return 'BOTH'
}

function deriveCustomerStage(rows: PurchaseRow[]): CustomerAgg['stage'] {
  const stageByDate = new Map<string, number | null>()

  for (const row of rows) {
    const idKey = String(row.product_id || '').trim()
    const metaById = idKey ? productMetaById.value[idKey] : null
    const nameKey = normalizeForMatch(normalizeMissionProductName(row.product_name || ''))
    const metaByName = nameKey ? productMetaByName.value[nameKey] : null
    const stage = metaById?.stage ?? metaByName?.stage ?? null
    const dateKey = purchaseDateKey(row) || String(row.order_date || '').trim() || '1970-01-01'
    const prevStage = stageByDate.get(dateKey)
    const nextStage = Math.max(prevStage || 0, stage || 0) || null
    stageByDate.set(dateKey, nextStage)
  }

  const orderedStages = Array.from(stageByDate.entries())
    .sort((a, b) => parseOrderDate(a[0]).getTime() - parseOrderDate(b[0]).getTime())
    .map(([, stage]) => stage)

  return progressiveCustomerStage(orderedStages)
}

function maskBuyerId(raw: string): string {
  const value = String(raw || '').trim()
  if (!value) return '-'
  if (value.length <= 4) return value
  return `${value.slice(0, 4)}****`
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

function buildTrendMonths(): string[] {
  const monthTokens = availableMonths.value
    .map((item) => String(item.value || ''))
    .filter((token) => /^\d{4}-\d{2}$/.test(token))
    .sort((a, b) => a.localeCompare(b))

  if (monthTokens.length > 0) {
    return monthTokens
  }

  const pivot = selectedMonth.value !== 'all' && /^\d{4}-\d{2}$/.test(selectedMonth.value)
    ? selectedMonth.value
    : toMonthToken(new Date())
  const fallback: string[] = []
  for (let i = 5; i >= 0; i -= 1) {
    fallback.push(shiftMonthToken(pivot, -i))
  }
  return fallback
}

async function loadProductMeta() {
  const { data, error } = await supabase
    .from('products')
    .select('product_id, product_name, pet_type, stage')
    .is('deleted_at', null)

  if (error) {
    throw error
  }

  const byId: Record<string, ProductMeta> = {}
  const byName: Record<string, ProductMeta> = {}
  for (const row of (data || []) as any[]) {
    const petType = sanitizePetType(row.pet_type)
    const stage = Number.isFinite(Number(row.stage)) ? Number(row.stage) : null
    const meta = { pet_type: petType, stage }

    const productId = String(row.product_id || '').trim()
    if (productId) byId[productId] = meta

    const rawName = String(row.product_name || '').trim()
    const canonicalName = normalizeMissionProductName(rawName)
    const normalizedRaw = normalizeForMatch(rawName)
    const normalizedCanonical = normalizeForMatch(canonicalName)
    if (normalizedRaw) byName[normalizedRaw] = meta
    if (normalizedCanonical) byName[normalizedCanonical] = meta
  }

  productMetaById.value = byId
  productMetaByName.value = byName
}

async function fetchPurchases(month: string): Promise<PurchaseRow[]> {
  const rows: PurchaseRow[] = []
  const PAGE_SIZE = 1000

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('purchases')
      .select('purchase_id, customer_key, buyer_name, buyer_id, product_id, product_name, option_info, quantity, order_date, target_month, is_fake, needs_review, filter_ver')
      .not('filter_ver', 'is', null)
      .order('order_date', { ascending: false })
      .order('purchase_id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (month !== 'all') query = query.eq('target_month', month)

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

async function fetchTrendCounts(monthTokens: string[]): Promise<Map<string, number>> {
  const countMap = new Map<string, number>()
  for (const month of monthTokens) countMap.set(month, 0)
  if (monthTokens.length === 0) return countMap

  const PAGE_SIZE = 1000
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('purchases')
      .select('target_month, is_fake, needs_review, filter_ver')
      .in('target_month', monthTokens)
      .not('filter_ver', 'is', null)
      .order('target_month', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    const chunk = (data || []) as any[]
    for (const row of chunk) {
      if (Boolean(row.is_fake) || Boolean(row.needs_review) || !row.filter_ver) continue
      const month = String(row.target_month || '')
      countMap.set(month, (countMap.get(month) || 0) + 1)
    }
    if (chunk.length < PAGE_SIZE) break
  }

  return countMap
}

function applyDashboardMetrics(scopeRows: PurchaseRow[]) {
  const realRows = scopeRows.filter((row) => !row.is_fake && !row.needs_review && !!row.filter_ver)

  const grouped = new Map<string, PurchaseRow[]>()
  for (const row of realRows) {
    const key = customerGroupKey(row)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(row)
  }

  const customerAggs: CustomerAgg[] = []
  for (const customerRows of grouped.values()) {
    const sorted = [...customerRows].sort((a, b) => parseOrderDate(b.order_date).getTime() - parseOrderDate(a.order_date).getTime())
    const latest = sorted[0]
    if (!latest) continue
    const purchaseCount = new Set(customerRows.map((row) => purchaseDateKey(row)).filter(Boolean)).size
    if (purchaseCount <= 0) continue
    const lastOrder = String(latest.order_date || '').slice(0, 10)
    customerAggs.push({
      name: latest.buyer_name || '-',
      id: latest.buyer_id || '-',
      petType: derivePetType(customerRows),
      stage: deriveCustomerStage(customerRows),
      purchaseCount,
      lastOrder,
      daysSinceLastOrder: daysFromNow(lastOrder),
    })
  }

  // 재구매 고객: 서로 다른 주문일 기준 2회 이상 구매한 고객
  const repeatCustomers = customerAggs.filter((row) => row.purchaseCount >= 2).length
  const churnCustomers = customerAggs.filter((row) => row.daysSinceLastOrder > 90)

  currentMetrics.value = {
    realCustomers: customerAggs.length,
    realPurchase: realRows.length,
    repeatCustomers,
    churnCount: churnCustomers.length,
  }

  const dogCount = customerAggs.filter((row) => row.petType === 'DOG').length
  const catCount = customerAggs.filter((row) => row.petType === 'CAT').length
  const bothCount = customerAggs.filter((row) => row.petType === 'BOTH').length
  const petTotal = Math.max(customerAggs.length, 1)
  petData.value = [
    { label: '강아지', count: dogCount, value: Math.round((dogCount / petTotal) * 100), color: '#2563EB' },
    { label: '고양이', count: catCount, value: Math.round((catCount / petTotal) * 100), color: '#F59E0B' },
    { label: '모두', count: bothCount, value: Math.round((bothCount / petTotal) * 100), color: '#94A3B8' },
  ]

  const stageCountMap = {
    입문: 0,
    성장: 0,
    핵심: 0,
    프리미엄: 0,
  }
  for (const customer of customerAggs) {
    const stageName = customerStageLabel(customer.stage)
    if (stageName in stageCountMap) {
      stageCountMap[stageName as keyof typeof stageCountMap] += 1
    }
  }
  const stageMax = Math.max(stageCountMap.입문, stageCountMap.성장, stageCountMap.핵심, stageCountMap.프리미엄, 1)
  stageData.value = [
    { name: '입문', count: stageCountMap.입문, percent: Math.round((stageCountMap.입문 / stageMax) * 100) },
    { name: '성장', count: stageCountMap.성장, percent: Math.round((stageCountMap.성장 / stageMax) * 100) },
    { name: '핵심', count: stageCountMap.핵심, percent: Math.round((stageCountMap.핵심 / stageMax) * 100) },
    { name: '프리미엄', count: stageCountMap.프리미엄, percent: Math.round((stageCountMap.프리미엄 / stageMax) * 100) },
  ]

  const productMap = new Map<string, {
    name: string
    optionInfo: string
    count: number
    petType: ProductMeta['pet_type']
    stage: number | null
  }>()
  for (const row of realRows) {
    const baseKey = String(row.product_id || '').trim() || normalizeForMatch(row.product_name || '')
    if (!baseKey) continue
    const quantityResult = computePurchaseQuantity({
      productName: row.product_name,
      optionInfo: row.option_info,
      quantity: row.quantity,
    })

    const nameKey = normalizeForMatch(normalizeMissionProductName(row.product_name || ''))
    const meta = productMetaById.value[String(row.product_id || '').trim()] || productMetaByName.value[nameKey]
    const nextPetType = meta?.pet_type || inferPetTypeFromName(row.product_name || '')
    const nextStage = meta?.stage ?? null

    for (const part of quantityResult.dashboardBreakdown) {
      const optionInfo = normalizeOptionInfo(part.optionLabel)
      const optionKey = normalizeForMatch(optionInfo)
      const key = `${baseKey}::${optionKey}`

      if (!productMap.has(key)) {
        productMap.set(key, {
          name: row.product_name || '-',
          optionInfo,
          count: 0,
          petType: nextPetType,
          stage: nextStage,
        })
      }
      productMap.get(key)!.count += part.count
    }
  }

  const top = Array.from(productMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
  const topMax = Math.max(top[0]?.count || 1, 1)
  topProducts.value = top.map((item) => ({
    name: item.name,
    optionInfo: item.optionInfo,
    pet: petLabel(item.petType),
    stage: stageLabelByCode(item.stage),
    count: item.count,
    percent: Math.round((item.count / topMax) * 100),
  }))

  churnData.value = churnCustomers
    .sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder)
    .slice(0, 5)
    .map((item) => ({
      name: item.name,
      id: maskBuyerId(item.id),
      days: item.daysSinceLastOrder,
      pet: petLabel(item.petType),
    }))
}

async function fetchDashboardData() {
  if (!profileLoaded.value) return
  dashboardLoading.value = true
  try {
    await loadProductMeta()

    const scopeRows = await fetchPurchases(selectedMonth.value)
    applyDashboardMetrics(scopeRows)

    const trendMonths = buildTrendMonths()
    const trendMap = await fetchTrendCounts(trendMonths)
    trendMonthTokens.value = trendMonths
    trendValues.value = trendMonths.map((month) => trendMap.get(month) || 0)
  } catch (error: any) {
    console.error('Failed to fetch dashboard data:', error)
    toast.error(`대시보드 데이터를 불러오지 못했습니다: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    dashboardLoading.value = false
  }
}

function renderPetChart() {
  if (!petChartCanvas.value) return
  if (petChartInstance.value) {
    petChartInstance.value.destroy()
    petChartInstance.value = null
  }

  const values = petData.value.map((p) => p.count)
  const hasData = values.some((value) => value > 0)

  petChartInstance.value = new Chart(petChartCanvas.value, {
    type: 'doughnut',
    data: {
      labels: hasData ? petData.value.map((p) => p.label) : ['데이터 없음'],
      datasets: [{
        data: hasData ? values : [1],
        backgroundColor: hasData ? petData.value.map((p) => p.color) : ['#E5E7EB'],
        borderWidth: 0,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: { display: false },
      },
    },
  })
}

function renderTrendChart() {
  if (!trendChartCanvas.value) return
  if (trendChartInstance.value) {
    trendChartInstance.value.destroy()
    trendChartInstance.value = null
  }

  trendChartInstance.value = new Chart(trendChartCanvas.value, {
    type: 'line',
    data: {
      labels: trendMonthTokens.value.map((month) => formatMonthLabel(month)),
      datasets: [{
        data: trendValues.value,
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
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1E293B',
          titleFont: { size: 12 },
          bodyFont: { size: 13, weight: 'bold' as const },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => `${Number(ctx.parsed.y || 0).toLocaleString()}건`,
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
            callback: (value) => Number(value).toLocaleString(),
          },
          beginAtZero: true,
        },
      },
    },
  })
}

watch(
  () => [selectedMonth.value, profileLoaded.value, profileRevision.value],
  async ([month, loaded]) => {
    if (!month || !loaded) return
    await fetchDashboardData()
  },
  { immediate: true },
)

watch(
  () => [petData.value, trendMonthTokens.value, trendValues.value],
  async () => {
    await nextTick()
    renderPetChart()
    renderTrendChart()
  },
  { deep: true },
)

onBeforeUnmount(() => {
  if (petChartInstance.value) petChartInstance.value.destroy()
  if (trendChartInstance.value) trendChartInstance.value.destroy()
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.status-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
}

.kpi-wrapper {
  padding: 0;
}

.charts-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: var(--space-lg);
}

.bottom-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-lg);
}

.single-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-lg);
}

.empty-inline {
  padding: var(--space-md) 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.trend-chart {
  padding-top: var(--space-sm);
}

.trend-chart-area {
  height: 200px;
}

.pet-chart {
  display: flex;
  align-items: center;
  gap: var(--space-2xl);
}

.pet-donut {
  width: 140px;
  height: 140px;
  flex-shrink: 0;
}

.pet-legend {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.pet-legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  width: 48px;
}

.legend-value {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
}

.top-products {
  display: flex;
  flex-direction: column;
}

.top-product-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) 0;
  border-bottom: 1px solid var(--color-border-light);
}

.top-product-item:last-child {
  border-bottom: none;
}

.top-product-rank {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6875rem;
  font-weight: 700;
  flex-shrink: 0;
  background: var(--color-bg);
  color: var(--color-text-muted);
}

.rank-1 {
  background: #EFF6FF;
  color: #2563EB;
}

.rank-2 {
  background: #F0FDF4;
  color: #16A34A;
}

.rank-3 {
  background: #FFF7ED;
  color: #EA580C;
}

.top-product-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.top-product-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-product-option {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

.top-product-meta {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

.top-product-stats {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-shrink: 0;
}

.top-product-count {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
  width: 42px;
  text-align: right;
}

.top-product-bar-wrap {
  width: 60px;
  height: 6px;
  background: #F3F4F6;
  border-radius: 3px;
  overflow: hidden;
}

.top-product-bar {
  height: 100%;
  background: var(--color-primary);
  border-radius: 3px;
}

.stage-bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  height: 180px;
  padding-top: var(--space-lg);
}

.stage-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
}

.stage-bar-outer {
  width: 40px;
  height: 120px;
  background: #F3F4F6;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.stage-bar-inner {
  width: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-sm);
  transition: height 0.6s ease;
}

.stage-count {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text);
}

.stage-name {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

.stage-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.stage-action-btn {
  flex: 1;
  min-width: 120px;
  justify-content: center;
}

.churn-list {
  display: flex;
  flex-direction: column;
}

.churn-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) 0;
  border-bottom: 1px solid var(--color-border-light);
}

.churn-item:last-child {
  border-bottom: none;
}

.churn-info {
  display: flex;
  flex-direction: column;
}

.churn-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text);
}

.churn-id {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.churn-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.churn-days {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-danger);
}

@media (max-width: 1280px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .charts-grid,
  .bottom-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1024px) {
  .trend-chart-area {
    height: 180px;
  }

  .pet-chart {
    gap: var(--space-lg);
  }
}

@media (max-width: 768px) {
  .dashboard {
    gap: var(--space-lg);
  }

  .status-row {
    flex-wrap: wrap;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
    gap: var(--space-md);
  }

  .pet-chart {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-md);
  }

  .pet-donut {
    width: 128px;
    height: 128px;
  }

  .legend-label {
    width: auto;
    min-width: 48px;
  }

  .top-product-item {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .top-product-stats {
    width: 100%;
    justify-content: flex-end;
  }

  .top-product-bar-wrap {
    width: 120px;
  }

  .stage-bars {
    height: 150px;
    padding-top: var(--space-md);
  }

  .stage-bar-outer {
    width: 34px;
    height: 96px;
  }

  .stage-actions {
    flex-direction: column;
  }

  .stage-action-btn {
    width: 100%;
    min-width: 0;
  }

  .churn-item {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .churn-meta {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
