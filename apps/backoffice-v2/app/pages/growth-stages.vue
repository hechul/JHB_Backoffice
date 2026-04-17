<template>
  <div class="growth-page">
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">재구매 흐름</h1>
        <span class="page-caption">{{ selectedPeriodLabel }} 기준 첫 구매에서 재구매로 넘어가는 흐름</span>
      </div>
    </div>
    <div v-if="loading" class="card growth-loading">고객 성장 단계 데이터를 불러오는 중입니다.</div>

    <template v-else>
      <div class="growth-summary-strip">
        <div class="growth-summary-chip">
          <span>2회차 전환율</span>
          <strong>{{ repurchaseSummary.secondPurchaseRate }}%</strong>
          <small>{{ repurchaseSummary.secondPurchaseCount.toLocaleString() }}명 재구매</small>
        </div>
        <div class="growth-summary-chip">
          <span>3회차 전환율</span>
          <strong>{{ repurchaseSummary.thirdPurchaseRate }}%</strong>
          <small>{{ repurchaseSummary.thirdPurchaseCount.toLocaleString() }}명 유지</small>
        </div>
        <div class="growth-summary-chip">
          <span>평균 2회차 도달</span>
          <strong>{{ repurchaseSummary.averageSecondPurchaseDays || 0 }}일</strong>
          <small>첫 구매 이후 재구매까지</small>
        </div>
      </div>

      <div class="card growth-funnel-card">
        <div class="card-header growth-card-header">
          <div>
            <h3 class="card-title">재구매 퍼널</h3>
            <span class="growth-card-caption">첫 구매 고객이 두 번째, 세 번째 구매로 얼마나 이어지는지 바로 볼 수 있습니다.</span>
          </div>
          <StatusBadge :label="`전체 ${insights.totalCustomers.toLocaleString()}명`" variant="neutral" />
        </div>
        <div class="growth-funnel">
          <button
            v-for="step in repurchaseFunnelSteps"
            :key="step.key"
            type="button"
            class="growth-funnel-step"
            @click="navigateToPurchaseCount(step.purchaseCount)"
          >
            <div class="growth-funnel-top">
              <span class="growth-funnel-label">{{ step.label }}</span>
              <strong class="growth-funnel-rate">{{ step.rate }}%</strong>
            </div>
            <strong class="growth-funnel-count">{{ step.count.toLocaleString() }}명</strong>
            <div class="growth-funnel-track">
              <div class="growth-funnel-fill" :style="{ width: `${step.rate}%`, background: step.color }" />
            </div>
            <span class="growth-funnel-meta">{{ step.meta }}</span>
          </button>
        </div>
      </div>

      <div class="growth-overview-row">
        <div class="card growth-transition-card">
          <div class="card-header growth-card-header">
            <div>
              <h3 class="card-title">세부 전환률</h3>
              <span class="growth-card-caption">각 구매 단계에서 다음 단계로 얼마나 넘어가는지 정리했습니다.</span>
            </div>
          </div>
          <div class="growth-transition-layout">
            <div class="growth-transition-chart-shell">
              <canvas ref="transitionChartCanvas"></canvas>
            </div>
            <div class="transition-summary-grid">
              <div v-for="item in transitionSummaryRows" :key="item.key" class="transition-summary-item">
                <div class="transition-summary-top">
                  <span class="transition-summary-label">{{ item.label }}</span>
                  <strong class="transition-summary-count">{{ item.rate }}%</strong>
                </div>
                <div class="transition-summary-track">
                  <div class="transition-summary-fill" :style="{ width: `${item.rate}%`, background: item.color }" />
                </div>
                <div class="transition-summary-foot">
                  <span>{{ item.count.toLocaleString() }}명 전환</span>
                  <span>{{ item.meta }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card growth-chart-card">
          <div class="card-header growth-card-header">
            <div>
              <h3 class="card-title">현재 고객 분포</h3>
              <span class="growth-card-caption">지금 고객이 어느 단계에 가장 많이 머무는지 비중 순으로 보여줍니다.</span>
            </div>
          </div>
          <div class="distribution-list">
            <button
              v-for="row in distributionRows"
              :key="row.stage"
              type="button"
              class="distribution-row"
              @click="navigateToCustomers(row.stage)"
            >
              <div class="distribution-row-copy">
                <strong>{{ row.label }}</strong>
                <span>{{ row.count.toLocaleString() }}명</span>
              </div>
              <div class="distribution-row-track">
                <div class="distribution-row-fill" :style="{ width: `${row.ratio}%`, backgroundColor: stageColor(row.stage) }" />
              </div>
              <div class="distribution-row-right">
                <span>{{ row.ratio }}%</span>
                <MoveRight :size="14" :stroke-width="2" />
              </div>
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header growth-card-header compact">
          <h3 class="card-title">다음 구매 가능 고객</h3>
        </div>
        <div class="candidate-stage-grid">
          <div v-for="group in insights.candidates" :key="group.stage" class="candidate-stage-card">
            <div class="candidate-stage-head">
              <StatusBadge :label="group.label" :variant="badgeVariant(group.stage)" />
              <strong class="candidate-stage-count">{{ group.customers.length }}명</strong>
            </div>
            <div v-if="group.customers.length === 0" class="empty-inline">대상 고객이 없습니다.</div>
            <div v-else class="candidate-list">
              <div v-for="customer in group.customers.slice(0, 4)" :key="`${group.stage}-${customer.customerKey}`" class="candidate-row">
                <div class="candidate-row-left">
                  <span class="candidate-name">{{ customer.name }}</span>
                  <span class="candidate-id">{{ maskBuyerId(customer.id) }}</span>
                </div>
                <div class="candidate-row-right">
                  <span>{{ customer.pet }}</span>
                  <span>{{ customer.purchaseMonthCount }}개월</span>
                </div>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm action-link" @click="navigateToCustomers(group.stage)">
              관련 고객 전체 보기
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Chart, Tooltip, Legend, BarController, BarElement, CategoryScale, LinearScale } from 'chart.js'
import { MoveRight } from 'lucide-vue-next'
import { fetchGrowthInsights, growthStageBadgeVariant, type GrowthInsightsResult } from '~/composables/useGrowthInsights'
import { type CustomerStageCode } from '~/composables/useGrowthStage'

