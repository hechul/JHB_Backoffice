<template>
  <div class="weekly-page" :class="{ 'viewer-mode': !isAdmin }">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ isAdmin ? '주별 근태 기록' : '내 근태 기록' }}</h1>
      </div>
      <div class="page-actions">
        <input v-model="selectedMonth" type="month" class="input month-input" />
        <input v-if="isAdmin" v-model.trim="searchText" type="text" class="input search-input" placeholder="이름/아이디 검색" />
      </div>
    </div>

    <div v-if="tableMissing" class="card notice-error">
      `attendance_records` 테이블이 없어 주별 근태를 사용할 수 없습니다.
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
        <div v-for="item in weekSummaryCards" :key="item.label" class="card summary-card">
          <div class="summary-head">
            <span class="summary-label">{{ item.label }}</span>
            <div class="summary-icon-wrap" :class="item.tone">
              <component :is="item.icon" :size="16" :stroke-width="1.9" />
            </div>
          </div>
          <strong class="summary-value">{{ item.value }}</strong>
        </div>
      </div>

    <div class="card board-card">
      <template v-if="isAdmin">
        <div class="section-head">
          <div>
            <h2>{{ currentWeekLabel }}</h2>
          </div>
          <div class="week-nav">
            <button class="btn btn-ghost btn-sm" @click="jumpToCurrentWeek">이번 주</button>
            <button class="btn btn-ghost btn-sm" :disabled="!hasPrevWeek" @click="moveWeek(-1)">이전 주</button>
            <button class="btn btn-ghost btn-sm" :disabled="!hasNextWeek" @click="moveWeek(1)">다음 주</button>
          </div>
        </div>

        <div class="status-filter-row">
          <button
            v-for="filter in statusFilters"
            :key="filter.value"
            type="button"
            class="status-filter-chip"
            :class="{ active: selectedStatusFilter === filter.value }"
            @click="selectedStatusFilter = filter.value"
          >
            {{ filter.label }}
          </button>
        </div>
      </template>

      <div v-if="weeklyBoardRows.length === 0" class="table-empty">표시할 주간 근태가 없습니다.</div>
      <div v-else-if="!isAdmin" class="weekly-self-list">
        <div class="section-head compact-head">
          <div>
            <h2>{{ currentWeekLabel }}</h2>
          </div>
        </div>

        <div v-if="personalWeeklyEntries.length === 0" class="table-empty">해당 주 근태 기록이 없습니다.</div>
        <div v-else class="weekly-self-rows">
          <article
            v-for="entry in personalWeeklyEntries"
            :key="`week-entry-${entry.date}`"
            class="weekly-self-row"
            :class="[dayCardTone(entry.status), { today: entry.isToday }]"
          >
            <div class="weekly-self-date">
              <span class="weekly-self-weekday">{{ getWeekdayLabel(entry.date) }}</span>
              <strong class="weekly-self-date-value">{{ formatCardDate(entry.date) }}</strong>
            </div>

            <div class="weekly-self-status">
              <span class="status-chip" :class="entry.className">{{ entry.label }}</span>
            </div>

            <div class="weekly-self-main">
              <strong class="weekly-self-primary">{{ entry.primaryLabel }}</strong>
              <div class="weekly-self-meta">
                <span
                  v-for="item in entry.metaItems"
                  :key="`${entry.date}-${item}`"
                  class="weekly-self-meta-pill"
                >
                  {{ item }}
                </span>
              </div>
            </div>

            <div class="weekly-self-duration">{{ entry.durationLabel }}</div>
          </article>
        </div>
      </div>
      <div v-else-if="filteredWeeklyBoardRows.length > 0" class="weekly-person-grid">
        <article
          v-for="row in filteredWeeklyBoardRows"
          :key="`week-${row.profile_id}`"
          class="weekly-person-card"
        >
          <div class="weekly-person-head">
            <div>
              <div class="week-user-name">{{ row.user_name }}</div>
              <div class="week-user-id">{{ row.user_login_id }}</div>
            </div>
            <div class="weekly-person-summary">
              <span class="weekly-summary-chip">
                근무 {{ countWeeklyStatuses(row.days, ['done', 'early_leave', 'working']) }}일
              </span>
              <span class="weekly-summary-chip tone-amber">
                지각·조퇴 {{ countWeeklyStatuses(row.days, ['late', 'late_early']) }}일
              </span>
              <span class="weekly-summary-chip tone-purple">
                휴가 {{ countWeeklyStatuses(row.days, ['leave']) }}일
              </span>
            </div>
          </div>

          <div class="weekly-day-scroll">
            <div class="weekly-day-grid">
              <article
                v-for="cell in row.days"
                :key="`${row.profile_id}-${cell.date}`"
                class="weekly-day-card"
                :class="[dayCardTone(cell.status.code), { muted: !cell.inMonth, today: cell.date === todayDate }]"
              >
                <div class="weekly-day-head">
                  <div>
                    <div class="day-card-weekday">{{ getWeekdayLabel(cell.date) }}</div>
                    <strong class="day-card-date">{{ formatCardDate(cell.date) }}</strong>
                  </div>
                  <span class="status-chip" :class="cell.status.className">{{ cell.status.label }}</span>
                </div>
                <div class="weekly-day-body">
                  <span class="weekly-day-time">{{ cell.timeLabel }}</span>
                  <span class="weekly-day-note">{{ cell.note }}</span>
                </div>
                <div v-if="cell.recordId" class="weekly-day-actions">
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    :disabled="savingRecordId === cell.recordId || deletingRecordId === cell.recordId"
                    @click.stop="openWeeklyEditModal(row, cell)"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm btn-danger"
                    :disabled="deletingRecordId === cell.recordId || savingRecordId === cell.recordId"
                    @click.stop="openWeeklyDeleteModal(row, cell)"
                  >
                    삭제
                  </button>
                </div>
              </article>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="table-empty">선택한 조건에 맞는 주간 근태가 없습니다.</div>
    </div>

    <div v-if="weeklyEditTarget" class="modal-backdrop" @click.self="closeWeeklyEditModal">
      <div class="weekly-edit-modal">
        <div class="weekly-edit-head">
          <div>
            <h2>{{ weeklyEditTarget.userName }} · {{ weeklyEditTarget.workDate }}</h2>
          </div>
          <button type="button" class="detail-close" @click="closeWeeklyEditModal">닫기</button>
        </div>

        <div class="weekly-edit-grid">
          <div class="weekly-edit-datetime-card">
            <div class="weekly-edit-datetime-head">
              <span>출근</span>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="savingRecordId === weeklyEditTarget.recordId"
                @click="applyWeeklyEditDraft('check_in')"
              >
                확인
              </button>
            </div>
            <div class="weekly-edit-datetime-inputs">
              <input v-model="editCheckInDate" type="date" class="input date-input" />
              <input v-model="editCheckInTime" type="time" class="input time-input" />
            </div>
          </div>
          <div class="weekly-edit-datetime-card">
            <div class="weekly-edit-datetime-head">
              <span>퇴근</span>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="savingRecordId === weeklyEditTarget.recordId"
                @click="applyWeeklyEditDraft('check_out')"
              >
                확인
              </button>
            </div>
            <div class="weekly-edit-datetime-inputs">
              <input v-model="editCheckOutDate" type="date" class="input date-input" />
              <input v-model="editCheckOutTime" type="time" class="input time-input" />
            </div>
          </div>
          <div class="weekly-edit-field">
            <span>근무시간</span>
            <strong>{{ weeklyEditDuration }}</strong>
          </div>
        </div>

        <div class="weekly-edit-actions">
          <button type="button" class="btn btn-ghost" :disabled="savingRecordId === weeklyEditTarget.recordId" @click="closeWeeklyEditModal">취소</button>
          <button type="button" class="btn btn-primary" :disabled="savingRecordId === weeklyEditTarget.recordId" @click="saveWeeklyEdit">저장</button>
        </div>
      </div>
    </div>

    <div v-if="weeklyDeleteTarget" class="modal-backdrop" @click.self="closeWeeklyDeleteModal">
      <div class="weekly-edit-modal weekly-delete-modal">
        <div class="confirm-modal-body">
          <strong>{{ weeklyDeleteTarget.userName }}님의 {{ weeklyDeleteTarget.workDate }} 근태 기록을 삭제할까요?</strong>
          <span>해당 날짜의 근무 전환 기록도 함께 삭제됩니다.</span>
        </div>
        <div class="weekly-edit-actions">
          <button type="button" class="btn btn-ghost" :disabled="deletingRecordId === weeklyDeleteTarget.recordId" @click="closeWeeklyDeleteModal">취소</button>
          <button type="button" class="btn btn-primary" :disabled="deletingRecordId === weeklyDeleteTarget.recordId" @click="confirmWeeklyDelete">삭제하기</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BriefcaseBusiness, CalendarRange, CircleAlert, Plane, Users } from 'lucide-vue-next'
