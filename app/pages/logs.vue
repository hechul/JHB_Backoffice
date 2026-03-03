<template>
  <div class="logs-page">
    <div class="card logs-period-card">
      <div class="logs-period-row">
        <span class="logs-period-label">조회 기간</span>
        <StatusBadge :label="selectedPeriodLabel" variant="neutral" />
      </div>
    </div>

    <!-- Tabs -->
    <div class="card">
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'filter' }"
          @click="activeTab = 'filter'"
        >
          분석 실행 이력
          <span class="tab-count">{{ filteredFilterLogs.length }}</span>
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'manual' }"
          @click="activeTab = 'manual'"
        >
          수동 분류 이력
          <span class="tab-count">{{ filteredManualLogs.length }}</span>
        </button>
      </div>

      <!-- Filter Logs -->
      <div v-if="activeTab === 'filter'">
        <div v-if="filteredFilterLogs.length === 0" class="pt-lg">
          <EmptyState title="해당 기간 실행 이력이 없습니다" description="다른 기간을 선택하거나 필터링을 실행해 주세요." />
        </div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th></th>
                <th>실행 시간</th>
                <th>대상 건수</th>
                <th>매칭</th>
                <th>미매칭</th>
                <th>상태</th>
                <th>소요 시간</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(log, i) in filteredFilterLogs" :key="log.id">
                <tr
                  class="clickable"
                  :class="{ 'row-error': log.status === 'error' }"
                  @click="toggleExpand('filter', i)"
                >
                  <td style="width:32px;">
                    <ChevronDown
                      :size="14"
                      :stroke-width="2"
                      :style="{ transform: expandedFilter === i ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s ease' }"
                    />
                  </td>
                  <td class="text-sm" style="font-family: var(--font-mono);">{{ log.timestamp }}</td>
                  <td>{{ log.totalCount.toLocaleString() }}건</td>
                  <td>
                    <span class="text-success font-medium">{{ log.matchCount }}</span>
                  </td>
                  <td>
                    <span class="text-danger font-medium">{{ log.unmatchCount }}</span>
                  </td>
                  <td>
                    <StatusBadge
                      :label="log.status === 'success' ? '완료' : log.status === 'error' ? '에러' : '실행 중'"
                      :variant="log.status === 'success' ? 'success' : log.status === 'error' ? 'danger' : 'warning'"
                      dot
                    />
                  </td>
                  <td class="text-sm text-secondary">{{ log.duration }}</td>
                </tr>
                <!-- Expanded Detail -->
                <tr v-if="expandedFilter === i" class="expanded-row">
                  <td colspan="7">
                    <div class="expanded-content">
                      <div class="expanded-grid">
                        <!-- Rank Distribution -->
                        <div class="expanded-section">
                          <div class="detail-section-title">단계별 분포</div>
                          <div class="rank-mini-list">
                            <div v-for="r in log.rankBreakdown" :key="r.rank" class="rank-mini-item">
                              <span class="rank-mini-label">{{ r.rank }}단계</span>
                              <div class="rank-mini-bar-wrap">
                                <div class="rank-mini-bar" :style="{ width: r.percent + '%' }"></div>
                              </div>
                              <span class="rank-mini-count">{{ r.count }}건</span>
                            </div>
                          </div>
                        </div>
                        <!-- Change Summary -->
                        <div class="expanded-section">
                          <div class="detail-section-title">변경 요약</div>
                          <div class="change-summary">
                            <div class="change-item">
                              <span class="change-label">신규 매칭</span>
                              <span class="text-success font-medium">+{{ log.newMatches }}</span>
                            </div>
                            <div class="change-item">
                              <span class="change-label">매칭 해제</span>
                              <span class="text-danger font-medium">-{{ log.removedMatches }}</span>
                            </div>
                            <div class="change-item">
                              <span class="change-label">수동 보호</span>
                              <span class="text-primary font-medium">{{ log.protectedCount }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <!-- Error Message -->
                      <div v-if="log.status === 'error'" class="alert alert-danger mt-md">
                        <AlertTriangle :size="14" :stroke-width="2" />
                        <span>{{ log.errorMessage }}</span>
                        <button class="btn btn-sm btn-danger" style="margin-left: auto;">재실행</button>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Manual Logs -->
      <div v-if="activeTab === 'manual'">
        <div v-if="filteredManualLogs.length === 0" class="pt-lg">
          <EmptyState title="해당 기간 수동 분류 이력이 없습니다" description="다른 기간을 선택하거나 필터 결과를 확인해 주세요." />
        </div>
        <div v-else class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th></th>
                <th>시간</th>
                <th>대상 주문</th>
                <th>변경 유형</th>
                <th>변경 전</th>
                <th>변경 후</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(log, i) in filteredManualLogs" :key="log.id">
                <tr class="clickable" @click="toggleExpand('manual', i)">
                  <td style="width:32px;">
                    <ChevronDown
                      :size="14"
                      :stroke-width="2"
                      :style="{ transform: expandedManual === i ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s ease' }"
                    />
                  </td>
                  <td class="text-sm" style="font-family: var(--font-mono);">{{ log.timestamp }}</td>
                  <td class="font-medium" style="font-family: var(--font-mono); font-size: 0.75rem;">{{ log.orderId }}</td>
                  <td>
                    <StatusBadge
                      :label="log.changeType"
                      :variant="log.changeType === '체험단→실구매' ? 'success' : 'danger'"
                    />
                  </td>
                  <td class="text-sm">{{ log.before }}</td>
                  <td class="text-sm">{{ log.after }}</td>
                  <td class="text-sm text-secondary truncate" style="max-width:160px;">{{ log.reason }}</td>
                </tr>
                <!-- Expanded Detail -->
                <tr v-if="expandedManual === i" class="expanded-row">
                  <td colspan="7">
                    <div class="expanded-content">
                      <div class="detail-grid">
                        <div class="detail-item">
                          <span class="detail-label">구매자</span>
                          <span class="detail-value">{{ log.buyerName }}</span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">상품</span>
                          <span class="detail-value">{{ log.product }}</span>
                        </div>
                        <div class="detail-item" v-if="log.experienceName">
                          <span class="detail-label">체험단원</span>
                          <span class="detail-value">{{ log.experienceName }} ({{ log.experienceId }})</span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-label">처리 관리자</span>
                          <span class="detail-value">{{ log.changedBy || '-' }}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ChevronDown,
  AlertTriangle,
} from 'lucide-vue-next'

