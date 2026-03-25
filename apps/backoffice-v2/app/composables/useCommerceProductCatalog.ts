export interface CommerceSourceProductRule {
  sourceProductId: string
  canonicalGroup: string
  packMultiplier?: number
  optionSensitive?: boolean
  threeFlavorSet?: boolean
}

export interface ResolvedCommerceSourceProduct {
  matched: boolean
  canonicalGroup: string
  canonicalProductName: string
  canonicalOptionInfo: string
  needsReview: boolean
  reason: string
}

const SOURCE_PRODUCT_RULES: CommerceSourceProductRule[] = [
  { sourceProductId: '11749388704', canonicalGroup: '두부모래', packMultiplier: 1 },
  { sourceProductId: '11750103214', canonicalGroup: '두부모래', packMultiplier: 3 },
  { sourceProductId: '11750107226', canonicalGroup: '두부모래', packMultiplier: 6 },
  { sourceProductId: '12320752331', canonicalGroup: '케어푸', packMultiplier: 1 },
  { sourceProductId: '13041293177', canonicalGroup: '케어푸', packMultiplier: 3 },
  { sourceProductId: '12417368947', canonicalGroup: '츄라잇', optionSensitive: true },
  { sourceProductId: '13074780587', canonicalGroup: '츄라잇', packMultiplier: 3, optionSensitive: true },
  { sourceProductId: '12565154404', canonicalGroup: '이즈바이트', packMultiplier: 1 },
  { sourceProductId: '13035043593', canonicalGroup: '이즈바이트', packMultiplier: 2 },
  { sourceProductId: '13035043594', canonicalGroup: '이즈바이트', packMultiplier: 3 },
  { sourceProductId: '12565223228', canonicalGroup: '엔자이츄', packMultiplier: 1 },
  { sourceProductId: '13031643891', canonicalGroup: '엔자이츄', packMultiplier: 2 },
  { sourceProductId: '13031643892', canonicalGroup: '엔자이츄', packMultiplier: 3 },
  { sourceProductId: '12668256525', canonicalGroup: '맛보기', optionSensitive: true },
  { sourceProductId: '12668454235', canonicalGroup: '도시락샘플', optionSensitive: true },
  { sourceProductId: '12668877332', canonicalGroup: '츄르짜개', optionSensitive: true },
  { sourceProductId: '12673164727', canonicalGroup: '트릿백', optionSensitive: true },
  { sourceProductId: '12825519864', canonicalGroup: '애착트릿' },
  { sourceProductId: '12825541776', canonicalGroup: '애착트릿' },
  { sourceProductId: '12825547641', canonicalGroup: '애착트릿' },
  { sourceProductId: '12825618625', canonicalGroup: '애착트릿', threeFlavorSet: true },
  { sourceProductId: '11034170709', canonicalGroup: '동결건조리뉴얼전', packMultiplier: 1 },
  { sourceProductId: '11034374158', canonicalGroup: '동결건조리뉴얼전', packMultiplier: 1 },
  { sourceProductId: '11034381845', canonicalGroup: '동결건조리뉴얼전', packMultiplier: 1 },
  { sourceProductId: '11687327189', canonicalGroup: '동결건조리뉴얼전', packMultiplier: 3 },
]

const SOURCE_PRODUCT_RULE_MAP = new Map(
  SOURCE_PRODUCT_RULES.map((rule) => [rule.sourceProductId, rule] as const),
)

export function normalizeSourceProductId(value?: string | null): string {
  return String(value || '').trim()
}

export function getCommerceSourceProductRule(
  sourceProductId?: string | null,
): CommerceSourceProductRule | null {
  const normalized = normalizeSourceProductId(sourceProductId)
  if (!normalized) return null
  return SOURCE_PRODUCT_RULE_MAP.get(normalized) || null
}

export function getPackMultiplierBySourceProductId(sourceProductId?: string | null): number | null {
  const multiplier = getCommerceSourceProductRule(sourceProductId)?.packMultiplier
  return Number.isFinite(multiplier) && Number(multiplier) > 0 ? Number(multiplier) : null
}

export function getCanonicalGroupBySourceProductId(sourceProductId?: string | null): string {
  return getCommerceSourceProductRule(sourceProductId)?.canonicalGroup || ''
}

export function isThreeFlavorSetSourceProduct(sourceProductId?: string | null): boolean {
  return Boolean(getCommerceSourceProductRule(sourceProductId)?.threeFlavorSet)
}

export function isOptionSensitiveSourceProduct(sourceProductId?: string | null): boolean {
  return Boolean(getCommerceSourceProductRule(sourceProductId)?.optionSensitive)
}

function normalizeText(value?: string | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^0-9a-z가-힣]/g, '')
}

