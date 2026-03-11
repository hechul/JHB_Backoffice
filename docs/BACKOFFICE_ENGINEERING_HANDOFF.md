# JHBioFarm Backoffice Engineering Handoff

- 문서 목적: 다음 작업자가 이 문서 1개만 읽고 현재 백오피스의 구조, 운영 전제, 핵심 로직, 수정 포인트를 파악한 뒤 기능 수정/추가 개발을 이어갈 수 있도록 정리
- 기준일: 2026-03-09 (Asia/Seoul)
- 우선 기준: 이 문서 > 실제 코드 > 세부 문서(`prd_smartstore_v6.md`, `docs/smartstore_v5_project_status.md`, `docs/DB_DESIGN_PHASE0_1.md`)

---

## 1. 서비스 한 줄 요약

이 서비스는 JHBioFarm 내부 백오피스다. 현재 크게 3개 축으로 운영된다.

1. 매출 분석: 스마트스토어 주문/체험단 업로드 -> 필터링 -> 고객 분석/대시보드/고객 성장 단계/실행 이력
2. 업무 자동화: 아르고 발주 변환, 네이버 블로그 미디어 수집
3. 근태 관리: 승인된 계정의 출퇴근 기록 및 관리자 전체 관리

---

## 2. 현재 기술 구조

### 프론트/웹앱

- 프레임워크: Nuxt 4.3.1
- 렌더링: `ssr: false`
- 배포: Vercel
- 주요 라이브러리:
  - `@nuxtjs/supabase`
  - `xlsx`
  - `chart.js`, `vue-chartjs`
  - `lucide-vue-next`

### 백엔드

- DB/Auth/Storage: Supabase
- 서비스 역할:
  - Auth: 로그인/회원가입/세션
  - Postgres: 핵심 데이터 저장
  - Storage: 블로그 미디어 ZIP 임시 저장
  - RLS: 역할/상태 기반 접근 제어

### 별도 워커

- 블로그 미디어 수집은 Nuxt 서버가 아니라 별도 `crawler/` 서비스가 담당
- 런타임: Node + Playwright + Express
- 배포: Render
- 처리 방식:
  - Vercel API가 `automation_jobs`에 작업 등록
  - Render 워커가 DB polling으로 job 처리
  - ZIP을 Supabase Storage에 저장
  - 프론트는 status API에서 signed URL을 받아 자동 다운로드
  - 다운로드 후 cleanup API로 Storage 객체 및 job 메타를 정리

---

## 3. 필수 환경 변수

### Vercel / Nuxt 앱

- `NUXT_PUBLIC_SUPABASE_URL`
- `NUXT_PUBLIC_SUPABASE_KEY`
- `SUPABASE_SERVICE_KEY`
- `KAKAO_REST_API_KEY`
- `CRAWLER_SERVER_URL`

### Render / crawler

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (환경에 따라)
- 선택값:
  - `BLOG_URL_CONCURRENCY`
  - `BLOG_EXTRACT_RETRY_COUNT`
  - `BLOG_DOWNLOAD_RETRY_COUNT`
  - `BLOG_MAX_ZIP_PART_MB`

주의:
- 로컬 `.env`에는 현재 `SUPABASE_SERVICE_KEY`가 없다. 로컬에서 service-role 검증이나 cleanup 실조회는 바로 안 된다.
- `README.md`는 기본 Nuxt 템플릿 상태라 현재 프로젝트 설명서로 쓰면 안 된다.

---

## 4. 라우트와 역할

### 인증/권한

- 비로그인: `/login`만 접근
- 로그인 + `pending/rejected/inactive`: `/pending-approval` 고정 (현재는 예외 상태 전용 fallback)
- 로그인 + `active`: 일반 서비스 접근 가능

### 역할

- `admin`: 전체 접근, 계정 승인/권한 변경 가능
- `modifier`: 데이터 수정 가능, 계정 초대/권한 변경 불가
- `viewer`: 조회 중심, 수정/실행 불가

현재 회원가입 정책:
- `/login` 회원가입은 서버 API `POST /api/auth/register` 사용
- 신규 가입 기본값은 `modifier + active`
- 관리자 승인 절차 없이 즉시 로그인 가능
- DB 기본값도 `docs/sql/2026-03-09_profiles_auto_approve_modifier_patch.sql` 기준으로 맞추는 것을 전제
- `POST /api/auth/register`는 service-role 키가 있을 때만 동작한다. 우선순위는 `SUPABASE_SERVICE_KEY` -> `SUPABASE_SERVICE_ROLE_KEY` -> service-role 성격의 `SUPABASE_KEY`다. 이 경로는 `auth.admin.createUser()`로 계정을 만들고 `app_metadata/user_metadata`, `profiles.role/status`를 `modifier + active`로 다시 검증/보정한다. public `auth.signUp()` fallback은 사용하지 않는다.