interface FilterLogRow {
  id: number
  timestamp: string
  totalCount: number
  matchCount: number
  unmatchCount: number
  status: 'success' | 'error' | 'running'
  duration: string
  newMatches: number
  removedMatches: number
  protectedCount: number
  rankBreakdown: { rank: number; count: number; percent: number }[]
  errorMessage: string
}

interface ManualLogRow {
  id: number
  timestamp: string
  orderId: string
  changeType: string
  before: string
  after: string
  reason: string
  buyerName: string
  product: string
  experienceName: string
  experienceId: string
  changedBy: string
}

interface OverrideLogRaw {
  log_id: number | string | null
  changed_at: string | null
  changed_by: string | null
  purchase_id: string | null
  action: string | null
  prev_is_fake: boolean | null
  new_is_fake: boolean | null
  note: string | null
  new_matched_exp_id: number | string | null
  target_month?: string | null
}

const OVERRIDE_LOG_LIMIT = 200
const OVERRIDE_SCAN_PAGE_SIZE = 500
const OVERRIDE_SCAN_MAX_PAGES = 20

const supabase = useSupabaseClient()
const toast = useToast()
const activeTab = ref('filter')
const expandedFilter = ref<number | null>(null)
const expandedManual = ref<number | null>(null)
const { isViewer, profileLoaded, profileRevision } = useCurrentUser()
const { selectedMonth, selectedPeriodLabel } = useAnalysisPeriod()
const filterLogs = ref<FilterLogRow[]>([])
const manualLogs = ref<ManualLogRow[]>([])
const supportsOverrideTargetMonth = ref(true)

function toggleExpand(type: string, index: number) {
  if (type === 'filter') {
    expandedFilter.value = expandedFilter.value === index ? null : index
  } else {
    expandedManual.value = expandedManual.value === index ? null : index
  }
}

function formatDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value || '-'
  return d.toLocaleString('ko-KR', { hour12: false })
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function parseRankBreakdown(summary: any): { rank: number; count: number; percent: number }[] {
  const raw = Array.isArray(summary?.rank_breakdown) ? summary.rank_breakdown : []
  const normalized = raw
    .map((item: any) => ({
      rank: toNumber(item?.rank),
      count: toNumber(item?.count),
      percent: toNumber(item?.percent),
    }))
    .filter((item) => item.rank > 0 && item.count >= 0)
  if (normalized.length > 0) return normalized
  return []
}

