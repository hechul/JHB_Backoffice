# Documentation Map

- 목적: 문서 중복을 줄이고, 어떤 문서를 기준으로 읽고 수정해야 하는지 고정한다.
- 적용 범위: `docs/`, 루트의 기능별 문서 폴더, `apps/backoffice-v2` 복제 문서

---

## 1. 원칙

- 기준 문서는 `root`에 둔다.
- `apps/backoffice-v2/docs/`와 `apps/backoffice-v2/Work_automation/`, `apps/backoffice-v2/Attendance management/`는 `v2 앱 복제 시 따라온 스냅샷`으로 취급한다.
- 구조/운영/DB 기준을 바꾸는 문서는 먼저 `root`에서 수정한다.
- `apps/backoffice-v2` 쪽 문서는 앱 로컬 전용 메모가 아닌 이상 새 기준 문서로 키우지 않는다.

---

## 2. 주제별 기준 문서

### 2-1. 전체 서비스 구조

- 기준: [BACKOFFICE_ENGINEERING_HANDOFF.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/BACKOFFICE_ENGINEERING_HANDOFF.md)
- 역할:
  - 현재 백오피스 전체 구조
  - 핵심 페이지와 데이터 흐름
  - 운영 전제와 환경 변수

### 2-2. v2 커머스 전환 구조

- 기준: [BACKOFFICE_V2_NAVER_COMMERCE_API_DESIGN.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/naver-commerce-api/BACKOFFICE_V2_NAVER_COMMERCE_API_DESIGN.md)
- 세부 상품 매핑 기준: [COMMERCE_PRODUCT_MAPPING_STRATEGY.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/naver-commerce-api/COMMERCE_PRODUCT_MAPPING_STRATEGY.md)
- 역할:
  - `apps/backoffice-v2`의 목표 아키텍처
  - 네이버 API 1차 구조
  - 추후 `쿠팡`, `카카오` 확장 원칙
  - `commerce_*` 테이블과 상품 매핑 설계

### 2-3. DB 현재 컬럼 기준

- 기준: [DB_COLUMNS_REFERENCE.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/DB_COLUMNS_REFERENCE.md)
- 역할:
  - 현재 운영 테이블 컬럼 의미
  - 화면/코드가 기대하는 필드 레벨 기준

### 2-4. DB 설계 배경

- 기준: [DB_DESIGN_PHASE0_1.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/DB_DESIGN_PHASE0_1.md)
- 역할:
  - 초기 설계 배경
  - 왜 지금 구조가 되었는지의 이력
- 비고:
  - 현재 상태의 최종 기준 문서는 아니고, 설계 배경 참고용이다.

### 2-5. v2 DB 적용 순서

- 기준: [README.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/sql/backoffice_v2/README.md)
- 역할:
  - `backoffice_v2`에 적용할 SQL 순서
  - `000` bootstrap과 `100+` 확장 SQL의 경계

### 2-6. 업무자동화

- 기준:
  - [work_automation_implementation_plan.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/Work_automation/work_automation_implementation_plan.md)
  - [work_automation_progress.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/Work_automation/work_automation_progress.md)
- 역할:
  - 구현계획 / 진행로그 분리
- 비고:
  - `apps/backoffice-v2/Work_automation/*`는 복제본이다.

### 2-7. 근태관리

- 기준:
  - [ATTENDANCE_MANAGEMENT_STATUS.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/ATTENDANCE_MANAGEMENT_STATUS.md)
  - [attendance_implementation_plan.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/Attendance%20management/attendance_implementation_plan.md)
- 역할:
  - 운영 상태 / 상세 구현계획 분리
- 비고:
  - `apps/backoffice-v2/Attendance management/*`는 복제본이다.

### 2-8. 변경 이력

- 기준: [GOODFORPET_CHANGELOG.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/GOODFORPET_CHANGELOG.md)
- 역할:
  - 최신 구현 변경 누적 기록
