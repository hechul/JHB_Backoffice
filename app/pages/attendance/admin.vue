<template>
  <div class="admin-page">
    <div v-if="!profileLoaded" class="card empty-state">
      <div class="empty-state-title">권한 확인 중</div>
    </div>

    <div v-else-if="!isAdmin" class="card empty-state">
      <div class="empty-state-title">접근 권한이 없습니다</div>
      <div class="empty-state-desc">근태 전체 관리는 관리자 계정에서만 가능합니다.</div>
    </div>

    <template v-else>
      <div class="admin-header">
        <div>
          <h1 class="admin-title">근태 전체 관리</h1>
          <div class="admin-subtitle">오늘 현황과 주간 근태를 상시 확인하고, 월간 캘린더에서 날짜별 기록을 관리합니다.</div>
        </div>
        <div class="admin-filters">
          <input v-model="selectedMonth" type="month" class="input month-input" />
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
        `leave_requests` 테이블이 없어 휴가 승인/자동 부재 판정은 표시되지 않습니다.
        `docs/sql/2026-03-10_attendance_phase2.sql` 실행이 필요합니다.
      </div>

      <div class="summary-grid">
        <div v-for="card in summaryCards" :key="card.label" class="card summary-card">
          <span class="summary-label">{{ card.label }}</span>
          <strong class="summary-value">{{ card.value }}</strong>
        </div>
      </div>

      <div class="card table-card">
        <div class="section-head">
          <div>
            <h2>주별 근태 기록</h2>
            <span class="section-caption">{{ currentWeekLabel }}</span>
          </div>
          <div class="week-nav">
            <button class="btn btn-ghost btn-sm" :disabled="!hasPrevWeek" @click="moveWeek(-1)">이전 주</button>
            <button class="btn btn-ghost btn-sm" :disabled="!hasNextWeek" @click="moveWeek(1)">다음 주</button>
          </div>
        </div>
        <div v-if="weeklyBoardRows.length === 0" class="table-empty">표시할 주간 근태가 없습니다.</div>
        <div v-else class="table-wrap weekly-wrap">
          <table class="admin-table weekly-table">
            <thead>
              <tr>
                <th class="sticky-col">이름</th>
                <th v-for="day in currentWeekDays" :key="day.date" class="week-col-head">
                  <div>{{ day.label }}</div>
                  <span>{{ day.shortDate }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in weeklyBoardRows" :key="`week-${row.profile_id}`">
                <td class="sticky-col">
                  <div class="week-user-name">{{ row.user_name }}</div>
                  <div class="week-user-id">{{ row.user_login_id }}</div>
                </td>
                <td v-for="cell in row.days" :key="`${row.profile_id}-${cell.date}`">
                  <div class="week-cell" :class="{ muted: !cell.inMonth }">
                    <span class="status-chip" :class="cell.status.className">{{ cell.status.label }}</span>
                    <span class="week-cell-time">{{ cell.timeLabel }}</span>
                    <span class="week-cell-note">{{ cell.note }}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card table-card">
        <div class="section-head">
          <h2>오늘 현황</h2>
          <span class="section-caption">{{ todayDate }}</span>
        </div>
        <div v-if="todayRows.length === 0" class="table-empty">활성 계정이 없습니다.</div>
        <div v-else class="table-wrap">
          <table class="admin-table today-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>아이디</th>
                <th>출근</th>
                <th>퇴근</th>
                <th>근무시간</th>
                <th>상태</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredTodayRows" :key="`today-${row.user_id}`">
                <td>{{ row.user_name }}</td>
                <td>{{ row.user_login_id }}</td>
                <td>{{ formatTime(row.record?.check_in_at) }}</td>
                <td>{{ formatTime(row.record?.check_out_at) }}</td>
                <td>{{ formatWorkDuration(row.workMinutes) }}</td>
                <td>
                  <span class="status-chip" :class="row.displayStatus.className">{{ row.displayStatus.label }}</span>
                </td>
                <td>{{ row.note }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card table-card">
        <div class="section-head">
          <h2>휴가 신청 승인</h2>
        </div>
        <div v-if="leaveTableMissing" class="table-empty">휴가 승인 기능은 SQL 패치 적용 후 사용할 수 있습니다.</div>
        <div v-else-if="pendingLeaveRows.length === 0" class="table-empty">대기 중인 휴가 신청이 없습니다.</div>
        <div v-else class="table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>아이디</th>
                <th>유형</th>
                <th>기간</th>
                <th>사유</th>
                <th>상태</th>
                <th>처리</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in pendingLeaveRows" :key="`leave-${row.id}`">
                <td>{{ row.user_name }}</td>
                <td>{{ row.user_login_id }}</td>
                <td>{{ getLeaveTypeLabel(row.leave_type) }}</td>
                <td>{{ row.start_date }}<span v-if="row.start_date !== row.end_date"> ~ {{ row.end_date }}</span></td>
                <td>{{ row.reason || '-' }}</td>
                <td>
                  <span class="status-chip" :class="getLeaveStatusClass(row.status)">{{ getLeaveStatusLabel(row.status) }}</span>
                </td>
                <td>
                  <div class="row-actions">
                    <button class="btn btn-primary btn-sm" :disabled="saving" @click="updateLeaveStatus(row, 'approved')">승인</button>
                    <button class="btn btn-ghost btn-sm btn-danger" :disabled="saving" @click="updateLeaveStatus(row, 'rejected')">반려</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card table-card">
        <div class="section-head">
          <div>
            <h2>월별 근태 캘린더</h2>
            <span class="section-caption">{{ selectedMonthLabel }}</span>
          </div>
          <button class="btn btn-ghost btn-sm" @click="showMonthlyCalendar = !showMonthlyCalendar">
            {{ showMonthlyCalendar ? '캘린더 닫기' : '캘린더 열기' }}
          </button>
        </div>
        <div v-if="!showMonthlyCalendar" class="table-empty">캘린더 열기를 누르면 월 전체 분포와 날짜별 기록을 확인할 수 있습니다.</div>
        <template v-else>
          <div class="calendar-grid">
            <div v-for="weekday in calendarWeekdayLabels" :key="weekday" class="calendar-weekday">{{ weekday }}</div>
            <button
              v-for="cell in calendarCells"
              :key="cell.date"
              type="button"
              class="calendar-day"
              :class="{ outside: !cell.inMonth, selected: cell.date === selectedCalendarDate, today: cell.date === todayDate }"
              :disabled="!cell.inMonth"
              @click="selectedCalendarDate = cell.date"
            >
              <div class="calendar-day-head">
                <span class="calendar-day-number">{{ cell.dayNumber }}</span>
              </div>
              <div class="calendar-day-stats">
                <span class="calendar-stat present">근무 {{ cell.presentCount }}</span>
                <span class="calendar-stat late">지각 {{ cell.lateCount }}</span>
                <span class="calendar-stat leave">휴가 {{ cell.leaveCount }}</span>
                <span class="calendar-stat absent">결근 {{ cell.absentCount }}</span>
              </div>
            </button>
          </div>

          <div class="selected-day-panel">
            <div class="section-head">
              <div>
                <h3>{{ selectedCalendarDateLabel }}</h3>
                <span class="section-caption">선택한 날짜의 근태 기록과 휴가를 확인합니다.</span>
              </div>
            </div>

            <div v-if="selectedDateLeaveRows.length > 0" class="selected-leave-list">
              <div v-for="leave in selectedDateLeaveRows" :key="`leave-selected-${leave.id}`" class="selected-leave-item">
                <span class="selected-leave-user">{{ leave.user_name }} · {{ leave.user_login_id }}</span>
                <span class="status-chip" :class="getLeaveStatusClass(leave.status)">{{ getLeaveTypeLabel(leave.leave_type) }} {{ getLeaveStatusLabel(leave.status) }}</span>
                <span class="selected-leave-reason">{{ leave.reason || '-' }}</span>
              </div>
            </div>

            <div v-if="selectedDateRows.length === 0" class="table-empty">선택한 날짜의 근태 기록이 없습니다.</div>
            <div v-else class="table-wrap">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>아이디</th>
                    <th>출근</th>
                    <th>퇴근</th>
                    <th>근무시간</th>
                    <th>상태</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in selectedDateRows" :key="row.id">
                    <td>{{ row.user_name }}</td>
                    <td>{{ row.user_login_id }}</td>

                    <template v-if="editingRowId === row.id">
                      <td>
                        <input v-model="editCheckIn" type="datetime-local" class="input dt-input" />
                      </td>
                      <td>
                        <input v-model="editCheckOut" type="datetime-local" class="input dt-input" />
                      </td>
                      <td>{{ editDuration }}</td>
                      <td>
                        <span class="status-chip" :class="statusClassFromValues(editCheckIn, editCheckOut)">
                          {{ statusLabelFromValues(editCheckIn, editCheckOut) }}
                        </span>
                      </td>
                      <td>
                        <div class="row-actions">
                          <button class="btn btn-primary btn-sm" :disabled="saving" @click="saveEdit(row)">저장</button>
                          <button class="btn btn-ghost btn-sm" :disabled="saving" @click="cancelEdit">취소</button>
                        </div>
                      </td>
                    </template>

                    <template v-else>
                      <td>{{ formatTime(row.check_in_at) }}</td>
                      <td>{{ formatTime(row.check_out_at) }}</td>
                      <td>{{ formatWorkDuration(rowWorkMinutes(row)) }}</td>
                      <td>
                        <span class="status-chip" :class="statusForRow(row).className">
                          {{ statusForRow(row).label }}
                        </span>
                      </td>
                      <td>
                        <div class="row-actions">
                          <button class="btn btn-ghost btn-sm" :disabled="saving" @click="startEdit(row)">수정</button>
                          <button class="btn btn-ghost btn-sm btn-danger" :disabled="saving" @click="removeRow(row)">삭제</button>
                        </div>
                      </td>
                    </template>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AttendanceRecord, AttendanceSettings, AttendanceWorkSession, LeaveRequest, LeaveStatus } from '~/composables/useAttendance'

definePageMeta({ layout: 'attendance' })

type ProfileRow = {
  profile_id: string
  user_name: string
  user_email: string
  user_login_id: string
}

type AdminAttendanceRow = AttendanceRecord & ProfileRow

type AdminLeaveRow = LeaveRequest & ProfileRow

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
  getKstMonthKey,
  getMonthRange,
  formatTime,
  calcWorkMinutes,
  calcWorkSessionMinutes,
  formatWorkDuration,
  toDateTimeLocalValue,
  parseDateTimeLocalToIso,
  normalizeAttendanceSettings,
  getLeaveTypeLabel,
  getLeaveStatusLabel,
  getLeaveStatusClass,
  createLeaveDateMap,
  computeAttendanceStatus,
} = useAttendance()

