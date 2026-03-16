export interface AttendanceRecord {
  id: number
  user_id: string
  work_date: string
  check_in_at: string | null
  check_out_at: string | null
  check_in_note: string | null
  check_out_note: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface AttendanceWorkSession {
  id: number
  record_id: number
  user_id: string
  work_date: string
  started_at: string
  ended_at: string | null
  created_at: string
  updated_at: string
}

export interface AttendanceSettings {
  id: number
  work_start_time: string
  work_end_time: string
  late_grace_minutes: number
  early_leave_grace_minutes: number
  lunch_break_minutes: number
  standard_work_minutes: number
  created_at?: string
  updated_at?: string
}

export type LeaveType = 'annual' | 'half_am' | 'half_pm' | 'sick' | 'official' | 'other'
export type LeaveStatus = 'pending' | 'approved' | 'rejected'

export interface LeaveRequest {
  id: number
  user_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  status: LeaveStatus
  reason: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export type AttendanceStatusCode =
  | 'not_started'
  | 'working'
  | 'done'
  | 'late'
  | 'late_early'
  | 'early_leave'
  | 'absent'
  | 'annual_leave'
  | 'half_am_leave'
  | 'half_pm_leave'
  | 'sick_leave'
  | 'official_leave'
  | 'other_leave'

export interface AttendanceStatusResult {
  code: AttendanceStatusCode
  label: string
  className: string
}

const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  id: 1,
  work_start_time: '09:00',
  work_end_time: '18:00',
  late_grace_minutes: 10,
  early_leave_grace_minutes: 20,
  lunch_break_minutes: 60,
  standard_work_minutes: 8 * 60,
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

export function getKstDateKey(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value || '0000'
  const month = parts.find((p) => p.type === 'month')?.value || '01'
  const day = parts.find((p) => p.type === 'day')?.value || '01'
  return `${year}-${month}-${day}`
}

export function getKstMonthKey(date: Date = new Date()) {
  return getKstDateKey(date).slice(0, 7)
}

export function getMonthRange(month: string) {
  const [yearRaw, monthRaw] = String(month || '').split('-')
  const year = Number(yearRaw)
  const monthNum = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
    const current = getKstMonthKey()
    return getMonthRange(current)
  }
  const start = `${year}-${pad2(monthNum)}-01`
  const lastDay = new Date(year, monthNum, 0).getDate()
  const end = `${year}-${pad2(monthNum)}-${pad2(lastDay)}`
  return { start, end }
}

function expandDateRange(startDate: string, endDate: string) {
  const result: string[] = []
  const start = new Date(`${startDate}T00:00:00+09:00`)
  const end = new Date(`${endDate}T00:00:00+09:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
    return result
  }

  const cursor = new Date(start)
  while (cursor.getTime() <= end.getTime()) {
    result.push(getKstDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  return result
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  return value
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatTime(value: string | null | undefined) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''

  const year = d.getFullYear()
  const month = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  const hour = pad2(d.getHours())
  const minute = pad2(d.getMinutes())
  return `${year}-${month}-${day}T${hour}:${minute}`
}

export function parseDateTimeLocalToIso(value: string | null | undefined) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function calcWorkMinutes(checkInAt: string | null | undefined, checkOutAt: string | null | undefined) {
  if (!checkInAt || !checkOutAt) return 0
  const start = new Date(checkInAt).getTime()
  const end = new Date(checkOutAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.floor((end - start) / 60000)
}

type CalcWorkSessionMinutesOptions = {
  openSessionEndAt?: string | Date | null
  overrideStartAt?: string | null
  overrideEndAt?: string | null
}

function isCalcWorkSessionMinutesOptions(
  value: string | Date | null | undefined | CalcWorkSessionMinutesOptions,
): value is CalcWorkSessionMinutesOptions {
  return Boolean(value) && typeof value === 'object' && !(value instanceof Date)
}

export function calcWorkSessionMinutes(
  sessions: AttendanceWorkSession[] | null | undefined,
  openSessionEndAtOrOptions?: string | Date | null | CalcWorkSessionMinutesOptions,
) {
  if (!sessions?.length) return 0
  const openSessionEndAt = isCalcWorkSessionMinutesOptions(openSessionEndAtOrOptions)
    ? openSessionEndAtOrOptions.openSessionEndAt
    : openSessionEndAtOrOptions
  const overrideStartAt = isCalcWorkSessionMinutesOptions(openSessionEndAtOrOptions)
    ? openSessionEndAtOrOptions.overrideStartAt
    : null
  const overrideEndAt = isCalcWorkSessionMinutesOptions(openSessionEndAtOrOptions)
    ? openSessionEndAtOrOptions.overrideEndAt
    : null
  const fallbackEndTime = openSessionEndAt
    ? new Date(openSessionEndAt).getTime()
    : NaN

  const sortedSessions = [...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at))

  return sortedSessions.reduce((total, session, index) => {
    const isFirstSession = index === 0
    const isLastSession = index === sortedSessions.length - 1
    const startAt = isFirstSession && overrideStartAt
      ? overrideStartAt
      : session.started_at
    const endAt = isLastSession && overrideEndAt
      ? overrideEndAt
      : session.ended_at

    const start = new Date(startAt).getTime()
    const end = endAt
      ? new Date(endAt).getTime()
      : fallbackEndTime

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return total
    }

    return total + Math.floor((end - start) / 60000)
  }, 0)
}

export function formatWorkDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '-'
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  if (hour <= 0) return `${minute}분`
  if (minute <= 0) return `${hour}시간`
  return `${hour}시간 ${minute}분`
}

function toKstHourMinute(iso: string | null | undefined) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0')
  return (hour * 60) + minute
}

function parseTimeToMinutes(value: string | null | undefined) {
  const [hourRaw, minuteRaw] = String(value || '').split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return (hour * 60) + minute
}

export function normalizeAttendanceSettings(input?: Partial<AttendanceSettings> | null): AttendanceSettings {
  return {
    ...DEFAULT_ATTENDANCE_SETTINGS,
    ...(input || {}),
    work_start_time: String(input?.work_start_time || DEFAULT_ATTENDANCE_SETTINGS.work_start_time),
    work_end_time: String(input?.work_end_time || DEFAULT_ATTENDANCE_SETTINGS.work_end_time),
    late_grace_minutes: Number(input?.late_grace_minutes ?? DEFAULT_ATTENDANCE_SETTINGS.late_grace_minutes),
    early_leave_grace_minutes: Number(input?.early_leave_grace_minutes ?? DEFAULT_ATTENDANCE_SETTINGS.early_leave_grace_minutes),
    lunch_break_minutes: Number(input?.lunch_break_minutes ?? DEFAULT_ATTENDANCE_SETTINGS.lunch_break_minutes),
    standard_work_minutes: Number(input?.standard_work_minutes ?? DEFAULT_ATTENDANCE_SETTINGS.standard_work_minutes),
  }
}

export function getLeaveTypeLabel(type: LeaveType) {
  if (type === 'annual') return '연차'
  if (type === 'half_am') return '오전 반차'
  if (type === 'half_pm') return '오후 반차'
  if (type === 'sick') return '병가'
  if (type === 'official') return '공가'
  return '기타'
}

export function getLeaveStatusLabel(status: LeaveStatus) {
  if (status === 'approved') return '승인'
  if (status === 'rejected') return '반려'
  return '대기'
}

export function getLeaveStatusClass(status: LeaveStatus) {
  if (status === 'approved') return 'status-done'
  if (status === 'rejected') return 'status-empty'
  return 'status-working'
}

export function createLeaveDateMap(leaves: LeaveRequest[]) {
  const map = new Map<string, LeaveRequest>()
  for (const leave of leaves) {
    if (leave.status !== 'approved') continue
    for (const date of expandDateRange(leave.start_date, leave.end_date)) {
      map.set(date, leave)
    }
  }
  return map
}

export function computeAttendanceStatus(params: {
  workDate: string
  checkInAt?: string | null
  checkOutAt?: string | null
  settings?: Partial<AttendanceSettings> | null
  approvedLeave?: LeaveRequest | null
  todayDate?: string
}) : AttendanceStatusResult {
  const settings = normalizeAttendanceSettings(params.settings)
  const todayDate = params.todayDate || getKstDateKey()
  const leave = params.approvedLeave

  if (leave?.leave_type === 'annual') {
    return { code: 'annual_leave', label: '연차', className: 'status-leave' }
  }
  if (leave?.leave_type === 'half_am') {
    return { code: 'half_am_leave', label: '오전 반차', className: 'status-leave' }
  }
  if (leave?.leave_type === 'half_pm') {
    return { code: 'half_pm_leave', label: '오후 반차', className: 'status-leave' }
  }
  if (leave?.leave_type === 'sick') {
    return { code: 'sick_leave', label: '병가', className: 'status-leave' }
  }
  if (leave?.leave_type === 'official') {
    return { code: 'official_leave', label: '공가', className: 'status-leave' }
  }
  if (leave?.leave_type === 'other') {
    return { code: 'other_leave', label: '기타', className: 'status-leave' }
  }

  if (!params.checkInAt) {
    if (params.workDate < todayDate) {
      return { code: 'absent', label: '결근', className: 'status-absent' }
    }
    return { code: 'not_started', label: '미출근', className: 'status-empty' }
  }

  const checkInMinutes = toKstHourMinute(params.checkInAt)
  const checkOutMinutes = toKstHourMinute(params.checkOutAt)
  const workStartMinutes = parseTimeToMinutes(settings.work_start_time)
  const workEndMinutes = parseTimeToMinutes(settings.work_end_time)
  const lateThreshold = (workStartMinutes ?? 0) + settings.late_grace_minutes
  const earlyLeaveThreshold = (workEndMinutes ?? 0) - settings.early_leave_grace_minutes

  const isLate = Number.isFinite(checkInMinutes) && Number.isFinite(lateThreshold)
    ? (checkInMinutes as number) > lateThreshold
    : false

  const isEarlyLeave = params.checkOutAt
    && Number.isFinite(checkOutMinutes)
    && Number.isFinite(workEndMinutes)
    ? (checkOutMinutes as number) <= earlyLeaveThreshold
    : false

  if (!params.checkOutAt) {
    if (isLate) return { code: 'late', label: '지각', className: 'status-late' }
    return { code: 'working', label: '근무중', className: 'status-working' }
  }

  if (isLate && isEarlyLeave) {
    return { code: 'late_early', label: '지각/조퇴', className: 'status-warning' }
  }
  if (isLate) {
    return { code: 'late', label: '지각', className: 'status-late' }
  }
  if (isEarlyLeave) {
    return { code: 'early_leave', label: '조퇴', className: 'status-warning' }
  }
  return { code: 'done', label: '정상', className: 'status-done' }
}

export function useAttendance() {
  return {
    DEFAULT_ATTENDANCE_SETTINGS,
    getKstDateKey,
    getKstMonthKey,
    getMonthRange,
    formatDate,
    formatDateTime,
    formatTime,
    toDateTimeLocalValue,
    parseDateTimeLocalToIso,
    calcWorkMinutes,
    calcWorkSessionMinutes,
    formatWorkDuration,
    normalizeAttendanceSettings,
    getLeaveTypeLabel,
    getLeaveStatusLabel,
    getLeaveStatusClass,
    createLeaveDateMap,
    computeAttendanceStatus,
  }
}