function extractDuration(summary: any): string {
  const sec = toNumber(summary?.duration_sec)
  if (sec > 0) return `${sec.toFixed(1)}s`
  const ms = toNumber(summary?.duration_ms)
  if (ms > 0) return `${(ms / 1000).toFixed(1)}s`
  return '-'
}

async function fetchOverrideRows(month: string): Promise<OverrideLogRaw[]> {
  const baseSelect = 'log_id, changed_at, changed_by, purchase_id, action, prev_is_fake, new_is_fake, note, new_matched_exp_id'

  if (month === 'all') {
    const { data, error } = await supabase
      .from('override_logs')
      .select(baseSelect)
      .order('changed_at', { ascending: false })
      .limit(OVERRIDE_LOG_LIMIT)
    if (error) throw error
    return (data || []) as OverrideLogRaw[]
  }

  if (supportsOverrideTargetMonth.value) {
    const { data, error } = await supabase
      .from('override_logs')
      .select(`${baseSelect}, target_month`)
      .eq('target_month', month)
      .order('changed_at', { ascending: false })
      .limit(OVERRIDE_LOG_LIMIT)

    if (!error) {
      return (data || []) as OverrideLogRaw[]
    }
    if (error.code !== '42703') throw error
    supportsOverrideTargetMonth.value = false
  }

  // 하위 호환: override_logs.target_month 컬럼이 없는 스키마는 최근 로그를 페이지 스캔하여 월을 필터링한다.
  const matchedRows: OverrideLogRaw[] = []
  for (let page = 0; page < OVERRIDE_SCAN_MAX_PAGES && matchedRows.length < OVERRIDE_LOG_LIMIT; page += 1) {
    const from = page * OVERRIDE_SCAN_PAGE_SIZE
    const to = from + OVERRIDE_SCAN_PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('override_logs')
      .select(baseSelect)
      .order('changed_at', { ascending: false })
      .range(from, to)
    if (error) throw error

    const chunk = (data || []) as OverrideLogRaw[]
    if (chunk.length === 0) break

    const purchaseIds = Array.from(
      new Set(chunk.map((row) => String(row.purchase_id || '').trim()).filter(Boolean)),
    )
    const monthByPurchaseId = new Map<string, string>()
    if (purchaseIds.length > 0) {
      const { data: purchaseRows, error: purchaseError } = await supabase
        .from('purchases')
        .select('purchase_id, target_month')
        .in('purchase_id', purchaseIds)
      if (!purchaseError) {
        for (const row of (purchaseRows || []) as any[]) {
          monthByPurchaseId.set(String(row.purchase_id || ''), String(row.target_month || ''))
        }
      }
    }

    for (const row of chunk) {
      const rowMonth = monthByPurchaseId.get(String(row.purchase_id || '')) || String(row.changed_at || '').slice(0, 7)
      if (rowMonth !== month) continue
      matchedRows.push({
        ...row,
        target_month: rowMonth,
      })
      if (matchedRows.length >= OVERRIDE_LOG_LIMIT) break
    }

    if (chunk.length < OVERRIDE_SCAN_PAGE_SIZE) break
  }

  return matchedRows
}

