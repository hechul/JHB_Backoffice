<template>
  <div class="search-ads-page">
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">네이버 검색광고</h1>
        <span class="page-caption">{{ currentRangeLabel }} 기준 광고비와 전환매출 흐름</span>
      </div>
      <div class="page-header-actions">
        <select
          v-if="selectedSearchMonth !== 'all'"
          v-model="trendDrillWeek"
          class="select select-compact header-select"
        >
          <option value="">주차 전체</option>
          <option v-for="week in searchWeekOptions" :key="week.value" :value="week.value">{{ week.label }}</option>
        </select>
        <select
          v-if="selectedSearchMonth !== 'all' && trendDrillWeek"
          v-model="trendDrillDate"
          class="select select-compact header-select"
        >
          <option value="">일자 전체</option>
          <option v-for="dateToken in searchDateOptions" :key="dateToken" :value="dateToken">{{ formatDateLabel(dateToken) }}</option>
        </select>
        <button type="button" class="refresh-chip" :disabled="pending || drillPending" @click="handleRefresh">
          새로고침
        </button>
      </div>
    </div>

    <div v-if="pending" class="card loading-card">네이버 검색광고 데이터를 불러오는 중입니다.</div>

    <div v-else-if="error" class="card empty-card">
      <strong>네이버 검색광고 데이터를 불러오지 못했습니다.</strong>
      <span>{{ error.message }}</span>
    </div>

    <template v-else>
      <div class="primary-summary-grid">
        <div class="metric-card metric-card--primary">
          <span class="metric-label">광고비</span>
          <strong class="metric-value">{{ formatCurrency(overview.summary.spend) }}</strong>
          <small class="metric-foot">{{ overview.summary.campaignCount.toLocaleString() }}개 캠페인</small>
        </div>
        <div class="metric-card">
          <span class="metric-label">구매 전환매출</span>
          <strong class="metric-value">{{ formatCurrency(overview.summary.purchaseConversionValue) }}</strong>
          <small class="metric-foot">광고 기준 매출</small>
        </div>
        <div class="metric-card">
          <span class="metric-label">ROAS</span>
          <strong class="metric-value">{{ formatPercent(overview.summary.roas) }}</strong>
          <small class="metric-foot">광고비 대비 구매 전환매출</small>
        </div>
      </div>

      <div class="secondary-summary-grid">
        <div class="metric-card metric-card--secondary">
          <span class="metric-label">노출수</span>
          <strong class="metric-value">{{ formatInteger(overview.summary.impressions) }}</strong>
          <small class="metric-foot">전체 노출 기준</small>
        </div>
        <div class="metric-card metric-card--secondary">
          <span class="metric-label">클릭수</span>
          <strong class="metric-value">{{ formatInteger(overview.summary.clicks) }}</strong>
          <small class="metric-foot">유입 클릭</small>
        </div>
        <div class="metric-card metric-card--secondary">
          <span class="metric-label">CTR</span>
          <strong class="metric-value">{{ formatPercent(overview.summary.ctr) }}</strong>
          <small class="metric-foot">평균 CPC {{ formatCurrency(overview.summary.avgCpc) }}</small>
        </div>
        <div class="metric-card metric-card--secondary">
          <span class="metric-label">구매 전환수</span>
          <strong class="metric-value">{{ formatInteger(overview.summary.purchaseConversions) }}</strong>
          <small class="metric-foot">전체 전환 {{ formatInteger(overview.summary.conversions) }}</small>
        </div>
      </div>

      <div class="content-grid">
        <div class="card trend-card">
          <div class="card-header card-header-stack">
            <div class="dashboard-card-head dashboard-card-head-between">
              <div class="trend-card-copy">
                <h3 class="card-title">{{ trendCardTitle }}</h3>
                <div class="trend-drill-path">
                  <button
                    v-if="selectedSearchMonth === 'all'"
                    type="button"
                    class="trend-drill-pill"
                    :class="{ active: !trendDrillMonth }"
                    @click="resetTrendDrilldown"
                  >
                    전체
                  </button>
                  <button
                    v-if="rootTrendMonth"
                    type="button"
                    class="trend-drill-pill"
                    :class="{ active: !!rootTrendMonth && !trendDrillWeek }"
                    @click="clearTrendWeek"
                  >
                    {{ formatMonthLabel(rootTrendMonth) }}
                  </button>
                  <span v-if="trendDrillWeek && rootTrendMonth" class="trend-drill-pill active">
                    {{ weekLabelFromCode(rootTrendMonth, trendDrillWeek) }}
                  </span>
                  <span v-if="trendDrillDate" class="trend-drill-pill active">
                    {{ formatDateLabel(trendDrillDate) }}
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
          <div v-if="trendLoading" class="empty-inline">광고 흐름을 불러오는 중입니다.</div>
          <div v-else-if="trendLabels.length === 0" class="empty-inline">표시할 광고 흐름이 없습니다.</div>
          <div v-else class="chart-shell chart-shell--trend">
            <canvas ref="trendChartCanvas"></canvas>
          </div>
        </div>

        <div class="card leaderboard-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">상위 캠페인</h3>
              <span class="section-caption">광고비가 실리는 캠페인부터 바로 읽히게 정리했습니다.</span>
            </div>
          </div>
          <div v-if="overview.topCampaigns.length === 0" class="empty-inline">캠페인 데이터가 없습니다.</div>
          <div v-else class="leaderboard-list">
            <div
              v-for="(campaign, index) in overview.topCampaigns"
              :key="campaign.id"
              class="leaderboard-row"
            >
              <div class="leaderboard-rank">{{ index + 1 }}</div>
              <div class="leaderboard-copy">
                <div class="leaderboard-head">
                  <strong>{{ campaign.name }}</strong>
                  <StatusBadge :label="statusLabel(campaign.status)" :variant="statusVariant(campaign.status)" />
                </div>
                <span>{{ formatCurrency(campaign.spend) }} · ROAS {{ formatPercent(campaign.roas) }}</span>
              </div>
              <div class="leaderboard-side">
                <strong>{{ formatInteger(campaign.clicks) }}</strong>
                <small>클릭</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="content-grid">
        <div class="card table-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">광고그룹 효율</h3>
              <span class="section-caption">광고비가 붙는 그룹을 중심으로 효율을 바로 비교합니다.</span>
            </div>
          </div>
          <div v-if="overview.topAdgroups.length === 0" class="empty-inline">광고그룹 데이터가 없습니다.</div>
          <div v-else class="table-list">
            <div class="table-head">
              <span>광고그룹</span>
              <span>광고비</span>
              <span>구매 전환</span>
              <span>ROAS</span>
            </div>
            <div v-for="row in overview.topAdgroups" :key="row.id" class="table-row">
              <div class="table-main">
                <strong>{{ row.name }}</strong>
                <span>{{ row.campaignName }}</span>
              </div>
              <span>{{ formatCurrency(row.spend) }}</span>
              <span>{{ formatInteger(row.purchaseConversions) }}</span>
              <span>{{ formatPercent(row.roas) }}</span>
            </div>
          </div>
        </div>

        <div class="card table-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">키워드 인사이트</h3>
              <span class="section-caption">계정 전체 키워드 중 성과가 먼저 보이는 항목만 추렸습니다.</span>
            </div>
          </div>
          <div v-if="overview.topKeywords.length === 0" class="empty-inline">키워드 데이터가 없습니다.</div>
          <div v-else class="table-list">
            <div class="table-head">
              <span>키워드</span>
              <span>광고비</span>
              <span>구매 전환매출</span>
              <span>ROAS</span>
            </div>
            <div v-for="row in overview.topKeywords" :key="row.id" class="table-row">
              <div class="table-main">
                <strong>{{ row.keyword }}</strong>
                <span>{{ row.campaignName }} · {{ row.adgroupName }}</span>
              </div>
              <span>{{ formatCurrency(row.spend) }}</span>
              <span>{{ formatCurrency(row.purchaseConversionValue) }}</span>
              <span>{{ formatPercent(row.roas) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card related-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">연관 키워드</h3>
            <span class="section-caption">상위 키워드를 힌트로 검색량과 경쟁도를 같이 봅니다.</span>
          </div>
        </div>
        <div v-if="overview.relatedKeywords.length === 0" class="empty-inline">연관 키워드가 없습니다.</div>
        <div v-else class="related-grid">
          <article
            v-for="item in overview.relatedKeywords"
            :key="item.keyword"
            class="related-item"
          >
            <div class="related-head">
              <strong>{{ item.keyword }}</strong>
              <StatusBadge :label="item.competition" variant="neutral" />
            </div>
            <div class="related-stats">
              <div>
                <span>월간 PC 검색</span>
                <strong>{{ formatNullableCount(item.monthlyPcQueries) }}</strong>
              </div>
              <div>
                <span>월간 모바일 검색</span>
                <strong>{{ formatNullableCount(item.monthlyMobileQueries) }}</strong>
              </div>
              <div>
                <span>PC CTR</span>
                <strong>{{ formatPercent(item.monthlyPcCtr) }}</strong>
              </div>
              <div>
                <span>모바일 CTR</span>
                <strong>{{ formatPercent(item.monthlyMobileCtr) }}</strong>
              </div>
            </div>
          </article>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js'

import {
  type NaverSearchAdOverviewResponse,
  type NaverSearchAdTrendResponse,
} from '../../shared/naverSearchAd'
import { formatCompactCurrency, formatCurrency } from '~/composables/useMoneyFormat'
import { buildWeekOptions, weekCodeFromDate, weekDateTokensFromCode, weekLabelFromCode } from '~/composables/useWeekFilter'

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler)

const { selectedMonth, selectedPeriodLabel } = useAnalysisPeriod()
const trendDrillMonth = ref<string | null>(null)
const trendDrillWeek = ref('')
const trendDrillDate = ref('')

function isMonthToken(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value)
}

