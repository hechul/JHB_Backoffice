import { describe, it, expect } from 'vitest'
import {
  buildMatchingResult,
  computeUnmatchReason,
  extractPurchaseOptionKeyword,
  extractProductKeyword,
  isNonCampaignProduct,
  type FilterPurchaseRow,
  type FilterExperienceRow,
} from '../../app/composables/useFilterMatching'

function purchase(partial: Partial<FilterPurchaseRow>): FilterPurchaseRow {
  return {
    purchase_id: 'P-1',
    buyer_id: 'abcd1234',
    buyer_name: '홍길동',
    receiver_name: '홍길동',
    product_id: 'SKU-1',
    product_name: '애착트릿',
    option_info: '북어',
    quantity: 1,
    order_date: '2026-01-10',
    is_manual: false,
    matched_exp_id: null,
    ...partial,
  }
}

function experience(partial: Partial<FilterExperienceRow>): FilterExperienceRow {
  return {
    id: 1,
    mission_product_name: '애착트릿',
    mapped_product_id: 'SKU-1',
    option_info: '북어',
    receiver_name: '홍길동',
    naver_id: 'abcd9999',
    purchase_date: '2026-01-10',
    ...partial,
  }
}

describe('useFilterMatching', () => {
  it('matches by rank1 when id/name/product/option/date are all aligned', () => {
    const result = buildMatchingResult(
      [purchase({})],
      [experience({})],
    )

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.rank).toBe(1)
    expect(result.matches[0]?.reason).toBe('완벽일치_매칭')
    expect(result.rankCounts[1]).toBe(1)
    expect(result.unmatchedReasons.size).toBe(0)
  })

  it('does not depend on product number and matches by product name text', () => {
    const result = buildMatchingResult(
      [purchase({
        product_id: 'SMARTSTORE-ONLY-999',
        product_name: '스스/굿포펫 동결건조간식 애착 트릿 원물100% 국내생산 북어 110g',
      })],
      [experience({
        mapped_product_id: 'P-9999999999999',
        mission_product_name: '애착트릿',
      })],
    )

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.rank).toBe(1)
  })

  it('normalizes attachment treat chicken aliases (닭가슴살/닭고기 -> 치킨)', () => {
    expect(
      extractPurchaseOptionKeyword(
        '애착트릿',
        '굿포펫 애착트릿 강아지 고양이 닭가슴살 동결건조 간식 고단백 120g',
        '',
      ),
    ).toBe('치킨')

    expect(
      extractPurchaseOptionKeyword(
        '애착트릿',
        '굿포펫 애착트릿 대용량',
        '닭고기',
      ),
    ).toBe('치킨')

    expect(
      extractPurchaseOptionKeyword(
        '애착트릿',
        '굿포펫 애착트릿 대용량 동결건조간식 330g 3종세트',
        '',
      ),
    ).toBe('3종세트')
  })

  it('compares churite options by raw option text (no mixed/single collapsing)', () => {
    const sameOption = '맛 선택: 데일리펫(참치) 1개 / 맛 선택 2: 브라이트(연어) 1개 / 맛 선택 3: 클린펫(닭가슴살) 1개'
    const differentOption = '맛 선택: 브라이트(연어) 1개 / 맛 선택 2: 브라이트(연어) 1개 / 맛 선택 3: 브라이트(연어) 1개'

    const matched = buildMatchingResult(
      [purchase({
        purchase_id: 'P-churite-same',
        product_name: '[2+1 설특선 감사 패키지] 굿포펫 츄라잇 고양이 영양제 스틱 유산균 14포입 3박스',
        option_info: sameOption,
      })],
      [experience({
        id: 201,
        mission_product_name: '굿포펫 츄라잇 고양이 영양제 스틱 유산균 14포입 3박스',
        option_info: sameOption,
      })],
    )

    expect(matched.matches).toHaveLength(1)

    const unmatched = buildMatchingResult(
      [purchase({
        purchase_id: 'P-churite-diff',
        product_name: '[2+1 설특선 감사 패키지] 굿포펫 츄라잇 고양이 영양제 스틱 유산균 14포입 3박스',
        option_info: sameOption,
      })],
      [experience({
        id: 202,
        mission_product_name: '굿포펫 츄라잇 고양이 영양제 스틱 유산균 14포입 3박스',
        option_info: differentOption,
      })],
    )

    expect(unmatched.matches).toHaveLength(1)
    expect(unmatched.matches[0]?.rank).toBe(3)
    expect(unmatched.matches[0]?.reason).toBe('옵션불일치_매칭')
  })

  it('matches single-option churait rows when purchases store the canonical option label', () => {
    const result = buildMatchingResult(
      [purchase({
        purchase_id: 'P-churait-single',
        product_name: '굿포펫 츄라잇 고양이 영양제 스틱 유산균 14포입',
        option_info: '브라이트',
        order_date: '2025-12-10',
      })],
      [experience({
        id: 301,
        mission_product_name: '츄라잇',
        option_info: '브라이트',
        purchase_date: '2025-12-10',
      })],
    )

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.rank).toBe(1)
    expect(result.matches[0]?.reason).toBe('완벽일치_매칭')
  })

  it('matches masked API names against full experience names', () => {
    const result = buildMatchingResult(
      [purchase({
        purchase_id: 'P-masked-name',
        buyer_name: '황*호',
        receiver_name: '황*호',
        product_name: '츄라잇',
        option_info: '브라이트',
        order_date: '2025-12-10',
      })],
      [experience({
        id: 302,
        mission_product_name: '츄라잇',
        option_info: '브라이트',
        receiver_name: '황민호',
        purchase_date: '2025-12-10',
      })],
    )

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.rank).toBe(1)
    expect(result.matches[0]?.reason).toBe('완벽일치_매칭')
  })

  it('treats freeze-dried legacy product as non-campaign (excluded from matching)', () => {
    expect(extractProductKeyword('스스/굿포펫 동결건조간식 원물100% 국내생산 연어 110g')).toBe('동결건조리뉴얼전')
    expect(isNonCampaignProduct('스스/굿포펫 동결건조간식 원물100% 국내생산 연어 110g')).toBe(true)

    // 애착트릿 키워드가 있으면 기존 애착트릿 라인으로 유지
    expect(extractProductKeyword('스스/굿포펫 동결건조간식 애착 트릿 원물100% 국내생산 연어 110g')).toBe('애착트릿')
    expect(isNonCampaignProduct('스스/굿포펫 동결건조간식 애착 트릿 원물100% 국내생산 연어 110g')).toBe(false)

    const result = buildMatchingResult(
      [purchase({
        purchase_id: 'P-legacy-freeze-dried',
        product_name: '스스/굿포펫 동결건조간식 원물100% 국내생산 연어 110g',
      })],
      [experience({
        id: 777,
        mission_product_name: '애착트릿',
      })],
    )

    expect(result.matches).toHaveLength(0)
  })

  it('marks rank4/quantity>=2 as needsReview and keeps manual rows protected', () => {
    const result = buildMatchingResult(
      [
        purchase({
          purchase_id: 'P-need-review',
          buyer_id: 'aaaa1111',
          buyer_name: '김철수',
          receiver_name: '김철수',
          product_id: 'SKU-2',
          option_info: '기본',
          quantity: 2,
          order_date: '2026-01-11',
        }),
        purchase({
          purchase_id: 'P-manual-protected',
          is_manual: true,
          matched_exp_id: 99,
        }),
      ],
      [
        experience({
          id: 2,
          mapped_product_id: 'SKU-2',
          naver_id: 'bbbb9999',
          receiver_name: '김철수',
          option_info: '기본',
          purchase_date: '2026-01-11',
        }),
        experience({
          id: 99,
          mapped_product_id: 'SKU-1',
        }),
      ],
    )

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.rank).toBe(4)
    expect(result.matches[0]?.needsReview).toBe(true)
    expect(result.matches[0]?.quantityWarning).toBe(true)
    expect(result.protectedCount).toBe(1)
  })

  it('computes unmatched reasons deterministically', () => {
    const purchases = [
      purchase({
        product_id: 'SKU-3',
        order_date: '2026-01-12',
      }),
    ]

    expect(computeUnmatchReason(
      experience({ mapped_product_id: null }),
      purchases,
    )).toBe('상품매핑_실패')

    expect(computeUnmatchReason(
      experience({
        mapped_product_id: 'SKU-3',
        purchase_date: '2026-01-20',
      }),
      purchases,
    )).toBe('기간외_주문없음')

    expect(computeUnmatchReason(
      experience({
        mapped_product_id: 'SKU-3',
        purchase_date: '2026-01-12',
        naver_id: 'zzzz0000',
        receiver_name: '다른이름',
      }),
      purchases,
    )).toBe('조건_불일치')
  })
})
