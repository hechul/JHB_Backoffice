# Step 3. 애매한 지점 검증

기준일: 2026-03-31
상태: 완료
목적: 설계에 직접 영향을 주는 애매한 지점만 따로 검증하고,
확정된 것과 아직 확정하지 않은 것을 분리한다.

---

## 1. 검증 대상

이번 Step에서 따로 본 항목은 두 개다.

1. 쿠팡 주문 API가 실제로 어떤 ID 구조를 내려주는가
2. 네이버는 `source_fulfillment_type`를 어떤 값으로 저장하는 것이 맞는가

---

## 2. 쿠팡 주문 API ID 구조 검증

### 2.1 로켓그로스 주문 API는 실데이터로 확인됨

실제 호출:
- `GET /v2/providers/rg_open_api/apis/api/v1/vendors/{vendorId}/rg/orders`

실제 응답에서 확인한 값:
- 조회 월: `2026-01`
- `orderId = 31100162748800`
- `orderItems[0].vendorItemId = 94132809744`
- `orderItems[0].productName = 굿포펫 ... 엔자이츄 ... 1개 꿀고구마맛 100g`

확인된 구조:
- 로켓그로스 주문 row의 상위 식별자는 `orderId`
- 상품 라인 식별자는 `orderItems[].vendorItemId`
- 별도의 line 전용 고유 ID는 응답에 보이지 않았다

즉 현재 확인 범위에서는,
로켓그로스 주문은 `orderId`와 `vendorItemId` 조합으로만 라인을 식별해야 할 가능성이 높다.

### 2.2 로켓그로스 공식 문서도 같은 구조를 보여줌

공식 문서:
- `RG Order API (List Query)`
- 경로: `GET /v2/providers/rg_open_api/apis/api/v1/vendors/{vendorId}/rg/orders`

문서상 응답 구조:
- 상위: `orderId`, `vendorId`, `paidAt`
- 하위: `orderItems[].vendorItemId`, `productName`, `salesQuantity`, `unitSalesPrice`, `currency`

문서상으로도 별도 line id는 보이지 않는다.

참고 문서:
- https://developers.coupangcorp.com/hc/en-us/articles/41131195825433-RG-Order-API-List-Query

### 2.3 일반판매 주문 API는 문서로는 확인되지만, 실데이터는 아직 확보하지 못함

실제 탐침 범위:
- 최근 36개월 월별 검색
- 상태별 `ordersheets` 조회
- 취소/반품 요청 경로를 통한 `shipmentBoxId` 확보 시도

실제 결과:
- 일반판매 주문 live sample: 찾지 못함
- 취소/반품 우회 경로: 찾지 못함

현재 이 계정 기준으로는,
확인 가능한 범위에서 marketplace 주문 응답 샘플을 확보하지 못했다.

따라서 일반판매 쪽은 아직 문서 기반 보수 설계만 가능하다.

참고 문서:
- https://developers.coupangcorp.com/hc/ko/articles/360034320553-%EB%B0%9C%EC%A3%BC%EC%84%9C-%EB%8B%A8%EA%B1%B4-%EC%A1%B0%ED%9A%8C-orderId
- https://developers.coupangcorp.com/hc/ko/articles/360033792854-%EB%B0%9C%EC%A3%BC%EC%84%9C-%EB%8B%A8%EA%B1%B4-%EC%A1%B0%ED%9A%8C-shipmentBoxId

### 2.4 여기까지 검증하고 확정할 수 있는 것

확정 가능:
- 쿠팡 주문 API는 네이버 `productOrderId`처럼 바로 쓸 수 있는 line 고유 ID가 약하다
- `rocket_growth`는 실데이터 기준으로도 `orderId + vendorItemId` 축이다
- 문서 기준으로 `marketplace`는 `shipmentBoxId`, `orderId`, `orderItems[].vendorItemId` 축으로 봐야 한다
- 문서 기준으로 `vendorItemPackageId`는 line 고유키로 쓰면 안 된다
- 따라서 raw key와 projection key는 `source_fulfillment_type`를 반드시 포함하는 쪽이 안전하다