### 핵심 페이지

- `/`: 홈 허브
- `/dashboard`: 대시보드
- `/growth-stages`: 고객 성장 단계 전용 화면
- `/upload`: 데이터 업로드
- `/filter`: 필터링
- `/customers`: 고객 분석
- `/logs`: 실행 이력
- `/products`: 상품 목록
- `/settings/users`: 계정 관리
- `/automation`: 업무 자동화 홈
- `/automation/argo-order`: 아르고 발주 변환
- `/automation/blog-media`: 블로그 미디어 수집
- `/attendance`: 근태관리 홈
- `/attendance/records`: 개인 출퇴근 기록
- `/attendance/admin`: 관리자 근태 관리
- `/attendance/settings`: 근무 기준 설정

---

## 5. 코드 구조에서 먼저 봐야 할 곳

### 공통

- `app/composables/useCurrentUser.ts`: 역할/상태/프로필 로딩
- `app/middleware/auth.global.ts`: 전역 접근 제어
- `server/api/auth/register.post.ts`: 자동 승인 회원가입 생성 API
- `app/layouts/default.vue`
- `app/layouts/home.vue`
- `app/composables/useAnalysisPeriod.ts`: 월 선택기
- `app/composables/useMonthlyWorkflow.ts`: 월별 업로드/필터 상태 복원

주의:
- 탭 복귀 후 네비게이션이 멈추는 문제를 막기 위해 `app/middleware/auth.global.ts`는 라우팅마다 `profiles`를 직접 조회하지 않는다.
- 포커스 복귀/페이지 복원 시 세션 재확인은 `app/composables/useCurrentUser.ts`가 `focus`, `pageshow`, `visibilitychange`에서 비동기로 처리한다.
- 이 부분을 수정할 때 미들웨어에서 프로필 쿼리를 다시 `await`하는 구조로 되돌리면 같은 증상이 재발할 가능성이 높다.

### 매출 분석

- 업로드:
  - `app/pages/upload.vue`
  - `app/composables/useExcelParser.ts`
- 필터링:
  - `app/pages/filter.vue`
  - `app/composables/useFilterMatching.ts`
- 고객 분석:
  - `app/pages/customers.vue`
  - `app/composables/useGrowthStage.ts`
  - `app/composables/usePurchaseQuantity.ts`
  - `구매일(orderDate)` 필터와 상세 `구매 타임라인`을 제공하며, 대시보드의 일자별 판매량 차트에서 drill-down 진입을 받는다
  - 엑셀 다운로드는 고객 요약 1행이 아니라 실구매 `구매 이력 1행` 기준이다. 현재 필터 조건에 맞는 주문행만 대상으로 `구매일`, `상품명`, `옵션`, `상품 개수`가 반복 출력된다
- 실행 이력:
  - `app/pages/logs.vue`
- 대시보드:
  - `app/pages/dashboard.vue`
  - `app/composables/useGrowthStage.ts`
  - `일자별 실구매 판매량` 차트는 `computePurchaseQuantity(purchaseQuantityInput(row))`로 집계하며, 기존 실구매 건수 추이와 별개로 `개수` 기준 차트다
- 고객 성장 단계:
  - `app/pages/growth-stages.vue`
  - `app/composables/useGrowthInsights.ts`
  - 시각화는 `chart.js` 직접 렌더링 방식이며, 상단 분포/전환/행동 3개 차트가 핵심
- 상품 관리:
  - `app/pages/products.vue`

### 업무 자동화

- 아르고 변환:
  - `app/pages/automation/argo-order.vue`
  - `app/composables/useArgoOrderConverter.ts`
  - `server/api/postcode/lookup.post.ts`
- 블로그 미디어:
  - `app/pages/automation/blog-media.vue`
  - `app/composables/useBlogMediaCollector.ts`
  - `server/api/blog/start.post.ts`
  - `server/api/blog/status/[jobId].get.ts`
  - `server/api/blog/cleanup/[jobId].post.ts`
  - `crawler/index.js`
  - `crawler/lib/job-worker.js`
  - `crawler/lib/naver-parser.js`
  - `crawler/lib/zipper.js`
  - `crawler/lib/supabase-uploader.js`

### 근태 관리

