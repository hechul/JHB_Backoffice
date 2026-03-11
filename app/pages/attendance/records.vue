<template>
  <div class="records-page">
    <div class="records-header">
      <h1 class="records-title">출퇴근 기록</h1>
      <span class="records-subtitle">오늘 근무 상태를 확인하고 바로 기록합니다.</span>
    </div>

    <div class="card today-card">
      <div class="today-head">
        <div>
          <div class="today-label">오늘 ({{ todayDate }})</div>
          <strong class="today-status" :class="todayDisplayStatus.className">{{ todayDisplayStatus.label }}</strong>
          <div v-if="todayApprovedLeave" class="today-note">
            승인된 부재: {{ getLeaveTypeLabel(todayApprovedLeave.leave_type) }}
          </div>
          <div v-else class="today-note">오늘 근무 상태를 확인하고 바로 기록합니다.</div>
        </div>
        <div class="today-pill">{{ currentModeLabel }}</div>
      </div>

      <div class="today-grid">
        <div class="today-item">
          <span>출근 시각</span>
          <strong>{{ formatTime(todayRecord?.check_in_at) }}</strong>
        </div>
        <div class="today-item">
          <span>퇴근 시각</span>
          <strong>{{ formatTime(todayRecord?.check_out_at) }}</strong>
        </div>
        <div class="today-item">
          <span>총 근무시간</span>
          <strong>{{ todayWorkDuration }}</strong>
        </div>
        <div class="today-item">
          <span>현재 상태</span>
          <strong>{{ currentModeLabel }}</strong>
        </div>
      </div>

      <div v-if="!tableMissing" class="action-panel">
        <template v-if="!todayApprovedLeave || !blocksAttendanceToday">
          <template v-if="!sessionsTableMissing">
            <button
              v-if="workToggleMode === 'before_start'"
              class="btn btn-primary btn-lg action-main"
              :disabled="saving || !canToggleWork"
              @click="handleToggleWork"
            >
              출근하기
            </button>

            <div v-else-if="workToggleMode === 'on'" class="action-row">
              <button class="btn btn-ghost btn-lg action-secondary" :disabled="saving || !canToggleWork" @click="handleToggleWork">일시중단</button>
              <button class="btn btn-primary btn-lg action-primary" :disabled="saving || !canFinalCheckOut" @click="handleFinalCheckOut">퇴근하기</button>
            </div>

            <div v-else-if="workToggleMode === 'off'" class="action-row">
              <button class="btn btn-primary btn-lg action-primary" :disabled="saving || !canToggleWork" @click="handleToggleWork">재시작</button>
              <button class="btn btn-ghost btn-lg action-secondary" :disabled="saving || !canFinalCheckOut" @click="handleFinalCheckOut">퇴근하기</button>
            </div>

            <div v-else class="action-complete">
              <strong>오늘도 수고하셨습니다</strong>
              <span>오늘 근무 기록이 모두 저장되었습니다.</span>
            </div>
          </template>

          <div v-else class="action-row legacy-row">
            <button class="btn btn-primary btn-lg action-primary" :disabled="!canLegacyCheckIn || saving" @click="handleLegacyCheckIn">출근하기</button>
            <button class="btn btn-ghost btn-lg action-secondary" :disabled="!canLegacyCheckOut || saving" @click="handleLegacyCheckOut">퇴근하기</button>
          </div>
        </template>
        <div v-else class="action-complete leave-complete">
          <strong>{{ todayDisplayStatus.label }}</strong>
          <span>승인된 휴가 일정이 있어 오늘 출퇴근 기록은 입력하지 않습니다.</span>
        </div>
      </div>

      <div v-if="!sessionsTableMissing" class="session-list-wrap">
        <div class="section-label">오늘 근무 전환 기록</div>
        <div v-if="todaySessionsSorted.length === 0" class="history-empty">아직 근무 전환 기록이 없습니다.</div>
        <div v-else class="session-list">
          <div v-for="(session, index) in todaySessionsSorted" :key="session.id" class="session-item">
            <span class="session-index">기록 {{ index + 1 }}</span>
            <span>시작 {{ formatTime(session.started_at) }}</span>
            <span>중단 {{ formatTime(session.ended_at) }}</span>
          </div>
        </div>
      </div>

      <div v-if="tableMissing" class="today-warning">
        `attendance_records` 테이블이 없어 근태 기능을 사용할 수 없습니다.
        `docs/sql/2026-03-05_attendance_phase1.sql` 실행이 필요합니다.
      </div>
      <div v-if="sessionsTableMissing" class="today-warning neutral">
        `attendance_work_sessions` 테이블이 없어 근무 전환 기록은 사용할 수 없고, 기존 출근/퇴근 방식으로 동작합니다.
        `docs/sql/2026-03-10_attendance_work_sessions_patch.sql` 실행이 필요합니다.
      </div>
      <div v-if="settingsTableMissing" class="today-warning neutral">
        `attendance_settings` 최신 설정이 없어 기본 근무 기준(09:00~18:00, 조퇴 20분)으로 계산 중입니다.
      </div>
      <div v-if="leaveTableMissing" class="today-warning neutral">
        `leave_requests` 테이블이 없어 휴가 정보는 표시되지 않습니다.
        `docs/sql/2026-03-10_attendance_phase2.sql` 실행이 필요합니다.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AttendanceRecord, AttendanceSettings, AttendanceWorkSession, LeaveRequest } from '~/composables/useAttendance'

