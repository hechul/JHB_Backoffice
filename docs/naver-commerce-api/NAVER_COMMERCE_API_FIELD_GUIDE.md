# 네이버 커머스 API 값 정리 및 백오피스 활용 가이드

- 작성일: 2026-03-27
- 기준 앱: `apps/backoffice-v2`
- 기준 브랜치: `dev/naver-commerce-api`
- 목적: 네이버 주문 동기화 프로젝트를 진행하면서
  - 네이버 API로 실제 가져올 수 있는 값
  - 현재 백오피스에서 이미 사용 중인 값
  - 아직 안 쓰지만 추가하면 강화되는 값
  - 구조적으로 못 가져오거나 제약이 있는 값
  을 한 문서에서 정리한다.

---

## 1. 문서 요약

현재 굿포펫 백오피스는 네이버 커머스 API에서 아래 3단계를 사용한다.

1. OAuth 토큰 발급
2. 변경 상품 주문 내역 조회
3. 상품 주문 상세 내역 조회

현재 구현은 주문 동기화에 필요한 핵심 주문/상품/상태/배송/고객 식별 정보를 충분히 수집하고 있다.
다만 `결제 금액`, `정산 예정 금액`, `유입 경로`, `결제 수단`, `광고/채널 성과` 등은
공식 문서상 가져올 수 있는 값도 있지만 아직 별도 컬럼으로 저장하지 않거나,
브랜드스토어/API데이터솔루션 제약 때문에 현재 구조에 바로 넣지 못한 항목이 있다.

중요한 결론은 아래와 같다.

- 지금도 `주문수`, `실구매 주문수`, `실구매 고객수`, `재구매`, `상품별 판매량`, `옵션별 판매량`, `주문상태 분포`는 충분히 가능하다.
- `결제금액`, `객단가`, `정산 예정 금액`, `유입 경로 기반 분석`은 추가 저장만 하면 강화 가능하다.
- `광고 유입 성과`, `고객 데이터/재구매 통계 API`, `마케팅 분석 API`는 브랜드스토어 + API데이터솔루션 제약이 있다.

---

## 2. 현재 백오피스에서 실제로 호출하는 API

### 2-1. 인증 토큰 발급

- 엔드포인트: `POST /external/v1/oauth2/token`
- 코드 위치:
  - `apps/backoffice-v2/scripts/sync-naver-orders.mjs`
  - `fetchNaverAccessToken()`
  - `signNaverClientSecret()`
- 용도:
  - 네이버 주문 API 호출용 Bearer Token 발급
