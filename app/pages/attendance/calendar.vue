<template>
  <div class="calendar-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">월별 근태 캘린더</h1>
      </div>
      <div class="page-actions">
        <input v-model="selectedMonth" type="month" class="input month-input" />
        <input v-if="isAdmin" v-model.trim="searchText" type="text" class="input search-input" placeholder="이름/아이디 검색" />
        <button
          v-if="isAdmin"
          type="button"
          class="btn btn-ghost btn-sm"
          :disabled="saving || exporting"
          @click="downloadMonthlyAttendanceWorkbook"
        >
          {{ exporting ? '엑셀 생성 중...' : '엑셀 다운로드' }}
        </button>
      </div>
    </div>

    <div v-if="tableMissing" class="card notice-error">
      `attendance_records` 테이블이 없어 월별 근태 캘린더를 사용할 수 없습니다.
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

    <div class="summary-grid">
      <div v-for="item in monthlySummaryCards" :key="item.label" class="card summary-card">
        <div class="summary-head">
          <span class="summary-label">{{ item.label }}</span>
          <div class="summary-icon-wrap" :class="item.tone">
            <component :is="item.icon" :size="16" :stroke-width="1.9" />
          </div>
        </div>
        <strong class="summary-value">{{ item.value }}</strong>
      </div>
    </div>

    <div class="card calendar-card">
      <div class="section-head">
        <h2>{{ selectedMonthLabel }}</h2>
      </div>

      <div class="calendar-tools">
        <button type="button" class="btn btn-ghost btn-sm" @click="jumpToCurrentMonth">이번 달</button>
        <button v-if="selectedCalendarDate" type="button" class="btn btn-ghost btn-sm" @click="openDateModal(selectedCalendarDate)">선택한 날짜 다시 보기</button>
      </div>

      <div class="calendar-legend">
        <span class="legend-item"><span class="legend-dot legend-working"></span>근무</span>
        <span class="legend-item"><span class="legend-dot legend-late"></span>지각</span>
        <span class="legend-item"><span class="legend-dot legend-leave"></span>휴가</span>
        <span class="legend-item"><span class="legend-dot legend-absent"></span>결근</span>
      </div>

      <div class="calendar-grid">
        <div v-for="weekday in calendarWeekdayLabels" :key="weekday" class="calendar-weekday">{{ weekday }}</div>
        <button
          v-for="cell in calendarCells"
          :key="cell.date"
          type="button"
          class="calendar-day"
          :class="{ outside: !cell.inMonth, selected: cell.date === selectedCalendarDate, today: cell.date === todayDate }"
          :disabled="!cell.inMonth"
          @click="openDateModal(cell.date)"
        >
          <div class="calendar-day-head">
            <span class="calendar-day-number">{{ cell.dayNumber }}</span>
            <span v-if="cell.totalCount > 0" class="calendar-day-total">{{ cell.totalCount }}</span>
          </div>
          <template v-if="isAdmin">
            <div class="calendar-day-stats">
              <span class="calendar-stat present">근무 {{ cell.presentCount }}</span>
              <span class="calendar-stat late">지각 {{ cell.lateCount }}</span>
              <span class="calendar-stat leave">휴가 {{ cell.leaveCount }}</span>
              <span class="calendar-stat absent">결근 {{ cell.absentCount }}</span>
            </div>
          </template>
          <template v-else>
            <div class="calendar-day-single">
              <span class="status-chip" :class="cell.status.className">{{ cell.status.label }}</span>
              <span class="calendar-single-note">{{ cell.timeLabel }}</span>
            </div>
          </template>
        </button>
      </div>
    </div>

    <div v-if="dateModalOpen" class="detail-modal" @click.self="closeDateModal">
      <div class="detail-dialog">
      <div class="detail-head">
        <div>
          <h2>{{ selectedCalendarDateLabel }}</h2>
        </div>
        <button type="button" class="detail-close" @click="closeDateModal">닫기</button>
      </div>

        <div class="detail-summary">
          <div class="detail-metric">
            <span>근태 기록</span>
            <strong>{{ selectedDateRows.length }}건</strong>
          </div>
          <div class="detail-metric">
            <span>휴가/반차</span>
            <strong>{{ selectedDateLeaveRows.length }}건</strong>
          </div>
        </div>

        <div v-if="selectedDateLeaveRows.length > 0" class="selected-leave-list">
          <div v-for="leave in selectedDateLeaveRows" :key="`leave-${leave.id}`" class="selected-leave-item">
            <div class="selected-leave-head">
              <span class="selected-leave-user">{{ leave.user_name }} · {{ leave.user_login_id }}</span>
              <span class="status-chip" :class="getLeaveStatusClass(leave.status)">{{ getLeaveTypeLabel(leave.leave_type) }} {{ getLeaveStatusLabel(leave.status) }}</span>
            </div>
            <div class="selected-leave-meta">
              <span>{{ leave.start_date }}<span v-if="leave.end_date !== leave.start_date"> ~ {{ leave.end_date }}</span></span>
              <span class="selected-leave-reason">{{ leave.reason || '사유 없음' }}</span>
            </div>
          </div>
        </div>

        <div v-if="selectedDateRows.length === 0" class="table-empty">선택한 날짜의 근태 기록이 없습니다.</div>
        <div v-else class="detail-record-grid">
          <article v-for="row in selectedDateRows" :key="row.id" class="detail-record-card">
            <div class="detail-record-head">
              <div>
                <div class="detail-record-name">{{ row.user_name }}</div>
                <div class="detail-record-id">{{ row.user_login_id }}</div>
              </div>
              <span
                v-if="!(isAdmin && editingRowId === row.id)"
                class="status-chip"
                :class="statusForRow(row).className"
              >
                {{ statusForRow(row).label }}
              </span>
              <span
                v-else
                class="status-chip"
                :class="statusClassFromValues(editCheckIn, editCheckOut)"
              >
                {{ statusLabelFromValues(editCheckIn, editCheckOut) }}
              </span>
            </div>

            <template v-if="isAdmin && editingRowId === row.id">
              <div class="detail-record-edit-grid">
                <div class="detail-edit-datetime-card">
                  <div class="detail-edit-datetime-head">
                    <span>출근</span>
                    <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="applyCalendarEditDraft('check_in')">확인</button>
                  </div>
                  <div class="detail-edit-datetime-inputs">
                    <input v-model="editCheckInDate" type="date" class="input date-input" />
                    <input v-model="editCheckInTime" type="time" class="input time-input" />
                  </div>
                </div>
                <div class="detail-edit-datetime-card">
                  <div class="detail-edit-datetime-head">
                    <span>퇴근</span>
                    <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="applyCalendarEditDraft('check_out')">확인</button>
                  </div>
                  <div class="detail-edit-datetime-inputs">
                    <input v-model="editCheckOutDate" type="date" class="input date-input" />
                    <input v-model="editCheckOutTime" type="time" class="input time-input" />
                  </div>
                </div>
                <div class="detail-field">
                  <span>근무시간</span>
                  <strong>{{ editDuration }}</strong>
                </div>
              </div>
              <div class="row-actions">
                <button class="btn btn-primary btn-sm" :disabled="saving" @click="saveEdit(row)">저장</button>
                <button class="btn btn-ghost btn-sm" :disabled="saving" @click="cancelEdit">취소</button>
              </div>
            </template>

            <template v-else>
              <div class="detail-record-metrics">
                <div class="detail-record-metric">
                  <span>출근</span>
                  <strong>{{ formatTime(row.check_in_at) }}</strong>
                </div>
                <div class="detail-record-metric">
                  <span>퇴근</span>
                  <strong>{{ formatTime(row.check_out_at) }}</strong>
                </div>
                <div class="detail-record-metric">
                  <span>근무시간</span>
                  <strong>{{ formatWorkDuration(rowWorkMinutes(row)) }}</strong>
                </div>
              </div>
              <div v-if="isAdmin" class="row-actions">
                <button class="btn btn-ghost btn-sm" :disabled="saving" @click="startEdit(row)">수정</button>
                <button class="btn btn-ghost btn-sm btn-danger" :disabled="saving" @click="removeRow(row)">삭제</button>
              </div>
            </template>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BriefcaseBusiness, CalendarRange, CircleAlert, Plane, Users } from 'lucide-vue-next'
