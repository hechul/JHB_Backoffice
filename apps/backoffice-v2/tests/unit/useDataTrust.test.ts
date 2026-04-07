import { describe, expect, it } from 'vitest'

import {
  buildDataTrustSummary,
  resolveCoverageLabel,
  resolveCoverageVariant,
  resolveDataTrustBasisLabel,
  resolveDataTrustScopeLabel,
  resolveEffectiveDataTrustMonth,
} from '../../app/composables/useDataTrust'

describe('useDataTrust', () => {
  it('picks the latest month with data when all is selected', () => {
    expect(resolveEffectiveDataTrustMonth('all', [
      { value: '2026-04', label: '2026년 4월', count: 0 },
      { value: '2026-03', label: '2026년 3월', count: 12 },
    ])).toEqual({
      selectedMonth: 'all',
      resolvedMonth: '2026-03',
      resolvedLabel: '2026년 3월',
      usedFallbackMonth: true,
    })
  })

  it('maps channel scope labels and basis labels safely', () => {
    expect(resolveDataTrustScopeLabel('naver', 'default')).toBe('네이버')
    expect(resolveDataTrustScopeLabel('coupang', 'rocket_growth')).toBe('쿠팡 로켓그로스')
    expect(resolveDataTrustBasisLabel('coupang', 'marketplace')).toBe('주문기준')
    expect(resolveDataTrustBasisLabel('coupang', 'rocket_growth')).toBe('결제기준')
  })

  it('returns coverage states with the configured thresholds', () => {
    expect(resolveCoverageVariant(0, 0)).toBe('neutral')
    expect(resolveCoverageVariant(79, 10)).toBe('danger')
    expect(resolveCoverageVariant(80, 10)).toBe('warning')
    expect(resolveCoverageVariant(98, 10)).toBe('success')
    expect(resolveCoverageLabel(0, 0)).toBe('데이터 없음')
    expect(resolveCoverageLabel(65, 10)).toBe('집계 보류')
    expect(resolveCoverageLabel(92, 10)).toBe('부분 반영')
    expect(resolveCoverageLabel(100, 10)).toBe('신뢰 가능')
  })

  it('builds a blocking summary when payment coverage is incomplete', () => {
    const summary = buildDataTrustSummary(
      [
        {
          purchase_id: 'n1',
          source_channel: 'naver',
          source_fulfillment_type: 'default',
          payment_amount: null,
          expected_settlement_amount: null,
          order_date: '2026-04-01',
          is_fake: false,
          needs_review: false,
          filter_ver: 'api_import_v1',
        },
        {
          purchase_id: 'c1',
          source_channel: 'coupang',
          source_fulfillment_type: 'rocket_growth',
          payment_amount: 12000,
          expected_settlement_amount: null,
          order_date: '2026-04-01',
          is_fake: false,
          needs_review: false,
          filter_ver: 'api_import_v1',
        },
      ],
      [
        {
          source_channel: 'naver',
          source_fulfillment_type: 'default',
          last_success_to: '2026-04-03T05:29:54.000Z',
        },
      ],
      [
        {
          id: 'run-1',
          source_channel: 'naver',
          source_fulfillment_type: 'default',
          status: 'failed',
          requested_from: '2026-04-01T00:00:00.000Z',
          requested_to: '2026-04-03T23:59:59.999Z',
          started_at: '2026-04-03T05:20:00.000Z',
          completed_at: '2026-04-03T05:25:00.000Z',
          error_message: 'IP whitelist required',
        },
      ],
      {
        selectedMonth: '2026-04',
        resolvedMonth: '2026-04',
        resolvedLabel: '2026년 4월',
        usedFallbackMonth: false,
      },
    )

    expect(summary.totalEligibleRows).toBe(2)
    expect(summary.totalPaymentCoverage).toBe(50)
    expect(summary.paymentVariant).toBe('danger')
    expect(summary.blockingMessage).toContain('네이버')
    expect(summary.items[0]).toMatchObject({
      label: '네이버',
      paymentCoverage: 0,
      coverageVariant: 'danger',
      latestRunStatusLabel: '동기화 실패',
    })
  })
})
