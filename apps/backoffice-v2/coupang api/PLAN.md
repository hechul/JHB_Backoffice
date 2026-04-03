# 쿠팡 API 연동 계획

기준일: 2026-03-31  
대상 앱: `apps/backoffice-v2`  
문서 목적: 네이버 커머스 API 연동 구조를 참고하되, 쿠팡의 채널/배송유형/SKU 구조 차이를 반영한 별도 구현 계획을 확정한다.

## 1. 목표

쿠팡 데이터를 백오피스 v2에 연동해 아래를 가능하게 한다.

- 쿠팡 주문 동기화
- 쿠팡 상품 SKU와 내부 상품 매핑
- 판매자배송과 로켓그로스 분리 집계
- 네이버/쿠팡 채널별 검색과 분석
- 고객 분석 화면에서 채널 구분
- 향후 재고/정산/광고 성과 분석 확장

## 2. 네이버와 쿠팡의 핵심 차이

### 2.1 채널 구조 차이

네이버는 현재 구현상 `source_channel = 'naver'` 하나로 충분하다.

쿠팡은 `source_channel = 'coupang'` 아래에서 다시 두 유형을 구분해야 한다.

- 판매자배송: 마켓플레이스 일반 판매
- 로켓그로스: 쿠팡 물류 연계 판매

즉 쿠팡은 채널 하나 안에서도 추가 축이 필요하다.

### 2.2 상품 식별 구조 차이

네이버는 대체로 아래 흐름이다.

- 상품 그룹 식별: `productId`
- 주문 라인 식별: `productOrderId`
- 옵션: `optionCode` / `optionInfo`

쿠팡은 아래 구조다.

- 상품 그룹: `sellerProductId`
- 실제 판매 SKU: `vendorItemId`
- 같은 옵션도 판매자배송과 로켓그로스의 `vendorItemId`가 다를 수 있음

즉 쿠팡은 상품군보다 SKU 단위가 더 중요하다.

### 2.3 고객 식별 차이

네이버는 `buyer_id(ordererId)` 기반 분석이 강하다.

쿠팡은 현재 공식 문서/응답 기준으로 네이버 수준의 안정적인 구매자 계정 ID가 약하다.

따라서 고객 분석은 아래 원칙으로 간다.

- 초기에는 네이버/쿠팡 고객 분석을 기본 분리
- 쿠팡은 쿠팡 내부 집계용 키를 별도 설계
- 교차채널 고객 통합은 2차 과제로 미룸

## 3. 현재 확인된 사실

### 3.1 쿠팡 상품 마스터 확인 완료

실제 API 호출로 아래를 확인했다.

- 굿포펫 상품 그룹 수: 10개
- SKU 수: 다수 (`vendorItemId` 기준)
- 일부 SKU는 판매자배송과 로켓그로스 양쪽 ID를 모두 가짐
- 일부 SKU는 로켓그로스만 존재
- `애착트릿 3종`은 현재 확인 기준 일반판매만 존재

### 3.2 중요한 예시

예: 트릿백 `1개 민트`

- 일반판매 `vendorItemId`: `94054315326`
- 로켓그로스 `vendorItemId`: `94165163695`

예: 엔자이츄 `1개 꿀고구마맛 100g`

- 일반판매 `vendorItemId`: `93885404452`
- 로켓그로스 `vendorItemId`: `94132809744`

즉 같은 상품명/옵션이라도 판매유형에 따라 SKU ID가 다를 수 있다.

## 4. 설계 원칙

### 4.1 동기화는 네이버와 분리

쿠팡은 네이버 동기화에 끼워 넣지 않는다.

별도 구현 단위:

- 쿠팡 sync API
- 쿠팡 sync CLI
- 쿠팡 전용 normalizer / mapper / collector

### 4.2 검색과 분석은 채널 구분을 유지

아래 공통 필터를 추가한다.

- 채널: 전체 / 네이버 / 쿠팡
- 쿠팡 배송유형: 전체 / 판매자배송 / 로켓그로스

쿠팡 선택 시에만 배송유형 필터를 활성화한다.

### 4.3 매핑 기준은 SKU

쿠팡 상품 매핑은 이름보다 `vendorItemId`를 우선 기준으로 한다.

즉 아래 식별 조합을 기준으로 저장한다.

- `source_channel = 'coupang'`
- `source_fulfillment_type = 'marketplace' | 'rocket_growth'`
- `source_product_id = vendorItemId`

## 5. 데이터 모델 변경 계획

### 5.1 새 컬럼

아래 테이블에 `source_fulfillment_type` 추가를 검토한다.

- `commerce_order_lines_raw`
- `commerce_order_events_raw`
- `commerce_product_mappings`
- `purchases`

권장 값:

- `default`
- `marketplace`
- `rocket_growth`

정리 방식:

- 네이버는 `source_channel = 'naver'`, `source_fulfillment_type = 'default'`
- 쿠팡 판매자배송은 `source_channel = 'coupang'`, `source_fulfillment_type = 'marketplace'`
- 쿠팡 로켓그로스는 `source_channel = 'coupang'`, `source_fulfillment_type = 'rocket_growth'`

### 5.2 쿠팡 상품 매핑 방식

`commerce_product_mappings`에는 SKU 1개당 1행으로 저장한다.

