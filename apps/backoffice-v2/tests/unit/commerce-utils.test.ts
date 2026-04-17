import { describe, expect, it } from 'vitest'

import { isEligibleCommerceOrderLine } from '../../server/utils/commerce/order-eligibility'
import {
  ATTACH_TRIT_RENEWAL_RULE,
  resolveCommerceMappingDecision,
} from '../../server/utils/commerce/mapping-rules'

describe('commerce mapping rules', () => {
  it('matches product_id_only without extra checks', () => {
    const result = resolveCommerceMappingDecision({
      config: {
        matchingMode: 'product_id_only',
        canonicalVariant: null,
      },
      productName: '테스트 상품',
      optionInfo: '',
    })

    expect(result).toEqual({
      matched: true,
      needsReview: false,
      matchingMode: 'product_id_only',
      canonicalVariant: null,
      reason: 'matched by product id only',
    })
  })

  it('matches product_id_option using option keywords', () => {
    const result = resolveCommerceMappingDecision({
      config: {
        matchingMode: 'product_id_option',
        canonicalVariant: '3개입',
        optionKeywords: ['3개', '3개입'],
      },
      productName: '이즈바이트',
      optionInfo: '옵션: 3개입',
    })

    expect(result.matched).toBe(true)
    expect(result.needsReview).toBe(false)
    expect(result.canonicalVariant).toBe('3개입')
  })

  it('matches attach trit renewal flavor from option text', () => {
    const result = resolveCommerceMappingDecision({
      config: {
        matchingMode: 'name_option_rule',
        nameOptionRule: ATTACH_TRIT_RENEWAL_RULE,
      },
      productName: '애착트릿',
      optionInfo: '추가 맛 선택: 애착트릿 연어 110g',
    })

    expect(result.matched).toBe(true)
    expect(result.needsReview).toBe(false)
    expect(result.canonicalVariant).toBe('연어')
  })
})

describe('commerce order eligibility', () => {
  it('keeps purchase analysis statuses', () => {
    expect(isEligibleCommerceOrderLine({ orderStatus: 'PAYED', claimStatus: '' })).toEqual({
      eligible: true,
      reason: 'included order status: PAYED',
    })
  })

  it('excludes canceled statuses', () => {
    expect(isEligibleCommerceOrderLine({ orderStatus: 'CANCELED' })).toEqual({
      eligible: false,
      reason: 'excluded order status: CANCELED',
    })
  })

  it('excludes finalized return claim statuses', () => {
    const result = isEligibleCommerceOrderLine({
      orderStatus: 'DELIVERED',
      claimStatus: 'RETURN_DONE',
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain('excluded claim status')
  })

  it('keeps rejected return claim statuses', () => {
    const result = isEligibleCommerceOrderLine({
      orderStatus: 'PURCHASE_DECIDED',
      claimStatus: 'RETURN_REJECT',
    })

    expect(result).toEqual({
      eligible: true,
      reason: 'included claim status: RETURN_REJECT',
    })
  })
})
