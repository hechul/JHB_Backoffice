<template>
  <div class="dashboard">
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">경영 요약</h1>
        <span class="page-caption">{{ selectedPeriodLabel }} 기준 월별 흐름과 핵심 지표</span>
      </div>
      <div class="page-header-actions">
        <StatusBadge v-if="dashboardLoading" label="불러오는 중" variant="info" />
      </div>
    </div>

    <div class="card period-compare-card">
      <div class="card-header">
        <div>
          <h3 class="card-title">{{ comparisonCardTitle }}</h3>
          <span class="section-caption">{{ comparisonPeriodCaption }}</span>
        </div>
      </div>
      <div class="period-compare-grid">
        <div v-for="card in monthlyComparisonCards" :key="card.label" class="period-compare-item">
          <span class="period-compare-label">{{ card.label }}</span>
          <strong class="period-compare-value">{{ card.currentValueLabel }}</strong>
          <div class="period-compare-foot">
            <span>{{ card.previousLabel }} {{ card.previousValueLabel }}</span>
            <span class="period-compare-change" :class="card.changeClass">{{ card.changeLabel }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="kpi-grid">
      <KpiCard
        label="구매 주문"
        :value="currentMetrics.realPurchase"
        :icon="LineChart"
        :to="reportSectionLink('/channel-analysis')"
        icon-bg="#EFF6FF"
        icon-color="#2563EB"
      />
      <KpiCard
        label="구매 고객"
        :value="currentMetrics.realCustomers"
        :icon="UserPlus"
        :to="reportSectionLink('/customers')"
        icon-bg="#F0FDF4"
        icon-color="#16A34A"
      />
      <KpiCard
        label="객단가"
        :value="currentMetrics.averageOrderValue"
        :icon="TrendingUp"
        format="currency"
        icon-bg="#ECFDF5"
        icon-color="#10B981"
      />
      <KpiCard
        label="재구매 전환율"
        :value="currentMetrics.repeatCustomerRate"
        :icon="UserCheck"
        suffix="%"
        :to="reportSectionLink('/growth-stages')"
        icon-bg="#EEF2FF"
        icon-color="#4F46E5"
      />
    </div>

    <div class="charts-grid">
      <div class="card">
        <div class="card-header card-header-stack">
          <div class="dashboard-card-head dashboard-card-head-between">
            <div class="trend-card-copy">
              <h3 class="card-title">월별 결제 금액 추이</h3>
              <div class="trend-drill-path">
                <button type="button" class="trend-drill-pill" :class="{ active: !trendDrillMonth }" @click="resetTrendDrilldown">
                  전체
                </button>
                <button
                  v-if="trendDrillMonth"
                  type="button"
                  class="trend-drill-pill"
                  :class="{ active: !!trendDrillMonth && !trendDrillWeek }"
                  @click="clearTrendWeek"
                >
                  {{ formatMonthLabel(trendDrillMonth) }}
                </button>
                <span v-if="trendDrillWeek" class="trend-drill-pill active">
                  {{ weekLabelFromCode(trendDrillMonth || '', trendDrillWeek) }}
                </span>
              </div>
            </div>
            <div class="trend-card-actions">
              <StatusBadge :label="trendRangeLabel" variant="neutral" />
              <button v-if="trendCanGoBack" type="button" class="btn btn-secondary btn-sm" @click="stepBackTrendDrilldown">
                뒤로가기
              </button>
            </div>
          </div>
          <span class="trend-card-helper">{{ trendHelperLabel }}</span>
        </div>
        <div class="trend-chart">
          <div class="trend-chart-area trend-chart-area-with-growth">
            <canvas ref="trendChartCanvas"></canvas>
            <div v-if="trendInlineMarkers.length" class="trend-inline-markers">
              <span
                v-for="marker in trendInlineMarkers"
                :key="marker.key"
                class="trend-inline-marker"
                :class="`is-${marker.variant}`"
                :style="{ left: marker.left }"
              >
                {{ marker.rateLabel }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="card signal-card">
        <div class="card-header">
          <div class="dashboard-card-head">
            <h3 class="card-title">핵심 지표</h3>
          </div>
        </div>
        <div class="signal-list">
          <div class="signal-row signal-row--primary">
            <div class="signal-copy">
              <span class="signal-label">결제 금액</span>
              <strong class="signal-value">{{ monthlyComparisonCards[0]?.currentValueLabel || '—' }}</strong>
            </div>
            <span class="signal-change" :class="monthlyComparisonCards[0]?.changeClass">
              {{ monthlyComparisonCards[0]?.changeLabel || '비교 없음' }}
            </span>
          </div>
          <div class="signal-row">
            <div class="signal-copy">
              <span class="signal-label">정산 예정</span>
              <strong class="signal-value">{{ monthlyComparisonCards[1]?.currentValueLabel || '—' }}</strong>
            </div>
            <span class="signal-change" :class="monthlyComparisonCards[1]?.changeClass">
              {{ monthlyComparisonCards[1]?.changeLabel || '비교 없음' }}
            </span>
          </div>
          <div class="signal-row">
            <div class="signal-copy">
              <span class="signal-label">재구매 고객</span>
              <strong class="signal-value">{{ currentMetrics.repeatCustomers.toLocaleString() }}명</strong>
            </div>
            <span class="signal-support">전환율 {{ currentMetrics.repeatCustomerRate.toFixed(1) }}%</span>
          </div>
          <div class="signal-row">
            <div class="signal-copy">
              <span class="signal-label">이탈 위험 고객</span>
              <strong class="signal-value">{{ effectiveChurnCount.toLocaleString() }}명</strong>
            </div>
            <span class="signal-support">{{ churnCountLabel }}</span>
          </div>
        </div>
        <div class="signal-actions">
          <NuxtLink to="/customers" class="btn btn-secondary btn-sm">고객 보기</NuxtLink>
          <NuxtLink to="/growth-stages" class="btn btn-ghost btn-sm">재구매 흐름</NuxtLink>
        </div>
      </div>
    </div>

    <div class="bottom-grid">
      <div class="card">
        <div class="card-header">
          <div class="dashboard-card-head">
            <h3 class="card-title">상품 매출 상위 5개</h3>
          </div>
          <StatusBadge :label="`${selectedPeriodLabel} 기준`" variant="neutral" />
        </div>
        <div v-if="topProducts.length === 0" class="empty-inline">상품 데이터가 없습니다.</div>
        <div v-else class="top-products">
          <div v-for="(item, idx) in topProducts" :key="item.name + idx" class="top-product-item">
            <span class="top-product-rank" :class="'rank-' + (idx + 1)">{{ idx + 1 }}</span>
            <div class="top-product-info">
              <span class="top-product-name">{{ item.name }}</span>
              <span class="top-product-meta">{{ item.pet }} · {{ item.stage }}</span>
            </div>
            <div class="top-product-stats">
              <span class="top-product-count">{{ formatCurrency(item.amount) }}</span>
              <span class="top-product-sub">{{ formatQuantityCount(item.count) }}개</span>
              <div class="top-product-bar-wrap">
                <div class="top-product-bar" :style="{ width: item.percent + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">이탈 위험 고객</h3>
            <span class="section-caption">소비 주기를 넘긴 고객부터 먼저 정리합니다.</span>
          </div>
          <StatusBadge :label="churnCountLabel" variant="danger" dot />
        </div>
        <div v-if="visibleChurnData.length === 0" class="empty-inline">현재 조건에 맞는 이탈 위험 고객이 없습니다.</div>
        <div v-else class="churn-list">
          <div v-for="c in visibleChurnData" :key="`${c.name}-${c.id}`" class="churn-item">
            <div class="churn-info">
              <span class="churn-name">{{ c.name }}</span>
              <span class="churn-id">{{ c.id }}</span>
              <span class="churn-date">최근 주문 {{ c.lastOrder }} · 기준 {{ c.expectedDays }}일</span>
            </div>
            <div class="churn-meta">
              <span class="churn-days">{{ c.days }}일 경과 · {{ c.overdueDays }}일 초과</span>
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
  LineChart,
  UserCheck,
  UserPlus,
  MoveRight,
  TrendingUp,
} from 'lucide-vue-next'
import { Chart, DoughnutController, ArcElement, Tooltip, Legend, LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, BarController, BarElement } from 'chart.js'
import { computeCustomerStage, countDistinctPurchaseMonths, customerStageLabel, productStageLabel } from '~/composables/useGrowthStage'
import { computeChurnRisk, normalizeExpectedConsumptionDays } from '~/composables/useChurnRisk'
import { formatCompactCurrency, formatCurrency } from '~/composables/useMoneyFormat'
import { computePurchaseQuantity, formatQuantityCount } from '~/composables/usePurchaseQuantity'
import { purchaseAmountSelectColumns, purchaseQuantityInput, purchaseSelectColumns, resolvePurchaseCommissionTotal, resolvePurchaseExpectedSettlementAmount, resolvePurchasePaymentAmount, supportsPurchaseAmountColumns, supportsPurchaseSourceColumns } from '~/composables/usePurchaseSourceFields'
import { computeTrendGrowthRates, formatTrendGrowthRate, trendGrowthVariant } from '~/composables/useTrendGrowth'
import { buildWeekOptions, weekCodeFromDate, weekDateTokensFromCode, weekLabelFromCode } from '~/composables/useWeekFilter'

Chart.register(DoughnutController, ArcElement, Tooltip, Legend, LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, BarController, BarElement)

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
  is_fake: boolean
  needs_review: boolean
  filter_ver: string | null
}

