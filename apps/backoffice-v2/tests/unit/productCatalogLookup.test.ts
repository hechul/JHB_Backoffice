import { describe, expect, it } from 'vitest'

import {
  buildProductLookup,
  normalizeMissionProductName,
  resolveMappedProduct,
  type ProductCatalogItem,
} from '../../shared/productCatalog'

const PRODUCT_ROWS: ProductCatalogItem[] = [
  { product_id: 'P-ATTACH-CHICKEN', product_name: '애착트릿', option_name: '치킨' },
  { product_id: 'P-DISPENSER-BLUE', product_name: '츄르짜개 (고양이 간식 디스펜서)', option_name: '블루' },
  { product_id: 'P-LUNCHBOX-CAT', product_name: '도시락 샘플팩', option_name: '고양이용' },
  { product_id: 'P-ENZYME', product_name: '엔자이츄', option_name: null },
]

describe('productCatalog lookup', () => {
  it('normalizes legacy freeze-dried products into the pre-renewal bucket', () => {
    expect(normalizeMissionProductName('굿포펫 동결건조 북어 큐브')).toBe('동결건조(리뉴얼전)')
  })

  it('resolves canonical product and option rows from normalized names', () => {
    const lookup = buildProductLookup(PRODUCT_ROWS)
    const resolved = resolveMappedProduct(
      '굿포펫 츄르짜개 (고양이 간식 디스펜서)',
      '컬러: 블루',
      lookup,
    )

    expect(resolved).toEqual({
      normalizedName: '츄르짜개 (고양이 간식 디스펜서)',
      normalizedOption: '블루',
      mappedProductId: 'P-DISPENSER-BLUE',
    })
  })

  it('treats option-agnostic products like 두부모래 as a base-name match', () => {
    const lookup = buildProductLookup([
      ...PRODUCT_ROWS,
      { product_id: 'P-TOFU-LITTER', product_name: '두부모래', option_name: null },
    ])
    const resolved = resolveMappedProduct('두부모래 8L 6개', '6개', lookup)

    expect(resolved.mappedProductId).toBe('P-TOFU-LITTER')
    expect(resolved.normalizedOption).toBe('')
  })
})
