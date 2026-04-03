// =====================================================================
// mapping-rules.ts
// 역할: CommerceMappingMode별 매핑 판단 로직 구현
// 왜 별도 파일인가: 매핑 규칙 엔진 자체를 mapping.ts와 분리해
//                  테스트하기 쉽고 규칙을 독립적으로 관리할 수 있게 한다.
//
// 지원 매핑 모드:
//   - product_id_only: 상품번호만 있으면 무조건 매핑 (단일 옵션 상품용)
//   - product_id_option: 상품번호 + 옵션 키워드 포함 여부로 매핑
//   - name_option_rule: 상품명+옵션 텍스트에서 variant 키워드 탐색으로 매핑
//   - manual: 수동 매핑 (현재 미구현, needsReview=true 반환)
// =====================================================================

import type {
  CommerceMappingDecision,     // 매핑 결정 결과 타입
  CommerceMappingRuleConfig,   // 매핑 규칙 설정 타입
  NameOptionRuleConfig,        // name_option_rule 전용 설정 타입
} from './types.ts'

// 텍스트 정규화: 소문자 + 연속 공백 단일화 + trim
// 상품명·옵션명 비교 시 대소문자와 공백 차이를 무시하기 위해 사용
function normalizeText(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 정규화된 text 안에 keywords 중 하나라도 포함됐는지 확인한다.
 * 빈 키워드는 건너뛰어 오탐 방지.
 * product_id_option / name_option_rule 매핑에서 사용.
 */
function includesAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword)
    return normalizedKeyword.length > 0 && text.includes(normalizedKeyword) // 부분 포함 여부
  })
}

/**
 * name_option_rule 모드: 상품명 + 옵션 텍스트에서 variant 키워드를 탐색한다.
 *
 * config.preferOptionInfo가 true면 "옵션 상품명" 순으로 조합,
 * false면 "상품명 옵션" 순으로 조합 후 키워드 포함 여부를 확인한다.
 *
 * 매칭 성공 시 → matched=true + canonicalVariant 반환
 * 키워드 미매칭이지만 fallbackVariant 있으면 → matched=true + needsReview=true
 * 모두 실패 → matched=false + needsReview=true
 */
function resolveNameOptionVariant(
  config: NameOptionRuleConfig,
  productName?: string | null,
  optionInfo?: string | null,
): CommerceMappingDecision {
  const normalizedProductName = normalizeText(productName) // 정규화 상품명
  const normalizedOptionInfo = normalizeText(optionInfo)   // 정규화 옵션명

  // preferOptionInfo에 따라 검색 텍스트 조합 순서 결정
  const primaryText = config.preferOptionInfo
    ? `${normalizedOptionInfo} ${normalizedProductName}`.trim() // 옵션 우선 (기본값)
    : `${normalizedProductName} ${normalizedOptionInfo}`.trim() // 상품명 우선

  // variants 목록에서 키워드가 포함된 첫 번째 variant 반환
  for (const variantRule of config.variants) {
    if (includesAnyKeyword(primaryText, variantRule.keywords)) {
      return {
        matched: true,
        needsReview: false,
        matchingMode: 'name_option_rule',
        canonicalVariant: variantRule.variant, // 매칭된 canonical 옵션명
        reason: `matched variant keywords: ${variantRule.variant}`,
      }
    }
  }

  // 키워드 매칭 실패했지만 fallbackVariant 설정이 있으면 폴백 사용 (검토 필요 표시)
  if (config.fallbackVariant) {
    return {
      matched: true,
      needsReview: true, // 정확한 키워드 매칭이 아니므로 검토 필요
      matchingMode: 'name_option_rule',
      canonicalVariant: config.fallbackVariant,
      reason: `fallback variant used: ${config.fallbackVariant}`,
    }
  }

  // 완전 매칭 실패
  return {
    matched: false,
    needsReview: true, // 규칙이 있는데 매칭 실패 → 검토 필요
    matchingMode: 'name_option_rule',
    canonicalVariant: null,
    reason: 'no variant keyword matched',
  }
}

