<template>
  <div class="card naver-sync-card">
    <div class="card-header">
      <h3 class="card-title">
        <CloudDownload :size="18" :stroke-width="1.8" style="color: var(--color-primary)" />
        네이버 커머스 주문 동기화
      </h3>
      <div class="panel-header-actions">
        <StatusBadge :label="naverSyncMode === 'dry-run' ? '드라이런' : '실행'" :variant="naverSyncMode === 'dry-run' ? 'warning' : 'success'" dot />
        <StatusBadge v-if="isNaverSyncRunning" label="진행 중" variant="info" dot />
      </div>
    </div>

    <div class="sync-date-grid">
      <label class="sync-field">
        <span>시작일</span>
        <input v-model="naverSyncStartDate" type="date" class="sync-date-input" :disabled="isNaverSyncRunning" />
      </label>
      <label class="sync-field">
        <span>종료일</span>
        <input v-model="naverSyncEndDate" type="date" class="sync-date-input" :disabled="isNaverSyncRunning" />
      </label>
    </div>

    <div class="sync-actions">
      <button
        class="btn btn-secondary btn-lg"
        :disabled="!canRunNaverSync || isNaverSyncRunning"
        :class="{ 'btn-loading': isNaverSyncRunning && naverSyncMode === 'dry-run' }"
        @click="startNaverSync('dry-run')"
      >
        <Loader2 v-if="isNaverSyncRunning && naverSyncMode === 'dry-run'" :size="18" :stroke-width="2" class="sync-spinner" />
        <Play v-else :size="18" :stroke-width="2" />
        드라이런 실행
      </button>
      <button
        class="btn btn-primary btn-lg"
        :disabled="!canRunNaverSync || isNaverSyncRunning"
        :class="{ 'btn-loading': isNaverSyncRunning && naverSyncMode === 'live' }"
        @click="startNaverSync('live')"
      >
        <Loader2 v-if="isNaverSyncRunning && naverSyncMode === 'live'" :size="18" :stroke-width="2" class="sync-spinner" />
        <RefreshCw v-else :size="18" :stroke-width="2" />
        동기화 실행
      </button>
      <span v-if="naverSyncBlockReason" class="text-sm text-danger">{{ naverSyncBlockReason }}</span>
    </div>

    <div v-if="isNaverSyncRunning || hasNaverSyncResult" class="sync-result-shell">
      <div class="sync-progress-head">
        <div class="sync-progress-meta">
          <span class="sync-progress-label">{{ naverSyncProgressLabel }}</span>
          <span class="sync-progress-range">{{ naverSyncRangeLabel }}</span>
        </div>
        <StatusBadge
          :label="naverSyncMode === 'dry-run' ? '드라이런' : '실행'"
          :variant="naverSyncMode === 'dry-run' ? 'warning' : 'success'"
          dot
        />
      </div>
      <div class="progress-bar" :class="{ 'progress-bar-indeterminate': naverSyncProgressIndeterminate }">
        <div class="progress-bar-fill" :style="naverSyncProgressIndeterminate ? undefined : { width: `${naverSyncProgress}%` }"></div>
      </div>
      <div class="sync-progress-footer">
        <span class="text-xs text-muted">{{ naverSyncProgressText }}</span>
        <span class="text-xs text-muted">{{ naverSyncLastRunAt || '아직 실행 전' }}</span>
      </div>

      <div v-if="naverSyncError" class="alert alert-warning mt-md">
        <AlertTriangle :size="16" :stroke-width="2" />
        <span>{{ naverSyncError }}</span>
      </div>

      <div v-if="naverSyncLogs.length > 0" class="sync-log-panel">
        <div class="sync-log-title">실행 로그</div>
        <div class="sync-log-list">
          <div v-for="(entry, index) in naverSyncLogs" :key="`${entry.time || 'log'}-${index}`" class="sync-log-item" :class="entry.level">
            <Clock3 :size="12" :stroke-width="2" />
            <span v-if="entry.time" class="sync-log-time">{{ entry.time }}</span>
            <span class="sync-log-message">{{ entry.message }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  AlertTriangle,
  CloudDownload,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-vue-next'

type NaverSyncMode = 'dry-run' | 'live'
type SyncLogLevel = 'info' | 'success' | 'warning' | 'error'

interface NaverSyncLogEntry {
  time: string
  level: SyncLogLevel
  message: string
}

interface NaverSyncSummary {
  dryRun?: boolean
  sourceChannel?: string
  sourceAccountKey?: string
  requestedFrom?: string
  requestedTo?: string
  windowCount?: number
  changedCount?: number
  detailCount?: number
  rawEventCount?: number
  rawLineCount?: number
  projectedCount?: number
  excludedCount?: number
  deletedCount?: number
  unresolvedCount?: number
  mappingRowCount?: number
  affectedTargetMonths?: string[]
}

interface NaverSyncBackgroundRefilter {
  affectedMonths: string[]
  queuedMonths: string[]
  resetMonths: string[]
  skippedMonths: string[]
  status: 'not_requested' | 'queued' | 'no_experience_months' | 'schedule_failed'
  errorMessage: string | null
}

interface NaverSyncResponse {
  ok: boolean
  dryRun: boolean
  start: string
  end: string
  accountKey: string
  runType: string
  requestedByAccountId: string | null
  limitCount: number
  detailBatchSize: number
  scriptPath: string
  exitCode: number | null
  signal: string | null
  durationMs: number
  summary: NaverSyncSummary | null
  backgroundRefilter?: NaverSyncBackgroundRefilter | null
  stdout: string
  stderr: string
}
const naverSyncEndpoint = '/api/commerce/naver/sync'

const toast = useToast()
const { user, isViewer } = useCurrentUser()
const { createNotification } = useNotifications()
const { refreshMonths, selectMonth } = useAnalysisPeriod()
const { setUploadResult } = useMonthlyWorkflow()

const naverSyncStartDate = ref(getCurrentMonthStartDate())
const naverSyncEndDate = ref(getTodayDate())
const naverSyncMode = ref<NaverSyncMode>('dry-run')
const naverSyncProgress = ref(0)
const naverSyncProgressLabel = ref('대기 중')
const naverSyncLogs = ref<NaverSyncLogEntry[]>([])
const naverSyncSummary = ref<Record<string, any> | null>(null)
const naverSyncError = ref('')
const naverSyncLastRunAt = ref('')
let naverSyncPulseTimer: ReturnType<typeof setInterval> | null = null
const isNaverSyncRunning = ref(false)

const hasNaverSyncResult = computed(() => Boolean(naverSyncSummary.value) || naverSyncLogs.value.length > 0 || Boolean(naverSyncError.value))

const naverSyncRangeLabel = computed(() => {
  const start = naverSyncStartDate.value || '-'
  const end = naverSyncEndDate.value || '-'
  return `${start} ~ ${end}`
})

const naverSyncBlockReason = computed(() => {
  if (isViewer.value) return '열람자 권한에서는 네이버 동기화를 실행할 수 없습니다.'
  if (isNaverSyncRunning.value) return '동기화가 진행 중입니다.'
  if (!naverSyncStartDate.value || !naverSyncEndDate.value) return '시작일과 종료일을 모두 입력해 주세요.'
  if (naverSyncStartDate.value > naverSyncEndDate.value) return '시작일은 종료일보다 빠르거나 같아야 합니다.'
  return ''
})

const canRunNaverSync = computed(() => naverSyncBlockReason.value === '')
const naverSyncProgressIndeterminate = computed(() => isNaverSyncRunning.value && naverSyncProgress.value >= 92)
const naverSyncProgressText = computed(() => naverSyncProgressIndeterminate.value ? '응답 대기 중' : `${naverSyncProgress.value}%`)

function formatUploadTimestamp(value: string): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    return String(value).replace('T', ' ').slice(0, 16)
  }
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function isValidDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
}

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

