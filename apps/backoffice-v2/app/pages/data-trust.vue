<template>
  <div class="data-trust-page">
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">데이터 신뢰도</h1>
        <span class="page-caption">채널별 반영률과 동기화 상태</span>
      </div>
      <div class="page-header-actions">
        <StatusBadge :label="summary?.usedFallbackMonth ? `${summary.resolvedLabel} 기준` : selectedPeriodLabel" variant="neutral" />
        <StatusBadge v-if="loading" label="불러오는 중" variant="info" />
      </div>
    </div>

    <div class="trust-summary-grid">
      <KpiCard
        label="확인 대상 주문"
        :value="summary?.totalEligibleRows || 0"
        :icon="Database"
        icon-bg="#EEF2FF"
        icon-color="#4F46E5"
      />
      <KpiCard
        label="결제 반영률"
        :value="summary?.totalPaymentCoverage || 0"
        suffix="%"
        :icon="ShieldCheck"
        icon-bg="#EFF6FF"
        icon-color="#2563EB"
      />
      <KpiCard
        label="정산 반영률"
        :value="summary?.totalSettlementCoverage || 0"
        suffix="%"
        :icon="BadgeCheck"
        icon-bg="#ECFDF5"
        icon-color="#10B981"
      />
      <KpiCard
        label="확인 필요 범위"
        :value="blockingScopeCount"
        :icon="TriangleAlert"
        icon-bg="#FFF7ED"
        icon-color="#EA580C"
      />
    </div>

    <div v-if="loading" class="card trust-loading-card">데이터 신뢰도 정보를 불러오는 중입니다.</div>
    <div v-else-if="errorMessage" class="trust-banner trust-banner--danger">
      <strong>데이터 신뢰도 정보를 불러오지 못했습니다.</strong>
      <span>{{ errorMessage }}</span>
    </div>

    <template v-else-if="summary">
      <div v-if="summary.blockingMessage" class="trust-banner trust-banner--danger">
        <strong>금액 지표 확인 필요</strong>
        <span>{{ summary.blockingMessage }}</span>
      </div>

      <div class="trust-layout">
        <div class="card trust-channel-card">
          <div class="card-header trust-card-header">
            <h3 class="card-title">채널별 반영 현황</h3>
            <StatusBadge :label="summary.resolvedLabel" variant="neutral" />
          </div>
          <div v-if="summary.items.length === 0" class="empty-inline">선택한 구간에 확인할 주문이 없습니다.</div>
          <div v-else class="trust-channel-list">
            <div
              v-for="item in summary.items"
              :key="item.key"
              class="trust-channel-item"
            >
              <div class="trust-channel-top">
                <div>
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.basisLabel }} · 주문 {{ item.eligibleRows }}건</span>
                </div>
                <StatusBadge :label="item.statusLabel" :variant="item.coverageVariant" dot />
              </div>
              <div class="trust-channel-grid">
                <div class="trust-stat">
                  <span>결제 금액</span>
                  <strong>{{ item.paymentCoveredRows }}/{{ item.eligibleRows }}건</strong>
                  <span>{{ item.paymentCoverage }}%</span>
                </div>
                <div class="trust-stat">
                  <span>정산 예정</span>
                  <strong>{{ item.settlementCoveredRows }}/{{ item.eligibleRows }}건</strong>
                  <span>{{ item.settlementCoverage }}%</span>
                </div>
                <div class="trust-stat">
                  <span>최근 주문</span>
                  <strong>{{ item.latestOrderDate || '-' }}</strong>
                  <span>원본 기준</span>
                </div>
                <div class="trust-stat">
                  <span>마지막 성공</span>
                  <strong>{{ item.latestSuccessAt ? formatDataTrustTimestamp(item.latestSuccessAt) : '-' }}</strong>
                  <span>{{ item.latestRunStatusLabel }}</span>
                </div>
              </div>
              <div v-if="item.latestRunError" class="trust-inline-alert">
                {{ item.latestRunError }}
              </div>
            </div>
          </div>
        </div>

        <div class="card trust-runs-card">
          <div class="card-header trust-card-header">
            <h3 class="card-title">최근 동기화</h3>
            <StatusBadge :label="`${summary.recentRuns.length}건`" variant="neutral" />
          </div>
          <div v-if="summary.recentRuns.length === 0" class="empty-inline">표시할 동기화 이력이 없습니다.</div>
          <div v-else class="trust-run-list">
            <div v-for="run in summary.recentRuns" :key="run.id" class="trust-run-item">
              <div class="trust-run-top">
                <strong>{{ resolveDataTrustScopeLabel(normalizeScope(run.source_channel, 'excel'), normalizeScope(run.source_fulfillment_type, 'default')) }}</strong>
                <StatusBadge :label="resolveRunLabel(run.status)" :variant="resolveRunVariant(run.status)" dot />
              </div>
              <div class="trust-run-meta">
                <span>{{ formatDataTrustTimestamp(String(run.started_at || '')) }}</span>
                <span>{{ formatRunRange(run.requested_from, run.requested_to) }}</span>
              </div>
              <div v-if="run.error_message" class="trust-inline-alert">{{ run.error_message }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  BadgeCheck,
  Database,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-vue-next'
import {
  fetchDataTrustSnapshot,
  formatDataTrustTimestamp,
  resolveDataTrustScopeLabel,
  type DataTrustSummary,
} from '~/composables/useDataTrust'

const supabase = useSupabaseClient()
const { selectedMonth, selectedPeriodLabel, availableMonths } = useAnalysisPeriod()
const { profileLoaded, profileRevision } = useCurrentUser()

const loading = ref(false)
const summary = ref<DataTrustSummary | null>(null)
const fetchSeq = ref(0)
const errorMessage = ref('')

const blockingScopeCount = computed(() => {
  if (!summary.value) return 0
  return summary.value.items.filter((item) => item.coverageVariant === 'danger').length
})

function normalizeScope(value: unknown, fallback: string): string {
  return String(value || '').trim() || fallback
}

function resolveRunVariant(status: unknown): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'done') return 'success'
  if (normalized === 'partial' || normalized === 'running' || normalized === 'pending') return 'warning'
  if (normalized === 'failed') return 'danger'
  return 'neutral'
}