async function fetchLogs() {
  try {
    let filterQuery = supabase
      .from('filter_logs')
      .select('log_id, executed_at, executed_by, status, target_month, error_message, total_purchases_processed, total_matched, total_unmatched_exp, summary_json')
      .order('executed_at', { ascending: false })
      .limit(100)

    if (selectedMonth.value !== 'all') filterQuery = filterQuery.eq('target_month', selectedMonth.value)

    const { data: fData, error: fError } = await filterQuery
    if (fError) throw fError

    filterLogs.value = ((fData || []) as any[]).map((row) => {
      const summary = row.summary_json || {}
      const rankBreakdown = parseRankBreakdown(summary)
      return {
        id: toNumber(row.log_id),
        timestamp: formatDateTime(row.executed_at),
        totalCount: toNumber(row.total_purchases_processed),
        matchCount: toNumber(row.total_matched),
        unmatchCount: toNumber(row.total_unmatched_exp),
        status: row.status === 'error' ? 'error' : 'success',
        duration: extractDuration(summary),
        newMatches: toNumber(summary.new_matches),
        removedMatches: toNumber(summary.removed_matches),
        protectedCount: toNumber(summary.protected_count),
        rankBreakdown,
        errorMessage: row.error_message || '',
      } satisfies FilterLogRow
    })

    const mData = await fetchOverrideRows(selectedMonth.value)

    const purchaseIds = Array.from(new Set((mData as any[]).map((row) => String(row.purchase_id || '')).filter(Boolean)))
    const purchaseMap = new Map<string, { buyer_name: string; product_name: string; target_month: string; matched_exp_id: number | null }>()
    if (purchaseIds.length > 0) {
      const { data: pData, error: pError } = await supabase
        .from('purchases')
        .select('purchase_id, buyer_name, product_name, target_month, matched_exp_id')
        .in('purchase_id', purchaseIds)
      if (!pError) {
        for (const row of (pData || []) as any[]) {
          purchaseMap.set(String(row.purchase_id), {
            buyer_name: row.buyer_name || '-',
            product_name: row.product_name || '-',
            target_month: row.target_month || '',
            matched_exp_id: row.matched_exp_id ? Number(row.matched_exp_id) : null,
          })
        }
      }
    }

    const expIds = Array.from(new Set((mData as any[])
      .map((row) => Number(row.new_matched_exp_id))
      .filter((id) => Number.isFinite(id) && id > 0)))
    const expMap = new Map<number, { receiver_name: string; naver_id: string }>()
    if (expIds.length > 0) {
      const { data: eData, error: eError } = await supabase
        .from('experiences')
        .select('id, receiver_name, naver_id')
        .in('id', expIds)
      if (!eError) {
        for (const row of (eData || []) as any[]) {
          expMap.set(Number(row.id), {
            receiver_name: row.receiver_name || '',
            naver_id: row.naver_id || '',
          })
        }
      }
    }

    manualLogs.value = (mData as any[])
      .map((row) => {
        const purchase = purchaseMap.get(String(row.purchase_id))
        const month = String(row.target_month || purchase?.target_month || String(row.changed_at || '').slice(0, 7))
        if (selectedMonth.value !== 'all' && month !== selectedMonth.value) return null

        const exp = expMap.get(Number(row.new_matched_exp_id))
        const action = String(row.action || '')
        const changeType = action === 'fake해제' ? '체험단→실구매' : action === 'fake지정' ? '실구매→체험단' : action
        const before = row.prev_is_fake ? '체험단' : '실구매'
        const after = row.new_is_fake ? '체험단' : '실구매'

        return {
          id: toNumber(row.log_id),
          timestamp: formatDateTime(row.changed_at),
          orderId: String(row.purchase_id || '-'),
          changeType,
          before,
          after,
          reason: row.note || '-',
          buyerName: purchase?.buyer_name || '-',
          product: purchase?.product_name || '-',
          experienceName: exp?.receiver_name || '',
          experienceId: exp?.naver_id || '',
          changedBy: row.changed_by || '-',
        } satisfies ManualLogRow
      })
      .filter(Boolean) as ManualLogRow[]
  } catch (error: any) {
    console.error('Failed to fetch logs:', error)
    toast.error('실행 이력을 불러오지 못했습니다.')
    filterLogs.value = []
    manualLogs.value = []
  }
}

const filteredFilterLogs = computed(() => filterLogs.value)
const filteredManualLogs = computed(() => manualLogs.value)

watch(
  () => [selectedMonth.value, profileLoaded.value, profileRevision.value],
  async ([month, loaded]) => {
    if (!month || !loaded) return
    expandedFilter.value = null
    expandedManual.value = null
    await fetchLogs()
  },
  { immediate: true },
)
</script>

<style scoped>
.logs-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.logs-period-card {
  padding: var(--space-md) var(--space-xl);
}

.logs-period-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logs-period-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

/* Expanded Row */
.expanded-row td {
  padding: 0 !important;
  border-bottom: 1px solid var(--color-border-light);
}

.expanded-content {
  padding: var(--space-lg) var(--space-xl);
  background: var(--color-bg);
  border-top: 1px solid var(--color-border-light);
}

.expanded-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-xl);
}

.expanded-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

/* Rank Mini Bars */
.rank-mini-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.rank-mini-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.rank-mini-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  width: 36px;
  flex-shrink: 0;
}

.rank-mini-bar-wrap {
  flex: 1;
  height: 4px;
  background: #E5E7EB;
  border-radius: 2px;
  overflow: hidden;
}

.rank-mini-bar {
  height: 100%;
  background: var(--color-primary);
  border-radius: 2px;
}

.rank-mini-count {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  width: 40px;
  text-align: right;
}

/* Change Summary */
.change-summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.change-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--color-border-light);
}

.change-item:last-child {
  border-bottom: none;
}

.change-label {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}
</style>
