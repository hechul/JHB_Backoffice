# Step 4. 구현 전 최종 TODO

기준일: 2026-03-31
상태: 완료
목적: Step 1~3에서 확정된 사실만 가지고, 실제 구현 순서를 안전한 작은 단위로 고정한다.

## 1. 이번 Step에서 구현 가능한 범위

이미 확정된 것만 먼저 구현한다.

이번 시점에서 바로 구현 가능한 것:
- `source_fulfillment_type` 스키마 추가
- 공통 타입 확장
- 쿠팡 SKU 매핑용 구조 추가
- 쿠팡 sync 뼈대 파일 추가

아직 구현하면 안 되는 것:
- 쿠팡 고객 통합 규칙
- 쿠팡 고객 분석 통합 지표
- 쿠팡 수량 정규화 최종 로직
- 쿠팡 `source_line_id` 최종 문자열 규칙 고정

## 2. 실제 구현 순서

### 2.1 1차: 스키마 축 추가

먼저 할 일:
- `source_fulfillment_type`를 아래에 추가
  - `commerce_sync_runs`
  - `commerce_sync_cursors`
  - `commerce_order_events_raw`
  - `commerce_order_lines_raw`
  - `commerce_product_mappings`
  - `purchases`

기본값:
- 네이버/기타 기본: `default`
- 쿠팡 판매자배송: `marketplace`
- 쿠팡 로켓그로스: `rocket_growth`

이 단계 목적:
- 아직 쿠팡 sync를 안 붙여도, DB가 채널/배송유형 2축을 받을 준비를 하게 만든다.

### 2.2 2차: 공통 타입/매핑 구조 확장

다음 할 일:
- `CommerceFulfillmentType` 타입 추가
- 매핑 row/lookup 입력에 fulfillment 축 추가
- purchases source field fetch 구조에 fulfillment 컬럼 추가

이 단계 목적:
- 기존 네이버 코드를 깨지 않으면서, 쿠팡이 들어올 자리만 만든다.

### 2.3 3차: 쿠팡 상품 매핑 구조

다음 할 일:
- `commerce_product_mappings`에 쿠팡 SKU row를 넣을 수 있게 한다
- 같은 내부 상품이라도
  - `coupang + marketplace + vendorItemId`
  - `coupang + rocket_growth + vendorItemId`
  를 따로 저장한다

이 단계 목적:
- 주문 sync 전에 SKU 매핑 기반을 먼저 만든다.

### 2.4 4차: 쿠팡 sync 뼈대

다음 할 일:
- `server/utils/commerce/coupang-sync.ts`
- `scripts/sync-coupang-orders.mjs`
- `server/api/commerce/coupang/sync.post.ts`

여기서는 먼저 뼈대만 만든다.

초기 범위:
- 인증
- 주문 fetch
- raw row 생성
- 아직 고객 통합/수량 규칙은 최소화

### 2.5 5차: 화면 필터 확장

다음 할 일:
- `/dashboard`
- `/customers`
- `/product-trends`

추가 필터:
- `source_channel`
- `source_fulfillment_type`

주의:
- 고객 통합 로직은 이 단계에서도 하지 않는다
- 우선은 source filter만 추가한다

## 3. 1차 구현에서 건드릴 파일

### 새 파일

- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/sql/backoffice_v2/106_add_source_fulfillment_type.sql`

### 기존 파일 중 다음 단계에서 수정 예정

- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/server/utils/commerce/types.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/server/utils/commerce/mapping.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/app/composables/usePurchaseSourceFields.ts`

아직 보류:
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/app/pages/customers.vue`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/app/composables/useGrowthInsights.ts`

이유:
- 고객 식별 전략이 아직 미확정

## 4. source_line_id 1차 정책

아직 최종 확정은 아니지만,
구현을 시작할 때 참고할 1차 권장안은 아래다.

- marketplace:
  - `marketplace:{shipmentBoxId}:{vendorItemId}:{itemIndex}`
- rocket_growth:
  - `rocket_growth:{orderId}:{vendorItemId}:{itemIndex}`

주의:
- 이건 "native 단일 id가 없으므로 synthetic key로 간다"는 방향을 고정한 것이다.
- 최종 문자열 포맷은 구현 직전에 한 번 더 검토한다.

## 5. Step 4 완료 결론

이제 구현은 아래 순서로만 들어간다.

1. 스키마 축 추가
2. 공통 타입 확장
3. SKU 매핑 구조
4. 쿠팡 sync 뼈대
5. 화면 필터

즉 다음 실제 코드 작업의 가장 안전한 시작점은
`106_add_source_fulfillment_type.sql` 추가와
타입 확장이다.
