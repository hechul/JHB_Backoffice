import { describe, expect, it } from 'vitest'

import {
  aggregateRevenueEventRowsByOrderItem,
  buildRevenueHistoryEventRows,
  buildRevenueSettlementPatches,
  resolveRevenueRecognitionWindow,
} from '../../scripts/sync-coupang-orders.mjs'

describe('coupang revenue enrichment helpers', () => {
  it('builds revenue events and allocates order-level delivery amounts across matched items', () => {
    const purchaseRows = [
      {
        purchase_id: 'rocket_growth:o1:v1:0',
        source_order_id: 'o1',
        source_product_id: 'v1',
        source_fulfillment_type: 'rocket_growth',
        quantity: 1,
      },
      {
        purchase_id: 'rocket_growth:o1:v2:0',
        source_order_id: 'o1',
        source_product_id: 'v2',
        source_fulfillment_type: 'rocket_growth',
        quantity: 1,
      },
    ]

    const rows = buildRevenueHistoryEventRows({
      accountKey: 'default',
      runId: '00000000-0000-0000-0000-000000000001',
      purchaseRows,
      records: [
        {
          orderId: 'o1',
          saleType: 'SALE',
          saleDate: '2026-03-02',
          recognitionDate: '2026-03-05',
          settlementDate: '2026-03-25',
          deliveryFee: {
            settlementAmount: 2901,
            fee: 90,
            feeVat: 9,
          },
          items: [
            {
              vendorItemId: 'v1',
              saleAmount: 10000,
              settlementAmount: 8812,
              serviceFee: 1080,
              serviceFeeVat: 108,
              quantity: 1,
            },
            {
              vendorItemId: 'v2',
              saleAmount: 5000,
              settlementAmount: 4406,
              serviceFee: 540,
              serviceFeeVat: 54,
              quantity: 1,
            },
          ],
        },
      ],
    })

    expect(rows).toHaveLength(2)

    const first = rows.find((row) => row.extra_flags?.sourceProductId === 'v1')
    const second = rows.find((row) => row.extra_flags?.sourceProductId === 'v2')

    expect(first?.raw_json?.computed).toMatchObject({
      expectedSettlementAmount: 10746,
      commissionAmount: 1254,
    })
    expect(second?.raw_json?.computed).toMatchObject({
      expectedSettlementAmount: 5373,
      commissionAmount: 627,
    })
  })

  it('aggregates sale and refund revenue events into net settlement totals', () => {
    const aggregateMap = aggregateRevenueEventRowsByOrderItem([
      {
        source_order_id: 'o2',
        event_type: 'revenue:SALE',
        extra_flags: { sourceProductId: 'v1' },
        raw_json: {
          computed: {
            expectedSettlementAmount: 10000,
            commissionAmount: 1200,
          },
        },
      },
      {
        source_order_id: 'o2',
        event_type: 'revenue:REFUND',
        extra_flags: { sourceProductId: 'v1' },
        raw_json: {
          computed: {
            expectedSettlementAmount: -2500,
            commissionAmount: -300,
          },
        },
      },
    ])

    expect(aggregateMap.get('o2::v1')).toMatchObject({
      expectedSettlementAmount: 7500,
      commissionAmount: 900,
      rowCount: 2,
    })
  })

  it('allocates aggregated settlement totals across duplicate purchase rows by quantity', () => {
    const patches = buildRevenueSettlementPatches({
      purchaseRows: [
        {
          purchase_id: 'rocket_growth:o3:v1:0',
          source_order_id: 'o3',
          source_product_id: 'v1',
          quantity: 2,
        },
        {
          purchase_id: 'rocket_growth:o3:v1:1',
          source_order_id: 'o3',
          source_product_id: 'v1',
          quantity: 1,
        },
      ],
      aggregateMap: new Map([
        ['o3::v1', {
          expectedSettlementAmount: 15000,
          commissionAmount: 3000,
        }],
      ]),
    })

    expect(patches).toEqual([
      {
        purchase_id: 'rocket_growth:o3:v1:0',
        expected_settlement_amount: 10000,
        payment_commission: 2000,
        sale_commission: 0,
      },
      {
        purchase_id: 'rocket_growth:o3:v1:1',
        expected_settlement_amount: 5000,
        payment_commission: 1000,
        sale_commission: 0,
      },
    ])
  })

  it('clamps the recognition end date to yesterday without expanding narrower historical ranges', () => {
    expect(resolveRevenueRecognitionWindow({
      recognitionFrom: '2026-03-01',
      recognitionTo: '2026-03-31',
    })).toMatchObject({
      recognitionFrom: '2026-03-01',
      recognitionTo: '2026-03-31',
      isEmpty: false,
    })
  })

  it('returns an empty window when the requested range is today only', () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    const isoToday = `${year}-${month}-${day}`

    expect(resolveRevenueRecognitionWindow({
      recognitionFrom: isoToday,
      recognitionTo: isoToday,
    })).toMatchObject({
      recognitionFrom: isoToday,
      isEmpty: true,
    })
  })
})
