<template>
  <div class="dashboard">
    <!-- KPI Cards -->
    <div class="kpi-grid">
      <div class="card card-clickable kpi-wrapper" @click="navigateToCustomers()">
        <KpiCard
          label="전체 주문"
          :value="currentMetrics.totalOrders"
          :icon="ShoppingBag"
          icon-bg="#EFF6FF"
          icon-color="#2563EB"
          :change="12.5"
        />
      </div>
      <div class="card card-clickable kpi-wrapper" @click="navigateToCustomers({ purchaseType: 'real' })">
        <KpiCard
          label="실구매"
          :value="currentMetrics.realPurchase"
          :icon="CheckCircle"
          icon-bg="#ECFDF5"
          icon-color="#10B981"
          :change="8.3"
        />
      </div>
      <div class="card card-clickable kpi-wrapper" @click="navigateToCustomers({ purchaseCount: '3' })">
        <KpiCard
          label="재구매 고객"
          :value="currentMetrics.repeatCustomers"
          :icon="UserCheck"
          icon-bg="#F0FDF4"
          icon-color="#16A34A"
          :change="5.2"
        />
      </div>
      <div class="card card-clickable kpi-wrapper" @click="navigateToCustomers()">
        <KpiCard
          label="신규 고객"
          :value="currentMetrics.newCustomers"
          :icon="UserPlus"
          icon-bg="#EFF6FF"
          icon-color="#3B82F6"
          :change="14.7"
        />
      </div>
    </div>

    <!-- Charts Row -->
    <div class="charts-grid">
      <!-- 월별 실구매 추이 -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">월별 실구매 추이</h3>
          <StatusBadge label="최근 6개월" variant="neutral" />
        </div>
        <div class="trend-chart">
          <div class="trend-chart-area">
            <canvas ref="trendChartCanvas"></canvas>
          </div>
        </div>
      </div>

      <!-- 펫 타입 분포 -->
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
              <span class="legend-value">{{ p.value }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Row -->
    <div class="bottom-grid">
      <!-- 인기 상품 TOP 5 -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">실구매 인기 상품 TOP 5</h3>
          <StatusBadge :label="`${selectedPeriodLabel} 기준`" variant="neutral" />
        </div>
        <div class="top-products">
          <div v-for="(item, idx) in topProducts" :key="item.name" class="top-product-item">
            <span class="top-product-rank" :class="'rank-' + (idx + 1)">{{ idx + 1 }}</span>
            <div class="top-product-info">
              <span class="top-product-name">{{ item.name }}</span>
              <span class="top-product-meta">{{ item.pet }} · {{ item.stage }}</span>
            </div>
            <div class="top-product-stats">
              <span class="top-product-count">{{ item.count }}건</span>
              <div class="top-product-bar-wrap">
                <div class="top-product-bar" :style="{ width: item.percent + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 성장 단계별 고객 수 -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">실구매 고객 성장 단계</h3>
        </div>
        <div class="stage-bars">
          <div v-for="s in stageData" :key="s.name" class="stage-item">
            <div class="stage-bar-outer">
              <div
                class="stage-bar-inner"
                :style="{ height: s.percent + '%' }"
              ></div>
            </div>
            <span class="stage-count">{{ s.count }}</span>
            <span class="stage-name">{{ s.name }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Churn Row -->
    <div class="single-grid">
      <!-- 이탈 위험 고객 -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">이탈 위험 고객</h3>
          <StatusBadge :label="`${currentMetrics.churnCount}명`" variant="danger" dot />
        </div>
        <div class="churn-list">
          <div v-for="c in churnData" :key="c.name" class="churn-item">
            <div class="churn-info">
              <span class="churn-name">{{ c.name }}</span>
              <span class="churn-id">{{ c.id }}</span>
            </div>
            <div class="churn-meta">
              <span class="churn-days">{{ c.days }}일 경과</span>
              <StatusBadge :label="c.pet" :variant="c.pet === '강아지' ? 'primary' : 'info'" />
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
  ShoppingBag,
  CheckCircle,
  UserCheck,
  UserPlus,
  MoveRight,
} from 'lucide-vue-next'
import { Chart, DoughnutController, ArcElement, Tooltip, Legend, LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler } from 'chart.js'

Chart.register(DoughnutController, ArcElement, Tooltip, Legend, LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler)

const router = useRouter()
const { selectedMonth, selectedPeriodLabel } = useAnalysisPeriod()
const petChartCanvas = ref<HTMLCanvasElement | null>(null)
const trendChartCanvas = ref<HTMLCanvasElement | null>(null)

function navigateToCustomers(query: Record<string, string> = {}) {
  const withMonth = selectedMonth.value !== 'all'
    ? { month: selectedMonth.value, ...query }
    : query
  router.push({ path: '/customers', query: withMonth })
}

const metricsByMonth: Record<string, {
  totalOrders: number
  realPurchase: number
  repeatCustomers: number
  newCustomers: number
  churnCount: number
}> = {
  '2025-02': {
    totalOrders: 1842,
    realPurchase: 1502,
    repeatCustomers: 312,
    newCustomers: 186,
    churnCount: 8,
  },
  '2025-01': {
    totalOrders: 1650,
    realPurchase: 1334,
    repeatCustomers: 284,
    newCustomers: 172,
    churnCount: 11,
  },
  '2024-12': {
    totalOrders: 1580,
    realPurchase: 1211,
    repeatCustomers: 243,
    newCustomers: 149,
    churnCount: 15,
  },
}

const allMetrics = {
  totalOrders: 5072,
  realPurchase: 4047,
  repeatCustomers: 839,
  newCustomers: 507,
  churnCount: 34,
}

const currentMetrics = computed(() => {
  if (selectedMonth.value === 'all') return allMetrics
  return metricsByMonth[selectedMonth.value] || metricsByMonth['2025-02']!
})

// Data
const petData = [
  { label: '강아지', value: 58, color: '#2563EB' },
  { label: '고양이', value: 31, color: '#60A5FA' },
  { label: '모두', value: 11, color: '#BFDBFE' },
]

const topProducts = [
  { name: '유산균 파우더 30포', pet: '강아지', stage: '성장기', count: 127, percent: 100 },
  { name: '연어 트릿 대형견 200g', pet: '강아지', stage: '성견', count: 98, percent: 77 },
  { name: '오메가3 캡슐 60정', pet: '공용', stage: '시니어', count: 82, percent: 65 },
  { name: '치석껌 소형견용 100g', pet: '강아지', stage: '성견', count: 71, percent: 56 },
  { name: '관절 영양제 500g', pet: '공용', stage: '시니어', count: 63, percent: 50 },
]

const stageData = [
  { name: '입문', count: 420, percent: 100 },
  { name: '성장', count: 312, percent: 74 },
  { name: '핵심', count: 186, percent: 44 },
  { name: '프리미엄', count: 64, percent: 15 },
]

const churnData = [
  { name: '김지윤', id: 'kimj****', days: 78, pet: '강아지' },
  { name: '이서현', id: 'leese***', days: 72, pet: '고양이' },
  { name: '박민수', id: 'park****', days: 68, pet: '강아지' },
  { name: '최유진', id: 'choi****', days: 65, pet: '모두' },
  { name: '정하늘', id: 'jung****', days: 62, pet: '강아지' },
]

// Trend chart data
const trendMonths = ['2024.09', '2024.10', '2024.11', '2024.12', '2025.01', '2025.02']
const trendValues = [1120, 1245, 1180, 1350, 1420, 1502]

onMounted(() => {
  // Pet donut chart
  if (petChartCanvas.value) {
    new Chart(petChartCanvas.value, {
      type: 'doughnut',
      data: {
        labels: petData.map(p => p.label),
        datasets: [{
          data: petData.map(p => p.value),
          backgroundColor: petData.map(p => p.color),
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

  // Trend line chart
  if (trendChartCanvas.value) {
    new Chart(trendChartCanvas.value, {
      type: 'line',
      data: {
        labels: trendMonths,
        datasets: [{
          data: trendValues,
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
              label: (ctx) => `${(ctx.parsed.y ?? 0).toLocaleString()}건`,
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
              callback: (value) => value.toLocaleString(),
            },
            beginAtZero: false,
            suggestedMin: 900,
          },
        },
      },
    })
  }
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

/* KPI */
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

/* Trend Chart */
.trend-chart {
  padding-top: var(--space-sm);
}

.trend-chart-area {
  height: 200px;
}

/* Pet Chart */
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

/* Top Products */
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

/* Stage Bars */
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

/* Churn */
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
</style>
