# backoffice_v2 SQL 실행 순서

이 디렉터리는 `backoffice_v2` Supabase에 적용할 v2 전용 SQL 초안을 모아둔 곳이다.

기본 원칙:

- `000_backoffice_v2_base_schema.sql`은 `main`의 현재 최종 스키마/RLS를 한 번에 고정한 canonical bootstrap이어야 한다.
- 이 파일은 과거 patch를 순서대로 재생성하는 방식이 아니라, `현재 main`의 실제 상태를 기준으로 새로 추출/정리해야 한다.
- 그 다음 번호부터는 `backoffice_v2`에만 추가되는 커머스 수집 계층이다.

권장 적용 순서:

1. `000_backoffice_v2_base_schema.sql`
2. `100_commerce_sync_core.sql`
3. `101_commerce_order_raw.sql`
4. `102_commerce_product_mappings.sql`
5. `103_extend_purchases_source_columns.sql`
6. `104_automation_jobs.sql`
7. `105_blog_media_storage_bucket.sql`
8. `106_month_count_rpc.sql`

기능별 추가 SQL:

- 알림: `/docs/sql/2026-03-03_notifications_phase15.sql`
- 근태 1차: `/docs/sql/2026-03-05_attendance_phase1.sql`
- 근태 2차: `/docs/sql/2026-03-10_attendance_phase2.sql`
- 근태 조퇴 기준 patch: `/docs/sql/2026-03-10_attendance_onoff_early_leave_patch.sql`
- 근무 세션 patch: `/docs/sql/2026-03-10_attendance_work_sessions_patch.sql`

체크포인트:

- `000` 적용 후 기존 로그인/권한/매출분석 화면이 `main`과 동일하게 동작해야 한다.
- `100`~`105` 적용 후에도 기존 분석 화면은 깨지면 안 된다.
- `purchases.product_id`는 계속 내부 상품 ID를 유지해야 한다.
- 외부 상품번호는 `commerce_product_mappings`에서 관리한다.
- `source_channel`은 `naver` 1차 기준이지만 추후 `coupang`, `kakao` 확장을 전제로 둔다.