definePageMeta({ layout: 'attendance' })

type WorkToggleMode = 'before_start' | 'on' | 'off' | 'done'

const supabase = useSupabaseClient()
const toast = useToast()
const { user, profileLoaded } = useCurrentUser()
const {
  DEFAULT_ATTENDANCE_SETTINGS,
  getKstDateKey,
  formatTime,
  calcWorkMinutes,
  calcWorkSessionMinutes,
  formatWorkDuration,
  normalizeAttendanceSettings,
  getLeaveTypeLabel,
  computeAttendanceStatus,
} = useAttendance()

const todayDate = ref(getKstDateKey())
const todayRecord = ref<AttendanceRecord | null>(null)
const todaySessions = ref<AttendanceWorkSession[]>([])
const todayApprovedLeave = ref<LeaveRequest | null>(null)
const settings = ref<AttendanceSettings>(normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS))
const saving = ref(false)
const tableMissing = ref(false)
const sessionsTableMissing = ref(false)
const settingsTableMissing = ref(false)
const leaveTableMissing = ref(false)
const liveNowIso = ref(new Date().toISOString())
let liveTimer: ReturnType<typeof setInterval> | null = null

const todaySessionsSorted = computed(() => {
  return [...todaySessions.value].sort((a, b) => a.started_at.localeCompare(b.started_at))
})

const openTodaySession = computed(() => {
  return [...todaySessionsSorted.value].reverse().find((session) => !session.ended_at) || null
})

const workToggleMode = computed<WorkToggleMode>(() => {
  if (!todayRecord.value?.check_in_at) return 'before_start'
  if (todayRecord.value?.check_out_at) return 'done'
  if (openTodaySession.value) return 'on'
  return 'off'
})

const todayComputedStatus = computed(() => {
  return computeAttendanceStatus({
    workDate: todayDate.value,
    checkInAt: todayRecord.value?.check_in_at,
    checkOutAt: todayRecord.value?.check_out_at,
    settings: settings.value,
    approvedLeave: todayApprovedLeave.value,
    todayDate: todayDate.value,
  })
})

const blocksAttendanceToday = computed(() => {
  return !!todayApprovedLeave.value && ['annual', 'sick', 'official', 'other'].includes(todayApprovedLeave.value.leave_type)
})

const todayDisplayStatus = computed(() => {
  if (todayApprovedLeave.value) return todayComputedStatus.value
  if (sessionsTableMissing.value) return todayComputedStatus.value
  if (workToggleMode.value === 'on') return { code: 'working', label: '근무 중', className: 'status-working' }
  if (workToggleMode.value === 'off' && todayRecord.value?.check_in_at && !todayRecord.value?.check_out_at) {
    return { code: 'working', label: '중단 중', className: 'status-paused' }
  }
  return todayComputedStatus.value
})

const currentModeLabel = computed(() => {
  if (todayApprovedLeave.value) return getLeaveTypeLabel(todayApprovedLeave.value.leave_type)
  if (sessionsTableMissing.value) return todayComputedStatus.value.label
  if (workToggleMode.value === 'before_start') return '미출근'
  if (workToggleMode.value === 'on') return '근무 중'
  if (workToggleMode.value === 'off') return '중단 중'
  return '퇴근 완료'
})