function resolveRunLabel(status: unknown): string {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'done') return '완료'
  if (normalized === 'partial') return '부분 성공'
  if (normalized === 'running') return '실행 중'
  if (normalized === 'pending') return '대기'
  if (normalized === 'failed') return '실패'
  return '미확인'
}

function formatRunRange(from: unknown, to: unknown): string {
  const fromToken = String(from || '').slice(0, 10)
  const toToken = String(to || '').slice(0, 10)
  if (!fromToken && !toToken) return '대상 범위 없음'
  if (fromToken === toToken) return fromToken
  return `${fromToken} ~ ${toToken}`
}

async function refresh() {
  if (!profileLoaded.value) return
  const seq = fetchSeq.value + 1
  fetchSeq.value = seq
  loading.value = true
  errorMessage.value = ''

  try {
    const next = await fetchDataTrustSnapshot({
      supabase,
      selectedMonth: selectedMonth.value,
      availableMonths: availableMonths.value,
    })
    if (fetchSeq.value !== seq) return
    summary.value = next
  } catch (error: any) {
    if (fetchSeq.value !== seq) return
    summary.value = null
    errorMessage.value = String(error?.message || '데이터 신뢰도 정보를 불러오지 못했습니다.')
  } finally {
    if (fetchSeq.value === seq) loading.value = false
  }
}

watch(
  () => [selectedMonth.value, availableMonths.value.map((item) => `${item.value}:${item.count}`).join(','), profileLoaded.value, profileRevision.value],
  () => {
    refresh()
  },
  { immediate: true },
)
</script>

<style scoped>
.data-trust-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.trust-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.trust-loading-card {
  color: #64748b;
}

.trust-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 18px;
  padding: 14px 16px;
  font-size: 0.92rem;
}

.trust-banner--danger {
  background: #fff1f2;
  color: #b42318;
  border: 1px solid #fecdd3;
}

.trust-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.9fr);
  gap: 16px;
}

.trust-card-header {
  align-items: center;
}

.trust-channel-list,
.trust-run-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trust-channel-item,
.trust-run-item {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 18px;
  background: #fbfdff;
  padding: 14px;
}

.trust-channel-top,
.trust-run-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.trust-channel-top strong,
.trust-run-top strong {
  display: block;
  color: #0f172a;
  font-size: 0.95rem;
}

.trust-channel-top span,
.trust-run-top span {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 0.8rem;
}

.trust-channel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.trust-stat {
  border-radius: 14px;
  background: #f8fafc;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.trust-stat span {
  color: #64748b;
  font-size: 0.78rem;
}

.trust-stat strong {
  color: #0f172a;
  font-size: 0.9rem;
}

.trust-run-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
  color: #64748b;
  font-size: 0.8rem;
}

.trust-inline-alert {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #fff7ed;
  color: #b45309;
  font-size: 0.8rem;
}

@media (max-width: 1024px) {
  .trust-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .trust-channel-grid {
    grid-template-columns: 1fr;
  }
}
</style>
