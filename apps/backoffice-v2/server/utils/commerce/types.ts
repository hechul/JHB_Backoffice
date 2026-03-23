export type CommerceChannel = 'naver' | 'coupang' | 'kakao' | 'excel'

export type CommerceMappingMode =
  | 'product_id_only'
  | 'product_id_option'
  | 'name_option_rule'
  | 'manual'

export interface CommerceOrderLineInput {
  sourceChannel: CommerceChannel
  sourceAccountKey?: string | null
  sourceOrderId?: string | null
  sourceLineId: string
  sourceProductId?: string | null
  sourceOptionCode?: string | null
  productName: string
  optionInfo?: string | null
  orderStatus?: string | null
  claimStatus?: string | null
  quantity?: number | null
}

export interface VariantKeywordRule {
  variant: string
  keywords: string[]
}

export interface NameOptionRuleConfig {
  variants: VariantKeywordRule[]
  preferOptionInfo?: boolean
  fallbackVariant?: string | null
}

export interface CommerceMappingRuleConfig {
  matchingMode: CommerceMappingMode
  canonicalVariant?: string | null
  optionKeywords?: string[]
  nameOptionRule?: NameOptionRuleConfig
}

export interface CommerceMappingDecision {
  matched: boolean
  needsReview: boolean
  matchingMode: CommerceMappingMode
  canonicalVariant: string | null
  reason: string
}

export interface CommerceOrderEligibility {
  eligible: boolean
  reason: string
}
