# Backoffice V2 코드 학습 가이드

이 문서는 **코드를 거의 모르는 상태**에서 `apps/backoffice-v2`를 이해하기 위해 만든 학습용 문서입니다.

목표는 아래 3가지입니다.

1. 화면에서 누르는 버튼이 **어느 함수로 연결되는지** 이해한다.
2. 각 페이지가 **어느 테이블을 읽고 쓰는지** 이해한다.
3. 주문 동기화, 체험단 업로드, 필터링, 대시보드가 **어떤 순서로 연결되는지** 이해한다.

이 문서는 일부 구현 의도보다 **실제 코드 흐름**에 더 집중합니다.

---

## 1. 가장 먼저 이해할 전체 구조

이 프로젝트는 크게 아래처럼 나뉩니다.

- `apps/backoffice-v2/app/pages`
  - 사용자 화면
- `apps/backoffice-v2/app/layouts`
  - 화면 공통 틀
- `apps/backoffice-v2/app/composables`
  - 화면들이 공통으로 쓰는 상태/계산 로직
- `apps/backoffice-v2/server/api`
  - 브라우저가 호출하는 서버 API
- `apps/backoffice-v2/server/utils`
  - 서버 전용 비즈니스 로직
- `apps/backoffice-v2/scripts`
  - 수동 실행 또는 백그라운드 실행 스크립트
- `docs/sql/backoffice_v2`
  - DB 테이블 정의
- `docs/naver-commerce-api`
  - 네이버 API 설계/제약/필드 문서

이걸 한 문장으로 정리하면:

- `pages`는 화면
- `composables`는 화면용 공통 로직
- `server/api`는 버튼이 누르는 서버 진입점
- `scripts`는 대량 동기화/백그라운드 작업
- `docs/sql`은 데이터 저장 구조

---

## 2. 사용자가 처음 보는 흐름: 레이아웃에서 시작

### 2-1. 기본 레이아웃 파일

가장 먼저 볼 파일:

- `apps/backoffice-v2/app/layouts/default.vue`

이 파일은 대부분의 백오피스 화면이 공통으로 사용하는 틀입니다.

여기서 중요한 역할은 4가지입니다.

1. 사이드바 메뉴 구성
2. 현재 페이지 제목/그룹 표시
3. 월 선택 UI 표시
4. 공통 헤더 동작 처리

### 2-2. 사이드바 메뉴는 어디서 만들어지나

`default.vue` 안에서 아래 computed가 메뉴를 만듭니다.

- `analysisMenuItems`
- `customerMenuItems`
- `allMenuItems`

역할은 각각 이렇습니다.

- `analysisMenuItems`
  - 매출분석 그룹 메뉴
  - 현재는 `요약`, `판매분석`
- `customerMenuItems`
  - 고객 관리 그룹 메뉴
  - `고객현황`, `재구매 통계`, `주문 동기화`, `데이터 업로드`, `필터링`, `실행 이력`
- `allMenuItems`
  - 현재 route가 어떤 메뉴에 속하는지 찾기 위한 전체 메뉴 목록

즉 화면에서 왼쪽 메뉴를 누를 때는 사실상 아래와 같은 구조입니다.

- `NuxtLink to="/dashboard"` → 요약 화면
- `NuxtLink to="/product-trends"` → 판매분석 화면
- `NuxtLink to="/customers"` → 고객현황 화면
- `NuxtLink to="/growth-stages"` → 재구매 통계 화면
- `NuxtLink to="/naver-sync"` → 주문 동기화 화면
- `NuxtLink to="/upload"` → 체험단 업로드 화면
- `NuxtLink to="/filter"` → 필터링 화면
- `NuxtLink to="/logs"` → 실행 이력 화면
- `NuxtLink to="/products"` → 상품 목록 화면

즉 사이드바는 별도 함수가 페이지를 여는 게 아니라, **Nuxt 라우팅으로 페이지를 이동**합니다.

### 2-3. 현재 페이지 이름은 어떻게 정해지나

`default.vue` 안에:

- `currentPageTitle`
- `currentGroup`

이 두 computed가 있습니다.

이 로직은 현재 URL인 `route.path`를 보고 `allMenuItems`에서 같은 path를 찾아:

- 현재 페이지 제목
- 현재 페이지가 속한 그룹

을 만듭니다.

즉 예를 들어:

- 현재 경로가 `/customers`
- `allMenuItems` 안에 `{ path: '/customers', label: '고객현황', group: '고객 관리' }`

이면 헤더에는:

- 그룹: `고객 관리`
- 현재 페이지: `고객현황`

이 표시됩니다.

### 2-4. 헤더의 버튼은 무엇을 하나

`default.vue`에서 공통 헤더의 실제 함수는 아래입니다.

- `handleLogout()`
  - `logout()` 호출
  - 로그아웃 처리
- `handlePageRefresh()`
  - `window.location.reload()`
  - 페이지 새로고침
- `handleGoBack()`
  - 브라우저 뒤로가기
  - 실패하면 홈(`/`)으로 이동

즉 헤더는 **공통 탐색 도구** 역할입니다.

---

## 3. 공통 월 선택 기능은 어떻게 동작하나

### 3-1. 관련 파일

- `apps/backoffice-v2/app/composables/useAnalysisPeriod.ts`

이 파일은 거의 모든 분석 화면이 공통으로 쓰는 월 선택 상태를 관리합니다.

### 3-2. 핵심 상태

여기서 중요한 상태는 아래입니다.

- `selectedMonth`
  - 현재 선택된 월
  - 예: `2026-02`
- `availableMonths`
  - DB에 실제 데이터가 있는 월 목록
- `monthsLoading`
  - 월 목록 불러오는 중인지
- `monthsError`
  - 월 목록 조회 실패 메시지

### 3-3. 왜 이 composable이 중요한가

요약, 판매분석, 고객현황, 로그, 업로드, 필터링은 전부 이 월 선택 상태를 공유합니다.

즉 사용자가 헤더에서 `2026년 2월`을 고르면,

- `/dashboard`
- `/product-trends`
- `/customers`
- `/filter`
- `/upload`

가 모두 같은 `selectedMonth`를 참고합니다.

### 3-4. 월 목록은 어디서 가져오나

`useAnalysisPeriod.ts`는 월 목록을 가져올 때 2단계로 시도합니다.

1. RPC 사용
   - `get_purchase_month_counts`
2. 실패하면 purchases 테이블 직접 조회

즉 이 composable의 목적은:

- 현재 월 선택 기억
- DB에 실제 데이터 있는 월 자동 조회
- 페이지 전체에서 같은 월 상태 공유

입니다.

### 3-5. 왜 localStorage를 쓰나

아래 키를 씁니다.

- `jhbiofarm_analysis_month`
- `jhbiofarm_analysis_month_options_v1`

의미는:

- 마지막으로 본 월 기억
- 월 옵션 목록 캐시

즉 새로고침해도 이전에 보던 월을 유지하려는 구조입니다.

---

## 4. DB 구조를 먼저 이해해야 하는 이유

### 4-1. 가장 중요한 기본 테이블

파일:

- `docs/sql/backoffice_v2/000_backoffice_v2_base_schema.sql`

이 파일에서 제일 중요한 테이블은 아래입니다.

#### `profiles`

- 사용자 계정 정보
- 역할: `admin`, `modifier`, `viewer`
- 상태: `pending`, `active`, `rejected`, `inactive`

이 테이블이 필요한 이유:

- 누가 수정 가능한지
- 누가 열람만 가능한지
- 누가 실행했는지 로그 남기기 위해

#### `products`

- 내부 상품 마스터
- 내부 기준 상품 ID / 상품명 / 옵션명 / 펫 타입 / 단계 등

이 테이블이 필요한 이유:

- 외부 채널 상품명을 내부 기준 상품으로 통일하기 위해

#### `campaigns`

- 체험단 캠페인 묶음

이 테이블이 필요한 이유:

- 어느 체험단 업로드가 어떤 캠페인인지 구분하기 위해

#### `purchases`

가장 중요한 테이블입니다.

이 테이블은:

- 최종 분석용 주문 결과

입니다.

즉 대시보드, 고객현황, 판매분석은 대부분 이 테이블을 읽습니다.

중요 컬럼:

- `purchase_id`
- `target_month`
- `buyer_id`
- `buyer_name`
- `customer_key`
- `product_id`
- `product_name`
- `option_info`
- `quantity`
- `order_date`
- `order_status`
- `claim_status`
- `is_fake`
- `matched_exp_id`
- `needs_review`
- `filter_ver`

이 컬럼 의미는 아래처럼 이해하면 됩니다.

