// =====================================================================
// naver-sync.ts
// 역할: 네이버 커머스 API 응답 데이터를 내부 DB 포맷으로 변환하는 핵심 유틸리티
// 왜 필요: 네이버 API는 자체 포맷으로 데이터를 주기 때문에,
//          백오피스 purchases 테이블 / raw 테이블에 맞게 변환하는 중간 계층이 필요하다.
// 이 파일의 함수들은 sync-naver-orders.mjs CLI와 sync.post.ts API 양쪽에서 공통으로 사용된다.
// =====================================================================

// 내부 상품 카탈로그 조회용 유틸 — 네이버 상품명/옵션으로 내부 상품을 찾을 때 fallback으로 사용
import {
  buildProductLookup,
  resolveMappedProduct,
  type ProductCatalogItem,
  type ProductLookup,
} from '../../../shared/productCatalog.ts'
// 네이버 상품번호 → 내부 상품 canonical 정보 변환 (SOURCE_PRODUCT_RULES 기반)
import { resolveCommerceSourceProduct } from '../../../app/composables/useCommerceProductCatalog.ts'
// DB에 저장된 commerce_product_mappings 테이블 기반 정밀 매핑 로직
import {
  buildCommerceProductMappingLookup,
  resolveCommerceProductMapping,
  type CommerceProductMappingLookup,
  type CommerceProductMappingRow,
} from './mapping.ts'
// 채널명 정규화('naver' 고정) / 계정키 정규화('default' 폴백)
import { normalizeCommerceChannel, normalizeSourceAccountKey } from './channel.ts'
// 주문 상태가 저장 가능한 상태인지 판단 (취소·반품 완료 제외)
import { isEligibleCommerceOrderLine } from './order-eligibility.ts'
import type { CommerceFulfillmentType } from './types.ts'

// =====================================================================
// 타입/인터페이스 정의
// =====================================================================

// 네이버 API는 하루(24시간) 단위로만 상태변경 조회가 가능하다.
// splitNaverSyncWindows()가 전체 기간을 이 구조의 배열로 쪼개서 반환한다.
export interface NaverSyncWindow {
  windowFrom: string // 조회 구간 시작 (네이버 API 날짜 문자열 포맷)
  windowTo: string   // 조회 구간 종료 (네이버 API 날짜 문자열 포맷)
}

// 네이버 last-changed-statuses API 한 건의 응답 형태
// productOrderId가 핵심 식별자 — 이후 상세조회 key로 사용됨
export interface NaverChangedStatusItem {
  orderId?: string | null               // 주문 번호 (여러 상품주문을 묶는 단위)
  productOrderId: string                // 상품주문 번호 (1건 = 상품 1개 라인)
  lastChangedType?: string | null       // 변경 유형 (결제/배송/취소 등)
  paymentDate?: string | null           // 결제 완료 일시
  lastChangedDate?: string | null       // 마지막 상태 변경 일시
  productOrderStatus?: string | null    // 주문 상태 코드 (PAYED, DELIVERED 등)
  claimType?: string | null             // 클레임 유형 (취소/반품/교환)
  claimStatus?: string | null           // 클레임 처리 상태
  receiverAddressChanged?: boolean | null // 배송지 변경 여부
  giftReceivingStatus?: string | null   // 선물 수령 상태
}

// 상태변경 목록 API의 페이지네이션 정보
// moreFrom + moreSequence가 둘 다 있으면 다음 페이지가 존재한다
export interface NaverChangedStatusPagination {
  moreFrom: string | null      // 다음 페이지 요청 시 lastChangedFrom에 넣을 값
  moreSequence: string | null  // 다음 페이지 요청 시 moreSequence에 넣을 값
}

// 네이버 상품주문 상세조회 API 1건의 응답 형태
// order: 주문 전체 정보 / productOrder: 개별 상품 라인 / delivery: 배송 정보
// cancel/return/exchange/completedClaims: 클레임 세부 정보
export interface NaverOrderInfo {
  order?: Record<string, any> | null
  productOrder?: Record<string, any> | null
  delivery?: Record<string, any> | null
  cancel?: Record<string, any> | null
  return?: Record<string, any> | null
  exchange?: Record<string, any> | null
  completedClaims?: Record<string, any>[] | null
}

