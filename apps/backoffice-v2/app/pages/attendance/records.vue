<template>
  <div class="records-page">
    <div class="records-header">
      <div>
        <h1 class="records-title">출퇴근 기록</h1>
      </div>
      <button
        v-if="!leaveTableMissing"
        type="button"
        class="btn btn-ghost records-header-btn"
        @click="isLeaveModalOpen = true"
      >
        휴가 신청
      </button>
    </div>

    <div class="card today-card" :class="{ 'mode-cta': workToggleMode === 'before_start' && !blocksAttendanceToday }">
      <div class="today-head">
        <div class="today-head-copy">
          <div class="today-label">오늘 ({{ todayDate }})</div>
          <strong class="today-status" :class="todayDisplayStatus.className">{{ todayDisplayStatus.label }}</strong>
          <div v-if="todayApprovedLeave" class="today-note">
            승인된 부재: {{ getLeaveTypeLabel(todayApprovedLeave.leave_type) }}
          </div>
          <div class="today-badges">
            <span v-if="nextActionLabel" class="today-helper-chip accent">다음 행동 · {{ nextActionLabel }}</span>
            <span class="today-helper-chip">기준 퇴근 · {{ settings.work_end_time }}</span>
          </div>
        </div>
        <div class="today-pill">{{ currentModeLabel }}</div>
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
              <button class="btn btn-primary btn-lg action-primary" :disabled="saving || !canFinalCheckOut" @click="isCheckOutConfirmOpen = true">퇴근하기</button>
              <button class="btn btn-ghost btn-lg action-secondary" :disabled="saving || !canToggleWork" @click="handleToggleWork">일시중단</button>
            </div>

            <div v-else-if="workToggleMode === 'off'" class="action-row">
              <button class="btn btn-primary btn-lg action-primary" :disabled="saving || !canToggleWork" @click="handleToggleWork">재시작</button>
              <button class="btn btn-ghost btn-lg action-secondary" :disabled="saving || !canFinalCheckOut" @click="isCheckOutConfirmOpen = true">퇴근하기</button>
            </div>

            <div v-else class="action-complete">
              <strong>오늘도 수고하셨습니다</strong>
              <span>기록 저장 완료</span>
            </div>
          </template>

          <div v-else class="action-row legacy-row">
            <button class="btn btn-primary btn-lg action-primary" :disabled="!canLegacyCheckIn || saving" @click="handleLegacyCheckIn">출근하기</button>
            <button class="btn btn-ghost btn-lg action-secondary" :disabled="!canLegacyCheckOut || saving" @click="isCheckOutConfirmOpen = true">퇴근하기</button>
          </div>
        </template>
        <div v-else class="action-complete leave-complete">
          <strong>{{ todayDisplayStatus.label }}</strong>
          <span>오늘은 근태 입력이 없습니다.</span>
        </div>
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
          <span>기준 퇴근</span>
          <strong>{{ settings.work_end_time }}</strong>
        </div>
      </div>

      <div
        v-if="!sessionsTableMissing && (todaySessionsSorted.length > 0 || workToggleMode !== 'before_start')"
        class="session-list-wrap"
      >
        <div class="session-head">
          <div class="section-label">오늘 근무 전환 기록</div>
          <div v-if="todaySessionHeadline" class="session-headline">{{ todaySessionHeadline }}</div>
        </div>
        <div v-if="todaySessionEntries.length === 0" class="history-empty">아직 근무 전환 기록이 없습니다.</div>
        <div v-else class="session-list">
          <article
            v-for="entry in todaySessionEntries"
            :key="entry.id"
            class="session-item"
            :class="{ active: entry.isOpen }"
          >
            <div class="session-marker" aria-hidden="true"></div>
            <div class="session-body">
              <div class="session-top">
                <strong class="session-range">{{ entry.rangeLabel }}</strong>
                <span class="session-state" :class="{ active: entry.isOpen }">{{ entry.stateLabel }}</span>
              </div>
              <div class="session-meta">{{ entry.metaLabel }}</div>
            </div>
          </article>
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

    <div v-if="isCheckOutConfirmOpen" class="modal-backdrop" @click.self="isCheckOutConfirmOpen = false">
      <div class="confirm-modal">
        <div class="confirm-modal-body">
          <strong>퇴근 처리하시겠습니까?</strong>
          <span>퇴근 후에는 다시 출근으로 되돌릴 수 없습니다.</span>
        </div>
        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-ghost" :disabled="saving" @click="isCheckOutConfirmOpen = false">취소</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="confirmFinalCheckOut">퇴근하기</button>
        </div>
      </div>
    </div>

    <div v-if="isLeaveModalOpen" class="modal-backdrop" @click.self="closeLeaveModal">
      <div class="leave-modal">
        <div class="leave-modal-head">
          <div>
            <h2>휴가 · 반차 신청</h2>
          </div>
          <button type="button" class="modal-close-btn" @click="closeLeaveModal">닫기</button>
        </div>

        <div class="leave-form-grid">
          <label class="field">
            <span>유형</span>
            <select v-model="leaveForm.leave_type" class="input select-input" :disabled="savingLeave">
              <option value="annual">연차</option>
              <option value="half_am">오전 반차</option>
              <option value="half_pm">오후 반차</option>
              <option value="sick">병가</option>
              <option value="official">공가</option>
              <option value="other">기타</option>
            </select>
          </label>

          <label class="field">
            <span>시작일</span>
            <input v-model="leaveForm.start_date" type="date" class="input" :disabled="savingLeave" />
          </label>

          <label class="field">
            <span>종료일</span>
            <input
              v-model="leaveForm.end_date"
              type="date"
              class="input"
              :disabled="savingLeave || isHalfDayType(leaveForm.leave_type)"
            />
          </label>

          <label class="field field-wide">
            <span>사유</span>
            <textarea v-model.trim="leaveForm.reason" class="input textarea-input" rows="3" :disabled="savingLeave" />
          </label>
        </div>

        <div class="leave-modal-actions">
          <button type="button" class="btn btn-ghost" :disabled="savingLeave" @click="closeLeaveModal">취소</button>
          <button type="button" class="btn btn-primary" :disabled="savingLeave" @click="submitLeaveRequest">신청하기</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AttendanceRecord, AttendanceSettings, AttendanceWorkSession, LeaveRequest, LeaveType } from '~/composables/useAttendance'

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
const savingLeave = ref(false)
const tableMissing = ref(false)
const sessionsTableMissing = ref(false)
const settingsTableMissing = ref(false)
const leaveTableMissing = ref(false)
const liveNowIso = ref(new Date().toISOString())
const isLeaveModalOpen = ref(false)
const isCheckOutConfirmOpen = ref(false)
let liveTimer: ReturnType<typeof setInterval> | null = null

