import { describe, expect, it } from 'vitest'

import {
  buildMarketplaceOrderIdentityKey,
  buildMarketplaceClaimLookup,
  buildMarketplaceShipmentHistoryLookup,
  buildMarketplaceSignalMatchKeys,
  buildRocketGrowthOrderIdentityKey,
  buildCoupangAuthorizationHeader,
  buildCoupangConfig,
  buildSelectedFulfillmentTypes,
  computeRetryDelayMs,
  countUniqueCoupangOrders,
  dedupeCoupangRawLineRows,
  describeCoupangDateBasis,
  enrichMarketplaceRawLineRows,
  enumerateIsoDateRange,
  extractRetryAfterMs,
  formatCoupangSignedDate,
  parseArgs,
  toMarketplaceClaimDate,
  toMarketplaceDateBoundary,
  toRocketGrowthYmd,
} from '../../scripts/sync-coupang-orders.mjs'

describe('sync-coupang-orders helpers', () => {
  it('parses fulfillment type and dry-run controls', () => {
    const args = parseArgs([
      '--from=2026-03-01',
      '--to=2026-03-31',
      '--fulfillment-type=rocket_growth',
      '--max-per-page=25',
      '--dry-run',
    ])

    expect(args.dryRun).toBe(true)
    expect(args.fulfillmentType).toBe('rocket_growth')
    expect(args.maxPerPage).toBe(25)
  })

  it('parses request pacing controls', () => {
    const args = parseArgs([
      '--from=2026-03-01',
      '--to=2026-03-31',
      '--request-interval-ms=1500',
      '--max-retries=4',
      '--retry-base-delay-ms=12000',
    ])

    expect(args.requestIntervalMs).toBe(1500)
    expect(args.maxRetries).toBe(4)
    expect(args.retryBaseDelayMs).toBe(12000)
  })

  it('builds selected fulfillment type arrays', () => {
    expect(buildSelectedFulfillmentTypes('all')).toEqual(['marketplace', 'rocket_growth'])
    expect(buildSelectedFulfillmentTypes('marketplace')).toEqual(['marketplace'])
  })

  it('builds a Coupang config from env', () => {
    expect(buildCoupangConfig({
      COUPANG_VENDOR_ID: 'A01290355',
      COUPANG_ACCESS_KEY: 'access-key',
      COUPANG_SECRET_KEY: 'secret-key',
      COUPANG_REQUEST_INTERVAL_MS: '900',
      COUPANG_MAX_RETRIES: '3',
      COUPANG_RETRY_BASE_DELAY_MS: '12000',
    })).toMatchObject({
      vendorId: 'A01290355',
      accessKey: 'access-key',
      secretKey: 'secret-key',
      requestIntervalMs: 900,
      maxRetries: 3,
      retryBaseDelayMs: 12000,
    })
  })

  it('formats signed dates and HMAC authorization headers deterministically', () => {
    const signedDate = formatCoupangSignedDate(new Date('2026-03-31T01:02:03.000Z'))
    expect(signedDate).toBe('260331T010203Z')

    const header = buildCoupangAuthorizationHeader({
      accessKey: 'access-key',
      secretKey: 'secret-key',
      method: 'GET',
      path: '/v2/providers/openapi/apis/api/v5/vendors/A01290355/ordersheets',
      query: 'createdAtFrom=2026-03-01%2B09%3A00',
      signedDate,
    })

    expect(header).toContain('CEA algorithm=HmacSHA256')
    expect(header).toContain('access-key=access-key')
    expect(header).toContain(`signed-date=${signedDate}`)
    expect(header).toContain('signature=')
  })

  it('converts yyyy-mm-dd into rocket growth yyyymmdd format', () => {
    expect(toRocketGrowthYmd('2026-03-31')).toBe('20260331')
  })

  it('builds full-day marketplace datetime boundaries', () => {
    expect(toMarketplaceDateBoundary('2026-03-31', 'start')).toBe('2026-03-31+09:00')
    expect(toMarketplaceDateBoundary('2026-03-31', 'end')).toBe('2026-03-31+09:00')
  })

  it('builds marketplace claim dates as yyyy-mm-dd', () => {
    expect(toMarketplaceClaimDate('2026-03-31')).toBe('2026-03-31')
  })

  it('enumerates inclusive ISO date ranges day by day', () => {
    expect(enumerateIsoDateRange('2026-03-29', '2026-03-31')).toEqual([
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
    ])
  })

  it('dedupes raw line rows by source_line_id', () => {
    expect(dedupeCoupangRawLineRows([
      { source_line_id: 'a', quantity: 1 },
      { source_line_id: 'a', quantity: 2 },
      { source_line_id: 'b', quantity: 3 },
    ])).toEqual([
      { source_line_id: 'a', quantity: 2 },
      { source_line_id: 'b', quantity: 3 },
    ])
  })

  it('describes date basis labels by fulfillment type', () => {
    expect(describeCoupangDateBasis('marketplace')).toEqual({
      key: 'created_at',
      label: '주문생성일(createdAt)',
    })
    expect(describeCoupangDateBasis('rocket_growth')).toEqual({
      key: 'paid_at',
      label: '결제일(paidAt)',
    })
  })

  it('builds stable order identity keys for marketplace and rocket growth', () => {
    expect(buildMarketplaceOrderIdentityKey({ shipmentBoxId: '649209749225578' })).toBe('marketplace:shipment_box:649209749225578')
    expect(buildMarketplaceOrderIdentityKey({ orderId: '16100168810616' })).toBe('marketplace:order:16100168810616')
    expect(buildRocketGrowthOrderIdentityKey({ orderId: '31100162748800' })).toBe('rocket_growth:order:31100162748800')
  })

  it('builds signal match keys from shipment/order and vendor item ids', () => {
    expect(buildMarketplaceSignalMatchKeys({
      shipmentBoxId: '649209749225578',
      orderId: '16100168810616',
      vendorItemId: '91677910749',
    })).toEqual([
      'shipment:649209749225578:91677910749',
      'order:16100168810616:91677910749',
    ])
  })

  it('enriches marketplace raw rows with claim status and delivery history events', () => {
    const enriched = enrichMarketplaceRawLineRows({
      rawLineRows: [{
        source_channel: 'coupang',
        source_fulfillment_type: 'marketplace',
        source_account_key: 'default',
        source_line_id: 'marketplace:649209749225578:91677910749:0',
        source_order_id: '16100168810616',
        source_product_id: '91677910749',
        source_option_code: null,
        product_name: '애착트릿 3종',
        product_option: '단일상품',
        buyer_id: null,
        buyer_name: '홍길동',
        receiver_name: '김집사',
        receiver_phone_masked: '0500-0000-0002',
        receiver_base_address: '서울시 강남구',
        receiver_detail_address: '101호',
        quantity: 1,
        product_order_status: 'FINAL_DELIVERY',
        claim_status: null,
        order_date: '2026-02-15T01:01:02.000Z',
        payment_date: '2026-02-15T01:05:00.000Z',
        decision_date: null,
        invoice_number: null,
        last_event_type: null,
        last_event_at: null,
        raw_json: {
          order: {
            orderId: '16100168810616',
            shipmentBoxId: '649209749225578',
          },
          item: {
            vendorItemId: '91677910749',
          },
        },
      }],
      claimRequests: [{
        orderId: '16100168810616',
        shipmentBoxId: '649209749225578',
        vendorItemId: '91677910749',
        receiptType: 'CANCEL',
        receiptStatus: 'CANCEL_REQUESTED',
        createdAt: '2026-02-16T02:00:00.000Z',
        modifiedAt: '2026-02-16T02:30:00.000Z',
      }],
      shipmentHistoryEntries: [[
        '649209749225578',
        [
          {
            deliveryStatus: 'FINAL_DELIVERY',
            deliveryStatusDesc: '배송완료',
            updatedAt: '2026-02-17T05:00:00.000Z',
          },
        ],
      ]],
      runId: '00000000-0000-0000-0000-000000000001',
      sourceAccountKey: 'default',
    })

    expect(enriched.rawLineRows[0]).toMatchObject({
      claim_status: 'CANCEL_REQUESTED',
      last_event_type: 'FINAL_DELIVERY',
      last_event_at: '2026-02-17T05:00:00.000Z',
    })
    expect(enriched.eventRows).toHaveLength(2)
  })

  it('keeps latest claim and sorted shipment histories in dedicated lookups', () => {
    const claimLookup = buildMarketplaceClaimLookup([
      {
        orderId: 'order-1',
        vendorItemId: 'item-1',
        receiptStatus: 'CANCEL_REQUESTED',
        createdAt: '2026-02-16T01:00:00.000Z',
      },
      {
        orderId: 'order-1',
        vendorItemId: 'item-1',
        receiptStatus: 'CANCEL_REJECT',
        modifiedAt: '2026-02-16T03:00:00.000Z',
      },
    ])
    const shipmentLookup = buildMarketplaceShipmentHistoryLookup([
      ['box-1', [
        { deliveryStatus: 'DELIVERING', updatedAt: '2026-02-16T01:00:00.000Z' },
        { deliveryStatus: 'FINAL_DELIVERY', updatedAt: '2026-02-16T05:00:00.000Z' },
      ]],
    ])

    expect(claimLookup.get('order:order-1:item-1')?.receiptStatus).toBe('CANCEL_REJECT')
    expect(shipmentLookup.get('box-1')?.[1]?.deliveryStatus).toBe('FINAL_DELIVERY')
  })

  it('counts unique orders by fulfillment identity instead of raw response rows', () => {
    expect(countUniqueCoupangOrders([
      { shipmentBoxId: 'box-1', orderId: 'order-1' },
      { shipmentBoxId: 'box-1', orderId: 'order-1' },
      { shipmentBoxId: 'box-2', orderId: 'order-1' },
    ], 'marketplace')).toBe(2)

    expect(countUniqueCoupangOrders([
      { orderId: 'rg-1' },
      { orderId: 'rg-1' },
      { orderId: 'rg-2' },
    ], 'rocket_growth')).toBe(2)
  })

  it('reads retry-after seconds header', () => {
    const response = new Response(null, {
      status: 429,
      headers: {
        'retry-after': '7',
      },
    })

    expect(extractRetryAfterMs(response)).toBe(7000)
  })

  it('computes conservative retry delays for 429 without retry-after', () => {
    const response = new Response(null, { status: 429, statusText: 'Too Many Requests' })
    expect(computeRetryDelayMs(response, 0, { retryBaseDelayMs: 12000 })).toBe(12000)
    expect(computeRetryDelayMs(response, 1, { retryBaseDelayMs: 12000 })).toBe(24000)
  })
})