const todayDate = ref(getKstDateKey())
const selectedMonth = ref(getKstMonthKey())
const searchText = ref('')
const loading = ref(false)
const saving = ref(false)
const tableMissing = ref(false)
const sessionsTableMissing = ref(false)
const settingsTableMissing = ref(false)
const leaveTableMissing = ref(false)
const rows = ref<AdminAttendanceRow[]>([])
const activeProfiles = ref<ProfileRow[]>([])
const todayRecords = ref<AttendanceRecord[]>([])
const todaySessions = ref<AttendanceWorkSession[]>([])
const monthlySessions = ref<AttendanceWorkSession[]>([])
const monthlyLeaves = ref<LeaveRequest[]>([])
const todayLeaves = ref<LeaveRequest[]>([])
const settings = ref<AttendanceSettings>(normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS))
const liveNowIso = ref(new Date().toISOString())
let liveTimer: ReturnType<typeof setInterval> | null = null

const editingRowId = ref<number | null>(null)
const editCheckIn = ref('')
const editCheckOut = ref('')
const showMonthlyCalendar = ref(false)
const selectedWeekStart = ref('')
const selectedCalendarDate = ref('')

const calendarWeekdayLabels = ['월', '화', '수', '목', '금', '토', '일']

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

function formatShortDay(dateKey: string) {
  const date = parseDateKey(dateKey)
  const weekday = calendarWeekdayLabels[(date.getDay() + 6) % 7]
  return {
    label: weekday,
    shortDate: `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`,
  }
}