interface ProductMeta {
  pet_type: 'DOG' | 'CAT' | 'BOTH'
  stage: number | null
  expected_consumption_days: number | null
}

interface CustomerAgg {
  name: string
  id: string
  petType: 'DOG' | 'CAT' | 'BOTH'
  stage: 'Entry' | 'Growth' | 'Premium' | 'Core' | 'Other'
  purchaseCount: number
  lastOrder: string
  daysSinceLastOrder: number
  churnRisk: boolean
  churnExpectedConsumptionDays: number | null
  churnOverdueDays: number | null
}

interface DashboardMetrics {
  paymentAmount: number
  expectedSettlementAmount: number
  paymentCommissionAmount: number
  realCustomers: number
  realPurchase: number
  repeatCustomers: number
  averageOrderValue: number
  repeatCustomerRate: number
  churnCount: number
}

interface MonthlyComparisonCard {
  label: string
  currentValueLabel: string
  previousLabel: string
  previousValueLabel: string
  changeLabel: string
  changeClass: string
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
  amount: number
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
  expectedDays: number
  overdueDays: number
  pet: string
  lastOrder: string
}

interface TrendTransitionRow {
  key: string
  label: string
  rateLabel: string
  valueLabel: string
  variant: 'success' | 'danger' | 'neutral'
  left: string
}

// 공통 도구와 전역 상태
// - router: 다른 분석 화면으로 이동
// - supabase: purchases/products 조회
// - useAnalysisPeriod: 현재 선택 월/월 목록
// - useCurrentUser: 프로필 로딩이 끝난 뒤에만 안전하게 조회 시작
const router = useRouter()
const supabase = useSupabaseClient()
const toast = useToast()
const { selectedMonth, selectedPeriodLabel, availableMonths } = useAnalysisPeriod()
const { profileLoaded, profileRevision } = useCurrentUser()

// Chart.js는 캔버스 DOM과 인스턴스를 따로 관리해야 한다.
// 값이 바뀔 때마다 destroy -> re-render 하므로 둘 다 필요하다.
const petChartCanvas = ref<HTMLCanvasElement | null>(null)
const trendChartCanvas = ref<HTMLCanvasElement | null>(null)
const dailySalesChartCanvas = ref<HTMLCanvasElement | null>(null)
const petChartInstance = shallowRef<Chart | null>(null)
const trendChartInstance = shallowRef<Chart | null>(null)
const dailySalesChartInstance = shallowRef<Chart | null>(null)

// purchases 원본을 그대로 템플릿에 바인딩하지 않고,
// 화면용 KPI/차트 데이터로 다시 계산한 값을 여기에 담는다.
const dashboardLoading = ref(false)
const currentMetrics = ref<DashboardMetrics>({
  paymentAmount: 0,
  expectedSettlementAmount: 0,
  paymentCommissionAmount: 0,
  realCustomers: 0,
  realPurchase: 0,
  repeatCustomers: 0,
  averageOrderValue: 0,
  repeatCustomerRate: 0,
  churnCount: 0,
})
const petData = ref<PetDatum[]>([
  { label: '강아지', count: 0, value: 0, color: '#2563EB' },
  { label: '고양이', count: 0, value: 0, color: '#F59E0B' },
  { label: '모두', count: 0, value: 0, color: '#94A3B8' },
])
const topProducts = ref<TopProductRow[]>([])
const stageData = ref<StageDatum[]>([
  { name: '신규', count: 0, percent: 0 },
  { name: '성장', count: 0, percent: 0 },
  { name: '단골', count: 0, percent: 0 },
  { name: '핵심', count: 0, percent: 0 },
])
const churnData = ref<ChurnRow[]>([])
const trendLabels = ref<string[]>([])
const trendValues = ref<number[]>([])
const trendGrowthRates = ref<Array<number | null>>([])
const trendClickKeys = ref<string[]>([])
const dailySalesLabels = ref<string[]>([])
const dailySalesValues = ref<number[]>([])
const dailySalesKeys = ref<string[]>([])
const dashboardFetchSeq = ref(0)
const dashboardRows = ref<PurchaseRow[]>([])
const trendDrillMonth = ref<string | null>(null)
const trendDrillWeek = ref('')

// products 메타 lookup
// - product_id 기준
// - product_name 정규화 기준
// 두 방향 모두 준비해야 상품명이 흔들려도 펫 타입/성장단계/소비주기 메타를 최대한 찾을 수 있다.
const productMetaById = ref<Record<string, ProductMeta>>({})
const productMetaByName = ref<Record<string, ProductMeta>>({})
const hasExpectedConsumptionConfig = ref(false)

// 차트 범위를 사람이 읽기 쉬운 라벨로 만든다.
const trendRangeLabel = computed(() => {
  if (!trendDrillMonth.value) {
    if (trendLabels.value.length === 0) return '최근 6개월'
    if (trendLabels.value.length === 1) return trendLabels.value[0]
    return `${trendLabels.value[0]} ~ ${trendLabels.value[trendLabels.value.length - 1]}`
  }
  if (!trendDrillWeek.value) return `${formatMonthLabel(trendDrillMonth.value)} · 주차별`
  return `${weekLabelFromCode(trendDrillMonth.value, trendDrillWeek.value)} · 일별`
})

