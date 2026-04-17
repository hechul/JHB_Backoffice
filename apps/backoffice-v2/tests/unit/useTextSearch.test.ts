import { describe, expect, it } from 'vitest'
import { matchesSearchQuery } from '../../app/composables/useTextSearch'

describe('useTextSearch', () => {
  it('supports basic contains search', () => {
    expect(matchesSearchQuery('영아', '장영아')).toBe(true)
    expect(matchesSearchQuery('xyz', '장영아')).toBe(false)
  })

  it('supports choseong(initial consonant) search for Korean names', () => {
    expect(matchesSearchQuery('ㅈ', '장영아')).toBe(true)
    expect(matchesSearchQuery('ㅈㅇ', '장영아')).toBe(true)
    expect(matchesSearchQuery('ㄱ', '장영아')).toBe(false)
  })

  it('does not use choseong fallback for full Hangul queries', () => {
    expect(matchesSearchQuery('장영아', '정용우')).toBe(false)
    expect(matchesSearchQuery('김예', '윤경애')).toBe(false)
    expect(matchesSearchQuery('김예', '김윤아')).toBe(false)
  })

  it('ignores spaces and punctuation for tolerant matching', () => {
    expect(matchesSearchQuery('product123', 'Product-123')).toBe(true)
    expect(matchesSearchQuery('데일리핏', '츄라잇 / 데일리핏')).toBe(true)
  })
})
