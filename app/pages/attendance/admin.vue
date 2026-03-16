<template>
  <div class="admin-page">
    <div v-if="!profileLoaded" class="card empty-state">
      <div class="empty-state-title">권한 확인 중</div>
    </div>

    <div v-else-if="!isAdmin" class="card empty-state">
      <div class="empty-state-title">접근 권한이 없습니다</div>
      <div class="empty-state-desc">금일 근태 이력은 관리자 계정에서만 확인할 수 있습니다.</div>
    </div>

    <template v-else>
      <div class="admin-header">
        <div>
          <h1 class="admin-title">금일 근태 이력</h1>
          <div class="admin-subtitle">{{ todayDate }}{{ lastRefreshedLabel ? ` · ${lastRefreshedLabel}` : '' }}</div>
        </div>
        <div class="admin-actions">
          <input v-model.trim="searchText" type="text" class="input search-input" placeholder="이름/아이디 검색" />
          <NuxtLink to="/attendance/settings" class="btn btn-ghost btn-sm">근무 기준 설정</NuxtLink>
        </div>
      </div>

      <div v-if="tableMissing" class="card notice-error">
        `attendance_records` 테이블이 없어 관리자 화면을 사용할 수 없습니다.
        `docs/sql/2026-03-05_attendance_phase1.sql` 실행이 필요합니다.
      </div>
      <div v-if="sessionsTableMissing" class="card notice-neutral">
        `attendance_work_sessions` 테이블이 없어 근무 시작/중단 기록 구분 없이 기존 출퇴근 기록만 표시합니다.
        `docs/sql/2026-03-10_attendance_work_sessions_patch.sql` 실행이 필요합니다.
      </div>
      <div v-if="settingsTableMissing" class="card notice-neutral">
        `attendance_settings` 최신 설정이 없어 기본 근무 기준(09:00~18:00, 조퇴 20분)으로 상태를 계산 중입니다.
      </div>
      <div v-if="leaveTableMissing" class="card notice-neutral">
        `leave_requests` 테이블이 없어 휴가/반차 정보는 표시되지 않습니다.
        `docs/sql/2026-03-10_attendance_phase2.sql` 실행이 필요합니다.
      </div>

      <div v-if="absentCount > 0 && !tableMissing" class="absent-banner">
        <strong class="absent-banner-count">미출근 {{ absentCount }}명</strong>
        <span class="absent-banner-desc">출근 예정 시각({{ settings.work_start_time }})이 지났습니다.</span>
      </div>

      <div class="summary-grid">
        <div v-for="card in summaryCards" :key="card.label" class="card summary-card">
          <div class="summary-head">
            <span class="summary-label">{{ card.label }}</span>
            <div class="summary-icon-wrap" :class="card.tone">
              <component :is="card.icon" :size="16" :stroke-width="1.9" />
            </div>
          </div>
          <strong class="summary-value">{{ card.value }}</strong>
        </div>
      </div>

      <div class="card table-card">
        <div class="section-head">
          <h2>오늘 근태 현황</h2>
        </div>
        <div class="status-filter-row">
          <button
            v-for="filter in adminStatusFilters"
            :key="filter.value"
            type="button"
            class="status-filter-chip"
            :class="{ active: selectedStatusFilter === filter.value }"
            @click="selectedStatusFilter = filter.value"
          >
            {{ filter.label }}
          </button>
        </div>
        <div v-if="filteredTodayRows.length === 0" class="table-empty">표시할 오늘 근태가 없습니다.</div>
        <div v-else class="today-card-grid">
          <article
            v-for="row in filteredTodayRows"
            :key="`today-${row.user_id}`"
            class="today-person-card"
            :class="row.displayStatus.className"
          >
            <div class="today-person-head">
              <div>
                <div class="today-person-name">{{ row.user_name }}</div>
                <div class="today-person-id">{{ row.user_login_id }}</div>
              </div>
              <span class="status-chip" :class="row.displayStatus.className">{{ row.displayStatus.label }}</span>
            </div>

            <div class="today-metric-grid">
              <div class="today-metric">
                <span class="today-metric-label">출근 시각</span>
                <strong class="today-metric-value">{{ formatTime(row.record?.check_in_at) }}</strong>
              </div>
              <div class="today-metric">
                <span class="today-metric-label">퇴근 시각</span>
                <strong class="today-metric-value">{{ formatTime(row.record?.check_out_at) }}</strong>
              </div>
              <div class="today-metric">
                <span class="today-metric-label">총 근무시간</span>
                <strong class="today-metric-value">{{ formatWorkDuration(row.workMinutes) }}</strong>
              </div>
            </div>

            <div v-if="row.note !== '-'" class="today-note-row">
              <span class="today-note-label">메모</span>
              <span class="today-note-value">{{ row.note }}</span>
            </div>

            <div v-if="row.record?.id" class="today-card-actions">
              <span class="today-card-action-hint">잘못 입력된 오늘 기록은 여기서 바로 수정하거나 삭제할 수 있습니다.</span>
              <div class="today-card-action-buttons">
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  :disabled="savingRecordId === row.record.id || deletingRecordId === row.record.id"
                  @click="openEditModal(row)"
                >
                  수정
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm today-delete-btn"
                  :disabled="deletingRecordId === row.record.id || savingRecordId === row.record.id"
                  @click="openDeleteModal(row)"
                >
                  <Trash2 :size="14" :stroke-width="1.8" />
                  삭제
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </template>

    <div v-if="editTargetRow" class="modal-backdrop" @click.self="closeEditModal">
      <div class="confirm-modal edit-modal">
        <div class="confirm-modal-body edit-modal-body">
          <strong>{{ editTargetRow.user_name }}님의 오늘 근태 기록 수정</strong>
          <span>{{ todayDate }} 기준 출퇴근 시각을 바로 수정합니다.</span>
        </div>

        <div class="edit-grid">
          <div class="edit-datetime-card">
            <div class="edit-datetime-head">
              <span>출근</span>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="savingRecordId === editTargetRow.record?.id"
                @click="applyEditDraft('check_in')"
              >
                확인
              </button>
            </div>
            <div class="edit-datetime-inputs">
              <input v-model="editCheckInDate" type="date" class="input date-input" />
              <input v-model="editCheckInTime" type="time" class="input time-input" />
            </div>
          </div>
          <div class="edit-datetime-card">
            <div class="edit-datetime-head">
              <span>퇴근</span>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="savingRecordId === editTargetRow.record?.id"
                @click="applyEditDraft('check_out')"
              >
                확인
              </button>
            </div>
            <div class="edit-datetime-inputs">
              <input v-model="editCheckOutDate" type="date" class="input date-input" />
              <input v-model="editCheckOutTime" type="time" class="input time-input" />
            </div>
          </div>
          <div class="edit-field">
            <span>근무시간</span>
            <strong>{{ editDuration }}</strong>
          </div>
        </div>

        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-ghost" :disabled="savingRecordId === editTargetRow.record?.id" @click="closeEditModal">취소</button>
          <button type="button" class="btn btn-primary" :disabled="savingRecordId === editTargetRow.record?.id" @click="saveEditRow">저장</button>
        </div>
      </div>
    </div>

    <div v-if="deleteTargetRow" class="modal-backdrop" @click.self="closeDeleteModal">
      <div class="confirm-modal">
        <div class="confirm-modal-body">
          <strong>{{ deleteTargetRow.user_name }}님의 오늘 근태 기록을 삭제할까요?</strong>
          <span>출퇴근 시각과 연결된 오늘 근무 전환 기록도 함께 삭제됩니다.</span>
        </div>
        <div class="confirm-modal-actions">
          <button
            type="button"
            class="btn btn-ghost"
            :disabled="deletingRecordId === deleteTargetRow.record?.id"
            @click="closeDeleteModal"
          >
            취소
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="deletingRecordId === deleteTargetRow.record?.id"
            @click="confirmDeleteRow"
          >
            삭제하기
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CalendarCheck2, PauseCircle, PlayCircle, Trash2, Users, UserRoundX } from 'lucide-vue-next'
import type { AttendanceRecord, AttendanceSettings, AttendanceWorkSession, LeaveRequest } from '~/composables/useAttendance'

