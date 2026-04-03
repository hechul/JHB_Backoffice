# Step 2. 영향 범위 식별

기준일: 2026-03-31
상태: 완료
목적: 구현에 들어가기 전에, 현재 코드베이스에서 정확히 어디가 영향을 받는지와
지금은 건드리면 안 되는 부분을 분리해서 고정한다.

---

## 1. 이번 Step에서 확정된 것

이번 Step에서는 "쿠팡을 붙이면 어디를 수정해야 하는가"만 확인했다.
아직 SQL 적용이나 기능 구현은 시작하지 않았다.

확정된 핵심 축은 아래 두 개다.

- `source_channel`
  - `naver`
  - `coupang`

- `source_fulfillment_type`
  - 네이버: 아직 값 미확정
  - 쿠팡 판매자배송: `marketplace`
  - 쿠팡 로켓그로스: `rocket_growth`

즉, 이제는 `채널 분리`만으로는 부족하고,
쿠팡 안에서도 `판매자배송 / 로켓그로스`를 분리할 수 있어야 한다.

---

## 2. DB/백엔드에서 영향을 받는 영역

### 2.1 sync 메타 테이블

파일:
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/sql/backoffice_v2/100_commerce_sync_core.sql`

영향 이유:
- 현재 `commerce_sync_runs`, `commerce_sync_cursors`는 `source_channel`까지만 축으로 사용한다.
- 쿠팡은 `coupang + marketplace`와 `coupang + rocket_growth`를 별도 sync 단위로 다뤄야 하므로,
  `source_fulfillment_type` 축이 필요하다.

영향 지점:
- `commerce_sync_runs` 컬럼
- `commerce_sync_runs` 인덱스
- `commerce_sync_cursors` 컬럼
- `commerce_sync_cursors` primary key

### 2.2 raw 주문 테이블

파일:
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/sql/backoffice_v2/101_commerce_order_raw.sql`

영향 이유:
- 현재 raw key는 사실상 `source_channel + source_account_key + source_line_id`
- 쿠팡 일반판매/로켓그로스가 같은 `source_line_id` 공간을 공유하지 않을 가능성을 배제할 수 없다.
- 따라서 raw/event/raw line key에도 `source_fulfillment_type`가 들어가는 쪽이 안전하다.

영향 지점:
- `commerce_order_events_raw` 컬럼
- `commerce_order_events_raw` unique key
- `commerce_order_events_raw` line index
- `commerce_order_lines_raw` 컬럼
- `commerce_order_lines_raw` primary key
- `commerce_order_lines_raw` order/product index

### 2.3 상품 매핑 테이블

파일:
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/sql/backoffice_v2/102_commerce_product_mappings.sql`

영향 이유:
- 쿠팡은 같은 상품군/같은 옵션처럼 보여도
  `marketplace vendorItemId`와 `rocketGrowth vendorItemId`가 따로 존재할 수 있다.
- 따라서 매핑 row는 `source_channel='coupang'`만으로는 충분하지 않고,
  `source_fulfillment_type`까지 포함해야 한다.

영향 지점:
- 컬럼 추가
- unique index 확장
- lookup index 확장

### 2.4 purchases projection

파일:
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/sql/backoffice_v2/103_extend_purchases_source_columns.sql`

영향 이유:
- 현재 `purchases`는 `source_channel`까지만 있다.
- 검색/분석에서 `쿠팡 전체`, `쿠팡 판매자배송`, `쿠팡 로켓그로스`를 나누려면
  projection에도 `source_fulfillment_type`가 필요하다.

영향 지점:
- 새 컬럼 추가
- source order/source product 인덱스 확장
- comment 수정

### 2.5 공통 타입/매핑 로직

파일:
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/server/utils/commerce/types.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/server/utils/commerce/mapping.ts`

영향 이유:
- `CommerceChannel`은 이미 `coupang`을 포함한다.
- 하지만 fulfillment 타입 개념은 없다.
- 매핑 lookup도 현재는 `source_channel`과 `commerce_product_id`까지만 고려한다.

영향 지점:
- `CommerceFulfillmentType` 타입 추가
- `CommerceOrderLineInput`에 fulfillment 필드 추가
- `CommerceProductMappingRow`에 fulfillment 필드 추가
- lookup key/resolve 입력 확장

### 2.6 네이버 sync 코드

파일:
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/server/utils/commerce/naver-sync.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/scripts/sync-naver-orders.mjs`

영향 이유:
- 이 두 파일이 현재 raw row / purchases row shape를 사실상 표준으로 굳히고 있다.
- schema가 바뀌면 네이버 쪽도 그 컬럼을 명시적으로 채워야 한다.

영향 지점:
- raw row 타입
- projection row 타입
- mapping query
- sync run/cursor query
- raw upsert conflict key
- projection delete query

### 2.7 시드 스크립트

파일:
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/scripts/seed-commerce-product-mappings.mjs`

영향 이유:
- 현재는 네이버 row만 넣고 있고,
  conflict key에도 fulfillment 축이 없다.
- 쿠팡 SKU 매핑을 넣으려면 구조를 확장해야 한다.

---

## 3. 프론트/검색/분석에서 영향을 받는 영역

### 3.1 고객현황

파일:
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/app/pages/customers.vue`