import * as XLSX from 'xlsx'
import type { AttendanceRecord, AttendanceSettings, AttendanceWorkSession, LeaveRequest } from '~/composables/useAttendance'

definePageMeta({ layout: 'attendance' })

type ProfileRow = {
  profile_id: string
  user_name: string
  user_email: string
  user_login_id: string
}

type CalendarAttendanceRow = AttendanceRecord & ProfileRow

type CalendarLeaveRow = LeaveRequest & ProfileRow

type CalendarDaySummary = {
  presentCount: number
  lateCount: number
  leaveCount: number
  absentCount: number
  totalCount: number
}

const calendarWeekdayLabels = ['월', '화', '수', '목', '금', '토', '일']

const supabase = useSupabaseClient()
const toast = useToast()
const { user, isAdmin, profileLoaded } = useCurrentUser()
const {
  DEFAULT_ATTENDANCE_SETTINGS,
  getKstDateKey,
  getKstMonthKey,
  isWeekendDateKey,
  getMonthRange,
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
  getLeaveStatusLabel,
  getLeaveStatusClass,
  createLeaveDateMap,
  computeAttendanceStatus,
} = useAttendance()

const todayDate = ref(getKstDateKey())
const selectedMonth = ref(getKstMonthKey())
const selectedCalendarDate = ref('')
const searchText = ref('')
const saving = ref(false)
const exporting = ref(false)
const tableMissing = ref(false)
const sessionsTableMissing = ref(false)
const settingsTableMissing = ref(false)
const leaveTableMissing = ref(false)
const rows = ref<CalendarAttendanceRow[]>([])
const sessions = ref<AttendanceWorkSession[]>([])
const leaves = ref<LeaveRequest[]>([])
const profiles = ref<ProfileRow[]>([])
const settings = ref<AttendanceSettings>(normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS))
const liveNowIso = ref(new Date().toISOString())
let liveTimer: ReturnType<typeof setInterval> | null = null
const dateModalOpen = ref(false)