const selectedSearchMonth = computed(() => {
  return selectedMonth.value === 'all' ? 'all' : (isMonthToken(selectedMonth.value) ? selectedMonth.value : 'all')
})

const rootTrendMonth = computed(() => {
  return selectedSearchMonth.value === 'all' ? trendDrillMonth.value : selectedSearchMonth.value
})

const searchWeekOptions = computed(() => {
  if (selectedSearchMonth.value === 'all') return []
  return buildWeekOptions(selectedSearchMonth.value)
})

const searchDateOptions = computed(() => {
  if (!rootTrendMonth.value || !trendDrillWeek.value) return []
  return weekDateTokensFromCode(rootTrendMonth.value, trendDrillWeek.value, 'inMonth')
})

const overviewQuery = computed(() => {
  if (trendDrillDate.value) {
    return {
      since: trendDrillDate.value,
      until: trendDrillDate.value,
    }
  }

  if (rootTrendMonth.value && trendDrillWeek.value) {
    const tokens = weekDateTokensFromCode(rootTrendMonth.value, trendDrillWeek.value, 'inMonth')
    const first = tokens[0]
    const last = tokens[tokens.length - 1]
    if (first && last) {
      return {
        since: first,
        until: last,
      }
    }
  }

  if (rootTrendMonth.value) {
    return {
      month: rootTrendMonth.value,
    }
  }

  return {
    month: selectedSearchMonth.value,
  }
})

