export interface WeekOption {
  value: string
  label: string
}

export interface MonthWeekRange extends WeekOption {
  weekNumber: number
  startDate: string
  endDate: string
  allDateTokens: string[]
  inMonthDateTokens: string[]
}

function parseDateToken(dateValue: string): string {
  return String(dateValue || '').slice(0, 10)
}

function parseMonthToken(monthToken: string) {
  const [year, month] = String(monthToken || '').split('-').map((part) => Number(part))
  if (!Number.isFinite(year) || !Number.isFinite(month) || month <= 0) return null
  return { year, month }
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+09:00`)
}

function formatShortDate(dateKey: string) {
  const [, month = '', day = ''] = String(dateKey || '').split('-')
  return `${month}.${day}`
}

function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addWeekDateDays(dateKey: string, days: number) {
  const next = parseDateKey(dateKey)
  next.setDate(next.getDate() + days)
  return toDateKey(next)
}

export function getWeekStart(dateValue: string) {
  const dateKey = parseDateToken(dateValue)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return ''
  const date = parseDateKey(dateKey)
  const shift = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - shift)
  return toDateKey(date)
}

function getWeekOwnerMonthToken(dateValue: string) {
  const weekStart = getWeekStart(dateValue)
  if (!weekStart) return ''
  const thursday = addWeekDateDays(weekStart, 3)
  return thursday.slice(0, 7)
}

function getMonthRange(monthToken: string) {
  const parts = parseMonthToken(monthToken)
  if (!parts) return null
  const { year, month } = parts
  const totalDays = new Date(year, month, 0).getDate()
  return {
    start: `${monthToken}-01`,
    end: `${monthToken}-${String(totalDays).padStart(2, '0')}`,
  }
}

export function getMonthWeekRanges(monthToken: string): MonthWeekRange[] {
  const monthRange = getMonthRange(monthToken)
  if (!monthRange) return []

  const firstWeekStart = getWeekStart(monthRange.start)
  const lastWeekStart = getWeekStart(monthRange.end)
  if (!firstWeekStart || !lastWeekStart) return []

  const ranges: MonthWeekRange[] = []
  for (let cursor = firstWeekStart; cursor <= lastWeekStart; cursor = addWeekDateDays(cursor, 7)) {
    const allDateTokens = Array.from({ length: 7 }, (_, index) => addWeekDateDays(cursor, index))
    const inMonthDateTokens = allDateTokens.filter((token) => token.startsWith(monthToken))
    if (inMonthDateTokens.length < 4) continue

    const weekNumber = ranges.length + 1
    ranges.push({
      value: `W${weekNumber}`,
      label: `${weekNumber}주차 (${formatShortDate(allDateTokens[0])}~${formatShortDate(allDateTokens[6])})`,
      weekNumber,
      startDate: allDateTokens[0],
      endDate: allDateTokens[6],
      allDateTokens,
      inMonthDateTokens,
    })
  }

  return ranges
}

export function buildWeekOptions(monthToken: string): WeekOption[] {
  return getMonthWeekRanges(monthToken).map(({ value, label }) => ({ value, label }))
}

export function weekCodeFromDate(dateValue: string, monthToken?: string): string {
  const dateToken = parseDateToken(dateValue)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateToken)) return ''

  const targetMonth = parseMonthToken(String(monthToken || ''))
    ? String(monthToken)
    : getWeekOwnerMonthToken(dateToken)
  if (!targetMonth) return ''

  return getMonthWeekRanges(targetMonth).find((range) => range.allDateTokens.includes(dateToken))?.value || ''
}

export function weekLabelFromCode(monthToken: string, weekCode: string): string {
  if (!weekCode) return ''
  return getMonthWeekRanges(monthToken).find((option) => option.value === weekCode)?.label || weekCode
}

export function weekDateTokensFromCode(monthToken: string, weekCode: string, mode: 'all' | 'inMonth' = 'inMonth'): string[] {
  if (!weekCode) return []
  const range = getMonthWeekRanges(monthToken).find((option) => option.value === weekCode)
  if (!range) return []
  return mode === 'all' ? [...range.allDateTokens] : [...range.inMonthDateTokens]
}

export function weekStartFromCode(monthToken: string, weekCode: string): string {
  return getMonthWeekRanges(monthToken).find((option) => option.value === weekCode)?.startDate || ''
}