function syncCalendarTargets() {
  const { start, end } = getMonthRange(selectedMonth.value)
  const monthWeekStarts = getMonthWeekStarts(selectedMonth.value)
  if (!monthWeekStarts.includes(selectedWeekStart.value)) {
    const initialWeek = todayDate.value >= start && todayDate.value <= end
      ? getWeekStart(todayDate.value)
      : monthWeekStarts[0] || getWeekStart(start)
    selectedWeekStart.value = initialWeek
  }
  if (!selectedCalendarDate.value || selectedCalendarDate.value < start || selectedCalendarDate.value > end) {
    selectedCalendarDate.value = todayDate.value >= start && todayDate.value <= end ? todayDate.value : start
  }
}

function getMonthWeekStarts(monthKey: string) {
  const { start, end } = getMonthRange(monthKey)
  const starts: string[] = []
  let cursor = getWeekStart(start)
  while (cursor <= end) {
    starts.push(cursor)
    cursor = addDateKeyDays(cursor, 7)
  }
  return starts
}

const approvedMonthlyLeaveMap = computed(() => {
  const map = new Map<string, LeaveRequest>()
  for (const leave of monthlyLeaves.value) {
    if (leave.status !== 'approved') continue
    const dateMap = createLeaveDateMap([leave])
    for (const date of dateMap.keys()) {
      map.set(`${leave.user_id}:${date}`, leave)
    }
  }
  return map
})

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