const editingRowId = ref<number | null>(null)
const editCheckInDate = ref('')
const editCheckInTime = ref('')
const editCheckOutDate = ref('')
const editCheckOutTime = ref('')
const editCheckIn = ref('')
const editCheckOut = ref('')

function splitEmailLoginId(email: string) {
  const [idPart = ''] = String(email || '').split('@')
  return idPart || '-'
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+09:00`)
}

function addDateKeyDays(dateKey: string, days: number) {
  const next = parseDateKey(dateKey)
  next.setDate(next.getDate() + days)
  return getKstDateKey(next)
}

function getWeekStart(dateKey: string) {
  const date = parseDateKey(dateKey)
  const shift = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - shift)
  return getKstDateKey(date)
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = String(monthKey || '').split('-')
  return `${year}년 ${Number(month || 0)}월`
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

const filteredProfiles = computed(() => {
  if (!isAdmin.value) return profiles.value
  const q = searchText.value.trim().toLowerCase()
  if (!q) return profiles.value
  return profiles.value.filter((profile) => [profile.user_name, profile.user_email, profile.user_login_id]
    .some((value) => String(value || '').toLowerCase().includes(q)))
})

const filteredProfileIdSet = computed(() => {
  return new Set(filteredProfiles.value.map((profile) => profile.profile_id))
})

const profileMapById = computed(() => {
  return new Map(profiles.value.map((profile) => [profile.profile_id, profile]))
})

const rowMapByUserDate = computed(() => {
  return new Map(rows.value.map((row) => [`${row.user_id}:${row.work_date}`, row]))
})

const sessionMapByRecord = computed(() => {
  const map = new Map<number, AttendanceWorkSession[]>()
  for (const session of sessions.value) {
    const bucket = map.get(session.record_id) || []
    bucket.push(session)
    map.set(session.record_id, bucket)
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.started_at.localeCompare(b.started_at))
  }
  return map
})

const approvedLeaveMapByUserDate = computed(() => {
  const map = new Map<string, LeaveRequest>()
  for (const leave of leaves.value) {
    if (leave.status !== 'approved') continue
    for (const date of createLeaveDateMap([leave]).keys()) {
      map.set(`${leave.user_id}:${date}`, leave)
    }
  }
  return map
})

const monthCalendarRange = computed(() => {
  const { start, end } = getMonthRange(selectedMonth.value)
  const first = getWeekStart(start)
  const lastWeekStart = getWeekStart(end)
  return {
    start,
    end,
    first,
    last: addDateKeyDays(lastWeekStart, 6),
  }
})

const selectedMonthLabel = computed(() => formatMonthLabel(selectedMonth.value))

const monthlySummaryCards = computed(() => {
  if (isAdmin.value) {
    const totalPeople = filteredProfiles.value.length
    const summaries = Array.from(adminCalendarSummaryByDate.value.values())
    const totalPresent = summaries.reduce((sum, day) => sum + day.presentCount, 0)
    const totalLate = summaries.reduce((sum, day) => sum + day.lateCount, 0)
    const totalLeave = summaries.reduce((sum, day) => sum + day.leaveCount, 0)
    return [
      { label: '조회 인원', value: `${totalPeople}명`, tone: 'summary-tone-slate', icon: Users },
      { label: '근무 기록', value: `${totalPresent}건`, tone: 'summary-tone-blue', icon: BriefcaseBusiness },
      { label: '지각 표시', value: `${totalLate}건`, tone: 'summary-tone-amber', icon: CircleAlert },
      { label: '휴가/반차', value: `${totalLeave}건`, tone: 'summary-tone-purple', icon: Plane },
    ]
  }

  const ownCells = calendarCells.value.filter((cell) => cell.inMonth)
  const counts = ownCells.reduce((acc, cell) => {
    const code = cell.status?.code || 'empty'
    if (code.endsWith('_leave')) acc.leave += 1
    else if (code === 'late' || code === 'late_early') acc.late += 1
    else if (code === 'done' || code === 'early_leave') acc.done += 1
    else if (code === 'working') acc.working += 1
    return acc
  }, { working: 0, done: 0, late: 0, leave: 0 })

  return [
    { label: '근무 중', value: `${counts.working}일`, tone: 'summary-tone-blue', icon: BriefcaseBusiness },
    { label: '근무 완료', value: `${counts.done}일`, tone: 'summary-tone-slate', icon: CalendarRange },
    { label: '지각/조퇴', value: `${counts.late}일`, tone: 'summary-tone-amber', icon: CircleAlert },
    { label: '휴가/반차', value: `${counts.leave}일`, tone: 'summary-tone-purple', icon: Plane },
  ]
})

const adminCalendarSummaryByDate = computed(() => {
  const summary = new Map<string, CalendarDaySummary>()
  if (!isAdmin.value) return summary

  const { start, end } = monthCalendarRange.value
  const totalProfiles = filteredProfiles.value.length

  for (let cursor = start; cursor <= end; cursor = addDateKeyDays(cursor, 1)) {
    summary.set(cursor, {
      presentCount: 0,
      lateCount: 0,
      leaveCount: 0,
      absentCount: cursor < todayDate.value && !isWeekendDateKey(cursor) ? totalProfiles : 0,
      totalCount: 0,
    })
  }

  if (!totalProfiles) return summary

  const filteredIds = filteredProfileIdSet.value
  const leaveMap = approvedLeaveMapByUserDate.value

  for (const [key] of leaveMap) {
    const separatorIndex = key.indexOf(':')
    const profileId = key.slice(0, separatorIndex)
    const dateKey = key.slice(separatorIndex + 1)
    if (!filteredIds.has(profileId) || dateKey < start || dateKey > end) continue
    const day = summary.get(dateKey)
    if (!day) continue
    day.leaveCount += 1
    if (dateKey < todayDate.value) day.absentCount = Math.max(0, day.absentCount - 1)
  }

  for (const row of rowMapByUserDate.value.values()) {
    if (!filteredIds.has(row.user_id) || row.work_date < start || row.work_date > end) continue
    if (!row.check_in_at) continue
    if (leaveMap.has(`${row.user_id}:${row.work_date}`)) continue

    const day = summary.get(row.work_date)
    if (!day) continue

    day.presentCount += 1
    if (row.work_date < todayDate.value) day.absentCount = Math.max(0, day.absentCount - 1)

    const status = computeAttendanceStatus({
      workDate: row.work_date,
      checkInAt: row.check_in_at,
      checkOutAt: row.check_out_at,
      settings: settings.value,
      approvedLeave: null,
      todayDate: todayDate.value,
    })

    if (status.code === 'late' || status.code === 'late_early') {
      day.lateCount += 1
    }
  }

  for (const day of summary.values()) {
    day.totalCount = day.presentCount + day.leaveCount + day.absentCount
  }

  return summary
})

const calendarCells = computed(() => {
  const { first, last } = monthCalendarRange.value
  const cells: Array<any> = []

  for (let cursor = first; cursor <= last; cursor = addDateKeyDays(cursor, 1)) {
    const inMonth = cursor.startsWith(selectedMonth.value)

    if (isAdmin.value) {
      const daySummary = inMonth
        ? adminCalendarSummaryByDate.value.get(cursor) || {
          presentCount: 0,
          lateCount: 0,
          leaveCount: 0,
          absentCount: 0,
          totalCount: 0,
        }
        : {
          presentCount: 0,
          lateCount: 0,
          leaveCount: 0,
          absentCount: 0,
          totalCount: 0,
        }

      cells.push({
        date: cursor,
        inMonth,
        dayNumber: Number(cursor.slice(-2)),
        ...daySummary,
      })
      continue
    }

    const me = filteredProfiles.value[0]
    const row = me ? rowMapByUserDate.value.get(`${me.profile_id}:${cursor}`) || null : null
    const leave = me ? approvedLeaveMapByUserDate.value.get(`${me.profile_id}:${cursor}`) || null : null
    const status = computeAttendanceStatus({
      workDate: cursor,
      checkInAt: row?.check_in_at,
      checkOutAt: row?.check_out_at,
      settings: settings.value,
      approvedLeave: leave,
      todayDate: todayDate.value,
    })
    const timeLabel = leave
      ? getLeaveTypeLabel(leave.leave_type)
      : row?.check_in_at
        ? `${formatTime(row.check_in_at)}${row.check_out_at ? ` · ${formatTime(row.check_out_at)}` : ''}`
        : '-'

    cells.push({
      date: cursor,
      inMonth,
      dayNumber: Number(cursor.slice(-2)),
      status,
      timeLabel,
      totalCount: row || leave ? 1 : 0,
    })
  }

  return cells
})

const selectedCalendarDateLabel = computed(() => {
  if (!selectedCalendarDate.value) return '날짜 선택'
  const date = parseDateKey(selectedCalendarDate.value)
  const weekday = calendarWeekdayLabels[(date.getDay() + 6) % 7]
  return `${selectedCalendarDate.value} (${weekday})`
})

const selectedDateRows = computed(() => {
  return rows.value.filter((row) => row.work_date === selectedCalendarDate.value)
})

const selectedDateLeaveRows = computed<CalendarLeaveRow[]>(() => {
  const q = searchText.value.trim().toLowerCase()
  return leaves.value
    .filter((row) => row.start_date <= selectedCalendarDate.value && row.end_date >= selectedCalendarDate.value)
    .map((row) => ({
      ...row,
      ...(profileMapById.value.get(row.user_id) || {
        profile_id: row.user_id,
        user_name: '-',
        user_email: '',
        user_login_id: '-',
      }),
    }))
    .filter((row) => {
      if (!q) return true
      return [row.user_name, row.user_email, row.user_login_id, row.reason, row.start_date, row.end_date]
        .some((value) => String(value || '').toLowerCase().includes(q))
    })
    .sort((a, b) => a.user_name.localeCompare(b.user_name, 'ko'))
})

function rowWorkMinutes(row: CalendarAttendanceRow) {
  const daySessions = sessionMapByRecord.value.get(row.id) || []
  if (daySessions.length) {
    return calcWorkSessionMinutes(daySessions, {
      openSessionEndAt: row.work_date === todayDate.value ? liveNowIso.value : null,
      overrideStartAt: row.check_in_at,
      overrideEndAt: row.check_out_at,
    })
  }
  return calcWorkMinutes(row.check_in_at, row.check_out_at)
}

function statusForRow(row: CalendarAttendanceRow) {
  const leave = approvedLeaveMapByUserDate.value.get(`${row.user_id}:${row.work_date}`) || null
  return computeAttendanceStatus({
    workDate: row.work_date,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    settings: settings.value,
    approvedLeave: leave,
    todayDate: todayDate.value,
  })
}

const editDuration = computed(() => {
  const inIso = parseDateTimeLocalToIso(editCheckIn.value)
  const outIso = parseDateTimeLocalToIso(editCheckOut.value)
  return formatWorkDuration(calcWorkMinutes(inIso, outIso))
})

function statusLabelFromValues(checkIn: string, checkOut: string) {
  if (!checkIn) return '미출근'
  if (!checkOut) return '근무중'
  return '퇴근 완료'
}

function statusClassFromValues(checkIn: string, checkOut: string) {
  if (!checkIn) return 'status-empty'
  if (!checkOut) return 'status-working'
  return 'status-done'
}

function isLeaveStatusCode(code?: string) {
  return String(code || '').includes('leave')
}

function openDateModal(date: string) {
  selectedCalendarDate.value = date
  dateModalOpen.value = true
}

function closeDateModal() {
  dateModalOpen.value = false
  cancelEdit()
}

function jumpToCurrentMonth() {
  selectedMonth.value = getKstMonthKey()
}

async function downloadMonthlyAttendanceWorkbook() {
  if (!isAdmin.value) return
  if (filteredProfiles.value.length === 0) {
    toast.error('엑셀로 내보낼 조회 대상이 없습니다.')
    return
  }

  exporting.value = true
  try {
    const monthDates = calendarCells.value
      .filter((cell) => cell.inMonth)
      .map((cell) => String(cell.date))

    const summaryRows = filteredProfiles.value.map((profile) => {
      const dailyRows = monthDates.map((dateKey) => {
        const row = rowMapByUserDate.value.get(`${profile.profile_id}:${dateKey}`) || null
        const leave = approvedLeaveMapByUserDate.value.get(`${profile.profile_id}:${dateKey}`) || null
        const status = computeAttendanceStatus({
          workDate: dateKey,
          checkInAt: row?.check_in_at,
          checkOutAt: row?.check_out_at,
          settings: settings.value,
          approvedLeave: leave,
          todayDate: todayDate.value,
        })
        const workMinutes = row ? rowWorkMinutes(row) : 0
        const sessionCount = row ? (sessionMapByRecord.value.get(row.id) || []).length : 0

        return {
          dateKey,
          row,
          leave,
          status,
          workMinutes,
          sessionCount,
        }
      })

      const countByStatus = (codes: string[]) => dailyRows.filter((entry) => codes.includes(String(entry.status.code || ''))).length
      const countByLeaveType = (leaveType: string) => dailyRows.filter((entry) => entry.leave?.leave_type === leaveType).length

      return {
        이름: profile.user_name,
        아이디: profile.user_login_id,
        근무일수: dailyRows.filter((entry) => !!entry.row?.check_in_at && !entry.leave).length,
        총근무시간_분: dailyRows.reduce((sum, entry) => sum + entry.workMinutes, 0),
        총근무시간: formatWorkDuration(dailyRows.reduce((sum, entry) => sum + entry.workMinutes, 0)),
        근무전환횟수: dailyRows.reduce((sum, entry) => sum + entry.sessionCount, 0),
        지각: countByStatus(['late', 'late_early']),
        조퇴: countByStatus(['early_leave', 'late_early']),
        결근: countByStatus(['absent']),
        연차: countByLeaveType('annual'),
        오전반차: countByLeaveType('half_am'),
        오후반차: countByLeaveType('half_pm'),
        병가: countByLeaveType('sick'),
        공가: countByLeaveType('official'),
        기타휴가: countByLeaveType('other'),
      }
    })

    const detailRows = filteredProfiles.value.flatMap((profile) => {
      return monthDates.map((dateKey) => {
        const row = rowMapByUserDate.value.get(`${profile.profile_id}:${dateKey}`) || null
        const leave = approvedLeaveMapByUserDate.value.get(`${profile.profile_id}:${dateKey}`) || null
        const status = computeAttendanceStatus({
          workDate: dateKey,
          checkInAt: row?.check_in_at,
          checkOutAt: row?.check_out_at,
          settings: settings.value,
          approvedLeave: leave,
          todayDate: todayDate.value,
        })
        const workMinutes = row ? rowWorkMinutes(row) : 0
        const sessionsForRow = row ? (sessionMapByRecord.value.get(row.id) || []) : []

        return {
          날짜: dateKey,
          이름: profile.user_name,
          아이디: profile.user_login_id,
          상태: status.label,
          출근: leave ? '-' : formatTime(row?.check_in_at),
          퇴근: leave ? '-' : formatTime(row?.check_out_at),
          근무시간_분: workMinutes,
          근무시간: leave ? getLeaveTypeLabel(leave.leave_type) : formatWorkDuration(workMinutes),
          근무전환횟수: sessionsForRow.length,
          휴가유형: leave ? getLeaveTypeLabel(leave.leave_type) : '-',
          휴가상태: leave ? getLeaveStatusLabel(leave.status) : '-',
          출근메모: row?.check_in_note || '',
          퇴근메모: row?.check_out_note || '',
        }
      })
    })

    const dailySummaryRows = monthDates.map((dateKey) => {
      const day = adminCalendarSummaryByDate.value.get(dateKey)
      return {
        날짜: dateKey,
        근무: day?.presentCount || 0,
        지각: day?.lateCount || 0,
        휴가: day?.leaveCount || 0,
        결근: day?.absentCount || 0,
        전체: day?.totalCount || 0,
      }
    })

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), '월간요약')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), '일별상세')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dailySummaryRows), '일자집계')
    XLSX.writeFile(workbook, `근태관리_${selectedMonth.value}_월간리포트.xlsx`)
    toast.success('월간 근태 엑셀을 다운로드했습니다.')
  } catch (error: any) {
    console.error('Failed to export monthly attendance workbook:', error)
    toast.error(`엑셀 다운로드 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    exporting.value = false
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

async function fetchProfiles() {
  if (!profileLoaded.value) return
  if (isAdmin.value) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, status')
      .eq('status', 'active')
      .order('full_name', { ascending: true })
    if (error) throw error
    profiles.value = (data || []).map((row: any) => {
      const email = String(row.email || '')
      return {
        profile_id: String(row.id || ''),
        user_name: String(row.full_name || splitEmailLoginId(email) || '-'),
        user_email: email,
        user_login_id: splitEmailLoginId(email),
      }
    })
    return
  }

  const email = String(user.value.email || '')
  profiles.value = [{
    profile_id: String(user.value.id || ''),
    user_name: String(user.value.name || splitEmailLoginId(email) || '-'),
    user_email: email,
    user_login_id: splitEmailLoginId(email),
  }]
}