// commerce_order_events_raw 테이블에 저장할 raw 이벤트 행 타입
// "언제 어떤 상태로 바뀌었나"를 기록 — 재처리 근거 보존용
export interface CommerceOrderEventRawRow {
  source_channel: string          // 채널 (항상 'naver')
  source_fulfillment_type: CommerceFulfillmentType // 채널 내부 fulfillment 유형 (네이버는 항상 'default')
  source_account_key: string      // 계정 구분 키 ('default' 또는 특정 계정)
  run_id: string                  // 이 이벤트를 수집한 sync run의 ID
  window_id: number | null        // 어느 24시간 window에서 수집됐는지
  source_order_id: string | null  // 네이버 주문 번호
  source_line_id: string          // 네이버 상품주문 번호 (PK)
  event_type: string              // 변경 유형 코드
  event_at: string                // 이벤트 발생 시각
  order_status: string | null     // 해당 시점 주문 상태
  payment_date: string | null     // 결제 완료 일시
  extra_flags: Record<string, any> | null // 클레임/선물 관련 부가 정보
  raw_json: Record<string, any>   // 네이버 API 원본 응답 전체 (디버깅용)
}

// commerce_order_lines_raw 테이블에 저장할 raw 주문 라인 행 타입
// "이 상품주문의 최신 스냅샷"을 기록 — 매핑 규칙이 바뀌어도 재처리 가능하게 원본 보존
export interface CommerceOrderLineRawRow {
  source_channel: string
  source_fulfillment_type: CommerceFulfillmentType
  source_account_key: string
  source_line_id: string            // 상품주문 번호 (PK)
  source_order_id: string | null    // 주문 번호
  source_product_id: string | null  // 네이버 상품 번호
  source_option_code: string | null // 네이버 옵션 코드 (optionCode 또는 optionManageCode)
  product_name: string              // 상품명
  product_option: string | null     // 옵션명
  buyer_id: string | null           // 구매자 ID (ordererId 또는 ordererNo)
  buyer_name: string | null         // 구매자 이름
  receiver_name: string | null      // 수령인 이름
  receiver_phone_masked: string | null       // 수령인 전화번호
  receiver_base_address: string | null       // 배송지 기본 주소
  receiver_detail_address: string | null     // 배송지 상세 주소
  quantity: number                  // 주문 수량
  product_order_status: string | null        // 주문 상태 코드
  claim_status: string | null       // 클레임 상태 코드
  order_date: string | null         // 주문일 (order.orderDate 우선)
  payment_date: string | null       // 결제일
  decision_date: string | null      // 구매확정일
  invoice_number: string | null     // 운송장 번호
  last_event_type: string | null    // 마지막 이벤트 유형
  last_event_at: string | null      // 마지막 이벤트 시각
  raw_json: Record<string, any>     // 네이버 API 원본 응답 전체
}

// purchases 테이블에 저장할 projection 행 타입
// 이 테이블이 백오피스 화면(대시보드, 고객분석, 필터링)에서 직접 읽는 데이터
export interface PurchaseProjectionRow {
  purchase_id: string               // 상품주문 번호를 그대로 사용 (PK)
  upload_batch_id: string           // 이 주문을 만든 sync run ID
  target_month: string              // 주문 귀속 월 (YYYY-MM)
  buyer_id: string                  // 구매자 ID
  buyer_name: string                // 구매자 이름
  receiver_name: string | null      // 수령인 이름
  customer_key: string              // buyer_id_buyer_name 조합 (고객 단위 집계 키)
  product_id: string                // 내부 상품 ID (products 테이블 FK)
  product_name: string              // 내부 정규화 상품명
  option_info: string               // canonical 옵션명 (매핑된 것 우선, 없으면 raw)
  source_product_name: string       // 네이버 원본 상품명 (감사 추적용)
  source_option_info: string        // 네이버 원본 옵션명 (감사 추적용)
  source_channel: string            // 채널 ('naver')
  source_fulfillment_type: CommerceFulfillmentType // 채널 내부 fulfillment 유형 (네이버는 항상 'default')
  source_account_key: string        // 계정 키
  source_order_id: string | null    // 네이버 주문 번호
  source_product_id: string | null  // 네이버 상품 번호
  source_option_code: string | null // 네이버 옵션 코드
  source_last_changed_at: string | null  // 마지막 상태 변경 시각
  source_sync_run_id: string        // 이 row를 만든 sync run ID
  quantity: number                  // 주문 수량
  order_date: string                // 주문일 (YYYY-MM-DD)
  order_status: string              // 주문 상태 코드
  claim_status: string | null       // 클레임 상태 코드
  delivery_type: string | null      // 배송 방법
  is_fake: boolean                  // 체험단 여부 — API 동기화에서는 항상 false (필터링이 별도 처리)
  match_reason: string | null       // 체험단 매칭 사유 — 초기 null, 필터링 후 채워짐
  match_rank: number | null         // 체험단 매칭 Rank — 초기 null
  matched_exp_id: number | null     // 매칭된 체험단 experiences.id — 초기 null
  needs_review: boolean             // 상품 매핑 실패 등 검토 필요 여부
  is_manual: boolean                // 수동 분류 여부 — API 동기화에서는 항상 false
  filter_ver: string | null         // 필터링 버전 식별자 ('api_import_v1')
  quantity_warning: boolean         // 수량 2개 이상 — 체험단 가능성 높음을 표시
}