const { data, pending, error } = await useAsyncData<NaverSearchAdOverviewResponse>(
  'naver-searchad-overview',
  () => $fetch('/api/ads/naver-searchad/overview', {
    query: overviewQuery.value,
  }),
  {
    watch: [overviewQuery],
    default: () => ({
      preset: 'thisMonth',
      label: '이번 달',
      sourceLabel: '광고 기준',
      summary: {
        campaignCount: 0,
        adgroupCount: 0,
        keywordCount: 0,
        spend: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        avgCpc: 0,
        conversions: 0,
        purchaseConversions: 0,
        purchaseConversionValue: 0,
        roas: 0,
      },
      monthly: [],
      daily: [],
      topCampaigns: [],
      topAdgroups: [],
      topKeywords: [],
      relatedKeywords: [],
    }),
  },
)

const { data: drillData, pending: drillPending } = await useAsyncData<NaverSearchAdTrendResponse>(
  'naver-searchad-trend',
  () => {
    if (!rootTrendMonth.value || rootTrendMonth.value === 'all') return Promise.resolve({ month: '', daily: [] })
    return $fetch('/api/ads/naver-searchad/trend', {
      query: {
        month: rootTrendMonth.value,
      },
    })
  },
  {
    watch: [rootTrendMonth],
    default: () => ({
      month: '',
      daily: [],
    }),
  },
)