async function fetchRows() {
  const { start, end } = getMonthRange(selectedMonth.value)
  let query = supabase
    .from('attendance_records')
    .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
    .gte('work_date', start)
    .lte('work_date', end)
    .order('work_date', { ascending: false })
    .order('id', { ascending: false })

  if (!isAdmin.value) query = query.eq('user_id', user.value.id)

  const { data, error } = await query

  if (error) {
    if (isMissingTableError(error, 'attendance_records')) {
      tableMissing.value = true
      rows.value = []
      return
    }
    throw error
  }

  tableMissing.value = false
  const profileMap = new Map(profiles.value.map((profile) => [profile.profile_id, profile]))
  rows.value = ((data || []) as AttendanceRecord[]).map((row) => ({
    ...row,
    ...(profileMap.get(row.user_id) || {
      profile_id: row.user_id,
      user_name: '-',
      user_email: '',
      user_login_id: '-',
    }),
  }))
}

async function fetchSessions() {
  const { start, end } = getMonthRange(selectedMonth.value)
  let query = supabase
    .from('attendance_work_sessions')
    .select('id, record_id, user_id, work_date, started_at, ended_at, created_at, updated_at')
    .gte('work_date', start)
    .lte('work_date', end)
    .order('started_at', { ascending: true })

  if (!isAdmin.value) query = query.eq('user_id', user.value.id)

  const { data, error } = await query

  if (error) {
    if (isMissingTableError(error, 'attendance_work_sessions')) {
      sessionsTableMissing.value = true
      sessions.value = []
      return
    }
    throw error
  }

  sessionsTableMissing.value = false
  sessions.value = (data || []) as AttendanceWorkSession[]
}