// resolveNaverSyncRecord()의 최종 반환 타입
// rawLine + purchase(없을 수 있음) + 분류 메타를 묶어서 반환
export interface ResolvedNaverSyncRecord {
  rawLine: CommerceOrderLineRawRow          // raw line 테이블에 저장할 행 (항상 존재)
  purchase: PurchaseProjectionRow | null    // purchases에 저장할 행 (취소·매핑실패 시 null)
  eligible: boolean                         // 저장 가능한 주문 상태인지 여부
  eligibilityReason: string                 // eligible 판단 이유 (로그용)
  needsReview: boolean                      // 수동 검토 필요 여부
  mappingReason: string | null              // 상품 매핑 결과 이유 (로그용)
}

// =====================================================================
// 내부 상수
// =====================================================================

// purchases.filter_ver 컬럼에 저장되는 값
// API 동기화로 생성된 row임을 나중에 식별하기 위한 버전 태그
const NAVER_IMPORT_FILTER_VER = 'api_import_v1'
const DEFAULT_COMMERCE_FULFILLMENT_TYPE: CommerceFulfillmentType = 'default'

// =====================================================================
// 내부 헬퍼 함수 (export 없음)
// =====================================================================

// 숫자를 지정한 자릿수로 0 패딩하는 날짜 포맷 헬퍼
// 예: pad(3) → '03', pad(3, 3) → '003'
function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

// 문자열 정규화 — null/undefined를 빈 문자열로, 앞뒤 공백 제거
function normalizeText(value?: string | null): string {
  return String(value || '').trim()
}

// 문자열이 비어있으면 null, 내용이 있으면 trim한 문자열 반환
// DB 컬럼이 NOT NULL이 아닌 nullable 필드에 사용
function toNullableString(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

// 양의 정수로 변환 — 변환 실패 또는 0 이하면 fallback 반환
// 주문 수량처럼 반드시 양수여야 하는 필드에 사용
function toPositiveInteger(value: unknown, fallback = 1): number {
  const normalized = Number.parseInt(String(value ?? fallback), 10)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback
}

// =====================================================================
// 날짜/시간 변환 함수 (export)
// =====================================================================

/**
 * CLI --from/--to 인자의 날짜 문자열을 Date 객체로 변환한다.
 * 네이버 API는 KST(+09:00) 기준이므로 시간대를 명시적으로 붙인다.
 *
 * 지원 포맷:
 *  - YYYY-MM-DD  → start: 00:00:00.000+09:00, end: 23:59:59.999+09:00
 *  - YYYY-MM-DDTHH:MM (초/밀리초 없음) → +09:00 추가
 *  - 완전한 ISO 문자열은 그대로 파싱
 */
export function parseNaverSyncDateTime(value: string, edge: 'start' | 'end' = 'start'): Date {
  const trimmed = String(value || '').trim() // 입력값 정규화
  if (!trimmed) {
    throw new Error('Date-time input is required')
  }

  // YYYY-MM-DD 형식이면 하루의 시작 또는 끝 시각으로 확장
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = edge === 'start' ? 'T00:00:00.000+09:00' : 'T23:59:59.999+09:00'
    return new Date(`${trimmed}${suffix}`)
  }

  // YYYY-MM-DDTHH:MM 또는 YYYY-MM-DDTHH:MM:SS 형식이면 KST 시간대 명시
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(trimmed)) {
    return new Date(`${trimmed}+09:00`)
  }

  // 그 외 완전한 ISO 포맷 시도 — 파싱 실패 시 에러
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unsupported date-time input: ${value}`)
  }
  return parsed
}

/**
 * Date 객체를 네이버 API가 요구하는 날짜 문자열로 포맷한다.
 * 네이버 API는 반드시 KST(+09:00) 오프셋을 포함한 ISO 형식을 사용해야 한다.
 * 예: "2026-03-01T00:00:00.000+09:00"
 */
export function formatNaverDateTime(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Invalid date for Naver date-time formatting')
  }

  // UTC 시각에 9시간(KST 오프셋)을 더해 KST 시각을 구한다
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}.${pad(kst.getUTCMilliseconds(), 3)}+09:00`
}