- `app/composables/useAttendance.ts`
- `app/pages/attendance/index.vue`
- `app/pages/attendance/records.vue`
- `app/pages/attendance/admin.vue`
- `app/pages/attendance/leave.vue`
- `app/pages/attendance/leave-approvals.vue`
- `app/pages/attendance/weekly.vue`
- `app/pages/attendance/calendar.vue`
- `app/pages/attendance/settings.vue`
- `app/layouts/attendance.vue`

### 테스트

- `tests/unit/useExcelParser.test.ts`
- `tests/unit/useFilterMatching.test.ts`
- `tests/unit/usePurchaseQuantity.test.ts`
- `tests/unit/useArgoOrderConverter.test.ts`
- `tests/unit/filter_accuracy_realfile.test.ts`
- `tests/unit/dec2025_unmatched_analysis.test.ts`
- `tests/e2e/auth-smoke.spec.ts`

---

## 6. DB 핵심 테이블과 역할

현재 실질적으로 중요한 테이블은 아래다.

### 사용자/권한

- `profiles`
  - `id`, `email`, `full_name`, `role`, `status`
  - 앱 권한 판정의 기준

### 상품/체험단/주문

- `products`
  - 상품 마스터
  - `product_id`, `product_name`, `option_name`, `pet_type`, `stage`, `product_line`, `deleted_at`
- `campaigns`
  - 체험단 캠페인 메타
- `purchases`
  - 스마트스토어 주문 원본 + 필터링 결과
  - 핵심 컬럼:
    - `purchase_id`
    - `order_date`
    - `buyer_name`, `buyer_id`, `receiver_name`
    - `product_name`, `option_info`, `quantity`
    - `source_product_name`, `source_option_info`
    - `product_id`
    - `target_month`
    - `is_fake`
    - `needs_review`
    - `matched_exp_id`
    - `match_reason`, `match_rank`
    - `is_manual`
- `experiences`
  - 체험단 원본
  - 핵심 컬럼:
    - `campaign_id`
    - `naver_id`
    - `receiver_name`
    - `mission_product_name`
    - `option_info`
    - `purchase_date`
    - `mapped_product_id`
    - `unmatch_reason`

### 로그/알림/근태

- `filter_logs`
- `override_logs`
- `notifications`
- `attendance_records`
- `attendance_work_sessions`
- `attendance_settings`
- `leave_requests`
- `automation_jobs`
  - 블로그 미디어 수집 작업 큐

### View

- `products_active`
- `campaigns_active`
- `customers_summary`
- `customers_summary_monthly`

주의:
- 현재 Nuxt 앱은 위 View들을 핵심 조회 경로로 적극 사용하지 않는다.
- 실제 화면 로직은 `purchases`, `experiences`, `products` 직접 조회 + 프론트 집계가 많다.

---

## 7. 매출 분석 파이프라인 실제 동작

### 7.1 업로드

- 입력은 통합 엑셀 1개가 기본
- 주문 시트 + 체험단 시트를 자동 탐지
- 파서는 `useExcelParser.ts`가 담당
- 주문은 `purchase_id=상품주문번호` 기준으로 upsert
- 체험단은 중복 제거 후 insert
- 취소/반품 계열은 ETL 단계에서 제외
- 신규 상품/옵션 조합이 `products`에 없으면 업로드 화면에서 바로 매핑/신규 등록

### 7.2 필터링

- `useFilterMatching.ts`가 핵심
- 상품번호 기준 비교는 하지 않음
- 비교 기준은 상품 키워드, 옵션, 날짜, 이름, 아이디
- 결과는 `purchases.is_fake`, `needs_review`, `matched_exp_id` 등에 저장
- 수동 분류는 `override_logs`에 남는다

현재 화면 분류 기준:
- 체험단: `is_fake=true`
- 실구매: `is_fake=false`
- 확인 필요: `needs_review=true`
- 미매칭 체험단: 체험단 원본 중 매칭되지 않은 건

### 7.3 고객 분석

- 실구매만 대상
- 체험단 고객은 여기서 제외
- 대시보드에서 날짜 막대를 누르면 `month + orderDate` 쿼리를 받아 해당 일자 구매 고객만 남긴다
- 주요 계산:
  - 구매횟수: 구매한 날짜 수 기준
  - 구매 상품 수: 상품 개수 합
  - 펫 타입: 구매 상품의 `pet_type` 조합 기준
  - 성장 단계: 상품 목록(`products.stage`)을 날짜순 이벤트로 묶어 점진 승급 규칙 적용
    - 첫 구매는 무조건 `입문`
    - 이후 낮은 Stage 상품을 사도 하락하지 않음
    - 이후 더 높은 Stage 상품을 사면 한 번에 한 단계만 상승
  - 이탈 위험: 최근 주문일 90일 초과

