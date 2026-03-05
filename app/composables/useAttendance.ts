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

export function formatWorkDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '-'
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  if (hour <= 0) return `${minute}분`
  if (minute <= 0) return `${hour}시간`
  return `${hour}시간 ${minute}분`
}

export function useAttendance() {
  return {
    getKstDateKey,
    getKstMonthKey,
    getMonthRange,
    formatDate,
    formatDateTime,
    formatTime,
    toDateTimeLocalValue,
    parseDateTimeLocalToIso,
    calcWorkMinutes,
    formatWorkDuration,
  }
}