const todayWorkDuration = computed(() => {
  if (!todayRecord.value) return '-'
  const minutes = todaySessions.value.length
    ? calcWorkSessionMinutes(todaySessions.value, liveNowIso.value)
    : calcWorkMinutes(todayRecord.value.check_in_at, todayRecord.value.check_out_at)
  return formatWorkDuration(minutes)
})

const canLegacyCheckIn = computed(() => {
  return profileLoaded.value
    && !!user.value.id
    && !todayRecord.value?.check_in_at
    && !tableMissing.value
    && !blocksAttendanceToday.value
  })

const canLegacyCheckOut = computed(() => {
  return profileLoaded.value
    && !!user.value.id
    && !!todayRecord.value?.check_in_at
    && !todayRecord.value?.check_out_at
    && !tableMissing.value
  })

const canToggleWork = computed(() => {
  return profileLoaded.value
    && !!user.value.id
    && !tableMissing.value
    && !blocksAttendanceToday.value
    && !todayRecord.value?.check_out_at
    && !sessionsTableMissing.value
  })

const canFinalCheckOut = computed(() => {
  return profileLoaded.value
    && !!user.value.id
    && !!todayRecord.value?.check_in_at
    && !todayRecord.value?.check_out_at
    && !tableMissing.value
  })

function isMissingTableError(error: any, tableName: string) {
  const code = String(error?.code || '').toUpperCase()
  const msg = String(error?.message || '').toLowerCase()
  return code === '42P01' || msg.includes(tableName)
}

function isMissingSettingsColumnError(error: any) {
  const code = String(error?.code || '').toUpperCase()
  const msg = String(error?.message || '').toLowerCase()
  return code === '42703' || msg.includes('early_leave_grace_minutes')
}

async function fetchSettings() {
  const { data, error } = await supabase
    .from('attendance_settings')
    .select('id, work_start_time, work_end_time, late_grace_minutes, early_leave_grace_minutes, lunch_break_minutes, standard_work_minutes, created_at, updated_at')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'attendance_settings') || isMissingSettingsColumnError(error)) {
      settingsTableMissing.value = true
      settings.value = normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS)
      return
    }
    throw error
  }

  settingsTableMissing.value = false
  settings.value = normalizeAttendanceSettings((data as any) || DEFAULT_ATTENDANCE_SETTINGS)
}

async function fetchTodayRecord() {
  if (!user.value.id) return
  const { data, error } = await supabase
    .from('attendance_records')
    .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
    .eq('user_id', user.value.id)
    .eq('work_date', todayDate.value)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'attendance_records')) {
      tableMissing.value = true
      todayRecord.value = null
      return
    }
    throw error
  }

  tableMissing.value = false
  todayRecord.value = (data as AttendanceRecord | null) || null
}

async function fetchTodaySessions() {
  if (!user.value.id) return
  const { data, error } = await supabase
    .from('attendance_work_sessions')
    .select('id, record_id, user_id, work_date, started_at, ended_at, created_at, updated_at')
    .eq('user_id', user.value.id)
    .eq('work_date', todayDate.value)
    .order('started_at', { ascending: true })

  if (error) {
    if (isMissingTableError(error, 'attendance_work_sessions')) {
      sessionsTableMissing.value = true
      todaySessions.value = []
      return
    }
    throw error
  }

  sessionsTableMissing.value = false
  todaySessions.value = (data || []) as AttendanceWorkSession[]
}

async function fetchTodayLeave() {
  if (!user.value.id) return
  const { data, error } = await supabase
    .from('leave_requests')
    .select('id, user_id, leave_type, start_date, end_date, status, reason, approved_by, approved_at, created_at, updated_at')
    .eq('user_id', user.value.id)
    .eq('status', 'approved')
    .lte('start_date', todayDate.value)
    .gte('end_date', todayDate.value)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'leave_requests')) {
      leaveTableMissing.value = true
      todayApprovedLeave.value = null
      return
    }
    throw error
  }

  leaveTableMissing.value = false
  todayApprovedLeave.value = (data as LeaveRequest | null) || null
}