const monthlySessionMapByRecord = computed(() => {
  const map = new Map<number, AttendanceWorkSession[]>()
  for (const session of monthlySessions.value) {
    const bucket = map.get(session.record_id) || []
    bucket.push(session)
    map.set(session.record_id, bucket)
  }
  for (const sessions of map.values()) {
    sessions.sort((a, b) => a.started_at.localeCompare(b.started_at))
  }
  return map
})

const rowMapByUserDate = computed(() => {
  return new Map(rows.value.map((row) => [`${row.user_id}:${row.work_date}`, row]))
})

const approvedLeaveMapByUserDate = computed(() => {
  const map = new Map<string, LeaveRequest>()
  for (const leave of monthlyLeaves.value) {
    if (leave.status !== 'approved') continue
    for (const date of createLeaveDateMap([leave]).keys()) {
      map.set(`${leave.user_id}:${date}`, leave)
    }
  }
  return map
})

const filteredProfiles = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  if (!q) return activeProfiles.value
  return activeProfiles.value.filter((profile) =>
    [profile.user_name, profile.user_email, profile.user_login_id].some((value) =>
      String(value || '').toLowerCase().includes(q),
    ),
  )
})

const pendingLeaveRows = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  return monthlyLeaves.value
    .filter((row) => row.status === 'pending')
    .map((row) => ({
      ...row,
      ...(activeProfiles.value.find((profile) => profile.profile_id === row.user_id) || {
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
})

function rowWorkMinutes(row: AdminAttendanceRow) {
  const sessions = monthlySessionMapByRecord.value.get(row.id) || []
  if (sessions.length) {
    return calcWorkSessionMinutes(sessions, row.work_date === todayDate.value ? liveNowIso.value : null)
  }
  return calcWorkMinutes(row.check_in_at, row.check_out_at)
}

function statusForRow(row: AdminAttendanceRow) {
  const leave = approvedMonthlyLeaveMap.value.get(`${row.user_id}:${row.work_date}`) || null
  return computeAttendanceStatus({
    workDate: row.work_date,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    settings: settings.value,
    approvedLeave: leave,
    todayDate: todayDate.value,
  })
}

const filteredRows = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((row) => {
    return [
      row.user_name,
      row.user_email,
      row.user_login_id,
      row.work_date,
      statusForRow(row).label,
    ].some((v) => String(v || '').toLowerCase().includes(q))
  })
})

const monthWeekStarts = computed(() => getMonthWeekStarts(selectedMonth.value))

const currentWeekIndex = computed(() => {
  return monthWeekStarts.value.findIndex((value) => value === selectedWeekStart.value)
})

const hasPrevWeek = computed(() => currentWeekIndex.value > 0)
const hasNextWeek = computed(() => currentWeekIndex.value >= 0 && currentWeekIndex.value < monthWeekStarts.value.length - 1)

const currentWeekDays = computed(() => {
  const start = selectedWeekStart.value || monthWeekStarts.value[0] || getWeekStart(getMonthRange(selectedMonth.value).start)
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDateKeyDays(start, index)
    const formatted = formatShortDay(date)
    return {
      date,
      label: formatted.label,
      shortDate: formatted.shortDate,
      inMonth: date.startsWith(selectedMonth.value),
    }
  })
})

