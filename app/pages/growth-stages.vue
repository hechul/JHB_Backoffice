<template>
  <div class="growth-page">
    <div class="card growth-hero">
      <div>
        <div class="growth-hero-head">
          <StatusBadge :label="selectedPeriodLabel" variant="neutral" />
          <StatusBadge :label="`${insights.totalCustomers.toLocaleString()}명 고객`" variant="info" />
          <StatusBadge :label="`${insights.realPurchases.toLocaleString()}건 실구매`" variant="success" />
        </div>
        <h1 class="growth-title">고객 성장 단계</h1>
        <p class="growth-desc">지금 고객이 어느 단계에 몰려 있는지, 누가 실제로 올라가고 있는지, 어느 단계에서 정체되는지를 한 화면에서 확인합니다.</p>
      </div>
      <NuxtLink to="/dashboard" class="btn btn-secondary btn-sm growth-back-link">
        <BarChart3 :size="14" :stroke-width="2" />
        대시보드로 돌아가기
      </NuxtLink>
    </div>

    <div v-if="loading" class="card growth-loading">고객 성장 단계 데이터를 불러오는 중입니다.</div>

    <template v-else>
      <div class="growth-summary-grid">
        <div v-for="summary in insights.summaries" :key="summary.stage" class="card stage-summary-card">
          <div class="stage-summary-top">
            <StatusBadge :label="summary.label" :variant="badgeVariant(summary.stage)" />
            <span class="stage-summary-ratio">전체 {{ summary.ratio }}%</span>
          </div>
          <div class="stage-summary-count">{{ summary.count.toLocaleString() }}명</div>
          <div class="stage-summary-meter">
            <div class="stage-summary-meter-fill" :class="`stage-fill-${summary.stage.toLowerCase()}`" :style="{ width: `${summary.ratio}%` }"></div>
          </div>
          <div class="stage-summary-meta">
            <span>재구매 {{ summary.repeatCustomers.toLocaleString() }}명</span>
            <span>이탈 위험 {{ summary.churnCustomers.toLocaleString() }}명</span>
            <span>평균 구매횟수 {{ summary.avgPurchaseCount }}</span>
          </div>
          <button class="btn btn-ghost btn-sm stage-summary-action" @click="navigateToCustomers(summary.stage)">
            {{ summary.label }} 고객 보기
            <MoveRight :size="14" :stroke-width="2" />
          </button>
        </div>
      </div>

      <div class="growth-overview-grid">
        <div class="card">
          <div class="card-header growth-card-header compact">
            <div>
              <h3 class="card-title">성장 단계 분포</h3>
              <p class="card-caption">현재 고객이 어디에 가장 많이 몰려 있는지 비중으로 봅니다.</p>
            </div>
          </div>
          <div class="distribution-list">
            <div v-for="row in distributionRows" :key="row.stage" class="distribution-item">
              <div class="distribution-head">
                <div class="distribution-label-wrap">
                  <StatusBadge :label="row.label" :variant="badgeVariant(row.stage)" />
                  <span class="distribution-sub">{{ row.count.toLocaleString() }}명</span>
                </div>
                <span class="distribution-percent">{{ row.ratio }}%</span>
              </div>
              <div class="distribution-track">
                <div class="distribution-fill" :class="`distribution-fill-${row.stage.toLowerCase()}`" :style="{ width: `${row.ratio}%` }"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header growth-card-header compact">
            <div>
              <h3 class="card-title">지금 봐야 할 신호</h3>
              <p class="card-caption">대표님 관점에서 바로 판단 가능한 핵심 상태입니다.</p>
            </div>
          </div>
          <div class="signal-grid">
            <div v-for="signal in signalCards" :key="signal.label" class="signal-card">
              <span class="signal-label">{{ signal.label }}</span>
              <strong class="signal-value">{{ signal.value }}</strong>
              <span class="signal-desc">{{ signal.description }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="growth-main-grid">
        <div class="card">
          <div class="card-header growth-card-header compact">
            <div>
              <h3 class="card-title">단계 전환 퍼널</h3>
              <p class="card-caption">각 단계에서 다음 단계로 실제로 얼마나 넘어갔는지 전환 수와 전환율을 같이 봅니다.</p>
            </div>
          </div>
          <div class="funnel-list">
            <div v-for="item in transitionRows" :key="item.key" class="funnel-item">
              <div class="funnel-head">
                <span class="funnel-label">{{ item.label }}</span>
                <span class="funnel-count">{{ item.count.toLocaleString() }}명</span>
              </div>
              <div class="funnel-track">
                <div class="funnel-fill" :style="{ width: `${item.rate}%` }"></div>
              </div>
              <div class="funnel-foot">
                <span>{{ stageLabel(item.fromStage) }} 고객 대비 {{ item.rate }}%</span>
                <button class="btn btn-ghost btn-sm transition-action" @click="navigateToCustomers(item.toStage)">
                  {{ stageLabel(item.toStage) }} 고객 보기
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header growth-card-header compact">
            <div>
              <h3 class="card-title">단계별 행동</h3>
              <p class="card-caption">각 단계 고객이 얼마나 다시 사고, 어디서 이탈하는지 행동 지표로 비교합니다.</p>
            </div>
          </div>
          <div class="behavior-list">
            <div v-for="row in behaviorRows" :key="row.stage" class="behavior-item">
              <div class="behavior-top">
                <StatusBadge :label="row.label" :variant="badgeVariant(row.stage)" />
                <span class="behavior-count">{{ row.count.toLocaleString() }}명</span>
              </div>
              <div class="behavior-metric">
                <div class="behavior-label-row">
                  <span>재구매율</span>
                  <strong>{{ row.repeatRate }}%</strong>
                </div>
                <div class="behavior-track">
                  <div class="behavior-fill behavior-fill-repeat" :style="{ width: `${row.repeatRate}%` }"></div>
                </div>
              </div>
              <div class="behavior-metric">
                <div class="behavior-label-row">
                  <span>이탈위험 비중</span>
                  <strong>{{ row.churnRate }}%</strong>
                </div>
                <div class="behavior-track">
                  <div class="behavior-fill behavior-fill-churn" :style="{ width: `${row.churnRate}%` }"></div>
                </div>
              </div>
              <div class="behavior-foot">
                <span>평균 구매횟수 {{ row.avgPurchaseCount }}</span>
                <span>재구매 {{ row.repeatCustomers }}명</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="growth-detail-grid">
        <div class="card">
          <div class="card-header growth-card-header compact">
            <div>
              <h3 class="card-title">최근 단계 전환 고객</h3>
              <p class="card-caption">최근 실제로 승급한 고객 흐름입니다.</p>
            </div>
          </div>
          <div v-if="insights.recentTransitions.length === 0" class="empty-inline">최근 전환 고객이 없습니다.</div>
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

        <div class="card">
          <div class="card-header growth-card-header compact">
            <div>
              <h3 class="card-title">다음 액션</h3>
              <p class="card-caption">지금 바로 밀어야 할 고객군입니다.</p>
            </div>
          </div>
          <div class="action-board">
            <div v-for="group in insights.candidates" :key="group.stage" class="action-block">
              <div class="action-block-head">
                <StatusBadge :label="group.label" :variant="badgeVariant(group.stage)" />
                <span class="action-block-count">{{ group.customers.length }}명</span>
              </div>
              <p class="action-block-desc">{{ group.description }}</p>
              <div v-if="group.customers.length === 0" class="empty-inline action-empty">대상 고객이 없습니다.</div>
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
      </div>

      <div class="growth-product-grid">
        <div v-for="group in insights.stageProducts" :key="group.stage" class="card product-group-card">
          <div class="card-header growth-card-header compact">
            <div>
              <h3 class="card-title">{{ group.label }} 인기 상품</h3>
              <p class="card-caption">현재 {{ group.label }} 단계 고객이 실제로 많이 구매한 상품입니다.</p>
            </div>
          </div>
          <div v-if="group.products.length === 0" class="empty-inline">표시할 상품이 없습니다.</div>
          <div v-else class="product-rank-list">
            <div v-for="(item, index) in group.products" :key="`${group.stage}-${item.name}-${item.optionInfo}-${index}`" class="product-rank-item">
              <span class="product-rank-index">{{ index + 1 }}</span>
              <div class="product-rank-info">
                <span class="product-rank-name">{{ item.name }}</span>
                <span class="product-rank-option">옵션 {{ item.optionInfo }}</span>
                <span class="product-rank-meta">{{ item.pet }} · {{ item.stage }}</span>
              </div>
              <span class="product-rank-count">{{ formatGrowthCount(item.count) }}개</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { BarChart3, ChevronRight, MoveRight } from 'lucide-vue-next'
import { fetchGrowthInsights, formatGrowthCount, growthStageBadgeVariant, type GrowthInsightsResult } from '~/composables/useGrowthInsights'
import { customerStageLabel, type CustomerStageCode } from '~/composables/useGrowthStage'

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

function stageLabel(stage: CustomerStageCode) {
  return customerStageLabel(stage)
}

function badgeVariant(stage: CustomerStageCode) {
  return growthStageBadgeVariant(stage)
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

const signalCards = computed(() => {
  const highestStage = [...insights.value.summaries].sort((a, b) => b.count - a.count)[0]
  const latestTransition = transitionRows.value.sort((a, b) => b.count - a.count)[0]
  const stuckEntry = insights.value.customers.filter((customer) => customer.stage === 'Entry' && customer.purchaseCount >= 2).length
  const stuckGrowth = insights.value.customers.filter((customer) => customer.stage === 'Growth' && customer.purchaseCount >= 2).length
  const recentUpgradeCount = insights.value.recentTransitions.length

  return [
    {
      label: '고객이 가장 몰린 단계',
      value: highestStage ? `${highestStage.label} ${highestStage.ratio}%` : '-',
      description: highestStage ? `${highestStage.count.toLocaleString()}명이 현재 이 단계에 머물러 있습니다.` : '데이터가 없습니다.',
    },
    {
      label: '가장 활발한 전환 구간',
      value: latestTransition ? latestTransition.label : '-',
      description: latestTransition ? `${latestTransition.count.toLocaleString()}명이 이 구간에서 실제로 승급했습니다.` : '전환 데이터가 없습니다.',
    },
    {
      label: '입문 정체 고객',
      value: `${stuckEntry.toLocaleString()}명`,
      description: '입문 단계에서 2회 이상 구매했지만 아직 성장으로 못 올라간 고객입니다.',
    },
    {
      label: '성장 정체 고객',
      value: `${stuckGrowth.toLocaleString()}명`,
      description: '성장 단계에서 반복 구매 중이지만 아직 핵심으로 못 올라간 고객입니다.',
    },
    {
      label: '최근 승급 고객',
      value: `${recentUpgradeCount.toLocaleString()}명`,
      description: '최근 전환 리스트에 잡힌 고객 수입니다.',
    },
  ]
})

function navigateToCustomers(stage?: CustomerStageCode) {
  const query: Record<string, string> = {}
  if (selectedMonth.value !== 'all') query.month = selectedMonth.value
  if (stage) query.stage = stage
  navigateTo({ path: '/customers', query })
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

.growth-hero-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.growth-title {
  font-size: 1.85rem;
  line-height: 1.2;
  font-weight: 700;
  color: var(--color-text);
}

.growth-desc {
  margin-top: var(--space-sm);
  max-width: 760px;
  font-size: 1rem;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.growth-back-link {
  flex-shrink: 0;
}

.growth-loading {
  padding: 32px;
  text-align: center;
  color: var(--color-text-secondary);
}

.growth-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-lg);
}

.growth-overview-grid,
.growth-main-grid,
.growth-detail-grid,
.growth-product-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-lg);
}