async function fetchLeaves() {
  const { start, end } = getMonthRange(selectedMonth.value)
  let query = supabase
    .from('leave_requests')
    .select('id, user_id, leave_type, start_date, end_date, status, reason, approved_by, approved_at, created_at, updated_at')
    .lte('start_date', end)
    .gte('end_date', start)
    .order('start_date', { ascending: false })
    .order('id', { ascending: false })

  if (!isAdmin.value) query = query.eq('user_id', user.value.id)

  const { data, error } = await query

  if (error) {
    if (isMissingTableError(error, 'leave_requests')) {
      leaveTableMissing.value = true
      leaves.value = []
      return
    }
    throw error
  }

  leaveTableMissing.value = false
  leaves.value = (data || []) as LeaveRequest[]
}

async function refreshCalendar() {
  if (!profileLoaded.value || !user.value.id) return
  try {
    todayDate.value = getKstDateKey()
    const { start, end } = getMonthRange(selectedMonth.value)
    if (!selectedCalendarDate.value || selectedCalendarDate.value < start || selectedCalendarDate.value > end) {
      selectedCalendarDate.value = todayDate.value >= start && todayDate.value <= end ? todayDate.value : start
    }
    await fetchSettings()
    await fetchProfiles()
    await Promise.all([fetchRows(), fetchSessions(), fetchLeaves()])
  } catch (error: any) {
    console.error('Failed to fetch attendance calendar:', error)
    toast.error(`월별 근태 조회 실패: ${error?.message || '알 수 없는 오류'}`)
  }
}