// 구간별 성장률을 차트 위에 바로 표시하기 위한 중간 데이터
// 예: 1주차 -> 2주차, +12%
const trendTransitionRows = computed<TrendTransitionRow[]>(() => {
  const rows: TrendTransitionRow[] = []
  for (let index = 1; index < trendLabels.value.length; index += 1) {
    const previousLabel = trendLabels.value[index - 1]
    const currentLabel = trendLabels.value[index]
    const previousValue = trendValues.value[index - 1] || 0
    const currentValue = trendValues.value[index] || 0
    const rate = trendGrowthRates.value[index] ?? null
    rows.push({
      key: `${previousLabel}-${currentLabel}-${index}`,
      label: `${previousLabel} -> ${currentLabel}`,
      rateLabel: formatTrendGrowthRate(rate),
      valueLabel: `${formatCurrency(previousValue)} -> ${formatCurrency(currentValue)}`,
      variant: trendGrowthVariant(rate),
      left: `${((index - 0.5) / Math.max(trendLabels.value.length - 1, 1)) * 100}%`,
    })
  }
  return rows
})

const trendInlineMarkers = computed(() => {
  if (trendDrillWeek.value) return []
  return trendTransitionRows.value
})

const trendCanGoBack = computed(() => Boolean(trendDrillWeek.value || trendDrillMonth.value))

const trendHelperLabel = computed(() => {
  if (!trendDrillMonth.value) return '월을 누르면 해당 월의 주차별 흐름을 볼 수 있습니다.'
  if (!trendDrillWeek.value) return '주차를 누르면 일별 흐름으로 내려갑니다.'
  return '뒤로가기를 누르면 이전 범위로 돌아갑니다.'
})

const comparisonMonthToken = computed(() => {
  if (selectedMonth.value !== 'all' && isMonthToken(selectedMonth.value)) return selectedMonth.value
  const tokens = buildTrendMonths('all', dashboardRows.value)
  return tokens[tokens.length - 1] || toMonthToken(new Date())
})

const previousComparisonMonthToken = computed(() => shiftMonthToken(comparisonMonthToken.value, -1))

const isAllPeriodSelected = computed(() => selectedMonth.value === 'all')

const comparisonCardTitle = computed(() => {
  return isAllPeriodSelected.value ? '전체 기간 요약' : '이번 달 핵심 변화'
})

const comparisonPeriodCaption = computed(() => {
  if (isAllPeriodSelected.value) {
    const tokens = buildTrendMonths('all', dashboardRows.value)
    if (tokens.length === 0) return '선택 가능한 기간의 누적 금액입니다.'
    if (tokens.length === 1) return `${formatMonthLabel(tokens[0])} 누적 금액입니다.`
    return `${formatMonthLabel(tokens[0])} ~ ${formatMonthLabel(tokens[tokens.length - 1])} 누적 금액입니다.`
  }
  return `${formatMonthLabel(comparisonMonthToken.value)} 기준으로 직전 월과 비교합니다.`
})

const monthlyComparisonCards = computed<MonthlyComparisonCard[]>(() => {
  const realRows = dashboardRows.value.filter((row) => !row.is_fake && !row.needs_review && !!row.filter_ver)

  if (isAllPeriodSelected.value) {
    const tokens = buildTrendMonths('all', realRows)
    const rangeLabel = tokens.length === 0
      ? '집계 기간'
      : tokens.length === 1
        ? formatMonthLabel(tokens[0])
        : `${formatMonthLabel(tokens[0])} ~ ${formatMonthLabel(tokens[tokens.length - 1])}`
    const overallPayment = summarizeKnownAmount(realRows, hasKnownPaymentAmount, resolveRowPaymentAmount)
    const overallSettlement = summarizeKnownAmount(realRows, hasKnownExpectedSettlementAmount, resolveRowExpectedSettlementAmount)
    const overallCommission = summarizeKnownAmount(realRows, hasKnownCommissionAmount, resolveRowPaymentCommissionAmount)

    return [
      {
        label: '결제 금액',
        currentValueLabel: formatOptionalCurrency(overallPayment),
        previousLabel: '대상 기간',
        previousValueLabel: rangeLabel,
        changeLabel: '전체 누적',
        changeClass: 'is-neutral',
      },
      {
        label: '정산 예정',
        currentValueLabel: formatOptionalCurrency(overallSettlement),
        previousLabel: '대상 기간',
        previousValueLabel: rangeLabel,
        changeLabel: '전체 누적',
        changeClass: 'is-neutral',
      },
      {
        label: '총 수수료',
        currentValueLabel: formatOptionalCurrency(overallCommission),
        previousLabel: '대상 기간',
        previousValueLabel: rangeLabel,
        changeLabel: '전체 누적',
        changeClass: 'is-neutral',
      },
    ]
  }

  const currentRows = realRows.filter((row) => row.target_month === comparisonMonthToken.value)
  const previousRows = realRows.filter((row) => row.target_month === previousComparisonMonthToken.value)
  const currentPayment = summarizeKnownAmount(currentRows, hasKnownPaymentAmount, resolveRowPaymentAmount)
  const previousPayment = summarizeKnownAmount(previousRows, hasKnownPaymentAmount, resolveRowPaymentAmount)
  const currentSettlement = summarizeKnownAmount(currentRows, hasKnownExpectedSettlementAmount, resolveRowExpectedSettlementAmount)
  const previousSettlement = summarizeKnownAmount(previousRows, hasKnownExpectedSettlementAmount, resolveRowExpectedSettlementAmount)
  const currentCommission = summarizeKnownAmount(currentRows, hasKnownCommissionAmount, resolveRowPaymentCommissionAmount)
  const previousCommission = summarizeKnownAmount(previousRows, hasKnownCommissionAmount, resolveRowPaymentCommissionAmount)

  return [
    {
      label: '결제 금액',
      currentValueLabel: formatOptionalCurrency(currentPayment),
      previousLabel: formatMonthLabel(previousComparisonMonthToken.value),
      previousValueLabel: formatOptionalCurrency(previousPayment),
      changeLabel: formatRateChange(computeRateChange(currentPayment, previousPayment)),
      changeClass: comparisonChangeClass(computeRateChange(currentPayment, previousPayment)),
    },
    {
      label: '정산 예정',
      currentValueLabel: formatOptionalCurrency(currentSettlement),
      previousLabel: formatMonthLabel(previousComparisonMonthToken.value),
      previousValueLabel: formatOptionalCurrency(previousSettlement),
      changeLabel: formatRateChange(computeRateChange(currentSettlement, previousSettlement)),
      changeClass: comparisonChangeClass(computeRateChange(currentSettlement, previousSettlement)),
    },
    {
      label: '총 수수료',
      currentValueLabel: formatOptionalCurrency(currentCommission),
      previousLabel: formatMonthLabel(previousComparisonMonthToken.value),
      previousValueLabel: formatOptionalCurrency(previousCommission),
      changeLabel: formatRateChange(computeRateChange(currentCommission, previousCommission)),
      changeClass: comparisonChangeClass(computeRateChange(currentCommission, previousCommission)),
    },
  ]
})

