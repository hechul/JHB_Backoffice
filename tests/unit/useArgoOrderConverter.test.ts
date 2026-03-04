import { describe, expect, it } from 'vitest'
import { buildArgoOrders, type ParsedShippingRow } from '../../app/composables/useArgoOrderConverter'

describe('useArgoOrderConverter', () => {
  it('applies dinner quantity rule for 두부모래', () => {
    const rows: ParsedShippingRow[] = [
      {
        rowIndex: 2,
        sourceType: 'dinner',
        receiverName: '홍길동',
        phone: '01012345678',
        address: '서울 강남구 테헤란로 1',
        postalCode: '06234',
        productHint: '두부모래',
      },
    ]

    const result = buildArgoOrders(rows)
    expect(result.unresolvedRows).toHaveLength(0)
    expect(result.orders).toHaveLength(1)
    expect(result.orders[0]['상품수량(*)']).toBe('2')
    expect(result.orders[0]['상품바코드(*)']).toBe('A607366560520')
  })

  it('uses postcode map for reviewnote rows without postal code', () => {
    const rows: ParsedShippingRow[] = [
      {
        rowIndex: 2,
        sourceType: 'reviewnote',
        receiverName: '김영희',
        phone: '010-2222-3333',
        address: '경기 성남시 분당구 판교역로 100',
        postalCode: '',
        productHint: '이즈바이트',
      },
    ]

    const result = buildArgoOrders(rows, {
      postcodeByAddress: {
        '경기 성남시 분당구 판교역로 100': '13494',
      },
    })

    expect(result.unresolvedRows).toHaveLength(0)
    expect(result.orders).toHaveLength(1)
    expect(result.orders[0]['수취인 우편번호(*)']).toBe('13494')
    expect(result.orders[0]['상품수량(*)']).toBe('1')
  })

  it('marks ambiguous option products as unresolved', () => {
    const rows: ParsedShippingRow[] = [
      {
        rowIndex: 2,
        sourceType: 'reviewnote',
        receiverName: '박민수',
        phone: '01011112222',
        address: '서울 송파구 올림픽로 300',
        postalCode: '05551',
        productHint: '애착트릿',
      },
    ]

    const result = buildArgoOrders(rows)
    expect(result.orders).toHaveLength(0)
    expect(result.unresolvedRows).toHaveLength(1)
    expect(result.unresolvedRows[0].reason).toContain('옵션')
  })

  it('uses default product key when product hint is empty', () => {
    const rows: ParsedShippingRow[] = [
      {
        rowIndex: 2,
        sourceType: 'reviewnote',
        receiverName: '이수진',
        phone: '01044445555',
        address: '서울 마포구 월드컵북로 400',
        postalCode: '03925',
        productHint: '',
      },
    ]

    const result = buildArgoOrders(rows, {
      defaultProductKey: '엔자이츄 츄잉 덴탈껌',
    })

    expect(result.unresolvedRows).toHaveLength(0)
    expect(result.orders).toHaveLength(1)
    expect(result.orders[0]['상품바코드(*)']).toBe('8809414594219')
  })
})
