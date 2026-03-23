<template>
  <div class="growth-page">
    <div class="growth-toolbar">
      <StatusBadge :label="selectedPeriodLabel" variant="neutral" />
      <NuxtLink to="/dashboard" class="btn btn-secondary btn-sm growth-back-link">
        <BarChart3 :size="14" :stroke-width="2" />
        대시보드로 돌아가기
      </NuxtLink>
    </div>

    <div v-if="loading" class="card growth-loading">고객 성장 단계 데이터를 불러오는 중입니다.</div>

    <template v-else>
      <div class="growth-summary-grid">
        <div
          v-for="summary in insights.summaries"
          :key="summary.stage"
          class="card growth-summary-card"
          :style="{ '--stage-accent': stageColor(summary.stage) }"
        >
          <div class="growth-summary-top">
            <StatusBadge :label="summary.label" :variant="badgeVariant(summary.stage)" />
            <span class="growth-summary-ratio">전체 {{ summary.ratio }}%</span>
          </div>
          <strong class="growth-summary-count">{{ summary.count.toLocaleString() }}명</strong>
          <div class="growth-summary-meter">
            <div
              class="growth-summary-meter-fill"
              :class="`fill-${summary.stage.toLowerCase()}`"
              :style="{ width: `${summary.ratio}%` }"
            />
          </div>
          <button class="growth-summary-foot" @click="navigateToCustomers(summary.stage)">
            <span>이탈위험 {{ summary.churnCustomers.toLocaleString() }}명</span>
            <span class="growth-summary-foot-link">
              고객 보기
              <MoveRight :size="12" :stroke-width="2" />
            </span>
          </button>
        </div>
      </div>

      <div class="growth-overview-row">
        <div class="card growth-chart-card">
          <div class="card-header growth-card-header">
            <h3 class="card-title">성장 단계 분포</h3>
          </div>
          <div class="growth-chart-content growth-chart-content-split">
            <div class="growth-chart-shell doughnut-shell">
              <canvas ref="distributionChartCanvas"></canvas>
            </div>
            <div class="distribution-legend">
              <button
                v-for="row in distributionRows"
                :key="row.stage"
                type="button"
                class="distribution-legend-item"
                @click="navigateToCustomers(row.stage)"
              >
                <span class="distribution-dot" :style="{ backgroundColor: stageColor(row.stage) }" />
                <div class="distribution-legend-text">
                  <strong>{{ row.label }}</strong>
                  <span>{{ row.count.toLocaleString() }}명 · {{ row.ratio }}%</span>
                </div>
                <MoveRight :size="14" :stroke-width="2" />
              </button>
            </div>
          </div>
        </div>

        <div class="card growth-transition-card">
          <div class="card-header growth-card-header">
            <h3 class="card-title">전환 현황</h3>
          </div>
          <div class="transition-summary-grid">
            <div v-for="item in transitionRows" :key="item.key" class="transition-summary-item">
              <div class="transition-summary-top">
                <span class="transition-summary-label">{{ item.label }}</span>
                <strong class="transition-summary-count">{{ item.count.toLocaleString() }}명</strong>
              </div>
              <div class="transition-summary-track">
                <div class="transition-summary-fill" :style="{ width: `${item.rate}%`, background: stageColor(item.toStage) }" />
              </div>
              <div class="transition-summary-foot">
                <span>{{ stageLabel(item.fromStage) }} 대비 {{ item.rate }}%</span>
                <button class="btn btn-ghost btn-sm" @click="navigateToCustomers(item.toStage)">
                  보기
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header growth-card-header compact">
          <h3 class="card-title">승급 후보</h3>
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
import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js'
import { BarChart3, MoveRight } from 'lucide-vue-next'
import { fetchGrowthInsights, growthStageBadgeVariant, type GrowthInsightsResult } from '~/composables/useGrowthInsights'
import { customerStageLabel, purchaseIntensityLabel, type CustomerStageCode, type PurchaseIntensityCode } from '~/composables/useGrowthStage'

Chart.register(DoughnutController, ArcElement, Tooltip, Legend)

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

const distributionChartCanvas = ref<HTMLCanvasElement | null>(null)

const distributionChartInstance = shallowRef<Chart | null>(null)

function stageLabel(stage: CustomerStageCode) {
  return customerStageLabel(stage)
}

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

function petLabel(type: 'DOG' | 'CAT' | 'BOTH') {
  if (type === 'DOG') return '강아지'
  if (type === 'CAT') return '고양이'
  return '모두'
}

