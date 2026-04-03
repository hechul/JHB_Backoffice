// =====================================================================
// order-eligibility.ts
// 역할: 네이버 주문 상태 코드를 보고 이 주문을 purchases에 저장할지 결정
// 왜 필요: 취소·반품 완료된 주문을 purchases에 넣으면 체험단 필터가 오작동한다.
//          이 파일이 "저장해도 되는 주문인지"를 단일 함수로 판단한다.
//          eligible=false면 raw_line만 저장하고 purchase projection은 생성하지 않는다.
// 사용처: naver-sync.ts의 resolveNaverSyncRecord() 내부에서 호출됨
// =====================================================================

import type { CommerceOrderEligibility } from './types.ts' // { eligible: boolean, reason: string }

// purchases에 저장 가능한 주문 상태 코드 집합 (결제 완료 이상, 취소 미포함)
const INCLUDED_ORDER_STATUSES = new Set([
  'PAYED',             // 결제 완료 — 아직 배송 전
  'DISPATCHED',        // 발송 완료 — 배송 시작
  'DELIVERING',        // 배송 중
  'DELIVERED',         // 배송 완료
  'PURCHASE_DECIDED',  // 구매 확정 (최종 완료 상태)
])

// purchases에서 제외할 주문 상태 코드 집합 (취소·반품 완료)
const EXCLUDED_ORDER_STATUSES = new Set([
  'CANCELED',                // 주문 취소 완료
  'RETURNED',                // 반품 완료
  'CANCELED_BY_NOPAYMENT',   // 미결제로 인한 자동 취소
])

// 클레임 상태에 이 키워드가 포함되면 "취소/반품/교환 진행 중"으로 판단 → 제외 후보
const EXCLUDED_CLAIM_KEYWORDS = ['cancel', 'return', 'exchange']

// 클레임 상태에 이 키워드가 포함되면 "철회/거절됨"으로 판단 → 포함 (거래 유효)
// 예: CANCEL_REJECT, RETURN_WITHDRAW → 취소/반품이 거절/철회됐으므로 정상 주문
const INCLUDED_CLAIM_KEYWORDS = ['reject', 'withdraw']

// 클레임이 이 키워드로 "완료"됐으면 실제로 취소/반품이 확정된 것 → 제외
// 예: RETURN_DONE, CANCEL_COMPLETE → 반품·취소가 실제로 완료됨
const FINALIZED_CLAIM_KEYWORDS = ['done', 'complete', 'completed', 'approve', 'approved']

// 코드값 정규화: 앞뒤 공백 제거 + 대문자 변환 (네이버 상태 코드는 대문자)
function normalizeCode(value?: string | null): string {
  return (value ?? '').trim().toUpperCase()
}

/**
 * 주문 상태 + 클레임 상태를 보고 purchases 저장 가능 여부를 결정한다.
 *
 * 판단 순서:
 * 1. 주문 상태가 CANCELED/RETURNED/CANCELED_BY_NOPAYMENT → 제외
 * 2. 클레임 상태에 reject/withdraw 포함 → 포함 (취소/반품이 철회·거절됨)
 * 3. 클레임 상태에 cancel/return/exchange + done/complete 포함 → 제외 (완료된 클레임)
 * 4. 주문 상태가 PAYED/DISPATCHED/DELIVERING/DELIVERED/PURCHASE_DECIDED → 포함
 * 5. 그 외 알 수 없는 상태 → 제외 (안전하게 제외)
 */
export function isEligibleCommerceOrderLine(input: {
  orderStatus?: string | null   // 네이버 productOrderStatus
  claimStatus?: string | null   // 네이버 claimStatus
}): CommerceOrderEligibility {
  const orderStatus = normalizeCode(input.orderStatus)       // 대문자 정규화
  const claimStatus = normalizeCode(input.claimStatus)       // 대문자 정규화
  const normalizedClaim = claimStatus.toLowerCase()           // 키워드 비교용 소문자

  // 1단계: 명시적 제외 상태 (취소/반품 완료)
  if (EXCLUDED_ORDER_STATUSES.has(orderStatus)) {
    return { eligible: false, reason: `excluded order status: ${orderStatus}` }
  }

  // 2단계: 클레임이 있지만 철회/거절됐으면 정상 주문으로 간주
  // 예: CANCEL_REJECT (취소 거절됨) → 거래 유효, 포함
  if (
    claimStatus &&
    INCLUDED_CLAIM_KEYWORDS.some((keyword) => normalizedClaim.includes(keyword))
  ) {
    return { eligible: true, reason: `included claim status: ${claimStatus}` }
  }

  // 3단계: 클레임이 실제로 완료된 경우 제외
  // 취소/반품/교환 키워드 + 완료 키워드가 함께 있으면 = 클레임 완결됨
  // 예: RETURN_DONE (반품 완료), CANCEL_COMPLETE (취소 완료) → 거래 무효, 제외
  if (
    claimStatus &&
    EXCLUDED_CLAIM_KEYWORDS.some((keyword) => normalizedClaim.includes(keyword)) &&
    FINALIZED_CLAIM_KEYWORDS.some((keyword) => normalizedClaim.includes(keyword))
  ) {
    return { eligible: false, reason: `excluded claim status: ${claimStatus}` }
  }

  // 4단계: 명시적 포함 상태 (결제 완료 이상)
  if (INCLUDED_ORDER_STATUSES.has(orderStatus)) {
    return { eligible: true, reason: `included order status: ${orderStatus}` }
  }

  // 5단계: 알 수 없는 상태 → 안전하게 제외 (잘못된 데이터 방지)
  return { eligible: false, reason: `unsupported order status: ${orderStatus || 'unknown'}` }
}

/**
 * 포함 상태 코드 목록을 외부에서 참조할 수 있게 반환한다.
 * 주로 테스트 코드에서 전체 포함 상태 집합을 확인할 때 사용된다.
 */
export function getIncludedOrderStatuses(): string[] {
  return [...INCLUDED_ORDER_STATUSES]
}
