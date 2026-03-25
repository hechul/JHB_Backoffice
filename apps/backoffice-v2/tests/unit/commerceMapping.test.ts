import { describe, expect, it } from 'vitest'

import {
  buildCommerceProductMappingLookup,
  resolveCommerceProductMapping,
} from '../../server/utils/commerce/mapping'

describe('commerce mapping lookup', () => {
  it('matches product_id_only rows by source product id', () => {
    const lookup = buildCommerceProductMappingLookup([
      {
        source_channel: 'naver',
        source_account_key: 'default',
        commerce_product_id: '12565223228',
        commerce_option_code: '',
        commerce_product_name: '엔자이츄',
        commerce_option_name: '',
        internal_product_id: 'P-ENZAI',
        matching_mode: 'product_id_only',
        canonical_variant: '',
        rule_json: {},
        priority: 10,
        is_active: true,
      },
    ])

    const resolved = resolveCommerceProductMapping({
      lookup,
      sourceAccountKey: 'default',
      commerceProductId: '12565223228',
      productName: '굿포펫 엔자이츄',
      optionInfo: '',
    })

    expect(resolved).toMatchObject({
      matched: true,
      internalProductId: 'P-ENZAI',
      matchingMode: 'product_id_only',
    })
  })

  it('matches product_id_option rows by canonical variant', () => {
    const lookup = buildCommerceProductMappingLookup([
      {
        source_channel: 'naver',
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
    ])

    const resolved = resolveCommerceProductMapping({
      lookup,
      sourceAccountKey: 'default',
      commerceProductId: '12668877332',
      optionInfo: '컬러: 블루',
      canonicalOptionInfo: '블루',
    })

    expect(resolved).toMatchObject({
      matched: true,
      internalProductId: 'P-DISPENSER-BLUE',
      canonicalVariant: '블루',
    })
  })

  it('matches name_option_rule rows by raw product keywords when canonical variant is missing', () => {
    const lookup = buildCommerceProductMappingLookup([
      {
        source_channel: 'naver',
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
    ])

    const resolved = resolveCommerceProductMapping({
      lookup,
      sourceAccountKey: 'default',
      commerceProductId: '12825547641',
      productName: '굿포펫 애착 트릿 강아지 고양이 동결건조 간식 치킨 큐브 닭가슴살 대용량 120g',
      optionInfo: '',
      canonicalOptionInfo: '',
    })

    expect(resolved).toMatchObject({
      matched: true,
      internalProductId: 'P-ATTACH-CHICKEN',
      matchingMode: 'name_option_rule',
      canonicalVariant: '치킨',
    })
  })

  it('returns review-required for ambiguous mappings', () => {
    const lookup = buildCommerceProductMappingLookup([
      {
        source_channel: 'naver',
        source_account_key: 'default',
        commerce_product_id: '12673164727',
        commerce_option_code: '',
        commerce_product_name: '미니 트릿백',
        commerce_option_name: '민트',
        internal_product_id: 'P-TREATBAG-MINT-1',
        matching_mode: 'product_id_option',
        canonical_variant: '민트',
        rule_json: {},
        priority: 10,
        is_active: true,
      },
      {
        source_channel: 'naver',
        source_account_key: 'default',
        commerce_product_id: '12673164727',
        commerce_option_code: '',
        commerce_product_name: '미니 트릿백',
        commerce_option_name: '민트',
        internal_product_id: 'P-TREATBAG-MINT-2',
        matching_mode: 'product_id_option',
        canonical_variant: '민트',
        rule_json: {},
        priority: 10,
        is_active: true,
      },
    ])

    const resolved = resolveCommerceProductMapping({
      lookup,
      sourceAccountKey: 'default',
      commerceProductId: '12673164727',
      optionInfo: '민트',
      canonicalOptionInfo: '민트',
    })

    expect(resolved.matched).toBe(false)
    expect(resolved.needsReview).toBe(true)
  })
})
