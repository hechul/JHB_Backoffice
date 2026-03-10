<template>
  <div class="records-page">
    <div class="records-header">
      <h1 class="records-title">출퇴근 기록</h1>
      <span class="records-subtitle">오늘 근무 상태와 휴가 신청, 월간 근태 이력을 한 화면에서 확인합니다.</span>
    </div>

    <div class="card today-card">
      <div class="today-head">
        <div>
          <div class="today-label">오늘 ({{ todayDate }})</div>
          <strong class="today-status" :class="todayDisplayStatus.className">{{ todayDisplayStatus.label }}</strong>
          <div v-if="todayApprovedLeave" class="today-leave-note">
            승인된 부재: {{ getLeaveTypeLabel(todayApprovedLeave.leave_type) }}
          </div>
          <div v-else class="today-leave-note">
            {{ workToggleDescription }}
          </div>
        </div>
        <div class="today-actions" v-if="!sessionsTableMissing">
          <button
            class="work-toggle-btn"
            :class="workToggleClass"
            :disabled="!canToggleWork || saving"
            @click="handleToggleWork"
          >
            <span class="work-toggle-track">
              <span class="work-toggle-thumb" />
            </span>
            <strong>{{ workToggleLabel }}</strong>
          </button>
          <button
            class="btn btn-primary btn-sm checkout-btn"
            :disabled="!canFinalCheckOut || saving"
            @click="handleFinalCheckOut"
          >
            퇴근
          </button>
        </div>
        <div class="today-actions" v-else>
          <button class="btn btn-primary btn-sm" :disabled="!canLegacyCheckIn || saving" @click="handleLegacyCheckIn">출근 기록</button>
          <button class="btn btn-ghost btn-sm" :disabled="!canLegacyCheckOut || saving" @click="handleLegacyCheckOut">퇴근 기록</button>
        </div>
      </div>

      <div class="today-grid">
        <div class="today-item">
          <span>출근 시간</span>
          <strong>{{ formatTime(todayRecord?.check_in_at) }}</strong>
        </div>
        <div class="today-item">
          <span>퇴근 시간</span>
          <strong>{{ formatTime(todayRecord?.check_out_at) }}</strong>
        </div>
        <div class="today-item">
          <span>근무 시간</span>
          <strong>{{ todayWorkDuration }}</strong>
        </div>
        <div class="today-item">
          <span>현재 모드</span>
          <strong>{{ currentModeLabel }}</strong>
        </div>
      </div>

      <div v-if="!sessionsTableMissing" class="session-list-wrap">
        <div class="section-label">오늘 근무 전환 기록</div>
        <div v-if="todaySessionsSorted.length === 0" class="history-empty">아직 근무 기록이 없습니다.</div>
        <div v-else class="session-list">
          <div v-for="(session, index) in todaySessionsSorted" :key="session.id" class="session-item">
            <span class="session-index">기록 {{ index + 1 }}</span>
            <span>ON {{ formatTime(session.started_at) }}</span>
            <span>OFF {{ formatTime(session.ended_at) }}</span>
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
        `docs/sql/2026-03-10_attendance_phase2.sql` 또는 `docs/sql/2026-03-10_attendance_onoff_early_leave_patch.sql` 실행이 필요합니다.
      </div>
      <div v-if="leaveTableMissing" class="today-warning neutral">
        `leave_requests` 테이블이 없어 휴가/반차 기능은 표시되지 않습니다.
        `docs/sql/2026-03-10_attendance_phase2.sql` 실행이 필요합니다.
      </div>
    </div>

    <div class="card leave-card">
      <div class="leave-head">
        <h2>휴가 · 반차 신청</h2>
      </div>

      <div v-if="leaveTableMissing" class="history-empty">휴가/반차 기능은 SQL 패치 적용 후 사용할 수 있습니다.</div>
      <template v-else>
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
            <input v-model="leaveForm.end_date" type="date" class="input" :disabled="savingLeave || isHalfDayType(leaveForm.leave_type)" />
          </label>
          <label class="field field-wide">
            <span>사유</span>
            <textarea v-model.trim="leaveForm.reason" class="input textarea-input" rows="3" :disabled="savingLeave" />
          </label>
        </div>
        <div class="leave-actions">
          <button class="btn btn-primary btn-sm" :disabled="savingLeave" @click="submitLeaveRequest">신청하기</button>
        </div>

        <div class="leave-request-list">
          <div class="section-label">이번 달 신청 내역</div>
          <div v-if="visibleLeaveRequests.length === 0" class="history-empty">해당 월 신청 내역이 없습니다.</div>
          <div v-else class="history-table-wrap">
            <table class="history-table leave-table">
              <thead>
                <tr>
                  <th>유형</th>
                  <th>기간</th>
                  <th>상태</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in visibleLeaveRequests" :key="row.id">
                  <td>{{ getLeaveTypeLabel(row.leave_type) }}</td>
                  <td>{{ row.start_date }}<span v-if="row.end_date !== row.start_date"> ~ {{ row.end_date }}</span></td>
                  <td>
                    <span class="status-chip" :class="getLeaveStatusClass(row.status)">{{ getLeaveStatusLabel(row.status) }}</span>
                  </td>
                  <td>{{ row.reason || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>

    <div class="card history-card">
      <div class="history-head">
        <h2>월간 근태 이력</h2>
        <input v-model="selectedMonth" type="month" class="input month-input" />
      </div>

      <div v-if="loading" class="history-empty">기록 불러오는 중...</div>
      <div v-else-if="historyRows.length === 0" class="history-empty">해당 월 기록이 없습니다.</div>
      <div v-else class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th>날짜</th>
                <th>출근 시각</th>
                <th>퇴근 시각</th>
                <th>총 근무시간</th>
                <th>상태</th>
                <th>메모</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in historyRows" :key="row.key">
              <td>{{ formatDate(row.workDate) }}</td>
              <td>{{ formatTime(row.record?.check_in_at) }}</td>
              <td>{{ formatTime(row.record?.check_out_at) }}</td>
              <td>{{ formatWorkDuration(row.workMinutes) }}</td>
              <td>
                <span class="status-chip" :class="row.status.className">{{ row.status.label }}</span>
              </td>
              <td>{{ row.note }}</td>
            </tr>
          </tbody>
        </table>
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
  getKstMonthKey,
  getMonthRange,
  formatDate,
  formatTime,
  calcWorkMinutes,
  calcWorkSessionMinutes,
  formatWorkDuration,
  normalizeAttendanceSettings,
  getLeaveTypeLabel,
  getLeaveStatusLabel,
  getLeaveStatusClass,
  createLeaveDateMap,
  computeAttendanceStatus,
} = useAttendance()

const todayDate = ref(getKstDateKey())
const selectedMonth = ref(getKstMonthKey())
const todayRecord = ref<AttendanceRecord | null>(null)
const todaySessions = ref<AttendanceWorkSession[]>([])
const monthlyRecords = ref<AttendanceRecord[]>([])
const monthlySessions = ref<AttendanceWorkSession[]>([])
const todayApprovedLeave = ref<LeaveRequest | null>(null)
const leaveRequests = ref<LeaveRequest[]>([])
const settings = ref<AttendanceSettings>(normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS))
const loading = ref(false)
const saving = ref(false)
const savingLeave = ref(false)
const tableMissing = ref(false)
const sessionsTableMissing = ref(false)
const settingsTableMissing = ref(false)
const leaveTableMissing = ref(false)
const liveNowIso = ref(new Date().toISOString())
let liveTimer: ReturnType<typeof setInterval> | null = null