- `is_fake = true`
  - 체험단 주문으로 판정된 주문
- `needs_review = true`
  - 자동 판정이 애매해서 사람이 확인해야 하는 주문
- `filter_ver != null`
  - 필터가 한 번이라도 반영된 주문

#### `experiences`

- 체험단 엑셀 업로드 결과 테이블

중요 컬럼:

- `campaign_id`
- `mission_product_name`
- `mapped_product_id`
- `option_info`
- `receiver_name`
- `naver_id`
- `purchase_date`
- `unmatch_reason`

이 테이블은 필터링 시 `purchases`와 매칭됩니다.

#### `filter_logs`

- 필터 실행 이력

왜 필요한가:

- 언제, 누가, 어떤 월에 필터를 돌렸는지
- 얼마나 매칭됐는지

#### `override_logs`

- 수동 수정 이력

왜 필요한가:

- 사람이 주문을 체험단/실구매로 바꾼 흔적을 남기기 위해

---

## 5. 커머스 동기화용 테이블은 왜 따로 있나

### 5-1. 관련 파일

- `docs/sql/backoffice_v2/100_commerce_sync_core.sql`
- `docs/sql/backoffice_v2/101_commerce_order_raw.sql`
- `docs/sql/backoffice_v2/102_commerce_product_mappings.sql`

### 5-2. `commerce_sync_runs`

- 동기화 실행 1번의 메타 정보

예:

- 언제 시작했는지
- 어떤 기간을 가져왔는지
- 성공/실패 여부
- summary_json

즉 “한 번의 동기화 작업”을 기록합니다.

### 5-3. `commerce_sync_windows`

- 동기화 기간을 쪼갠 구간별 결과

네이버 상태변경 조회는 긴 기간을 하루 단위로 나눠 처리합니다.

예:

- 2026-03-01
- 2026-03-02
- 2026-03-03

이런 하루 단위 처리 결과가 이 테이블에 들어갑니다.

### 5-4. `commerce_order_events_raw`

- 상태변경 이벤트 raw 로그

즉 “이 주문행이 언제 어떤 상태로 바뀌었는가”를 저장합니다.

### 5-5. `commerce_order_lines_raw`

- 주문 상세 raw 스냅샷

즉 네이버 상세조회 응답을 거의 그대로 저장한 테이블입니다.

### 5-6. `commerce_product_mappings`

- 외부 채널 상품 ↔ 내부 상품 연결 테이블

예:

- 네이버 상품번호 `12417368947`
- 내부 상품 `츄라잇`

이런 연결을 저장합니다.

즉 이 구조를 한 줄로 정리하면:

- 네이버 원본은 `commerce_* raw`
- 최종 분석용은 `purchases`

입니다.

---

## 6. 홈 화면은 무엇을 하나

### 6-1. 관련 파일

- `apps/backoffice-v2/app/pages/index.vue`
- `apps/backoffice-v2/app/layouts/home.vue`

홈은 DB 작업 중심 페이지는 아닙니다.

역할은:

- 인사말 표시
- 빠른 이동 메뉴 표시
- 백오피스 안내 푸터 표시

즉 홈은 **실제 데이터 작업을 하는 페이지라기보다 런처**입니다.

홈에서 누르는 대표 링크:

- `굿포펫` → `/dashboard`
- `근태 관리` → `/attendance/records`
- `업무 자동화` → `/automation`
- `계정 관리` → `/settings/users`

---

## 7. 요약 화면(`/dashboard`)은 어떻게 동작하나

### 7-1. 관련 파일

- `apps/backoffice-v2/app/pages/dashboard.vue`

### 7-2. 이 페이지가 읽는 테이블

이 페이지는 주로 아래 2개를 읽습니다.

- `products`
- `purchases`

### 7-3. 어떤 함수가 DB를 읽나

#### `loadProductMeta()`

이 함수는 `products` 테이블을 읽습니다.

목적:

- 상품별 펫 타입
- stage
- expected_consumption_days

같은 메타 정보를 메모리에 올리기 위해

#### `fetchPurchases()`

이 함수는 `purchases` 테이블을 페이지 단위로 읽습니다.

조건:

- `filter_ver`가 null이 아닌 행만 사용

즉 “필터가 반영된 주문”만 대시보드에 쓰겠다는 뜻입니다.

#### `applyDashboardMetrics(scopeRows, allRows)`

