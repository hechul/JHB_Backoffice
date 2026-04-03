<template>
  <div class="card coupang-sync-card">
    <div class="sync-topline">
      <div class="sync-topline-copy">
        <h3 class="card-title">
          <ShoppingBag :size="18" :stroke-width="1.8" style="color: var(--color-primary)" />
          쿠팡 주문 동기화
        </h3>
        <span class="sync-topline-caption">{{ mode === 'dry-run' ? 'DB 반영 없이 결과만 확인합니다.' : '선택한 기간 주문을 실제로 반영합니다.' }}</span>
      </div>
      <StatusBadge :label="isRunning ? '진행 중' : (mode === 'dry-run' ? '드라이런' : '실행')" :variant="isRunning ? 'info' : (mode === 'dry-run' ? 'warning' : 'success')" dot />
    </div>

    <div class="sync-quick-range">
      <button type="button" class="sync-quick-chip" :disabled="isRunning" @click="applyQuickRange('today')">오늘</button>
      <button type="button" class="sync-quick-chip" :disabled="isRunning" @click="applyQuickRange('week')">최근 7일</button>
      <button type="button" class="sync-quick-chip" :disabled="isRunning" @click="applyQuickRange('month')">이번 달</button>
    </div>

    <div class="sync-mode-switch">
      <button type="button" class="sync-mode-chip" :class="{ active: mode === 'dry-run' }" :disabled="isRunning" @click="mode = 'dry-run'">드라이런</button>
      <button type="button" class="sync-mode-chip" :class="{ active: mode === 'live' }" :disabled="isRunning" @click="mode = 'live'">동기화</button>
    </div>

    <div class="sync-date-grid">
      <label class="sync-field">
        <span>시작일</span>
        <input v-model="startDate" type="date" class="sync-date-input" :disabled="isRunning" />
      </label>
      <label class="sync-field">
        <span>종료일</span>
        <input v-model="endDate" type="date" class="sync-date-input" :disabled="isRunning" />
      </label>
    </div>

    <div class="sync-actions">
      <button class="btn btn-primary btn-lg" :disabled="!canRun || isRunning" :class="{ 'btn-loading': isRunning }" @click="startSync">
        <Loader2 v-if="isRunning" :size="18" :stroke-width="2" class="sync-spinner" />
        <RefreshCw v-else :size="18" :stroke-width="2" />
        {{ mode === 'dry-run' ? '드라이런 실행' : '동기화 실행' }}
      </button>
      <span v-if="blockReason" class="text-sm text-danger">{{ blockReason }}</span>
    </div>

    <div v-if="summaryItems.length || logs.length || errorMessage" class="sync-result-shell">
      <div v-if="summaryItems.length" class="sync-summary-grid">
        <div v-for="item in summaryItems" :key="item.label" class="sync-summary-card">
          <span class="sync-summary-label">{{ item.label }}</span>
          <strong class="sync-summary-value">{{ item.value }}</strong>
        </div>
      </div>

      <div v-if="scopeSummaryItems.length" class="sync-scope-grid">
        <div v-for="scope in scopeSummaryItems" :key="scope.fulfillmentType" class="sync-scope-card">
          <div class="sync-scope-head">
            <strong>{{ scope.label }}</strong>
            <span>{{ scope.dateBasisLabel }}</span>
          </div>
          <div class="sync-scope-meta">
            <span>고유 주문 {{ scope.uniqueOrderCount }}</span>
            <span>응답 주문 {{ scope.responseOrderCount }}</span>
            <span>Raw event {{ scope.rawEventCount }}</span>
            <span>Raw line {{ scope.rawLineCount }}</span>
            <span>Projected {{ scope.projectedCount }}</span>
            <span>제외 {{ scope.excludedCount }}</span>
            <span>미매핑 {{ scope.unresolvedCount }}</span>
            <span v-if="scope.persistedRawEventCount > 0">이벤트 저장 {{ scope.persistedRawEventCount }}</span>
            <span v-if="scope.persistedRawLineCount > 0">저장 {{ scope.persistedRawLineCount }}</span>
            <span v-if="scope.persistedPurchaseCount > 0">구매행 {{ scope.persistedPurchaseCount }}</span>
          </div>
        </div>
      </div>

      <div v-if="errorMessage" class="alert alert-warning mt-md">
        <AlertTriangle :size="16" :stroke-width="2" />
        <span>{{ errorMessage }}</span>
      </div>

      <details v-if="logs.length" class="sync-log-panel">
        <summary class="sync-log-title">실행 로그 보기</summary>
        <div class="sync-log-list">
          <div v-for="(entry, index) in logs" :key="`${entry.time}-${index}`" class="sync-log-item" :class="entry.level">
            <Clock3 :size="12" :stroke-width="2" />
            <span class="sync-log-time">{{ entry.time }}</span>
            <span class="sync-log-message">{{ entry.message }}</span>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  AlertTriangle,
  Clock3,
  Loader2,
  RefreshCw,
  ShoppingBag,
} from 'lucide-vue-next'