// 판매량 차트 제목/범위 라벨
const dailySalesTitle = computed(() => {
  if (selectedMonth.value === 'all') return '월별 정산 예정 추이'
  return '일자별 정산 예정 추이'
})

const dailySalesRangeLabel = computed(() => {
  if (selectedMonth.value === 'all') {
    if (dailySalesLabels.value.length === 0) return '최근 6개월'
    if (dailySalesLabels.value.length === 1) return dailySalesLabels.value[0]
    return `${dailySalesLabels.value[0]} ~ ${dailySalesLabels.value[dailySalesLabels.value.length - 1]}`
  }
  return `${selectedPeriodLabel.value} 기준`
})

const visibleChurnData = computed(() => {
  if (!hasExpectedConsumptionConfig.value) return []
  return churnData.value.slice(0, 5)
})

// 소비주기 설정이 없는 상품만 있는 경우,
// 이탈 위험 관련 계산은 의미가 없으므로 항상 비워둔다.
function resetDashboardChurnState() {
  currentMetrics.value = {
    ...currentMetrics.value,
    repeatCustomerRate: 0,
    churnCount: 0,
  }
  churnData.value = []
}

const effectiveChurnCount = computed(() => {
  return hasExpectedConsumptionConfig.value ? currentMetrics.value.churnCount : 0
})

const churnCountLabel = computed(() => {
  return `${effectiveChurnCount.value}명`
})

// KPI 카드 클릭 시 현재 월/주차 상태를 유지한 채 고객현황으로 넘긴다.
function navigateToCustomers(query: Record<string, string> = {}) {
  const base: Record<string, string> = selectedMonth.value !== 'all'
    ? { month: selectedMonth.value }
    : {}
  const withMonth = { ...base, ...query }
  router.push({ path: '/customers', query: withMonth })
}

function reportSectionLink(path: string) {
  const query: Record<string, string> = selectedMonth.value !== 'all'
    ? { month: selectedMonth.value }
    : {}
  return { path, query }
}

function resetTrendDrilldown() {
  trendDrillMonth.value = null
  trendDrillWeek.value = ''
}

function clearTrendWeek() {
  trendDrillWeek.value = ''
}

function stepBackTrendDrilldown() {
  if (trendDrillWeek.value) {
    trendDrillWeek.value = ''
    return
  }
  trendDrillMonth.value = null
}

// 판매량 차트의 특정 월/일 막대를 눌렀을 때 그 구간 고객 목록으로 이동한다.
function navigateToCustomersBySalesKey(key: string) {
  if (!key) return
  if (/^\d{4}-\d{2}$/.test(key)) {
    router.push({ path: '/customers', query: { month: key } })
    return
  }
  navigateToCustomers({ orderDate: key })
}

// 한글 단계명을 고객현황 쿼리 파라미터 값으로 변환
// 문자열 날짜 -> Date 변환
// 실패 시에도 비교 함수가 깨지지 않도록 안전한 기본값을 리턴한다.
function parseOrderDate(value: string): Date {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? new Date('1970-01-01') : d
}

function parseNullableAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed)
}

function formatOptionalCurrency(value: number | null): string {
  return value === null ? '—' : formatCurrency(value)
}

function hasKnownPaymentAmount(row: Pick<PurchaseRow, 'payment_amount'>): boolean {
  return row.payment_amount !== null
}

function hasKnownExpectedSettlementAmount(row: Pick<PurchaseRow, 'expected_settlement_amount'>): boolean {
  return row.expected_settlement_amount !== null
}

function hasKnownCommissionAmount(row: Pick<PurchaseRow, 'payment_commission' | 'sale_commission'>): boolean {
  return row.payment_commission !== null || row.sale_commission !== null
}

function summarizeKnownAmount<T>(rows: T[], hasKnown: (row: T) => boolean, resolveValue: (row: T) => number): number | null {
  const knownRows = rows.filter(hasKnown)
  if (knownRows.length === 0) return null
  return knownRows.reduce((sum, row) => sum + resolveValue(row), 0)
}

function computeRateChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

function formatRateChange(change: number | null): string {
  if (change === null) return '비교 없음'
  if (change > 0) return `+${change}%`
  return `${change}%`
}

function comparisonChangeClass(change: number | null): string {
  if (change === null || change === 0) return 'is-neutral'
  return change > 0 ? 'is-positive' : 'is-negative'
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

// 상품명/옵션/검색어 비교 시 쓰는 공통 정규화
function normalizeForMatch(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '')
}

// 옵션 정보는 빈 값 대신 '-'로 통일해서 화면과 그룹핑 기준을 맞춘다.
function normalizeOptionInfo(value: string): string {
  return String(value || '').trim() || '-'
}

// 채널/엑셀마다 조금씩 다르게 들어오는 상품명을
// 백오피스 안에서는 최대한 하나의 canonical 이름으로 맞춘다.
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

// DB 문자열을 안전한 펫 타입 코드로 변환
function sanitizePetType(value: unknown): ProductMeta['pet_type'] {
  const type = String(value || '').toUpperCase()
  if (type === 'DOG') return 'DOG'
  if (type === 'CAT') return 'CAT'
  if (type === 'BOTH' || type === 'ALL') return 'BOTH'
  return 'BOTH'
}

// 단계 코드를 한글 라벨로 변환
function stageLabelByCode(code: number | null | undefined): string {
  return productStageLabel(code)
}

// 펫 타입 코드를 화면 라벨로 변환
function petLabel(type: ProductMeta['pet_type']): string {
  if (type === 'DOG') return '강아지'
  if (type === 'CAT') return '고양이'
  return '모두'
}

// 상품 메타가 비어 있을 때 상품명 자체에서 강아지/고양이 여부를 추론한다.
function inferPetTypeFromName(productName: string): ProductMeta['pet_type'] {
  const normalized = normalizeForMatch(productName)
  const hasDog = normalized.includes('강아지') || normalized.includes('강견') || normalized.includes('견')
  const hasCat = normalized.includes('고양이') || normalized.includes('묘') || normalized.includes('냥')
  if (hasDog && hasCat) return 'BOTH'
  if (hasDog) return 'DOG'
  if (hasCat) return 'CAT'
  return 'BOTH'
}

// 한 고객의 여러 주문을 묶는 기준 키
function customerGroupKey(row: PurchaseRow): string {
  return String(row.customer_key || '').trim() || `${String(row.buyer_id || '').trim()}_${String(row.buyer_name || '').trim()}`
}

// 주문일을 YYYY-MM-DD 비교용 키로 자른다.
function purchaseDateKey(row: Pick<PurchaseRow, 'order_date'>): string {
  return String(row.order_date || '').slice(0, 10)
}

// 고객이 산 상품들을 보고 대표 펫 타입을 추론한다.
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

// 고객 성장 단계는 "구매가 몇 개월에 걸쳐 이어졌는지"를 기준으로 계산한다.
function deriveCustomerStage(rows: PurchaseRow[]): CustomerAgg['stage'] {
  const dates = [...new Set(rows.map((row) => purchaseDateKey(row)).filter(Boolean))].sort()
  if (!dates.length) return 'Other'
  return computeCustomerStage(countDistinctPurchaseMonths(dates))
}