/**
 * 전체 동기화 기간을 24시간 단위 window 배열로 분할한다.
 * 이유: 네이버 last-changed-statuses API는 1회 조회 범위를 하루로 제한한다.
 * 예: 3/1~3/5 요청 → [{3/1 00:00 ~ 3/1 23:59}, {3/2 00:00 ~ 3/2 23:59}, ...] 5개 반환
 */
export function splitNaverSyncWindows(
  requestedFrom: Date,
  requestedTo: Date,
  maxHours = 24, // 기본 24시간 단위 (네이버 API 제한)
): NaverSyncWindow[] {
  if (requestedTo.getTime() < requestedFrom.getTime()) {
    throw new Error('requestedTo must be greater than or equal to requestedFrom')
  }

  const maxWindowMs = maxHours * 60 * 60 * 1000 // 24시간을 밀리초로 변환
  const windows: NaverSyncWindow[] = []
  let cursorMs = requestedFrom.getTime() // 현재 처리 위치 (밀리초)
  const endMs = requestedTo.getTime()    // 종료 위치 (밀리초)

  while (cursorMs <= endMs) {
    // window 끝은 24시간 후 - 1ms 또는 전체 종료 중 작은 값
    const nextMs = Math.min(cursorMs + maxWindowMs - 1, endMs)
    windows.push({
      windowFrom: formatNaverDateTime(new Date(cursorMs)),
      windowTo: formatNaverDateTime(new Date(nextMs)),
    })
    cursorMs = nextMs + 1 // 다음 window 시작은 이전 window 끝 + 1ms
  }

  return windows
}

// =====================================================================
// 네이버 API 응답 파싱 함수 (export)
// =====================================================================

/**
 * last-changed-statuses API 응답에서 상태변경 아이템 배열을 꺼낸다.
 * 네이버 API 응답 구조가 버전마다 조금씩 달라서 여러 경로를 순서대로 시도한다.
 */
export function extractNaverChangedStatusItems(payload: Record<string, any>): NaverChangedStatusItem[] {
  // 응답 구조 후보를 우선순위 순으로 나열
  const candidates = [
    payload?.data?.lastChangeStatuses, // 주 응답 구조
    payload?.data?.data,               // 중첩 data 구조
    payload?.data,                     // data 직접
    payload?.lastChangeStatuses,       // 최상위 직접 접근
  ]
  // 배열인 첫 번째 후보를 사용 (null/undefined 제거)
  const list = candidates.find((value) => Array.isArray(value))
  return Array.isArray(list) ? list.filter(Boolean) : []
}

/**
 * last-changed-statuses API 응답에서 다음 페이지 커서를 꺼낸다.
 * moreFrom과 moreSequence가 둘 다 있어야 다음 페이지 요청이 가능하다.
 */
export function extractNaverChangedStatusPagination(
  payload: Record<string, any>,
): NaverChangedStatusPagination {
  const more = payload?.data?.more || payload?.more || null // more 객체 추출
  return {
    moreFrom: toNullableString(more?.moreFrom),         // 다음 페이지 시작점
    moreSequence: toNullableString(more?.moreSequence), // 다음 페이지 시퀀스 토큰
  }
}

/**
 * 상품주문 상세조회 API 응답에서 주문정보 배열을 꺼낸다.
 * last-changed-statuses와 마찬가지로 응답 구조 변형에 대비해 여러 경로 시도.
 */
export function extractNaverProductOrderInfos(payload: Record<string, any>): NaverOrderInfo[] {
  const candidates = [
    payload?.data,                  // 주 응답 구조
    payload?.data?.productOrders,   // productOrders 배열
    payload?.productOrders,         // 최상위 직접 접근
  ]
  const list = candidates.find((value) => Array.isArray(value))
  return Array.isArray(list) ? list.filter(Boolean) : []
}

// =====================================================================
// raw event row 생성 (export)
// =====================================================================

/**
 * 상태변경 아이템 1건을 commerce_order_events_raw 테이블에 저장할 형태로 변환한다.
 * "언제 어떤 상태 변화가 있었나"를 시계열로 누적하는 용도 — 재처리 근거 보존.
 * 취소·반품 이벤트도 모두 저장한다 (purchases와 달리 raw는 필터 없음).
 */
