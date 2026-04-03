// =====================================================================
// types.ts
// 역할: commerce 관련 공통 TypeScript 타입/인터페이스 정의
// 왜 필요: mapping.ts, mapping-rules.ts, order-eligibility.ts 등이
//          공통으로 참조하는 타입을 한 곳에 모아 순환 의존성을 방지한다.
// =====================================================================

// 지원하는 커머스 채널 유형
// 현재 실제 동기화 구현은 'naver'만 있고 나머지는 확장 예정
export type CommerceChannel = 'naver' | 'coupang' | 'kakao' | 'excel'

// 채널 내부 fulfillment 유형
// - default: 네이버/엑셀 등 별도 fulfillment 축이 없는 기본값
// - marketplace: 쿠팡 판매자배송
// - rocket_growth: 쿠팡 로켓그로스
export type CommerceFulfillmentType = 'default' | 'marketplace' | 'rocket_growth'

// 외부 상품 → 내부 상품 매핑 방식 코드
// - product_id_only: 상품번호만으로 매핑 (단일 옵션 상품용)
// - product_id_option: 상품번호 + 옵션 키워드 포함 여부로 매핑
// - name_option_rule: 상품명+옵션 텍스트에서 variant 키워드 탐색으로 매핑
// - manual: 수동 매핑 (향후 구현 예정)
export type CommerceMappingMode =
  | 'product_id_only'
  | 'product_id_option'
  | 'name_option_rule'
  | 'manual'

// 커머스 주문 라인 1건의 입력 인터페이스
// 각 채널 동기화 코드에서 이 형태로 정규화해서 매핑 로직에 전달한다
export interface CommerceOrderLineInput {
  sourceChannel: CommerceChannel       // 채널 (naver 등)
  sourceFulfillmentType?: CommerceFulfillmentType | null // 채널 내부 fulfillment 구분
  sourceAccountKey?: string | null     // 계정 키
  sourceOrderId?: string | null        // 외부 주문 번호
  sourceLineId: string                 // 외부 상품주문 번호 (PK)
  sourceProductId?: string | null      // 외부 상품 번호
  sourceOptionCode?: string | null     // 외부 옵션 코드
  productName: string                  // 외부 상품명
  optionInfo?: string | null           // 외부 옵션명
  orderStatus?: string | null          // 주문 상태 코드
  claimStatus?: string | null          // 클레임 상태 코드
  quantity?: number | null             // 주문 수량
}

// name_option_rule 매핑 모드의 variant 키워드 규칙 1개
// variant: canonical 옵션명, keywords: 이 옵션으로 판단할 키워드 목록
export interface VariantKeywordRule {
  variant: string      // canonical 옵션명 (예: '치킨', '연어')
  keywords: string[]   // 이 variant로 매핑할 키워드 목록 (예: ['치킨', '닭'])
}

// name_option_rule 매핑 모드 전체 설정
export interface NameOptionRuleConfig {
  variants: VariantKeywordRule[]          // variant 키워드 규칙 목록 (순서대로 시도)
  preferOptionInfo?: boolean              // true: 옵션명+상품명 순으로 탐색 (기본 true)
  fallbackVariant?: string | null         // 어떤 variant도 매칭 안 될 때 폴백 값
}

// 매핑 규칙 1개의 전체 설정 (DB 행에서 구성됨)
export interface CommerceMappingRuleConfig {
  matchingMode: CommerceMappingMode        // 매핑 판단 방식
  canonicalVariant?: string | null         // product_id_only/product_id_option용 고정 옵션명
  optionKeywords?: string[]                // product_id_option 모드용 키워드 목록
  nameOptionRule?: NameOptionRuleConfig    // name_option_rule 모드용 설정
}

// 매핑 결정 결과 — resolveCommerceMappingDecision()의 반환 타입
export interface CommerceMappingDecision {
  matched: boolean                    // 매핑 성공 여부
  needsReview: boolean                // 검토 필요 여부 (ambiguous/fallback/실패)
  matchingMode: CommerceMappingMode   // 어떤 모드로 결정됐는지
  canonicalVariant: string | null     // 매핑된 canonical 옵션명 (실패 시 null)
  reason: string                      // 결정 이유 (로그/디버깅용 메시지)
}

// 주문 저장 가능 여부 판단 결과 — isEligibleCommerceOrderLine()의 반환 타입
export interface CommerceOrderEligibility {
  eligible: boolean   // true: purchases에 저장 가능 / false: 취소·반품 등으로 제외
  reason: string      // 판단 이유 (로그용)
}