이 함수는 DB를 직접 읽지 않고, 이미 가져온 `purchases`를 가공합니다.

여기서 계산하는 것:

- 실구매 고객수
- 실구매 주문수
- 재구매 고객수
- churn 관련 수치
- 일별 추이

### 7-4. 왜 `purchases`를 그대로 안 보여주고 다시 계산하나

왜냐하면 `purchases`는 주문행 단위이고,  
대시보드는 그걸 다시:

- 고객 기준
- 상품 기준
- 날짜 기준

으로 묶어서 보여줘야 하기 때문입니다.

즉 이 페이지는 한 문장으로:

**`purchases`를 읽어서 KPI와 차트용 집계로 변환하는 페이지**입니다.

---

## 8. 판매분석 화면(`/product-trends`)은 어떻게 동작하나

### 8-1. 관련 파일

- `apps/backoffice-v2/app/pages/product-trends.vue`

### 8-2. 이 페이지가 읽는 테이블

- `purchases`

### 8-3. 어떤 함수가 핵심인가

#### `fetchPurchases()`

`purchases`를 읽되, 조건이 있습니다.

- `filter_ver != null`
- `is_fake = false`
- `needs_review = false`

즉 이 페이지는 **실구매 확정 주문만** 봅니다.

#### `buildAxis(monthSnapshot, weekSnapshot)`

이 함수는 차트의 x축을 만듭니다.

예:

- 전체 기간이면 월 축
- 특정 월이면 주차 축
- 특정 주차면 일 축

#### `applyProductScope()`

이 함수는 현재 월/주/상품 선택 상태를 기준으로:

- 상품별 수량
- 옵션별 요약
- 상태 분포
- 차트 값

을 계산합니다.

즉 판매분석은 한 문장으로:

**실구매 주문(`purchases`)을 상품 중심으로 다시 집계하는 화면**입니다.

---

## 9. 고객현황 화면(`/customers`)은 어떻게 동작하나

### 9-1. 관련 파일

- `apps/backoffice-v2/app/pages/customers.vue`

### 9-2. 이 페이지가 읽는 테이블

- `products`
- `purchases`

### 9-3. 핵심 함수

#### `loadProductMeta()`

대시보드와 비슷하게 `products`를 읽어 상품 메타를 가져옵니다.

이유:

- 고객별 펫 타입
- 단계
- 소비 주기

같은 파생 값을 계산하기 위해

#### `fetchCustomers()`

이 함수가 핵심입니다.

동작 순서:

1. `products` 메타 다시 읽음
2. `purchases`를 모두 페이지 단위로 읽음
3. 조건:
   - `filter_ver != null`
   - `is_fake = false`
   - `needs_review = false`
4. `customer_key` 기준으로 주문을 묶음
5. 고객별 구매횟수, 최근 주문, 현재 주문상태 계산

즉 고객현황은:

**실구매 주문을 고객 기준으로 다시 묶어서 보여주는 화면**입니다.

#### `fetchCustomerOrders(customer)`

고객 목록에서 한 명을 클릭하면 상세 패널용 주문 목록을 가져옵니다.

여기서도 `purchases`를 읽습니다.

조건:

- 현재 월
- 현재 고객의 `customer_key` 또는 `buyer_id + buyer_name`

즉 고객 상세는 결국 `purchases`의 부분집합입니다.

### 9-4. 왜 현재 주문상태가 고객 화면에 필요한가

이 페이지는 단순히 “누가 몇 번 샀나”만 보는 게 아니라,

- 최근 상태가 결제완료인지
- 배송완료인지
- 구매확정인지

같은 운영용 정보도 같이 보여주기 때문입니다.

---

## 10. 체험단 업로드 화면(`/upload`)은 어떻게 동작하나

### 10-1. 관련 파일

- `apps/backoffice-v2/app/pages/upload.vue`
- `apps/backoffice-v2/app/composables/useExcelParser.ts`

### 10-2. 지금 이 페이지의 역할

중요:

이 페이지는 지금 **주문 업로드 페이지가 아니라 체험단 업로드 페이지**입니다.

주문은 네이버 API 동기화로 들어오고,  
여기서는 체험단 엑셀만 업로드합니다.

### 10-3. 이 페이지가 읽고 쓰는 테이블

읽는 테이블:

- `campaigns`
- `products`
- `experiences`

쓰는 테이블:

- `campaigns`
- `experiences`
- 경우에 따라 `products`

### 10-4. 핵심 함수

#### `startUpload()`

이 함수가 업로드의 중심입니다.

흐름:

1. 현재 선택 월을 `targetMonth`로 잡음
2. 체험단 엑셀 파싱 결과를 가져옴
3. `campaigns`에서 기존 캠페인을 찾거나 생성
4. 기존 같은 월/캠페인 체험단 데이터 정리
5. 각 체험단 행을 내부 상품과 연결 시도
6. `experiences`에 insert

### 10-5. 왜 `products`를 읽나

체험단 엑셀의 자유로운 상품명/옵션을  
내부 canonical 상품으로 맞추기 위해서입니다.

즉:

- 체험단 시트 원문
- 내부 상품 마스터

를 연결하기 위해 `products`를 읽습니다.

### 10-6. 왜 `campaigns`를 만들거나 찾나

체험단 업로드는 캠페인 단위로 묶어야 하기 때문입니다.

즉 업로드하면 단순 파일 저장이 아니라:

- 어느 월
- 어느 캠페인
- 어떤 체험단 행

을 함께 저장합니다.

---

## 11. 필터링 화면(`/filter`)은 어떻게 동작하나

### 11-1. 관련 파일

- `apps/backoffice-v2/app/pages/filter.vue`
- `apps/backoffice-v2/app/composables/useFilterMatching.ts`
- `apps/backoffice-v2/server/api/filter/lock.post.ts`
- `apps/backoffice-v2/server/utils/filter/runMonthlyFilter.ts`

### 11-2. 이 화면이 읽는 테이블

- `purchases`
- `experiences`
- `filter_logs`
- 수동 변경 시 `override_logs`

### 11-3. `loadRawData(month)`가 하는 일

`filter.vue` 안의 `loadRawData(month)`는:

1. `purchases`를 읽음
2. `experiences`를 읽음
3. 둘 다 현재 월 기준으로 메모리에 올림

즉 필터링은 화면에서 DB 두 테이블을 먼저 같이 읽는 구조입니다.

### 11-4. `runFilter()`가 하는 일

이 함수가 핵심 비즈니스 로직입니다.

흐름:

1. 월 잠금 획득
   - `/api/filter/lock`
   - 같은 월을 동시에 두 번 돌리지 않기 위해
2. `loadRawData(month)` 호출
3. 기존 자동 판정 초기화
   - `purchases`에서 `is_fake`, `match_reason`, `matched_exp_id`, `needs_review` 초기화
4. `buildMatchingResult()` 호출
   - 주문과 체험단 매칭
5. 매칭 성공 주문 업데이트
   - `is_fake = true`
   - `matched_exp_id = 체험단 ID`
   - `match_rank`
   - `needs_review`
6. review 대상 주문 업데이트
7. `experiences.unmatch_reason` 갱신
8. `filter_logs` 기록

즉 한 문장으로:

**필터링은 `purchases + experiences`를 다시 비교해서 체험단/실구매/확인필요를 판정하는 작업**입니다.

### 11-5. 왜 `filter_logs`가 필요한가

필터는 반복 실행될 수 있어서,

- 누가
- 언제
- 어떤 월에
- 얼마나 매칭했는지

기록이 필요합니다.

### 11-6. 왜 수동 변경 로그가 필요한가

자동 필터가 100% 정확할 수 없기 때문에,

사람이:

- 체험단 해제
- 체험단 지정

를 했을 때 `override_logs`에 기록을 남깁니다.

---

## 12. 주문 동기화 화면(`/naver-sync`)은 어떻게 동작하나

### 12-1. 관련 파일

- `apps/backoffice-v2/app/pages/naver-sync.vue`
- `apps/backoffice-v2/app/components/NaverSyncPanel.vue`
- `apps/backoffice-v2/server/api/commerce/naver/sync.post.ts`
- `apps/backoffice-v2/scripts/sync-naver-orders.mjs`
- `apps/backoffice-v2/server/utils/commerce/naver-sync.ts`

### 12-2. 페이지 구조

`naver-sync.vue`는 거의 wrapper입니다.

실제 핵심 UI는:

- `NaverSyncPanel.vue`

입니다.

### 12-3. 사용자가 누르는 버튼과 연결 함수

`NaverSyncPanel.vue`에서:

