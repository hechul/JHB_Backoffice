const HANGUL_SYLLABLE_START = 0xac00
const HANGUL_SYLLABLE_END = 0xd7a3
const CHOSEONG_LIST = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'] as const

function toChoseong(text: string): string {
  return Array.from(String(text || '')).map((char) => {
    const code = char.charCodeAt(0)
    if (code >= HANGUL_SYLLABLE_START && code <= HANGUL_SYLLABLE_END) {
      const idx = Math.floor((code - HANGUL_SYLLABLE_START) / 588)
      return CHOSEONG_LIST[idx] || char
    }
    return char.toLowerCase()
  }).join('')
}

function normalizeSearchText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^0-9a-zㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
}

function isChoseongOnlyQuery(text: string): boolean {
  const normalized = String(text || '').replace(/\s+/g, '')
  if (!normalized) return false
  return /^[ㄱ-ㅎ]+$/.test(normalized)
}

export function matchesSearchQuery(query: string, ...fields: unknown[]): boolean {
  const rawQuery = String(query || '').trim()
  if (!rawQuery) return true

  const queryLower = rawQuery.toLowerCase()
  const queryNormalized = normalizeSearchText(rawQuery)
  const enableChoseongMatch = isChoseongOnlyQuery(rawQuery)
  const queryChoseong = enableChoseongMatch ? normalizeSearchText(toChoseong(rawQuery)) : ''

  return fields.some((field) => {
    const rawField = String(field || '')
    if (!rawField) return false

    const fieldLower = rawField.toLowerCase()
    if (fieldLower.includes(queryLower)) return true

    const fieldNormalized = normalizeSearchText(rawField)
    if (queryNormalized && fieldNormalized.includes(queryNormalized)) return true

    if (enableChoseongMatch) {
      const fieldChoseong = normalizeSearchText(toChoseong(rawField))
      if (queryChoseong && fieldChoseong.includes(queryChoseong)) return true
    }

    return false
  })
}