### 7.4 대시보드

- 실데이터 기준 집계
- 인기 상품은 수량 엔진(`usePurchaseQuantity.ts`) 반영
- 수량 계산은 `source_product_name`, `source_option_info`가 있으면 원문 기준으로 우선 계산한다
- 고객 분석과 같은 상품 수량 규칙을 공유한다
- 고객 성장 단계 분포는 고객 분석과 같은 `products.stage` 점진 승급 규칙을 공유한다
- `일자별 실구매 판매량`은 현재 월 선택 기준으로 일자별, 주차 선택 시 해당 주 일별, 전체 기간에서는 월별 판매량으로 렌더링한다
- 일자별 판매량 차트 클릭 시 고객 분석으로 이동해 해당 날짜 고객을 바로 볼 수 있다

---

## 8. 업무 자동화 현재 상태

### 8.1 아르고 발주 변환

현재 구현 상태:
- 다중 파일 업로드 가능
- 파일별이 아니라 사람별 행 단위로 상품명/수량 입력
- 디너의여왕/리뷰노트/일반양식 파싱 지원
- 우편번호는 파일 내 추출 우선, 없으면 카카오 API 보완
- 결과는 아르고 양식 엑셀로 다운로드

주의:
- 상품코드 매핑 기준은 `useArgoOrderConverter.ts` 내부 상수
- 우편번호 자동조회 실패 행은 미해결로 남는다

### 8.2 블로그 미디어 수집

현재 실제 구조:

1. 사용자가 여러 URL 입력
2. 프론트는 URL 1개씩 순차 처리
3. URL 1개당 `automation_jobs` job 1개 생성
4. Render 워커가 Playwright로 원본 고화질 이미지/동영상 추출
5. ZIP 1개 생성 후 Supabase Storage 저장
6. status API가 signed URL 반환
7. 브라우저가 자동 다운로드
8. 다운로드 성공 후 cleanup API 호출
9. 다음 URL 처리

현재 품질 정책:
- 원본 고화질 우선
- 이미지 기본 `type=w2000`
- 404 시 `w1600 -> w1080 -> w800`까지만 fallback
- 저화질/no-type 강등은 제거

운영 메모:
- 스토리지 cleanup 메타데이터는 즉시 반영됨
- 다만 signed URL이 외부에서 수십 초 정도 더 살아 보일 수 있다
- 즉, 삭제는 되고 있지만 signed URL 즉시 차단은 보장하지 않는다

---

## 9. 근태 관리 현재 상태

- 회원가입 가능
- 신규 가입 기본 상태는 승인 대기 흐름을 전제로 설계됨
- 승인된 계정만 일반 서비스 접근 가능
- 개인:
  - 출퇴근 기록
  - 휴가/반차 신청
  - 주별 근태 기록(본인)
  - 월별 근태 캘린더(본인)
  - 승인된 부재 반영 상태 자동 판정
- 관리자:
  - 금일 근태 이력
  - 휴가 승인
  - 주별 근태 기록(전체)
  - 월별 근태 캘린더(전체)
  - 근무 기준 설정

주의:
- 승인/이메일 인증 관련 흐름은 Supabase 설정과 SQL 패치 상태에 따라 동작이 달라질 수 있다
- Phase 2 SQL이 없으면 휴가/설정 기능은 경고를 띄우고 fallback 상태로만 동작한다
- 관련 SQL은 반드시 적용 여부를 확인해야 한다

---

## 10. SQL 패치 파일

Supabase는 수동 SQL 반영 이력이 있어, 새 작업자는 아래 파일의 적용 여부를 먼저 확인해야 한다.

- `docs/sql/2026-02-23_phase1_modifier_and_actor_log_patch.sql`
- `docs/sql/2026-02-23_products_delete_rls_hotfix.sql`
- `docs/sql/2026-02-23_products_option_name_patch.sql`
- `docs/sql/2026-02-23_profiles_role_check_and_fix.sql`
- `docs/sql/2026-02-23_profiles_role_seed_hotfix.sql`
- `docs/sql/2026-02-24_experiences_unique_empty_naver_patch.sql`
- `docs/sql/2026-03-03_month_count_rpc.sql`
- `docs/sql/2026-03-03_notifications_phase15.sql`
- `docs/sql/2026-03-05_attendance_phase1.sql`
- `docs/sql/2026-03-10_attendance_phase2.sql`
- `docs/sql/2026-03-10_attendance_work_sessions_patch.sql`
- `docs/sql/2026-03-10_attendance_onoff_early_leave_patch.sql`
- `docs/sql/2026-03-05_auth_confirm_on_approval.sql`
- `docs/sql/2026-03-05_profiles_signup_approval_patch.sql`
- `docs/sql/2026-03-09_purchases_source_fields_patch.sql`