Chart.register(Tooltip, Legend, BarController, BarElement, CategoryScale, LinearScale)

interface EmptyInsights extends GrowthInsightsResult {}

const supabase = useSupabaseClient()
const toast = useToast()
const { selectedMonth, selectedPeriodLabel } = useAnalysisPeriod()
const { profileLoaded, profileRevision } = useCurrentUser()

const loading = ref(false)
const fetchSeq = ref(0)
const insights = ref<EmptyInsights>({
  summaries: [],
  transitions: [],
  recentTransitions: [],
  stageProducts: [],
  candidates: [],
  customers: [],
  totalCustomers: 0,
  realPurchases: 0,
})

const transitionChartCanvas = ref<HTMLCanvasElement | null>(null)

const transitionChartInstance = shallowRef<Chart | null>(null)

function badgeVariant(stage: CustomerStageCode) {
  return growthStageBadgeVariant(stage)
}

function stageColor(stage: CustomerStageCode) {
  if (stage === 'Entry') return '#94A3B8'
  if (stage === 'Growth') return '#2563EB'
  if (stage === 'Premium') return '#D97706'
  if (stage === 'Core') return '#16A34A'
  return '#94A3B8'
}

function maskBuyerId(raw: string): string {
  const value = String(raw || '').trim()
  if (!value) return '-'
  if (value.length <= 4) return value
  return `${value.slice(0, 4)}****`
}

const distributionRows = computed(() => insights.value.summaries)

const transitionRows = computed(() => {
  const summaryMap = new Map<CustomerStageCode, EmptyInsights['summaries'][number]>()
  for (const summary of insights.value.summaries) summaryMap.set(summary.stage, summary)
  return insights.value.transitions.map((item) => {
    const fromCount = summaryMap.get(item.fromStage)?.count || 0
    const rate = fromCount > 0 ? Math.round((item.count / fromCount) * 100) : 0
    return {
      ...item,
      rate,
    }
  })
})

