export type ChurnStatusCode = 'Risk' | 'Normal' | 'Excluded'

export interface ChurnRiskInput {
  orderDate: string
  expectedConsumptionDays: number | null | undefined
}

export interface ChurnRiskAssessment {
  status: ChurnStatusCode
  churnRisk: boolean
  evaluable: boolean
  lastOrderDate: string
  daysSinceLastOrder: number
  expectedConsumptionDays: number | null
  overdueDays: number | null
}

function parseDateValue(value: string | Date): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const cloned = new Date(value)
    cloned.setHours(0, 0, 0, 0)
    return cloned
  }

  const raw = String(value || '').trim()
  if (!raw) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function normalizeExpectedConsumptionDays(value: unknown): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric <= 0) return null
  return Math.round(numeric)
}

export function churnStatusLabel(status: ChurnStatusCode | string | null | undefined): string {
  if (status === 'Risk') return '위험'
  if (status === 'Normal') return '정상'
  return '판단 제외'
}

export function churnStatusBadgeVariant(status: ChurnStatusCode | string | null | undefined): 'danger' | 'success' | 'neutral' {
  if (status === 'Risk') return 'danger'
  if (status === 'Normal') return 'success'
  return 'neutral'
}

export function computeChurnRisk(
  rows: ChurnRiskInput[],
  referenceDate: string | Date = new Date(),
): ChurnRiskAssessment {
  const reference = parseDateValue(referenceDate)
  if (!reference || rows.length === 0) {
    return {
      status: 'Excluded',
      churnRisk: false,
      evaluable: false,
      lastOrderDate: '',
      daysSinceLastOrder: 0,
      expectedConsumptionDays: null,
      overdueDays: null,
    }
  }

  const datedRows = rows
    .map((row) => {
      const parsed = parseDateValue(row.orderDate)
      if (!parsed) return null
      return {
        date: parsed,
        dateKey: toDateKey(parsed),
        expectedConsumptionDays: normalizeExpectedConsumptionDays(row.expectedConsumptionDays),
      }
    })
    .filter(Boolean) as Array<{ date: Date; dateKey: string; expectedConsumptionDays: number | null }>

  if (datedRows.length === 0) {
    return {
      status: 'Excluded',
      churnRisk: false,
      evaluable: false,
      lastOrderDate: '',
      daysSinceLastOrder: 0,
      expectedConsumptionDays: null,
      overdueDays: null,
    }
  }

  const lastDate = datedRows.reduce((latest, row) => row.date > latest ? row.date : latest, datedRows[0].date)
  const lastOrderDate = toDateKey(lastDate)
  const daysSinceLastOrder = Math.floor((reference.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
  const expectedConsumptionDays = datedRows
    .filter((row) => row.dateKey === lastOrderDate)
    .reduce<number | null>((max, row) => {
      if (row.expectedConsumptionDays === null) return max
      if (max === null || row.expectedConsumptionDays > max) return row.expectedConsumptionDays
      return max
    }, null)

  if (expectedConsumptionDays === null) {
    return {
      status: 'Excluded',
      churnRisk: false,
      evaluable: false,
      lastOrderDate,
      daysSinceLastOrder,
      expectedConsumptionDays: null,
      overdueDays: null,
    }
  }

  const overdueDays = daysSinceLastOrder - expectedConsumptionDays
  const churnRisk = overdueDays > 0

  return {
    status: churnRisk ? 'Risk' : 'Normal',
    churnRisk,
    evaluable: true,
    lastOrderDate,
    daysSinceLastOrder,
    expectedConsumptionDays,
    overdueDays,
  }
}