- 참고 문서:
  - [인증 | 커머스API](https://apicenter.commerce.naver.com/docs/auth)

### 2-2. 변경 상품 주문 내역 조회

- 엔드포인트: `GET /v1/pay-order/seller/product-orders/last-changed-statuses`
- 코드 위치:
  - `apps/backoffice-v2/scripts/sync-naver-orders.mjs`
  - `fetchChangedStatusesForWindow()`
  - `apps/backoffice-v2/server/utils/commerce/naver-sync.ts`
  - `extractNaverChangedStatusItems()`
  - `extractNaverChangedStatusPagination()`
  - `buildChangedStatusEventRow()`
- 용도:
  - 지정 기간 안에 상태가 바뀐 상품주문행 목록 수집
  - 증분 동기화의 시작점
- 참고 문서:
  - [변경 상품 주문 내역 조회](https://apicenter.commerce.naver.com/docs/commerce-api/2.58.0/seller-get-last-changed-status-pay-order-seller)

### 2-3. 상품 주문 상세 내역 조회

- 엔드포인트: `POST /v1/pay-order/seller/product-orders/query`
- 코드 위치:
  - `apps/backoffice-v2/scripts/sync-naver-orders.mjs`
  - `fetchProductOrderDetails()`
  - `apps/backoffice-v2/server/utils/commerce/naver-sync.ts`
  - `extractNaverProductOrderInfos()`
  - `buildNaverRawLineRow()`
  - `resolveNaverSyncRecord()`
- 용도:
  - 실제 분석에 필요한 주문 상세 복원
  - raw 저장 + purchases projection 생성
- 참고 문서:
  - [상품 주문 상세 내역 조회](https://apicenter.commerce.naver.com/docs/commerce-api/2.68.0/seller-get-product-orders-pay-order-seller)
  - [상품 주문 정보 구조체](https://apicenter.commerce.naver.com/docs/commerce-api/2.61.0/schemas/%EC%83%81%ED%92%88-%EC%A3%BC%EB%AC%B8-%EC%A0%95%EB%B3%B4-%EA%B5%AC%EC%A1%B0%EC%B2%B4)

---

## 3. 현재 백오피스에서 이미 사용 중인 API 정보

현재 서비스는 네이버 응답에서 아래 값을 실제로 추출해 사용한다.

### 3-1. 이벤트 raw (`commerce_order_events_raw`)

저장 위치:
- `docs/sql/backoffice_v2/101_commerce_order_raw.sql`
- `commerce_order_events_raw`

현재 저장 필드:

- `source_order_id`
- `source_line_id` (`productOrderId`)
- `event_type` (`lastChangedType`)
- `event_at` (`lastChangedDate`)
- `order_status`
- `payment_date`
- `extra_flags`
- `raw_json`

의미:
- 상태변경 이력 로그 보존
- 나중에 재처리 / 디버깅 / 증분 누락 확인용

### 3-2. 주문 라인 raw (`commerce_order_lines_raw`)

저장 위치:
- `docs/sql/backoffice_v2/101_commerce_order_raw.sql`
- `commerce_order_lines_raw`

현재 저장 필드:

- 주문 식별
  - `source_order_id`
  - `source_line_id`
  - `source_product_id`
  - `source_option_code`
- 상품
  - `product_name`
  - `product_option`
  - `quantity`
- 구매자/수취인
  - `buyer_id`
  - `buyer_name`
  - `receiver_name`
  - `receiver_phone_masked`
  - `receiver_base_address`
  - `receiver_detail_address`
- 상태/일시
  - `product_order_status`
  - `claim_status`
  - `order_date`
  - `payment_date`
  - `decision_date`
  - `last_event_type`
  - `last_event_at`
- 배송
  - `invoice_number`
- 원본
  - `raw_json`

코드 기준 추출 위치:
- `apps/backoffice-v2/server/utils/commerce/naver-sync.ts`
- `buildNaverRawLineRow()`

### 3-3. 분석용 주문 (`purchases`)

저장 위치:
- `docs/sql/backoffice_v2/000_backoffice_v2_base_schema.sql`
- `public.purchases`

현재 projection에 쓰는 값:

- 식별/분석 키
  - `purchase_id`
  - `target_month`
  - `buyer_id`
  - `buyer_name`
  - `receiver_name`
  - `customer_key`
- 상품/옵션
  - `product_id`
  - `product_name`
  - `option_info`
  - `source_product_name`
  - `source_option_info`
- 원본 소스
  - `source_channel`
  - `source_account_key`
  - `source_order_id`
  - `source_product_id`
  - `source_option_code`
  - `source_last_changed_at`
  - `source_sync_run_id`
- 주문 상태
  - `quantity`
  - `order_date`
  - `order_status`
  - `claim_status`
  - `delivery_type`
- 내부 분석용 필드
  - `is_fake`
  - `match_reason`
  - `match_rank`
  - `matched_exp_id`
  - `needs_review`
  - `is_manual`
  - `filter_ver`
  - `quantity_warning`

코드 기준 변환 위치:
- `apps/backoffice-v2/server/utils/commerce/naver-sync.ts`
- `resolveNaverSyncRecord()`

---

## 4. 네이버 주문 API로 가져올 수 있는 값

아래는 공식 주문 상세 구조체 기준으로 백오피스에서 활용 가능한 값들이다.
현재 문서에서는 `백오피스 관점에서 의미 있는 거의 모든 값`을 범주별로 정리한다.
완전한 원본 전체 필드는 공식 schema 링크를 기준으로 확인한다.

참고:
- [상품 주문 정보 구조체](https://apicenter.commerce.naver.com/docs/commerce-api/2.61.0/schemas/%EC%83%81%ED%92%88-%EC%A3%BC%EB%AC%B8-%EC%A0%95%EB%B3%B4-%EA%B5%AC%EC%A1%B0%EC%B2%B4)

### 4-1. 주문 기본 정보

가져올 수 있는 대표 필드:

- `orderId`
- `orderDate`
- `paymentDate`
- `shippingDueDate`
- `payLocationType`
- `mallId`
- `merchantChannelId`
- `ordererId`
- `ordererNo`
- `ordererName`

활용 방안:

- 주문수 / 실구매 주문수 집계
- 주문일 / 결제일 기준 일별·주별·월별 분석
- 고객 키 생성
- PC/Mobile 구분 분석

### 4-2. 상품주문 기본 정보

가져올 수 있는 대표 필드:

- `productOrderId`
- `productId`
- `originalProductId`
- `itemNo`
- `productName`
- `productOption`
- `quantity`
- `optionCode`
- `optionManageCode`
- `sellerCustomCode1`
- `sellerCustomCode2`
- `individualCustomUniqueCode`

활용 방안:

- 상품별 판매량
- 옵션별 판매량
- 내부 상품 매핑 정밀도 개선
- 원본 상품번호 기반 canonicalization

### 4-3. 주문 상태 / 클레임 정보

가져올 수 있는 대표 필드:

- `productOrderStatus`
- `claimType`
- `claimStatus`
- `decisionDate`
- `claimId`
- `completedClaims`

활용 방안:

- 결제완료 / 배송중 / 배송완료 / 구매확정 / 취소 / 반품 분석
- 주문 파이프라인 상태 분포
- 취소완료 / 반품완료 제외 규칙 고도화
- 반품거절 / 철회 포함 규칙 보정

### 4-4. 배송 / 수취 정보

가져올 수 있는 대표 필드:

- `shippingAddress.name`
- `shippingAddress.tel1`
- `shippingAddress.tel2`
- `shippingAddress.baseAddress`
- `shippingAddress.detailedAddress`
- `delivery.deliveryMethod`
- `delivery.trackingNumber`
- `shippingMemo`
- `takingAddress.*`

활용 방안:

- 고객/수취인 매칭 보조
- 배송 방법별 분석
- CS/운영 확인용 상세 조회

### 4-5. 결제 / 금액 / 정산 관련 정보

가져올 수 있는 대표 필드:

- `totalPaymentAmount`
- `initialPaymentAmount`
- `remainPaymentAmount`
- `totalProductAmount`
- `initialProductAmount`
- `remainProductAmount`
- `unitPrice`
- `sellerBurdenDiscountAmount`
- `productImmediateDiscountAmount`
- `paymentCommission`
- `saleCommission`
- `channelCommission`
- `expectedSettlementAmount`
- `generalPaymentAmount`
- `chargeAmountPaymentAmount`
- `checkoutAccumulationPaymentAmount`
- `naverMileagePaymentAmount`

활용 방안:

- 일별 결제 금액
- 월별 결제 금액
- 객단가
- 할인/정산 관점의 상품 수익성 분석
- 판매 수수료 및 채널 수수료 기반 정산 추정

현재 상태:

- 공식 schema상 존재함
- 현재 굿포펫 `purchases`와 raw 테이블에는 별도 컬럼으로 저장하지 않음
- 따라서 지금은 화면에서 활용하지 못함

### 4-6. 유입 / 채널 관련 정보

가져올 수 있는 대표 필드:

- `inflowPath`
- `inflowPathAdd`
- `merchantChannelId`
- `payLocationType`

활용 방안:

- 주문 단위 유입 경로 분류
- 모바일/PC 결제 비중
- 채널 유입 분류

중요한 해석:

- 주문 상세 구조체에는 `inflowPath`, `inflowPathAdd`가 존재한다.
- 즉 주문 API만으로도 일부 유입 정보는 확보 가능하다.
- 다만 네이버 스마트스토어센터의 마케팅 분석 수준처럼
  `채널별 유입수/결제성과/광고성과`를 완전히 재현하려면 별도 통계 API가 필요하다.

---

## 5. 현재는 안 쓰지만, 추가하면 백오피스를 강화할 수 있는 API 정보

아래 항목은 공식 문서상 가져올 수 있으나 현재 구현에서는 저장/표시하지 않는 정보다.

### 5-1. 결제 금액

추가 필드:

- `totalPaymentAmount`
- `initialPaymentAmount`
- `remainPaymentAmount`

강화 효과:

- `요약` 화면에 오늘/이번 주/이번 달 결제금액 추가
- `객단가` 계산
- 상품별 매출 기준 정렬

### 5-2. 정산/수수료

추가 필드:

- `expectedSettlementAmount`
- `paymentCommission`
- `saleCommission`

강화 효과:

- 순매출 / 정산예정금액 분석
- 상품별 수익성 판단
- 광고/채널 수수료를 반영한 운영 판단

### 5-3. 유입 경로

추가 필드:

- `inflowPath`
- `inflowPathAdd`
- `payLocationType`

강화 효과:

- 유입 경로별 주문수
- PC/Mobile 결제 비중
- 유입경로별 실구매 분석

주의:

- 주문 상세 수준 유입 정보와
- 스마트스토어센터의 마케팅 통계 화면은 같은 수준이 아니다.

### 5-4. 결제 수단 구성

추가 필드:

- `generalPaymentAmount`
- `chargeAmountPaymentAmount`
- `checkoutAccumulationPaymentAmount`
- `naverMileagePaymentAmount`

강화 효과:

- 결제 수단 구성 분석
- 포인트/적립금 사용 경향 분석

### 5-5. 더 정교한 상품 운영 정보

추가 필드:

- `sellerCustomCode1`
- `sellerCustomCode2`
- `individualCustomUniqueCode`
- `itemNo`

강화 효과:

- 내부 ERP / 상품관리 코드 연동
- 상품 분류 고도화
- 사은품/세트/옵션 식별력 향상

---

## 6. 네이버 API에서 구조적으로 못 가져오거나, 제약이 큰 정보

### 6-1. 광고 성과를 주문 API만으로 완전히 구분

주문 API만으로 어려운 것:

- 이 주문이 광고 때문에 발생했는지 여부를 100% 확정
- 채널/캠페인/광고소재 단위 성과
- 유입수 / 클릭수 / 전환율 / ROAS

이유:

- 주문 상세의 `inflowPath`는 주문 단위 보조 정보에 가깝다.
- 스마트스토어센터의 마케팅 분석 수준은 별도 통계 API 성격이다.

대안:

- 브랜드스토어 + API데이터솔루션 환경이면 마케팅 분석 API 검토
- 아니면 광고 관리자 데이터와 별도 결합 필요

참고:
- [마케팅 분석](https://apicenter.commerce.naver.com/docs/commerce-api/2.67.0/%EB%A7%88%EC%BC%80%ED%8C%85-%EB%B6%84%EC%84%9D)

### 6-2. 고객 데이터 / 재구매 통계 API의 직접 사용

제약:

- 브랜드스토어 전용
- API데이터솔루션 구독 필요

현재 의미:

- 굿포펫은 현재 주문 API만으로 고객/재구매를 직접 계산하고 있다.
- 별도 고객 데이터 API를 전제로 설계하지 않는다.

참고:
- [고객 데이터](https://apicenter.commerce.naver.com/docs/commerce-api/current/%EA%B3%A0%EA%B0%9D-%EB%8D%B0%EC%9D%B4%ED%84%B0)
- [재구매 통계 API](https://apicenter.commerce.naver.com/docs/commerce-api/2.67.0/get-repurchase-data-insight)

### 6-3. 쇼핑 행동 데이터

주문 API만으로 어려운 것:

- 노출수
- 클릭수
- 찜
- 장바구니
- 상세페이지 유입수

이유:

- 주문 API는 주문/상품주문 중심
- 쇼핑행동 분석은 다른 통계 영역

### 6-4. 풀네임 보장

공식 schema에는 `ordererName`, `shippingAddress.name`이 존재한다.
다만 실제 운영 데이터에서는 일부 응답이 `황*호`, `김*소`처럼 마스킹되어 들어온 사례가 확인됐다.

의미:

- 문서상 이름 필드는 존재
- 하지만 실운영에서는 항상 풀네임이 보장된다고 가정하면 안 됨
- 체험단 필터링은 `buyer_id + 이름 패턴 매칭` 같이 보완 규칙이 필요

주의:

- 이 내용은 공식 문서가 아니라 실제 굿포펫 운영 데이터 관찰 결과다.

---

## 7. 현재 프로젝트에서 API 관련 제약 사항

### 7-1. 회사 IP 제한

현재 구조상 동기화는 회사 네트워크 기준으로만 실행한다.

의미:

- 회사 외부에서는 조회는 가능해도 네이버 API 동기화는 제한될 수 있다.
- 1차 운영은 `회사 와이파이 + 수동 동기화` 기준이다.

### 7-2. 금액 필드 미저장

현재 `purchases`에는 금액 컬럼이 없다.

영향:

- 결제금액
- 객단가
- 정산 예정 금액
- 수수료 기반 순매출

을 지금 화면에서 계산하지 못한다.

근거:

- `docs/sql/backoffice_v2/000_backoffice_v2_base_schema.sql`
- `purchases` 스키마에 금액 컬럼 없음

### 7-3. 현재 raw_json은 전체 원본을 이미 보관

중요한 장점:

- `commerce_order_lines_raw.raw_json`에는 상세 응답 전체가 저장된다.
- 따라서 향후 금액/유입경로/수수료 필드를 raw에서 재추출해 backfill할 수 있다.

이건 큰 장점이다.
즉 “다시 네이버 API를 처음부터 다 돌리지 않고도” 일부 보강이 가능할 수 있다.

---

## 8. 백오피스를 더 강화하기 위한 권장 로드맵

### 8-1. 1순위

- 주문 상세 금액 필드 저장 추가
  - `totalPaymentAmount`
  - `expectedSettlementAmount`
  - `paymentCommission`
  - `saleCommission`

이후 가능한 화면:

- 오늘/이번 주/이번 달 결제금액
- 객단가
- 상품별 매출
- 정산 추정 리포트

### 8-2. 2순위

- 유입 경로 필드 저장 추가
  - `inflowPath`
  - `inflowPathAdd`
  - `payLocationType`

이후 가능한 화면:

- 유입 경로별 주문수
- PC/Mobile 결제 비중
- 유입경로별 실구매 분석

### 8-3. 3순위

- 마케팅 분석 API 검토

전제:

- 브랜드스토어 여부 확인
- API데이터솔루션 구독 가능 여부 확인

이후 가능한 화면:

- 광고/유입 채널 성과
- 채널별 결제 성과
- 광고 유입 매출 vs 자연 매출

### 8-4. 4순위

- 고객 데이터 API 검토

전제:

- 브랜드스토어 + API데이터솔루션

현재는 주문 데이터만으로도 고객/재구매 화면을 운영할 수 있으므로 우선순위는 낮다.

---

## 9. 문서 결론

현재 굿포펫의 네이버 API 연동은 `주문 동기화` 관점에서 핵심 구조를 이미 갖추고 있다.

정리하면:

- 현재도 가능한 것
  - 주문수
  - 실구매 주문수
  - 실구매 고객수
  - 재구매 고객수
  - 상품별 판매량
  - 옵션별 판매량
  - 주문상태 분포
  - 고객현황
  - 재구매 통계

- 공식 문서상 가능하지만 아직 저장 안 한 것
  - 결제금액
  - 객단가 계산용 금액
  - 정산 예정 금액
  - 수수료
  - 유입 경로
  - PC/Mobile 구분

---

## 10. 참고 문서

- [커머스API 소개](https://apicenter.commerce.naver.com/docs/introduction)
- [인증](https://apicenter.commerce.naver.com/docs/auth)
- [변경 상품 주문 내역 조회](https://apicenter.commerce.naver.com/docs/commerce-api/2.58.0/seller-get-last-changed-status-pay-order-seller)
- [상품 주문 상세 내역 조회](https://apicenter.commerce.naver.com/docs/commerce-api/2.68.0/seller-get-product-orders-pay-order-seller)
- [상품 주문 정보 구조체](https://apicenter.commerce.naver.com/docs/commerce-api/2.61.0/schemas/%EC%83%81%ED%92%88-%EC%A3%BC%EB%AC%B8-%EC%A0%95%EB%B3%B4-%EA%B5%AC%EC%A1%B0%EC%B2%B4)
- [고객 데이터](https://apicenter.commerce.naver.com/docs/commerce-api/current/%EA%B3%A0%EA%B0%9D-%EB%8D%B0%EC%9D%B4%ED%84%B0)
- [재구매 통계 API](https://apicenter.commerce.naver.com/docs/commerce-api/2.67.0/get-repurchase-data-insight)
- [마케팅 분석](https://apicenter.commerce.naver.com/docs/commerce-api/2.67.0/%EB%A7%88%EC%BC%80%ED%8C%85-%EB%B6%84%EC%84%9D)
