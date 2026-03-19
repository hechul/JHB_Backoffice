import { describe, expect, it } from 'vitest'
import {
  computeTrendGrowthRates,
  formatTrendGrowthRate,
  trendGrowthVariant,
} from '../../app/composables/useTrendGrowth'

describe('useTrendGrowth', () => {
  it('computes period-over-period growth rates', () => {
    expect(computeTrendGrowthRates([10, 15, 12, 12])).toEqual([null, 50, -20, 0])
  })

  it('returns null when previous value is zero or missing', () => {
    expect(computeTrendGrowthRates([0, 12, 6])).toEqual([null, null, -50])
  })

  it('formats growth labels and variants', () => {
    expect(formatTrendGrowthRate(12.34)).toBe('+12.3%')
    expect(formatTrendGrowthRate(-5)).toBe('-5.0%')
    expect(formatTrendGrowthRate(null)).toBe('비교 기준 없음')
    expect(trendGrowthVariant(3)).toBe('success')
    expect(trendGrowthVariant(-1)).toBe('danger')
    expect(trendGrowthVariant(null)).toBe('neutral')
  })
})
