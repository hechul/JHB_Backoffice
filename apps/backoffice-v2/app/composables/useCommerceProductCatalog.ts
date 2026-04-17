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

const LEGACY_SOURCE_PRODUCT_RULES: CommerceSourceProductRule[] = [
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

function parseCoupangPackMultiplier(itemName: string): number | undefined {
  const normalized = trimOption(itemName)
  if (!normalized) return undefined

  const comboMatch = normalized.match(/^\d+개\s+(.+)$/)
  if (comboMatch?.[1]) {
    const comboCount = comboMatch[1]
      .split('+')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .length
    if (comboCount > 1) return comboCount
  }

  const countMatch = normalized.match(/^(\d+)개/)
  if (!countMatch) return undefined
  const count = Number.parseInt(countMatch[1] || '', 10)
  return Number.isFinite(count) && count > 0 ? count : undefined
}

function buildCoupangRule(
  sourceProductId: string,
  canonicalGroup: string,
  itemName: string,
  options: {
    optionSensitive?: boolean
    threeFlavorSet?: boolean
    packMultiplier?: number
  } = {},
): CommerceSourceProductRule {
  return {
    sourceProductId,
    canonicalGroup,
    optionSensitive: Boolean(options.optionSensitive),
    threeFlavorSet: Boolean(options.threeFlavorSet),
    packMultiplier: options.threeFlavorSet
      ? undefined
      : (options.packMultiplier || parseCoupangPackMultiplier(itemName)),
  }
}

const COUPANG_SOURCE_PRODUCT_RULES: CommerceSourceProductRule[] = [
  // 트릿백
  buildCoupangRule('94054315326', '트릿백', '1개 민트', { optionSensitive: true }),
  buildCoupangRule('94165163695', '트릿백', '1개 민트', { optionSensitive: true }),
  buildCoupangRule('94054315325', '트릿백', '1개 퍼플', { optionSensitive: true }),
  buildCoupangRule('94165163696', '트릿백', '1개 퍼플', { optionSensitive: true }),
  buildCoupangRule('94855858568', '트릿백', '1개 민트+퍼플', { optionSensitive: true }),
  buildCoupangRule('94855858569', '트릿백', '1개 민트+퍼플', { optionSensitive: true }),
  buildCoupangRule('94659189888', '트릿백', '2개 민트', { optionSensitive: true }),
  buildCoupangRule('94659189884', '트릿백', '2개 퍼플', { optionSensitive: true }),
  buildCoupangRule('94659189887', '트릿백', '3개 민트', { optionSensitive: true }),
  buildCoupangRule('94659189882', '트릿백', '3개 퍼플', { optionSensitive: true }),

  // 짜개
  buildCoupangRule('94054186931', '츄르짜개', '1개 블루', { optionSensitive: true }),
  buildCoupangRule('94165160425', '츄르짜개', '1개 블루', { optionSensitive: true }),
  buildCoupangRule('94054186932', '츄르짜개', '1개 옐로', { optionSensitive: true }),
  buildCoupangRule('94165160424', '츄르짜개', '1개 옐로', { optionSensitive: true }),
  buildCoupangRule('94054186933', '츄르짜개', '1개 퍼플', { optionSensitive: true }),
  buildCoupangRule('94165160423', '츄르짜개', '1개 퍼플', { optionSensitive: true }),
  buildCoupangRule('94782798347', '츄르짜개', '1개 블루+옐로', { optionSensitive: true }),
  buildCoupangRule('94782798352', '츄르짜개', '1개 블루+옐로', { optionSensitive: true }),
  buildCoupangRule('94782798348', '츄르짜개', '1개 블루+퍼플', { optionSensitive: true }),
  buildCoupangRule('94782798354', '츄르짜개', '1개 블루+퍼플', { optionSensitive: true }),
  buildCoupangRule('94782798351', '츄르짜개', '1개 옐로+퍼플', { optionSensitive: true }),
  buildCoupangRule('94782798353', '츄르짜개', '1개 옐로+퍼플', { optionSensitive: true }),
  buildCoupangRule('94782798349', '츄르짜개', '1개 블루+옐로+퍼플', { optionSensitive: true }),
  buildCoupangRule('94782798350', '츄르짜개', '1개 블루+옐로+퍼플', { optionSensitive: true }),
  buildCoupangRule('94659189252', '츄르짜개', '2개 블루', { optionSensitive: true }),
  buildCoupangRule('94659189253', '츄르짜개', '2개 옐로', { optionSensitive: true }),
  buildCoupangRule('94659189250', '츄르짜개', '2개 퍼플', { optionSensitive: true }),
  buildCoupangRule('94659189248', '츄르짜개', '3개 블루', { optionSensitive: true }),
  buildCoupangRule('94659189251', '츄르짜개', '3개 옐로', { optionSensitive: true }),
  buildCoupangRule('94659189249', '츄르짜개', '3개 퍼플', { optionSensitive: true }),

  // 츄라잇
  buildCoupangRule('93923679757', '츄라잇', '14개 10g 종합영양제', { optionSensitive: true, packMultiplier: 1 }),
  buildCoupangRule('94132827866', '츄라잇', '14개 10g 종합영양제', { optionSensitive: true, packMultiplier: 1 }),
  buildCoupangRule('93923679755', '츄라잇', '14개 10g 유리너리+장건강', { optionSensitive: true, packMultiplier: 1 }),
  buildCoupangRule('94132827864', '츄라잇', '14개 10g 유리너리+장건강', { optionSensitive: true, packMultiplier: 1 }),
  buildCoupangRule('93923679756', '츄라잇', '14개 10g 눈물개선/눈건강', { optionSensitive: true, packMultiplier: 1 }),
  buildCoupangRule('94132827865', '츄라잇', '14개 10g 눈물개선/눈건강', { optionSensitive: true, packMultiplier: 1 }),
  buildCoupangRule('94363413994', '츄라잇', '28개 10g 종합영양제', { optionSensitive: true, packMultiplier: 2 }),
  buildCoupangRule('94363413993', '츄라잇', '28개 10g 유리너리+장건강', { optionSensitive: true, packMultiplier: 2 }),
  buildCoupangRule('94363413992', '츄라잇', '28개 10g 눈물개선/눈건강', { optionSensitive: true, packMultiplier: 2 }),
  buildCoupangRule('94363315737', '츄라잇', '42개 10g 종합영양제', { optionSensitive: true, packMultiplier: 3 }),
  buildCoupangRule('94363315736', '츄라잇', '42개 10g 유리너리+장건강', { optionSensitive: true, packMultiplier: 3 }),
  buildCoupangRule('94363315735', '츄라잇', '42개 10g 눈물개선/눈건강', { optionSensitive: true, packMultiplier: 3 }),
  buildCoupangRule('94879329297', '츄라잇', '84개 10g 종합영양제', { optionSensitive: true, packMultiplier: 6 }),
  buildCoupangRule('94879329298', '츄라잇', '84개 10g 유리너리+장건강', { optionSensitive: true, packMultiplier: 6 }),
  buildCoupangRule('94879329299', '츄라잇', '84개 10g 눈물개선/눈건강', { optionSensitive: true, packMultiplier: 6 }),

  // 이즈바이트
  buildCoupangRule('93885445344', '이즈바이트', '1개 꿀고구마맛 91g'),
  buildCoupangRule('94165125993', '이즈바이트', '1개 꿀고구마맛 91g'),
  buildCoupangRule('94380472325', '이즈바이트', '2개 꿀고구마맛 91g'),
  buildCoupangRule('94879358700', '이즈바이트', '3개 꿀고구마맛 91g'),
  buildCoupangRule('94879358699', '이즈바이트', '4개 꿀고구마맛 91g'),

  // 엔자이츄
  buildCoupangRule('93885404452', '엔자이츄', '1개 꿀고구마맛 100g'),
  buildCoupangRule('94132809744', '엔자이츄', '1개 꿀고구마맛 100g'),
  buildCoupangRule('94380474419', '엔자이츄', '2개 꿀고구마맛 100g'),
  buildCoupangRule('94380474418', '엔자이츄', '3개 꿀고구마맛 100g'),
  buildCoupangRule('94854392237', '엔자이츄', '4개 꿀고구마맛 100g'),
  buildCoupangRule('94854392236', '엔자이츄', '5개 꿀고구마맛 100g'),
  buildCoupangRule('94854392235', '엔자이츄', '6개 꿀고구마맛 100g'),

  // 케어푸
  buildCoupangRule('93671525655', '케어푸', '1개 60g 장건강/유산균'),
  buildCoupangRule('94165127355', '케어푸', '1개 60g 장건강/유산균'),
  buildCoupangRule('94380487590', '케어푸', '2개 60g 장건강/유산균'),
  buildCoupangRule('94380487588', '케어푸', '3개 60g 장건강/유산균'),

  // 애착트릿 3종
  buildCoupangRule('91677910749', '애착트릿', '단일상품', { threeFlavorSet: true }),

  // 애착트릿 치킨
  buildCoupangRule('91677888252', '애착트릿', '1개 치킨 100g'),
  buildCoupangRule('94311402237', '애착트릿', '1개 치킨 100g'),
  buildCoupangRule('94362822522', '애착트릿', '2개 치킨 100g'),
  buildCoupangRule('91677888261', '애착트릿', '3개 치킨 100g'),
  buildCoupangRule('94311402236', '애착트릿', '3개 치킨 100g'),
  buildCoupangRule('91677888265', '애착트릿', '6개 치킨 100g'),
  buildCoupangRule('94311402240', '애착트릿', '6개 치킨 100g'),
  buildCoupangRule('91677888256', '애착트릿', '12개 치킨 100g'),
  buildCoupangRule('94311402238', '애착트릿', '12개 치킨 100g'),
  buildCoupangRule('94285648516', '애착트릿', '1개 치킨 120g'),
  buildCoupangRule('94311402239', '애착트릿', '1개 치킨 120g'),
  buildCoupangRule('94492529867', '애착트릿', '2개 치킨 120g'),
  buildCoupangRule('94285648517', '애착트릿', '3개 치킨 120g'),
  buildCoupangRule('94311402234', '애착트릿', '3개 치킨 120g'),
  buildCoupangRule('94285648518', '애착트릿', '6개 치킨 120g'),
  buildCoupangRule('94311402235', '애착트릿', '6개 치킨 120g'),
  buildCoupangRule('94285648519', '애착트릿', '12개 치킨 120g'),
  buildCoupangRule('94311402233', '애착트릿', '12개 치킨 120g'),

  // 애착트릿 연어
  buildCoupangRule('91677861362', '애착트릿', '1개 연어 90g'),
  buildCoupangRule('94311465300', '애착트릿', '1개 연어 90g'),
  buildCoupangRule('94362984875', '애착트릿', '2개 연어 90g'),
  buildCoupangRule('91677861356', '애착트릿', '3개 연어 90g'),
  buildCoupangRule('94311465302', '애착트릿', '3개 연어 90g'),
  buildCoupangRule('91677861369', '애착트릿', '6개 연어 90g'),
  buildCoupangRule('94311465305', '애착트릿', '6개 연어 90g'),
  buildCoupangRule('91677861350', '애착트릿', '12개 연어 90g'),
  buildCoupangRule('94311465306', '애착트릿', '12개 연어 90g'),
  buildCoupangRule('94285608620', '애착트릿', '1개 연어 110g'),
  buildCoupangRule('94311465299', '애착트릿', '1개 연어 110g'),
  buildCoupangRule('94380460125', '애착트릿', '2개 연어 110g'),
  buildCoupangRule('94285608619', '애착트릿', '3개 연어 110g'),
  buildCoupangRule('94311465304', '애착트릿', '3개 연어 110g'),
  buildCoupangRule('94285608622', '애착트릿', '6개 연어 110g'),
  buildCoupangRule('94311465301', '애착트릿', '6개 연어 110g'),
  buildCoupangRule('94285608621', '애착트릿', '12개 연어 110g'),
  buildCoupangRule('94311465303', '애착트릿', '12개 연어 110g'),

  // 애착트릿 북어
  buildCoupangRule('91677861786', '애착트릿', '1개 북어 80g'),
  buildCoupangRule('94311404991', '애착트릿', '1개 북어 80g'),
  buildCoupangRule('91677861797', '애착트릿', '3개 북어 80g'),
  buildCoupangRule('94311404989', '애착트릿', '3개 북어 80g'),
  buildCoupangRule('91677861803', '애착트릿', '6개 북어 80g'),
  buildCoupangRule('94311404992', '애착트릿', '6개 북어 80g'),
  buildCoupangRule('91677861791', '애착트릿', '12개 북어 80g'),
  buildCoupangRule('94311404986', '애착트릿', '12개 북어 80g'),
  buildCoupangRule('94285626060', '애착트릿', '1개 북어 100g'),
  buildCoupangRule('94311404987', '애착트릿', '1개 북어 100g'),
  buildCoupangRule('94380451365', '애착트릿', '2개 북어 100g'),
  buildCoupangRule('94285626059', '애착트릿', '3개 북어 100g'),
  buildCoupangRule('94311404988', '애착트릿', '3개 북어 100g'),
  buildCoupangRule('94285626057', '애착트릿', '6개 북어 100g'),
  buildCoupangRule('94311404990', '애착트릿', '6개 북어 100g'),
  buildCoupangRule('94285626058', '애착트릿', '12개 북어 100g'),
  buildCoupangRule('94311404993', '애착트릿', '12개 북어 100g'),
]

const SOURCE_PRODUCT_RULES: CommerceSourceProductRule[] = [
  ...LEGACY_SOURCE_PRODUCT_RULES,
  ...COUPANG_SOURCE_PRODUCT_RULES,
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
