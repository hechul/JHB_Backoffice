import { describe, expect, it } from 'vitest'
import {
  computeCustomerStage,
  computePurchaseIntensity,
  countDistinctPurchaseMonths,
  countRecentPurchaseDays,
  customerStageLabel,
  purchaseIntensityLabel,
} from '../../app/composables/useGrowthStage'

describe('useGrowthStage', () => {
  it('maps customer stage by distinct purchase months', () => {
    expect(computeCustomerStage(0)).toBe('Other')
    expect(computeCustomerStage(1)).toBe('Entry')
    expect(computeCustomerStage(2)).toBe('Entry')
    expect(computeCustomerStage(3)).toBe('Growth')
    expect(computeCustomerStage(5)).toBe('Growth')
    expect(computeCustomerStage(6)).toBe('Premium')
    expect(computeCustomerStage(11)).toBe('Premium')
    expect(computeCustomerStage(12)).toBe('Core')
  })

  it('counts distinct purchase months from duplicate order dates', () => {
    expect(countDistinctPurchaseMonths([
      '2026-01-02',
      '2026-01-28',
      '2026-02-03',
      '2026-03-14',
      '2026-03-18',
    ])).toBe(3)
  })

  it('counts recent purchase days within rolling 90-day window', () => {
    expect(countRecentPurchaseDays([
      '2025-12-31',
      '2026-01-01',
      '2026-01-10',
      '2026-03-19',
      '2026-03-19',
    ], '2026-03-19')).toBe(4)
  })

  it('maps purchase intensity by recent 90-day purchase days', () => {
    expect(computePurchaseIntensity(0)).toBe('Dormant')
    expect(computePurchaseIntensity(1)).toBe('Low')
    expect(computePurchaseIntensity(2)).toBe('Medium')
    expect(computePurchaseIntensity(3)).toBe('High')
    expect(computePurchaseIntensity(4)).toBe('High')
    expect(computePurchaseIntensity(5)).toBe('VeryHigh')
  })

  it('uses updated customer-facing labels', () => {
    expect(customerStageLabel('Entry')).toBe('신규')
    expect(customerStageLabel('Premium')).toBe('단골')
    expect(purchaseIntensityLabel('VeryHigh')).toBe('매우 높음')
  })
})