const repurchaseSummary = computed(() => {
  const customers = insights.value.customers
  const totalCustomers = Math.max(customers.length, 1)
  const secondPurchaseCustomers = customers.filter((customer) => customer.purchaseCount >= 2)
  const thirdPurchaseCustomers = customers.filter((customer) => customer.purchaseCount >= 3)
  const secondPurchaseDayRows = customers
    .map((customer) => customer.daysToSecondPurchase)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  const averageSecondPurchaseDays = secondPurchaseDayRows.length > 0
    ? Math.round(secondPurchaseDayRows.reduce((sum, value) => sum + value, 0) / secondPurchaseDayRows.length)
    : 0

  return {
    secondPurchaseCount: secondPurchaseCustomers.length,
    thirdPurchaseCount: thirdPurchaseCustomers.length,
    secondPurchaseRate: Math.round((secondPurchaseCustomers.length / totalCustomers) * 100),
    thirdPurchaseRate: Math.round((thirdPurchaseCustomers.length / totalCustomers) * 100),
    averageSecondPurchaseDays,
  }
})

const repurchaseFunnelSteps = computed(() => {
  const totalCustomers = Math.max(insights.value.totalCustomers, 1)
  const secondBase = Math.max(repurchaseSummary.value.secondPurchaseCount, 1)
  const thirdBase = Math.max(repurchaseSummary.value.thirdPurchaseCount, 1)
  const fourthPurchaseCount = insights.value.customers.filter((customer) => customer.purchaseCount >= 4).length
  return [
    {
      key: 'first-purchase',
      label: '1회 구매',
      purchaseCount: 1,
      count: insights.value.totalCustomers,
      rate: insights.value.totalCustomers > 0 ? 100 : 0,
      meta: '기준 고객군',
      color: 'linear-gradient(90deg, #93C5FD 0%, #2563EB 100%)',
    },
    {
      key: 'second-purchase',
      label: '2회 구매',
      purchaseCount: 2,
      count: repurchaseSummary.value.secondPurchaseCount,
      rate: Math.round((repurchaseSummary.value.secondPurchaseCount / totalCustomers) * 100),
      meta: `전체 대비 ${repurchaseSummary.value.secondPurchaseRate}%`,
      color: 'linear-gradient(90deg, #60A5FA 0%, #2563EB 100%)',
    },
    {
      key: 'third-purchase',
      label: '3회 구매',
      purchaseCount: 3,
      count: repurchaseSummary.value.thirdPurchaseCount,
      rate: Math.round((repurchaseSummary.value.thirdPurchaseCount / totalCustomers) * 100),
      meta: `2회차 대비 ${Math.round((repurchaseSummary.value.thirdPurchaseCount / secondBase) * 100)}%`,
      color: 'linear-gradient(90deg, #4ADE80 0%, #16A34A 100%)',
    },
    {
      key: 'fourth-purchase',
      label: '4회 이상',
      purchaseCount: 4,
      count: fourthPurchaseCount,
      rate: Math.round((fourthPurchaseCount / totalCustomers) * 100),
      meta: `3회차 대비 ${Math.round((fourthPurchaseCount / thirdBase) * 100)}%`,
      color: 'linear-gradient(90deg, #FBBF24 0%, #D97706 100%)',
    },
  ]
})

const transitionChartRows = computed(() => {
  const secondBase = repurchaseSummary.value.secondPurchaseCount
  return [
    {
      key: 'repurchase-1-2',
      label: '1회 -> 2회',
      rate: repurchaseSummary.value.secondPurchaseRate,
      count: repurchaseSummary.value.secondPurchaseCount,
      color: '#2563EB',
    },
    {
      key: 'repurchase-2-3',
      label: '2회 -> 3회',
      rate: secondBase > 0 ? Math.round((repurchaseSummary.value.thirdPurchaseCount / secondBase) * 100) : 0,
      count: repurchaseSummary.value.thirdPurchaseCount,
      color: '#16A34A',
    },
    ...transitionRows.value.map((item) => ({
      key: item.key,
      label: item.label,
      rate: item.rate,
      count: item.count,
      color: stageColor(item.toStage),
    })),
  ]
})

const transitionSummaryRows = computed(() => {
  return transitionChartRows.value.slice(0, 4).map((item) => ({
    ...item,
    meta: item.key === 'repurchase-1-2'
      ? '첫 구매 고객 기준'
      : item.key === 'repurchase-2-3'
        ? '2회 구매 고객 기준'
        : '성장 단계 이동',
  }))
})

function navigateToCustomers(stage?: CustomerStageCode) {
  const query: Record<string, string> = {}
  if (selectedMonth.value !== 'all') query.month = selectedMonth.value
  if (stage) query.stage = stage
  navigateTo({ path: '/customers', query })
}

