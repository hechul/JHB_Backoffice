// =====================================================================
// mapping.ts
// 역할: commerce_product_mappings DB 테이블 기반 "외부 상품 → 내부 상품" 정밀 매핑
// 왜 필요: 네이버 상품번호/옵션코드는 내부 products 테이블과 다른 체계를 사용한다.
//          이 파일이 둘을 연결하는 규칙을 관리한다.
//          우선순위: 옵션 코드 일치 > canonical_variant 일치 > 옵션명 일치 > 규칙 기반 매칭 > 상품ID만 매칭
// 사용처: naver-sync.ts의 resolveNaverSyncRecord()에서 호출됨
// =====================================================================

// 매핑 룰 엔진 — matching_mode별 매핑 결정 로직
import { resolveCommerceMappingDecision } from './mapping-rules.ts'
// CommerceMappingMode 타입 ('product_id_only' | 'product_id_option' | 'name_option_rule' | 'manual')
import type { CommerceFulfillmentType, CommerceMappingMode } from './types.ts'

// =====================================================================
// 타입 정의
// =====================================================================

// commerce_product_mappings DB 테이블의 1행을 나타내는 타입
// 이 테이블에 네이버 상품번호/옵션 → 내부 product_id 매핑 규칙을 등록한다
export interface CommerceProductMappingRow {
  id?: number | null                     // DB 자동 생성 PK (우선순위 타이브레이크에 사용)
  source_channel: string                 // 채널 ('naver')
  source_fulfillment_type?: CommerceFulfillmentType | null // 채널 내부 fulfillment 유형
  source_account_key: string             // 계정 키 ('default' 또는 특정 계정)
  commerce_product_id: string            // 네이버 상품 번호
  commerce_option_code: string           // 네이버 옵션 코드 (optionCode)
  commerce_product_name: string          // 네이버 상품명 (참고용)
  commerce_option_name: string           // 네이버 옵션명 (참고용)
  internal_product_id: string            // 매핑할 내부 products.product_id
  matching_mode: CommerceMappingMode     // 매핑 판단 방식
  canonical_variant: string              // 내부 표준 옵션명 (option_info에 저장될 값)
  rule_json?: Record<string, any> | null // 매핑 모드별 추가 설정 (키워드 목록 등)
  priority?: number | null               // 규칙 우선순위 (낮을수록 먼저 적용)
  is_active?: boolean | null             // 활성화 여부 (false면 조회 제외)
}

// buildCommerceProductMappingLookup()이 반환하는 in-memory 인덱스 타입
// 상품번호 → 해당 상품의 모든 매핑 규칙 배열
export interface CommerceProductMappingLookup {
  byCommerceProductId: Map<string, CommerceProductMappingRow[]>
  byCommerceProductIdAndFulfillmentType: Map<string, CommerceProductMappingRow[]>
}

// resolveCommerceProductMapping()의 반환 타입
export interface ResolvedCommerceProductMapping {
  matched: boolean                       // 매핑 성공 여부
  internalProductId: string | null       // 매핑된 내부 상품 ID (실패 시 null)
  canonicalVariant: string | null        // 매핑된 canonical 옵션명
  matchingMode: CommerceMappingMode | null // 어떤 매핑 모드로 결정됐는지
  needsReview: boolean                   // 검토 필요 여부 (애매한 매핑 등)
  reason: string                         // 매핑 결과 상세 이유 (로그/디버깅용)
}

// =====================================================================
// 내부 헬퍼 함수
// =====================================================================

