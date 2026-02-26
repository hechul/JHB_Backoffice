# DB 컬럼 사전 — 테이블별 상세 설명

> 기준일: 2026-02-25  
> Supabase 프로젝트: `qvqblzvypwwlmjxetola`  
> 총 7개 테이블 + 2개 View

---

## 1. `profiles` — 사용자 프로필 (2행)

Supabase Auth(`auth.users`)와 1:1 연결. 회원가입 시 트리거로 자동 생성.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | uuid **PK** | ✕ | — | `auth.users.id`와 동일. Supabase 로그인 계정 고유 ID |
| `email` | varchar | ✕ | — | 로그인 이메일 주소 |
| `full_name` | varchar | ✕ | — | 표시 이름. 회원가입 시 `meta.full_name` 또는 이메일 앞부분 자동 설정 |
| `role` | varchar | ✕ | `'viewer'` | 권한 등급. `admin` / `modifier` / `viewer` 중 하나. admin: 전체 기능, modifier: 데이터 작업(계정관리 제외), viewer: 조회 전용 |
| `status` | varchar | ✕ | `'active'` | 계정 상태. `active` / `inactive`. inactive이면 로그인은 되지만 RLS에서 권한 차단됨 |
| `created_at` | timestamptz | ✕ | `now()` | 프로필 생성 시각 |

---

## 2. `products` — 상품 마스터 (24행, 활성 20행)

내부 상품 카탈로그. 업로드 시 주문/체험단 상품을 여기에 매핑. Soft Delete 지원.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `product_id` | varchar **PK** | ✕ | — | 내부 상품 고유 ID. `/products`에서 신규 등록 시 `P-{타임스탬프}{랜덤3자리}` 형식으로 자동 생성. 예: `P-1771831064049` |
| `product_name` | varchar | ✕ | — | 정규화된 상품명. 예: `애착트릿`, `츄라잇`, `엔자이츄`, `두부모래` 등 |
| `option_name` | varchar | ○ | — | 상품 옵션. 예: `북어`, `연어`, `치킨`, `브라이트`, `클린펫`, `컬러: 퍼플` 등. 같은 상품명이라도 옵션이 다르면 별도 행으로 관리 |
| `pet_type` | varchar | ✕ | `'BOTH'` | 대상 반려동물. `DOG` / `CAT` / `BOTH`. `/customers` 펫타입 집계에 사용 |
| `stage` | integer | ○ | — | 성장 단계 (1~4). 1=입문, 2=성장, 3=심화, 4=프리미엄. NULL이면 `기타`로 표시 |
| `product_line` | varchar | ○ | — | 상품 라인 (자유 입력). 예: `간식`, `영양제`, `모래` 등 그룹핑용 |
| `deleted_at` | timestamptz | ○ | — | Soft Delete 시각. NULL이면 활성 상품. 값이 있으면 논리 삭제 상태 |
| `created_at` | timestamptz | ✕ | `now()` | 상품 등록 시각 |

---

## 3. `campaigns` — 캠페인 관리 (6행)

체험단 캠페인 단위 관리. 업로드 시 시트 이름 기반으로 자동 생성됨. Soft Delete 지원.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | serial **PK** | ✕ | 자동증가 | 캠페인 고유 ID |
| `name` | varchar | ✕ | — | 캠페인 이름. 업로드 시 추론. 예: `2026-01 웨이프로젝트` |
| `agency` | varchar | ○ | — | 대행사명 (현재 미사용, 향후 확장용) |
| `start_date` | date | ○ | — | 캠페인 시작일 (현재 미사용) |
| `end_date` | date | ○ | — | 캠페인 종료일 (현재 미사용) |
| `budget` | numeric | ○ | — | 캠페인 예산 (현재 미사용) |
| `created_at` | timestamptz | ✕ | `now()` | 캠페인 생성 시각 |
| `deleted_at` | timestamptz | ○ | — | Soft Delete 시각. NULL이면 활성 |

