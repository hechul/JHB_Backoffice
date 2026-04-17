import { describe, expect, it } from 'vitest'
import { computePurchaseQuantity, formatQuantityCount } from '../../app/composables/usePurchaseQuantity'

describe('usePurchaseQuantity', () => {
  it('splits 츄라잇 3박스 by option flavors', () => {
    const result = computePurchaseQuantity({
      productName: '[2+1] 굿포펫 츄라잇 14포입 3박스',
      optionInfo: '맛 선택: 데일리핏 1개 / 맛 선택2: 브라이트 1개 / 맛 선택3: 클린펫 1개',
      quantity: 1,
    })

    expect(result.totalCount).toBe(3)
    expect(result.dashboardBreakdown).toEqual([
      { optionLabel: '데일리핏', count: 1 },
      { optionLabel: '브라이트', count: 1 },
      { optionLabel: '클린펫', count: 1 },
    ])
  })

  it('keeps repeated 츄라잇 flavor counts', () => {
    const result = computePurchaseQuantity({
      productName: '[2+1] 굿포펫 츄라잇 14포입 3박스',
      optionInfo: '데일리핏 + 데일리핏 + 데일리핏',
      quantity: 1,
    })

    expect(result.totalCount).toBe(3)
    expect(result.dashboardBreakdown).toEqual([
      { optionLabel: '데일리핏', count: 3 },
    ])
  })

  it('keeps 츄라잇 non-box as raw quantity', () => {
    const result = computePurchaseQuantity({
      productName: '굿포펫 츄라잇 14포입',
      optionInfo: '브라이트',
      quantity: 2,
    })
    expect(result.totalCount).toBe(2)
    expect(result.dashboardBreakdown[0]?.count).toBe(2)
  })

  it('treats Coupang 츄라잇 14/28/42/84개 SKU as 1/2/3/6 boxes', () => {
    const singleBox = computePurchaseQuantity({
      productName: '츄라잇',
      optionInfo: '14개 10g 종합영양제',
      sourceProductId: '94132827866',
      quantity: 1,
    })
    const doubleBox = computePurchaseQuantity({
      productName: '츄라잇',
      optionInfo: '28개 10g 유리너리+장건강',
      sourceProductId: '94363413993',
      quantity: 1,
    })
    const tripleBox = computePurchaseQuantity({
      productName: '츄라잇',
      optionInfo: '42개 10g 눈물개선/눈건강',
      sourceProductId: '94363315735',
      quantity: 1,
    })
    const sixBox = computePurchaseQuantity({
      productName: '츄라잇',
      optionInfo: '84개 10g 종합영양제',
      sourceProductId: '94879329297',
      quantity: 1,
    })

    expect(singleBox.totalCount).toBe(1)
    expect(doubleBox.totalCount).toBe(2)
    expect(tripleBox.totalCount).toBe(3)
    expect(sixBox.totalCount).toBe(6)
  })

  it('splits 애착트릿 3종세트 into 북어/연어/치킨', () => {
    const result = computePurchaseQuantity({
      productName: '애착트릿 3종세트',
      optionInfo: '-',
      quantity: 2,
    })

    expect(result.totalCount).toBe(6)
    expect(result.dashboardBreakdown).toEqual([
      { optionLabel: '북어', count: 2 },
      { optionLabel: '연어', count: 2 },
      { optionLabel: '치킨', count: 2 },
    ])
  })

  it('applies 애착트릿 n개 rule when 3종세트 is absent', () => {
    const result = computePurchaseQuantity({
      productName: '애착트릿 연어 2개',
      optionInfo: '',
      quantity: 3,
    })

    expect(result.totalCount).toBe(6)
    expect(result.dashboardBreakdown[0]).toEqual({
      optionLabel: '연어',
      count: 6,
    })
  })

  it('applies 엔자이츄 priority: no n개 => quantity', () => {
    const result = computePurchaseQuantity({
      productName: '엔자이츄 100g',
      optionInfo: '',
      quantity: 2,
    })

    expect(result.totalCount).toBe(2)
  })

  it('applies 엔자이츄 g rule when n개 exists and g is not 10', () => {
    const result = computePurchaseQuantity({
      productName: '엔자이츄 100g, 20개',
      optionInfo: '',
      quantity: 2,
    })

    expect(result.totalCount).toBe(2)
  })

  it('applies 엔자이츄 10g exception and fallback divisor rule', () => {
    const result = computePurchaseQuantity({
      productName: '엔자이츄 10g, 20개',
      optionInfo: '',
      quantity: 2,
    })

    expect(result.totalCount).toBe(4)
  })

  it('prefers source product id over 엔자이츄 raw name heuristics', () => {
    const result = computePurchaseQuantity({
      productName: '엔자이츄 10g, 20개',
      optionInfo: '',
      sourceProductId: '12565223228',
      quantity: 2,
    })

    expect(result.totalCount).toBe(2)
  })

  it('uses 엔자이츄 2개 SKU source product id as pack multiplier', () => {
    const result = computePurchaseQuantity({
      productName: '엔자이츄 100g',
      optionInfo: '',
      sourceProductId: '13031643891',
      quantity: 1,
    })

    expect(result.totalCount).toBe(2)
  })

  it('applies 이즈바이트 13g exception and divisor-7 rule', () => {
    const result = computePurchaseQuantity({
      productName: '이즈바이트 13g, 14개',
      optionInfo: '',
      quantity: 2,
    })

    expect(result.totalCount).toBe(4)
  })

  it('prefers source product id over 이즈바이트 raw name heuristics', () => {
    const result = computePurchaseQuantity({
      productName: '이즈바이트 13g, 14개',
      optionInfo: '',
      sourceProductId: '12565154404',
      quantity: 2,
    })

    expect(result.totalCount).toBe(2)
  })

  it('uses Coupang SKU multiplier for 이즈바이트 instead of gram fallback', () => {
    const single = computePurchaseQuantity({
      productName: '이즈바이트',
      optionInfo: '1개 꿀고구마맛 91g',
      sourceProductId: '94165125993',
      quantity: 1,
    })
    const double = computePurchaseQuantity({
      productName: '이즈바이트',
      optionInfo: '2개 꿀고구마맛 91g',
      sourceProductId: '94380472325',
      quantity: 1,
    })

    expect(single.totalCount).toBe(1)
    expect(double.totalCount).toBe(2)
  })

  it('multiplies Coupang treatbag and dispenser SKU counts by order quantity', () => {
    const treatbag = computePurchaseQuantity({
      productName: '트릿백',
      optionInfo: '1개 민트+퍼플',
      sourceProductId: '94855858569',
      quantity: 2,
    })
    const dispenser = computePurchaseQuantity({
      productName: '츄르짜개',
      optionInfo: '1개 블루+옐로+퍼플',
      sourceProductId: '94782798350',
      quantity: 2,
    })

    expect(treatbag.totalCount).toBe(4)
    expect(dispenser.totalCount).toBe(6)
  })

  it('applies 케어푸/두부모래 n개 * quantity rule', () => {
    const carefu = computePurchaseQuantity({
      productName: '케어푸 90포, 3개',
      optionInfo: '',
      quantity: 2,
    })
    const tofu = computePurchaseQuantity({
      productName: '두부모래 8L, 6개',
      optionInfo: '',
      quantity: 2,
    })

    expect(carefu.totalCount).toBe(6)
    expect(tofu.totalCount).toBe(12)
  })

  it('uses source product id metadata for 두부모래 pack quantity', () => {
    const result = computePurchaseQuantity({
      productName: '프리미엄 두부모래',
      optionInfo: '',
      sourceProductId: '11750107226',
      quantity: 2,
    })

    expect(result.totalCount).toBe(12)
  })

  it('splits 애착트릿 3종세트 by source product id even if raw name changed', () => {
    const result = computePurchaseQuantity({
      productName: '굿포펫 애착트릿 대용량 동결건조간식 330g',
      optionInfo: '',
      sourceProductId: '12825618625',
      quantity: 2,
    })

    expect(result.totalCount).toBe(6)
    expect(result.dashboardBreakdown).toEqual([
      { optionLabel: '북어', count: 2 },
      { optionLabel: '연어', count: 2 },
      { optionLabel: '치킨', count: 2 },
    ])
  })

  it('uses raw quantity for dispenser/treatbag/sample/fallback', () => {
    expect(computePurchaseQuantity({
      productName: '츄르짜개 (고양이 간식 디스펜서)',
      optionInfo: '블루',
      quantity: 3,
    }).totalCount).toBe(3)

    expect(computePurchaseQuantity({
      productName: '미니 트릿백',
      optionInfo: '민트',
      quantity: 2,
    }).totalCount).toBe(2)

    expect(computePurchaseQuantity({
      productName: '전제품 맛보기 샘플',
      optionInfo: '-',
      quantity: 4,
    }).totalCount).toBe(4)

    expect(computePurchaseQuantity({
      productName: '기타 상품',
      optionInfo: '-',
      quantity: 5,
    }).totalCount).toBe(5)
  })

  it('uses Coupang SKU multiplier for 트릿백 and 짜개 combination items', () => {
    const treatBagCombo = computePurchaseQuantity({
      productName: '미니 트릿백',
      optionInfo: '1개 민트+퍼플',
      sourceProductId: '94855858569',
      quantity: 1,
    })
    const dispenserTriple = computePurchaseQuantity({
      productName: '츄르짜개 (고양이 간식 디스펜서)',
      optionInfo: '1개 블루+옐로+퍼플',
      sourceProductId: '94782798350',
      quantity: 1,
    })

    expect(treatBagCombo.totalCount).toBe(2)
    expect(dispenserTriple.totalCount).toBe(3)
  })

  it('formats count for UI display', () => {
    expect(formatQuantityCount(12)).toBe('12')
    expect(formatQuantityCount(1.5)).toBe('1.5')
    expect(formatQuantityCount(Number.NaN)).toBe('0')
  })
})