definePageMeta({ layout: 'attendance' })

type ProfileRow = {
  profile_id: string
  user_name: string
  user_email: string
  user_login_id: string
}

type TodayAttendanceRow = ProfileRow & {
  user_id: string
  record: AttendanceRecord | null
  leave: LeaveRequest | null
  sessions: AttendanceWorkSession[]
  displayStatus: { label: string, className: string }
  note: string
  workMinutes: number
}

const supabase = useSupabaseClient()
const toast = useToast()
const { user, isAdmin, profileLoaded } = useCurrentUser()
const {
  DEFAULT_ATTENDANCE_SETTINGS,
  getKstDateKey,
  isWeekendDateKey,
  formatTime,
  calcWorkMinutes,
  calcWorkSessionMinutes,
  formatWorkDuration,
  toDateTimeLocalValue,
  parseDateTimeLocalToIso,
  getDateKeyFromDateTimeLocalValue,
  getTimeValueFromDateTimeLocalValue,
  buildDateTimeLocalValue,
  shiftIsoToDateKey,
  normalizeAttendanceSettings,
  getLeaveTypeLabel,
  computeAttendanceStatus,
} = useAttendance()

const todayDate = ref(getKstDateKey())
const searchText = ref('')
const selectedStatusFilter = ref<'all' | 'working' | 'paused' | 'done' | 'leave'>('all')
const loading = ref(false)
const tableMissing = ref(false)
const sessionsTableMissing = ref(false)
const settingsTableMissing = ref(false)
const leaveTableMissing = ref(false)
const activeProfiles = ref<ProfileRow[]>([])
const todayRecords = ref<AttendanceRecord[]>([])
const todaySessions = ref<AttendanceWorkSession[]>([])
const todayLeaves = ref<LeaveRequest[]>([])
const settings = ref<AttendanceSettings>(normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS))
const liveNowIso = ref(new Date().toISOString())
const lastRefreshedAt = ref<Date | null>(null)
const editTargetRow = ref<TodayAttendanceRow | null>(null)
const editCheckInDate = ref('')
const editCheckInTime = ref('')
const editCheckOutDate = ref('')
const editCheckOutTime = ref('')
const editCheckIn = ref('')
const editCheckOut = ref('')
const savingRecordId = ref<number | null>(null)
const deletingRecordId = ref<number | null>(null)
const deleteTargetRow = ref<TodayAttendanceRow | null>(null)
let liveTimer: ReturnType<typeof setInterval> | null = null
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null

