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

    <div class="sync-card-copy">
      <p class="text-sm text-secondary">
        회사 Wi-Fi에서만 네이버 커머스 API를 호출해 주문 데이터를 불러옵니다. 드라이런은 저장 없이 결과만 미리 확인하고, 동기화 실행은 실제 주문 데이터를 DB에 반영합니다.
      </p>
      <div class="sync-endpoint-pill">
        <Terminal :size="14" :stroke-width="2" />
        <span>{{ naverSyncEndpoint }}</span>
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

    <div class="sync-preset-row">
      <button class="btn btn-ghost btn-sm" :disabled="isNaverSyncRunning" @click="applyNaverSyncPreset('2025-12')">2025-12</button>
      <button class="btn btn-ghost btn-sm" :disabled="isNaverSyncRunning" @click="applyNaverSyncPreset('2026-01')">2026-01</button>
      <button class="btn btn-ghost btn-sm" :disabled="isNaverSyncRunning" @click="applyNaverSyncPreset('2026-02')">2026-02</button>
      <button class="btn btn-ghost btn-sm" :disabled="isNaverSyncRunning" @click="applyNaverSyncPreset('2025-12-2026-02')">12~02월 전체</button>
    </div>

    <div class="sync-mode-guide">
      <div class="sync-mode-item">
        <strong>드라이런 실행</strong>
        <span>네이버에서 읽어만 보고 DB에는 저장하지 않습니다.</span>
      </div>
      <div class="sync-mode-item">
        <strong>동기화 실행</strong>
        <span>주문 raw 데이터와 분석용 주문 데이터를 실제로 반영합니다.</span>
      </div>
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

      <div v-if="naverSyncSummaryEntries.length > 0" class="sync-summary-grid">
        <div v-for="entry in naverSyncSummaryEntries" :key="entry.label" class="sync-summary-item" :class="entry.tone ? `tone-${entry.tone}` : ''">
          <span class="sync-summary-label">{{ entry.label }}</span>
          <strong class="sync-summary-value">{{ entry.value }}</strong>
        </div>
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
  Terminal,
} from 'lucide-vue-next'

type NaverSyncMode = 'dry-run' | 'live'
type SyncLogLevel = 'info' | 'success' | 'warning' | 'error'

interface NaverSyncLogEntry {
  time: string
  level: SyncLogLevel
  message: string
}

interface NaverSyncSummaryEntry {
  label: string
  value: string
  tone?: 'info' | 'success' | 'warning' | 'danger'
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
  stdout: string
  stderr: string
}

const NAVER_SYNC_PRESETS = {
  '2025-12': { start: '2025-12-01', end: '2025-12-31' },
  '2026-01': { start: '2026-01-01', end: '2026-01-31' },
  '2026-02': { start: '2026-02-01', end: '2026-02-28' },
  '2025-12-2026-02': { start: '2025-12-01', end: '2026-02-28' },
} as const

const naverSyncEndpoint = '/api/commerce/naver/sync'
const NAVER_SYNC_DEFAULT_START = '2025-12-01'
const NAVER_SYNC_DEFAULT_END = '2026-02-28'

const toast = useToast()
const { user, isViewer } = useCurrentUser()
const { createNotification } = useNotifications()
const { refreshMonths, selectMonth } = useAnalysisPeriod()
const { setUploadResult } = useMonthlyWorkflow()

const naverSyncStartDate = ref(NAVER_SYNC_DEFAULT_START)
const naverSyncEndDate = ref(NAVER_SYNC_DEFAULT_END)
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

const naverSyncSummaryEntries = computed<NaverSyncSummaryEntry[]>(() => {
  const source = naverSyncSummary.value
  if (!source || typeof source !== 'object') return []

  const valueOf = (keys: string[]) => {
    for (const key of keys) {
      const value = (source as Record<string, any>)[key]
      if (value !== undefined && value !== null && `${value}`.trim() !== '') return value
    }
    return undefined
  }

  const candidates: Array<[string, string[], NaverSyncSummaryEntry['tone']?]> = [
    ['조회 기간', ['rangeLabel', 'range', 'period', 'syncRange'], 'info'],
    ['처리일', ['windows', 'windowCount', 'batchCount'], 'info'],
    ['변경 주문', ['changed', 'changedCount', 'changedItems', 'changedOrderCount'], 'success'],
    ['상세 주문', ['detail', 'detailCount', 'productOrderCount', 'detailItems'], 'success'],
    ['반영 대상', ['projected', 'projectedCount', 'upserted', 'appliedCount', 'purchaseCount'], 'success'],
    ['미매핑', ['unresolved', 'unresolvedCount', 'needsReviewCount'], 'warning'],
    ['제외 대상', ['excluded', 'excludedCount', 'skippedCount'], 'warning'],
    ['실행 시간', ['duration', 'elapsed', 'elapsedMs', 'durationMs'], 'info'],
  ]

  const rows = candidates
    .map(([label, keys, tone]) => {
      const value = valueOf(keys)
      if (value === undefined) return null
      return { label, value: formatNaverSyncSummaryValue(label, value), tone }
    })
    .filter((entry): entry is NaverSyncSummaryEntry => entry !== null)

  if (rows.length > 0) return rows

  return Object.entries(source)
    .filter(([, value]) => value !== undefined && value !== null && typeof value !== 'object')
    .slice(0, 8)
    .map(([label, value]) => ({ label, value: String(value) }))
})

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

function formatNaverSyncSummaryValue(label: string, value: unknown): string {
  if (label === '처리일') {
    const count = Number.parseInt(String(value ?? ''), 10)
    return Number.isFinite(count) ? `${count}일` : String(value ?? '')
  }
  if (label === '실행 시간') {
    return formatDurationValue(value)
  }
  return String(value ?? '')
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

function applyNaverSyncPreset(preset: keyof typeof NAVER_SYNC_PRESETS) {
  const selected = NAVER_SYNC_PRESETS[preset]
  if (!selected) return
  naverSyncStartDate.value = selected.start
  naverSyncEndDate.value = selected.end
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
    naverSyncLastRunAt.value = formatUploadTimestamp(new Date().toISOString())

    if (mode === 'live') {
      for (const month of expandMonthRange(naverSyncStartDate.value, naverSyncEndDate.value)) {
        setUploadResult(month, {
          orderUploadDone: true,
        })
      }
      await refreshMonths()
      const latestSyncedMonth = naverSyncEndDate.value.slice(0, 7)
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

.sync-card-copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.sync-endpoint-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.08);
  color: #1D4ED8;
  font-size: 0.75rem;
  font-family: var(--font-mono);
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

.sync-preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-top: var(--space-md);
}

.sync-mode-guide {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.sync-mode-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--color-border-light);
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.sync-mode-item strong {
  font-size: 0.75rem;
  color: var(--color-text);
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

.sync-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.sync-summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  border: 1px solid var(--color-border-light);
}

.sync-summary-item.tone-info {
  background: rgba(59, 130, 246, 0.06);
}

.sync-summary-item.tone-success {
  background: rgba(16, 185, 129, 0.08);
}

.sync-summary-item.tone-warning {
  background: rgba(245, 158, 11, 0.1);
}

.sync-summary-item.tone-danger {
  background: rgba(239, 68, 68, 0.08);
}

.sync-summary-label {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

.sync-summary-value {
  font-size: 0.9375rem;
  color: var(--color-text);
  word-break: break-word;
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
  .sync-date-grid,
  .sync-mode-guide {
    grid-template-columns: 1fr;
  }
}
</style>
