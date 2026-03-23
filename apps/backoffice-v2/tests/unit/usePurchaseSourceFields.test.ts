import { describe, expect, it } from 'vitest'

import { purchaseQuantityInput } from '../../app/composables/usePurchaseSourceFields'
import { computePurchaseQuantity } from '../../app/composables/usePurchaseQuantity'

describe('usePurchaseSourceFields', () => {
  it('prefers canonical labels for 도시락 샘플 when source product id is known', () => {
    const input = purchaseQuantityInput({
      product_name: '도시락 샘플팩',
      option_info: '고양이용',
      source_product_name: '굿포펫 도시락 샘플 (강아지/고양이)',
      source_option_info: '옵션: 고양이 도시락',
      source_product_id: '12668454235',
      source_option_code: '',
      quantity: 1,
    })

    expect(input).toEqual({
      productName: '도시락 샘플팩',
      optionInfo: '고양이용',
      sourceProductId: '12668454235',
      sourceOptionCode: '',
      quantity: 1,
    })

    expect(computePurchaseQuantity(input)).toEqual({
      totalCount: 1,
      dashboardBreakdown: [{ optionLabel: '고양이용', count: 1 }],
    })
  })

  it('prefers canonical labels for 맛보기 샘플 when source product id is known', () => {
    const input = purchaseQuantityInput({
      product_name: '전제품 맛보기 샘플',
      option_info: '엔자이츄',
      source_product_name: '굿포펫 전제품 맛보기 샘플',
      source_option_info: '샘플: 엔자이츄 츄잉 덴탈껌 1개',
      source_product_id: '12668256525',
      source_option_code: '',
      quantity: 2,
    })

    expect(input).toEqual({
      productName: '전제품 맛보기 샘플',
      optionInfo: '엔자이츄',
      sourceProductId: '12668256525',
      sourceOptionCode: '',
      quantity: 2,
    })

    expect(computePurchaseQuantity(input)).toEqual({
      totalCount: 2,
      dashboardBreakdown: [{ optionLabel: '엔자이츄', count: 2 }],
    })
  })

  it('preserves raw source fields when source product id is missing', () => {
    const input = purchaseQuantityInput({
      product_name: '엔자이츄',
      option_info: '',
      source_product_name: '엔자이츄 10g, 20개',
      source_option_info: '',
      quantity: 2,
    })

    expect(input).toEqual({
      productName: '엔자이츄 10g, 20개',
      optionInfo: '',
      sourceProductId: '',
      sourceOptionCode: '',
      quantity: 2,
    })

    expect(computePurchaseQuantity(input).totalCount).toBe(4)
  })
})