function appendNaverSyncLog(message: string, level: SyncLogLevel = 'info', time = '') {
  const normalized = String(message || '').trim()
  if (!normalized) return
  naverSyncLogs.value.push({
    time: time || formatUploadTimestamp(new Date().toISOString()),
    level,
    message: normalized,
  })
}

function formatKoreanDateLabel(value: string): string {
  const matched = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!matched) return String(value || '')
  const month = Number.parseInt(matched[2] || '0', 10)
  const day = Number.parseInt(matched[3] || '0', 10)
  if (!month || !day) return String(value || '')
  return `${month}월 ${day}일`
}

function formatDurationValue(value: unknown): string {
  const raw = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(raw) || raw <= 0) return String(value ?? '')
  if (raw < 1000) return `${raw}ms`
  const seconds = Math.round(raw / 100) / 10
  if (seconds < 60) return `${seconds}초`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = Math.round((seconds % 60) * 10) / 10
  if (remainSeconds === 0) return `${minutes}분`
  return `${minutes}분 ${remainSeconds}초`
}

function parseNaverSyncKeyValueLine(line: string): Record<string, number> {
  return Object.fromEntries(
    Array.from(line.matchAll(/([a-zA-Z]+)=([0-9]+)/g)).map(([, key, value]) => [
      key,
      Number.parseInt(value || '0', 10),
    ]),
  )
}