function startEdit(row: CalendarAttendanceRow) {
  editingRowId.value = row.id
  editCheckIn.value = toDateTimeLocalValue(row.check_in_at)
  editCheckOut.value = toDateTimeLocalValue(row.check_out_at)
  syncCalendarEditDraftFields()
}

function cancelEdit() {
  editingRowId.value = null
  editCheckInDate.value = ''
  editCheckInTime.value = ''
  editCheckOutDate.value = ''
  editCheckOutTime.value = ''
  editCheckIn.value = ''
  editCheckOut.value = ''
}

function syncCalendarEditDraftFields() {
  editCheckInDate.value = getDateKeyFromDateTimeLocalValue(editCheckIn.value)
  editCheckInTime.value = getTimeValueFromDateTimeLocalValue(editCheckIn.value)
  editCheckOutDate.value = getDateKeyFromDateTimeLocalValue(editCheckOut.value)
  editCheckOutTime.value = getTimeValueFromDateTimeLocalValue(editCheckOut.value)
}

function applyCalendarEditDraft(target: 'check_in' | 'check_out', options?: { silent?: boolean }) {
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

async function saveEdit(row: CalendarAttendanceRow) {
  if (!editingRowId.value) return
  if (!applyCalendarEditDraft('check_in', { silent: true })) return
  if (!applyCalendarEditDraft('check_out', { silent: true })) return
  const checkInIso = parseDateTimeLocalToIso(editCheckIn.value)
  const checkOutIso = parseDateTimeLocalToIso(editCheckOut.value)
  const workDate = getDateKeyFromDateTimeLocalValue(editCheckIn.value)
    || getDateKeyFromDateTimeLocalValue(editCheckOut.value)
    || row.work_date

  if (checkOutIso && !checkInIso) {
    toast.error('퇴근 시간만 단독 저장할 수 없습니다.')
    return
  }
  if (checkInIso && checkOutIso && new Date(checkOutIso).getTime() < new Date(checkInIso).getTime()) {
    toast.error('퇴근 시간은 출근 시간보다 빠를 수 없습니다.')
    return
  }

  saving.value = true
  try {
    const sessionsForRow = sessionMapByRecord.value.get(row.id) || []
    if (!sessionsTableMissing.value && sessionsForRow.length > 0) {
      const updatedSessions = sessionsForRow.map((session) => ({
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
      .eq('id', row.id)

    if (error) throw error
    toast.success('근태 기록이 수정되었습니다.')
    cancelEdit()
    await refreshCalendar()
  } catch (error: any) {
    console.error('Failed to save attendance edit:', error)
    toast.error(`수정 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

async function removeRow(row: CalendarAttendanceRow) {
  if (!confirm(`${row.user_name}님의 ${row.work_date} 근태 기록을 삭제할까요?`)) return
  saving.value = true
  try {
    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('id', row.id)
    if (error) throw error
    toast.success('근태 기록이 삭제되었습니다.')
    await refreshCalendar()
  } catch (error: any) {
    console.error('Failed to delete attendance row:', error)
    toast.error(`삭제 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

watch(
  () => [profileLoaded.value, user.value.id, isAdmin.value],
  async ([loaded, uid]) => {
    if (!loaded || !uid) return
    await refreshCalendar()
  },
  { immediate: true },
)

watch(selectedMonth, async () => {
  if (!profileLoaded.value || !user.value.id) return
  await refreshCalendar()
})

onMounted(() => {
  liveTimer = setInterval(() => {
    liveNowIso.value = new Date().toISOString()
  }, 30000)
  if (import.meta.client) {
    window.addEventListener('keydown', handleEscape)
  }
})

onBeforeUnmount(() => {
  if (liveTimer) clearInterval(liveTimer)
  if (import.meta.client) {
    window.removeEventListener('keydown', handleEscape)
  }
})

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && dateModalOpen.value) {
    closeDateModal()
  }
}
</script>

<style scoped>
.calendar-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.page-header,
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.page-title {
  font-size: 1.18rem;
  font-weight: 700;
}

.page-subtitle {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 0.94rem;
}

.page-actions {
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

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-md);
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
}

.summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.summary-label {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.summary-value {
  font-size: 1.4rem;
  font-weight: 800;
}

.summary-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.summary-tone-slate {
  color: #475569;
  background: rgba(148, 163, 184, 0.12);
}

.summary-tone-blue {
  color: #1d4ed8;
  background: rgba(37, 99, 235, 0.12);
}

.summary-tone-amber {
  color: #b45309;
  background: rgba(245, 158, 11, 0.14);
}

.summary-tone-purple {
  color: #7c3aed;
  background: rgba(139, 92, 246, 0.14);
}

.calendar-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.section-caption,
.table-empty {
  color: var(--color-text-secondary);
}

.calendar-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
}

.calendar-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.legend-working {
  background: #0f766e;
}

.legend-late {
  background: #d97706;
}

.legend-leave {
  background: #2563eb;
}

.legend-absent {
  background: #dc2626;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
}

.calendar-weekday {
  text-align: center;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.calendar-day {
  min-height: 128px;
  padding: 12px;
  border-radius: 18px;
  border: 1px solid var(--color-border-light);
  background: rgba(255, 255, 255, 0.82);
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
  contain: layout paint;
  appearance: none;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.14s ease, box-shadow 0.14s ease, background-color 0.14s ease;
}

.calendar-day.outside {
  opacity: 0.42;
}

.calendar-day.selected {
  border-color: rgba(37, 99, 235, 0.45);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.08);
}

.calendar-day.today {
  background: rgba(37, 99, 235, 0.06);
}

.calendar-day:focus {
  outline: none;
}

.calendar-day:focus-visible {
  border-color: rgba(37, 99, 235, 0.34);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

.calendar-day:active:not(:disabled) {
  transform: none;
  border-color: rgba(37, 99, 235, 0.26);
  background: rgba(248, 250, 252, 0.96);
}

.calendar-day-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.calendar-day-number {
  font-size: 1rem;
  font-weight: 700;
}

.calendar-day-total {
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.08);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.calendar-day-stats,
.calendar-day-single {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.calendar-stat,
.calendar-single-note {
  font-size: 0.82rem;
  color: var(--color-text-secondary);
}

.selected-leave-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.selected-leave-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--color-border-light);
}

.selected-leave-head,
.selected-leave-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.selected-leave-user {
  font-weight: 700;
}

.selected-leave-reason {
  color: var(--color-text-secondary);
}

.detail-modal {
  position: fixed;
  inset: 0;
  z-index: 120;
  padding: 28px;
  background: rgba(15, 23, 42, 0.48);
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
  animation: none !important;
}

.detail-dialog {
  width: min(1040px, 100%);
  max-height: calc(100vh - 56px);
  overflow: auto;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  animation: none !important;
  transform: none !important;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.detail-close {
  border: 1px solid var(--color-border-light);
  background: #fff;
  color: var(--color-text-secondary);
  border-radius: 14px;
  padding: 10px 14px;
  font-weight: 700;
  -webkit-tap-highlight-color: transparent;
}

.detail-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
}

.detail-metric {
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.9);
  border: 1px solid var(--color-border-light);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-metric span {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.detail-metric strong {
  font-size: 1.2rem;
  font-weight: 800;
}

.detail-record-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
}

.detail-record-card {
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.16);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-record-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.detail-record-name {
  font-size: 1rem;
  font-weight: 800;
}

.detail-record-id {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 0.88rem;
}

.detail-record-metrics,
.detail-record-edit-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.detail-record-edit-grid {
  grid-template-columns: 1fr;
}

.detail-edit-datetime-card,
.detail-field {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.16);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-edit-datetime-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.detail-edit-datetime-head span {
  color: var(--color-text-secondary);
  font-size: 0.84rem;
  font-weight: 700;
}

.detail-edit-datetime-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 10px;
}

.detail-record-metric,
.detail-field {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.16);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-record-metric span,
.detail-field span {
  color: var(--color-text-secondary);
  font-size: 0.84rem;
}

.detail-record-metric strong,
.detail-field strong {
  font-size: 1rem;
  font-weight: 800;
}

.detail-close:focus,
.row-actions :deep(.btn):focus {
  outline: none;
}

.detail-close:focus-visible,
.row-actions :deep(.btn):focus-visible {
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.14);
}

@media (max-width: 960px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .calendar-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .page-header,
  .section-head,
  .page-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .detail-modal {
    padding: 12px;
  }

  .detail-head,
  .detail-summary {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }

  .detail-record-grid,
  .detail-record-metrics,
  .detail-record-edit-grid {
    grid-template-columns: 1fr;
  }

  .detail-edit-datetime-inputs {
    grid-template-columns: 1fr;
  }

  .search-input {
    min-width: 0;
  }

  .calendar-grid {
    grid-template-columns: 1fr;
  }
}
</style>