import type { AttendanceRecord, AttendanceSettings, AttendanceWorkSession, LeaveRequest } from '~/composables/useAttendance'
import { addWeekDateDays, getMonthWeekRanges, getWeekStart as getStandardWeekStart } from '~/composables/useWeekFilter'

definePageMeta({ layout: 'attendance' })

type ProfileRow = {
  profile_id: string
  user_name: string
  user_email: string
  user_login_id: string
}

const calendarWeekdayLabels = ['월', '화', '수', '목', '금', '토', '일']

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
  getDateKeyFromDateTimeLocalValue,
  getTimeValueFromDateTimeLocalValue,
  buildDateTimeLocalValue,
  shiftIsoToDateKey,
  normalizeAttendanceSettings,
  getLeaveTypeLabel,
  getLeaveStatusLabel,
  createLeaveDateMap,
  computeAttendanceStatus,
} = useAttendance()

const todayDate = ref(getKstDateKey())
const selectedMonth = ref(getKstMonthKey())
const selectedWeekStart = ref('')
const searchText = ref('')
const selectedStatusFilter = ref<'all' | 'working' | 'late' | 'leave' | 'absent'>('all')
const loading = ref(false)
const tableMissing = ref(false)
const sessionsTableMissing = ref(false)
const settingsTableMissing = ref(false)
const leaveTableMissing = ref(false)
const rows = ref<AttendanceRecord[]>([])
const sessions = ref<AttendanceWorkSession[]>([])
const leaves = ref<LeaveRequest[]>([])
const profiles = ref<ProfileRow[]>([])
const settings = ref<AttendanceSettings>(normalizeAttendanceSettings(DEFAULT_ATTENDANCE_SETTINGS))
const liveNowIso = ref(new Date().toISOString())
const weeklyEditTarget = ref<{
  recordId: number
  userName: string
  userLoginId: string
  workDate: string
} | null>(null)
const weeklyDeleteTarget = ref<{
  recordId: number
  userName: string
  userLoginId: string
  workDate: string
} | null>(null)
const editCheckInDate = ref('')
const editCheckInTime = ref('')
const editCheckOutDate = ref('')
const editCheckOutTime = ref('')
const editCheckIn = ref('')
const editCheckOut = ref('')
const savingRecordId = ref<number | null>(null)
const deletingRecordId = ref<number | null>(null)
let liveTimer: ReturnType<typeof setInterval> | null = null