---

## 4. `purchases` — 주문 데이터 (1,041행) ⭐ 핵심 테이블

스마트스토어 주문 엑셀에서 적재. **필터링 결과**도 이 테이블에 직접 저장됨.

### 4a. 원본 주문 정보 (업로드 시 설정)

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `purchase_id` | varchar **PK** | ✕ | — | 네이버 `상품주문번호` 원본. 예: `2025123138638781`. UPSERT 기준키 |
| `upload_batch_id` | uuid | ✕ | — | 이 행을 적재한 업로드 배치 ID. 같은 업로드에서 들어온 주문은 같은 값. 롤백/재처리 시 기준 |
| `target_month` | varchar(7) | ✕ | — | 분석 대상 월. 형식: `YYYY-MM`. 예: `2026-01`. 업로드 시 선택한 월이 저장됨 |
| `buyer_id` | varchar | ✕ | — | 네이버 `구매자ID`. 예: `kshi***`. 필터링 ID 매칭에 사용 (앞 4글자 비교) |
| `buyer_name` | varchar | ✕ | — | 네이버 `구매자명`. 예: `강건신`. 이름 매칭에 사용 |
| `receiver_name` | varchar | ○ | — | 네이버 `수취인명`. 구매자와 수취인이 다를 수 있어 별도 저장 |
| `customer_key` | varchar | ✕ | — | 고객 식별 키. `{buyer_id}_{buyer_name}` 형식. `/customers` 집계 기준 |
| `product_id` | varchar | ✕ | — | 매핑된 내부 상품 ID (`P-...`). 업로드 시 자동 매핑 또는 수동 매핑으로 설정. `products.product_id` 참조 (논리적 FK) |
| `product_name` | varchar | ✕ | — | 정규화된 상품명. 예: `츄라잇`, `애착트릿`. 업로드 시 정규화 규칙 적용 |
| `option_info` | varchar | ○ | — | 정규화된 옵션 정보. 예: `브라이트`, `북어`, `치킨` |
| `quantity` | integer | ✕ | `1` | 주문 수량. CHECK: > 0 |
| `order_date` | date | ✕ | — | 주문일 (`주문일시` 기준). 체험단 날짜 매칭에 사용 |
| `order_status` | varchar | ✕ | — | 주문 상태. 예: `구매확정`, `배송완료`, `발송완료` |
| `claim_status` | varchar | ○ | — | 클레임 상태. 예: `취소완료`, `반품완료`. 비어있으면 정상 주문 |
| `delivery_type` | varchar | ○ | — | 배송 유형. 예: `일반배송`, `N배송` (현재 미사용) |

### 4b. 필터링 결과 (필터링 실행 시 설정)

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `is_fake` | boolean | ✕ | `false` | **체험단 여부**. `true`=체험단 주문, `false`=실구매 (또는 미분석). 필터링의 최종 판정 결과 |
| `match_reason` | varchar | ○ | — | 매칭 사유. 예: `ID+이름+상품+기간_완전일치`, `ID불일치_매칭`, `다중후보_확인필요` |
| `match_rank` | integer | ○ | — | 매칭 강도 (1~5). 1=완전일치(ID+이름+상품+기간), 2=ID불일치, 3=이름불일치, 4=옵션기반, 5=기간외. 낮을수록 확실 |
| `matched_exp_id` | integer | ○ | — | 매칭된 체험단 행 ID. `experiences.id` 참조 (논리적 FK). 매칭의 **단일 소스 오브 트루스** |
| `needs_review` | boolean | ✕ | `false` | **운영자 확인 필요**. `true`=다중후보 등으로 자동 결정이 어려운 건. `/filter` 확인 필요 탭에 노출 |
| `is_manual` | boolean | ✕ | `false` | **수동 분류 여부**. `true`=운영자가 직접 판정 변경한 건. 필터링 재실행 시에도 초기화하지 않고 보존 |
| `filter_ver` | varchar | ○ | — | 필터링 엔진 버전. 예: `v3.2`. 어떤 버전의 알고리즘으로 판정했는지 추적 |
| `quantity_warning` | boolean | ✕ | `false` | 수량 경고. `true`=주문 수량 2 이상. 체험단은 보통 1개만 구매하므로 이상 징후 플래그 |

