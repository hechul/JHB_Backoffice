import { describe, expect, it } from 'vitest'

import {
  buildCommerceProductMappingLookupFromRows,
  buildChangedStatusEventRow,
  buildProductLookupFromRows,
  buildNaverRawLineRow,
  extractNaverChangedStatusItems,
  extractNaverChangedStatusPagination,
  extractNaverProductOrderInfos,
  formatNaverDateTime,
  parseNaverSyncDateTime,
  resolveNaverSyncRecord,
  splitNaverSyncWindows,
  type NaverChangedStatusItem,
  type NaverOrderInfo,
} from '../../server/utils/commerce/naver-sync'

const PRODUCT_ROWS = [
  { product_id: 'P-DISPENSER-BLUE', product_name: '츄르짜개 (고양이 간식 디스펜서)', option_name: '블루' },
  { product_id: 'P-ATTACH-CHICKEN', product_name: '애착트릿', option_name: '치킨' },
  { product_id: 'P-CHURAIT-BRIGHT', product_name: '츄라잇', option_name: '브라이트' },
]

const MAPPING_ROWS = [
  {
    source_channel: 'naver',
    source_fulfillment_type: 'default',
    source_account_key: 'default',
    commerce_product_id: '12668877332',
    commerce_option_code: '',
    commerce_product_name: '츄르짜개',
    commerce_option_name: '블루',
    internal_product_id: 'P-DISPENSER-BLUE',
    matching_mode: 'product_id_option',
    canonical_variant: '블루',
    rule_json: {},
    priority: 10,
    is_active: true,
  },
  {
    source_channel: 'naver',
    source_fulfillment_type: 'default',
    source_account_key: 'default',
    commerce_product_id: '12825547641',
    commerce_option_code: '',
    commerce_product_name: '애착트릿',
    commerce_option_name: '치킨',
    internal_product_id: 'P-ATTACH-CHICKEN',
    matching_mode: 'name_option_rule',
    canonical_variant: '치킨',
    rule_json: {
      variantKeywords: ['치킨', '닭가슴살', '닭고기'],
      preferOptionInfo: true,
    },
    priority: 10,
    is_active: true,
  },
  {
    source_channel: 'naver',
    source_fulfillment_type: 'default',
    source_account_key: 'default',
    commerce_product_id: '12417368947',
    commerce_option_code: '',
    commerce_product_name: '츄라잇',
    commerce_option_name: '브라이트',
    internal_product_id: 'P-CHURAIT-BRIGHT',
    matching_mode: 'product_id_option',
    canonical_variant: '브라이트',
    rule_json: {
      optionKeywords: ['브라이트', '연어'],
    },
    priority: 10,
    is_active: true,
  },
]