// 같은 상품 메타가 여러 경로로 합쳐질 때 펫 타입 충돌을 해결한다.
function mergePetType(prev: ProductMeta['pet_type'] | undefined, next: ProductMeta['pet_type']): ProductMeta['pet_type'] {
  if (!prev) return next
  if (prev === next) return prev
  return 'BOTH'
}

// 이름 기준 lookup을 만들 때 stage / expected_consumption_days도 같이 보존한다.
function mergeProductMeta(prev: ProductMeta | undefined, next: ProductMeta): ProductMeta {
  return {
    pet_type: mergePetType(prev?.pet_type, next.pet_type),
    stage: Math.max(prev?.stage || 0, next.stage || 0) || null,
    expected_consumption_days: Math.max(prev?.expected_consumption_days || 0, next.expected_consumption_days || 0) || null,
  }
}

// 이탈 계산용 expected_consumption_days를
// product_id -> 정규화 상품명 순서로 찾는다.
function resolveExpectedConsumptionDays(row: Pick<PurchaseRow, 'product_id' | 'product_name'>): number | null {
  const idKey = String(row.product_id || '').trim()
  const metaById = idKey ? productMetaById.value[idKey] : null
  if (metaById?.expected_consumption_days) return metaById.expected_consumption_days

  const nameKey = normalizeForMatch(normalizeMissionProductName(row.product_name || ''))
  const metaByName = nameKey ? productMetaByName.value[nameKey] : null
  return metaByName?.expected_consumption_days ?? null
}

// 화면에는 buyer_id 전부를 노출하지 않고 앞 4자리만 보여준다.
function maskBuyerId(raw: string): string {
  const value = String(raw || '').trim()
  if (!value) return '-'
  if (value.length <= 4) return value
  return `${value.slice(0, 4)}****`
}

// 차트 축/기간 라벨을 만들기 위한 날짜 보조 함수들
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

