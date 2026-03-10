<template>
  <div class="growth-page">
    <div class="growth-hero">
      <div class="growth-hero-copy">
        <span class="growth-period">{{ selectedPeriodLabel }}</span>
        <h1 class="growth-title">고객 성장 단계</h1>
      </div>
      <NuxtLink to="/dashboard" class="btn btn-secondary btn-sm growth-back-link">
        <BarChart3 :size="14" :stroke-width="2" />
        대시보드로 돌아가기
      </NuxtLink>
    </div>

    <div v-if="loading" class="card growth-loading">고객 성장 단계 데이터를 불러오는 중입니다.</div>

    <template v-else>
      <div class="growth-summary-grid">
        <div v-for="summary in insights.summaries" :key="summary.stage" class="card growth-summary-card">
          <div class="growth-summary-top">
            <StatusBadge :label="summary.label" :variant="badgeVariant(summary.stage)" />
            <span class="growth-summary-ratio">{{ summary.ratio }}%</span>
          </div>
          <strong class="growth-summary-count">{{ summary.count.toLocaleString() }}명</strong>
          <div class="growth-summary-meter">
            <div
              class="growth-summary-meter-fill"
              :class="`fill-${summary.stage.toLowerCase()}`"
              :style="{ width: `${summary.ratio}%` }"
            />
          </div>
          <div class="growth-summary-meta">
            <span>재구매 {{ summary.repeatCustomers.toLocaleString() }}명</span>
            <span>이탈위험 {{ summary.churnCustomers.toLocaleString() }}명</span>
            <span>평균 {{ summary.avgPurchaseCount }}회</span>
          </div>
          <button class="btn btn-ghost btn-sm growth-summary-action" @click="navigateToCustomers(summary.stage)">
            고객 보기
            <MoveRight :size="14" :stroke-width="2" />
          </button>
        </div>
      </div>

      <div class="growth-chart-grid">
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

        <div class="card growth-chart-card">
          <div class="card-header growth-card-header">
            <h3 class="card-title">단계 전환</h3>
          </div>
          <div class="growth-chart-content">
            <div class="growth-chart-shell">
              <canvas ref="transitionChartCanvas"></canvas>
            </div>
            <div class="transition-summary-grid">
              <div v-for="item in transitionRows" :key="item.key" class="transition-summary-item">
                <div class="transition-summary-top">
                  <span class="transition-summary-label">{{ item.label }}</span>
                  <strong class="transition-summary-count">{{ item.count.toLocaleString() }}명</strong>
                </div>
                <div class="transition-summary-track">
                  <div class="transition-summary-fill" :style="{ width: `${item.rate}%` }" />
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
      </div>

      <div class="growth-chart-grid growth-chart-grid-wide">
        <div class="card growth-chart-card growth-chart-card-wide">
          <div class="card-header growth-card-header">
            <h3 class="card-title">단계별 행동 비교</h3>
          </div>
          <div class="growth-chart-content">
            <div class="growth-chart-shell behavior-shell">
              <canvas ref="behaviorChartCanvas"></canvas>
            </div>
            <div class="behavior-highlight-grid">
              <div v-for="row in behaviorRows" :key="row.stage" class="behavior-highlight-item">
                <div class="behavior-highlight-top">
                  <StatusBadge :label="row.label" :variant="badgeVariant(row.stage)" />
                  <strong>{{ row.count.toLocaleString() }}명</strong>
                </div>
                <div class="behavior-highlight-metrics">
                  <span>재구매율 {{ row.repeatRate }}%</span>
                  <span>이탈위험 {{ row.churnRate }}%</span>
                  <span>평균 {{ row.avgPurchaseCount }}회</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="growth-bottom-grid">
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
              <div v-else class="candidate-list compact">
                <div v-for="customer in group.customers.slice(0, 4)" :key="`${group.stage}-${customer.customerKey}`" class="candidate-item compact">
                  <div class="candidate-main">
                    <span class="candidate-name">{{ customer.name }}</span>
                    <span class="candidate-id">{{ maskBuyerId(customer.id) }}</span>
                  </div>
                  <div class="candidate-meta compact">
                    <span>{{ customer.pet }}</span>
                    <span>{{ customer.purchaseCount }}회</span>
                  </div>
                </div>
              </div>
              <button class="btn btn-ghost btn-sm action-link" @click="navigateToCustomers(group.stage)">
                관련 고객 전체 보기
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header growth-card-header compact">
            <h3 class="card-title">최근 승급 고객</h3>
          </div>
          <div v-if="insights.recentTransitions.length === 0" class="empty-inline">최근 승급 고객이 없습니다.</div>
          <div v-else class="transition-list">
            <div v-for="item in insights.recentTransitions" :key="`${item.customerKey}-${item.date}-${item.toStage}`" class="transition-list-item">
              <div class="transition-list-main">
                <span class="transition-list-name">{{ item.name }}</span>
                <span class="transition-list-id">{{ maskBuyerId(item.id) }}</span>
                <span class="transition-list-date">{{ item.date }}</span>
              </div>
              <div class="transition-list-meta">
                <StatusBadge :label="stageLabel(item.fromStage)" :variant="badgeVariant(item.fromStage)" />
                <ChevronRight :size="12" :stroke-width="2" class="transition-arrow" />
                <StatusBadge :label="stageLabel(item.toStage)" :variant="badgeVariant(item.toStage)" />
                <span class="transition-list-pet">{{ petLabel(item.petType) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header growth-card-header compact">
          <h3 class="card-title">단계별 인기 상품</h3>
        </div>
        <div class="stage-product-grid">
          <div v-for="group in insights.stageProducts" :key="group.stage" class="stage-product-block">
            <div class="stage-product-head">
              <StatusBadge :label="group.label" :variant="badgeVariant(group.stage)" />
              <button class="btn btn-ghost btn-sm" @click="navigateToCustomers(group.stage)">고객 보기</button>
            </div>
            <div v-if="group.products.length === 0" class="empty-inline">표시할 상품이 없습니다.</div>
            <div v-else class="product-rank-list compact">
              <div v-for="(item, index) in group.products.slice(0, 3)" :key="`${group.stage}-${item.name}-${item.optionInfo}-${index}`" class="product-rank-item compact">
                <span class="product-rank-index">{{ index + 1 }}</span>
                <div class="product-rank-info">
                  <span class="product-rank-name">{{ item.name }}</span>
                  <span class="product-rank-option">옵션 {{ item.optionInfo }}</span>
                </div>
                <span class="product-rank-count">{{ formatGrowthCount(item.count) }}개</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="growth-detail-grid">
        <div class="card">
          <div class="card-header growth-card-header compact">
            <h3 class="card-title">요약</h3>
          </div>
          <div class="summary-note-grid">
            <div v-for="summary in insights.summaries" :key="`summary-note-${summary.stage}`" class="summary-note-card">
              <StatusBadge :label="summary.label" :variant="badgeVariant(summary.stage)" />
              <strong>{{ summary.count.toLocaleString() }}명</strong>
              <span>{{ summary.ratio }}%</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header growth-card-header compact">
            <h3 class="card-title">전환 요약</h3>
          </div>
          <div class="summary-note-grid">
            <div v-for="item in transitionRows" :key="item.key" class="summary-note-card">
              <strong>{{ item.label }}</strong>
              <span>{{ item.count.toLocaleString() }}명</span>
              <span>{{ item.rate }}%</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Chart, DoughnutController, ArcElement, Tooltip, Legend, BarController, BarElement, CategoryScale, LinearScale } from 'chart.js'
import { BarChart3, ChevronRight, MoveRight } from 'lucide-vue-next'
import { fetchGrowthInsights, formatGrowthCount, growthStageBadgeVariant, type GrowthInsightsResult } from '~/composables/useGrowthInsights'
import { customerStageLabel, type CustomerStageCode } from '~/composables/useGrowthStage'

Chart.register(DoughnutController, ArcElement, Tooltip, Legend, BarController, BarElement, CategoryScale, LinearScale)

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
const transitionChartCanvas = ref<HTMLCanvasElement | null>(null)
const behaviorChartCanvas = ref<HTMLCanvasElement | null>(null)

const distributionChartInstance = shallowRef<Chart | null>(null)
const transitionChartInstance = shallowRef<Chart | null>(null)
const behaviorChartInstance = shallowRef<Chart | null>(null)

function stageLabel(stage: CustomerStageCode) {
  return customerStageLabel(stage)
}

function badgeVariant(stage: CustomerStageCode) {
  return growthStageBadgeVariant(stage)
}

function stageColor(stage: CustomerStageCode) {
  if (stage === 'Entry') return '#94A3B8'
  if (stage === 'Growth') return '#2563EB'
  if (stage === 'Core') return '#16A34A'
  return '#D97706'
}

function stageSoftColor(stage: CustomerStageCode) {
  if (stage === 'Entry') return 'rgba(148, 163, 184, 0.18)'
  if (stage === 'Growth') return 'rgba(37, 99, 235, 0.18)'
  if (stage === 'Core') return 'rgba(22, 163, 74, 0.18)'
  return 'rgba(217, 119, 6, 0.18)'
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

const summaryMap = computed(() => {
  const map = new Map<CustomerStageCode, EmptyInsights['summaries'][number]>()
  for (const summary of insights.value.summaries) map.set(summary.stage, summary)
  return map
})

const distributionRows = computed(() => insights.value.summaries)

const transitionRows = computed(() => {
  return insights.value.transitions.map((item) => {
    const fromCount = summaryMap.value.get(item.fromStage)?.count || 0
    const rate = fromCount > 0 ? Math.round((item.count / fromCount) * 100) : 0
    return {
      ...item,
      rate,
    }
  })
})

const behaviorRows = computed(() => {
  return insights.value.summaries.map((summary) => {
    const repeatRate = summary.count > 0 ? Math.round((summary.repeatCustomers / summary.count) * 100) : 0
    const churnRate = summary.count > 0 ? Math.round((summary.churnCustomers / summary.count) * 100) : 0
    return {
      ...summary,
      repeatRate,
      churnRate,
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
  if (transitionChartInstance.value) {
    transitionChartInstance.value.destroy()
    transitionChartInstance.value = null
  }
  if (behaviorChartInstance.value) {
    behaviorChartInstance.value.destroy()
    behaviorChartInstance.value = null
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

function renderTransitionChart() {
  if (!transitionChartCanvas.value) return
  if (transitionChartInstance.value) {
    transitionChartInstance.value.destroy()
    transitionChartInstance.value = null
  }

  transitionChartInstance.value = new Chart(transitionChartCanvas.value, {
    type: 'bar',
    data: {
      labels: transitionRows.value.map((item) => item.label),
      datasets: [{
        label: '전환 고객',
        data: transitionRows.value.map((item) => item.count),
        backgroundColor: transitionRows.value.map((item) => stageSoftColor(item.toStage)),
        borderColor: transitionRows.value.map((item) => stageColor(item.toStage)),
        borderWidth: 1.5,
        borderRadius: 10,
        maxBarThickness: 48,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111827',
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (ctx) => `${Number(ctx.parsed.y || 0).toLocaleString()}명`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#6B7280',
            font: { size: 12, weight: '600' as const },
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#EEF2F7' },
          ticks: {
            color: '#9CA3AF',
            font: { size: 11 },
            callback: (value) => Number(value).toLocaleString(),
          },
        },
      },
    },
  })
}

function renderBehaviorChart() {
  if (!behaviorChartCanvas.value) return
  if (behaviorChartInstance.value) {
    behaviorChartInstance.value.destroy()
    behaviorChartInstance.value = null
  }

  behaviorChartInstance.value = new Chart(behaviorChartCanvas.value, {
    type: 'bar',
    data: {
      labels: behaviorRows.value.map((row) => row.label),
      datasets: [
        {
          label: '재구매율',
          data: behaviorRows.value.map((row) => row.repeatRate),
          backgroundColor: '#2563EB',
          borderRadius: 10,
          maxBarThickness: 30,
        },
        {
          label: '이탈위험 비중',
          data: behaviorRows.value.map((row) => row.churnRate),
          backgroundColor: '#F59E0B',
          borderRadius: 10,
          maxBarThickness: 30,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            color: '#4B5563',
            padding: 16,
            font: { size: 12, weight: '600' as const },
          },
        },
        tooltip: {
          backgroundColor: '#111827',
          padding: 12,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label} ${Number(ctx.parsed.y || 0)}%`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#6B7280',
            font: { size: 12, weight: '600' as const },
          },
        },
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          grid: { color: '#EEF2F7' },
          ticks: {
            color: '#9CA3AF',
            font: { size: 11 },
            callback: (value) => `${value}%`,
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
  () => [loading.value, insights.value.summaries, insights.value.transitions],
  async () => {
    if (loading.value) return
    await nextTick()
    renderDistributionChart()
    renderTransitionChart()
    renderBehaviorChart()
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

.growth-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-lg);
}

.growth-hero-copy {
  min-width: 0;
}

.growth-period {
  display: inline-block;
  margin-bottom: var(--space-sm);
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.growth-title {
  font-size: 2rem;
  line-height: 1.16;
  font-weight: 800;
  color: var(--color-text);
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
}

.growth-summary-top,
.transition-summary-top,
.transition-summary-foot,
.action-block-head,
.behavior-highlight-top,
.stage-product-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.growth-summary-ratio {
  font-size: 0.96rem;
  font-weight: 700;
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

.growth-summary-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-sm);
  font-size: 0.86rem;
  color: var(--color-text-secondary);
}

.growth-summary-action {
  align-self: flex-start;
}

.growth-chart-grid,
.growth-bottom-grid,
.growth-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-lg);
}

.growth-chart-grid-wide {
  grid-template-columns: 1fr;
}

.growth-chart-card {
  min-height: 430px;
}

.growth-chart-card-wide {
  min-height: 480px;
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

.behavior-shell {
  min-height: 320px;
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
.behavior-highlight-grid,
.candidate-stage-grid,
.stage-product-grid,
.summary-note-grid {
  display: grid;
  gap: var(--space-md);
}

.transition-summary-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.transition-summary-item,
.behavior-highlight-item,
.candidate-stage-card,
.stage-product-block,
.summary-note-card {
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

.transition-summary-foot,
.behavior-highlight-metrics {
  font-size: 0.88rem;
  line-height: 1.55;
  color: var(--color-text-secondary);
}

.behavior-highlight-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.behavior-highlight-metrics {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: var(--space-sm);
}

.transition-list,
.candidate-list,
.product-rank-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.transition-list-item,
.candidate-item,
.product-rank-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.92);
}

.transition-list-main,
.candidate-main,
.product-rank-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.transition-list-name,
.candidate-name,
.product-rank-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
}

.transition-list-id,
.transition-list-date,
.candidate-id,
.candidate-meta,
.product-rank-option {
  font-size: 0.84rem;
  color: var(--color-text-secondary);
}

.transition-list-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.transition-arrow {
  color: var(--color-text-muted);
}

.candidate-list.compact,
.product-rank-list.compact {
  gap: var(--space-xs);
}

.candidate-stage-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.candidate-stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.candidate-stage-count {
  font-size: 1rem;
  font-weight: 800;
  color: var(--color-text);
}

.stage-product-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.summary-note-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.summary-note-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-note-card strong {
  font-size: 1rem;
  font-weight: 800;
  color: var(--color-text);
}

.summary-note-card span {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.candidate-item.compact,
.product-rank-item.compact {
  padding: 12px 14px;
}

.candidate-meta.compact {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: right;
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
  .growth-chart-grid,
  .growth-bottom-grid,
  .growth-detail-grid,
  .behavior-highlight-grid,
  .candidate-stage-grid,
  .stage-product-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .transition-summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 960px) {
  .growth-hero,
  .growth-chart-content-split,
  .growth-summary-grid,
  .growth-chart-grid,
  .growth-bottom-grid,
  .growth-detail-grid,
  .behavior-highlight-grid,
  .candidate-stage-grid,
  .stage-product-grid,
  .summary-note-grid {
    grid-template-columns: 1fr;
  }

  .growth-chart-content-split {
    display: flex;
    flex-direction: column;
  }

  .growth-chart-shell,
  .doughnut-shell,
  .behavior-shell {
    min-height: 240px;
  }

  .growth-summary-meta {
    grid-template-columns: 1fr;
  }
}
</style>