function translateNaverSyncLogLine(
  line: string,
  state: { currentDateLabel: string; totalDays: number },
): NaverSyncLogEntry | null {
  const normalized = String(line || '').trim()
  if (!normalized || (normalized.startsWith('{') && normalized.endsWith('}'))) return null

  if (normalized.startsWith('[naver-sync] target range ')) {
    const range = normalized.replace('[naver-sync] target range ', '')
    const [start, end] = range.split(' -> ')
    const startDate = String(start || '').slice(0, 10)
    const endDate = String(end || '').slice(0, 10)
    return {
      time: formatUploadTimestamp(new Date().toISOString()),
      level: 'info',
      message: `조회 기간 ${startDate} ~ ${endDate}`,
    }
  }

  if (normalized.startsWith('[naver-sync] windows ')) {
    const totalDays = Number.parseInt(normalized.replace('[naver-sync] windows ', ''), 10)
    if (Number.isFinite(totalDays)) {
      state.totalDays = totalDays
      return {
        time: formatUploadTimestamp(new Date().toISOString()),
        level: 'info',
        message: `총 ${totalDays}일 범위를 순서대로 확인합니다.`,
      }
    }
  }

  if (normalized.startsWith('[naver-sync] window ')) {
    const range = normalized.replace('[naver-sync] window ', '')
    const [start] = range.split(' -> ')
    state.currentDateLabel = formatKoreanDateLabel(String(start || '').slice(0, 10))
    return {
      time: formatUploadTimestamp(new Date().toISOString()),
      level: 'info',
      message: `${state.currentDateLabel} 주문 불러오는 중`,
    }
  }

  if (normalized.startsWith('[naver-sync][dry-run] ')) {
    const counts = parseNaverSyncKeyValueLine(normalized)
    const message = [
      `${state.currentDateLabel || '현재 날짜'} 주문 ${counts.changed ?? 0}건 확인`,
      `상세 주문 ${counts.detail ?? 0}건`,
      `반영 대상 ${counts.projected ?? 0}건`,
      `제외 대상 ${counts.excluded ?? 0}건`,
      `미매핑 ${counts.unresolved ?? 0}건`,
    ].join(' · ')

    return {
      time: formatUploadTimestamp(new Date().toISOString()),
      level: 'info',
      message,
    }
  }

  if (normalized.startsWith('[naver-sync] completed windows=')) {
    const matched = normalized.match(/completed windows=(\d+)\/(\d+)/)
    if (matched) {
      const completed = Number.parseInt(matched[1] || '0', 10)
      const total = Number.parseInt(matched[2] || '0', 10)
      return {
        time: formatUploadTimestamp(new Date().toISOString()),
        level: 'success',
        message: `총 ${total}일 중 ${completed}일 처리 완료`,
      }
    }
  }

  if (normalized.startsWith('[naver-sync] retry ')) {
    const matched = normalized.match(/retry (\d+)\/(\d+) .* after (\d+)ms/)
    if (matched) {
      const attempt = Number.parseInt(matched[1] || '0', 10)
      const total = Number.parseInt(matched[2] || '0', 10)
      const delayMs = Number.parseInt(matched[3] || '0', 10)
      return {
        time: formatUploadTimestamp(new Date().toISOString()),
        level: 'warning',
        message: `네이버 응답 지연으로 ${attempt}/${total}회 재시도합니다. 잠시 후 다시 이어집니다. (${formatDurationValue(delayMs)})`,
      }
    }
  }

  const compact = normalized.replace(/^\[naver-sync\]\s*/, '')
  return {
    time: formatUploadTimestamp(new Date().toISOString()),
    level: 'info',
    message: compact,
  }
}

function buildNaverSyncLogs(stdout: string, stderr: string): NaverSyncLogEntry[] {
  const nextLogs: NaverSyncLogEntry[] = []
  const normalizeStdout = (() => {
    const trimmed = String(stdout || '').trimEnd()
    const braceIndex = trimmed.lastIndexOf('\n{')
    if (braceIndex >= 0) {
      return trimmed.slice(0, braceIndex).trimEnd()
    }
    return trimmed
  })()
  const logState = {
    currentDateLabel: '',
    totalDays: 0,
  }

  const appendLines = (text: string, level: SyncLogLevel) => {
    String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const translated = level === 'info'
          ? translateNaverSyncLogLine(line, logState)
          : {
              time: formatUploadTimestamp(new Date().toISOString()),
              level,
              message: line,
            }
        if (!translated) return
        nextLogs.push(translated)
      })
  }

  appendLines(normalizeStdout, 'info')
  appendLines(stderr, 'error')
  return nextLogs.slice(-20)
}