function splitEmailLoginId(email: string) {
  const [idPart = ''] = String(email || '').split('@')
  return idPart || '-'
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+09:00`)
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

function syncWeekTarget() {
  const ranges = getMonthWeekRanges(selectedMonth.value)
  const monthWeekStarts = ranges.map((range) => range.startDate)
  if (!monthWeekStarts.includes(selectedWeekStart.value)) {
    const { start, end } = getMonthRange(selectedMonth.value)
    const currentRange = ranges.find((range) => range.allDateTokens.includes(todayDate.value))
    const initialWeek = todayDate.value >= start && todayDate.value <= end
      ? currentRange?.startDate || monthWeekStarts[0] || getStandardWeekStart(start)
      : monthWeekStarts[0] || getStandardWeekStart(start)
    selectedWeekStart.value = initialWeek
  }
}

const scopedProfiles = computed(() => {
  if (isAdmin.value) {
    const q = searchText.value.trim().toLowerCase()
    if (!q) return profiles.value
    return profiles.value.filter((profile) => [profile.user_name, profile.user_email, profile.user_login_id]
      .some((value) => String(value || '').toLowerCase().includes(q)))
  }
  return profiles.value
})

const rowMapByUserDate = computed(() => {
  return new Map(rows.value.map((row) => [`${row.user_id}:${row.work_date}`, row]))
})

const sessionMapByUserDate = computed(() => {
  const map = new Map<string, AttendanceWorkSession[]>()
  for (const session of sessions.value) {
    const key = `${session.user_id}:${session.work_date}`
    const bucket = map.get(key) || []
    bucket.push(session)
    map.set(key, bucket)
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.started_at.localeCompare(b.started_at))
  }
  return map
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

const monthWeekRanges = computed(() => getMonthWeekRanges(selectedMonth.value))
const monthWeekStarts = computed(() => monthWeekRanges.value.map((range) => range.startDate))
const currentWeekIndex = computed(() => monthWeekStarts.value.findIndex((value) => value === selectedWeekStart.value))
const hasPrevWeek = computed(() => currentWeekIndex.value > 0)
const hasNextWeek = computed(() => currentWeekIndex.value >= 0 && currentWeekIndex.value < monthWeekStarts.value.length - 1)
const currentWeekRange = computed(() => {
  return monthWeekRanges.value.find((range) => range.startDate === selectedWeekStart.value) || monthWeekRanges.value[0] || null
})

const currentWeekDays = computed(() => {
  const dateTokens = currentWeekRange.value?.allDateTokens || Array.from(
    { length: 7 },
    (_, index) => addWeekDateDays(selectedWeekStart.value || monthWeekStarts.value[0] || getStandardWeekStart(getMonthRange(selectedMonth.value).start), index),
  )
  return dateTokens.map((date) => {
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
  const weekNo = currentWeekRange.value?.weekNumber || (currentWeekIndex.value >= 0 ? currentWeekIndex.value + 1 : 1)
  return `${formatMonthLabel(selectedMonth.value)} ${weekNo}주차 · ${first.shortDate} ~ ${last.shortDate}`
})

const statusFilters = [
  { label: '전체', value: 'all' },
  { label: '근무', value: 'working' },
  { label: '지각/조퇴', value: 'late' },
  { label: '휴가/반차', value: 'leave' },
  { label: '결근', value: 'absent' },
] as const

const weekSummaryCards = computed(() => {
  if (!isAdmin.value) {
    const countBy = (predicate: (entry: typeof personalWeeklyEntries.value[number]) => boolean) => personalWeeklyEntries.value.filter(predicate).length
    return [
      { label: '기록 일수', value: `${personalWeeklyEntries.value.length}일`, tone: 'summary-tone-slate', icon: CalendarRange },
      { label: '정상/근무', value: `${countBy((entry) => ['done', 'working'].includes(entry.status))}일`, tone: 'summary-tone-blue', icon: BriefcaseBusiness },
      { label: '지각/조퇴', value: `${countBy((entry) => ['late', 'late_early', 'early_leave'].includes(entry.status))}일`, tone: 'summary-tone-amber', icon: CircleAlert },
      { label: '휴가/반차', value: `${countBy((entry) => entry.status.includes('leave'))}일`, tone: 'summary-tone-purple', icon: Plane },
      { label: '결근', value: `${countBy((entry) => entry.status === 'absent')}일`, tone: 'summary-tone-red', icon: Users },
    ]
  }

  const statusCounts = { working: 0, late: 0, leave: 0, absent: 0 }
  for (const row of weeklyBoardRows.value) {
    for (const day of row.days) {
      if (!day.inMonth) continue
      const code = day.status.code
      if (isLeaveStatusCode(code)) statusCounts.leave += 1
      else if (code === 'late' || code === 'late_early') statusCounts.late += 1
      else if (code === 'absent') statusCounts.absent += 1
      else if (code === 'done' || code === 'early_leave' || code === 'working') statusCounts.working += 1
    }
  }
  return [
    { label: isAdmin.value ? '조회 직원' : '조회 기간', value: isAdmin.value ? `${scopedProfiles.value.length}명` : `${currentWeekDays.value.length}일`, tone: 'summary-tone-slate', icon: Users },
    { label: '근무 표시', value: `${statusCounts.working}건`, tone: 'summary-tone-blue', icon: BriefcaseBusiness },
    { label: '지각/조퇴', value: `${statusCounts.late}건`, tone: 'summary-tone-amber', icon: CircleAlert },
    { label: '휴가/반차', value: `${statusCounts.leave}건`, tone: 'summary-tone-purple', icon: Plane },
    { label: '결근', value: `${statusCounts.absent}건`, tone: 'summary-tone-red', icon: CalendarRange },
  ]
})

const personalWeeklyEntries = computed(() => {
  if (isAdmin.value) return []
  const profile = profiles.value[0]
  if (!profile) return []
  const recordMap = new Map(
    rows.value
      .filter((row) => row.user_id === profile.profile_id)
      .map((row) => [row.work_date, row]),
  )
  return [...currentWeekDays.value]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      const row = recordMap.get(day.date) || null
      const leave = approvedLeaveMapByUserDate.value.get(`${profile.profile_id}:${day.date}`) || null
      const daySessions = sessionMapByUserDate.value.get(`${profile.profile_id}:${day.date}`) || []
      const status = computeAttendanceStatus({
        workDate: day.date,
        checkInAt: row?.check_in_at,
        checkOutAt: row?.check_out_at,
        settings: settings.value,
        approvedLeave: leave,
        todayDate: todayDate.value,
      })
      const workMinutes = daySessions.length
        ? calcWorkSessionMinutes(daySessions, {
            openSessionEndAt: day.date === todayDate.value ? liveNowIso.value : null,
            overrideStartAt: row?.check_in_at,
            overrideEndAt: row?.check_out_at,
          })
        : calcWorkMinutes(row?.check_in_at, row?.check_out_at)

      return {
        date: day.date,
        status: status.code,
        label: status.label,
        className: status.className,
        isToday: day.date === todayDate.value,
        primaryLabel: leave
          ? `${getLeaveTypeLabel(leave.leave_type)} 일정`
          : row?.check_in_at
            ? `${formatTime(row.check_in_at)}${row.check_out_at ? ` - ${formatTime(row.check_out_at)}` : ' - 진행 중'}`
            : '기록 없음',
        durationLabel: leave
          ? getLeaveStatusLabel(leave.status)
          : workMinutes > 0
            ? formatWorkDuration(workMinutes)
            : row?.check_in_at
              ? '근무 중'
              : '근무 없음',
        metaItems: leave
          ? [`상태 ${getLeaveStatusLabel(leave.status)}`]
          : row?.check_in_at
            ? [
                `출근 ${formatTime(row.check_in_at)}`,
                row.check_out_at ? `퇴근 ${formatTime(row.check_out_at)}` : '퇴근 전',
              ]
            : ['출퇴근 기록 없음'],
        note: '',
      }
    })
})

const weeklyBoardRows = computed(() => {
  return scopedProfiles.value.map((profile) => {
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
      const daySessions = sessionMapByUserDate.value.get(`${profile.profile_id}:${day.date}`) || []
      const minutes = daySessions.length
        ? calcWorkSessionMinutes(daySessions, {
            openSessionEndAt: day.date === todayDate.value ? liveNowIso.value : null,
            overrideStartAt: row?.check_in_at,
            overrideEndAt: row?.check_out_at,
          })
        : calcWorkMinutes(row?.check_in_at, row?.check_out_at)
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
        status,
        recordId: row?.id || null,
        checkInAt: row?.check_in_at || null,
        checkOutAt: row?.check_out_at || null,
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

const filteredWeeklyBoardRows = computed(() => {
  if (selectedStatusFilter.value === 'all') return weeklyBoardRows.value
  return weeklyBoardRows.value.filter((row) => row.days.some((cell) => matchesStatusFilter(cell.status.code)))
})

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
  rows.value = (data || []) as AttendanceRecord[]
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

async function refreshBoard() {
  if (!profileLoaded.value || !user.value.id) return
  loading.value = true
  try {
    todayDate.value = getKstDateKey()
    syncWeekTarget()
    await Promise.all([
      fetchSettings(),
      fetchProfiles(),
      fetchRows(),
      fetchSessions(),
      fetchLeaves(),
    ])
  } catch (error: any) {
    console.error('Failed to fetch weekly attendance board:', error)
    toast.error(`주별 근태 조회 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    loading.value = false
  }
}

