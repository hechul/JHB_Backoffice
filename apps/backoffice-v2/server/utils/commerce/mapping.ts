import { resolveCommerceMappingDecision } from './mapping-rules.ts'
import type { CommerceMappingMode } from './types.ts'

export interface CommerceProductMappingRow {
  id?: number | null
  source_channel: string
  source_account_key: string
  commerce_product_id: string
  commerce_option_code: string
  commerce_product_name: string
  commerce_option_name: string
  internal_product_id: string
  matching_mode: CommerceMappingMode
  canonical_variant: string
  rule_json?: Record<string, any> | null
  priority?: number | null
  is_active?: boolean | null
}

export interface CommerceProductMappingLookup {
  byCommerceProductId: Map<string, CommerceProductMappingRow[]>
}

export interface ResolvedCommerceProductMapping {
  matched: boolean
  internalProductId: string | null
  canonicalVariant: string | null
  matchingMode: CommerceMappingMode | null
  needsReview: boolean
  reason: string
}

function normalizeText(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeCompactText(value?: string | null): string {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function toPositivePriority(value?: number | null): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 100
}

function buildOptionKeywords(row: CommerceProductMappingRow): string[] {
  const ruleJson = row.rule_json || {}
  const keywords = Array.isArray(ruleJson.optionKeywords)
    ? ruleJson.optionKeywords
    : [row.canonical_variant, row.commerce_option_name, row.commerce_option_code]

  return keywords
    .map((value) => normalizeCompactText(String(value || '')))
    .filter(Boolean)
}

function buildNameOptionRule(row: CommerceProductMappingRow) {
  const ruleJson = row.rule_json || {}
  const variantKeywords = Array.isArray(ruleJson.variantKeywords)
    ? ruleJson.variantKeywords.map((value: unknown) => String(value || ''))
    : [row.canonical_variant, row.commerce_option_name]

  return {
    preferOptionInfo: ruleJson.preferOptionInfo !== false,
    variants: [
      {
        variant: row.canonical_variant || row.commerce_option_name || '',
        keywords: variantKeywords.filter(Boolean),
      },
    ],
  }
}

function getScopedRows(
  rows: CommerceProductMappingRow[],
  sourceAccountKey?: string | null,
): CommerceProductMappingRow[] {
  const normalizedAccountKey = normalizeText(sourceAccountKey)
  const exactRows = normalizedAccountKey
    ? rows.filter((row) => normalizeText(row.source_account_key) === normalizedAccountKey)
    : []

  if (exactRows.length > 0) {
    return exactRows
  }

  const defaultRows = rows.filter((row) => normalizeText(row.source_account_key) === 'default')
  return defaultRows.length > 0 ? defaultRows : rows
}

function selectBestRow(
  rows: CommerceProductMappingRow[],
  matchingMode: CommerceMappingMode | null,
  canonicalVariant: string | null,
  reason: string,
): ResolvedCommerceProductMapping {
  if (rows.length === 0) {
    return {
      matched: false,
      internalProductId: null,
      canonicalVariant,
      matchingMode,
      needsReview: false,
      reason,
    }
  }

  const ordered = [...rows].sort((a, b) => {
    const priorityDiff = toPositivePriority(a.priority) - toPositivePriority(b.priority)
    if (priorityDiff !== 0) return priorityDiff
    return (a.id || 0) - (b.id || 0)
  })
  const bestPriority = toPositivePriority(ordered[0]?.priority)
  const topRows = ordered.filter((row) => toPositivePriority(row.priority) === bestPriority)
  const internalIds = [...new Set(topRows.map((row) => row.internal_product_id))]

  if (internalIds.length !== 1) {
    return {
      matched: false,
      internalProductId: null,
      canonicalVariant,
      matchingMode,
      needsReview: true,
      reason: `${reason}; ambiguous mapping candidates`,
    }
  }

  return {
    matched: true,
    internalProductId: internalIds[0],
    canonicalVariant,
    matchingMode,
    needsReview: false,
    reason,
  }
}

export function buildCommerceProductMappingLookup(
  rows: CommerceProductMappingRow[],
): CommerceProductMappingLookup {
  const byCommerceProductId = new Map<string, CommerceProductMappingRow[]>()

  for (const row of rows) {
    if (!row?.is_active) continue
    const commerceProductId = normalizeText(row.commerce_product_id)
    if (!commerceProductId) continue
    const bucket = byCommerceProductId.get(commerceProductId) || []
    bucket.push(row)
    byCommerceProductId.set(commerceProductId, bucket)
  }

  return { byCommerceProductId }
}

export function resolveCommerceProductMapping(input: {
  lookup: CommerceProductMappingLookup
  sourceAccountKey?: string | null
  commerceProductId?: string | null
  commerceOptionCode?: string | null
  productName?: string | null
  optionInfo?: string | null
  canonicalOptionInfo?: string | null
}): ResolvedCommerceProductMapping {
  const commerceProductId = normalizeText(input.commerceProductId)
  if (!commerceProductId) {
    return {
      matched: false,
      internalProductId: null,
      canonicalVariant: null,
      matchingMode: null,
      needsReview: false,
      reason: 'commerce product id missing',
    }
  }

  const allRows = input.lookup.byCommerceProductId.get(commerceProductId) || []
  if (allRows.length === 0) {
    return {
      matched: false,
      internalProductId: null,
      canonicalVariant: null,
      matchingMode: null,
      needsReview: false,
      reason: `no mapping rows for ${commerceProductId}`,
    }
  }

  const rows = getScopedRows(allRows, input.sourceAccountKey)
  const canonicalVariant = normalizeCompactText(input.canonicalOptionInfo)
  const sourceOptionCode = normalizeCompactText(input.commerceOptionCode)
  const rawOptionInfo = normalizeCompactText(input.optionInfo)

  if (sourceOptionCode) {
    const optionCodeRows = rows.filter((row) => normalizeCompactText(row.commerce_option_code) === sourceOptionCode)
    const resolved = selectBestRow(
      optionCodeRows,
      optionCodeRows[0]?.matching_mode || null,
      optionCodeRows[0]?.canonical_variant || null,
      'matched by commerce option code',
    )
    if (resolved.matched || resolved.needsReview) {
      return resolved
    }
  }

  if (canonicalVariant) {
    const canonicalRows = rows.filter((row) => normalizeCompactText(row.canonical_variant) === canonicalVariant)
    const resolved = selectBestRow(
      canonicalRows,
      canonicalRows[0]?.matching_mode || null,
      canonicalRows[0]?.canonical_variant || null,
      'matched by canonical variant',
    )
    if (resolved.matched || resolved.needsReview) {
      return resolved
    }
  }

  if (rawOptionInfo) {
    const optionNameRows = rows.filter((row) => normalizeCompactText(row.commerce_option_name) === rawOptionInfo)
    const resolved = selectBestRow(
      optionNameRows,
      optionNameRows[0]?.matching_mode || null,
      optionNameRows[0]?.canonical_variant || null,
      'matched by commerce option name',
    )
    if (resolved.matched || resolved.needsReview) {
      return resolved
    }
  }

  const decisionMatches = rows.flatMap((row) => {
    const config = {
      matchingMode: row.matching_mode,
      canonicalVariant: row.canonical_variant || null,
      optionKeywords: buildOptionKeywords(row),
      nameOptionRule: buildNameOptionRule(row),
    }

    const decision = resolveCommerceMappingDecision({
      config,
      productName: input.productName,
      optionInfo: row.matching_mode === 'name_option_rule'
        ? input.optionInfo
        : (input.canonicalOptionInfo || input.optionInfo),
      sourceOptionCode: input.commerceOptionCode,
    })

    return decision.matched
      ? [{ row, decision }]
      : []
  })

  if (decisionMatches.length > 0) {
    const canonicalVariantFromDecision = decisionMatches[0]?.decision.canonicalVariant || null
    const matchingMode = decisionMatches[0]?.decision.matchingMode || null
    return selectBestRow(
      decisionMatches.map((entry) => entry.row),
      matchingMode,
      canonicalVariantFromDecision,
      decisionMatches[0]?.decision.reason || 'matched by rule config',
    )
  }

  const productIdOnlyRows = rows.filter((row) => row.matching_mode === 'product_id_only')
  if (productIdOnlyRows.length > 0) {
    return selectBestRow(
      productIdOnlyRows,
      'product_id_only',
      productIdOnlyRows[0]?.canonical_variant || null,
      'matched by product id only',
    )
  }

  return {
    matched: false,
    internalProductId: null,
    canonicalVariant: canonicalVariant || null,
    matchingMode: null,
    needsReview: rows.some((row) => row.matching_mode !== 'product_id_only'),
    reason: `mapping rows found for ${commerceProductId} but no rule matched`,
  }
}