function intensityLabel(intensity: PurchaseIntensityCode) {
  return purchaseIntensityLabel(intensity)
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

function navigateToCustomers(stage?: CustomerStageCode) {
  const query: Record<string, string> = {}
  if (selectedMonth.value !== 'all') query.month = selectedMonth.value
  if (stage) query.stage = stage
  navigateTo({ path: '/customers', query })
}

function destroyCharts() {
  if (distributionChartInstance.value) {
    distributionChartInstance.value.destroy()
    distributionChartInstance.value = null
  }
}

function renderDistributionChart() {
  if (!distributionChartCanvas.value) return
  if (distributionChartInstance.value) {
    distributionChartInstance.value.destroy()
    distributionChartInstance.value = null
  }

  const labels = distributionRows.value.map((row) => row.label)
  const values = distributionRows.value.map((row) => row.count)
  const hasData = values.some((value) => value > 0)

  distributionChartInstance.value = new Chart(distributionChartCanvas.value, {
    type: 'doughnut',
    data: {
      labels: hasData ? labels : ['데이터 없음'],
      datasets: [{
        data: hasData ? values : [1],
        backgroundColor: hasData
          ? distributionRows.value.map((row) => stageColor(row.stage))
          : ['#E5E7EB'],
        hoverBackgroundColor: hasData
          ? distributionRows.value.map((row) => stageColor(row.stage))
          : ['#E5E7EB'],
        borderWidth: 0,
        spacing: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '66%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111827',
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (ctx) => {
              const value = Number(ctx.parsed || 0)
              const total = values.reduce((sum, item) => sum + item, 0) || 1
              const ratio = Math.round((value / total) * 100)
              return `${value.toLocaleString()}명 (${ratio}%)`
            },
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
  () => [loading.value, insights.value.summaries],
  async () => {
    if (loading.value) return
    await nextTick()
    renderDistributionChart()
  },
  { deep: true },
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

.growth-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.growth-back-link {
  flex-shrink: 0;
}

.growth-loading {
  padding: 36px;
  text-align: center;
  color: var(--color-text-secondary);
}

.growth-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-lg);
}

.growth-summary-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-top: 4px solid var(--stage-accent);
  background: rgba(255, 255, 255, 0.98);
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
  height: 10px;
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
  background: linear-gradient(90deg, #cbd5e1 0%, #94a3b8 100%);
}

.fill-growth,
.transition-summary-fill {
  background: linear-gradient(90deg, #60a5fa 0%, #2563eb 100%);
}

.fill-core {
  background: linear-gradient(90deg, #4ade80 0%, #16a34a 100%);
}

.fill-premium {
  background: linear-gradient(90deg, #fbbf24 0%, #d97706 100%);
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-lg);
}

.growth-chart-card {
  min-height: 360px;
}

.growth-card-header {
  align-items: flex-start;
}

.growth-chart-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.growth-chart-content-split {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: var(--space-xl);
  align-items: center;
}

.growth-chart-shell {
  position: relative;
  min-height: 260px;
}

.doughnut-shell {
  min-height: 280px;
}

.distribution-legend {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.distribution-legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  background: #fff;
  transition: transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.distribution-legend-item:hover {
  transform: translateY(-1px);
  border-color: rgba(37, 99, 235, 0.24);
  box-shadow: var(--shadow-sm);
}

.distribution-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.distribution-legend-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.distribution-legend-text strong {
  font-size: 0.98rem;
  color: var(--color-text);
}

.distribution-legend-text span {
  font-size: 0.88rem;
  color: var(--color-text-secondary);
}

.transition-summary-grid,
.candidate-stage-grid {
  display: grid;
  gap: var(--space-md);
}

.transition-summary-grid {
  grid-template-columns: 1fr;
}

.transition-summary-item,
.candidate-stage-card {
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  padding: 16px;
  background: rgba(255, 255, 255, 0.9);
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
  .growth-summary-grid,
  .growth-overview-row,
  .candidate-stage-grid,
  .growth-chart-content-split {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .growth-summary-grid,
  .growth-overview-row,
  .growth-chart-content-split,
  .candidate-stage-grid,
  .transition-summary-grid {
    grid-template-columns: 1fr;
  }

  .growth-toolbar {
    align-items: stretch;
  }

  .growth-chart-content-split {
    display: flex;
    flex-direction: column;
  }

  .growth-chart-shell,
  .doughnut-shell {
    min-height: 240px;
  }
}
</style>