아직 확정 보류:
- 일반판매 live 응답에서 같은 `shipmentBoxId` 안에 같은 `vendorItemId`가 2개 이상 반복되는지
- 일반판매 live 응답에서 같은 `orderId` 아래 여러 `shipmentBoxId`가 붙을 때 어떤 문자열 규칙이 가장 안정적인지

현재 단계의 안전한 결론:
- 쿠팡용 `source_line_id`는 원본 native single field에 의존하지 않고 synthetic key로 가야 한다
- 현재 가장 안전한 1차 후보는 아래 둘 중 하나다.
  - `marketplace:{shipmentBoxId}:{vendorItemId}:{itemIndex}`
  - `rocket_growth:{orderId}:{vendorItemId}:{itemIndex}`
- 여기서 `itemIndex`를 같이 넣는 이유는 동일 주문/동일 SKU 중복 가능성을 보수적으로 막기 위해서다
- 따라서 SQL/코드 설계는 synthetic key 전제로 진행하는 것이 안전하다

---

## 3. 네이버 fulfillment 기본값 검증

이건 API 검증이 아니라 schema 설계 판단이다.

### 3.1 `null`은 부적합

이유:
- 이번 설계에서는 `source_fulfillment_type`가 index/unique/PK 축에 들어갈 가능성이 높다
- `null`은 key/unique 의미를 흐리게 만들고 query도 불편해진다

즉 네이버도 non-null 고정값을 갖는 편이 낫다.

### 3.2 고정값은 `default`가 가장 안전

후보 비교:
- `null`
  - 탈락
- `'naver'`
  - 동작은 가능하지만 채널값과 fulfillment값이 섞인다
- `'default'`
  - 네이버에 별도 fulfillment 분기가 없다는 의미로 가장 중립적이다

현재 판단:
- 네이버는 `source_channel = 'naver'`
- 네이버는 `source_fulfillment_type = 'default'`

이 값은 UI에서 따로 노출하지 않고,
PK/인덱스/내부 정규화에서만 사용하면 된다.

### 3.3 이 결정으로 얻는 장점

- 모든 채널이 `source_fulfillment_type`를 non-null로 가진다
- SQL key 설계가 단순해진다
- 추후 카카오/기타 채널도 기본값 `default`로 맞출 수 있다
- 쿠팡만 `marketplace | rocket_growth`를 실제 값으로 쓰면 된다

---

## 4. Step 3 기준 확정 / 보류 정리

### 4.1 확정

- 쿠팡은 `source_fulfillment_type` 축이 필요하다
- 로켓그로스 주문 API에는 line 전용 native id가 보이지 않는다
- 일반판매 문서 기준 `vendorItemPackageId`는 신뢰할 수 없다
- 네이버의 `source_fulfillment_type` 기본값은 `default`로 두는 것이 안전하다
- 쿠팡 `source_line_id`는 synthetic key 전제로 가는 것이 안전하다

### 4.2 아직 보류

- 쿠팡 `source_line_id`의 최종 synthetic 문자열 규칙 세부안
- 일반판매 주문 live sample 확보
- 쿠팡 고객 식별 전략
- 쿠팡 수량 정규화 규칙의 저장 위치

---

## 5. 지금 단계의 정지선

아직 아래 항목은 구현하지 않는다.

- SQL migration
- `source_line_id` 최종 문자열 규칙
- 고객 분석 통합
- 쿠팡 수량 계산 로직

이유:
- 고객 식별 전략이 아직 없다
- 일반판매 주문 live sample이 아직 없다
- 동일 주문 안 동일 SKU 반복 여부를 더 보수적으로 확인하지 않았다

다음 Step은 지금까지 확정된 내용만 반영한
`구현 전 최종 설계 TODO`를 문서로 고정하는 것이다.