### 4c. 시스템 컬럼

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `created_at` | timestamptz | ✕ | `now()` | 행 최초 적재 시각 |
| `updated_at` | timestamptz | ✕ | `now()` | 행 마지막 수정 시각. 트리거로 자동 갱신 |

---

## 5. `experiences` — 체험단 데이터 (775행)

웨이프로젝트 체험단 엑셀에서 적재. 필터링 시 purchases와 매칭해서 체험단 여부 판정.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | serial **PK** | ✕ | 자동증가 | 체험단 행 고유 ID |
| `upload_batch_id` | uuid | ✕ | — | 업로드 배치 ID. 롤백/재처리 기준 |
| `target_month` | varchar(7) | ✕ | — | 분석 대상 월. 예: `2026-01` |
| `campaign_id` | integer **FK** | ✕ | — | 소속 캠페인 ID. `campaigns.id` 참조. 하드 FK |
| `mission_product_name` | varchar | ✕ | — | 정규화된 미션 상품명. 예: `츄라잇`, `애착트릿`. 업로드 시 정규화 규칙 적용 |
| `mapped_product_id` | varchar | ○ | — | 매핑된 내부 상품 ID. `products.product_id` 참조 (논리적 FK). 업로드 시 자동 매핑 |
| `option_info` | varchar | ○ | — | 정규화된 옵션. 예: `브라이트`, `북어` |
| `nickname` | varchar | ○ | — | 체험단 참여자 닉네임 (현재 미사용, 엑셀에 있으면 저장) |
| `receiver_name` | varchar | ✕ | — | 수취인 이름. 필터링 시 `purchases.buyer_name`/`receiver_name`과 비교 |
| `naver_id` | varchar | ✕ | — | 네이버 아이디 (전체). 예: `moonphak`, `ambry11@naver.com`. 필터링 시 `purchases.buyer_id` 앞 4자와 비교. 빈 문자열이면 아이디 없는 체험단 |
| `purchase_date` | date | ✕ | — | 구매 인증일. 필터링 시 `purchases.order_date`와 기간 비교 (±10일 이내) |
| `address` | varchar | ○ | — | 배송 주소 (현재 미사용, 엑셀에 있으면 저장) |
| `phone_last4` | varchar(4) | ○ | — | 연락처 끝 4자리 (현재 미사용). CHECK: 숫자 4자리 |
| `unmatch_reason` | varchar | ○ | — | 미매칭 사유. 필터링 실행 후 매칭 안 된 건에 자동 기록. 예: `ID불일치+이름불일치` |
| `created_at` | timestamptz | ✕ | `now()` | 행 적재 시각 |

---

## 6. `filter_logs` — 필터링 실행 이력 (7행)

