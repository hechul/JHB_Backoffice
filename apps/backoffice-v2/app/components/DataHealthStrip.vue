<template>
  <div class="card data-health-strip">
    <div class="data-health-strip-head">
      <div class="data-health-strip-copy">
        <div class="data-health-strip-title-row">
          <strong class="data-health-strip-title">데이터 상태</strong>
          <StatusBadge
            v-if="summary"
            :label="summary.usedFallbackMonth ? `${summary.resolvedLabel} 기준` : selectedPeriodLabel"
            variant="neutral"
          />
        </div>
        <span class="data-health-strip-caption">
          {{ headerCaption }}
        </span>
      </div>
      <div class="data-health-strip-actions">
        <StatusBadge
          v-if="summary"
          :label="`결제 반영률 ${summary.totalPaymentCoverage}%`"
          :variant="summary.paymentVariant"
          dot
        />
        <StatusBadge
          v-if="summary"
          :label="`정산 반영률 ${summary.totalSettlementCoverage}%`"
          :variant="summary.settlementVariant"
          dot
        />
        <NuxtLink to="/data-trust" class="btn btn-secondary btn-sm">
          자세히 보기
        </NuxtLink>
      </div>
    </div>

    <div v-if="loading" class="data-health-placeholder">
      데이터 상태를 불러오는 중입니다.
    </div>

    <div v-else-if="errorMessage" class="data-health-alert data-health-alert--danger">
      <strong>데이터 상태를 확인하지 못했습니다.</strong>
      <span>{{ errorMessage }}</span>
    </div>

    <template v-else-if="summary">
      <div v-if="summary.blockingMessage" class="data-health-alert data-health-alert--danger">
        <strong>금액 지표 확인 필요</strong>
        <span>{{ summary.blockingMessage }}</span>
      </div>

      <div v-else-if="summary.paymentVariant === 'warning'" class="data-health-alert data-health-alert--warning">
        <strong>부분 반영 구간이 있습니다.</strong>
        <span>결제 금액을 채널별로 다시 확인해 주세요.</span>
      </div>

      <div class="data-health-grid">
        <div
          v-for="item in summary.items"
          :key="item.key"
          class="data-health-item"
        >
          <div class="data-health-item-top">
            <div>
              <strong class="data-health-item-title">{{ item.label }}</strong>
              <span class="data-health-item-meta">{{ item.basisLabel }} · 주문 {{ item.eligibleRows }}건</span>
            </div>
            <StatusBadge :label="item.statusLabel" :variant="item.coverageVariant" dot />
          </div>

          <div class="data-health-item-stat-row">
            <span>결제 금액</span>
            <strong>{{ item.paymentCoveredRows }}/{{ item.eligibleRows }}건 · {{ item.paymentCoverage }}%</strong>
          </div>
          <div class="data-health-item-stat-row">
            <span>정산 예정</span>
            <strong>{{ item.settlementCoveredRows }}/{{ item.eligibleRows }}건 · {{ item.settlementCoverage }}%</strong>
          </div>

          <div class="data-health-item-foot">
            <span>최근 주문 {{ item.latestOrderDate || '-' }}</span>
            <span>{{ item.latestSuccessAt ? `마지막 성공 ${formatDataTrustTimestamp(item.latestSuccessAt)}` : item.latestRunStatusLabel }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { fetchDataTrustSnapshot, formatDataTrustTimestamp, type DataTrustSummary } from '~/composables/useDataTrust'

const supabase = useSupabaseClient()
const { selectedMonth, selectedPeriodLabel, availableMonths } = useAnalysisPeriod()
const { profileLoaded, profileRevision } = useCurrentUser()

const loading = ref(false)
const errorMessage = ref('')
const summary = ref<DataTrustSummary | null>(null)
const fetchSeq = ref(0)

const headerCaption = computed(() => {
  if (loading.value) return '반영 상태를 점검하는 중입니다.'
  if (!summary.value) return '채널별 결제·정산 반영률을 확인합니다.'
  if (summary.value.totalEligibleRows <= 0) return '선택한 구간에 확인할 주문이 없습니다.'
  if (summary.value.usedFallbackMonth) return '전체 기간 선택 시 최신 데이터가 있는 월을 기준으로 표시합니다.'
  return '채널별 결제·정산 반영률과 최근 동기화 상태를 함께 봅니다.'
})

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
    errorMessage.value = String(error?.message || '데이터 상태를 불러오지 못했습니다.')
  } finally {
    if (fetchSeq.value === seq) {
      loading.value = false
    }
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
.data-health-strip {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 18px;
}

.data-health-strip-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.data-health-strip-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.data-health-strip-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.data-health-strip-title {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.data-health-strip-caption {
  font-size: 0.88rem;
  color: #64748b;
}

.data-health-strip-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.data-health-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 16px;
  padding: 12px 14px;
  font-size: 0.88rem;
}

.data-health-alert strong {
  font-size: 0.9rem;
}

.data-health-alert--danger {
  background: #fff1f2;
  color: #b42318;
  border: 1px solid #fecdd3;
}

.data-health-alert--warning {
  background: #fff7ed;
  color: #b45309;
  border: 1px solid #fed7aa;
}

.data-health-placeholder {
  border: 1px dashed rgba(148, 163, 184, 0.5);
  border-radius: 16px;
  padding: 16px;
  color: #64748b;
  font-size: 0.9rem;
}

.data-health-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.data-health-item {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 18px;
  background: #f8fbff;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.data-health-item-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.data-health-item-title {
  display: block;
  font-size: 0.95rem;
  color: #0f172a;
}

.data-health-item-meta {
  display: block;
  margin-top: 4px;
  font-size: 0.8rem;
  color: #64748b;
}

.data-health-item-stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.84rem;
  color: #475569;
}

.data-health-item-stat-row strong {
  font-size: 0.86rem;
  color: #0f172a;
}

.data-health-item-foot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.79rem;
  color: #64748b;
}

@media (max-width: 900px) {
  .data-health-strip-head {
    flex-direction: column;
  }

  .data-health-strip-actions {
    justify-content: flex-start;
  }
}
</style>