type SyncMode = 'dry-run' | 'live'
type FulfillmentType = 'all' | 'marketplace' | 'rocket_growth'
type LogLevel = 'info' | 'warning' | 'error' | 'success'

interface SyncSummary {
  dryRun?: boolean
  sourceChannel?: string
  sourceAccountKey?: string
  requestedFrom?: string
  requestedTo?: string
  dateBasisLabel?: string
  selectedFulfillmentTypes?: string[]
  responseOrderCount?: number
  fetchedOrderCount?: number
  rawEventCount?: number
  rawLineCount?: number
  projectedCount?: number
  excludedCount?: number
  unresolvedCount?: number
  deletedCount?: number
  persistedRawEventCount?: number
  persistedRawLineCount?: number
  persistedPurchaseCount?: number
  scopeSummaries?: Array<{
    fulfillmentType: string
    dateBasisKey?: string
    dateBasisLabel?: string
    responseOrderCount: number
    fetchedOrderCount: number
    rawEventCount?: number
    rawLineCount: number
    projectedCount?: number
    excludedCount?: number
    unresolvedCount?: number
    deletedCount?: number
    persistedRawEventCount?: number
    persistedRawLineCount: number
    persistedPurchaseCount?: number
    runId: string | null
  }>
}

interface SyncResponse {
  ok: boolean
  dryRun: boolean
  start: string
  end: string
  accountKey: string
  runType: string
  requestedByAccountId: string | null
  fulfillmentType: FulfillmentType
  maxPerPage: number
  requestIntervalMs: number
  maxRetries: number
  retryBaseDelayMs: number
  exitCode: number | null
  signal: string | null
  durationMs: number
  summary: SyncSummary | null
  stdout: string
  stderr: string
}

interface LogEntry {
  time: string
  level: LogLevel
  message: string
}

const syncEndpoint = '/api/commerce/coupang/sync'

const toast = useToast()
const { isViewer } = useCurrentUser()

const startDate = ref(getCurrentMonthStartDate())
const endDate = ref(getTodayDate())
const mode = ref<SyncMode>('dry-run')
const isRunning = ref(false)
const logs = ref<LogEntry[]>([])
const summary = ref<SyncSummary | null>(null)
const errorMessage = ref('')

const blockReason = computed(() => {
  if (isViewer.value) return '열람자 권한에서는 쿠팡 동기화를 실행할 수 없습니다.'
  if (!startDate.value || !endDate.value) return '시작일과 종료일을 모두 입력해 주세요.'
  if (startDate.value > endDate.value) return '시작일은 종료일보다 빠르거나 같아야 합니다.'
  return ''
})

const canRun = computed(() => blockReason.value === '')

const summaryItems = computed(() => {
  if (!summary.value) return []
  return [
    { label: '고유 주문', value: Number(summary.value.fetchedOrderCount || 0).toLocaleString() },
    { label: '응답 주문', value: Number(summary.value.responseOrderCount || 0).toLocaleString() },
    { label: 'Raw event', value: Number(summary.value.rawEventCount || 0).toLocaleString() },
    { label: 'Raw line', value: Number(summary.value.rawLineCount || 0).toLocaleString() },
    { label: 'Projected', value: Number(summary.value.projectedCount || 0).toLocaleString() },
    { label: '제외', value: Number(summary.value.excludedCount || 0).toLocaleString() },
    { label: '미매핑', value: Number(summary.value.unresolvedCount || 0).toLocaleString() },
    { label: 'Event 저장', value: Number(summary.value.persistedRawEventCount || 0).toLocaleString() },
    { label: '저장', value: Number(summary.value.persistedRawLineCount || 0).toLocaleString() },
    { label: '구매행 저장', value: Number(summary.value.persistedPurchaseCount || 0).toLocaleString() },
    {
      label: '기준일',
      value: summary.value.dateBasisLabel || '-',
    },
    {
      label: 'Fulfillment',
      value: Array.isArray(summary.value.selectedFulfillmentTypes) && summary.value.selectedFulfillmentTypes.length
        ? summary.value.selectedFulfillmentTypes.join(', ')
        : '-',
    },
  ]
})

const scopeSummaryItems = computed(() => {
  return (summary.value?.scopeSummaries || []).map(scope => ({
    fulfillmentType: scope.fulfillmentType,
    label: scope.fulfillmentType === 'marketplace' ? '판매자배송' : '로켓그로스',
    dateBasisLabel: scope.dateBasisLabel || '-',
    responseOrderCount: Number(scope.responseOrderCount || 0).toLocaleString(),
    uniqueOrderCount: Number(scope.fetchedOrderCount || 0).toLocaleString(),
    rawEventCount: Number(scope.rawEventCount || 0).toLocaleString(),
    rawLineCount: Number(scope.rawLineCount || 0).toLocaleString(),
    projectedCount: Number(scope.projectedCount || 0).toLocaleString(),
    excludedCount: Number(scope.excludedCount || 0).toLocaleString(),
    unresolvedCount: Number(scope.unresolvedCount || 0).toLocaleString(),
    persistedRawEventCount: Number(scope.persistedRawEventCount || 0),
    persistedRawLineCount: Number(scope.persistedRawLineCount || 0),
    persistedPurchaseCount: Number(scope.persistedPurchaseCount || 0),
  }))
})

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTodayDate(): string {
  return toDateInputValue(new Date())
}