const todaySessionMap = computed(() => {
  const map = new Map<string, AttendanceWorkSession[]>()
  for (const session of todaySessions.value) {
    const bucket = map.get(session.user_id) || []
    bucket.push(session)
    map.set(session.user_id, bucket)
  }
  for (const sessions of map.values()) {
    sessions.sort((a, b) => a.started_at.localeCompare(b.started_at))
  }
  return map
})

const todaySessionMapByRecord = computed(() => {
  const map = new Map<number, AttendanceWorkSession[]>()
  for (const session of todaySessions.value) {
    const bucket = map.get(session.record_id) || []
    bucket.push(session)
    map.set(session.record_id, bucket)
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.started_at.localeCompare(b.started_at))
  }
  return map
})

const todayRows = computed<TodayAttendanceRow[]>(() => {
  const recordMap = new Map(todayRecords.value.map((row) => [row.user_id, row]))
  const leaveMap = new Map(todayLeaves.value.map((row) => [row.user_id, row]))
  return activeProfiles.value.map((profile) => {
    const record = recordMap.get(profile.profile_id) || null
    const leave = leaveMap.get(profile.profile_id) || null
    const sessions = todaySessionMap.value.get(profile.profile_id) || []
    const baseStatus = computeAttendanceStatus({
      workDate: todayDate.value,
      checkInAt: record?.check_in_at,
      checkOutAt: record?.check_out_at,
      settings: settings.value,
      approvedLeave: leave,
      todayDate: todayDate.value,
    })
    const openSession = sessions.find((session) => !session.ended_at)
    let displayStatus = { label: baseStatus.label, className: baseStatus.className }
    if (!leave && record?.check_in_at && !record?.check_out_at) {
      if (openSession) displayStatus = { label: '근무 중', className: 'status-working' }
      else if (!sessionsTableMissing.value) displayStatus = { label: '중단 중', className: 'status-paused' }
    }

    const workMinutes = sessions.length
      ? calcWorkSessionMinutes(sessions, {
          openSessionEndAt: liveNowIso.value,
          overrideStartAt: record?.check_in_at,
          overrideEndAt: record?.check_out_at,
        })
      : calcWorkMinutes(record?.check_in_at, record?.check_out_at)

    const noteParts: string[] = []
    if (leave) noteParts.push(getLeaveTypeLabel(leave.leave_type))
    else if (record?.check_in_at && !record?.check_out_at) noteParts.push(openSession ? '근무 중' : '중단 중')
    if (sessions.length) noteParts.push(`근무 전환 ${sessions.length}회`)

    return {
      ...profile,
      user_id: profile.profile_id,
      record,
      leave,
      sessions,
      displayStatus,
      note: noteParts.join(' · ') || '-',
      workMinutes,
    }
  })
})