function moveWeek(direction: -1 | 1) {
  const nextIndex = currentWeekIndex.value + direction
  const next = monthWeekStarts.value[nextIndex]
  if (!next) return
  selectedWeekStart.value = next
}

function jumpToCurrentWeek() {
  const currentMonth = getKstMonthKey()
  selectedMonth.value = currentMonth
  const today = getKstDateKey()
  const currentRange = getMonthWeekRanges(currentMonth).find((range) => range.allDateTokens.includes(today))
  selectedWeekStart.value = currentRange?.startDate || getStandardWeekStart(today)
}

function formatCardDate(dateKey: string) {
  const [, month = '', day = ''] = String(dateKey).split('-')
  return `${month}.${day}`
}

function getWeekdayLabel(dateKey: string) {
  const date = parseDateKey(dateKey)
  return calendarWeekdayLabels[(date.getDay() + 6) % 7]
}

function dayCardTone(statusCode?: string) {
  if (isLeaveStatusCode(statusCode)) return 'tone-purple'
  if (statusCode === 'late' || statusCode === 'late_early') return 'tone-amber'
  if (statusCode === 'absent') return 'tone-red'
  if (statusCode === 'done' || statusCode === 'early_leave' || statusCode === 'working') return 'tone-blue'
  return 'tone-slate'
}