function navigateToPurchaseCount(minPurchaseCount: number) {
  const query: Record<string, string> = {}
  if (selectedMonth.value !== 'all') query.month = selectedMonth.value
  query.purchaseCount = String(minPurchaseCount)
  navigateTo({ path: '/customers', query })
}

function destroyCharts() {
  if (transitionChartInstance.value) {
    transitionChartInstance.value.destroy()
    transitionChartInstance.value = null
  }
}

function renderTransitionChart() {
  if (!transitionChartCanvas.value) return
  if (transitionChartInstance.value) {
    transitionChartInstance.value.destroy()
    transitionChartInstance.value = null
  }

  const rows = transitionChartRows.value
  const labels = rows.map((row) => row.label)
  const values = rows.map((row) => row.rate)
  const hasData = values.some((value) => value > 0)

  transitionChartInstance.value = new Chart(transitionChartCanvas.value, {
    type: 'bar',
    data: {
      labels: hasData ? labels : ['데이터 없음'],
      datasets: [{
        data: hasData ? values : [0],
        backgroundColor: hasData
          ? rows.map((row) => row.color)
          : ['#E5E7EB'],
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 18,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111827',
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (ctx) => {
              const row = rows[ctx.dataIndex]
              if (!row) return `${Number(ctx.parsed.x || 0)}%`
              return `${row.rate}% · ${row.count.toLocaleString()}명`
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          grid: {
            color: '#EEF2F7',
          },
          ticks: {
            font: { size: 11 },
            color: '#94A3B8',
            callback: (value) => `${value}%`,
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            font: { size: 11, weight: 700 as const },
            color: '#475569',
          },
        },
      },
    },
  })
}

async function loadInsights() {
  if (!profileLoaded.value) return
  const seq = ++fetchSeq.value
  loading.value = true
  try {
    const next = await fetchGrowthInsights(supabase, selectedMonth.value)
    if (seq !== fetchSeq.value) return
    insights.value = next
  } catch (error: any) {
    console.error('Failed to load growth insights:', error)
    toast.error(`고객 성장 단계 데이터를 불러오지 못했습니다: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    if (seq === fetchSeq.value) loading.value = false
  }
}

watch(
  () => [selectedMonth.value, profileLoaded.value, profileRevision.value],
  () => {
    loadInsights()
  },
  { immediate: true },
)

watch(
  () => [loading.value, transitionChartCanvas.value, insights.value.summaries, transitionRows.value, transitionChartRows.value],
  async ([isLoading, canvas]) => {
    if (isLoading || !canvas) return
    await nextTick()
    renderTransitionChart()
  },
  { deep: true, flush: 'post' },
)

onBeforeUnmount(() => {
  destroyCharts()
})
</script>

<style scoped>
.growth-page {
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

.growth-summary-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.growth-summary-chip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px 22px;
  border-radius: 18px;
  border: 1px solid rgba(229, 235, 242, 0.96);
  background: #FFFFFF;
  box-shadow: none;
}

.growth-summary-chip span {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.growth-summary-chip strong {
  font-size: 1.52rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--color-text);
}

.growth-summary-chip small {
  font-size: 0.82rem;
  color: var(--color-text-secondary);
}

.growth-funnel-card {
  border: 1px solid rgba(148, 163, 184, 0.10);
  background: #FFFFFF;
  box-shadow: none;
}

.growth-funnel {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.growth-funnel-step {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  padding: 22px;
  border-radius: 16px;
  background: #FFFFFF;
  border: 1px solid rgba(148, 163, 184, 0.10);
  text-align: left;
  transition: transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.growth-funnel-step:nth-child(1) {
  background: #FFFFFF;
}

.growth-funnel-step:nth-child(2) {
  background: #FFFFFF;
}

.growth-funnel-step:nth-child(3) {
  background: #FFFFFF;
}

.growth-funnel-step:hover {
  transform: none;
  border-color: rgba(37, 99, 235, 0.22);
  box-shadow: none;
}

.growth-funnel-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.growth-funnel-label {
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.growth-funnel-rate {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--color-text);
}

.growth-funnel-count {
  font-size: 1.8rem;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--color-text);
}

.growth-funnel-track {
  width: 100%;
  height: 12px;
  border-radius: 999px;
  background: #E9EEF5;
  overflow: hidden;
}

.growth-funnel-fill {
  height: 100%;
  border-radius: 999px;
}

.growth-funnel-meta {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.growth-loading {
  padding: 36px;
  text-align: center;
  color: var(--color-text-secondary);
}

.growth-card-caption {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.growth-summary-top,
.transition-summary-top,
.transition-summary-foot,
.stage-product-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.growth-summary-ratio {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.growth-summary-count {
  font-size: 2rem;
  line-height: 1;
  font-weight: 800;
  color: var(--color-text);
}

.growth-summary-meter,
.transition-summary-track {
  width: 100%;
  height: 8px;
  background: #eef2f7;
  border-radius: 999px;
  overflow: hidden;
}

.growth-summary-meter-fill,
.transition-summary-fill {
  height: 100%;
  border-radius: 999px;
}

.fill-entry {
  background: #94a3b8;
}

.fill-growth,
.transition-summary-fill {
  background: #2563eb;
}

.fill-core {
  background: #16a34a;
}

.fill-premium {
  background: #d97706;
}

.growth-summary-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: 10px 12px;
  margin: 0 -4px -4px;
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  width: calc(100% + 8px);
  transition: background var(--transition-fast);
}

.growth-summary-foot:hover {
  background: rgba(0, 0, 0, 0.03);
}

.growth-summary-foot-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  color: var(--color-primary);
}

.growth-overview-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.9fr);
  gap: 18px;
  align-items: start;
}

.growth-chart-card {
  min-height: 320px;
}

.growth-card-header {
  align-items: flex-start;
}

.distribution-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.distribution-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  width: 100%;
  padding: 14px;
  border: 1px solid var(--color-border-light);
  border-radius: 12px;
  background: #fff;
  text-align: left;
  transition: transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.distribution-row:hover {
  transform: none;
  border-color: rgba(37, 99, 235, 0.24);
  box-shadow: none;
}

.distribution-row-copy {
  min-width: 110px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.distribution-row-copy strong {
  font-size: 0.98rem;
  color: var(--color-text);
}

.distribution-row-copy span {
  font-size: 0.88rem;
  color: var(--color-text-secondary);
}

.distribution-row-track {
  flex: 1;
  height: 10px;
  border-radius: 999px;
  background: #EEF2F7;
  overflow: hidden;
}

.distribution-row-fill {
  height: 100%;
  border-radius: 999px;
}

.distribution-row-right {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.transition-summary-grid,
.candidate-stage-grid {
  display: grid;
  gap: var(--space-md);
}

.growth-transition-layout {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(0, 1fr);
  gap: 18px;
  align-items: stretch;
}

.growth-transition-chart-shell {
  min-height: 280px;
}

.transition-summary-grid {
  grid-template-columns: 1fr;
}

.transition-summary-item,
.candidate-stage-card {
  border: 1px solid var(--color-border-light);
  border-radius: 14px;
  padding: 18px;
  background: #FFFFFF;
}

.transition-summary-label {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text);
}

.transition-summary-count {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--color-text);
}

.transition-summary-foot {
  font-size: 0.88rem;
  line-height: 1.55;
  color: var(--color-text-secondary);
}

.candidate-list {
  display: flex;
  flex-direction: column;
  margin-bottom: var(--space-sm);
}

.candidate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: 9px 0;
  border-bottom: 1px solid var(--color-border-light);
}

.candidate-row:last-child {
  border-bottom: none;
}

.candidate-row-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.candidate-row-right {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 0.84rem;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.candidate-name {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--color-text);
}

.candidate-id {
  font-size: 0.82rem;
  color: var(--color-text-secondary);
}

.candidate-stage-grid {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.candidate-stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.candidate-stage-count {
  font-size: 1rem;
  font-weight: 800;
  color: var(--color-text);
}

.product-rank-index {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--liquid-bg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.product-rank-count {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text);
}

.action-link {
  margin-top: var(--space-sm);
}

.empty-inline,
.action-empty {
  font-size: 0.88rem;
  color: var(--color-text-secondary);
}

@media (max-width: 1280px) {
  .growth-summary-strip,
  .growth-overview-row,
  .candidate-stage-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .growth-funnel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .growth-summary-strip,
  .growth-overview-row,
  .growth-transition-layout,
  .candidate-stage-grid,
  .transition-summary-grid {
    grid-template-columns: 1fr;
  }

  .page-header-actions {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .page-header {
    padding: 0;
  }

  .growth-funnel {
    grid-template-columns: 1fr;
  }

  .distribution-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .distribution-row-track {
    width: 100%;
  }
}
</style>