const filteredTodayRows = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  return todayRows.value.filter((row) => {
    const matchesText = !q || [row.user_name, row.user_login_id, row.displayStatus.label, row.note]
      .some((value) => String(value || '').toLowerCase().includes(q))
    return matchesText && matchesAdminStatus(row)
  })
})

const adminStatusFilters = [
  { label: '전체', value: 'all' },
  { label: '근무 중', value: 'working' },
  { label: '중단 중', value: 'paused' },
  { label: '퇴근 완료', value: 'done' },
  { label: '휴가/반차', value: 'leave' },
] as const

const lastRefreshedLabel = computed(() => {
  if (!lastRefreshedAt.value) return ''
  const d = lastRefreshedAt.value
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 기준`
})

const absentCount = computed(() => {
  if (tableMissing.value) return 0
  if (isWeekendDateKey(todayDate.value)) return 0
  const nowKst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const [h = 9, m = 0] = (settings.value.work_start_time || '09:00').split(':').map(Number)
  const grace = settings.value.late_grace_minutes ?? 10
  const thresholdMinutes = h * 60 + m + grace
  const nowMinutes = nowKst.getHours() * 60 + nowKst.getMinutes()
  if (nowMinutes < thresholdMinutes) return 0
  return todayRows.value.filter((row) => !row.record?.check_in_at && !row.leave).length
})

const summaryCards = computed(() => {
  const list = todayRows.value
  const countBy = (predicate: (row: TodayAttendanceRow) => boolean) => list.filter(predicate).length
  return [
    { label: '전체 인원', value: `${list.length}명`, tone: 'summary-tone-slate', icon: Users },
    { label: '근무 중', value: `${countBy((row) => row.displayStatus.label === '근무 중')}명`, tone: 'summary-tone-blue', icon: PlayCircle },
    { label: '중단 중', value: `${countBy((row) => row.displayStatus.label === '중단 중')}명`, tone: 'summary-tone-amber', icon: PauseCircle },
    { label: '퇴근 완료', value: `${countBy((row) => row.record?.check_out_at != null)}명`, tone: 'summary-tone-green', icon: CalendarCheck2 },
    { label: '휴가/반차', value: `${countBy((row) => row.displayStatus.className === 'status-leave')}명`, tone: 'summary-tone-purple', icon: UserRoundX },
  ]
})

function matchesAdminStatus(row: TodayAttendanceRow) {
  if (selectedStatusFilter.value === 'all') return true
  if (selectedStatusFilter.value === 'working') return row.displayStatus.label === '근무 중'
  if (selectedStatusFilter.value === 'paused') return row.displayStatus.label === '중단 중'
  if (selectedStatusFilter.value === 'done') return row.record?.check_out_at != null
  if (selectedStatusFilter.value === 'leave') return row.displayStatus.className === 'status-leave'
  return true
}

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

function splitEmailLoginId(email: string) {
  const [idPart = ''] = String(email || '').split('@')
  return idPart || '-'
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

async function fetchActiveProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status')
    .eq('status', 'active')
    .order('full_name', { ascending: true })

  if (error) throw error

  activeProfiles.value = (data || []).map((row: any) => {
    const email = String(row.email || '')
    return {
      profile_id: String(row.id || ''),
      user_name: String(row.full_name || splitEmailLoginId(email) || '-'),
      user_email: email,
      user_login_id: splitEmailLoginId(email),
    }
  })
}

async function fetchTodayAttendanceRows() {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
    .eq('work_date', todayDate.value)
    .order('id', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'attendance_records')) {
      tableMissing.value = true
      todayRecords.value = []
      return
    }
    throw error
  }

  tableMissing.value = false
  todayRecords.value = (data || []) as AttendanceRecord[]
}

async function fetchTodaySessions() {
  const { data, error } = await supabase
    .from('attendance_work_sessions')
    .select('id, record_id, user_id, work_date, started_at, ended_at, created_at, updated_at')
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

async function fetchTodayLeaves() {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('id, user_id, leave_type, start_date, end_date, status, reason, approved_by, approved_at, created_at, updated_at')
    .eq('status', 'approved')
    .lte('start_date', todayDate.value)
    .gte('end_date', todayDate.value)
    .order('id', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'leave_requests')) {
      leaveTableMissing.value = true
      todayLeaves.value = []
      return
    }
    throw error
  }

  leaveTableMissing.value = false
  todayLeaves.value = (data || []) as LeaveRequest[]
}

async function refreshTodayRows() {
  if (!isAdmin.value || !profileLoaded.value) return
  loading.value = true
  try {
    todayDate.value = getKstDateKey()
    await Promise.all([
      fetchSettings(),
      fetchActiveProfiles(),
      fetchTodayAttendanceRows(),
      fetchTodaySessions(),
      fetchTodayLeaves(),
    ])
    lastRefreshedAt.value = new Date()
  } catch (error: any) {
    console.error('Failed to fetch admin today rows:', error)
    toast.error(`금일 근태 조회 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    loading.value = false
  }
}