function resetNaverSyncResult(mode: NaverSyncMode) {
  naverSyncMode.value = mode
  naverSyncError.value = ''
  naverSyncSummary.value = null
  naverSyncLogs.value = []
  naverSyncLastRunAt.value = ''
  naverSyncProgress.value = 0
  naverSyncProgressLabel.value = mode === 'dry-run' ? '드라이런 시작 준비' : '동기화 시작 준비'
}

function stopNaverSyncPulse(finalProgress = 100) {
  if (naverSyncPulseTimer) {
    clearInterval(naverSyncPulseTimer)
    naverSyncPulseTimer = null
  }
  naverSyncProgress.value = finalProgress
}

function startNaverSyncPulse() {
  stopNaverSyncPulse()
  naverSyncProgressLabel.value = '동기화 요청 처리 중'
  naverSyncProgress.value = 12
  naverSyncPulseTimer = setInterval(() => {
    const nextProgress = Math.min(92, naverSyncProgress.value + 7)
    naverSyncProgress.value = nextProgress
    if (nextProgress >= 92) {
      naverSyncProgressLabel.value = '네이버 응답 대기 중'
    }
  }, 1200)
}

function expandMonthRange(start: string, end: string): string[] {
  if (!isValidDateInput(start) || !isValidDateInput(end) || start > end) return []
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const months: string[] = []

  while (cursor.getTime() <= endDate.getTime()) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return months
}

function resolveAffectedMonths(response: NaverSyncResponse): string[] {
  const months = Array.isArray(response.summary?.affectedTargetMonths)
    ? response.summary?.affectedTargetMonths.filter((month): month is string => isValidDateInput(`${String(month)}-01`))
    : []

  if (months.length > 0) {
    return Array.from(new Set(months)).sort()
  }

  return expandMonthRange(naverSyncStartDate.value, naverSyncEndDate.value)
}

function formatMonthLabel(month: string): string {
  const matched = String(month || '').match(/^(\d{4})-(\d{2})$/)
  if (!matched) return month
  return `${Number.parseInt(matched[2] || '0', 10)}월`
}

function appendBackgroundRefilterLogs(input?: NaverSyncBackgroundRefilter | null) {
  if (!input) return

  if (input.resetMonths.length > 0) {
    appendNaverSyncLog(
      `체험단이 없는 ${input.resetMonths.map(formatMonthLabel).join(', ')} 데이터는 실구매 상태로 정리했습니다.`,
      'success',
    )
  }

  if (input.status === 'queued' && input.queuedMonths.length > 0) {
    appendNaverSyncLog(
      `체험단이 있는 ${input.queuedMonths.map(formatMonthLabel).join(', ')} 데이터는 백그라운드에서 다시 계산합니다.`,
      'success',
    )
  }

  if (input.status === 'no_experience_months' && input.affectedMonths.length > 0) {
    appendNaverSyncLog(
      '체험단 데이터가 없는 월은 추가 필터링 없이 실구매 상태만 유지합니다.',
      'info',
    )
  }

  if (input.status === 'schedule_failed') {
    appendNaverSyncLog(
      `자동 재필터 예약에 실패했습니다. ${input.errorMessage || '수동으로 필터링을 다시 실행해 주세요.'}`,
      'error',
    )
  }
}

