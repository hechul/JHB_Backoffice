export interface ProductCatalogItem {
  product_id: string
  product_name: string
  option_name: string | null
}

const missionProductRules: { keywords: string[]; canonical: string }[] = [
  { keywords: ['애착트릿'], canonical: '애착트릿' },
  { keywords: ['츄라잇'], canonical: '츄라잇' },
  { keywords: ['케어푸'], canonical: '케어푸' },
  { keywords: ['두부모래'], canonical: '두부모래' },
  { keywords: ['이즈바이트'], canonical: '이즈바이트' },
  { keywords: ['엔자이츄'], canonical: '엔자이츄' },
  { keywords: ['트릿백'], canonical: '미니 트릿백' },
  { keywords: ['츄르짜개'], canonical: '츄르짜개 (고양이 간식 디스펜서)' },
  { keywords: ['도시락'], canonical: '도시락 샘플팩' },
  { keywords: ['맛보기'], canonical: '전제품 맛보기 샘플' },
]

const optionKeywordRules: { product: string; keywords: string[]; canonical: string }[] = [
  { product: '애착트릿', keywords: ['북어'], canonical: '북어' },
  { product: '애착트릿', keywords: ['연어'], canonical: '연어' },
  { product: '애착트릿', keywords: ['치킨'], canonical: '치킨' },
  { product: '애착트릿', keywords: ['닭가슴살'], canonical: '치킨' },
  { product: '애착트릿', keywords: ['닭고기'], canonical: '치킨' },
  { product: '애착트릿', keywords: ['3종세트', '3종 세트'], canonical: '3종세트' },
  { product: '동결건조(리뉴얼전)', keywords: ['북어'], canonical: '북어' },
  { product: '동결건조(리뉴얼전)', keywords: ['연어'], canonical: '연어' },
  { product: '동결건조(리뉴얼전)', keywords: ['치킨'], canonical: '치킨' },
  { product: '동결건조(리뉴얼전)', keywords: ['닭가슴살'], canonical: '치킨' },
  { product: '동결건조(리뉴얼전)', keywords: ['닭고기'], canonical: '치킨' },
  { product: '츄라잇', keywords: ['데일리핏', '데일리펫'], canonical: '데일리핏' },
  { product: '츄라잇', keywords: ['클린펫'], canonical: '클린펫' },
  { product: '츄라잇', keywords: ['브라이트'], canonical: '브라이트' },
  { product: '미니 트릿백', keywords: ['민트'], canonical: '민트' },
  { product: '미니 트릿백', keywords: ['퍼플'], canonical: '퍼플' },
  { product: '츄르짜개 (고양이 간식 디스펜서)', keywords: ['옐로', 'yellow'], canonical: '옐로' },
  { product: '츄르짜개 (고양이 간식 디스펜서)', keywords: ['블루', 'blue'], canonical: '블루' },
  { product: '츄르짜개 (고양이 간식 디스펜서)', keywords: ['퍼플', 'purple'], canonical: '퍼플' },
  { product: '도시락 샘플팩', keywords: ['강아지용'], canonical: '강아지용' },
  { product: '도시락 샘플팩', keywords: ['고양이용'], canonical: '고양이용' },
]

export interface ProductLookup {
  exactMap: Map<string, string>
  baseMap: Map<string, string>
  anyNameMap: Map<string, string>
}

export interface ResolvedMappedProduct {
  normalizedName: string
  normalizedOption: string
  mappedProductId: string | null
}

export function normalizeForMatch(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '')
}

function matchOptionKeyword(productName: string, source: string): string {
  const normalizedSource = normalizeForMatch(source)
  if (!normalizedSource) return ''
  const matched = optionKeywordRules.find((rule) =>
    rule.product === productName &&
    rule.keywords.some((kw) => normalizedSource.includes(normalizeForMatch(kw))),
  )
  return matched?.canonical || ''
}

export function normalizeMissionProductName(rawName: string): string {
  const name = String(rawName || '').trim()
  if (!name) return ''

  const normalizedName = normalizeForMatch(name)
  const hasFreezeDried = normalizedName.includes('동결건조') || normalizedName.includes('동견건조')
  const hasAttachmentTreat = normalizedName.includes('애착트릿')
  if (hasFreezeDried && !hasAttachmentTreat) {
    return '동결건조(리뉴얼전)'
  }

  const matched = missionProductRules.find((rule) =>
    rule.keywords.some((kw) => normalizedName.includes(normalizeForMatch(kw))),
  )
  return matched?.canonical || name
}

export function normalizeOptionLabel(
  productName: string,
  rawOption: string,
  rawMissionName: string,
): string {
  const option = String(rawOption || '').trim()
  const missionName = String(rawMissionName || '').trim()

  if (productName === '두부모래') return ''
  if (productName === '츄라잇') {
    return option.replace(/\s+/g, ' ').trim()
  }

  const keywordByOption = matchOptionKeyword(productName, option)
  if (keywordByOption) return keywordByOption
  const keywordByMission = matchOptionKeyword(productName, missionName)
  if (keywordByMission) return keywordByMission

  if (!option) return ''
  return option.replace(/\s+/g, ' ').trim()
}

export function normalizeOptionKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')
    .replace(/[|/]/g, '')
}

export function makeProductMatchKey(productName: string, optionName: string): string {
  return `${productName.trim().toLowerCase()}::${normalizeOptionKey(optionName)}`
}

export function buildProductLookup(productCatalog: ProductCatalogItem[]): ProductLookup {
  const exactMap = new Map<string, string>()
  const baseMap = new Map<string, string>()
  const anyNameMap = new Map<string, string>()

  for (const product of productCatalog) {
    const normalizedProductName = normalizeMissionProductName(product.product_name)
    exactMap.set(makeProductMatchKey(product.product_name, product.option_name || ''), product.product_id)
    exactMap.set(makeProductMatchKey(normalizedProductName, product.option_name || ''), product.product_id)
    if (!anyNameMap.has(product.product_name.toLowerCase())) {
      anyNameMap.set(product.product_name.toLowerCase(), product.product_id)
    }
    if (!anyNameMap.has(normalizedProductName.toLowerCase())) {
      anyNameMap.set(normalizedProductName.toLowerCase(), product.product_id)
    }
    if (!product.option_name && !baseMap.has(product.product_name.toLowerCase())) {
      baseMap.set(product.product_name.toLowerCase(), product.product_id)
    }
    if (!product.option_name && !baseMap.has(normalizedProductName.toLowerCase())) {
      baseMap.set(normalizedProductName.toLowerCase(), product.product_id)
    }
  }

  return { exactMap, baseMap, anyNameMap }
}

export function resolveMappedProduct(
  rawProductName: string,
  rawOption: string,
  lookup: ProductLookup,
): ResolvedMappedProduct {
  const normalizedName = normalizeMissionProductName(rawProductName)
  const normalizedOption = normalizeOptionLabel(normalizedName, rawOption, rawProductName)
  const isOptionAgnostic = normalizedName === '두부모래'
  const mappedProductId =
    (isOptionAgnostic
      ? lookup.anyNameMap.get(normalizedName.toLowerCase())
      : lookup.exactMap.get(makeProductMatchKey(normalizedName, normalizedOption)))
    || lookup.baseMap.get(normalizedName.toLowerCase())
    || null

  return { normalizedName, normalizedOption, mappedProductId }
}