export function buildChangedStatusEventRow(input: {
  item: NaverChangedStatusItem          // 변환할 상태변경 아이템
  runId: string                         // 이 행을 생성한 sync run ID
  windowId?: number | null              // 이 행이 속한 24시간 window ID
  sourceChannel?: string                // 채널 (기본 'naver')
  sourceAccountKey?: string | null      // 계정 키 (기본 'default')
}): CommerceOrderEventRawRow {
  const sourceChannel = normalizeCommerceChannel(input.sourceChannel)        // 채널 정규화
  const sourceAccountKey = normalizeSourceAccountKey(input.sourceAccountKey) // 계정키 정규화
  const sourceLineId = normalizeText(input.item.productOrderId)              // 상품주문 번호 정규화

  if (!sourceLineId) {
    throw new Error('productOrderId is required for raw event rows')
  }

  const eventAt = toNullableString(input.item.lastChangedDate)    // 이벤트 발생 시각
  const eventType = toNullableString(input.item.lastChangedType)  // 이벤트 유형

  if (!eventAt || !eventType) {
    throw new Error(`lastChangedDate and lastChangedType are required for ${sourceLineId}`)
  }

  return {
    source_channel: sourceChannel,
    source_fulfillment_type: DEFAULT_COMMERCE_FULFILLMENT_TYPE,
    source_account_key: sourceAccountKey,
    run_id: input.runId,
    window_id: input.windowId ?? null,
    source_order_id: toNullableString(input.item.orderId),          // 주문 번호
    source_line_id: sourceLineId,
    event_type: eventType,
    event_at: eventAt,
    order_status: toNullableString(input.item.productOrderStatus),  // 이벤트 시점 주문 상태
    payment_date: toNullableString(input.item.paymentDate),         // 결제 일시
    extra_flags: {
      // 클레임/선물 관련 부가 정보를 JSON 형태로 묶어서 저장
      claimType: toNullableString(input.item.claimType),
      claimStatus: toNullableString(input.item.claimStatus),
      receiverAddressChanged: Boolean(input.item.receiverAddressChanged),
      giftReceivingStatus: toNullableString(input.item.giftReceivingStatus),
    },
    raw_json: input.item as Record<string, any>, // 네이버 원본 응답 전체 보존
  }
}

// =====================================================================
// 내부 헬퍼: raw line row 생성용
// =====================================================================

/**
 * 주문일을 여러 후보 필드에서 순서대로 찾아 반환한다.
 * 네이버 응답에서 orderDate가 있으면 최우선, 없으면 placeOrderDate → paymentDate → 이벤트 시각 순으로 폴백.
 */
function pickOrderDate(order: Record<string, any> | null | undefined, productOrder: Record<string, any> | null | undefined, fallbackChangedAt?: string | null): string | null {
  return (
    toNullableString(order?.orderDate)          // 1순위: 주문 날짜
    || toNullableString(productOrder?.placeOrderDate) // 2순위: 주문 접수 날짜
    || toNullableString(order?.paymentDate)     // 3순위: 결제 날짜
    || toNullableString(fallbackChangedAt)      // 4순위: 마지막 이벤트 시각
  )
}

/**
 * ISO 날짜 문자열에서 YYYY-MM-DD 날짜만 추출한다.
 * target_month 계산 및 order_date 컬럼에 사용.
 */