async function startNaverSync(mode: NaverSyncMode) {
  if (!canRunNaverSync.value || isNaverSyncRunning.value) return

  resetNaverSyncResult(mode)
  isNaverSyncRunning.value = true
  startNaverSyncPulse()
  appendNaverSyncLog(
    mode === 'dry-run'
      ? `드라이런 시작: ${naverSyncStartDate.value} ~ ${naverSyncEndDate.value}`
      : `동기화 시작: ${naverSyncStartDate.value} ~ ${naverSyncEndDate.value}`,
    'info',
  )

  try {
    const response = await $fetch<NaverSyncResponse>(naverSyncEndpoint, {
      method: 'POST',
      body: {
        start: naverSyncStartDate.value,
        end: naverSyncEndDate.value,
        dryRun: mode === 'dry-run',
        requestedByAccountId: user.value.id || null,
      },
    })

    stopNaverSyncPulse(95)
    naverSyncProgressLabel.value = '응답 정리 중'
    naverSyncSummary.value = response.summary || null
    naverSyncLogs.value = buildNaverSyncLogs(response.stdout, response.stderr)
    appendBackgroundRefilterLogs(response.backgroundRefilter)
    naverSyncLastRunAt.value = formatUploadTimestamp(new Date().toISOString())

    if (mode === 'live') {
      const affectedMonths = resolveAffectedMonths(response)
      for (const month of affectedMonths) {
        setUploadResult(month, {
          orderUploadDone: true,
        })
      }
      await refreshMonths()
      const latestSyncedMonth = affectedMonths[affectedMonths.length - 1] || naverSyncEndDate.value.slice(0, 7)
      if (latestSyncedMonth) {
        selectMonth(latestSyncedMonth)
      }
    }

    stopNaverSyncPulse(100)
    naverSyncProgressLabel.value = mode === 'dry-run' ? '드라이런 완료' : '동기화 완료'
    toast.success(mode === 'dry-run' ? '네이버 주문 드라이런이 완료되었습니다.' : '네이버 주문 동기화가 완료되었습니다.')
    await createNotification({
      type: mode === 'dry-run' ? 'info' : 'success',
      title: mode === 'dry-run' ? '네이버 주문 드라이런 완료' : '네이버 주문 동기화 완료',
      message: `${naverSyncStartDate.value} ~ ${naverSyncEndDate.value} 범위를 ${mode === 'dry-run' ? '미리보기' : '적재'}했습니다.`,
      link: '/naver-sync',
      payload: {
        dryRun: mode === 'dry-run',
        range: `${naverSyncStartDate.value} ~ ${naverSyncEndDate.value}`,
        summary: response.summary || null,
      },
    })
  } catch (error: any) {
    stopNaverSyncPulse(100)
    const errorPayload = error?.data || null
    const nestedErrorData = errorPayload?.data || null
    naverSyncError.value = String(
      errorPayload?.message
      || nestedErrorData?.message
      || error?.message
      || '네이버 주문 동기화 중 알 수 없는 오류가 발생했습니다.',
    )
    naverSyncSummary.value = ((nestedErrorData?.summary || errorPayload?.summary || null) as NaverSyncSummary | null)
    naverSyncLogs.value = buildNaverSyncLogs(
      String(nestedErrorData?.stdout || errorPayload?.stdout || ''),
      String(nestedErrorData?.stderr || errorPayload?.stderr || ''),
    )
    naverSyncLastRunAt.value = formatUploadTimestamp(new Date().toISOString())
    naverSyncProgressLabel.value = '실행 실패'
    toast.error(naverSyncError.value)
    await createNotification({
      type: 'error',
      title: '네이버 주문 동기화 실패',
      message: naverSyncError.value,
      link: '/naver-sync',
      payload: {
        dryRun: mode === 'dry-run',
        range: `${naverSyncStartDate.value} ~ ${naverSyncEndDate.value}`,
        error: naverSyncError.value,
      },
    })
  } finally {
    isNaverSyncRunning.value = false
  }
}

onBeforeUnmount(() => {
  stopNaverSyncPulse()
})
</script>

<style scoped>
.naver-sync-card {
  border: 1px solid rgba(37, 99, 235, 0.14);
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.1), transparent 40%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
}

.panel-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.sync-date-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
  margin-top: var(--space-md);
}

.sync-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.sync-date-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.875rem;
}

.sync-actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
  margin-top: var(--space-lg);
}

.sync-spinner {
  animation: sync-spin 1s linear infinite;
}

.sync-result-shell {
  margin-top: var(--space-lg);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-border-light);
}

.sync-progress-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-sm);
}

.sync-progress-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sync-progress-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
}

.sync-progress-range {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.sync-progress-footer {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
}

.sync-log-panel {
  margin-top: var(--space-md);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.78);
}

.sync-log-title {
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--color-border-light);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.sync-log-list {
  display: flex;
  flex-direction: column;
  max-height: 280px;
  overflow-y: auto;
}

.sync-log-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-xs);
  padding: 10px var(--space-md);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
}

.sync-log-item:last-child {
  border-bottom: none;
}

.sync-log-item.error {
  color: var(--color-danger);
}

.sync-log-time {
  color: var(--color-text-muted);
  white-space: nowrap;
}

.sync-log-message {
  white-space: pre-wrap;
  word-break: break-word;
}

@keyframes sync-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 900px) {
  .sync-date-grid {
    grid-template-columns: 1fr;
  }
}
</style>