const overview = computed(() => data.value!)
const trendDaily = computed(() => drillData.value?.daily || [])
const trendChartCanvas = ref<HTMLCanvasElement | null>(null)
const trendChartInstance = ref<Chart | null>(null)
const trendLabels = ref<string[]>([])
const trendSpendValues = ref<number[]>([])
const trendRevenueValues = ref<number[]>([])
const trendClickKeys = ref<string[]>([])

function formatInteger(value: number | null | undefined): string {
  const normalized = Number(value || 0)
  return normalized.toLocaleString('ko-KR')
}

function formatPercent(value: number | null | undefined): string {
  const normalized = Number(value || 0)
  return `${normalized.toLocaleString('ko-KR', {
    minimumFractionDigits: normalized % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`
}

function formatNullableCount(value: number | null): string {
  if (value === null) return '—'
  return value.toLocaleString('ko-KR')
}

function formatMonthLabel(monthToken: string): string {
  const [year, month] = String(monthToken || '').split('-')
  if (!year || !month) return monthToken
  return `${year}.${month}`
}

function formatDayLabel(dateToken: string): string {
  const day = Number(String(dateToken || '').slice(8, 10))
  if (!Number.isFinite(day)) return dateToken
  return `${day}일`
}

function formatDateLabel(dateToken: string): string {
  const text = String(dateToken || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  return text.replace(/-/g, '.')
}

function statusLabel(status: string): string {
  if (status === 'ELIGIBLE') return '운영중'
  if (status === 'PAUSED') return '중지'
  return status
}

function statusVariant(status: string): 'success' | 'warning' | 'neutral' {
  if (status === 'ELIGIBLE') return 'success'
  if (status === 'PAUSED') return 'warning'
  return 'neutral'
}

const trendCanGoBack = computed(() => {
  if (trendDrillDate.value) return true
  if (selectedSearchMonth.value === 'all') return Boolean(trendDrillWeek.value || trendDrillMonth.value)
  return Boolean(trendDrillWeek.value)
})
const trendLoading = computed(() => Boolean(rootTrendMonth.value) && drillPending.value)
const currentRangeLabel = computed(() => {
  if (trendDrillDate.value) return formatDateLabel(trendDrillDate.value)
  if (rootTrendMonth.value && trendDrillWeek.value) return weekLabelFromCode(rootTrendMonth.value, trendDrillWeek.value)
  if (rootTrendMonth.value) return formatMonthLabel(rootTrendMonth.value)
  return selectedPeriodLabel.value
})

const trendCardTitle = computed(() => {
  if (!rootTrendMonth.value) return '월별 전체 광고 흐름'
  if (trendDrillDate.value) return `${formatDateLabel(trendDrillDate.value)} 광고 흐름`
  if (!trendDrillWeek.value) return `${formatMonthLabel(rootTrendMonth.value)} 광고 흐름`
  return `${weekLabelFromCode(rootTrendMonth.value, trendDrillWeek.value)} 광고 흐름`
})

const trendRangeLabel = computed(() => {
  if (!rootTrendMonth.value) {
    if (trendLabels.value.length === 0) return '광고 데이터 없음'
    if (trendLabels.value.length === 1) return trendLabels.value[0]
    return `${trendLabels.value[0]} ~ ${trendLabels.value[trendLabels.value.length - 1]}`
  }
  if (trendDrillDate.value) return `${formatDateLabel(trendDrillDate.value)} · 일별 선택`
  if (!trendDrillWeek.value) return `${formatMonthLabel(rootTrendMonth.value)} · 주차별`
  return `${weekLabelFromCode(rootTrendMonth.value, trendDrillWeek.value)} · 일별`
})

const trendHelperLabel = computed(() => {
  if (!rootTrendMonth.value) return '월을 누르면 해당 월의 주차별 광고 흐름을 볼 수 있습니다.'
  if (trendDrillDate.value) return '선택한 날짜 기준으로 상단 지표와 목록이 함께 갱신됩니다.'
  if (!trendDrillWeek.value) return '주차를 누르면 해당 주차의 일별 광고 흐름으로 내려갑니다.'
  return '일자를 누르면 해당 날짜 기준으로 지표와 목록을 다시 볼 수 있습니다.'
})

watch(
  () => overview.value.monthly,
  (rows) => {
    if (selectedSearchMonth.value === 'all' && trendDrillMonth.value && !rows.some((row) => row.month === trendDrillMonth.value)) {
      trendDrillMonth.value = null
      trendDrillWeek.value = ''
    }
  },
  { immediate: true, deep: true },
)

watch(
  () => rootTrendMonth.value,
  () => {
    trendDrillWeek.value = ''
    trendDrillDate.value = ''
  },
)

watch(
  () => trendDrillWeek.value,
  () => {
    trendDrillDate.value = ''
  },
)

watch(
  () => selectedSearchMonth.value,
  () => {
    trendDrillMonth.value = null
    trendDrillWeek.value = ''
    trendDrillDate.value = ''
  },
)

function resetTrendDrilldown() {
  if (selectedSearchMonth.value === 'all') {
    trendDrillMonth.value = null
  }
  trendDrillWeek.value = ''
  trendDrillDate.value = ''
}

function clearTrendWeek() {
  trendDrillWeek.value = ''
  trendDrillDate.value = ''
}

function stepBackTrendDrilldown() {
  if (trendDrillDate.value) {
    trendDrillDate.value = ''
    return
  }
  if (trendDrillWeek.value) {
    trendDrillWeek.value = ''
    return
  }
  if (selectedSearchMonth.value === 'all') {
    trendDrillMonth.value = null
  }
}

function applyTrendSeries() {
  if (!rootTrendMonth.value) {
    trendClickKeys.value = overview.value.monthly.map((row) => row.month)
    trendLabels.value = overview.value.monthly.map((row) => row.label)
    trendSpendValues.value = overview.value.monthly.map((row) => row.spend)
    trendRevenueValues.value = overview.value.monthly.map((row) => row.purchaseConversionValue)
    return
  }

  if (!trendDrillWeek.value) {
    const weekOptions = buildWeekOptions(rootTrendMonth.value)
    const spendMap = new Map<string, number>(weekOptions.map((option) => [option.value, 0]))
    const revenueMap = new Map<string, number>(weekOptions.map((option) => [option.value, 0]))

    for (const row of trendDaily.value) {
      const weekCode = weekCodeFromDate(row.date, rootTrendMonth.value)
      if (!spendMap.has(weekCode)) continue
      spendMap.set(weekCode, (spendMap.get(weekCode) || 0) + row.spend)
      revenueMap.set(weekCode, (revenueMap.get(weekCode) || 0) + row.purchaseConversionValue)
    }

    trendClickKeys.value = weekOptions.map((option) => option.value)
    trendLabels.value = weekOptions.map((option) => option.label.split(' ')[0])
    trendSpendValues.value = weekOptions.map((option) => spendMap.get(option.value) || 0)
    trendRevenueValues.value = weekOptions.map((option) => revenueMap.get(option.value) || 0)
    return
  }

  const dateTokens = weekDateTokensFromCode(rootTrendMonth.value, trendDrillWeek.value, 'inMonth')
  const spendMap = new Map<string, number>(dateTokens.map((token) => [token, 0]))
  const revenueMap = new Map<string, number>(dateTokens.map((token) => [token, 0]))

  for (const row of trendDaily.value) {
    if (!spendMap.has(row.date)) continue
    spendMap.set(row.date, (spendMap.get(row.date) || 0) + row.spend)
    revenueMap.set(row.date, (revenueMap.get(row.date) || 0) + row.purchaseConversionValue)
  }

  trendClickKeys.value = dateTokens
  trendLabels.value = dateTokens.map((token) => formatDayLabel(token))
  trendSpendValues.value = dateTokens.map((token) => spendMap.get(token) || 0)
  trendRevenueValues.value = dateTokens.map((token) => revenueMap.get(token) || 0)
}

async function handleRefresh() {
  data.value = await $fetch('/api/ads/naver-searchad/overview', {
    query: {
      ...overviewQuery.value,
      force: 1,
    },
  })

  if (rootTrendMonth.value) {
    drillData.value = await $fetch('/api/ads/naver-searchad/trend', {
      query: {
        month: rootTrendMonth.value,
        force: 1,
      },
    })
  }
}

function renderTrendChart() {
  if (!trendChartCanvas.value) return
  if (trendChartInstance.value) {
    trendChartInstance.value.destroy()
    trendChartInstance.value = null
  }

  if (trendLabels.value.length === 0) return

  trendChartInstance.value = new Chart(trendChartCanvas.value, {
    type: 'line',
    data: {
      labels: trendLabels.value,
      datasets: [
        {
          label: '광고비',
          data: trendSpendValues.value,
          borderColor: '#1D63E9',
          backgroundColor: 'rgba(29, 99, 233, 0.10)',
          borderWidth: 2.5,
          pointRadius: trendDrillWeek.value ? 3 : 4,
          pointHoverRadius: trendDrillWeek.value ? 5 : 6,
          pointBackgroundColor: '#1D63E9',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.28,
          fill: true,
        },
        {
          label: '구매 전환매출',
          data: trendRevenueValues.value,
          borderColor: '#0F9D58',
          backgroundColor: 'rgba(15, 157, 88, 0.08)',
          borderWidth: 2.25,
          pointRadius: trendDrillWeek.value ? 3 : 4,
          pointHoverRadius: trendDrillWeek.value ? 5 : 6,
          pointBackgroundColor: '#0F9D58',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.28,
          fill: false,
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

        if (!rootTrendMonth.value) {
          trendDrillMonth.value = key
          return
        }

        if (!trendDrillWeek.value) {
          trendDrillWeek.value = key
          return
        }

        trendDrillDate.value = key
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            color: '#64748B',
          },
        },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label} ${formatCurrency(Number(ctx.parsed.y || 0))}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#94A3B8',
            font: { size: 11 },
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#EEF2F7' },
          ticks: {
            color: '#94A3B8',
            font: { size: 11 },
            callback: (value) => formatCompactCurrency(Number(value)),
          },
        },
      },
    },
  })
}