- `드라이런 실행` 버튼
  - `@click="startNaverSync('dry-run')"`
- `동기화 실행` 버튼
  - `@click="startNaverSync('live')"`

즉 두 버튼 모두 같은 함수 `startNaverSync(mode)`를 타고, mode만 다릅니다.

### 12-4. `startNaverSync(mode)`가 하는 일

이 함수는:

1. 시작일/종료일 검증
2. `/api/commerce/naver/sync` 호출
3. 응답 summary를 UI에 표시
4. 성공 시 `refreshMonths()` 호출
5. 최신 동기화 월이 있으면 `selectMonth()`로 그 월로 이동

즉 브라우저는 직접 네이버 API를 호출하지 않고,  
**백오피스 서버 API를 호출**합니다.

### 12-5. 서버 API 엔드포인트는 무엇을 하나

파일:

- `server/api/commerce/naver/sync.post.ts`

역할:

1. 요청값 검증
2. 로그인 사용자 확인
3. 필수 환경변수 확인
4. `sync-naver-orders.mjs`를 자식 프로세스로 실행
5. stdout 마지막 JSON에서 summary 추출
6. live sync면 영향 월 자동 재필터 예약

즉 이 파일은:

**브라우저 요청을 실제 동기화 스크립트 실행으로 연결하는 다리**입니다.

### 12-6. 실제 네이버 API 호출은 어디서 하나

파일:

- `scripts/sync-naver-orders.mjs`

이 파일이 실제로:

1. 네이버 토큰 발급
2. 상태변경 주문 조회
3. 주문 상세조회
4. raw 저장
5. purchases upsert

를 담당합니다.

### 12-7. 동기화 결과는 어느 테이블에 저장되나

1차 저장:

- `commerce_sync_runs`
- `commerce_sync_windows`
- `commerce_order_events_raw`
- `commerce_order_lines_raw`

최종 반영:

- `purchases`

즉 주문 동기화는 “raw 없이 바로 purchases”가 아니라:

**raw → 정규화 → purchases**

구조입니다.

### 12-8. background 재필터는 왜 필요한가

동기화로 주문이 바뀌면:

- 체험단 있는 월은 필터 결과가 stale 될 수 있습니다.

그래서 `sync.post.ts`는:

- 영향 월 계산
- 체험단 있는 월은 백그라운드 필터 재실행
- 체험단 없는 월은 인라인 정리

를 수행합니다.

즉 이 화면은 한 문장으로:

**네이버 주문 원본을 시스템에 가져오고, 필요한 후처리까지 이어주는 운영 화면**입니다.

---

## 13. 자동 재필터는 어디서 도나

### 13-1. 관련 파일

- `apps/backoffice-v2/scripts/run-filter-months.ts`
- `apps/backoffice-v2/server/utils/filter/runMonthlyFilter.ts`

### 13-2. `runMonthlyFilter(month, actor)`의 역할

이 함수는 서버/백그라운드용 월별 필터 실행기입니다.

화면의 `runFilter()`와 거의 같은 일을 하지만,

- UI 없이
- 서버 권한으로
- 백그라운드에서

돌 수 있게 만든 버전입니다.

### 13-3. 이 함수가 하는 일

1. `purchases` 로드
2. `experiences` 로드
3. 체험단 없는 달이면 reset
4. 체험단 있는 달이면 `buildMatchingResult()` 실행
5. `purchases` 업데이트
6. `experiences.unmatch_reason` 업데이트
7. `filter_logs` 기록

즉 자동 재필터는:

**화면 없이 돌아가는 월별 필터링 엔진**입니다.

---

## 14. 코드 흐름을 실제 사용자 행동 기준으로 연결해서 보기

### 14-1. 사용자가 요약 화면을 보는 흐름

1. 사용자가 사이드바에서 `요약` 클릭
2. `NuxtLink to="/dashboard"`
3. `dashboard.vue` 진입
4. `useAnalysisPeriod()`의 `selectedMonth` 확인
5. `loadProductMeta()`로 `products` 읽기
6. `fetchPurchases()`로 `purchases` 읽기
7. `applyDashboardMetrics()`로 KPI/차트 계산
8. 화면 표시

### 14-2. 사용자가 체험단 파일을 업로드하는 흐름