필터링 실행 때마다 1행씩 기록. `/logs` 실행 이력 탭에서 조회.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `log_id` | serial **PK** | ✕ | 자동증가 | 이력 고유 ID |
| `executed_at` | timestamptz | ✕ | `now()` | 실행 시각 |
| `executed_by_account_id` | uuid **FK** | ○ | — | 실행한 로그인 계정 ID. `profiles.id` 참조. 공용 계정 환경에서 계정 추적용 |
| `executed_by` | varchar | ✕ | — | 실행 작업자명 (스냅샷). 로그인 계정의 `full_name`. 계정 이름 변경되어도 실행 당시 이름 보존 |
| `filter_ver` | varchar | ✕ | — | 실행한 필터링 엔진 버전. 예: `v3.2` |
| `target_month` | varchar | ○ | — | 분석 대상 월. 예: `2026-01`. `all`이면 전체 월 대상 |
| `status` | varchar | ✕ | — | 실행 결과. `success` / `error` |
| `summary_json` | jsonb | ○ | — | 실행 요약 정보 (JSON). Rank별 건수, 처리 시간, 신규/제거 매칭 수 등 |
| `error_message` | text | ○ | — | 실패 시 에러 메시지 |
| `total_purchases_processed` | integer | ✕ | `0` | 처리된 총 주문 건수 (is_manual 제외) |
| `total_exp_processed` | integer | ✕ | `0` | 처리된 총 체험단 건수 |
| `total_matched` | integer | ✕ | `0` | 매칭된 건수 (is_fake=true 처리) |
| `total_unmatched_exp` | integer | ✕ | `0` | 미매칭 체험단 건수 |

---

## 7. `override_logs` — 수동 분류 변경 이력 (0행)

운영자가 `/filter`에서 판정을 직접 변경할 때마다 1행씩 기록.

| 컬럼 | 타입 | NULL | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `log_id` | serial **PK** | ✕ | 자동증가 | 이력 고유 ID |
| `changed_at` | timestamptz | ✕ | `now()` | 변경 시각 |
| `changed_by_account_id` | uuid **FK** | ○ | — | 변경한 로그인 계정 ID. `profiles.id` 참조 |
| `changed_by` | varchar | ✕ | — | 변경 작업자명 (스냅샷) |
| `purchase_id` | varchar | ✕ | — | 대상 주문 ID. `purchases.purchase_id` 참조 |
| `action` | varchar | ✕ | — | 변경 유형. `fake해제` (체험단→실구매) / `fake지정` (실구매→체험단) |
| `prev_is_fake` | boolean | ✕ | — | 변경 전 is_fake 값 |
| `new_is_fake` | boolean | ✕ | — | 변경 후 is_fake 값 |
| `prev_matched_exp_id` | integer | ○ | — | 변경 전 매칭 체험단 ID |
| `new_matched_exp_id` | integer | ○ | — | 변경 후 매칭 체험단 ID |
| `note` | text | ○ | — | 변경 메모 (운영자 자유 입력) |

---

## 8. View — `customers_summary`

`purchases` 기반 실구매 고객 집계 View. `/customers` 대체용 (현재 코드에서는 직접 purchases를 집계).

| 가상 컬럼 | 원본 | 설명 |
|-----------|------|------|
| `customer_key` | `purchases.customer_key` | 고객 식별 키 |
| `buyer_name` | `purchases.buyer_name` | 고객 이름 |
| `buyer_id` | `purchases.buyer_id` | 구매자 ID |
| `total_orders` | `COUNT(*)` | 총 주문 횟수 |
| `first_order_date` | `MIN(order_date)` | 최초 주문일 |
| `last_order_date` | `MAX(order_date)` | 최근 주문일 |
| `last_order_days` | 계산 | 마지막 주문 후 경과일 |
| `churn_risk` | 계산 | 이탈 위험 (60일 초과 시 true) |

> 조건: `is_fake = false AND needs_review = false`인 주문만 집계

---

## 9. View — `customers_summary_monthly`

`customers_summary`의 월별 분리 버전. `target_month` 기준으로 GROUP BY 추가.

---

## 부록: 컬럼 간 관계 요약

```
purchases.product_id ──(논리)──▶ products.product_id
purchases.matched_exp_id ──(논리)──▶ experiences.id
experiences.campaign_id ──(하드FK)──▶ campaigns.id
experiences.mapped_product_id ──(논리)──▶ products.product_id
profiles.id ──(하드FK)──▶ auth.users.id
filter_logs.executed_by_account_id ──(하드FK)──▶ profiles.id
override_logs.changed_by_account_id ──(하드FK)──▶ profiles.id
```