describe('naver sync helpers', () => {
  it('splits a multi-day range into 24-hour windows without overlap', () => {
    const from = parseNaverSyncDateTime('2026-03-01', 'start')
    const to = parseNaverSyncDateTime('2026-03-03', 'end')
    const windows = splitNaverSyncWindows(from, to)

    expect(windows).toHaveLength(3)
    expect(windows[0]).toEqual({
      windowFrom: '2026-03-01T00:00:00.000+09:00',
      windowTo: '2026-03-01T23:59:59.999+09:00',
    })
    expect(windows[2]).toEqual({
      windowFrom: '2026-03-03T00:00:00.000+09:00',
      windowTo: '2026-03-03T23:59:59.999+09:00',
    })
  })

  it('extracts changed status rows and pagination from the documented response shape', () => {
    const payload = {
      data: {
        lastChangeStatuses: [
          {
            orderId: '202603230001',
            productOrderId: '20260323000101',
            lastChangedType: 'PAYED',
            lastChangedDate: '2026-03-23T10:00:00.000+09:00',
          },
        ],
        more: {
          moreFrom: '2026-03-23T10:00:00.000+09:00',
          moreSequence: '20260323000101',
        },
      },
    }

    expect(extractNaverChangedStatusItems(payload)).toHaveLength(1)
    expect(extractNaverChangedStatusPagination(payload)).toEqual({
      moreFrom: '2026-03-23T10:00:00.000+09:00',
      moreSequence: '20260323000101',
    })
  })

  it('extracts detailed order infos from the documented response shape', () => {
    const payload = {
      data: [
        {
          order: { orderId: '202603230001' },
          productOrder: { productOrderId: '20260323000101' },
        },
      ],
    }

    expect(extractNaverProductOrderInfos(payload)).toHaveLength(1)
  })

  it('builds raw event and raw line rows from Naver responses', () => {
    const item: NaverChangedStatusItem = {
      orderId: '202603230001',
      productOrderId: '20260323000101',
      lastChangedType: 'PAYED',
      paymentDate: '2026-03-23T09:01:00.000+09:00',
      lastChangedDate: '2026-03-23T09:01:00.000+09:00',
      productOrderStatus: 'PAYED',
    }
    const eventRow = buildChangedStatusEventRow({
      item,
      runId: 'run-1',
      windowId: 10,
      sourceChannel: 'naver',
      sourceAccountKey: 'default',
    })

    expect(eventRow.source_line_id).toBe('20260323000101')
    expect(eventRow.event_type).toBe('PAYED')
    expect(eventRow.source_fulfillment_type).toBe('default')

    const orderInfo: NaverOrderInfo = {
      order: {
        orderId: '202603230001',
        orderDate: '2026-03-23T09:00:00.000+09:00',
        ordererId: 'buyer123',
        ordererName: '홍길동',
        paymentDate: '2026-03-23T09:01:00.000+09:00',
      },
      productOrder: {
        productOrderId: '20260323000101',
        productId: '12668877332',
        optionCode: 'blue',
        productName: '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)',
        productOption: '컬러: 블루',
        productOrderStatus: 'PAYED',
        claimStatus: '',
        quantity: 1,
        shippingAddress: {
          name: '김집사',
          tel1: '010-1234-5678',
          baseAddress: '서울시 강남구',
          detailedAddress: '101호',
        },
      },
      delivery: {
        deliveryMethod: 'DELIVERY',
        trackingNumber: '1111-2222',
      },
    }

    const rawLine = buildNaverRawLineRow({
      orderInfo,
      latestEvent: item,
      sourceChannel: 'naver',
      sourceAccountKey: 'default',
    })

    expect(rawLine.source_product_id).toBe('12668877332')
    expect(rawLine.invoice_number).toBe('1111-2222')
    expect(rawLine.receiver_name).toBe('김집사')
    expect(rawLine.source_fulfillment_type).toBe('default')
  })

  it('projects eligible orders into purchases using the same canonical mapping path as upload', () => {
    const lookup = buildProductLookupFromRows(PRODUCT_ROWS)
    const mappingLookup = buildCommerceProductMappingLookupFromRows(MAPPING_ROWS)
    const orderInfo: NaverOrderInfo = {
      order: {
        orderId: '202603230001',
        orderDate: '2026-03-23T09:00:00.000+09:00',
        ordererId: 'buyer123',
        ordererName: '홍길동',
        paymentDate: '2026-03-23T09:01:00.000+09:00',
      },
      productOrder: {
        productOrderId: '20260323000101',
        productId: '12668877332',
        optionCode: 'blue',
        productName: '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)',
        productOption: '컬러: 블루',
        productOrderStatus: 'PAYED',
        claimStatus: '',
        quantity: 1,
        shippingAddress: {
          name: '김집사',
        },
      },
      delivery: {
        deliveryMethod: 'DELIVERY',
        trackingNumber: '1111-2222',
      },
    }

    const resolved = resolveNaverSyncRecord({
      orderInfo,
      latestEvent: {
        orderId: '202603230001',
        productOrderId: '20260323000101',
        lastChangedType: 'PAYED',
        paymentDate: '2026-03-23T09:01:00.000+09:00',
        lastChangedDate: '2026-03-23T09:01:00.000+09:00',
        productOrderStatus: 'PAYED',
      },
      productLookup: lookup,
      productMappingLookup: mappingLookup,
      runId: 'run-1',
      sourceChannel: 'naver',
      sourceAccountKey: 'default',
    })

    expect(resolved.eligible).toBe(true)
    expect(resolved.purchase).toMatchObject({
      purchase_id: '20260323000101',
      target_month: '2026-03',
      product_id: 'P-DISPENSER-BLUE',
      product_name: '츄르짜개 (고양이 간식 디스펜서)',
      option_info: '블루',
      source_product_id: '12668877332',
      source_channel: 'naver',
      source_fulfillment_type: 'default',
      quantity: 1,
      order_date: '2026-03-23',
      order_status: 'PAYED',
      filter_ver: 'api_import_v1',
    })
    expect(resolved.purchase?.filter_ver).toBe('api_import_v1')
  })

  it('skips ineligible canceled rows from purchase projection', () => {
    const lookup = buildProductLookupFromRows(PRODUCT_ROWS)
    const mappingLookup = buildCommerceProductMappingLookupFromRows(MAPPING_ROWS)
    const resolved = resolveNaverSyncRecord({
      orderInfo: {
        order: {
          orderId: '202603230002',
          orderDate: '2026-03-23T09:00:00.000+09:00',
          ordererId: 'buyer123',
          ordererName: '홍길동',
        },
        productOrder: {
          productOrderId: '20260323000201',
          productId: '12825547641',
          productName: '애착트릿',
          productOption: '치킨',
          productOrderStatus: 'CANCELED',
          claimStatus: 'CANCEL_DONE',
          quantity: 1,
        },
      },
      latestEvent: {
        productOrderId: '20260323000201',
        lastChangedType: 'CLAIM_COMPLETED',
        lastChangedDate: '2026-03-23T11:00:00.000+09:00',
        productOrderStatus: 'CANCELED',
        claimStatus: 'CANCEL_DONE',
      },
      productLookup: lookup,
      productMappingLookup: mappingLookup,
      runId: 'run-1',
      sourceChannel: 'naver',
      sourceAccountKey: 'default',
    })

    expect(resolved.eligible).toBe(false)
    expect(resolved.purchase).toBeNull()
  })

  it('stores single-option churait variants as canonical option labels while preserving raw source options', () => {
    const lookup = buildProductLookupFromRows(PRODUCT_ROWS)
    const mappingLookup = buildCommerceProductMappingLookupFromRows(MAPPING_ROWS)
    const resolved = resolveNaverSyncRecord({
      orderInfo: {
        order: {
          orderId: '202603230004',
          orderDate: '2026-03-23T09:00:00.000+09:00',
          ordererId: 'buyer555',
          ordererName: '김집사',
        },
        productOrder: {
          productOrderId: '20260323000401',
          productId: '12417368947',
          productName: '굿포펫 츄라잇 14포입',
          productOption: '1개: 브라이트 1개 (연어)',
          productOrderStatus: 'PAYED',
          claimStatus: '',
          quantity: 1,
          shippingAddress: {
            name: '김집사',
          },
        },
      },
      latestEvent: {
        productOrderId: '20260323000401',
        lastChangedType: 'PAYED',
        lastChangedDate: '2026-03-23T11:00:00.000+09:00',
        productOrderStatus: 'PAYED',
      },
      productLookup: lookup,
      productMappingLookup: mappingLookup,
      runId: 'run-1',
      sourceChannel: 'naver',
      sourceAccountKey: 'default',
    })

    expect(resolved.eligible).toBe(true)
    expect(resolved.purchase).toMatchObject({
      product_id: 'P-CHURAIT-BRIGHT',
      product_name: '츄라잇',
      option_info: '브라이트',
      source_option_info: '1개: 브라이트 1개 (연어)',
    })
  })

  it('maps churait API aliases like 데일리펫 onto the internal 데일리핏 variant', () => {
    const lookup = buildProductLookupFromRows([
      ...PRODUCT_ROWS,
      { product_id: 'P-CHURAIT-DAILYFIT', product_name: '츄라잇', option_name: '데일리핏' },
    ])
    const mappingLookup = buildCommerceProductMappingLookupFromRows([
      ...MAPPING_ROWS,
      {
        source_channel: 'naver',
        source_fulfillment_type: 'default',
        source_account_key: 'default',
        commerce_product_id: '12417368947',
        commerce_option_code: '',
        commerce_product_name: '츄라잇',
        commerce_option_name: '데일리핏',
        internal_product_id: 'P-CHURAIT-DAILYFIT',
        matching_mode: 'product_id_option',
        canonical_variant: '데일리핏',
        rule_json: {
          optionKeywords: ['데일리핏', '데일리펫', '참치'],
        },
        priority: 10,
        is_active: true,
      },
    ])
    const resolved = resolveNaverSyncRecord({
      orderInfo: {
        order: {
          orderId: '202603230005',
          orderDate: '2026-03-23T09:00:00.000+09:00',
          ordererId: 'buyer556',
          ordererName: '김집사',
        },
        productOrder: {
          productOrderId: '20260323000501',
          productId: '12417368947',
          productName: '굿포펫 츄라잇 14포입',
          productOption: '맛 선택: 데일리펫(참치) 1개',
          productOrderStatus: 'PURCHASE_DECIDED',
          claimStatus: '',
          quantity: 1,
          shippingAddress: {
            name: '김집사',
          },
        },
      },
      latestEvent: {
        productOrderId: '20260323000501',
        lastChangedType: 'PURCHASE_DECIDED',
        lastChangedDate: '2026-03-23T11:00:00.000+09:00',
        productOrderStatus: 'PURCHASE_DECIDED',
      },
      productLookup: lookup,
      productMappingLookup: mappingLookup,
      runId: 'run-1',
      sourceChannel: 'naver',
      sourceAccountKey: 'default',
    })

    expect(resolved.eligible).toBe(true)
    expect(resolved.purchase).toMatchObject({
      product_id: 'P-CHURAIT-DAILYFIT',
      product_name: '츄라잇',
      option_info: '데일리핏',
      source_option_info: '맛 선택: 데일리펫(참치) 1개',
    })
  })

  it('keeps eligible but unmapped rows out of purchases until a mapping exists', () => {
    const lookup = buildProductLookupFromRows(PRODUCT_ROWS)
    const resolved = resolveNaverSyncRecord({
      orderInfo: {
        order: {
          orderId: '202603230003',
          orderDate: '2026-03-23T09:00:00.000+09:00',
          ordererId: 'buyer999',
          ordererName: '테스트',
        },
        productOrder: {
          productOrderId: '20260323000301',
          productId: '99999999999',
          productName: '미매핑 상품',
          productOption: '옵션 없음',
          productOrderStatus: 'PAYED',
          claimStatus: '',
          quantity: 1,
        },
      },
      latestEvent: {
        productOrderId: '20260323000301',
        lastChangedType: 'PAYED',
        lastChangedDate: '2026-03-23T11:00:00.000+09:00',
        productOrderStatus: 'PAYED',
      },
      productLookup: lookup,
      productMappingLookup: buildCommerceProductMappingLookupFromRows([]),
      runId: 'run-1',
      sourceChannel: 'naver',
      sourceAccountKey: 'default',
    })

    expect(resolved.eligible).toBe(true)
    expect(resolved.purchase).toBeNull()
    expect(resolved.needsReview).toBe(true)
    expect(resolved.mappingReason).toContain('mapping')
  })

  it('formats Seoul timestamps consistently for Naver requests', () => {
    const formatted = formatNaverDateTime(parseNaverSyncDateTime('2026-03-23T09:10:11+09:00'))
    expect(formatted).toBe('2026-03-23T09:10:11.000+09:00')
  })
})