1. 사용자가 사이드바에서 `데이터 업로드` 클릭
2. `/upload`
3. 파일 선택
4. `useExcelParser.ts`가 체험단 파일 파싱
5. `startUpload()` 실행
6. `campaigns` 확인/생성
7. `products`로 상품 연결 시도
8. `experiences` 저장

### 14-3. 사용자가 필터링을 실행하는 흐름

1. 사용자가 사이드바에서 `필터링` 클릭
2. `/filter`
3. `loadRawData(month)`로 `purchases + experiences` 읽기
4. `필터링 시작` 클릭
5. `runFilter()` 실행
6. 기존 자동 판정 초기화
7. `buildMatchingResult()`로 주문/체험단 매칭
8. `purchases` 업데이트
9. `experiences.unmatch_reason` 업데이트
10. `filter_logs` 저장

### 14-4. 사용자가 네이버 주문 동기화를 실행하는 흐름

1. 사용자가 사이드바에서 `주문 동기화` 클릭
2. `/naver-sync`
3. `NaverSyncPanel.vue`에서 날짜 선택
4. `드라이런 실행` 또는 `동기화 실행`
5. `startNaverSync(mode)` 실행
6. `/api/commerce/naver/sync` 호출
7. 서버가 `sync-naver-orders.mjs` 실행
8. 네이버 API 호출
9. `commerce_* raw` 저장
10. `purchases` 반영
11. 필요 시 자동 재필터

---

## 15. 문제 생기면 어디를 보면 되는가

### 15-1. 메뉴가 이상하면

- `app/layouts/default.vue`

### 15-2. 월 선택이 이상하면

- `app/composables/useAnalysisPeriod.ts`

### 15-3. 주문 동기화가 이상하면

- `app/components/NaverSyncPanel.vue`
- `server/api/commerce/naver/sync.post.ts`
- `scripts/sync-naver-orders.mjs`
- `server/utils/commerce/naver-sync.ts`

### 15-4. 체험단 업로드가 이상하면

- `app/pages/upload.vue`
- `app/composables/useExcelParser.ts`

### 15-5. 체험단/실구매 판정이 이상하면

- `app/pages/filter.vue`
- `app/composables/useFilterMatching.ts`
- `server/utils/filter/runMonthlyFilter.ts`

### 15-6. 대시보드 숫자가 이상하면

- `app/pages/dashboard.vue`
- `purchases` 테이블

### 15-7. 고객현황 숫자가 이상하면

- `app/pages/customers.vue`
- `purchases` 테이블

### 15-8. 상품 추이가 이상하면

- `app/pages/product-trends.vue`
- `purchases` 테이블

---

## 16. 이 문서를 읽고 나서 직접 확인하면 좋은 것

다음 순서로 실제 파일을 열어보면 이해가 빨라집니다.

1. `app/layouts/default.vue`
2. `app/composables/useAnalysisPeriod.ts`
3. `docs/sql/backoffice_v2/000_backoffice_v2_base_schema.sql`
4. `docs/sql/backoffice_v2/100_commerce_sync_core.sql`
5. `docs/sql/backoffice_v2/101_commerce_order_raw.sql`
6. `scripts/sync-naver-orders.mjs`
7. `server/utils/commerce/naver-sync.ts`
8. `app/pages/upload.vue`
9. `app/pages/filter.vue`
10. `app/composables/useFilterMatching.ts`
11. `app/pages/dashboard.vue`
12. `app/pages/customers.vue`
13. `app/pages/product-trends.vue`
14. `app/pages/growth-stages.vue`

---

## 17. 최종 요약

이 프로젝트는 크게 아래 흐름으로 이해하면 됩니다.

### 주문 흐름

네이버 API  
→ `commerce_order_events_raw`, `commerce_order_lines_raw`  
→ 내부 상품 매핑  
→ `purchases`

### 체험단 흐름

체험단 엑셀  
→ `campaigns`, `experiences`

### 필터 흐름

`purchases + experiences`  
→ 자동 매칭  
→ `is_fake / matched_exp_id / needs_review / unmatch_reason`

### 분석 화면 흐름

`purchases`  
→ 요약 / 판매분석 / 고객현황 / 재구매 통계

즉 핵심 한 문장은 이것입니다.

**이 백오피스는 `주문 원본을 raw로 받고`, `내부 상품 기준으로 정리한 뒤`, `체험단과 다시 비교해서`, `최종 분석용 주문 테이블(purchases)`을 중심으로 움직이는 구조입니다.**