function formatDateToken(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function countOrdersInRange(rows: PurchaseRow[], from: Date, to: Date): number {
  const fromMs = from.getTime()
  const toMs = to.getTime()
  return rows.filter((row) => {
    const time = parseOrderDate(row.order_date).getTime()
    return time >= fromMs && time <= toMs
  }).length
}

function countDistinctCustomers(rows: PurchaseRow[]): number {
  return new Set(rows.map((row) => customerGroupKey(row))).size
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

// 주차 필터가 걸리면 그 주의 실제 날짜 목록을 만든다.
function buildWeekDateTokens(monthToken: string, weekCode: string): string[] {
  return weekDateTokensFromCode(monthToken, weekCode, 'inMonth')
}

// 특정 월의 1일~말일 날짜 목록을 만든다.
function buildMonthDateTokens(monthToken: string): string[] {
  const [year, month] = String(monthToken || '').split('-').map((part) => Number(part))
  if (!Number.isFinite(year) || !Number.isFinite(month)) return []
  const totalDays = new Date(year, month, 0).getDate()
  const tokens: string[] = []
  for (let day = 1; day <= totalDays; day += 1) {
    tokens.push(`${monthToken}-${String(day).padStart(2, '0')}`)
  }
  return tokens
}

// 메인 추이 차트 데이터 생성
// - 기본: 월별 결제 금액
// - 월 클릭 후: 주차별 결제 금액
// - 주차 클릭 후: 일별 결제 금액
function applyTrendSeries(allRows: PurchaseRow[]) {
  const realRows = allRows.filter((row) => !row.is_fake && !row.needs_review && !!row.filter_ver)

  if (!trendDrillMonth.value) {
    const monthTokens = buildTrendMonths('all', realRows)
    const amountMap = new Map<string, number>(monthTokens.map((token) => [token, 0]))
    for (const row of realRows) {
      const monthToken = String(row.target_month || '')
      if (amountMap.has(monthToken)) {
        amountMap.set(monthToken, (amountMap.get(monthToken) || 0) + resolveRowPaymentAmount(row))
      }
    }
    trendClickKeys.value = monthTokens
    trendLabels.value = monthTokens.map((token) => formatMonthLabel(token))
    trendValues.value = monthTokens.map((token) => amountMap.get(token) || 0)
    trendGrowthRates.value = computeTrendGrowthRates(trendValues.value)
    return
  }

  const monthRows = realRows.filter((row) => row.target_month === trendDrillMonth.value)

  if (trendDrillWeek.value) {
    const dateTokens = buildWeekDateTokens(trendDrillMonth.value, trendDrillWeek.value)
    const amountMap = new Map<string, number>(dateTokens.map((token) => [token, 0]))
    for (const row of monthRows) {
      const dateToken = String(row.order_date || '').slice(0, 10)
      if (amountMap.has(dateToken)) {
        amountMap.set(dateToken, (amountMap.get(dateToken) || 0) + resolveRowPaymentAmount(row))
      }
    }
    trendClickKeys.value = dateTokens
    trendLabels.value = dateTokens.map((token) => formatDayLabel(token))
    trendValues.value = dateTokens.map((token) => amountMap.get(token) || 0)
    trendGrowthRates.value = computeTrendGrowthRates(trendValues.value)
    return
  }

  const weekOptions = buildWeekOptions(trendDrillMonth.value)
  const amountMap = new Map<string, number>(weekOptions.map((option) => [option.value, 0]))
  for (const row of monthRows) {
    const weekCode = weekCodeFromDate(row.order_date, trendDrillMonth.value)
    if (amountMap.has(weekCode)) {
      amountMap.set(weekCode, (amountMap.get(weekCode) || 0) + resolveRowPaymentAmount(row))
    }
  }
  trendClickKeys.value = weekOptions.map((option) => option.value)
  trendLabels.value = weekOptions.map((option) => option.label.split(' ')[0])
  trendValues.value = weekOptions.map((option) => amountMap.get(option.value) || 0)
  trendGrowthRates.value = computeTrendGrowthRates(trendValues.value)
}

// 정산 예정 차트 데이터 생성
function applyDailySalesSeries(scopeRows: PurchaseRow[], monthSnapshot: string) {
  const realRows = scopeRows.filter((row) => !row.is_fake && !row.needs_review && !!row.filter_ver)

  if (monthSnapshot === 'all') {
    const monthTokens = buildTrendMonths(monthSnapshot, realRows)
    const amountMap = new Map<string, number>(monthTokens.map((token) => [token, 0]))
    for (const row of realRows) {
      const monthToken = String(row.target_month || '')
      if (!amountMap.has(monthToken)) continue
      amountMap.set(monthToken, (amountMap.get(monthToken) || 0) + resolveRowExpectedSettlementAmount(row))
    }
    dailySalesKeys.value = monthTokens
    dailySalesLabels.value = monthTokens.map((token) => formatMonthLabel(token))
    dailySalesValues.value = monthTokens.map((token) => amountMap.get(token) || 0)
    return
  }

  const dateTokens = buildMonthDateTokens(monthSnapshot)
  const amountMap = new Map<string, number>(dateTokens.map((token) => [token, 0]))
  for (const row of realRows) {
    const dateToken = String(row.order_date || '').slice(0, 10)
    if (!amountMap.has(dateToken)) continue
    amountMap.set(dateToken, (amountMap.get(dateToken) || 0) + resolveRowExpectedSettlementAmount(row))
  }
  dailySalesKeys.value = dateTokens
  dailySalesLabels.value = dateTokens.map((token) => formatDayLabel(token))
  dailySalesValues.value = dateTokens.map((token) => amountMap.get(token) || 0)
}

// products 테이블에서 분석에 필요한 최소 메타를 읽어 lookup으로 정리한다.
async function loadProductMeta() {
  const { data, error } = await supabase
    .from('products')
    .select('product_id, product_name, pet_type, stage, expected_consumption_days')
    .is('deleted_at', null)

  if (error) {
    productMetaById.value = {}
    productMetaByName.value = {}
    hasExpectedConsumptionConfig.value = false
    throw error
  }

  const byId: Record<string, ProductMeta> = {}
  const byName: Record<string, ProductMeta> = {}
  let hasConfiguredExpectedConsumptionDays = false
  for (const row of (data || []) as any[]) {
    const petType = sanitizePetType(row.pet_type)
    const stage = Number.isFinite(Number(row.stage)) ? Number(row.stage) : null
    const expectedConsumptionDays = normalizeExpectedConsumptionDays(row.expected_consumption_days)
    if (expectedConsumptionDays !== null) hasConfiguredExpectedConsumptionDays = true
    const meta = { pet_type: petType, stage, expected_consumption_days: expectedConsumptionDays }

    const productId = String(row.product_id || '').trim()
    if (productId) byId[productId] = meta

    const rawName = String(row.product_name || '').trim()
    const canonicalName = normalizeMissionProductName(rawName)
    const normalizedRaw = normalizeForMatch(rawName)
    const normalizedCanonical = normalizeForMatch(canonicalName)
    if (normalizedRaw) byName[normalizedRaw] = mergeProductMeta(byName[normalizedRaw], meta)
    if (normalizedCanonical) byName[normalizedCanonical] = mergeProductMeta(byName[normalizedCanonical], meta)
  }

  productMetaById.value = byId
  productMetaByName.value = byName
  hasExpectedConsumptionConfig.value = hasConfiguredExpectedConsumptionDays
}

// 요약 화면이 읽는 원본 테이블은 purchases 하나다.
// 다만 filter_ver가 찍힌 주문만 읽어 "분석 완료된 주문"만 사용한다.
async function fetchPurchases(): Promise<PurchaseRow[]> {
  const rows: PurchaseRow[] = []
  const PAGE_SIZE = 1000
  const includeSourceColumns = await supportsPurchaseSourceColumns(supabase)
  const includeAmountColumns = await supportsPurchaseAmountColumns(supabase)
  const baseColumns = 'purchase_id, customer_key, buyer_name, buyer_id, product_id, product_name, option_info, quantity, order_date, target_month, is_fake, needs_review, filter_ver'
  const selectColumns = purchaseAmountSelectColumns(
    purchaseSelectColumns(baseColumns, includeSourceColumns),
    includeAmountColumns,
  )

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('purchases')
      .select(selectColumns)
      .not('filter_ver', 'is', null)
      .order('order_date', { ascending: false })
      .order('purchase_id', { ascending: false })
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
      payment_amount: includeAmountColumns ? parseNullableAmount(row.payment_amount) : null,
      order_discount_amount: includeAmountColumns ? parseNullableAmount(row.order_discount_amount) : null,
      delivery_fee_amount: includeAmountColumns ? parseNullableAmount(row.delivery_fee_amount) : null,
      delivery_discount_amount: includeAmountColumns ? parseNullableAmount(row.delivery_discount_amount) : null,
      expected_settlement_amount: includeAmountColumns ? parseNullableAmount(row.expected_settlement_amount) : null,
      payment_commission: includeAmountColumns ? parseNullableAmount(row.payment_commission) : null,
      sale_commission: includeAmountColumns ? parseNullableAmount(row.sale_commission) : null,
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

// dashboard의 핵심 집계 함수
// 한 번 읽은 purchases를 가지고:
// - KPI
// - 오늘/주/월 요약
// - 펫 타입 분포
// - 인기 상품
// - 고객 성장 단계
// - 이탈 위험 고객
// 까지 전부 다시 계산한다.
function applyDashboardMetrics(scopeRows: PurchaseRow[], allRows: PurchaseRow[]) {
  const filteredRows = allRows.filter((row) => !!row.filter_ver)
  const realRows = scopeRows.filter((row) => !row.is_fake && !row.needs_review && !!row.filter_ver)
  const allRealRows = filteredRows.filter((row) => !row.is_fake && !row.needs_review && !!row.filter_ver)
  const sumPaymentAmount = (rows: PurchaseRow[]) => rows.reduce((sum, row) => sum + resolveRowPaymentAmount(row), 0)
  const sumExpectedSettlementAmount = (rows: PurchaseRow[]) => rows.reduce((sum, row) => sum + resolveRowExpectedSettlementAmount(row), 0)
  const sumPaymentCommissionAmount = (rows: PurchaseRow[]) => rows.reduce((sum, row) => sum + resolveRowPaymentCommissionAmount(row), 0)

  const groupedAll = new Map<string, PurchaseRow[]>()
  for (const row of allRealRows) {
    const key = customerGroupKey(row)
    if (!groupedAll.has(key)) groupedAll.set(key, [])
    groupedAll.get(key)!.push(row)
  }

  const grouped = new Map<string, PurchaseRow[]>()
  for (const row of realRows) {
    const key = customerGroupKey(row)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(row)
  }

  const customerAggs: CustomerAgg[] = []
  for (const [customerKey, customerRows] of grouped.entries()) {
    const historyRows = groupedAll.get(customerKey) || customerRows
    const sorted = [...customerRows].sort((a, b) => parseOrderDate(b.order_date).getTime() - parseOrderDate(a.order_date).getTime())
    const latest = sorted[0]
    if (!latest) continue
    const purchaseCount = new Set(customerRows.map((row) => purchaseDateKey(row)).filter(Boolean)).size
    if (purchaseCount <= 0) continue
    const churn = computeChurnRisk(historyRows.map((row) => ({
      orderDate: row.order_date,
      expectedConsumptionDays: hasExpectedConsumptionConfig.value ? resolveExpectedConsumptionDays(row) : null,
    })))
    const lastOrder = churn.lastOrderDate || String(latest.order_date || '').slice(0, 10)
    customerAggs.push({
      name: latest.buyer_name || '-',
      id: latest.buyer_id || '-',
      petType: derivePetType(historyRows),
      stage: deriveCustomerStage(historyRows),
      purchaseCount,
      lastOrder,
      daysSinceLastOrder: churn.daysSinceLastOrder,
      churnRisk: churn.churnRisk,
      churnExpectedConsumptionDays: churn.expectedConsumptionDays,
      churnOverdueDays: churn.overdueDays,
    })
  }

  // 재구매 고객: 서로 다른 주문일 기준 2회 이상 구매한 고객
  const repeatCustomers = customerAggs.filter((row) => row.purchaseCount >= 2).length
  const churnCustomers = customerAggs.filter((row) => row.churnRisk)

  currentMetrics.value = {
    paymentAmount: sumPaymentAmount(realRows),
    expectedSettlementAmount: sumExpectedSettlementAmount(realRows),
    paymentCommissionAmount: sumPaymentCommissionAmount(realRows),
    realCustomers: customerAggs.length,
    realPurchase: realRows.length,
    repeatCustomers,
    averageOrderValue: realRows.length > 0 ? Math.round(sumPaymentAmount(realRows) / realRows.length) : 0,
    repeatCustomerRate: customerAggs.length > 0 ? Math.round((repeatCustomers / customerAggs.length) * 100) : 0,
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
    신규: 0,
    성장: 0,
    단골: 0,
    핵심: 0,
  }
  for (const customer of customerAggs) {
    const stageName = customerStageLabel(customer.stage)
    if (stageName in stageCountMap) {
      stageCountMap[stageName as keyof typeof stageCountMap] += 1
    }
  }
  const stageMax = Math.max(stageCountMap.신규, stageCountMap.성장, stageCountMap.단골, stageCountMap.핵심, 1)
  stageData.value = [
    { name: '신규', count: stageCountMap.신규, percent: Math.round((stageCountMap.신규 / stageMax) * 100) },
    { name: '성장', count: stageCountMap.성장, percent: Math.round((stageCountMap.성장 / stageMax) * 100) },
    { name: '단골', count: stageCountMap.단골, percent: Math.round((stageCountMap.단골 / stageMax) * 100) },
    { name: '핵심', count: stageCountMap.핵심, percent: Math.round((stageCountMap.핵심 / stageMax) * 100) },
  ]

  const productMap = new Map<string, {
    name: string
    optionInfo: string
    count: number
    amount: number
    petType: ProductMeta['pet_type']
    stage: number | null
  }>()
  for (const row of realRows) {
    const baseKey = String(row.product_id || '').trim() || normalizeForMatch(row.product_name || '')
    if (!baseKey) continue
    const quantityResult = computePurchaseQuantity(purchaseQuantityInput(row))
    const totalCount = Math.max(quantityResult.totalCount, 1)

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
          amount: 0,
          petType: nextPetType,
          stage: nextStage,
        })
      }
      productMap.get(key)!.count += part.count
      productMap.get(key)!.amount += (resolveRowPaymentAmount(row) * part.count) / totalCount
    }
  }

  const top = Array.from(productMap.values())
    .sort((a, b) => {
      const byAmount = b.amount - a.amount
      if (byAmount !== 0) return byAmount
      return b.count - a.count
    })
    .slice(0, 5)
  const topMax = Math.max(top[0]?.amount || 1, 1)
  topProducts.value = top.map((item) => ({
    name: item.name,
    optionInfo: item.optionInfo,
    pet: petLabel(item.petType),
    stage: stageLabelByCode(item.stage),
    count: item.count,
    amount: item.amount,
    percent: Math.round((item.amount / topMax) * 100),
  }))

  churnData.value = churnCustomers
    .sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder)
    .map((item) => ({
      name: item.name,
      id: maskBuyerId(item.id),
      days: item.daysSinceLastOrder,
      expectedDays: item.churnExpectedConsumptionDays || 0,
      overdueDays: item.churnOverdueDays || 0,
      pet: petLabel(item.petType),
      lastOrder: item.lastOrder,
    }))
}

