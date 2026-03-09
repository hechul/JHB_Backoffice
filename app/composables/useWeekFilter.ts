export interface WeekOption {
  value: string
  label: string
}

function daysInMonth(monthToken: string): number {
  const [year, month] = String(monthToken || '').split('-').map((part) => Number(part))
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 0
  return new Date(year, month, 0).getDate()
}

export function buildWeekOptions(monthToken: string): WeekOption[] {
  const totalDays = daysInMonth(monthToken)
  if (!totalDays) return []

  const totalWeeks = Math.ceil(totalDays / 7)
  return Array.from({ length: totalWeeks }, (_, index) => {
    const weekNumber = index + 1
    const startDay = index * 7 + 1
    const endDay = Math.min(totalDays, startDay + 6)
    return {
      value: `W${weekNumber}`,
      label: `${weekNumber}주차 (${startDay}~${endDay}일)`,
    }
  })
}

export function weekCodeFromDate(dateValue: string): string {
  const dateToken = String(dateValue || '').slice(0, 10)
  const day = Number(dateToken.slice(8, 10))
  if (!Number.isFinite(day) || day <= 0) return ''
  return `W${Math.floor((day - 1) / 7) + 1}`
}

export function weekLabelFromCode(monthToken: string, weekCode: string): string {
  if (!weekCode) return ''
  return buildWeekOptions(monthToken).find((option) => option.value === weekCode)?.label || weekCode
}