const editDuration = computed(() => {
  const inIso = parseDateTimeLocalToIso(editCheckIn.value)
  const outIso = parseDateTimeLocalToIso(editCheckOut.value)
  return formatWorkDuration(calcWorkMinutes(inIso, outIso))
})

function openEditModal(row: TodayAttendanceRow) {
  if (!row.record?.id) return
  editTargetRow.value = row
  editCheckIn.value = toDateTimeLocalValue(row.record.check_in_at)
  editCheckOut.value = toDateTimeLocalValue(row.record.check_out_at)
  syncEditDraftFields()
}

function closeEditModal() {
  if (savingRecordId.value) return
  editTargetRow.value = null
  editCheckInDate.value = ''
  editCheckInTime.value = ''
  editCheckOutDate.value = ''
  editCheckOutTime.value = ''
  editCheckIn.value = ''
  editCheckOut.value = ''
}

function syncEditDraftFields() {
  editCheckInDate.value = getDateKeyFromDateTimeLocalValue(editCheckIn.value)
  editCheckInTime.value = getTimeValueFromDateTimeLocalValue(editCheckIn.value)
  editCheckOutDate.value = getDateKeyFromDateTimeLocalValue(editCheckOut.value)
  editCheckOutTime.value = getTimeValueFromDateTimeLocalValue(editCheckOut.value)
}

function applyEditDraft(target: 'check_in' | 'check_out', options?: { silent?: boolean }) {
  const isCheckIn = target === 'check_in'
  const dateValue = isCheckIn ? editCheckInDate.value : editCheckOutDate.value
  const timeValue = isCheckIn ? editCheckInTime.value : editCheckOutTime.value

  if (!dateValue && !timeValue) {
    if (isCheckIn) editCheckIn.value = ''
    else editCheckOut.value = ''
    if (!options?.silent) toast.success(`${isCheckIn ? '출근' : '퇴근'} 시각을 비웠습니다.`)
    return true
  }

  if (!dateValue || !timeValue) {
    toast.error(`${isCheckIn ? '출근' : '퇴근'} 날짜와 시간을 모두 선택해주세요.`)
    return false
  }

  const nextValue = buildDateTimeLocalValue(dateValue, timeValue)
  if (isCheckIn) editCheckIn.value = nextValue
  else editCheckOut.value = nextValue
  if (!options?.silent) toast.success(`${isCheckIn ? '출근' : '퇴근'} 시각을 반영했습니다.`)
  return true
}