const leaveForm = reactive({
  leave_type: 'annual' as LeaveType,
  start_date: getKstDateKey(),
  end_date: getKstDateKey(),
  reason: '',
})

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
  if (workToggleMode.value === 'before_start' && todayComputedStatus.value.code === 'off_day') return todayComputedStatus.value.label
  if (workToggleMode.value === 'before_start') return '미출근'
  if (workToggleMode.value === 'on') return `근무 중 · ${todayWorkDuration.value}`
  if (workToggleMode.value === 'off') return '중단 중'
  return '퇴근 완료'
})

const nextActionLabel = computed(() => {
  if (todayApprovedLeave.value && blocksAttendanceToday.value) return ''
  if (sessionsTableMissing.value) {
    if (canLegacyCheckIn.value) return '출근'
    if (canLegacyCheckOut.value) return '퇴근'
    return '완료'
  }
  if (workToggleMode.value === 'before_start') {
    return todayComputedStatus.value.code === 'off_day' ? '필요 시 출근' : '출근'
  }
  if (workToggleMode.value === 'on') return '퇴근 또는 일시중단'
  if (workToggleMode.value === 'off') return '재시작 또는 퇴근'
  return '완료'
})

const todayWorkDuration = computed(() => {
  if (!todayRecord.value) return '-'
  const minutes = todaySessions.value.length
    ? calcWorkSessionMinutes(todaySessions.value, {
        openSessionEndAt: liveNowIso.value,
        overrideStartAt: todayRecord.value.check_in_at,
        overrideEndAt: todayRecord.value.check_out_at,
      })
    : calcWorkMinutes(todayRecord.value.check_in_at, todayRecord.value.check_out_at)
  return formatWorkDuration(minutes)
})