function matchesStatusFilter(code?: string) {
  if (selectedStatusFilter.value === 'all') return true
  if (selectedStatusFilter.value === 'working') return code === 'done' || code === 'early_leave' || code === 'working'
  if (selectedStatusFilter.value === 'late') return code === 'late' || code === 'late_early'
  if (selectedStatusFilter.value === 'leave') return isLeaveStatusCode(code)
  if (selectedStatusFilter.value === 'absent') return code === 'absent'
  return true
}

function countWeeklyStatuses(days: Array<{ inMonth: boolean, status: { code?: string } }>, codes: string[]) {
  return days.filter((day) => {
    if (!day.inMonth) return false
    const code = String(day.status.code || '')
    if (codes.includes(code)) return true
    if (codes.includes('leave') && isLeaveStatusCode(code)) return true
    return false
  }).length
}

function isLeaveStatusCode(code?: string) {
  return String(code || '').includes('leave')
}

const weeklyEditDuration = computed(() => {
  const inIso = parseDateTimeLocalToIso(editCheckIn.value)
  const outIso = parseDateTimeLocalToIso(editCheckOut.value)
  return formatWorkDuration(calcWorkMinutes(inIso, outIso))
})

function openWeeklyEditModal(
  profile: { user_name: string, user_login_id: string },
  cell: { recordId: number | null, date: string, checkInAt: string | null, checkOutAt: string | null },
) {
  if (!cell.recordId) return
  weeklyEditTarget.value = {
    recordId: cell.recordId,
    userName: profile.user_name,
    userLoginId: profile.user_login_id,
    workDate: cell.date,
  }
  editCheckIn.value = toDateTimeLocalValue(cell.checkInAt)
  editCheckOut.value = toDateTimeLocalValue(cell.checkOutAt)
  syncWeeklyEditDraftFields()
}