예시:

- `coupang + marketplace + 엔자이츄 1개`
- `coupang + rocket_growth + 엔자이츄 1개`

둘은 서로 다른 외부 SKU지만 같은 내부 상품으로 매핑될 수 있다.

추가로 아래 메타를 같이 관리한다.

- `pack_multiplier`
- `canonical_variant`
- `canonical_group`

## 6. 구현 범위

### 6.1 백엔드

추가 파일:

- `server/utils/commerce/coupang-sync.ts`
- `scripts/sync-coupang-orders.mjs`
- `server/api/commerce/coupang/sync.post.ts`

필요 기능:

- 쿠팡 HMAC 인증
- 상품 마스터 조회
- 판매자배송 주문 수집
- 로켓그로스 주문 수집
- 주문 raw 저장
- purchases projection 생성

### 6.2 프론트엔드

추가/변경 대상:

- 쿠팡 sync 전용 화면
- 검색 필터에 `채널` 추가
- 쿠팡 선택 시 `배송유형` 필터 추가
- 고객 분석 페이지에 `채널 구분` 반영
- 상품 분석 페이지에 `채널/배송유형` 반영

### 6.3 분석

초기 분석 범위:

- 채널별 매출
- 상품별 판매량
- SKU별 판매량
- 판매자배송 vs 로켓그로스 성과 비교

2차 분석 범위:

- 재고/판매속도
- 정산
- 광고비 대비 성과

## 7. 구현 단계

### 단계 1. SKU 기준표 확정

목표:

- 굿포펫 상품 전체의 `marketplaceVendorItemId`
- `rocketGrowthVendorItemId`
- 내부 상품 연결 기준

산출물:

- 쿠팡 SKU 매핑표

### 단계 2. 스키마 보강

목표:

- `source_fulfillment_type` 저장 구조 추가
- 필요시 인덱스 보강

산출물:

- SQL 마이그레이션

### 단계 3. 상품 매핑 적재

목표:

- `commerce_product_mappings`에 쿠팡 SKU 반영

산출물:

- 쿠팡용 seed script 또는 admin 등록 플로우

### 단계 4. 주문 API 샘플 검증

목표:

- 실제 주문 API가 주는 `vendorItemId`가
  - 일반판매 ID인지
  - 로켓그로스 ID인지
  확인

이 단계가 끝나야 sync 설계를 확정할 수 있다.

### 단계 5. 쿠팡 sync MVP

목표:

- 판매자배송 주문 적재
- 로켓그로스 주문 적재
- `commerce_order_lines_raw` 저장
- `purchases` 생성

주의:

- 네이버와 달리 쿠팡은 fulfillment 구분을 반드시 유지

### 단계 6. 화면 필터 반영

목표:

- 네이버/쿠팡 검색 분리
- 쿠팡 배송유형별 검색
- 고객 분석 채널 구분

### 단계 7. 보강 API 연결

목표:

- 취소/반품
- 배송 상태
- 재고
- 정산

## 8. 추천 구현 순서

개발 효율 기준 우선순위:

1. SKU 기준표 확정
2. 주문 API 검증
3. 스키마 보강
4. 매핑 적재
5. 쿠팡 sync MVP
6. 검색/고객 분석 필터 반영
7. 재고/정산/광고 확장

## 9. 위험 요소

### 9.1 단건 조회와 하이브리드 목록 응답 차이

쿠팡 상품 응답은 문서/엔드포인트에 따라 구조가 다르게 보일 수 있다.

따라서 상품 마스터 기준은 아래 우선순위로 본다.

1. 하이브리드 상품 목록 응답의 `marketPlaceItemData`, `rocketGrowthItemData`
2. 상품 단건 조회 응답
3. 재고/주문 API로 실사용 ID 재검증

### 9.2 고객 분석 정확도

쿠팡은 네이버처럼 `buyer_id` 중심 매칭이 어렵다.

따라서 초반에는 채널 혼합 고객 분석보다 채널 분리 분석이 더 안전하다.

### 9.3 광고비 분석

판매/주문/재고/정산은 OpenAPI로 처리 가능하지만, 광고비는 별도 소스가 필요할 수 있다.

즉 광고 성과 분석은 아래 조합이 필요할 수 있다.

- 쿠팡 판매 OpenAPI
- 쿠팡 광고센터 보고서

## 10. 이번 계획의 최종 판단

쿠팡 연동은 네이버 구현을 재사용할 수 있지만, 아래를 반드시 별도로 반영해야 한다.

- 쿠팡 sync 분리
- 채널 필터 분리
- 고객 분석 채널 구분
- 판매자배송 / 로켓그로스 분리
- SKU(`vendorItemId`) 중심 매핑

즉 이번 작업은 단순히 "네이버 커넥터 하나 더 추가"가 아니라,
"멀티채널 + 멀티 fulfillment 구조"로 백오피스를 한 단계 확장하는 작업이다.

## 11. 다음 액션

가장 먼저 할 일:

1. 쿠팡 SKU 기준표를 내부 상품과 연결한 매핑표 작성
2. 주문 API 샘플로 판매자배송/로켓그로스 주문 ID 구조 확인
3. 그 결과를 기준으로 SQL/코드 구현 시작