function openDeleteModal(row: TodayAttendanceRow) {
  if (!row.record?.id) return
  deleteTargetRow.value = row
}

function closeDeleteModal() {
  if (deletingRecordId.value) return
  deleteTargetRow.value = null
}

async function confirmDeleteRow() {
  const recordId = deleteTargetRow.value?.record?.id
  if (!recordId) return

  deletingRecordId.value = recordId
  try {
    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('id', recordId)

    if (error) throw error

    toast.success('오늘 근태 기록을 삭제했습니다.')
    deleteTargetRow.value = null
    await refreshTodayRows()
  } catch (error: any) {
    console.error('Failed to delete attendance record from admin page:', error)
    toast.error(`근태 삭제 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    deletingRecordId.value = null
  }
}

async function saveEditRow() {
  const target = editTargetRow.value
  const recordId = target?.record?.id
  if (!recordId) return

  if (!applyEditDraft('check_in', { silent: true })) return
  if (!applyEditDraft('check_out', { silent: true })) return

  const checkInIso = parseDateTimeLocalToIso(editCheckIn.value)
  const checkOutIso = parseDateTimeLocalToIso(editCheckOut.value)
  const workDate = getDateKeyFromDateTimeLocalValue(editCheckIn.value)
    || getDateKeyFromDateTimeLocalValue(editCheckOut.value)
    || target.record?.work_date
    || todayDate.value

  if (checkOutIso && !checkInIso) {
    toast.error('퇴근 시간만 단독 저장할 수 없습니다.')
    return
  }
  if (checkInIso && checkOutIso && new Date(checkOutIso).getTime() < new Date(checkInIso).getTime()) {
    toast.error('퇴근 시간은 출근 시간보다 빠를 수 없습니다.')
    return
  }

  savingRecordId.value = recordId
  try {
    const sessionsForRecord = todaySessionMapByRecord.value.get(recordId) || []
    if (!sessionsTableMissing.value && sessionsForRecord.length > 0) {
      const updatedSessions = sessionsForRecord.map((session) => ({
        ...session,
        work_date: workDate,
        started_at: shiftIsoToDateKey(session.started_at, workDate) || session.started_at,
        ended_at: shiftIsoToDateKey(session.ended_at, workDate),
        updated_at: new Date().toISOString(),
      }))
      const { error: sessionError } = await supabase
        .from('attendance_work_sessions')
        .upsert(updatedSessions)

      if (sessionError) throw sessionError
    }

    const { error } = await supabase
      .from('attendance_records')
      .update({
        work_date: workDate,
        check_in_at: checkInIso,
        check_out_at: checkOutIso,
        updated_by: user.value.id || null,
      })
      .eq('id', recordId)

    if (error) throw error

    toast.success('오늘 근태 기록을 수정했습니다.')
    closeEditModal()
    await refreshTodayRows()
  } catch (error: any) {
    console.error('Failed to save attendance record from admin page:', error)
    toast.error(`근태 수정 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    savingRecordId.value = null
  }
}

watch(
  () => [profileLoaded.value, isAdmin.value],
  async ([loaded, admin]) => {
    if (!loaded || !admin) return
    await refreshTodayRows()
  },
  { immediate: true },
)

onMounted(() => {
  liveTimer = setInterval(() => {
    liveNowIso.value = new Date().toISOString()
  }, 30000)

  autoRefreshTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return
    void refreshTodayRows()
  }, 10 * 60 * 1000)
})

onBeforeUnmount(() => {
  if (liveTimer) clearInterval(liveTimer)
  if (autoRefreshTimer) clearInterval(autoRefreshTimer)
})
</script>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.admin-header,
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.admin-title {
  font-size: 1.18rem;
  font-weight: 700;
}

.admin-subtitle {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 0.94rem;
}

