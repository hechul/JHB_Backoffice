import { describe, it, expect } from 'vitest'
import {
  extractExperienceRows,
  normalizeExperienceHeader,
  preprocessExperiences,
  preprocessOrders,
} from '../../app/composables/useExcelParser'

describe('useExcelParser', () => {
  it('normalizes experience header aliases', () => {
    expect(normalizeExperienceHeader('품명')).toBe('미션상품명')
    expect(normalizeExperienceHeader('🗓️구매날짜')).toBe('구매인증일')
    expect(normalizeExperienceHeader('옵션')).toBe('옵션정보')
    expect(normalizeExperienceHeader('수취인')).toBe('수취인명')
  })

  it('preprocesses experiences and drops only invalid date rows', () => {
    const rows = [
      {
        품명: '스스/굿포펫 동결건조간식 애착 트릿 원물100% 국내생산 치킨 120g 대용량 리뉴얼',
        옵션: '',
        수취인: '홍길동',
        아이디: 'hong123',
        '🗓️구매날짜': '2026. 1. 20',
        캠페인명: '2026-01 웨이프로젝트',
      },
      {
        품명: '테스트',
        옵션: '',
        수취인: '김철수',
        아이디: '',
        '🗓️구매날짜': '2026-01-21',
      },
      {
        품명: '테스트',
        옵션: '',
        수취인: '김영희',
        아이디: 'kim01',
        '🗓️구매날짜': '🗓️구매날짜',
      },
    ]

    const processed = preprocessExperiences(rows as any)
    expect(processed).toHaveLength(2)
    expect(processed[0]?.mission_product_name).toContain('애착')
    expect(processed[0]?.naver_id).toBe('hong123')
    expect(processed[0]?.purchase_date).toBe('2026-01-20')
    expect(processed[1]?.mission_product_name).toBe('테스트')
    expect(processed[1]?.naver_id).toBe('')
    expect(processed[1]?.purchase_date).toBe('2026-01-21')
  })

  it('filters canceled orders and missing purchase_id', () => {
    const rows = [
      {
        상품주문번호: '202602230001',
        상품번호: '111',
        상품명: '테스트 상품',
        옵션정보: '기본',
        수량: '1',
        구매자ID: 'u1',
        구매자명: '홍길동',
        수취인명: '홍길동',
        주문일시: '2026-02-23 10:00:00',
        주문상태: '결제완료',
        클레임상태: '없음',
      },
      {
        상품주문번호: '202602230002',
        상품번호: '112',
        상품명: '취소 상품',
        옵션정보: '기본',
        수량: '1',
        구매자ID: 'u2',
        구매자명: '김철수',
        수취인명: '김철수',
        주문일시: '2026-02-23 11:00:00',
        주문상태: '취소완료',
        클레임상태: '없음',
      },
      {
        상품주문번호: '202602230003',
        상품번호: '114',
        상품명: '철회 상품',
        옵션정보: '기본',
        수량: '1',
        구매자ID: 'u4',
        구매자명: '박철수',
        수취인명: '박철수',
        주문일시: '2026-02-23 13:00:00',
        주문상태: '배송완료',
        클레임상태: '반품철회',
      },
      {
        상품주문번호: '',
        상품번호: '113',
        상품명: '누락 상품',
        옵션정보: '기본',
        수량: '1',
        구매자ID: 'u3',
        구매자명: '이영희',
        수취인명: '이영희',
        주문일시: '2026-02-23 12:00:00',
        주문상태: '결제완료',
        클레임상태: '없음',
      },
    ]

    const result = preprocessOrders(rows as any)
    expect(result.valid).toHaveLength(2)
    expect(result.excluded).toBe(2)
    expect(result.valid[0]?.purchase_id).toBe('202602230001')
    expect(result.valid[1]?.purchase_id).toBe('202602230003')
  })

  it('extracts legacy experience rows with option at col4 and allows empty id', () => {
    const rows = extractExperienceRows({
      name: '202512_웨이프로젝트',
      headers: [],
      rows: [],
      matrix: [
        [
          '81',
          '11일차-1',
          '2025. 12. 1',
          '스스/굿포펫 츄라잇 고양이 츄르영양제 국내산 10g x 14개입',
          '클린펫',
          '빈/텍스트',
          '닉네임A',
          '수취인A',
          'id_a',
        ],
        [
          '82',
          '11일차-2',
          '2025. 12. 1',
          '스스/굿포펫 츄라잇 고양이 츄르영양제 국내산 10g x 14개입',
          '브라이트',
          '빈/텍스트',
          '닉네임B',
          '수취인B',
          '',
        ],
      ],
    } as any)

    expect(rows).toHaveLength(2)
    expect(rows[0]?.옵션정보).toBe('클린펫')
    expect(rows[0]?.수취인명).toBe('수취인A')
    expect(rows[1]?.옵션정보).toBe('브라이트')
    expect(rows[1]?.아이디).toBe('')

    const processed = preprocessExperiences(rows as any)
    expect(processed).toHaveLength(2)
  })
})