watch(
  () => [overview.value.monthly, trendDaily.value, trendDrillMonth.value, trendDrillWeek.value, trendDrillDate.value],
  () => {
    applyTrendSeries()
  },
  { immediate: true, deep: true },
)

watch(
  () => [pending.value, trendLoading.value, trendChartCanvas.value, trendLabels.value, trendSpendValues.value, trendRevenueValues.value],
  async ([isPending, isTrendLoading, canvas]) => {
    if (isPending || isTrendLoading || !canvas) return
    await nextTick()
    renderTrendChart()
  },
  { immediate: true, deep: true, flush: 'post' },
)

onBeforeUnmount(() => {
  if (trendChartInstance.value) {
    trendChartInstance.value.destroy()
    trendChartInstance.value = null
  }
})
</script>

<style scoped>
.search-ads-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
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
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
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

.refresh-chip {
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #475569;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.refresh-chip {
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: #fff;
}

.refresh-chip:disabled {
  opacity: 0.6;
  cursor: default;
}

.primary-summary-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.secondary-summary-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.metric-card {
  border-radius: 18px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: #fff;
  padding: 20px;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metric-card--primary {
  background: #FFFFFF;
}

.metric-card--secondary {
  box-shadow: none;
}

.metric-label {
  font-size: 12px;
  font-weight: 700;
  color: #64748B;
}

.metric-value {
  font-size: 28px;
  line-height: 1.15;
  letter-spacing: -0.03em;
  color: #0F172A;
}

.metric-card--secondary .metric-value {
  font-size: 22px;
}

.metric-foot {
  font-size: 12px;
  color: #94A3B8;
}

.content-grid {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.95fr);
}

