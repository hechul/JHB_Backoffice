import { describe, expect, it } from 'vitest'

import {
  getCanonicalGroupBySourceProductId,
  getPackMultiplierBySourceProductId,
  isOptionSensitiveSourceProduct,
  isThreeFlavorSetSourceProduct,
  resolveCommerceSourceProduct,
} from '../../app/composables/useCommerceProductCatalog'

describe('useCommerceProductCatalog', () => {
  it('returns pack multiplier metadata for known quantity-tier products', () => {
    expect(getCanonicalGroupBySourceProductId('13031643891')).toBe('엔자이츄')
    expect(getPackMultiplierBySourceProductId('13031643891')).toBe(2)
    expect(getPackMultiplierBySourceProductId('11750107226')).toBe(6)
  })

  it('marks option-sensitive source products correctly', () => {
    expect(isOptionSensitiveSourceProduct('12417368947')).toBe(true)
    expect(isOptionSensitiveSourceProduct('12668877332')).toBe(true)
    expect(isOptionSensitiveSourceProduct('12565223228')).toBe(false)
  })

  it('detects three-flavor set source products', () => {
    expect(isThreeFlavorSetSourceProduct('12825618625')).toBe(true)
    expect(isThreeFlavorSetSourceProduct('12825547641')).toBe(false)
  })

  it('canonicalizes dispenser color by source product id', () => {
    const result = resolveCommerceSourceProduct({
      sourceProductId: '12668877332',
      productName: '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)',
      optionInfo: '컬러: 블루',
    })

    expect(result).toEqual({
      matched: true,
      canonicalGroup: '츄르짜개',
      canonicalProductName: '츄르짜개 (고양이 간식 디스펜서)',
      canonicalOptionInfo: '블루',
      needsReview: false,
      reason: 'source product matched: 12668877332',
    })
  })

  it('canonicalizes lunchbox species by source product id', () => {
    const result = resolveCommerceSourceProduct({
      sourceProductId: '12668454235',
      productName: '굿포펫 도시락 샘플 (강아지/고양이)',
      optionInfo: '옵션: 고양이 도시락',
    })

    expect(result?.canonicalProductName).toBe('도시락 샘플팩')
    expect(result?.canonicalOptionInfo).toBe('고양이용')
  })

  it('canonicalizes attachment treat flavor aliases from product text', () => {
    const result = resolveCommerceSourceProduct({
      sourceProductId: '12825547641',
      productName: '굿포펫 애착 트릿 강아지 고양이 동결건조 간식 치킨 큐브 닭가슴살 대용량 120g',
      optionInfo: '',
    })

    expect(result?.canonicalProductName).toBe('애착트릿')
    expect(result?.canonicalOptionInfo).toBe('치킨')
  })

  it('keeps sample products in the sample group and derives sample option', () => {
    const result = resolveCommerceSourceProduct({
      sourceProductId: '12668256525',
      productName: '굿포펫 전제품 맛보기 샘플',
      optionInfo: '샘플: 엔자이츄 츄잉 덴탈껌 1개',
    })

    expect(result?.canonicalProductName).toBe('전제품 맛보기 샘플')
    expect(result?.canonicalOptionInfo).toBe('엔자이츄')
  })

  it('canonicalizes churait API option aliases to the internal variant labels', () => {
    const result = resolveCommerceSourceProduct({
      sourceProductId: '12417368947',
      productName: '굿포펫 츄라잇 14포입',
      optionInfo: '맛 선택: 데일리펫(참치) 1개',
    })

    expect(result?.canonicalProductName).toBe('츄라잇')
    expect(result?.canonicalOptionInfo).toBe('데일리핏')
  })

  it('returns null for unknown source product ids', () => {
    expect(resolveCommerceSourceProduct({
      sourceProductId: '99999999999',
      productName: '테스트 상품',
      optionInfo: '',
    })).toBeNull()
  })
})