// 실제 데이터 로딩 시작점
// 1) products 메타 조회
// 2) purchases 조회
// 3) 원본 row 보관
async function fetchDashboardData() {
  const requestSeq = ++dashboardFetchSeq.value
  if (!profileLoaded.value) return
  dashboardLoading.value = true
  try {
    await loadProductMeta()

    const sourceRows = await fetchPurchases()

    if (requestSeq !== dashboardFetchSeq.value) return
    dashboardRows.value = sourceRows
  } catch (error: any) {
    console.error('Failed to fetch dashboard data:', error)
    if (requestSeq === dashboardFetchSeq.value) {
      dashboardRows.value = []
      resetDashboardChurnState()
    }
    toast.error(`대시보드 데이터를 불러오지 못했습니다: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    if (requestSeq === dashboardFetchSeq.value) {
      dashboardLoading.value = false
    }
  }
}

// 현재 선택 월/주차 기준으로 dashboardRows를 잘라
// KPI/차트용 집계 함수에 다시 흘려보낸다.
function applyDashboardScope() {
  const monthSnapshot = selectedMonth.value
  const monthRows = monthSnapshot === 'all'
    ? dashboardRows.value
    : dashboardRows.value.filter((row) => row.target_month === monthSnapshot)
  const scopeRows = monthRows

  applyDashboardMetrics(scopeRows, dashboardRows.value)
  applyTrendSeries(dashboardRows.value)
  applyDailySalesSeries(scopeRows, monthSnapshot)
}

// 실구매 고객 펫 타입 도넛 차트
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
      labels: trendLabels.value,
      datasets: [
        {
          label: '결제 금액',
          data: trendValues.value,
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: '#2563EB',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: trendDrillWeek.value ? 3 : 5,
          pointHoverRadius: trendDrillWeek.value ? 5 : 7,
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
      onClick: (_, elements) => {
        const first = elements[0]
        if (!first) return
        const key = trendClickKeys.value[first.index]
        if (!key) return

        if (!trendDrillMonth.value) {
          trendDrillMonth.value = key
          trendDrillWeek.value = ''
          return
        }

        if (!trendDrillWeek.value) {
          trendDrillWeek.value = key
        }
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

function renderDailySalesChart() {
  if (!dailySalesChartCanvas.value) return
  if (dailySalesChartInstance.value) {
    dailySalesChartInstance.value.destroy()
    dailySalesChartInstance.value = null
  }

  dailySalesChartInstance.value = new Chart(dailySalesChartCanvas.value, {
    type: 'bar',
    data: {
      labels: dailySalesLabels.value,
      datasets: [{
        data: dailySalesValues.value,
        backgroundColor: 'rgba(37, 99, 235, 0.84)',
        hoverBackgroundColor: '#2563EB',
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 32,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_, elements) => {
        const first = elements[0]
        if (!first) return
        const key = dailySalesKeys.value[first.index]
        if (!key) return
        navigateToCustomersBySalesKey(key)
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1E293B',
          titleFont: { size: 12 },
          bodyFont: { size: 13, weight: 'bold' as const },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => `정산 예정 ${formatCurrency(Number(ctx.parsed.y || 0))}`,
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

watch(
  () => [selectedMonth.value, profileLoaded.value, profileRevision.value],
  async ([month, loaded]) => {
    if (!month || !loaded) return
    await fetchDashboardData()
  },
  { immediate: true },
)

watch(
  () => [selectedMonth.value, dashboardRows.value, trendDrillMonth.value, trendDrillWeek.value],
  () => {
    applyDashboardScope()
  },
)

watch(
  () => hasExpectedConsumptionConfig.value,
  () => {
    if (!hasExpectedConsumptionConfig.value) {
      resetDashboardChurnState()
      applyDashboardScope()
    }
  },
  { immediate: true },
)

watch(
  () => [trendChartCanvas.value, trendLabels.value, trendValues.value, trendDrillMonth.value, trendDrillWeek.value],
  async ([canvas]) => {
    if (!canvas) return
    await nextTick()
    renderTrendChart()
  },
  { deep: true, flush: 'post' },
)

watch(
  () => [petChartCanvas.value, petData.value, dailySalesChartCanvas.value, dailySalesLabels.value, dailySalesValues.value],
  async () => {
    await nextTick()
    renderPetChart()
    renderDailySalesChart()
  },
  { deep: true, flush: 'post' },
)

onBeforeUnmount(() => {
  if (petChartInstance.value) petChartInstance.value.destroy()
  if (trendChartInstance.value) trendChartInstance.value.destroy()
  if (dailySalesChartInstance.value) dailySalesChartInstance.value.destroy()
})
</script>

<style scoped>
.dashboard {
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
  justify-content: flex-end;
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

.card-header-stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.dashboard-card-head-between {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.trend-card-copy,
.trend-card-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.trend-card-actions {
  align-items: flex-end;
}

.trend-drill-path {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.trend-drill-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: #F8FAFD;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.trend-drill-pill.active {
  border-color: rgba(37, 99, 235, 0.18);
  background: #FFFFFF;
  color: var(--color-primary);
}

.trend-card-helper {
  font-size: 0.82rem;
  color: var(--color-text-muted);
  max-width: 460px;
}

.section-caption {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.84rem;
  color: var(--color-text-muted);
}

.period-compare-card {
  padding: 0;
  border: 1px solid rgba(229, 235, 242, 0.96);
  background: #FFFFFF;
  box-shadow: none;
  overflow: hidden;
}

.period-compare-card .card-header {
  margin-bottom: 0;
  padding: 24px 24px 16px;
}

.period-compare-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.period-compare-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px 24px;
}

.period-compare-item + .period-compare-item {
  border-left: 1px solid rgba(148, 163, 184, 0.12);
}

.period-compare-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.period-compare-value {
  font-size: 1.95rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--color-text);
}

.period-compare-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.period-compare-change {
  font-weight: 700;
}

.period-compare-change.is-positive {
  color: #16A34A;
}

.period-compare-change.is-negative {
  color: #DC2626;
}

.period-compare-change.is-neutral {
  color: var(--color-text-secondary);
}

.summary-note {
  margin-top: calc(var(--space-md) * -1);
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.dashboard-card-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.charts-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.9fr);
  gap: 16px;
}

.bottom-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(320px, 0.88fr);
  gap: 16px;
}

.single-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-lg);
}

.empty-inline {
  padding: var(--space-lg) 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.card-toolbar {
  justify-content: flex-start;
}

.trend-chart {
  padding-top: var(--space-md);
}

.signal-card {
  display: flex;
  flex-direction: column;
  background: #FFFFFF;
}

.signal-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.signal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: 15px 0;
  border-radius: 0;
  background: transparent;
  border-bottom: 1px solid rgba(229, 235, 242, 0.96);
}

.signal-row--primary {
  background: transparent;
}

.signal-copy {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.signal-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.signal-value {
  font-size: 1.16rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--color-text);
}

.signal-change,
.signal-support {
  flex-shrink: 0;
  font-size: 0.82rem;
  font-weight: 700;
}

.signal-change.is-positive {
  color: var(--color-success);
}

.signal-change.is-negative {
  color: var(--color-danger);
}

.signal-change.is-neutral,
.signal-support {
  color: var(--color-text-secondary);
}

.signal-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 16px;
}

.trend-chart-area {
  height: 228px;
}

.trend-chart-area-with-growth {
  position: relative;
}

.trend-inline-markers {
  position: absolute;
  inset: auto 0 34px;
  pointer-events: none;
}

.trend-inline-marker {
  position: absolute;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 62px;
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  background: rgba(100, 116, 139, 0.12);
  color: var(--color-text);
  box-shadow: none;
}

.trend-inline-marker.is-success {
  background: rgba(22, 163, 74, 0.12);
  color: #16A34A;
}

.trend-inline-marker.is-danger {
  background: rgba(220, 38, 38, 0.12);
  color: #DC2626;
}

.trend-inline-marker.is-neutral {
  background: rgba(100, 116, 139, 0.14);
  color: var(--color-text);
}

.pet-chart {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-lg);
  min-height: 100%;
}

.pet-donut {
  width: min(100%, clamp(180px, 26vw, 260px));
  aspect-ratio: 1;
  flex-shrink: 0;
  margin: 0 auto;
}

.pet-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-md) var(--space-lg);
  width: 100%;
}

.pet-legend-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  min-width: 112px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 7px;
}

.legend-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.legend-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.legend-stats {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.legend-count {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}

.legend-percent {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.top-products {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.top-product-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 14px 0;
  border-bottom: 1px solid var(--color-border-light);
  border-radius: 0;
  background: transparent;
  transition: none;
}

.top-product-item:hover {
  transform: none;
  box-shadow: none;
  border-color: var(--color-border-light);
}

.top-product-rank {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
  background: var(--color-bg);
  color: var(--color-text-muted);
}

.rank-1 {
  background: #F2F4F8;
  color: #2563EB;
}

.rank-2 {
  background: #F2F4F8;
  color: #4E5968;
}

.rank-3 {
  background: #F2F4F8;
  color: #4E5968;
}

.top-product-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.top-product-name {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-product-meta {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.top-product-stats {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-shrink: 0;
}

.top-product-count {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
  min-width: 82px;
  text-align: right;
}

.top-product-sub {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  min-width: 40px;
  text-align: right;
}

.top-product-bar-wrap {
  width: 88px;
  height: 8px;
  background: #EEF3F8;
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
  height: 196px;
  padding-top: var(--space-lg);
  margin-bottom: var(--space-md);
}

.stage-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
}

.stage-bar-outer {
  width: 46px;
  height: 132px;
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
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.stage-name {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.stage-detail-link {
  width: 100%;
  justify-content: center;
  margin-top: 0;
}

.churn-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.churn-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border: 1px solid var(--color-border-light);
  border-radius: 14px;
  background: #FFFFFF;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
}

.churn-item:hover {
  transform: none;
  box-shadow: none;
  border-color: rgba(239, 68, 68, 0.12);
}

.churn-info {
  display: flex;
  flex-direction: column;
}

.churn-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
}

.churn-id {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.churn-date {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.churn-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.churn-days {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-danger);
}

@media (max-width: 1280px) {
  .period-compare-grid {
    grid-template-columns: 1fr;
  }

  .period-compare-item + .period-compare-item {
    border-left: none;
    border-top: 1px solid rgba(148, 163, 184, 0.12);
  }

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
    height: 196px;
  }

  .trend-inline-markers {
    bottom: 28px;
  }
}

@media (max-width: 768px) {
  .dashboard {
    gap: var(--space-lg);
  }

  .page-header {
    padding: 0;
  }

  .page-header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .period-compare-foot {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-select {
    width: 100%;
  }

  .trend-card-actions {
    align-items: flex-start;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
    gap: var(--space-md);
  }

  .signal-row,
  .churn-item {
    align-items: flex-start;
    flex-direction: column;
  }

  .signal-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .pet-donut {
    width: min(100%, 196px);
  }

  .legend-label {
    width: auto;
    min-width: 48px;
  }

  .trend-inline-markers {
    display: none;
  }

  .top-product-item {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .top-product-stats {
    width: 100%;
    justify-content: space-between;
  }

  .top-product-bar-wrap {
    width: min(132px, 44vw);
  }

  .stage-bars {
    height: 164px;
    padding-top: var(--space-md);
  }

  .stage-bar-outer {
    width: 38px;
    height: 108px;
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