/**
 * 매핑 규칙 설정(config)과 주문 상품 정보를 받아 매핑 결정을 내린다.
 * matching_mode에 따라 다른 로직을 적용한다.
 *
 * 이 함수는 mapping.ts의 resolveCommerceProductMapping()에서
 * 정확한 코드/이름 비교로 못 찾은 경우의 규칙 기반 매칭 단계에서 호출된다.
 */
export function resolveCommerceMappingDecision(input: {
  config: CommerceMappingRuleConfig      // 매핑 규칙 설정 (DB에서 읽어 구성)
  productName?: string | null            // 네이버 상품명
  optionInfo?: string | null             // 네이버 옵션명 또는 canonical 옵션명
  sourceOptionCode?: string | null       // 네이버 옵션 코드
}): CommerceMappingDecision {
  const { config, productName, optionInfo, sourceOptionCode } = input
  const normalizedOptionInfo = normalizeText(optionInfo)       // 정규화 옵션명
  const normalizedOptionCode = normalizeText(sourceOptionCode) // 정규화 옵션 코드

  // 모드 1: product_id_only — 옵션 관계없이 상품번호만으로 매핑
  // 단일 옵션 상품이나 옵션 구분이 필요 없는 상품에 사용
  if (config.matchingMode === 'product_id_only') {
    return {
      matched: true,             // 항상 매칭 성공
      needsReview: false,
      matchingMode: config.matchingMode,
      canonicalVariant: config.canonicalVariant ?? null, // 설정된 canonical 옵션명 (단일이므로 고정값)
      reason: 'matched by product id only',
    }
  }

  // 모드 2: product_id_option — 상품번호 + 옵션 키워드 포함 여부
  // 옵션명 또는 옵션 코드 안에 설정된 키워드 중 하나라도 포함되면 매칭
  if (config.matchingMode === 'product_id_option') {
    const keywords = config.optionKeywords ?? [] // 확인할 키워드 목록
    const matched =
      includesAnyKeyword(normalizedOptionInfo, keywords) ||  // 옵션명 포함 확인
      includesAnyKeyword(normalizedOptionCode, keywords)     // 옵션 코드 포함 확인

    return {
      matched,
      needsReview: !matched,    // 매칭 실패 시 검토 필요
      matchingMode: config.matchingMode,
      canonicalVariant: matched ? config.canonicalVariant ?? null : null,
      reason: matched ? 'matched by option keyword' : 'option keyword not matched',
    }
  }

  // 모드 3: name_option_rule — 상품명 + 옵션 텍스트에서 variant 키워드 탐색
  // 가장 유연한 방식으로, 복잡한 상품명 패턴 처리에 사용
  if (config.matchingMode === 'name_option_rule') {
    if (!config.nameOptionRule) {
      // rule 설정이 없으면 검토 필요로 처리
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

  // 모드 4: manual — 수동 매핑 (현재 미구현)
  // DB 매핑 테이블에서 직접 지정하는 방식 (향후 구현 예정)
  return {
    matched: false,
    needsReview: true, // 수동 검토 필요
    matchingMode: config.matchingMode,
    canonicalVariant: config.canonicalVariant ?? null,
    reason: 'manual review required',
  }
}

// =====================================================================
// 내장 name_option_rule 상수 (특수 상품용)
// =====================================================================

/**
 * 애착트릿 리뉴얼 전 상품 name_option_rule 설정
 * 이 상품은 옵션명에 '치킨', '연어', '북어' 키워드로 맛 구분
 * DB 매핑 테이블에 직접 참조되거나 코드 내 직접 사용 가능
 */
export const ATTACH_TRIT_RENEWAL_RULE: NameOptionRuleConfig = {
  preferOptionInfo: true, // 옵션명 우선으로 맛 키워드 탐색
  variants: [
    { variant: '치킨', keywords: ['치킨'] }, // 치킨 맛
    { variant: '연어', keywords: ['연어'] }, // 연어 맛
    { variant: '북어', keywords: ['북어'] }, // 북어 맛
  ],
}