async function refreshToday() {
  if (!profileLoaded.value || !user.value.id) return
  try {
    todayDate.value = getKstDateKey()
    await Promise.all([
      fetchSettings(),
      fetchTodayRecord(),
      fetchTodaySessions(),
      fetchTodayLeave(),
    ])
  } catch (error: any) {
    console.error('Failed to fetch attendance records:', error)
    toast.error(`근태 기록을 불러오지 못했습니다: ${error?.message || '알 수 없는 오류'}`)
  }
}

async function ensureTodayRecord(startIso: string) {
  if (!user.value.id) throw new Error('로그인 정보가 없습니다.')
  if (todayRecord.value?.id) {
    if (!todayRecord.value.check_in_at) {
      const { data, error } = await supabase
        .from('attendance_records')
        .update({
          check_in_at: startIso,
          updated_by: user.value.id,
        })
        .eq('id', todayRecord.value.id)
        .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
        .single()
      if (error) throw error
      todayRecord.value = data as AttendanceRecord
    }
    return todayRecord.value
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .insert({
      user_id: user.value.id,
      work_date: todayDate.value,
      check_in_at: startIso,
      updated_by: user.value.id,
    })
    .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
    .single()

  if (error) throw error
  todayRecord.value = data as AttendanceRecord
  return todayRecord.value
}

async function handleLegacyCheckIn() {
  if (!canLegacyCheckIn.value || !user.value.id) return
  saving.value = true
  try {
    const nowIso = new Date().toISOString()
    await ensureTodayRecord(nowIso)
    toast.success('출근 기록이 저장되었습니다.')
    await refreshToday()
  } catch (error: any) {
    console.error('Failed to check in:', error)
    toast.error(`출근 기록 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

async function handleLegacyCheckOut() {
  if (!canLegacyCheckOut.value || !todayRecord.value?.id || !user.value.id) return
  saving.value = true
  try {
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('attendance_records')
      .update({
        check_out_at: nowIso,
        updated_by: user.value.id,
      })
      .eq('id', todayRecord.value.id)

    if (error) throw error
    toast.success('퇴근 기록이 저장되었습니다.')
    await refreshToday()
  } catch (error: any) {
    console.error('Failed to check out:', error)
    toast.error(`퇴근 기록 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

async function handleToggleWork() {
  if (!canToggleWork.value || !user.value.id || sessionsTableMissing.value) return
  saving.value = true
  try {
    const nowIso = new Date().toISOString()

    if (workToggleMode.value === 'before_start' || workToggleMode.value === 'off') {
      const record = await ensureTodayRecord(nowIso)
      const sessionStartAt = workToggleMode.value === 'before_start'
        ? nowIso
        : (todaySessions.value.length === 0 && record.check_in_at ? record.check_in_at : nowIso)

      const { error } = await supabase
        .from('attendance_work_sessions')
        .insert({
          record_id: record.id,
          user_id: user.value.id,
          work_date: todayDate.value,
          started_at: sessionStartAt,
        })
      if (isMissingTableError(error, 'attendance_work_sessions')) {
        sessionsTableMissing.value = true
        toast.success('출근 기록이 저장되었습니다.')
        await refreshToday()
        return
      }
      if (error) throw error
      toast.success(workToggleMode.value === 'before_start' ? '출근 기록이 저장되었습니다.' : '근무 재개 기록이 저장되었습니다.')
    } else if (workToggleMode.value === 'on' && openTodaySession.value) {
      const { error } = await supabase
        .from('attendance_work_sessions')
        .update({ ended_at: nowIso })
        .eq('id', openTodaySession.value.id)
      if (isMissingTableError(error, 'attendance_work_sessions')) {
        sessionsTableMissing.value = true
        toast.success('근무 전환 기록은 지원되지 않아 기본 출퇴근 방식으로 전환합니다.')
        await refreshToday()
        return
      }
      if (error) throw error
      toast.success('일시중단 기록이 저장되었습니다.')
    }

    await refreshToday()
  } catch (error: any) {
    console.error('Failed to toggle work session:', error)
    toast.error(`근무 기록 저장 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

async function handleFinalCheckOut() {
  if (!canFinalCheckOut.value || !todayRecord.value?.id || !user.value.id) return
  saving.value = true
  try {
    const nowIso = new Date().toISOString()

    if (!sessionsTableMissing.value && openTodaySession.value) {
      const { error: closeError } = await supabase
        .from('attendance_work_sessions')
        .update({ ended_at: nowIso })
        .eq('id', openTodaySession.value.id)
      if (isMissingTableError(closeError, 'attendance_work_sessions')) {
        sessionsTableMissing.value = true
      } else if (closeError) throw closeError
    }

    const { error } = await supabase
      .from('attendance_records')
      .update({
        check_out_at: nowIso,
        updated_by: user.value.id,
      })
      .eq('id', todayRecord.value.id)

    if (error) throw error
    toast.success('퇴근 기록이 저장되었습니다.')
    await refreshToday()
  } catch (error: any) {
    console.error('Failed to check out:', error)
    toast.error(`퇴근 기록 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

watch(
  () => [profileLoaded.value, user.value.id],
  async ([loaded, uid]) => {
    if (!loaded || !uid) return
    await refreshToday()
  },
  { immediate: true },
)

onMounted(() => {
  liveTimer = setInterval(() => {
    liveNowIso.value = new Date().toISOString()
  }, 30000)
})

onBeforeUnmount(() => {
  if (liveTimer) clearInterval(liveTimer)
})
</script>

<style scoped>
.records-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.records-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.records-title {
  font-size: 1.2rem;
  font-weight: 700;
}

.records-subtitle {
  color: var(--color-text-secondary);
  font-size: 0.94rem;
}

.today-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.today-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-md);
}

.today-label {
  font-size: 0.92rem;
  color: var(--color-text-secondary);
}

.today-status {
  display: block;
  margin-top: 6px;
  font-size: 1.8rem;
  font-weight: 800;
}

.today-note {
  margin-top: 8px;
  color: var(--color-text-secondary);
  font-size: 0.95rem;
  line-height: 1.5;
}

.today-pill {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.08);
  border: 1px solid rgba(37, 99, 235, 0.14);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #1d4ed8;
}

.today-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-md);
}

.today-item {
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid var(--color-border-light);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.today-item span {
  color: var(--color-text-secondary);
  font-size: 0.92rem;
}

.today-item strong {
  font-size: 1.05rem;
  font-weight: 700;
}

.flow-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-md);
}

.flow-step {
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--color-border-light);
  background: rgba(255, 255, 255, 0.76);
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.flow-step.active {
  border-color: rgba(37, 99, 235, 0.24);
  background: rgba(37, 99, 235, 0.06);
}

.flow-step.done {
  border-color: rgba(16, 185, 129, 0.22);
  background: rgba(16, 185, 129, 0.08);
}

.flow-step-index {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.84rem;
  font-weight: 800;
}

.flow-step strong {
  display: block;
  font-size: 0.95rem;
}

.flow-step span:last-child {
  display: block;
  margin-top: 4px;
  font-size: 0.85rem;
  line-height: 1.35;
  color: var(--color-text-secondary);
}

.action-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.action-main {
  width: 100%;
  min-height: 72px;
  font-size: 1.1rem;
  font-weight: 800;
}

.action-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
}