.stage-summary-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.stage-summary-top,
.distribution-head,
.funnel-head,
.action-block-head,
.behavior-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.stage-summary-ratio,
.distribution-percent,
.funnel-count,
.action-block-count,
.behavior-count {
  font-size: 0.95rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.stage-summary-count {
  font-size: 2rem;
  line-height: 1.05;
  font-weight: 700;
  color: var(--color-text);
}

.stage-summary-meter,
.distribution-track,
.funnel-track,
.behavior-track {
  height: 10px;
  width: 100%;
  background: #eef2f7;
  border-radius: 999px;
  overflow: hidden;
}

.stage-summary-meter-fill,
.distribution-fill,
.funnel-fill,
.behavior-fill {
  height: 100%;
  border-radius: 999px;
}

.stage-fill-entry,
.distribution-fill-entry {
  background: linear-gradient(90deg, #cbd5e1 0%, #94a3b8 100%);
}

.stage-fill-growth,
.distribution-fill-growth,
.funnel-fill {
  background: linear-gradient(90deg, #60a5fa 0%, #2563eb 100%);
}

.stage-fill-core,
.distribution-fill-core {
  background: linear-gradient(90deg, #22c55e 0%, #16a34a 100%);
}

.stage-fill-premium,
.distribution-fill-premium {
  background: linear-gradient(90deg, #f59e0b 0%, #d97706 100%);
}

.stage-summary-meta {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
  font-size: 0.92rem;
  color: var(--color-text-secondary);
}

.stage-summary-action,
.transition-action,
.action-link {
  align-self: flex-start;
}

.growth-card-header.compact {
  margin-bottom: var(--space-lg);
}

.distribution-list,
.funnel-list,
.behavior-list,
.transition-list,
.candidate-list,
.product-rank-list,
.action-board {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.distribution-item,
.funnel-item,
.behavior-item,
.transition-list-item,
.candidate-item,
.product-rank-item,
.action-block,
.signal-card {
  padding: 14px 16px;
  border: 1px solid var(--color-border-light);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.82);
}

.distribution-label-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.distribution-sub,
.funnel-foot,
.behavior-foot,
.transition-list-id,
.transition-list-date,
.candidate-id,
.candidate-meta,
.product-rank-option,
.product-rank-meta,
.action-block-desc,
.signal-desc {
  font-size: 0.92rem;
  color: var(--color-text-secondary);
}

.signal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm);
}

.signal-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.signal-label {
  font-size: 0.92rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.signal-value {
  font-size: 1.25rem;
  color: var(--color-text);
  line-height: 1.25;
}

.funnel-foot,
.behavior-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-top: 8px;
}

.behavior-metric {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.behavior-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  font-size: 0.94rem;
  color: var(--color-text-secondary);
}

.behavior-fill-repeat {
  background: linear-gradient(90deg, #60a5fa 0%, #2563eb 100%);
}

.behavior-fill-churn {
  background: linear-gradient(90deg, #fca5a5 0%, #ef4444 100%);
}

.transition-list-item,
.candidate-item,
.product-rank-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.transition-list-main,
.candidate-main,
.product-rank-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.transition-list-name,
.candidate-name,
.product-rank-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
}

.transition-list-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.transition-arrow {
  color: var(--color-text-muted);
}

.product-rank-index {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 700;
  flex-shrink: 0;
}

.product-rank-count {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
  flex-shrink: 0;
}

.candidate-list.compact,
.candidate-item.compact {
  gap: 8px;
}

.candidate-item.compact {
  padding: 10px 12px;
}

.candidate-meta.compact {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.action-board {
  gap: var(--space-md);
}

.action-empty {
  padding: 8px 0 0;
}

.empty-inline {
  padding: 18px 0;
  font-size: 0.96rem;
  color: var(--color-text-secondary);
}

@media (max-width: 1280px) {
  .growth-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .growth-overview-grid,
  .growth-main-grid,
  .growth-detail-grid,
  .growth-product-grid,
  .signal-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .growth-hero,
  .transition-list-item,
  .candidate-item,
  .product-rank-item,
  .funnel-foot,
  .behavior-foot {
    flex-direction: column;
    align-items: flex-start;
  }

  .growth-summary-grid {
    grid-template-columns: 1fr;
  }

  .transition-list-meta {
    justify-content: flex-start;
  }
}
</style>
