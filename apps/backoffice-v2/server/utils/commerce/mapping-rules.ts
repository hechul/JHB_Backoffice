import type {
  CommerceMappingDecision,
  CommerceMappingRuleConfig,
  NameOptionRuleConfig,
} from './types'

function normalizeText(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword)
    return normalizedKeyword.length > 0 && text.includes(normalizedKeyword)
  })
}

function resolveNameOptionVariant(
  config: NameOptionRuleConfig,
  productName?: string | null,
  optionInfo?: string | null,
): CommerceMappingDecision {
  const normalizedProductName = normalizeText(productName)
  const normalizedOptionInfo = normalizeText(optionInfo)
  const primaryText = config.preferOptionInfo
    ? `${normalizedOptionInfo} ${normalizedProductName}`.trim()
    : `${normalizedProductName} ${normalizedOptionInfo}`.trim()

  for (const variantRule of config.variants) {
    if (includesAnyKeyword(primaryText, variantRule.keywords)) {
      return {
        matched: true,
        needsReview: false,
        matchingMode: 'name_option_rule',
        canonicalVariant: variantRule.variant,
        reason: `matched variant keywords: ${variantRule.variant}`,
      }
    }
  }

  if (config.fallbackVariant) {
    return {
      matched: true,
      needsReview: true,
      matchingMode: 'name_option_rule',
      canonicalVariant: config.fallbackVariant,
      reason: `fallback variant used: ${config.fallbackVariant}`,
    }
  }

  return {
    matched: false,
    needsReview: true,
    matchingMode: 'name_option_rule',
    canonicalVariant: null,
    reason: 'no variant keyword matched',
  }
}

export function resolveCommerceMappingDecision(input: {
  config: CommerceMappingRuleConfig
  productName?: string | null
  optionInfo?: string | null
  sourceOptionCode?: string | null
}): CommerceMappingDecision {
  const { config, productName, optionInfo, sourceOptionCode } = input
  const normalizedOptionInfo = normalizeText(optionInfo)
  const normalizedOptionCode = normalizeText(sourceOptionCode)

  if (config.matchingMode === 'product_id_only') {
    return {
      matched: true,
      needsReview: false,
      matchingMode: config.matchingMode,
      canonicalVariant: config.canonicalVariant ?? null,
      reason: 'matched by product id only',
    }
  }

  if (config.matchingMode === 'product_id_option') {
    const keywords = config.optionKeywords ?? []
    const matched =
      includesAnyKeyword(normalizedOptionInfo, keywords) ||
      includesAnyKeyword(normalizedOptionCode, keywords)

    return {
      matched,
      needsReview: !matched,
      matchingMode: config.matchingMode,
      canonicalVariant: matched ? config.canonicalVariant ?? null : null,
      reason: matched ? 'matched by option keyword' : 'option keyword not matched',
    }
  }

  if (config.matchingMode === 'name_option_rule') {
    if (!config.nameOptionRule) {
      return {
        matched: false,
        needsReview: true,
        matchingMode: config.matchingMode,
        canonicalVariant: null,
        reason: 'name_option_rule config missing',
      }
    }

    return resolveNameOptionVariant(config.nameOptionRule, productName, optionInfo)
  }

  return {
    matched: false,
    needsReview: true,
    matchingMode: config.matchingMode,
    canonicalVariant: config.canonicalVariant ?? null,
    reason: 'manual review required',
  }
}

export const ATTACH_TRIT_RENEWAL_RULE: NameOptionRuleConfig = {
  preferOptionInfo: true,
  variants: [
    { variant: '치킨', keywords: ['치킨'] },
    { variant: '연어', keywords: ['연어'] },
    { variant: '북어', keywords: ['북어'] },
  ],
}