// 텍스트 정규화: 소문자 + trim (대소문자 무관 비교용)
function normalizeText(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

// 텍스트 정규화 + 연속 공백 단일 공백으로 압축 (옵션 코드 비교용)
function normalizeCompactText(value?: string | null): string {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function normalizeFulfillmentType(value?: CommerceFulfillmentType | string | null): CommerceFulfillmentType {
  const normalized = normalizeText(value)
  if (normalized === 'marketplace') return 'marketplace'
  if (normalized === 'rocket_growth') return 'rocket_growth'
  return 'default'
}

function buildLookupKey(commerceProductId: string, sourceFulfillmentType: CommerceFulfillmentType): string {
  return `${commerceProductId}::${sourceFulfillmentType}`
}

// priority 컬럼 값을 양의 정수로 변환 — null/NaN이면 100(낮은 우선순위)으로 폴백
function toPositivePriority(value?: number | null): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 100
}

/**
 * 매핑 행의 옵션 키워드 목록을 구성한다.
 * rule_json.optionKeywords가 있으면 그것을 사용하고,
 * 없으면 canonical_variant, commerce_option_name, commerce_option_code 순으로 폴백한다.
 * product_id_option 매핑 모드에서 옵션 텍스트 포함 여부 판단에 사용된다.
 */
function buildOptionKeywords(row: CommerceProductMappingRow): string[] {
  const ruleJson = row.rule_json || {}
  const keywords = Array.isArray(ruleJson.optionKeywords)
    ? ruleJson.optionKeywords                            // rule_json에 직접 정의된 키워드 우선
    : [row.canonical_variant, row.commerce_option_name, row.commerce_option_code] // 폴백

  return keywords
    .map((value) => normalizeCompactText(String(value || ''))) // 정규화
    .filter(Boolean) // 빈 문자열 제거
}

/**
 * name_option_rule 매핑 모드를 위한 규칙 객체를 구성한다.
 * 상품명 + 옵션명 텍스트 안에 variant 키워드가 포함됐는지 판단하는 규칙이다.
 * rule_json.variantKeywords가 있으면 사용, 없으면 canonical_variant/commerce_option_name 폴백.
 */
function buildNameOptionRule(row: CommerceProductMappingRow) {
  const ruleJson = row.rule_json || {}
  const variantKeywords = Array.isArray(ruleJson.variantKeywords)
    ? ruleJson.variantKeywords.map((value: unknown) => String(value || ''))
    : [row.canonical_variant, row.commerce_option_name] // 폴백 키워드

  return {
    preferOptionInfo: ruleJson.preferOptionInfo !== false, // 옵션명 우선 검색 여부 (기본 true)
    variants: [
      {
        variant: row.canonical_variant || row.commerce_option_name || '', // 결정할 canonical 옵션명
        keywords: variantKeywords.filter(Boolean),                         // 매칭에 사용할 키워드 목록
      },
    ],
  }
}

/**
 * 계정 키로 매핑 규칙을 스코핑한다.
 * 특정 계정 전용 규칙이 있으면 그것만 반환하고,
 * 없으면 'default' 규칙을 반환한다 (공통 규칙).
 * 이렇게 해서 계정별 커스텀 override + 공통 기본 규칙 구조를 지원한다.
 */
function getScopedRows(
  rows: CommerceProductMappingRow[],
  sourceAccountKey?: string | null,
): CommerceProductMappingRow[] {
  const normalizedAccountKey = normalizeText(sourceAccountKey)
  // 특정 계정 키와 정확히 일치하는 규칙 먼저 탐색
  const exactRows = normalizedAccountKey
    ? rows.filter((row) => normalizeText(row.source_account_key) === normalizedAccountKey)
    : []

  if (exactRows.length > 0) {
    return exactRows // 계정 전용 규칙이 있으면 해당 규칙만 사용
  }

  // 없으면 'default' 규칙 사용 (공통 적용 규칙)
  const defaultRows = rows.filter((row) => normalizeText(row.source_account_key) === 'default')
  return defaultRows.length > 0 ? defaultRows : rows // default도 없으면 전체 반환
}

/**
 * 매칭된 행 목록에서 최선의 결과를 선택한다.
 * 선택 기준: 1) priority 오름차순 2) 같은 priority면 id 오름차순
 * 동일 priority에서 internal_product_id가 여러 개이면 ambiguous → needsReview=true 반환.
 */
function selectBestRow(
  rows: CommerceProductMappingRow[],
  matchingMode: CommerceMappingMode | null,
  canonicalVariant: string | null,
  reason: string,
): ResolvedCommerceProductMapping {
  if (rows.length === 0) {
    // 매칭된 행 없음 → 매핑 실패
    return {
      matched: false,
      internalProductId: null,
      canonicalVariant,
      matchingMode,
      needsReview: false,
      reason,
    }
  }

  // priority 오름차순, 동점이면 id 오름차순으로 정렬
  const ordered = [...rows].sort((a, b) => {
    const priorityDiff = toPositivePriority(a.priority) - toPositivePriority(b.priority)
    if (priorityDiff !== 0) return priorityDiff
    return (a.id || 0) - (b.id || 0)
  })

  const bestPriority = toPositivePriority(ordered[0]?.priority)
  // 최고 우선순위를 공유하는 행들만 추출
  const topRows = ordered.filter((row) => toPositivePriority(row.priority) === bestPriority)
  // 최고 우선순위 행들의 internal_product_id 중복 제거
  const internalIds = [...new Set(topRows.map((row) => row.internal_product_id))]

  if (internalIds.length !== 1) {
    // 같은 우선순위에서 2개 이상의 internal_product_id → 모호한 매핑 → 검토 필요
    return {
      matched: false,
      internalProductId: null,
      canonicalVariant,
      matchingMode,
      needsReview: true,
      reason: `${reason}; ambiguous mapping candidates`,
    }
  }

  // 정확히 1개의 internal_product_id → 매핑 성공
  return {
    matched: true,
    internalProductId: internalIds[0],
    canonicalVariant,
    matchingMode,
    needsReview: false,
    reason,
  }
}

// =====================================================================
// 공개 함수 (export)
// =====================================================================

/**
 * DB에서 조회한 commerce_product_mappings 행 배열을
 * 상품번호 기준 빠른 조회 Map으로 변환한다.
 *
 * 이 함수는 sync 시작 시 한 번 호출해 in-memory Map을 만든다.
 * 이후 주문 1건마다 resolveCommerceProductMapping()을 O(1)로 호출 가능하다.
 * is_active=false 행은 인덱스에서 제외된다.
 */
export function buildCommerceProductMappingLookup(
  rows: CommerceProductMappingRow[],
): CommerceProductMappingLookup {
  const byCommerceProductId = new Map<string, CommerceProductMappingRow[]>()
  const byCommerceProductIdAndFulfillmentType = new Map<string, CommerceProductMappingRow[]>()

  for (const row of rows) {
    if (!row?.is_active) continue // 비활성 규칙 제외
    const commerceProductId = normalizeText(row.commerce_product_id) // 상품번호 정규화 (소문자)
    if (!commerceProductId) continue // 상품번호 없으면 스킵
    const sourceFulfillmentType = normalizeFulfillmentType(row.source_fulfillment_type)
    const bucket = byCommerceProductId.get(commerceProductId) || [] // 기존 버킷 또는 빈 배열
    bucket.push(row)
    byCommerceProductId.set(commerceProductId, bucket)

    const scopedKey = buildLookupKey(commerceProductId, sourceFulfillmentType)
    const scopedBucket = byCommerceProductIdAndFulfillmentType.get(scopedKey) || []
    scopedBucket.push(row)
    byCommerceProductIdAndFulfillmentType.set(scopedKey, scopedBucket)
  }

  return {
    byCommerceProductId,
    byCommerceProductIdAndFulfillmentType,
  }
}

/**
 * 주문 1건의 상품 정보를 받아 내부 상품으로 매핑한다.
 *
 * 매핑 시도 순서:
 * 1. 옵션 코드 완전 일치 (commerce_option_code = source_option_code)
 * 2. canonical_variant 완전 일치
 * 3. 옵션명 완전 일치 (commerce_option_name = raw option info)
 * 4. 매핑 모드 규칙 적용 (product_id_option, name_option_rule 등)
 * 5. product_id_only 모드 (옵션 무관 상품 ID만으로 매핑)
 * 6. 모두 실패 시 매핑 불가 반환
 */
export function resolveCommerceProductMapping(input: {
  lookup: CommerceProductMappingLookup      // buildCommerceProductMappingLookup()의 결과
  sourceFulfillmentType?: CommerceFulfillmentType | null // fulfillment 유형
  sourceAccountKey?: string | null          // 요청 계정 키
  commerceProductId?: string | null         // 네이버 상품 번호
  commerceOptionCode?: string | null        // 네이버 옵션 코드
  productName?: string | null               // 네이버 상품명
  optionInfo?: string | null                // 네이버 옵션명 (원본)
  canonicalOptionInfo?: string | null       // 내부 카탈로그로 정규화된 옵션명
}): ResolvedCommerceProductMapping {
  const commerceProductId = normalizeText(input.commerceProductId)

  if (!commerceProductId) {
    // 상품번호 없으면 매핑 불가
    return {
      matched: false,
      internalProductId: null,
      canonicalVariant: null,
      matchingMode: null,
      needsReview: false,
      reason: 'commerce product id missing',
    }
  }

  // 상품번호로 해당 상품의 모든 매핑 규칙 조회
  const sourceFulfillmentType = normalizeFulfillmentType(input.sourceFulfillmentType)
  const scopedRows = input.lookup.byCommerceProductIdAndFulfillmentType.get(
    buildLookupKey(commerceProductId, sourceFulfillmentType),
  )
  const defaultRows = sourceFulfillmentType !== 'default'
    ? input.lookup.byCommerceProductIdAndFulfillmentType.get(buildLookupKey(commerceProductId, 'default'))
    : null
  const allRows = scopedRows || defaultRows || input.lookup.byCommerceProductId.get(commerceProductId) || []
  if (allRows.length === 0) {
    // 이 상품번호에 대한 매핑 규칙 자체가 없음
    return {
      matched: false,
      internalProductId: null,
      canonicalVariant: null,
      matchingMode: null,
      needsReview: false,
      reason: `no mapping rows for ${commerceProductId}`,
    }
  }

  // 계정 키로 스코핑 (특정 계정 규칙 또는 default 규칙)
  const rows = getScopedRows(allRows, input.sourceAccountKey)

  const canonicalVariant = normalizeCompactText(input.canonicalOptionInfo) // 정규화된 canonical 옵션
  const sourceOptionCode = normalizeCompactText(input.commerceOptionCode)  // 정규화된 옵션 코드
  const rawOptionInfo = normalizeCompactText(input.optionInfo)              // 정규화된 원본 옵션명

  // 매핑 시도 1: 옵션 코드 완전 일치 (가장 정확한 매핑)
  if (sourceOptionCode) {
    const optionCodeRows = rows.filter((row) => normalizeCompactText(row.commerce_option_code) === sourceOptionCode)
    const resolved = selectBestRow(
      optionCodeRows,
      optionCodeRows[0]?.matching_mode || null,
      optionCodeRows[0]?.canonical_variant || null,
      'matched by commerce option code',
    )
    if (resolved.matched || resolved.needsReview) {
      return resolved // 성공 또는 ambiguous → 여기서 종료
    }
  }

  // 매핑 시도 2: canonical_variant 완전 일치
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

  // 매핑 시도 3: 옵션명 완전 일치 (네이버 원본 옵션명과 DB 저장 옵션명 비교)
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

  // 매핑 시도 4: 매핑 모드 규칙 적용 (resolveCommerceMappingDecision 위임)
  // 각 행의 matching_mode에 따라 product_id_option, name_option_rule 등 판단
  const decisionMatches = rows.flatMap((row) => {
    const config = {
      matchingMode: row.matching_mode,
      canonicalVariant: row.canonical_variant || null,
      optionKeywords: buildOptionKeywords(row),  // 옵션 키워드 목록
      nameOptionRule: buildNameOptionRule(row),   // 이름+옵션 규칙
    }

    const decision = resolveCommerceMappingDecision({
      config,
      productName: input.productName,
      // name_option_rule은 원본 옵션 사용, 나머지는 canonical 우선
      optionInfo: row.matching_mode === 'name_option_rule'
        ? input.optionInfo
        : (input.canonicalOptionInfo || input.optionInfo),
      sourceOptionCode: input.commerceOptionCode,
    })

    return decision.matched
      ? [{ row, decision }]  // 매칭 성공한 경우만 수집
      : []
  })

  if (decisionMatches.length > 0) {
    const canonicalVariantFromDecision = decisionMatches[0]?.decision.canonicalVariant || null
    const matchingMode = decisionMatches[0]?.decision.matchingMode || null
    return selectBestRow(
      decisionMatches.map((entry) => entry.row), // 매칭된 행들 중 최선 선택
      matchingMode,
      canonicalVariantFromDecision,
      decisionMatches[0]?.decision.reason || 'matched by rule config',
    )
  }

  // 매핑 시도 5: product_id_only 모드 (옵션 무관 상품 ID만으로 매핑)
  // 옵션 구분이 필요 없는 단일 옵션 상품에 사용
  const productIdOnlyRows = rows.filter((row) => row.matching_mode === 'product_id_only')
  if (productIdOnlyRows.length > 0) {
    return selectBestRow(
      productIdOnlyRows,
      'product_id_only',
      productIdOnlyRows[0]?.canonical_variant || null,
      'matched by product id only',
    )
  }

  // 모든 시도 실패 → 규칙은 있지만 어떤 것도 매칭 안 됨
  return {
    matched: false,
    internalProductId: null,
    canonicalVariant: canonicalVariant || null,
    matchingMode: null,
    // product_id_only가 아닌 규칙이 있는데 매칭 실패 → 검토 필요
    needsReview: rows.some((row) => row.matching_mode !== 'product_id_only'),
    reason: `mapping rows found for ${commerceProductId} but no rule matched`,
  }
}