function trimOption(value?: string | null): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function detectKeywordVariant(
  productName: string,
  optionInfo: string,
  variants: { keywords: string[]; canonical: string }[],
  preferOptionInfo = false,
): string {
  const normalizedOption = normalizeText(optionInfo)
  const normalizedProduct = normalizeText(productName)
  const sources = preferOptionInfo
    ? [normalizedOption, normalizedProduct]
    : [`${normalizedOption}${normalizedProduct}`, normalizedOption, normalizedProduct]

  for (const source of sources) {
    if (!source) continue
    for (const variant of variants) {
      if (variant.keywords.some((keyword) => source.includes(normalizeText(keyword)))) {
        return variant.canonical
      }
    }
  }

  return ''
}

function detectFlavorVariant(productName: string, optionInfo: string): string {
  return detectKeywordVariant(productName, optionInfo, [
    { canonical: '3종세트', keywords: ['3종세트', '3종 세트'] },
    { canonical: '북어', keywords: ['북어', '황태'] },
    { canonical: '연어', keywords: ['연어'] },
    { canonical: '치킨', keywords: ['치킨', '닭가슴살', '닭고기'] },
  ])
}

function detectColorVariant(productName: string, optionInfo: string, colors: { keywords: string[]; canonical: string }[]): string {
  return detectKeywordVariant(productName, optionInfo, colors, true)
}

function detectSpeciesVariant(productName: string, optionInfo: string): string {
  return detectKeywordVariant(productName, optionInfo, [
    { canonical: '강아지용', keywords: ['강아지용', '강아지 도시락', '강아지'] },
    { canonical: '고양이용', keywords: ['고양이용', '고양이 도시락', '고양이'] },
  ], true)
}

function detectChuraitVariant(productName: string, optionInfo: string): string {
  return detectKeywordVariant(productName, optionInfo, [
    { canonical: '데일리핏', keywords: ['데일리핏', '데일리펫'] },
    { canonical: '브라이트', keywords: ['브라이트'] },
    { canonical: '클린펫', keywords: ['클린펫'] },
  ], true)
}

function resolveCanonicalOption(canonicalGroup: string, productName: string, optionInfo: string): string {
  if (canonicalGroup === '애착트릿' || canonicalGroup === '동결건조리뉴얼전') {
    return detectFlavorVariant(productName, optionInfo)
  }

  if (canonicalGroup === '츄르짜개') {
    return detectColorVariant(productName, optionInfo, [
      { canonical: '옐로', keywords: ['옐로', 'yellow'] },
      { canonical: '블루', keywords: ['블루', 'blue'] },
      { canonical: '퍼플', keywords: ['퍼플', 'purple'] },
    ])
  }

  if (canonicalGroup === '트릿백') {
    return detectColorVariant(productName, optionInfo, [
      { canonical: '민트', keywords: ['민트', 'mint'] },
      { canonical: '퍼플', keywords: ['퍼플', 'purple'] },
    ])
  }

  if (canonicalGroup === '도시락샘플') {
    return detectSpeciesVariant(productName, optionInfo)
  }

  if (canonicalGroup === '맛보기') {
    const normalized = normalizeText(`${optionInfo} ${productName}`)
    if (normalized.includes('애착트릿')) return '애착트릿 3종'
    if (normalized.includes('츄라잇')) return '츄라잇 3종'
    if (normalized.includes('케어푸')) return '케어푸'
    if (normalized.includes('이즈바이트')) return '이즈바이트'
    if (normalized.includes('엔자이츄')) return '엔자이츄'
    return trimOption(optionInfo)
  }

  if (canonicalGroup === '츄라잇') {
    return detectChuraitVariant(productName, optionInfo) || trimOption(optionInfo)
  }

  return trimOption(optionInfo)
}
function resolveCanonicalProductName(canonicalGroup: string): string {
  if (canonicalGroup === '트릿백') return '미니 트릿백'
  if (canonicalGroup === '츄르짜개') return '츄르짜개 (고양이 간식 디스펜서)'
  if (canonicalGroup === '도시락샘플') return '도시락 샘플팩'
  if (canonicalGroup === '맛보기') return '전제품 맛보기 샘플'
  if (canonicalGroup === '동결건조리뉴얼전') return '동결건조(리뉴얼전)'
  return canonicalGroup
}

export function resolveCommerceSourceProduct(
  input: {
    sourceProductId?: string | null
    productName?: string | null
    optionInfo?: string | null
  },
): ResolvedCommerceSourceProduct | null {
  const rule = getCommerceSourceProductRule(input.sourceProductId)
  if (!rule) return null

  const productName = String(input.productName || '')
  const optionInfo = String(input.optionInfo || '')
  const canonicalGroup = rule.canonicalGroup
  const canonicalProductName = resolveCanonicalProductName(canonicalGroup)
  const canonicalOptionInfo = resolveCanonicalOption(canonicalGroup, productName, optionInfo)
  const needsReview = Boolean(rule.optionSensitive) && !canonicalOptionInfo

  return {
    matched: true,
    canonicalGroup,
    canonicalProductName,
    canonicalOptionInfo,
    needsReview,
    reason: needsReview
      ? `source product matched but option unresolved: ${rule.sourceProductId}`
      : `source product matched: ${rule.sourceProductId}`,
  }
}