영향 이유:
- 현재 필터는 상품/이름/단계/강도 중심이고 `채널`, `배송유형`이 없다.
- 집계 키가 `customer_key || buyer_id + buyer_name` 기반이라 사실상 네이버 가정이 강하다.

확정된 영향:
- 필터 바에 `채널`, `배송유형` 추가 필요
- `fetchCustomers`, `fetchCustomerOrders`에 source filter 필요

보류:
- 네이버/쿠팡 고객을 하나의 고객으로 통합하는 규칙

### 3.2 요약 대시보드

파일:
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/app/pages/dashboard.vue`

영향 이유:
- 지금은 단일 `purchases` 집계 기준으로 요약 KPI를 만든다.
- 쿠팡 채널과 fulfillment 필터가 없으면 집계가 섞인다.

확정된 영향:
- 상단에 `채널`, `배송유형` 필터 추가 필요
- `fetchPurchases`, `applyDashboardScope`, `applyDashboardMetrics`
  에 source filter 반영 필요
- `/customers` 이동 query에도 filter 전달 필요

### 3.3 상품 분석

파일:
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/app/pages/product-trends.vue`

영향 이유:
- 같은 상품군이라도 네이버/쿠팡, 판매자배송/로켓그로스가 섞이면 분석이 흐려진다.

확정된 영향:
- 툴바 필터 추가
- `fetchPurchases`, `applyProductScope`에 source filter 반영

### 3.4 성장단계 / 공통 컴포저블

파일:
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/app/pages/growth-stages.vue`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/app/composables/useGrowthInsights.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/app/composables/usePurchaseSourceFields.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/app/composables/usePurchaseQuantity.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/app/composables/useCommerceProductCatalog.ts`

영향 이유:
- `usePurchaseSourceFields`는 이미 source 계열 컬럼을 읽는 구조가 있다.
- 하지만 채널/배송유형 차원은 없다.
- `useGrowthInsights`는 `customer_key`, `buyer_id` 중심이라 쿠팡 통합 분석에는 위험하다.
- `useCommerceProductCatalog`는 현재 네이버 source product id를 코드 상수로 박아두고 있다.

확정된 영향:
- source field 공통 fetch 확장 필요
- 고객 분석은 초기에 채널 분리로 가는 것이 안전

보류:
- 쿠팡 SKU 규칙을 지금 이 컴포저블에 바로 넣을지,
  아니면 DB 매핑 테이블 중심으로 옮길지

---

## 4. 지금 건드리지 않아도 되는 파일

파일:
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/server/utils/commerce/channel.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/server/utils/commerce/mapping-rules.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/server/utils/commerce/order-eligibility.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/server/api/commerce/naver/sync.post.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/scripts/sync-master-data.mjs`

이유:
- `channel.ts`는 채널 정규화만 담당
- `mapping-rules.ts`는 lookup 입력만 맞으면 재사용 가능
- `order-eligibility.ts`는 네이버 전용으로 두고, 쿠팡은 별도 eligibility가 더 자연스러움
- `naver/sync.post.ts`는 래퍼 API라 schema 축을 직접 만지지 않음
- `sync-master-data.mjs`는 공용 REST 헬퍼라 직접 영향이 없음

---

## 5. Step 2 기준의 불확실한 점

아래는 아직 확정하지 않았다.
이게 확정되기 전에는 구현에 들어가지 않는다.

### 5.1 네이버 fulfillment 기본값

아직 결정 안 됨:
- `null`로 둘지
- `'naver'` 같은 고정값으로 둘지
- `'default'` / `'naver_default'` 같은 별도 값으로 둘지

이 결정은 아래를 같이 흔든다.
- SQL default / not null 정책
- 네이버 raw/projection 코드
- sync key / cursor key

### 5.2 쿠팡 주문 API의 line id 공간

아직 결정 안 됨:
- `marketplace`와 `rocket_growth`가 같은 line id 공간을 쓰는지
- 둘이 겹칠 수 있는지
- source line/order key를 어떤 조합으로 잡아야 안전한지

이게 확정되기 전에는 raw PK/unique를 완전히 확정하면 안 된다.

### 5.3 쿠팡 고객 식별 전략

아직 결정 안 됨:
- 쿠팡 고객 분석을 어떤 key로 묶을지
- 네이버와 통합할지
- 쿠팡 내부 전용 키로 먼저 갈지

이게 확정되기 전에는 `/customers`, `useGrowthInsights.ts`의 통합 로직을 손대면 안 된다.

### 5.4 쿠팡 수량 정규화 위치

아직 결정 안 됨:
- `useCommerceProductCatalog.ts`에 계속 코드 상수로 둘지
- DB 매핑 테이블 중심으로 옮길지

이건 주문 API의 실제 값과 매핑 테이블 구조가 먼저 확정돼야 한다.

---

## 6. Step 2 완료 결론

이번 Step에서 확정된 결론은 아래다.

1. 영향 범위는 이미 충분히 보인다.
2. 제일 먼저 바뀌는 축은 `source_fulfillment_type`이다.
3. 구현 전 Step 3에서 꼭 검증할 것은 두 개다.
   - 네이버 fulfillment 기본값
   - 쿠팡 주문 API의 실제 ID 구조
4. 고객 통합 규칙과 쿠팡 수량 규칙은 아직 구현하지 않는다.

다음 Step은 위 두 가지 불확실성만 따로 검증하는 것이다.