.action-primary,
.action-secondary {
  min-height: 64px;
  font-size: 1.02rem;
  font-weight: 700;
}

.action-complete {
  min-height: 92px;
  border-radius: 20px;
  background: rgba(37, 99, 235, 0.08);
  border: 1px solid rgba(37, 99, 235, 0.12);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
}

.action-complete strong {
  font-size: 1.1rem;
  font-weight: 800;
}

.action-complete span {
  color: var(--color-text-secondary);
}

.leave-complete {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.18);
}

.session-list-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-label {
  font-size: 0.96rem;
  font-weight: 700;
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.session-item {
  display: grid;
  grid-template-columns: 88px 1fr 1fr;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid var(--color-border-light);
}

.session-index {
  font-weight: 700;
}

.history-empty {
  color: var(--color-text-secondary);
  font-size: 0.94rem;
}

.today-warning {
  font-size: 0.9rem;
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 16px;
  padding: 12px 14px;
}

.today-warning.neutral {
  color: var(--color-text-secondary);
  background: rgba(248, 250, 252, 0.88);
  border-color: rgba(148, 163, 184, 0.2);
}

@media (max-width: 960px) {
  .today-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .flow-strip {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .action-row,
  .today-grid,
  .session-item,
  .today-head {
    grid-template-columns: 1fr;
  }

  .action-main,
  .action-primary,
  .action-secondary {
    width: 100%;
  }

  .today-head {
    display: flex;
    flex-direction: column;
  }
}
</style>