- 비고:
  - 정책/설계 문서를 대신하지 않는다.

---

## 3. 현재 중복이 큰 문서 묶음

아래는 사실상 `root -> apps/backoffice-v2` 복제 관계다.

- [BACKOFFICE_ENGINEERING_HANDOFF.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/BACKOFFICE_ENGINEERING_HANDOFF.md)
  ↔ [BACKOFFICE_ENGINEERING_HANDOFF.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/docs/BACKOFFICE_ENGINEERING_HANDOFF.md)
- [DB_COLUMNS_REFERENCE.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/DB_COLUMNS_REFERENCE.md)
  ↔ [DB_COLUMNS_REFERENCE.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/docs/DB_COLUMNS_REFERENCE.md)
- [DB_DESIGN_PHASE0_1.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/DB_DESIGN_PHASE0_1.md)
  ↔ [DB_DESIGN_PHASE0_1.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/docs/DB_DESIGN_PHASE0_1.md)
- [DEVELOPMENT_PLAN.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/DEVELOPMENT_PLAN.md)
  ↔ [DEVELOPMENT_PLAN.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/docs/DEVELOPMENT_PLAN.md)
- [GOODFORPET_CHANGELOG.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/docs/GOODFORPET_CHANGELOG.md)
  ↔ [GOODFORPET_CHANGELOG.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/docs/GOODFORPET_CHANGELOG.md)
- [work_automation_implementation_plan.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/Work_automation/work_automation_implementation_plan.md)
  ↔ [work_automation_implementation_plan.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/Work_automation/work_automation_implementation_plan.md)
- [work_automation_progress.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/Work_automation/work_automation_progress.md)
  ↔ `apps/backoffice-v2/Work_automation/work_automation_progress.md`
- [attendance_implementation_plan.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/Attendance%20management/attendance_implementation_plan.md)
  ↔ [attendance_implementation_plan.md](/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/apps/backoffice-v2/Attendance%20management/attendance_implementation_plan.md)

정리 원칙은 단순하다.

- root 문서만 유지보수한다.
- `apps/backoffice-v2` 쪽 복제 문서는 참조만 한다.
- 필요하면 나중에 복제 문서를 제거하되, 지금은 혼선 방지용 가이드만 둔다.

---

## 4. 문서별 역할 분리

- `handoff`: 지금 서비스가 어떻게 돌아가는지
- `design`: 앞으로 어떤 구조로 바꿀지
- `columns`: 현재 컬럼 의미가 무엇인지
- `sql`: 실제 적용 순서와 패치
- `implementation_plan`: 기능 계획
- `progress` / `changelog`: 변경 기록

즉 같은 내용을 여러 파일에 반복해서 적지 않는다.

- 구조 설명은 `handoff`
- v2 전환은 `design`
- DB 필드 의미는 `columns`
- 실제 적용은 `sql`
- 기능별 세부 일정은 각 기능 plan
- 변경 내역은 `changelog` 또는 `progress`

---

## 5. 즉시 적용할 운영 규칙

- 새 구조 문서를 만들 때는 먼저 `docs/` 아래에 둔다.
- `apps/backoffice-v2/docs/`에는 새 기준 문서를 만들지 않는다.
- 기존 문서를 수정할 때는 먼저 root 문서를 수정하고, 복제 문서는 필요 시 나중에 동기화한다.
- `v2` 전용 문서는 `docs/naver-commerce-api/` 또는 `docs/sql/backoffice_v2/`에 둔다.

---

## 6. 다음 정리 단계

1. `apps/backoffice-v2/docs/README.md`로 스냅샷 성격 고정
2. `apps/backoffice-v2/Work_automation`, `apps/backoffice-v2/Attendance management`에도 같은 원칙 적용
3. 실제 구현이 더 진행되면 복제 문서 삭제 여부를 검토
4. `v2`가 main을 대체할 시점에 문서 구조를 한 번 더 단순화