const leaveForm = reactive({
  leave_type: 'annual' as LeaveType,
  start_date: todayDate.value,
  end_date: todayDate.value,
  reason: '',
})

const todaySessionsSorted = computed(() => {
  return [...todaySessions.value].sort((a, b) => a.started_at.localeCompare(b.started_at))
})

const monthlySessionMap = computed(() => {
  const map = new Map<string, AttendanceWorkSession[]>()
  for (const session of monthlySessions.value) {
    const bucket = map.get(session.work_date) || []
    bucket.push(session)
    map.set(session.work_date, bucket)
  }
  for (const sessions of map.values()) {
    sessions.sort((a, b) => a.started_at.localeCompare(b.started_at))
  }
  return map
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

const todayDisplayStatus = computed(() => {
  if (todayApprovedLeave.value) return todayComputedStatus.value
  if (sessionsTableMissing.value) return todayComputedStatus.value
  if (workToggleMode.value === 'on') return { code: 'working', label: '근무 중', className: 'status-working' }
  if (workToggleMode.value === 'off' && todayRecord.value?.check_in_at && !todayRecord.value?.check_out_at) {
    return { code: 'working', label: '휴식 중', className: 'status-paused' }
  }
  return todayComputedStatus.value
})

const workToggleLabel = computed(() => {
  if (workToggleMode.value === 'on') return 'OFF'
  if (workToggleMode.value === 'done') return '기록 완료'
  return 'ON'
})

const workToggleDescription = computed(() => {
  if (workToggleMode.value === 'before_start') return '근무를 시작할 때 ON을 누르고, 잠시 멈출 때는 OFF를 누른 뒤 마지막에 퇴근을 기록합니다.'
  if (workToggleMode.value === 'on') return '현재 근무 중입니다. 잠시 멈출 때 OFF를 누릅니다.'
  if (workToggleMode.value === 'off') return '현재 휴식 중입니다. 다시 근무할 때 ON을 누릅니다.'
  return '오늘 퇴근까지 기록이 완료되었습니다.'
})

const workToggleClass = computed(() => {
  if (workToggleMode.value === 'before_start' || workToggleMode.value === 'off') return 'is-off'
  if (workToggleMode.value === 'on') return 'is-on'
  return 'is-done'
})

const currentModeLabel = computed(() => {
  if (todayApprovedLeave.value) return getLeaveTypeLabel(todayApprovedLeave.value.leave_type)
  if (sessionsTableMissing.value) return todayComputedStatus.value.label
  if (workToggleMode.value === 'before_start') return '대기'
  if (workToggleMode.value === 'on') return '근무 중'
  if (workToggleMode.value === 'off') return '휴식 중'
  return '퇴근 완료'
})

const todayWorkDuration = computed(() => {
  if (!todayRecord.value) return '-'
  const minutes = todaySessions.value.length
    ? calcWorkSessionMinutes(todaySessions.value, liveNowIso.value)
    : calcWorkMinutes(todayRecord.value.check_in_at, todayRecord.value.check_out_at)
  return formatWorkDuration(minutes)
})

const visibleLeaveRequests = computed(() => {
  const { start, end } = getMonthRange(selectedMonth.value)
  return [...leaveRequests.value]
    .filter((row) => row.start_date <= end && row.end_date >= start)
    .sort((a, b) => `${b.start_date}${b.created_at}`.localeCompare(`${a.start_date}${a.created_at}`))
})

const historyRows = computed(() => {
  const { start, end } = getMonthRange(selectedMonth.value)
  const recordMap = new Map(monthlyRecords.value.map((row) => [row.work_date, row]))
  const approvedLeaveMap = createLeaveDateMap(leaveRequests.value)
  const dateKeys = new Set<string>()

  for (const row of monthlyRecords.value) {
    if (row.work_date >= start && row.work_date <= end) dateKeys.add(row.work_date)
  }
  for (const date of approvedLeaveMap.keys()) {
    if (date >= start && date <= end) dateKeys.add(date)
  }
  for (const date of monthlySessionMap.value.keys()) {
    if (date >= start && date <= end) dateKeys.add(date)
  }

  return Array.from(dateKeys)
    .sort((a, b) => b.localeCompare(a))
    .map((workDate) => {
      const record = recordMap.get(workDate) || null
      const leave = approvedLeaveMap.get(workDate) || null
      const sessions = monthlySessionMap.value.get(workDate) || []
      const status = computeAttendanceStatus({
        workDate,
        checkInAt: record?.check_in_at,
        checkOutAt: record?.check_out_at,
        settings: settings.value,
        approvedLeave: leave,
        todayDate: todayDate.value,
      })
      const workMinutes = sessions.length
        ? calcWorkSessionMinutes(sessions, workDate === todayDate.value ? liveNowIso.value : null)
        : calcWorkMinutes(record?.check_in_at, record?.check_out_at)
      const noteParts: string[] = []
      if (leave) noteParts.push(getLeaveTypeLabel(leave.leave_type))
      if (sessions.length) noteParts.push(`근무 전환 ${sessions.length}회`)

      return {
        key: `${workDate}-${record?.id || 'leave'}`,
        workDate,
        record,
        leave,
        status,
        workMinutes,
        note: noteParts.join(' · ') || '-',
      }
    })
})

const blocksAttendanceToday = computed(() => {
  return !!todayApprovedLeave.value && ['annual', 'sick', 'official', 'other'].includes(todayApprovedLeave.value.leave_type)
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

async function fetchMonthlyRecords() {
  if (!user.value.id) return
  const { start, end } = getMonthRange(selectedMonth.value)
  const { data, error } = await supabase
    .from('attendance_records')
    .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
    .eq('user_id', user.value.id)
    .gte('work_date', start)
    .lte('work_date', end)
    .order('work_date', { ascending: false })
    .order('id', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'attendance_records')) {
      tableMissing.value = true
      monthlyRecords.value = []
      return
    }
    throw error
  }

  tableMissing.value = false
  monthlyRecords.value = (data || []) as AttendanceRecord[]
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

async function fetchMonthlySessions() {
  if (!user.value.id) return
  const { start, end } = getMonthRange(selectedMonth.value)
  const { data, error } = await supabase
    .from('attendance_work_sessions')
    .select('id, record_id, user_id, work_date, started_at, ended_at, created_at, updated_at')
    .eq('user_id', user.value.id)
    .gte('work_date', start)
    .lte('work_date', end)
    .order('started_at', { ascending: true })

  if (error) {
    if (isMissingTableError(error, 'attendance_work_sessions')) {
      sessionsTableMissing.value = true
      monthlySessions.value = []
      return
    }
    throw error
  }

  sessionsTableMissing.value = false
  monthlySessions.value = (data || []) as AttendanceWorkSession[]
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

async function fetchLeaveRequests() {
  if (!user.value.id) return
  const { start, end } = getMonthRange(selectedMonth.value)
  const { data, error } = await supabase
    .from('leave_requests')
    .select('id, user_id, leave_type, start_date, end_date, status, reason, approved_by, approved_at, created_at, updated_at')
    .eq('user_id', user.value.id)
    .lte('start_date', end)
    .gte('end_date', start)
    .order('start_date', { ascending: false })
    .order('id', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'leave_requests')) {
      leaveTableMissing.value = true
      leaveRequests.value = []
      return
    }
    throw error
  }

  leaveTableMissing.value = false
  leaveRequests.value = (data || []) as LeaveRequest[]
}

async function refreshRecords() {
  if (!profileLoaded.value || !user.value.id) return
  loading.value = true
  try {
    todayDate.value = getKstDateKey()
    await Promise.all([
      fetchSettings(),
      fetchTodayRecord(),
      fetchTodaySessions(),
      fetchMonthlyRecords(),
      fetchMonthlySessions(),
      fetchTodayLeave(),
      fetchLeaveRequests(),
    ])
  } catch (error: any) {
    console.error('Failed to fetch attendance records:', error)
    toast.error(`근태 기록을 불러오지 못했습니다: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    loading.value = false
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
    await refreshRecords()
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
    await refreshRecords()
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
      if (error) throw error
      toast.success(workToggleMode.value === 'before_start' ? '근무 시작 기록이 저장되었습니다.' : '근무 재개 기록이 저장되었습니다.')
    } else if (workToggleMode.value === 'on' && openTodaySession.value) {
      const { error } = await supabase
        .from('attendance_work_sessions')
        .update({ ended_at: nowIso })
        .eq('id', openTodaySession.value.id)
      if (error) throw error
      toast.success('휴식 시작 기록이 저장되었습니다.')
    }

    await refreshRecords()
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
      if (closeError) throw closeError
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
    await refreshRecords()
  } catch (error: any) {
    console.error('Failed to check out:', error)
    toast.error(`퇴근 기록 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

async function submitLeaveRequest() {
  if (leaveTableMissing.value) return
  if (!user.value.id) return
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
    await Promise.all([fetchLeaveRequests(), fetchTodayLeave()])
  } catch (error: any) {
    console.error('Failed to submit leave request:', error)
    toast.error(`휴가 신청 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    savingLeave.value = false
  }
}

watch(
  () => leaveForm.leave_type,
  (type) => {
    if (isHalfDayType(type)) {
      leaveForm.end_date = leaveForm.start_date
    }
  },
)

watch(
  () => leaveForm.start_date,
  (value) => {
    if (isHalfDayType(leaveForm.leave_type)) {
      leaveForm.end_date = value
    }
  },
)

watch(
  () => [profileLoaded.value, user.value.id],
  async ([loaded, uid]) => {
    if (!loaded || !uid) return
    await refreshRecords()
  },
  { immediate: true },
)

watch(selectedMonth, async () => {
  if (!profileLoaded.value || !user.value.id) return
  try {
    await Promise.all([fetchMonthlyRecords(), fetchMonthlySessions(), fetchLeaveRequests()])
  } catch (error: any) {
    console.error('Failed to fetch monthly attendance records:', error)
    toast.error(`월별 기록 조회 실패: ${error?.message || '알 수 없는 오류'}`)
  }
})

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
  gap: var(--space-xs);
}

.records-title {
  font-size: 1.125rem;
  font-weight: 700;
}

.records-subtitle {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.today-card,
.leave-card,
.history-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.today-head,
.leave-head,
.history-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.today-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}

.today-status {
  font-size: 0.9375rem;
  font-weight: 700;
}

.today-leave-note {
  margin-top: 6px;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.today-actions,
.leave-actions {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.work-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 132px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 8px 12px;
  background: #f3f4f6;
  color: var(--color-text-secondary);
}

.checkout-btn {
  min-width: 84px;
}

.work-toggle-btn.is-off {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.work-toggle-btn.is-on {
  background: #ecfdf3;
  border-color: #86efac;
  color: #166534;
}

.work-toggle-btn.is-done {
  background: #f3f4f6;
  border-color: #d1d5db;
  color: #6b7280;
}

.work-toggle-track {
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: #bfdbfe;
}

.work-toggle-btn.is-on .work-toggle-track {
  background: #22c55e;
}

.work-toggle-btn.is-done .work-toggle-track {
  background: #d1d5db;
}

.work-toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
  transition: transform 0.18s ease;
}

.work-toggle-btn.is-on .work-toggle-thumb,
.work-toggle-btn.is-done .work-toggle-thumb {
  transform: translateX(18px);
}

.today-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-sm);
}

.today-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: rgba(248, 250, 252, 0.82);
  border: 1px solid var(--color-border-light);
}

.today-item span {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.today-item strong {
  font-size: 0.95rem;
  font-weight: 700;
}

.session-list-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.session-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px;
}

.session-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: rgba(248, 250, 252, 0.82);
  border: 1px solid var(--color-border-light);
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.session-index {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.section-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.today-warning {
  font-size: 0.8125rem;
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.today-warning.neutral {
  color: #374151;
  background: #f9fafb;
  border-color: #e5e7eb;
}

.leave-form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-sm);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field span {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.field-wide {
  grid-column: 1 / -1;
}

.textarea-input {
  resize: vertical;
}

.leave-request-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.history-empty {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.history-table-wrap {
  overflow-x: auto;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 720px;
}

.history-table th,
.history-table td {
  border-bottom: 1px solid var(--color-border-light);
  padding: 10px 8px;
  text-align: left;
  font-size: 0.8125rem;
}

.history-table th {
  color: var(--color-text-muted);
  font-weight: 600;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
}

.status-empty,
.status-paused {
  color: #6b7280;
  background: #f3f4f6;
}

.status-working {
  color: #0369a1;
  background: #e0f2fe;
}

.status-done {
  color: #166534;
  background: #dcfce7;
}

.status-leave {
  color: #7c3aed;
  background: #f3e8ff;
}

.status-late,
.status-warning {
  color: #b45309;
  background: #fef3c7;
}

.status-absent {
  color: #b91c1c;
  background: #fee2e2;
}

@media (max-width: 960px) {
  .today-head,
  .leave-head,
  .history-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .today-grid,
  .leave-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .today-grid,
  .leave-form-grid {
    grid-template-columns: 1fr;
  }

  .work-toggle-btn,
  .checkout-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