const currentWeekLabel = computed(() => {
  const first = currentWeekDays.value[0]
  const last = currentWeekDays.value[currentWeekDays.value.length - 1]
  const weekNo = currentWeekIndex.value >= 0 ? currentWeekIndex.value + 1 : 1
  return `${formatMonthLabel(selectedMonth.value)} ${weekNo}주차 · ${first.shortDate} ~ ${last.shortDate}`
})

const weeklyBoardRows = computed(() => {
  return filteredProfiles.value.map((profile) => {
    const days = currentWeekDays.value.map((day) => {
      const row = rowMapByUserDate.value.get(`${profile.profile_id}:${day.date}`) || null
      const leave = approvedLeaveMapByUserDate.value.get(`${profile.profile_id}:${day.date}`) || null
      const status = computeAttendanceStatus({
        workDate: day.date,
        checkInAt: row?.check_in_at,
        checkOutAt: row?.check_out_at,
        settings: settings.value,
        approvedLeave: leave,
        todayDate: todayDate.value,
      })
      const minutes = row ? rowWorkMinutes(row) : 0
      const timeLabel = leave
        ? getLeaveTypeLabel(leave.leave_type)
        : row?.check_in_at
          ? `${formatTime(row.check_in_at)}${row.check_out_at ? ` · ${formatTime(row.check_out_at)}` : ''}`
          : '-'
      const note = leave
        ? getLeaveStatusLabel(leave.status)
        : minutes > 0
          ? formatWorkDuration(minutes)
          : '-'

      return {
        date: day.date,
        inMonth: day.inMonth,
        row,
        leave,
        status,
        timeLabel,
        note,
      }
    })

    return {
      ...profile,
      days,
    }
  })
})

const selectedMonthLabel = computed(() => formatMonthLabel(selectedMonth.value))