.admin-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.search-input {
  min-width: 220px;
}

.notice-error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.notice-neutral {
  color: var(--color-text-secondary);
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.absent-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-radius: 18px;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.absent-banner-count {
  font-size: 0.96rem;
  font-weight: 800;
  color: #b91c1c;
  white-space: nowrap;
}

.absent-banner-desc {
  font-size: 0.9rem;
  color: #b91c1c;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-md);
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(226, 232, 240, 0.88);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.04);
}

.summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.summary-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.summary-tone-slate {
  background: rgba(148, 163, 184, 0.12);
  color: #475569;
}

.summary-tone-blue {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
}

.summary-tone-amber {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.summary-tone-green {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
}

.summary-tone-purple {
  background: rgba(139, 92, 246, 0.12);
  color: #6d28d9;
}

.summary-label {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.summary-value {
  font-size: 1.35rem;
  font-weight: 800;
}

.table-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.today-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
}

.today-person-card {
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.today-person-card.status-working {
  border-color: rgba(37, 99, 235, 0.16);
}

.today-person-card.status-paused {
  border-color: rgba(245, 158, 11, 0.18);
}

.today-person-card.status-leave {
  border-color: rgba(139, 92, 246, 0.18);
}

.today-person-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.today-person-name {
  font-size: 1.04rem;
  font-weight: 800;
}

.today-person-id {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 0.88rem;
}

.today-metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.today-metric {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.14);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.today-metric-label {
  color: var(--color-text-secondary);
  font-size: 0.84rem;
}

.today-metric-value {
  font-size: 1rem;
  font-weight: 800;
}

.today-note-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 4px;
  border-top: 1px dashed rgba(148, 163, 184, 0.22);
}

.today-note-label {
  color: var(--color-text-secondary);
  font-size: 0.88rem;
}

.today-note-value {
  text-align: right;
  font-weight: 600;
}

.today-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 4px;
  border-top: 1px dashed rgba(148, 163, 184, 0.22);
}

.today-card-action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.today-card-action-hint {
  color: var(--color-text-secondary);
  font-size: 0.86rem;
  line-height: 1.4;
}

.today-delete-btn {
  min-height: 38px;
  color: #b91c1c;
  border-color: rgba(239, 68, 68, 0.18);
  white-space: nowrap;
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
}

.confirm-modal {
  width: min(420px, 100%);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
  border: 1px solid rgba(255, 255, 255, 0.14);
  padding: 28px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.edit-modal {
  width: min(520px, 100%);
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
  font-size: 1.06rem;
  font-weight: 800;
}

.confirm-modal-body span {
  color: var(--color-text-secondary);
  font-size: 0.92rem;
  line-height: 1.5;
}

.confirm-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.status-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.status-filter-chip {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--color-border-light);
  background: rgba(255, 255, 255, 0.82);
  color: var(--color-text-secondary);
  font-size: 0.92rem;
  font-weight: 700;
}

.status-filter-chip.active {
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
}

.table-empty {
  color: var(--color-text-secondary);
}

@media (max-width: 960px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .today-card-grid,
  .today-metric-grid {
    grid-template-columns: 1fr;
  }
}

.edit-modal-body {
  align-items: flex-start;
  text-align: left;
}

.edit-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-datetime-card,
.edit-field {
  padding: 14px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.edit-datetime-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.edit-datetime-head span {
  color: var(--color-text-secondary);
  font-size: 0.86rem;
  font-weight: 700;
}

.edit-datetime-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 10px;
}

.edit-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-field span {
  color: var(--color-text-secondary);
  font-size: 0.86rem;
  font-weight: 700;
}

.edit-field strong {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.12);
  display: inline-flex;
  align-items: center;
}

@media (max-width: 768px) {
  .admin-header,
  .section-head,
  .admin-actions,
  .today-card-actions,
  .confirm-modal-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .edit-datetime-inputs {
    grid-template-columns: 1fr;
  }

  .today-card-action-buttons {
    flex-direction: column;
    align-items: stretch;
  }

  .search-input {
    min-width: 0;
  }

  .modal-backdrop {
    padding: 16px;
  }
}
</style>