.trend-card,
.leaderboard-card,
.table-card,
.related-card {
  padding: 24px;
}

.card-header-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dashboard-card-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.dashboard-card-head-between {
  justify-content: space-between;
}

.trend-card-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trend-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: #F8FAFD;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

button.trend-drill-pill {
  cursor: pointer;
}

.trend-drill-pill.active {
  border-color: rgba(29, 99, 233, 0.22);
  background: #FFFFFF;
  color: #1D4ED8;
}

.trend-card-helper {
  font-size: 13px;
  color: #64748B;
}

.chart-shell {
  height: 340px;
}

.chart-shell--trend {
  height: 360px;
}

.leaderboard-list,
.table-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.leaderboard-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #F1F5F9;
}

.leaderboard-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.leaderboard-rank {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 800;
  color: #4E5968;
  background: #F2F4F8;
}

.leaderboard-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.leaderboard-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.leaderboard-copy strong,
.table-main strong,
.related-head strong {
  font-size: 15px;
  color: #0F172A;
}

.leaderboard-copy span,
.leaderboard-side small,
.table-main span,
.section-caption {
  font-size: 12px;
  color: #64748B;
}

.leaderboard-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.leaderboard-side strong {
  font-size: 18px;
  color: #0F172A;
}

.table-head,
.table-row {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) 100px 100px 80px;
  gap: 12px;
  align-items: center;
}