const calendarCells = computed(() => {
  const { start, end } = getMonthRange(selectedMonth.value)
  const first = getWeekStart(start)
  const lastWeekStart = getWeekStart(end)
  const last = addDateKeyDays(lastWeekStart, 6)
  const cells: Array<{
    date: string
    inMonth: boolean
    dayNumber: number
    presentCount: number
    lateCount: number
    leaveCount: number
    absentCount: number
  }> = []

  for (let cursor = first; cursor <= last; cursor = addDateKeyDays(cursor, 1)) {
    const inMonth = cursor.startsWith(selectedMonth.value)
    let presentCount = 0
    let lateCount = 0
    let leaveCount = 0
    let absentCount = 0

    if (inMonth) {
      for (const profile of filteredProfiles.value) {
        const row = rowMapByUserDate.value.get(`${profile.profile_id}:${cursor}`) || null
        const leave = approvedLeaveMapByUserDate.value.get(`${profile.profile_id}:${cursor}`) || null
        const status = computeAttendanceStatus({
          workDate: cursor,
          checkInAt: row?.check_in_at,
          checkOutAt: row?.check_out_at,
          settings: settings.value,
          approvedLeave: leave,
          todayDate: todayDate.value,
        })
        if (leave) leaveCount += 1
        else if (row?.check_in_at) presentCount += 1
        if (status.code === 'late' || status.code === 'late_early') lateCount += 1
        if (status.code === 'absent') absentCount += 1
      }
    }

    cells.push({
      date: cursor,
      inMonth,
      dayNumber: Number(cursor.slice(-2)),
      presentCount,
      lateCount,
      leaveCount,
      absentCount,
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
  return filteredRows.value.filter((row) => row.work_date === selectedCalendarDate.value)
})

const selectedDateLeaveRows = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  return monthlyLeaves.value
    .filter((row) => row.start_date <= selectedCalendarDate.value && row.end_date >= selectedCalendarDate.value)
    .map((row) => ({
      ...row,
      ...(activeProfiles.value.find((profile) => profile.profile_id === row.user_id) || {
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
      if (openSession) {
        displayStatus = { label: '근무 중', className: 'status-working' }
      } else if (!sessionsTableMissing.value) {
        displayStatus = { label: '휴식 중', className: 'status-paused' }
      }
    }

    const workMinutes = sessions.length
      ? calcWorkSessionMinutes(sessions, liveNowIso.value)
      : calcWorkMinutes(record?.check_in_at, record?.check_out_at)

    const noteParts: string[] = []
    if (leave) noteParts.push(getLeaveTypeLabel(leave.leave_type))
    else if (record?.check_in_at && !record?.check_out_at) noteParts.push(openSession ? '근무 중' : '휴식 중')
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
  if (!q) return todayRows.value
  return todayRows.value.filter((row) => {
    return [row.user_name, row.user_login_id, row.displayStatus.label, row.note].some((value) => String(value || '').toLowerCase().includes(q))
  })
})

const summaryCards = computed(() => {
  const list = todayRows.value
  const countBy = (predicate: (row: TodayAttendanceRow) => boolean) => list.filter(predicate).length
  return [
    { label: '활성 계정', value: `${list.length}명` },
    { label: '근무 중', value: `${countBy((row) => row.displayStatus.label === '근무 중')}명` },
    { label: '휴식 중', value: `${countBy((row) => row.displayStatus.label === '휴식 중')}명` },
    { label: '퇴근 완료', value: `${countBy((row) => row.record?.check_out_at != null)}명` },
    { label: '지각', value: `${countBy((row) => {
      const base = computeAttendanceStatus({
        workDate: todayDate.value,
        checkInAt: row.record?.check_in_at,
        checkOutAt: row.record?.check_out_at,
        settings: settings.value,
        approvedLeave: row.leave,
        todayDate: todayDate.value,
      })
      return base.code === 'late' || base.code === 'late_early'
    })}명` },
    { label: '결근', value: `${countBy((row) => row.displayStatus.label === '결근')}명` },
    { label: '휴가/반차', value: `${countBy((row) => row.displayStatus.className === 'status-leave')}명` },
  ]
})

function moveWeek(direction: -1 | 1) {
  const nextIndex = currentWeekIndex.value + direction
  const next = monthWeekStarts.value[nextIndex]
  if (!next) return
  selectedWeekStart.value = next
}

const editDuration = computed(() => {
  const inIso = parseDateTimeLocalToIso(editCheckIn.value)
  const outIso = parseDateTimeLocalToIso(editCheckOut.value)
  return formatWorkDuration(calcWorkMinutes(inIso, outIso))
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

function splitEmailLoginId(email: string) {
  const [idPart = ''] = String(email || '').split('@')
  return idPart || '-'
}

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

async function fetchAttendanceRows() {
  const { start, end } = getMonthRange(selectedMonth.value)
  const { data, error } = await supabase
    .from('attendance_records')
    .select('id, user_id, work_date, check_in_at, check_out_at, check_in_note, check_out_note, updated_by, created_at, updated_at')
    .gte('work_date', start)
    .lte('work_date', end)
    .order('work_date', { ascending: false })
    .order('id', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'attendance_records')) {
      tableMissing.value = true
      rows.value = []
      return [] as AttendanceRecord[]
    }
    throw error
  }

  tableMissing.value = false
  return (data || []) as AttendanceRecord[]
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

async function fetchMonthlySessions() {
  const { start, end } = getMonthRange(selectedMonth.value)
  const { data, error } = await supabase
    .from('attendance_work_sessions')
    .select('id, record_id, user_id, work_date, started_at, ended_at, created_at, updated_at')
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

async function fetchMonthlyLeaves() {
  const { start, end } = getMonthRange(selectedMonth.value)
  const { data, error } = await supabase
    .from('leave_requests')
    .select('id, user_id, leave_type, start_date, end_date, status, reason, approved_by, approved_at, created_at, updated_at')
    .lte('start_date', end)
    .gte('end_date', start)
    .order('start_date', { ascending: false })
    .order('id', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'leave_requests')) {
      leaveTableMissing.value = true
      monthlyLeaves.value = []
      return
    }
    throw error
  }

  leaveTableMissing.value = false
  monthlyLeaves.value = (data || []) as LeaveRequest[]
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

async function refreshRows() {
  if (!isAdmin.value || !profileLoaded.value) return
  loading.value = true
  try {
    todayDate.value = getKstDateKey()
    syncCalendarTargets()
    const [attendanceRows] = await Promise.all([
      fetchAttendanceRows(),
      fetchSettings(),
      fetchActiveProfiles(),
      fetchTodayAttendanceRows(),
      fetchTodaySessions(),
      fetchMonthlySessions(),
      fetchMonthlyLeaves(),
      fetchTodayLeaves(),
    ])

    const profileMap = new Map(activeProfiles.value.map((profile) => [profile.profile_id, profile]))
    rows.value = attendanceRows.map((row) => ({
      ...row,
      ...(profileMap.get(row.user_id) || {
        profile_id: row.user_id,
        user_name: '-',
        user_email: '',
        user_login_id: '-',
      }),
    }))
  } catch (error: any) {
    console.error('Failed to fetch admin attendance rows:', error)
    toast.error(`근태 목록 조회 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    loading.value = false
  }
}

function startEdit(row: AdminAttendanceRow) {
  editingRowId.value = row.id
  editCheckIn.value = toDateTimeLocalValue(row.check_in_at)
  editCheckOut.value = toDateTimeLocalValue(row.check_out_at)
}

function cancelEdit() {
  editingRowId.value = null
  editCheckIn.value = ''
  editCheckOut.value = ''
}

async function saveEdit(row: AdminAttendanceRow) {
  if (!editingRowId.value) return
  const checkInIso = parseDateTimeLocalToIso(editCheckIn.value)
  const checkOutIso = parseDateTimeLocalToIso(editCheckOut.value)

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
    const { error } = await supabase
      .from('attendance_records')
      .update({
        check_in_at: checkInIso,
        check_out_at: checkOutIso,
        updated_by: user.value.id || null,
      })
      .eq('id', row.id)

    if (error) throw error
    toast.success('근태 기록이 수정되었습니다.')
    cancelEdit()
    await refreshRows()
  } catch (error: any) {
    console.error('Failed to save admin attendance edit:', error)
    toast.error(`수정 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

async function removeRow(row: AdminAttendanceRow) {
  if (!confirm(`${row.user_name}님의 ${row.work_date} 근태 기록을 삭제할까요?`)) return
  saving.value = true
  try {
    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('id', row.id)
    if (error) throw error
    toast.success('근태 기록이 삭제되었습니다.')
    await refreshRows()
  } catch (error: any) {
    console.error('Failed to delete attendance row:', error)
    toast.error(`삭제 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

async function updateLeaveStatus(row: AdminLeaveRow, status: LeaveStatus) {
  saving.value = true
  try {
    const payload: Record<string, any> = {
      status,
      approved_by: status === 'approved' ? (user.value.id || null) : null,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
    }
    const { error } = await supabase
      .from('leave_requests')
      .update(payload)
      .eq('id', row.id)

    if (error) throw error
    toast.success(`휴가 신청이 ${status === 'approved' ? '승인' : '반려'}되었습니다.`)
    await refreshRows()
  } catch (error: any) {
    console.error('Failed to update leave request:', error)
    toast.error(`휴가 요청 처리 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    saving.value = false
  }
}

watch(
  () => [profileLoaded.value, isAdmin.value],
  async ([loaded, admin]) => {
    if (!loaded || !admin) return
    syncCalendarTargets()
    await refreshRows()
  },
  { immediate: true },
)

watch(selectedMonth, async () => {
  if (!profileLoaded.value || !isAdmin.value) return
  syncCalendarTargets()
  await refreshRows()
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
  font-size: 1.125rem;
  font-weight: 700;
}

.admin-subtitle,
.section-caption {
  margin-top: 4px;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.admin-filters {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.week-nav {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}

.month-input {
  width: 170px;
}

.search-input {
  width: 220px;
}

.notice-error,
.notice-neutral {
  font-size: 0.875rem;
}

.notice-error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.notice-neutral {
  color: #374151;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-md);
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-label {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.summary-value {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--color-text);
}

.table-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.table-empty {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.table-wrap {
  overflow-x: auto;
}

.weekly-wrap {
  overflow: auto;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 980px;
}

.admin-table th,
.admin-table td {
  border-bottom: 1px solid var(--color-border-light);
  padding: 10px 8px;
  text-align: left;
  font-size: 0.8125rem;
}

.admin-table th {
  color: var(--color-text-muted);
  font-weight: 600;
}

.weekly-table {
  min-width: 1160px;
}

.sticky-col {
  position: sticky;
  left: 0;
  z-index: 1;
  background: rgba(255, 255, 255, 0.98);
}

.week-col-head {
  min-width: 132px;
}

.week-col-head span {
  display: block;
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-weight: 500;
}

.week-user-name {
  font-weight: 600;
  color: var(--color-text);
}

.week-user-id {
  margin-top: 2px;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.week-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 82px;
}

.week-cell.muted {
  opacity: 0.45;
}

.week-cell-time {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.week-cell-note {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-sm);
}

.calendar-weekday {
  padding: 0 var(--space-sm);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-align: center;
}

.calendar-day {
  min-height: 128px;
  padding: var(--space-sm);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  text-align: left;
}

.calendar-day:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.24);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
}

.calendar-day:disabled {
  cursor: default;
}

.calendar-day.outside {
  background: #f8fafc;
  color: #94a3b8;
}

.calendar-day.selected {
  border-color: rgba(37, 99, 235, 0.44);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
}

.calendar-day.today {
  background: rgba(239, 246, 255, 0.9);
}

.calendar-day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.calendar-day-number {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
}

.calendar-day-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.calendar-stat {
  font-size: 0.73rem;
  font-weight: 600;
}

.calendar-stat.present {
  color: #0369a1;
}

.calendar-stat.late {
  color: #b45309;
}

.calendar-stat.leave {
  color: #7c3aed;
}

.calendar-stat.absent {
  color: #b91c1c;
}

.selected-day-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin-top: var(--space-lg);
}

.selected-leave-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.selected-leave-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
  padding: var(--space-sm) var(--space-md);
  background: #fafbff;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
}

.selected-leave-user {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text);
}

.selected-leave-reason {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

.dt-input {
  min-width: 168px;
}

.row-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
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

.btn-danger {
  color: #dc2626;
}

@media (max-width: 1400px) {
  .summary-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .calendar-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .admin-header,
  .section-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .calendar-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
