import { describe, expect, it } from 'vitest'
import {
  computeChurnRisk,
  churnStatusBadgeVariant,
  churnStatusLabel,
  normalizeExpectedConsumptionDays,
} from '../../app/composables/useChurnRisk'

describe('useChurnRisk', () => {
  it('marks customer as risk when last order exceeds expected consumption days', () => {
    const result = computeChurnRisk([
      { orderDate: '2026-01-01', expectedConsumptionDays: 30 },
    ], '2026-02-05')

    expect(result.status).toBe('Risk')
    expect(result.churnRisk).toBe(true)
    expect(result.expectedConsumptionDays).toBe(30)
    expect(result.overdueDays).toBe(5)
  })

  it('marks customer as normal when still within expected consumption days', () => {
    const result = computeChurnRisk([
      { orderDate: '2026-02-10', expectedConsumptionDays: 30 },
    ], '2026-03-05')

    expect(result.status).toBe('Normal')
    expect(result.churnRisk).toBe(false)
    expect(result.overdueDays).toBeLessThanOrEqual(0)
  })

  it('uses the longest expected consumption days for products bought on the same last order date', () => {
    const result = computeChurnRisk([
      { orderDate: '2026-02-01', expectedConsumptionDays: 20 },
      { orderDate: '2026-03-01', expectedConsumptionDays: 30 },
      { orderDate: '2026-03-01', expectedConsumptionDays: 45 },
    ], '2026-04-10')

    expect(result.lastOrderDate).toBe('2026-03-01')
    expect(result.expectedConsumptionDays).toBe(45)
    expect(result.status).toBe('Normal')
  })

  it('excludes customer when last purchase date has no expected consumption days', () => {
    const result = computeChurnRisk([
      { orderDate: '2026-01-10', expectedConsumptionDays: 30 },
      { orderDate: '2026-02-15', expectedConsumptionDays: null },
    ], '2026-04-01')

    expect(result.status).toBe('Excluded')
    expect(result.evaluable).toBe(false)
    expect(result.expectedConsumptionDays).toBeNull()
  })

  it('provides user-facing labels for statuses', () => {
    expect(churnStatusLabel('Risk')).toBe('위험')
    expect(churnStatusLabel('Normal')).toBe('정상')
    expect(churnStatusLabel('Excluded')).toBe('판단 제외')
    expect(churnStatusBadgeVariant('Risk')).toBe('danger')
    expect(churnStatusBadgeVariant('Normal')).toBe('success')
    expect(churnStatusBadgeVariant('Excluded')).toBe('neutral')
  })

  it('keeps null and zero expected consumption days excluded', () => {
    expect(normalizeExpectedConsumptionDays(null)).toBeNull()
    expect(normalizeExpectedConsumptionDays(undefined)).toBeNull()
    expect(normalizeExpectedConsumptionDays(0)).toBeNull()
    expect(normalizeExpectedConsumptionDays('0')).toBeNull()
    expect(normalizeExpectedConsumptionDays(14.4)).toBe(14)
  })
})
