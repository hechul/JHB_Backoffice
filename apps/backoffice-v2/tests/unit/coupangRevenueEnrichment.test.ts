import { describe, expect, it } from 'vitest'

import {
  aggregateRevenueEventRowsByOrderItem,
  buildRevenueHistoryEventRows,
  buildRevenueSettlementPatches,
} from '../../scripts/sync-coupang-orders.mjs'

describe('coupang revenue enrichment helpers', () => {
  it('builds revenue events with item and delivery allocations', () => {
    const purchaseRows = [
      {
        purchase_id: 'marketplace:order-1:item-1:0',
        source_order_id: 'order-1',
        source_product_id: 'item-1',
        source_fulfillment_type: 'marketplace',
        quantity: 1,
      },
      {
        purchase_id: 'marketplace:order-1:item-2:0',
        source_order_id: 'order-1',
        source_product_id: 'item-2',
        source_fulfillment_type: 'marketplace',
        quantity: 1,
      },
    ]

    const eventRows = buildRevenueHistoryEventRows({
      accountKey: 'default',
      runId: '00000000-0000-0000-0000-000000000001',
      purchaseRows,
      records: [
        {
          orderId: 'order-1',
          saleType: 'SALE',
          saleDate: '2026-03-15',
          recognitionDate: '2026-03-18',
          settlementDate: '2026-03-28',
          deliveryFee: {
            settlementAmount: 300,
            fee: 30,
            feeVat: 10,
          },
          items: [
            {
              vendorItemId: 'item-1',
              saleAmount: 1000,
              settlementAmount: 800,
              serviceFee: 100,
              serviceFeeVat: 10,
            },
            {
              vendorItemId: 'item-2',
              saleAmount: 3000,
              settlementAmount: 2400,
              serviceFee: 300,
              serviceFeeVat: 30,
            },
          ],
        },
      ],
    })

    expect(eventRows).toHaveLength(2)

    const aggregateMap = aggregateRevenueEventRowsByOrderItem(eventRows)
    expect(aggregateMap.get('order-1::item-1')).toMatchObject({
      expectedSettlementAmount: 875,
      commissionAmount: 120,
    })
    expect(aggregateMap.get('order-1::item-2')).toMatchObject({
      expectedSettlementAmount: 2625,
      commissionAmount: 360,
    })
  })

  it('splits aggregated settlement and commission across duplicate purchase rows by quantity', () => {
    const patches = buildRevenueSettlementPatches({
      purchaseRows: [
        {
          purchase_id: 'marketplace:order-2:item-3:0',
          source_order_id: 'order-2',
          source_product_id: 'item-3',
          quantity: 1,
        },
        {
          purchase_id: 'marketplace:order-2:item-3:1',
          source_order_id: 'order-2',
          source_product_id: 'item-3',
          quantity: 2,
        },
      ],
      aggregateMap: new Map([
        ['order-2::item-3', {
          orderId: 'order-2',
          sourceProductId: 'item-3',
          expectedSettlementAmount: 300,
          commissionAmount: 60,
          rowCount: 1,
        }],
      ]),
    })

    expect(patches).toEqual([
      {
        purchase_id: 'marketplace:order-2:item-3:0',
        expected_settlement_amount: 100,
        payment_commission: 20,
        sale_commission: 0,
      },
      {
        purchase_id: 'marketplace:order-2:item-3:1',
        expected_settlement_amount: 200,
        payment_commission: 40,
        sale_commission: 0,
      },
    ])
  })
})