function getCurrentMonthStartDate(): string {
  const today = new Date()
  return toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1))
}

function applyQuickRange(type: 'today' | 'week' | 'month') {
  const today = new Date()
  if (type === 'today') {
    startDate.value = getTodayDate()
    endDate.value = getTodayDate()
    return
  }
  if (type === 'week') {
    const from = new Date(today)
    from.setDate(today.getDate() - 6)
    startDate.value = toDateInputValue(from)
    endDate.value = getTodayDate()
    return
  }
  startDate.value = getCurrentMonthStartDate()
  endDate.value = getTodayDate()
}

function pushLog(level: LogLevel, message: string) {
  logs.value.push({
    time: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
    level,
    message,
  })
}

function ingestOutput(text: string, fallbackLevel: LogLevel) {
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('{') || line.startsWith('}')) continue
    const level = line.toLowerCase().includes('failed') || line.toLowerCase().includes('error')
      ? 'error'
      : (line.toLowerCase().includes('persisted') ? 'success' : fallbackLevel)
    pushLog(level, line)
  }
}

async function startSync() {
  if (!canRun.value || isRunning.value) return

  isRunning.value = true
  logs.value = []
  summary.value = null
  errorMessage.value = ''

  pushLog('info', `실행 시작: ${startDate.value} ~ ${endDate.value}`)

  try {
    const response = await $fetch<SyncResponse>(syncEndpoint, {
      method: 'POST',
      body: {
        start: startDate.value,
        end: endDate.value,
        dryRun: mode.value === 'dry-run',
        fulfillmentType: 'all',
      },
    })

    summary.value = response.summary || null
    ingestOutput(response.stdout, 'info')
    ingestOutput(response.stderr, 'warning')

    pushLog('success', mode.value === 'dry-run' ? '쿠팡 드라이런이 완료되었습니다.' : '쿠팡 주문 동기화가 완료되었습니다.')
    toast.success(mode.value === 'dry-run' ? '쿠팡 드라이런 완료' : '쿠팡 주문 동기화 완료')
  } catch (error: any) {
    const data = error?.data || error
    errorMessage.value = data?.message || error?.message || '쿠팡 주문 동기화 중 오류가 발생했습니다.'
    ingestOutput(data?.stdout || '', 'info')
    ingestOutput(data?.stderr || '', 'error')
    pushLog('error', errorMessage.value)
    toast.error(errorMessage.value)
  } finally {
    isRunning.value = false
  }
}
</script>

<style scoped>
.coupang-sync-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.sync-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.sync-topline-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sync-topline-caption {
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.sync-date-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
}

.sync-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
}

.sync-mode-chip,
.sync-quick-chip {
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(255, 255, 255, 0.82);
  color: var(--color-text);
  border-radius: 999px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
}

.sync-mode-chip.active {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.3);
  color: #047857;
}

.sync-mode-switch {
  display: flex;
  gap: 10px;
}

.sync-date-input {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(255, 255, 255, 0.88);
  padding: 12px 14px;
  font-size: 0.95rem;
}

.sync-quick-range {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.sync-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sync-result-shell {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.sync-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.sync-scope-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.sync-summary-card {
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.16);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sync-summary-label {
  font-size: 0.76rem;
  color: var(--color-text-muted);
}

.sync-summary-value {
  font-size: 1.1rem;
  color: var(--color-text);
}

.sync-scope-card {
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.16);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sync-scope-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sync-scope-head span {
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.sync-scope-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  font-size: 0.86rem;
  color: var(--color-text-secondary);
}

.sync-log-panel {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 18px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.9);
}

.sync-log-title {
  cursor: pointer;
  padding: 14px 16px;
  font-weight: 700;
}

.sync-log-list {
  display: flex;
  flex-direction: column;
}

.sync-log-item {
  display: grid;
  grid-template-columns: 14px 70px 1fr;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  font-size: 0.84rem;
}

.sync-log-item.error {
  color: #b91c1c;
}

.sync-log-item.success {
  color: #047857;
}

.sync-log-time {
  color: var(--color-text-muted);
}

.sync-log-message {
  word-break: break-word;
}

.sync-spinner {
  animation: sync-spin 1s linear infinite;
}

@keyframes sync-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 900px) {
  .sync-date-grid,
  .sync-summary-grid,
  .sync-scope-grid {
    grid-template-columns: 1fr;
  }

  .sync-topline,
  .sync-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