function toDateOnly(value?: string | null): string | null {
  const normalized = toNullableString(value)
  if (!normalized) return null
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/) // ISO 앞 10자리 추출 시도
  if (match) return match[1]

  // 정규식으로 추출 실패 시 Date 파싱 후 UTC 날짜로 변환
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null
  return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`
}

/**
 * YYYY-MM-DD 날짜에서 YYYY-MM 월 문자열을 추출한다.
 * purchases.target_month 컬럼 값을 결정하는 데 사용.
 */
function toTargetMonth(value?: string | null): string | null {
  const dateOnly = toDateOnly(value)
  return dateOnly ? dateOnly.slice(0, 7) : null // 앞 7자리만 자르면 YYYY-MM
}

/**
 * 고객 단위 집계 키를 생성한다.
 * buyer_id와 buyer_name 조합으로 동일 고객 여러 주문을 묶을 때 사용.
 * 예: "user123_홍길동"
 */
function buildCustomerKey(buyerId: string, buyerName: string): string {
  return `${buyerId}_${buyerName}`
}

/**
 * purchases.option_info 에 저장할 옵션명을 결정한다.
 * 우선순위: 매핑 테이블의 canonical_variant > 내부 카탈로그 정규화 옵션 > 네이버 원본 옵션명
 * 이렇게 해야 API 동기화 주문이 엑셀 업로드 주문과 동일한 option_info를 가질 수 있다.
 */
function resolveProjectedOptionInfo(input: {
  mappingDecision?: { canonicalVariant: string | null } | null
  resolvedProduct: { normalizedOption: string }
  rawLine: { product_option: string | null }
}): string {
  return input.mappingDecision?.canonicalVariant   // 1순위: DB 매핑 테이블의 canonical 옵션
    || input.resolvedProduct.normalizedOption       // 2순위: 내부 카탈로그 정규화 옵션
    || input.rawLine.product_option                 // 3순위: 네이버 원본 옵션명
    || ''
}

// =====================================================================
// raw line row 생성 (export)
// =====================================================================

/**
 * 상품주문 상세조회 1건을 commerce_order_lines_raw 테이블에 저장할 형태로 변환한다.
 * raw 테이블에는 모든 주문(취소 포함)을 저장한다.
 * 매핑 규칙이 나중에 바뀌어도 이 raw 데이터로 재처리할 수 있다.
 */
export function buildNaverRawLineRow(input: {
  orderInfo: NaverOrderInfo                           // 네이버 상세조회 응답
  latestEvent?: NaverChangedStatusItem | null         // 이 주문의 최신 상태변경 이벤트
  sourceChannel?: string                              // 채널
  sourceAccountKey?: string | null                    // 계정 키
}): CommerceOrderLineRawRow {
  const sourceChannel = normalizeCommerceChannel(input.sourceChannel)
  const sourceAccountKey = normalizeSourceAccountKey(input.sourceAccountKey)
  const order = input.orderInfo.order || {}           // 주문 전체 정보
  const productOrder = input.orderInfo.productOrder || {} // 상품 라인 정보
  const delivery = input.orderInfo.delivery || {}     // 배송 정보
  const shippingAddress = productOrder.shippingAddress || {} // 배송지 주소

  const sourceLineId = normalizeText(productOrder.productOrderId) // 상품주문 번호 (필수)
  if (!sourceLineId) {
    throw new Error('productOrder.productOrderId is required')
  }

  const lastEventType = toNullableString(input.latestEvent?.lastChangedType) // 최신 이벤트 유형
  const lastEventAt = toNullableString(input.latestEvent?.lastChangedDate)   // 최신 이벤트 시각

  return {
    source_channel: sourceChannel,
    source_fulfillment_type: DEFAULT_COMMERCE_FULFILLMENT_TYPE,
    source_account_key: sourceAccountKey,
    source_line_id: sourceLineId,
    source_order_id: toNullableString(order.orderId),                       // 주문 번호
    source_product_id: toNullableString(productOrder.productId),            // 네이버 상품 번호
    // optionCode 우선, 없으면 optionManageCode 사용 (관리자 설정 코드)
    source_option_code: toNullableString(productOrder.optionCode) || toNullableString(productOrder.optionManageCode),
    product_name: normalizeText(productOrder.productName) || '-',           // 상품명 (없으면 '-')
    product_option: toNullableString(productOrder.productOption),           // 옵션명
    // ordererId 우선, 없으면 ordererNo(숫자형 ID) 사용
    buyer_id: toNullableString(order.ordererId) || toNullableString(order.ordererNo),
    buyer_name: toNullableString(order.ordererName),                        // 구매자 이름
    receiver_name: toNullableString(shippingAddress.name),                  // 수령인 이름
    // tel1 우선, 없으면 tel2 사용
    receiver_phone_masked: toNullableString(shippingAddress.tel1) || toNullableString(shippingAddress.tel2),
    receiver_base_address: toNullableString(shippingAddress.baseAddress),   // 기본 주소
    receiver_detail_address: toNullableString(shippingAddress.detailedAddress), // 상세 주소
    quantity: toPositiveInteger(productOrder.quantity, 1),                  // 수량 (최소 1)
    product_order_status: toNullableString(productOrder.productOrderStatus),// 주문 상태
    claim_status: toNullableString(productOrder.claimStatus),               // 클레임 상태
    order_date: pickOrderDate(order, productOrder, lastEventAt),            // 주문일 (다중 폴백)
    payment_date: toNullableString(order.paymentDate),                      // 결제일
    decision_date: toNullableString(productOrder.decisionDate),             // 구매확정일
    invoice_number: toNullableString(delivery.trackingNumber),              // 운송장 번호
    last_event_type: lastEventType,
    last_event_at: lastEventAt,
    raw_json: input.orderInfo as Record<string, any>, // 네이버 원본 응답 전체 보존
  }
}

// =====================================================================
// 핵심: 주문 1건 전체 처리 (export)
// =====================================================================

/**
 * 네이버 상품주문 상세 1건을 받아 다음 세 가지를 결정한다.
 *  1. raw line row 생성 (항상)
 *  2. 취소/반품 등 제외 대상인지 판단 (eligible)
 *  3. 내부 상품 매핑 성공 시 purchase projection 생성
 *
 * 이 함수가 전체 동기화 파이프라인의 핵심 변환 로직이다.
 * 취소/반품 → purchase null 반환 → 나중에 stale row 삭제 대상이 됨
 * 매핑 실패 → eligible=true이지만 purchase null → needs_review=true
 */
export function resolveNaverSyncRecord(input: {
  orderInfo: NaverOrderInfo                               // 네이버 상세조회 응답
  latestEvent?: NaverChangedStatusItem | null             // 최신 상태변경 이벤트
  productLookup: ProductLookup                            // 내부 상품 이름/옵션 기반 fallback 조회 Map
  productMappingLookup?: CommerceProductMappingLookup | null // DB 매핑 테이블 기반 정밀 조회 Map
  runId: string                                           // sync run ID
  sourceChannel?: string
  sourceAccountKey?: string | null
}): ResolvedNaverSyncRecord {
  // 1단계: 네이버 응답 → raw line row 변환 (항상 수행)
  const rawLine = buildNaverRawLineRow(input)

  // 2단계: 주문 상태가 저장 가능한지 판단 (취소·반품완료 등 제외)
  const eligibility = isEligibleCommerceOrderLine({
    orderStatus: rawLine.product_order_status,
    claimStatus: rawLine.claim_status,
  })

  if (!eligibility.eligible) {
    // 취소/반품완료 주문 → raw만 저장, purchase는 생성하지 않음
    return {
      rawLine,
      purchase: null,
      eligible: false,
      eligibilityReason: eligibility.reason,
      needsReview: false,
      mappingReason: null,
    }
  }

  // 3단계: 네이버 상품번호 → 내부 canonical 상품명/옵션으로 1차 변환
  // SOURCE_PRODUCT_RULES에 등록된 상품은 여기서 정규화됨
  const sourceProductMatch = resolveCommerceSourceProduct({
    sourceProductId: rawLine.source_product_id,
    productName: rawLine.product_name,
    optionInfo: rawLine.product_option,
  })

  // 4단계: DB 매핑 테이블로 2차 정밀 매핑 (commerce_product_mappings 기반)
  // productMappingLookup이 없으면 skip (엑셀 업로드 경로에서는 사용 안 함)
  const mappingDecision = input.productMappingLookup
    ? resolveCommerceProductMapping({
        lookup: input.productMappingLookup,
        sourceFulfillmentType: rawLine.source_fulfillment_type,
        sourceAccountKey: rawLine.source_account_key,
        commerceProductId: rawLine.source_product_id,
        commerceOptionCode: rawLine.source_option_code,
        productName: rawLine.product_name,
        optionInfo: rawLine.product_option,
        canonicalOptionInfo: sourceProductMatch?.canonicalOptionInfo ?? rawLine.product_option,
      })
    : null

  // 5단계: 내부 products 테이블에서 최종 상품 ID를 확인
  // 3·4단계에서 정규화된 이름/옵션으로 products 테이블을 조회
  const resolvedProduct = resolveMappedProduct(
    sourceProductMatch?.canonicalProductName || rawLine.product_name,
    sourceProductMatch?.canonicalOptionInfo ?? rawLine.product_option ?? '',
    input.productLookup,
  )

  // 주문일 결정: order_date → payment_date → last_event_at 순으로 폴백
  const orderDate = toDateOnly(rawLine.order_date) || toDateOnly(rawLine.payment_date) || toDateOnly(rawLine.last_event_at)
  if (!orderDate) {
    throw new Error(`Unable to resolve order_date for ${rawLine.source_line_id}`)
  }

  // 귀속 월 결정: YYYY-MM 형식 (purchases.target_month)
  const targetMonth = toTargetMonth(orderDate)
  if (!targetMonth) {
    throw new Error(`Unable to resolve target_month for ${rawLine.source_line_id}`)
  }

  // 6단계: 내부 상품 ID 확정 — DB 매핑 우선, 없으면 카탈로그 fallback
  const internalProductId = mappingDecision?.internalProductId || resolvedProduct.mappedProductId || null

  // purchases.option_info 결정 (canonical_variant → 정규화 옵션 → 원본 순)
  const projectedOptionInfo = resolveProjectedOptionInfo({
    mappingDecision,
    resolvedProduct,
    rawLine,
  })

  const buyerId = rawLine.buyer_id || ''
  const buyerName = rawLine.buyer_name || ''

  // needs_review: 상품 매핑 애매하거나, 내부 상품 ID를 못 찾은 경우 true
  const needsReview = Boolean(sourceProductMatch?.needsReview)
    || Boolean(mappingDecision?.needsReview)
    || !internalProductId

  if (!internalProductId) {
    // 내부 상품 ID 매핑 실패 → purchase 생성 불가, raw만 저장
    return {
      rawLine,
      purchase: null,
      eligible: true,
      eligibilityReason: eligibility.reason,
      needsReview: true,
      mappingReason: mappingDecision?.reason || 'internal product mapping not resolved',
    }
  }

  // 모든 조건 통과 → purchases row 생성
  return {
    rawLine,
    purchase: {
      purchase_id: rawLine.source_line_id,  // 네이버 상품주문 번호를 PK로 사용
      upload_batch_id: input.runId,         // sync run ID를 배치 ID로 사용
      target_month: targetMonth,
      buyer_id: buyerId,
      buyer_name: buyerName,
      receiver_name: rawLine.receiver_name,
      customer_key: buildCustomerKey(buyerId, buyerName), // "id_이름" 집계 키
      product_id: internalProductId,                      // 내부 상품 ID (products FK)
      product_name: resolvedProduct.normalizedName || rawLine.product_name,
      option_info: projectedOptionInfo,                   // canonical 옵션명
      source_product_name: rawLine.product_name,          // 네이버 원본 상품명 (감사용)
      source_option_info: rawLine.product_option || '',   // 네이버 원본 옵션명 (감사용)
      source_channel: rawLine.source_channel,
      source_fulfillment_type: rawLine.source_fulfillment_type,
      source_account_key: rawLine.source_account_key,
      source_order_id: rawLine.source_order_id,
      source_product_id: rawLine.source_product_id,
      source_option_code: rawLine.source_option_code,
      source_last_changed_at: rawLine.last_event_at,      // 마지막 상태 변경 시각
      source_sync_run_id: input.runId,
      quantity: rawLine.quantity,
      order_date: orderDate,
      order_status: rawLine.product_order_status || 'UNKNOWN',
      claim_status: rawLine.claim_status,
      // deliveryMethod 우선, 없으면 expectedDeliveryMethod 사용
      delivery_type: toNullableString(input.orderInfo.delivery?.deliveryMethod)
        || toNullableString(input.orderInfo.productOrder?.expectedDeliveryMethod),
      is_fake: false,       // API 동기화 주문은 항상 false (체험단 필터링이 별도 처리)
      match_reason: null,   // 체험단 매칭 결과는 필터링 실행 후 채워짐
      match_rank: null,     // 체험단 매칭 Rank도 마찬가지
      matched_exp_id: null, // 매칭 체험단 ID도 마찬가지
      needs_review: needsReview,
      is_manual: false,     // API 동기화 = 자동 분류, 수동 아님
      filter_ver: NAVER_IMPORT_FILTER_VER, // 'api_import_v1' 버전 태그
      quantity_warning: rawLine.quantity >= 2, // 2개 이상이면 체험단 가능성 경고
    },
    eligible: true,
    eligibilityReason: eligibility.reason,
    needsReview,
    mappingReason: mappingDecision?.reason || null,
  }
}

// =====================================================================
// 외부용 래퍼 함수 (export) — sync-naver-orders.mjs에서 직접 호출
// =====================================================================

/**
 * products 테이블 rows를 이름/옵션 기준 빠른 조회 Map으로 변환한다.
 * 이 Map은 resolveNaverSyncRecord() 안의 resolveMappedProduct()가 사용한다.
 */
export function buildProductLookupFromRows(rows: ProductCatalogItem[]): ProductLookup {
  return buildProductLookup(rows)
}

/**
 * commerce_product_mappings 테이블 rows를 상품번호 기준 빠른 조회 Map으로 변환한다.
 * 이 Map은 resolveNaverSyncRecord() 안의 resolveCommerceProductMapping()이 사용한다.
 */
export function buildCommerceProductMappingLookupFromRows(
  rows: CommerceProductMappingRow[],
): CommerceProductMappingLookup {
  return buildCommerceProductMappingLookup(rows)
}