function closeWeeklyEditModal() {
  if (savingRecordId.value) return
  weeklyEditTarget.value = null
  editCheckInDate.value = ''
  editCheckInTime.value = ''
  editCheckOutDate.value = ''
  editCheckOutTime.value = ''
  editCheckIn.value = ''
  editCheckOut.value = ''
}

function syncWeeklyEditDraftFields() {
  editCheckInDate.value = getDateKeyFromDateTimeLocalValue(editCheckIn.value)
  editCheckInTime.value = getTimeValueFromDateTimeLocalValue(editCheckIn.value)
  editCheckOutDate.value = getDateKeyFromDateTimeLocalValue(editCheckOut.value)
  editCheckOutTime.value = getTimeValueFromDateTimeLocalValue(editCheckOut.value)
}

function applyWeeklyEditDraft(target: 'check_in' | 'check_out', options?: { silent?: boolean }) {
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

async function saveWeeklyEdit() {
  const recordId = weeklyEditTarget.value?.recordId
  if (!recordId) return

  if (!applyWeeklyEditDraft('check_in', { silent: true })) return
  if (!applyWeeklyEditDraft('check_out', { silent: true })) return

  const checkInIso = parseDateTimeLocalToIso(editCheckIn.value)
  const checkOutIso = parseDateTimeLocalToIso(editCheckOut.value)
  const workDate = getDateKeyFromDateTimeLocalValue(editCheckIn.value)
    || getDateKeyFromDateTimeLocalValue(editCheckOut.value)
    || weeklyEditTarget.value?.workDate
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
    const sessionsForRecord = sessionMapByRecord.value.get(recordId) || []
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

    toast.success('주간 근태 기록을 수정했습니다.')
    closeWeeklyEditModal()
    await refreshBoard()
  } catch (error: any) {
    console.error('Failed to save weekly attendance edit:', error)
    toast.error(`주간 근태 수정 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    savingRecordId.value = null
  }
}

function openWeeklyDeleteModal(
  profile: { user_name: string, user_login_id: string },
  cell: { recordId: number | null, date: string },
) {
  if (!cell.recordId) return
  weeklyDeleteTarget.value = {
    recordId: cell.recordId,
    userName: profile.user_name,
    userLoginId: profile.user_login_id,
    workDate: cell.date,
  }
}

function closeWeeklyDeleteModal() {
  if (deletingRecordId.value) return
  weeklyDeleteTarget.value = null
}

async function confirmWeeklyDelete() {
  const recordId = weeklyDeleteTarget.value?.recordId
  if (!recordId) return

  deletingRecordId.value = recordId
  try {
    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('id', recordId)

    if (error) throw error

    toast.success('주간 근태 기록을 삭제했습니다.')
    closeWeeklyDeleteModal()
    await refreshBoard()
  } catch (error: any) {
    console.error('Failed to delete weekly attendance row:', error)
    toast.error(`주간 근태 삭제 실패: ${error?.message || '알 수 없는 오류'}`)
  } finally {
    deletingRecordId.value = null
  }
}

watch(
  () => [profileLoaded.value, user.value.id, isAdmin.value],
  async ([loaded, uid]) => {
    if (!loaded || !uid) return
    syncWeekTarget()
    await refreshBoard()
  },
  { immediate: true },
)

watch(selectedMonth, async () => {
  if (!profileLoaded.value || !user.value.id) return
  syncWeekTarget()
  await refreshBoard()
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
.weekly-page {
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

.page-actions,
.week-nav {
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

.summary-label {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.summary-value {
  font-size: 1.28rem;
  font-weight: 800;
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

.summary-tone-purple {
  background: rgba(139, 92, 246, 0.12);
  color: #6d28d9;
}

.summary-tone-red {
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
}

.tone-slate,
.tone-blue,
.tone-amber,
.tone-purple,
.tone-red {
  background: rgba(255, 255, 255, 0.94);
}

.board-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
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

.weekly-self-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.weekly-self-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.weekly-self-row {
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--color-border-light);
  background: rgba(255, 255, 255, 0.88);
  display: grid;
  grid-template-columns: 92px 104px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
}

.weekly-self-row.today {
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

.weekly-self-date {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.weekly-self-weekday {
  font-size: 0.82rem;
  color: var(--color-text-secondary);
}

.weekly-self-date-value {
  font-size: 1rem;
  font-weight: 800;
}

.weekly-self-status {
  display: flex;
  align-items: center;
}

.weekly-self-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.weekly-self-primary {
  font-size: 0.96rem;
  font-weight: 800;
  line-height: 1.35;
}

.weekly-self-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.weekly-self-meta-pill {
  min-height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.14);
  color: var(--color-text-secondary);
  font-size: 0.82rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
}

.weekly-self-duration {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.14);
  color: var(--color-text-secondary);
  font-size: 0.84rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.section-caption,
.table-empty {
  color: var(--color-text-secondary);
}

.weekly-person-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-md);
}

.weekly-person-card {
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.88);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.weekly-person-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.weekly-person-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.weekly-summary-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(226, 232, 240, 0.9);
  color: var(--color-text);
  font-size: 0.86rem;
  font-weight: 700;
}

.weekly-summary-chip.tone-amber {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(245, 158, 11, 0.22);
  color: #b45309;
}

.weekly-summary-chip.tone-purple {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(139, 92, 246, 0.22);
  color: #6d28d9;
}

.week-user-name {
  font-weight: 700;
  font-size: 1.04rem;
}

.week-user-id {
  margin-top: 4px;
  font-size: 0.86rem;
  color: var(--color-text-secondary);
}

.weekly-day-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
}

.weekly-day-scroll::-webkit-scrollbar {
  display: none;
}

.weekly-day-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
}

.weekly-day-card {
  min-height: 144px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(226, 232, 240, 0.88);
  background: rgba(255, 255, 255, 0.94);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.weekly-day-card.tone-blue,
.weekly-self-row.tone-blue {
  border-color: rgba(37, 99, 235, 0.16);
}

.weekly-day-card.tone-amber,
.weekly-self-row.tone-amber {
  border-color: rgba(245, 158, 11, 0.2);
}

.weekly-day-card.tone-purple,
.weekly-self-row.tone-purple {
  border-color: rgba(139, 92, 246, 0.18);
}

.weekly-day-card.tone-red,
.weekly-self-row.tone-red {
  border-color: rgba(239, 68, 68, 0.16);
}

.weekly-day-card.today {
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

.weekly-day-card.muted {
  opacity: 0.58;
}

.weekly-day-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.weekly-day-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.weekly-day-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.weekly-day-time,
.weekly-day-note {
  font-size: 0.84rem;
  color: var(--color-text-secondary);
  line-height: 1.35;
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

.weekly-edit-modal {
  width: min(560px, 100%);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
  border: 1px solid rgba(255, 255, 255, 0.14);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.weekly-delete-modal {
  width: min(420px, 100%);
}

.weekly-edit-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.weekly-edit-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.weekly-edit-datetime-card,
.weekly-edit-field {
  padding: 14px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.94);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.weekly-edit-datetime-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.weekly-edit-datetime-head span {
  color: var(--color-text-secondary);
  font-size: 0.86rem;
  font-weight: 700;
}

.weekly-edit-datetime-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 10px;
}

.weekly-edit-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.weekly-edit-field span {
  color: var(--color-text-secondary);
  font-size: 0.86rem;
  font-weight: 700;
}

.weekly-edit-field strong {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.12);
  display: inline-flex;
  align-items: center;
}

.weekly-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 768px) {
  .page-header,
  .section-head,
  .page-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .weekly-person-head,
  .weekly-person-summary {
    align-items: stretch;
    justify-content: flex-start;
  }

  .weekly-day-grid {
    min-width: 840px;
    grid-template-columns: repeat(7, minmax(108px, 1fr));
  }

  .weekly-self-row,
  .weekly-edit-grid,
  .weekly-edit-actions,
  .weekly-edit-head {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }

  .weekly-edit-datetime-inputs {
    grid-template-columns: 1fr;
  }

  .weekly-self-row {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .weekly-day-card {
    min-height: 132px;
  }

  .weekly-day-actions {
    flex-direction: column;
  }

  .weekly-day-actions :deep(.btn) {
    width: 100%;
  }

  .search-input {
    min-width: 0;
  }

  .viewer-mode .summary-grid {
    display: none;
  }

  .viewer-mode .weekly-self-row {
    grid-template-columns: 88px minmax(0, 1fr);
    grid-template-areas:
      "date status"
      "main main"
      "duration duration";
    gap: 12px;
    padding: 14px;
  }

  .viewer-mode .weekly-self-date {
    grid-area: date;
  }

  .viewer-mode .weekly-self-status {
    grid-area: status;
    justify-content: flex-end;
    align-self: start;
  }

  .viewer-mode .weekly-self-main {
    grid-area: main;
  }

  .viewer-mode .weekly-self-duration {
    grid-area: duration;
    justify-self: start;
  }

  .viewer-mode .weekly-self-meta {
    gap: 6px;
  }

  .viewer-mode .weekly-self-meta-pill {
    min-height: 28px;
    font-size: 0.78rem;
  }

  .modal-backdrop {
    padding: 16px;
  }
}
</style>