.table-head {
  padding-bottom: 10px;
  border-bottom: 1px solid #E2E8F0;
  font-size: 12px;
  font-weight: 700;
  color: #64748B;
}

.table-row {
  padding: 14px 0;
  border-bottom: 1px solid #F1F5F9;
  font-size: 13px;
  color: #0F172A;
}

.table-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.table-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.related-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.related-item {
  border-radius: 14px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: #FFFFFF;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.related-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.related-stats {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.related-stats span {
  display: block;
  font-size: 11px;
  color: #64748B;
  margin-bottom: 4px;
}

.related-stats strong {
  font-size: 14px;
  color: #0F172A;
}

.loading-card,
.empty-card {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (max-width: 1280px) {
  .primary-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .secondary-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .related-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .content-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .primary-summary-grid {
    grid-template-columns: 1fr;
  }

  .secondary-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .table-head,
  .table-row {
    grid-template-columns: minmax(0, 1.5fr) 90px 90px 70px;
  }
}

@media (max-width: 720px) {
  .page-header {
    padding: 0;
  }

  .primary-summary-grid,
  .secondary-summary-grid,
  .related-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .page-header-actions,
  .trend-card-actions,
  .dashboard-card-head-between {
    flex-direction: column;
    align-items: flex-start;
  }

  .chart-shell--trend {
    height: 300px;
  }

  .table-head {
    display: none;
  }

  .table-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    padding: 14px 0;
  }
}
</style>
