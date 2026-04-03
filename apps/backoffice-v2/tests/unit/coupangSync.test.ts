import { describe, expect, it } from 'vitest'

import {
  buildCoupangCommerceProductMappingLookupFromRows,
  buildCoupangProductLookupFromRows,
  buildCoupangMarketplaceRawLineRows,
  buildCoupangMarketplaceSourceLineId,
  buildCoupangRocketGrowthRawLineRows,
  buildCoupangRocketGrowthSourceLineId,
  buildCoupangSourceLineId,
  isEligibleCoupangOrderLine,
  normalizeCoupangShipmentBoxId,
  normalizeCoupangSourceOrderId,
  normalizeCoupangSourceProductId,
  resolveCoupangSyncRecord,
} from '../../server/utils/commerce/coupang-sync'

describe('coupang sync helpers', () => {
  it('builds marketplace source line ids from shipmentBoxId and vendorItemId', () => {
    expect(buildCoupangMarketplaceSourceLineId({
      shipmentBoxId: 649209749225578,
      vendorItemId: 91677910749,
    })).toBe('marketplace:649209749225578:91677910749:0')
  })

  it('builds rocket growth source line ids from orderId and vendorItemId', () => {
    expect(buildCoupangRocketGrowthSourceLineId({
      orderId: 31100162748800,
      vendorItemId: 94132809744,
      itemIndex: 2,
    })).toBe('rocket_growth:31100162748800:94132809744:2')
  })

  it('dispatches generic source line ids by fulfillment type', () => {
    expect(buildCoupangSourceLineId({
      sourceFulfillmentType: 'marketplace',
      shipmentBoxId: '649209749225578',
      vendorItemId: '91677910749',
      itemIndex: 1,
    })).toBe('marketplace:649209749225578:91677910749:1')

    expect(buildCoupangSourceLineId({
      sourceFulfillmentType: 'rocket_growth',
      orderId: '31100162748800',
      vendorItemId: '94132809744',
    })).toBe('rocket_growth:31100162748800:94132809744:0')
  })

  it('normalizes optional coupang ids', () => {
    expect(normalizeCoupangSourceOrderId(' 16100168810616 ')).toBe('16100168810616')
    expect(normalizeCoupangShipmentBoxId(' 649209749225578 ')).toBe('649209749225578')
    expect(normalizeCoupangSourceProductId(' 91677910749 ')).toBe('91677910749')
    expect(normalizeCoupangSourceOrderId('')).toBeNull()
  })

  it('builds marketplace raw line rows with shipment-based source line ids', () => {
    const rows = buildCoupangMarketplaceRawLineRows({
      sourceAccountKey: 'default',
      order: {
        orderId: '16100168810616',
        shipmentBoxId: '649209749225578',
        orderedAt: '2026-02-15T10:01:02+09:00',
        paidAt: '2026-02-15T10:05:00+09:00',
        status: 'FINAL_DELIVERY',
        orderer: { name: '홍길동', safeNumber: '0500-0000-0001' },
        receiver: { name: '김집사', safeNumber: '0500-0000-0002', addr1: '서울시 강남구', addr2: '101호' },
        orderItems: [
          {
            vendorItemId: '91677910749',
            sellerProductId: '15315492396',
            sellerProductName: '애착트릿 3종',
            sellerProductItemName: '단일상품',
            shippingCount: 2,
          },
        ],
      },
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      source_channel: 'coupang',
      source_fulfillment_type: 'marketplace',
      source_line_id: 'marketplace:649209749225578:91677910749:0',
      source_order_id: '16100168810616',
      source_product_id: '91677910749',
      source_option_code: null,
      product_name: '애착트릿 3종',
      product_option: '단일상품',
      buyer_name: '홍길동',
      receiver_name: '김집사',
      quantity: 2,
      product_order_status: 'FINAL_DELIVERY',
    })
  })

  it('builds rocket growth raw line rows with order-based source line ids', () => {
    const rows = buildCoupangRocketGrowthRawLineRows({
      sourceAccountKey: 'default',
      order: {
        orderId: '31100162748800',
        paidAt: '2026-01-09T01:23:45.000Z',
        orderItems: [
          {
            vendorItemId: '94132809744',
            productName: '굿포펫 엔자이츄 1개 꿀고구마맛 100g',
            salesQuantity: 1,
          },
        ],
      },
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      source_channel: 'coupang',
      source_fulfillment_type: 'rocket_growth',
      source_line_id: 'rocket_growth:31100162748800:94132809744:0',
      source_order_id: '31100162748800',
      source_product_id: '94132809744',
      product_name: '굿포펫 엔자이츄 1개 꿀고구마맛 100g',
      quantity: 1,
    })
    expect(rows[0].buyer_name).toBeNull()
  })

  it('rejects missing ids or unsupported fulfillment types', () => {
    expect(() => buildCoupangMarketplaceSourceLineId({
      shipmentBoxId: null,
      vendorItemId: 91677910749,
    })).toThrow('shipmentBoxId is required')

    expect(() => buildCoupangRocketGrowthSourceLineId({
      orderId: 31100162748800,
      vendorItemId: null,
    })).toThrow('vendorItemId is required')

    expect(() => buildCoupangSourceLineId({
      sourceFulfillmentType: 'default',
      orderId: '31100162748800',
      vendorItemId: '94132809744',
    })).toThrow('Unsupported Coupang fulfillment type')
  })

  it('projects marketplace raw lines into purchases with fulfillment-aware product mapping', () => {
    const rawLine = buildCoupangMarketplaceRawLineRows({
      sourceAccountKey: 'default',
      order: {
        orderId: '16100168810616',
        shipmentBoxId: '649209749225578',
        orderedAt: '2026-02-15T10:01:02+09:00',
        paidAt: '2026-02-15T10:05:00+09:00',
        status: 'FINAL_DELIVERY',
        orderer: { name: '홍길동', safeNumber: '0500-0000-0001' },
        receiver: { name: '김집사', safeNumber: '0500-0000-0002', addr1: '서울시 강남구', addr2: '101호' },
        orderItems: [
          {
            vendorItemId: '91677910749',
            sellerProductName: '애착트릿 3종',
            sellerProductItemName: '단일상품',
            shippingCount: 2,
          },
        ],
      },
    })[0]

    const productLookup = buildCoupangProductLookupFromRows([
      { product_id: 'goodforpet-001', product_name: '애착트릿', option_name: '3종세트' },
    ])
    const productMappingLookup = buildCoupangCommerceProductMappingLookupFromRows([
      {
        id: 1,
        source_channel: 'coupang',
        source_fulfillment_type: 'marketplace',
        source_account_key: 'default',
        commerce_product_id: '91677910749',
        commerce_option_code: '',
        commerce_product_name: '애착트릿 3종',
        commerce_option_name: '단일상품',
        internal_product_id: 'goodforpet-001',
        matching_mode: 'product_id_only',
        canonical_variant: '3종세트',
        rule_json: null,
        priority: 1,
        is_active: true,
      },
    ])

    const resolved = resolveCoupangSyncRecord({
      rawLine,
      productLookup,
      productMappingLookup,
      runId: '00000000-0000-0000-0000-000000000001',
    })

    expect(resolved.eligible).toBe(true)
    expect(resolved.purchase).toMatchObject({
      purchase_id: 'marketplace:649209749225578:91677910749:0',
      product_id: 'goodforpet-001',
      product_name: '애착트릿',
      option_info: '3종세트',
      source_fulfillment_type: 'marketplace',
      quantity: 2,
      order_status: 'FINAL_DELIVERY',
    })
    expect(resolved.purchase?.buyer_id).toContain('coupang:marketplace:default')
  })

  it('projects rocket growth raw lines with fallback product lookup and synthetic customer identity', () => {
    const rawLine = buildCoupangRocketGrowthRawLineRows({
      sourceAccountKey: 'default',
      order: {
        orderId: '31100162748800',
        paidAt: '2026-01-09T01:23:45.000Z',
        orderItems: [
          {
            vendorItemId: '94132809744',
            productName: '굿포펫 엔자이츄 1개 꿀고구마맛 100g',
            salesQuantity: 1,
          },
        ],
      },
    })[0]

    const productLookup = buildCoupangProductLookupFromRows([
      { product_id: 'goodforpet-002', product_name: '엔자이츄', option_name: null },
    ])

    const resolved = resolveCoupangSyncRecord({
      rawLine,
      productLookup,
      productMappingLookup: buildCoupangCommerceProductMappingLookupFromRows([]),
      runId: '00000000-0000-0000-0000-000000000002',
    })

    expect(resolved.purchase).toMatchObject({
      product_id: 'goodforpet-002',
      product_name: '엔자이츄',
      source_fulfillment_type: 'rocket_growth',
      order_status: 'PAID',
    })
    expect(resolved.purchase?.buyer_id).toContain('coupang:rocket_growth:default:order')
  })

  it('treats active coupang claims as ineligible until they are rejected or withdrawn', () => {
    expect(isEligibleCoupangOrderLine({
      sourceFulfillmentType: 'marketplace',
      orderStatus: 'FINAL_DELIVERY',
      claimStatus: 'CANCEL_REQUESTED',
    })).toEqual({
      eligible: false,
      reason: 'excluded claim status: CANCEL_REQUESTED',
    })

    expect(isEligibleCoupangOrderLine({
      sourceFulfillmentType: 'marketplace',
      orderStatus: 'FINAL_DELIVERY',
      claimStatus: 'CANCEL_REJECT',
    })).toEqual({
      eligible: true,
      reason: 'included claim status: CANCEL_REJECT',
    })
  })
})