const todaySessionHeadline = computed(() => {
  if (!todaySessionsSorted.value.length) return ''
  const firstStart = formatTime(todaySessionsSorted.value[0]?.started_at)
  const countLabel = todaySessionsSorted.value.length > 1
    ? `근무 ${todaySessionsSorted.value.length}회`
    : '근무 1회'
  const stateLabel = workToggleMode.value === 'on'
    ? '현재 근무 중'
    : workToggleMode.value === 'off'
      ? '현재 중단 중'
      : workToggleMode.value === 'done'
        ? '오늘 기록 완료'
        : ''

  return [countLabel, firstStart !== '-' ? `첫 시작 ${firstStart}` : '', stateLabel].filter(Boolean).join(' · ')
})

const todaySessionEntries = computed(() => {
  return todaySessionsSorted.value.map((session) => {
    const isOpen = !session.ended_at
    const endAt = session.ended_at || liveNowIso.value
    const duration = formatWorkDuration(calcWorkMinutes(session.started_at, endAt))

    return {
      id: session.id,
      isOpen,
      rangeLabel: `${formatTime(session.started_at)} - ${isOpen ? '진행 중' : formatTime(session.ended_at)}`,
      stateLabel: isOpen ? '진행 중' : '완료',
      metaLabel: isOpen ? `${duration}째 근무 중` : duration,
    }
  })
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

function isHalfDayType(type: LeaveType) {
  return type === 'half_am' || type === 'half_pm'
}

function closeLeaveModal() {
  isLeaveModalOpen.value = false
}

async function confirmFinalCheckOut() {
  isCheckOutConfirmOpen.value = false
  if (sessionsTableMissing.value) {
    await handleLegacyCheckOut()
  } else {
    await handleFinalCheckOut()
  }
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

async function submitLeaveRequest() {
  if (leaveTableMissing.value || !user.value.id) return
  if (!leaveForm.start_date || !leaveForm.end_date) {
    toast.error('휴가 기간을 입력해야 합니다.')
    return
  }
  if (isHalfDayType(leaveForm.leave_type)) {
    leaveForm.end_date = leaveForm.start_date
  }
  if (leaveForm.end_date < leaveForm.start_date) {
    toast.error('종료일은 시작일보다 빠를 수 없습니다.')
    return
  }

  savingLeave.value = true
  try {
    const { error } = await supabase
      .from('leave_requests')
      .insert({
        user_id: user.value.id,
        leave_type: leaveForm.leave_type,
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        reason: leaveForm.reason || null,
      })

    if (error) throw error
    toast.success('휴가 신청이 저장되었습니다.')
    leaveForm.reason = ''
    closeLeaveModal()
    await refreshToday()
  } catch (error: any) {
    console.error('Failed to submit leave request:', error)
    toast.error(`휴가 신청 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    savingLeave.value = false
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

watch(
  () => leaveForm.leave_type,
  (type) => {
    if (isHalfDayType(type)) leaveForm.end_date = leaveForm.start_date
  },
)

watch(
  () => leaveForm.start_date,
  (value) => {
    if (isHalfDayType(leaveForm.leave_type)) leaveForm.end_date = value
  },
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
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.records-title {
  font-size: 1.2rem;
  font-weight: 700;
}

.records-header-btn {
  min-height: 40px;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}

.today-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.today-card.mode-cta {
  border-color: rgba(37, 99, 235, 0.22);
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.06), 0 12px 32px rgba(15, 23, 42, 0.06);
}

.today-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-md);
}

.today-head-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
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

.today-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.today-helper-chip {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.18);
  color: var(--color-text-secondary);
  font-size: 0.84rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.today-helper-chip.accent {
  color: #1d4ed8;
  border-color: rgba(37, 99, 235, 0.18);
  background: rgba(239, 246, 255, 0.92);
}

.today-pill {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.18);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: var(--color-text-primary);
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

.action-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: 18px;
  border-radius: 22px;
  background: rgba(248, 250, 252, 0.76);
  border: 1px solid rgba(148, 163, 184, 0.14);
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
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.18);
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
  border-color: rgba(16, 185, 129, 0.22);
}

.session-list-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.session-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-label {
  font-size: 0.96rem;
  font-weight: 700;
}

.session-headline {
  font-size: 0.88rem;
  color: var(--color-text-secondary);
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.session-item {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 14px;
  align-items: flex-start;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid var(--color-border-light);
}

.session-item.active {
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(255, 255, 255, 0.92);
}

.session-marker {
  width: 10px;
  height: 10px;
  margin-top: 7px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.7);
  box-shadow: 0 0 0 6px rgba(148, 163, 184, 0.12);
}

.session-item.active .session-marker {
  background: rgba(37, 99, 235, 0.92);
  box-shadow: 0 0 0 6px rgba(37, 99, 235, 0.12);
}

.session-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.session-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.session-range {
  font-size: 0.96rem;
  font-weight: 700;
}

.session-state {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.94);
  color: var(--color-text-secondary);
  font-size: 0.8rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.session-state.active {
  border-color: rgba(37, 99, 235, 0.18);
  color: #1d4ed8;
}

.session-meta {
  font-size: 0.88rem;
  color: var(--color-text-secondary);
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

.tone-slate {
  background: rgba(255, 255, 255, 0.94);
  border-color: rgba(148, 163, 184, 0.22);
}

.tone-blue {
  background: rgba(255, 255, 255, 0.94);
  border-color: rgba(37, 99, 235, 0.22);
}

.tone-amber {
  background: rgba(255, 255, 255, 0.94);
  border-color: rgba(245, 158, 11, 0.24);
}

.tone-purple {
  background: rgba(255, 255, 255, 0.94);
  border-color: rgba(139, 92, 246, 0.22);
}

.tone-red {
  background: rgba(255, 255, 255, 0.94);
  border-color: rgba(239, 68, 68, 0.22);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  padding: 24px;
  background: rgba(15, 23, 42, 0.44);
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
  animation: none !important;
}

.leave-modal {
  width: min(640px, 100%);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
  border: 1px solid rgba(255, 255, 255, 0.14);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: none !important;
  transform: none !important;
}

.leave-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.modal-close-btn {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid var(--color-border-light);
  background: #fff;
  color: var(--color-text-secondary);
  font-weight: 700;
  -webkit-tap-highlight-color: transparent;
}

.leave-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field span {
  font-size: 0.88rem;
  font-weight: 700;
}

.field-wide {
  grid-column: 1 / -1;
}

.textarea-input {
  min-height: 108px;
  resize: vertical;
}

.leave-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.confirm-modal {
  width: min(400px, 100%);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
  border: 1px solid rgba(255, 255, 255, 0.14);
  padding: 28px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: none !important;
  transform: none !important;
}

.records-header-btn:focus,
.modal-close-btn:focus,
.leave-modal-actions :deep(.btn):focus,
.confirm-modal-actions :deep(.btn):focus {
  outline: none;
}

.records-header-btn:focus-visible,
.modal-close-btn:focus-visible,
.leave-modal-actions :deep(.btn):focus-visible,
.confirm-modal-actions :deep(.btn):focus-visible {
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.14);
}

.confirm-modal-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding: 4px 0;
}

.confirm-modal-body strong {
  font-size: 1.08rem;
  font-weight: 800;
}

.confirm-modal-body span {
  color: var(--color-text-secondary);
  font-size: 0.92rem;
}

.confirm-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 960px) {
  .today-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .action-row,
  .leave-form-grid {
    grid-template-columns: 1fr;
  }

  .records-header-btn {
    width: 100%;
    justify-content: center;
  }

  .today-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .action-main,
  .action-primary,
  .action-secondary {
    width: 100%;
  }

  .today-head,
  .records-header,
  .session-head,
  .session-top {
    display: flex;
    flex-direction: column;
  }

  .today-pill {
    width: 100%;
  }

  .session-state {
    align-self: flex-start;
  }

  .today-item {
    min-height: 96px;
  }

  .session-list {
    max-height: 248px;
    overflow-y: auto;
    padding-right: 4px;
    scrollbar-width: thin;
  }

  .session-item {
    padding: 13px 14px;
  }

  .modal-backdrop {
    padding: 16px;
  }
}
</style>