실무적으로는:
- 코드만 최신이어도 DB SQL이 빠져 있으면 일부 화면은 정상처럼 보여도 실제 저장/권한이 어긋난다.
- 새 환경에 배포할 때는 문서보다 Supabase 현재 스키마와 위 SQL 적용 이력을 먼저 점검하는 것이 맞다.

---

## 11. 자주 수정하게 되는 포인트

### 상품/옵션/필터링 룰 수정

- `app/composables/useExcelParser.ts`
- `app/composables/useFilterMatching.ts`
- `app/composables/usePurchaseQuantity.ts`
- `app/pages/upload.vue`
- `app/pages/filter.vue`

### 권한/승인/상태 수정

- `app/composables/useCurrentUser.ts`
- `app/middleware/auth.global.ts`
- `app/pages/login.vue`
- `app/pages/pending-approval.vue`
- `app/pages/settings/users.vue`
- `docs/sql/2026-03-05_profiles_signup_approval_patch.sql`
- `docs/sql/2026-03-05_auth_confirm_on_approval.sql`

### 월 선택/복원/새로고침 문제

- `app/composables/useAnalysisPeriod.ts`
- `app/composables/useMonthlyWorkflow.ts`
- `app/layouts/default.vue`

### 블로그 수집 문제

- 수집 품질/추출: `crawler/lib/naver-parser.js`
- ZIP 파일 문제: `crawler/lib/zipper.js`
- 작업 순서/용량 분할: `crawler/lib/job-worker.js`
- 다운로드/정리: `app/composables/useBlogMediaCollector.ts`, `server/api/blog/status/[jobId].get.ts`, `server/api/blog/cleanup/[jobId].post.ts`

---

## 12. 실행/검증 명령어

- 개발 서버: `npm run dev`
- 프로덕션 빌드: `npm run build`
- 단위 테스트: `npm run test:unit`
- E2E 테스트: `npm run test:e2e`
- 전체 테스트: `npm run test:all`

실무적으로 최소 검증은 아래 순서다.

1. `npm run build`
2. 수정한 모듈 관련 unit test 실행
3. Supabase 실데이터를 쓰는 화면이면 직접 월 선택/업로드/저장 플로우 확인

---

## 13. 현재 알려진 주의점

- `README.md`는 프로젝트 현황 문서가 아니다
- 일부 예전 문서는 구현 시점 기준이라 현재 코드와 어긋나는 부분이 있다
- 블로그 미디어 signed URL은 cleanup 이후에도 아주 짧게 살아 보일 수 있다
- `crawler/`는 Nuxt와 별개 배포 단위다. Nuxt만 배포해도 블로그 수집 로직은 안 바뀐다
- 로컬 `.env`에 service key가 없으면 server-side storage 정리나 service-role 검증을 직접 재현하기 어렵다
- Nuxt 앱은 `ssr: false`다. 새로고침/세션 문제를 건드릴 때 SSR을 다시 켜면 기존 이슈가 재발할 가능성이 높다
- 기존 월 데이터는 `source_product_name`/`source_option_info`가 없으면 상품 수량 복원이 불완전할 수 있다. SQL 적용 후 해당 월 재업로드가 필요할 수 있다

---

## 14. 다음 작업자가 시작할 때 체크리스트

1. `git pull` 후 현재 브랜치와 배포 반영 상태를 맞춘다
2. Vercel 환경 변수와 Render 환경 변수를 확인한다
3. Supabase에서 위 SQL 패치 적용 상태를 확인한다
4. `npm run build`를 먼저 통과시킨다
5. 수정하려는 모듈의 실제 진입 파일을 위 11장 기준으로 연다
6. 화면 문제가 DB/권한/월 복원/워커 중 어디 문제인지 먼저 분리한다

---

## 15. 참고 문서

이 문서만으로 대부분 작업 가능하지만, 세부 배경이 더 필요하면 아래 순서로 읽으면 된다.

1. `prd_smartstore_v6.md`
2. `docs/smartstore_v5_project_status.md`
3. `docs/DB_DESIGN_PHASE0_1.md`
4. `Work_automation/work_automation_progress.md`
5. `Attendance management/attendance_implementation_plan.md`
