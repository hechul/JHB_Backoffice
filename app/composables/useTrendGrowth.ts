export type TrendGrowthRate = number | null

export function computeTrendGrowthRates(values: number[]): TrendGrowthRate[] {
  return values.map((value, index) => {
    if (index === 0) return null
    const previous = Number(values[index - 1] || 0)
    const current = Number(value || 0)
    if (!Number.isFinite(previous) || previous <= 0) return null
    if (!Number.isFinite(current)) return null
    return Math.round((((current - previous) / previous) * 100) * 10) / 10
  })
}

export function formatTrendGrowthRate(rate: TrendGrowthRate, emptyLabel = '비교 기준 없음'): string {
  if (rate === null || !Number.isFinite(rate)) return emptyLabel
  const sign = rate > 0 ? '+' : ''
  return `${sign}${rate.toFixed(1)}%`
}

export function trendGrowthVariant(rate: TrendGrowthRate): 'success' | 'danger' | 'neutral' {
  if (rate === null || !Number.isFinite(rate)) return 'neutral'
  if (rate > 0) return 'success'
  if (rate < 0) return 'danger'
  return 'neutral'
}
