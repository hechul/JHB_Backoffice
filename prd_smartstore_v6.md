# [PRD] 백오피스 — 실구매자 분석 및 체험단 필터링 시스템 v6

> 문서 기준일: 2026-02-27
>
> 본 문서는 v5 PRD를 기반으로, **실제 구현 상태 및 운영 경험을 반영하여 갱신한 v6**이다.
> v5 대비 변경된 항목은 `[v6 변경]` 태그로 표기한다.

---

## 변경 이력

| 버전 | 일자 | 변경 내용 |
|------|------|-----------|
| v5 | 2026-02-19 | 초기 PRD 확정 |
| v6 | 2026-02-27 | 실제 구현 반영: 기술 스택 Nuxt 4, customers View 전환, 매칭 랭크 정의 재정렬, 이탈 기준 90일 조정, 비체험단 상품 추가, 업로드 롤백/중복방지/레거시 포맷 지원, filter_jobs·notifications 후속 이관, 대시보드/계정관리 미구현 상태 반영, 후보 스코어링 알고리즘 명세 추가, 월 선택기 안정화(타임아웃/재시도/캐시/stale 가드), 헤더 새로고침 버튼 추가 |

---

## 1. 프로젝트 개요

- **프로젝트명**: JHBioFarm SmartStore Analytics & Filter
- **서비스 위치**: JHBioFarm 백오피스 웹서비스 내 신규 기능 모듈
- **목적**: 스마트스토어 주문 데이터와 체험단 명단을 대조하여 'fake_purchase(체험단)'를 1:1로 정밀 소거하고, 'real_purchase(순수 실구매)'를 식별하여 CRM(재구매/이탈) 분석을 수행한다.

### 1.1 백오피스 내 위치

이 기능은 JHBioFarm 백오피스 웹서비스에 추가되는 첫 번째 데이터 분석 기능이다. 기존 백오피스의 사이드바 메뉴에 다음 메뉴 그룹을 배치한다.

| 메뉴 그룹 | 페이지 | 설명 | 구현 상태 |
|-----------|--------|------|-----------|
| 매출 분석 > 데이터 업로드 | Upload | 주문/체험단 엑셀 업로드 및 전처리 | ✅ 완료 |
| 매출 분석 > 필터링 실행 | Filter | 체험단 필터링 실행 및 결과 확인, 수동 분류 | ✅ 완료 |
| 매출 분석 > 대시보드 | Dashboard | KPI, 분포 차트, 이탈 경고 | ⚠️ Mock |
| 매출 분석 > 고객 분석 | Customers | 고객 목록 조회, 타겟 추출, 엑셀 다운로드 | ✅ 완료 |
| 매출 분석 > 실행 이력 | Logs | 필터링/수동분류 이력 조회 | ✅ 완료 |
| 상품 관리 > 상품 목록 | Products | 상품 마스터 CRUD | ✅ 완료 |
| 설정 > 계정 관리 | Users | 관리자 목록, 초대, 비활성화 | ❌ 미구현 |

> `[v6 변경]` 각 메뉴의 구현 상태 컬럼 추가. 대시보드는 Mock 상태, 계정 관리는 미구현(Supabase Dashboard에서 직접 관리 중).

### 1.2 핵심 가치

1. **정확성**: 1:1 소거법을 통해 재구매 건을 오판하지 않음.
2. **유연성**: 날짜 오차(±1일) 및 이름/ID/옵션 불일치 상황을 단계별(Rank)로 구제.
3. **인사이트**: 구매 상품 기반 펫 타입 자동 분류, 성장 단계 추적, 이탈 예측, 연관 구매 분석.

### 1.3 용어 정의

| 용어 | 의미 | 사용처 |
|------|------|--------|
| **purchase** | 스마트스토어의 전체 주문 (필터링 전) | 테이블명, 코드, UI |
| **real_purchase** | 체험단이 아닌 순수 실구매 건 | 뷰, 코드, UI, 리포트 |
| **fake_purchase** | 체험단으로 판정된 주문 건 | 뷰, 코드, UI, 리포트 |
| **experience** | 체험단 명단 원본 | 테이블명, 코드 |
| **campaign** | 체험단 마케팅 단위 (대행사/기간/예산) | 테이블명, 코드, UI |

### 1.4 시스템 접근 및 보안

- **접근 제어**: 인가된 관리자만 접근 가능한 폐쇄형 백오피스. 별도의 회원가입 페이지를 제공하지 않으며, '초대(Invite)' 또는 '관리자 생성' 방식으로 계정 발급.
- **인증 방식**: Supabase Auth(Email/Password). 로그인 성공 시 발급된 세션 토큰으로 모든 API 요청 검증.
- **세션 유지**: 최대 24시간 유지, 이후 재로그인 필요.

### 1.5 기술 스택

> `[v6 변경]` 기술 스택 섹션 신규 추가. v5에서는 CLAUDE.md에만 기재되어 있었으나, PRD에 명시적으로 포함.

| 항목 | 기술 | 버전 |
|------|------|------|
| 프레임워크 | Nuxt | 4.3.1 |
| UI 프레임워크 | Vue | 3.5.28 |
| 언어 | TypeScript | - |
| 백엔드/인증/DB | Supabase | ap-northeast-2 (Seoul) |
| 아이콘 | lucide-vue-next | 0.563.0 |
| 차트 | chart.js + vue-chartjs | 4.5.1 / 5.3.3 |
| 엑셀 파싱 | SheetJS (xlsx) | 0.18.5 |
| 단위 테스트 | Vitest | 4.0.18 |
| E2E 테스트 | Playwright | 1.58.2 |

> `[v6 변경]` Nuxt 3 → Nuxt 4.3.1로 변경 반영. v5 PRD 및 CLAUDE.md에서 "Nuxt 3"으로 기재되어 있었으나, 실제 package.json은 nuxt@4.3.1이다.

---

## 2. 사용자 시나리오 (User Flow)

### 2.1 메인 워크플로우

1. **인증 (Login)**: 로그인 페이지 접속 → ID/PW 입력 → 인증 성공 시 홈 허브 진입.
2. **접속**: 사이드바 [매출 분석 > 데이터 업로드] 메뉴 진입.
3. **업로드 (Input)**:
   - `주문내역.xlsx` (네이버 스마트스토어 양식)
   - `체험단리스트.xlsx` (대행사/자체 양식)
   - 체험단 업로드 시 `캠페인` 자동 생성 또는 기존 캠페인 연결.
   - **Action**: 드래그 앤 드롭으로 파일 등록.
4. **대기 및 검증 (Pre-check)**:
   - 시스템이 파일 양식(헤더 명칭 기반 필수 컬럼 존재 여부)을 검사.
   - 업로드 결과 요약 표시: "신규 N건 / 상태변경 N건 / 무효화(삭제) N건 / 중복(스킵) N건 / 무효상태 제외 N건".
   - 상품 매핑 실패 건이 있을 경우 수동 매핑 UI 노출.
5. **실행 (Trigger)**: [매출 분석 > 필터링 실행] 페이지에서 **[필터링 시작] 버튼 클릭.**
   - 완료 시 토스트 팝업 노출.
6. **결과 확인 (Output)**:
   - 필터링 결과 요약 (Rank별 매칭 건수 분포 포함).
   - fake_purchase 상세 리스트, 미매칭 체험단 리스트.
   - [고객 분석]에서 real_purchase 기반 필터/검색/다운로드.
7. **액션 (Action)**:
   - [고객 분석]에서 필터 조건 조합으로 타겟 고객 추출.
   - CSV 다운로드.

> `[v6 변경]` 로그인 후 진입 지점을 "대시보드"에서 "홈 허브"로 변경 (실제 구현과 일치). 비동기 job_id/Polling 관련 상세는 §3.2.1에서 후속 구현으로 이관. CSV 다운로드 명시 (현재 구현 상태 반영).

---

## 3. 기능 요구사항 (Functional Requirements)

### 3.1 데이터 업로드 및 전처리

#### 3.1.1 입력 방식

Drag & Drop (다중 파일 업로드 지원). 단일 엑셀 파일 내 2개 시트(주문 + 체험단)도 지원.

> `[v6 변경]` 단일 파일 2시트 통합 업로드 방식 추가 명시.

#### 3.1.2 시트 감지 로직

> `[v6 변경]` 시트 감지 로직 섹션 신규 추가.

엑셀 파일 내 시트를 다음 순서로 자동 감지한다:

1. **시트명 우선 매칭**: 미리 정의된 시트명 별칭(예: "주문", "발주발송관리", "체험단" 등)과 비교.
2. **컬럼 기반 폴백**: 시트명으로 판별 불가 시, 각 시트의 헤더 컬럼 구성으로 주문/체험단 여부 자동 판별.
3. **레거시 포맷 지원**: 체험단 시트가 헤더 없이 시작하는 레거시 양식의 경우, 행 순회를 통해 헤더 행을 자동 탐지.

#### 3.1.3 수집 대상 필드

**스마트스토어 주문 시트 → `purchases` 테이블**:

| # | 필드명 | 용도 |
|---|--------|------|
| 1 | 상품주문번호 | PK |
| 2 | 상품명 | 필터링 조건 |
| 3 | 상품번호 | 상품 식별/카탈로그 연계용 (직접 매칭 키로는 사용하지 않음) |
| 4 | 옵션정보 | 필터링 조건 |
| 5 | 수량 | 매칭 후 수량 경고 판단용 |
| 6 | 구매자명 | 필터링 조건 |
| 7 | 구매자ID | 필터링 조건 (앞 4자리 사용) |
| 8 | 수취인명 | 이름 비교 보조 |
| 9 | 주문일시 | 필터링 조건 |
| 10 | 주문상태 | ETL 단계 유효성 필터용 |
| 11 | 클레임상태 | ETL 단계 유효성 필터용 |
| 12 | 배송속성 | 참고 정보 |

**체험단 시트 → `experiences` 테이블**:

| # | 필드명 | 용도 |
|---|--------|------|
| 1 | 미션상품명 | 상품명 정규화 후 필터링 조건 |
| 2 | 옵션정보 | 필터링 조건 |
| 3 | 닉네임 | 참고 정보 |
| 4 | 수취인 | 이름 비교 |
| 5 | 아이디 | 필터링 조건 |
| 6 | 구매인증일 | 필터링 조건 (날짜 비교) |
| 7 | 주소 | 참고 정보 |
| 8 | 연락처 | 매칭 보조 / 90일 후 파기 대상 |

#### 3.1.4 전처리 로직

- 모든 텍스트의 공백(Trim) 제거.
- 날짜 포맷 `YYYY-MM-DD`로 통일. 지원 형식: `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD`, Date 객체.
- **옵션 정규화**: 구분자(`/`, `,` 등)로 분리 → 가나다순 정렬 → 표준 구분자(` / `)로 결합.
- **고유 식별자(Composite Key) 생성**: `네이버ID(앞4자리)` + `_` + `구매자명`
- **체험단 미션상품명 → 상품 마스터 매핑**:
  - `products` 테이블의 `product_name` 필드와 키워드 기반 매칭 우선.
  - 매핑 성공 시 `experiences.mapped_product_id` 저장.
  - 매핑 실패 시 "상품 매핑 실패" 경고 → 수동 매핑 UI에서 검색 + 새로 등록 액션 제공.
  - 매핑 완료 전 해당 체험단 건은 필터링에서 보류 처리.

> `[v6 변경]` 날짜 파싱 지원 형식 3종 + Date 객체를 명시. 매핑 로직을 "정확 일치 우선 → 부분 문자열"에서 "키워드 기반 매칭"으로 변경 (실제 구현 반영).

#### 3.1.5 주문상태 기반 ETL 필터링 (무효 주문 제외)

업로드되는 스마트스토어 엑셀은 취소/반품 포함 전체 이력이 담긴 스냅샷이다. 취소된 주문이 체험단 매칭을 소비하지 않도록, **데이터 적재(ETL) 단계에서 무효 주문을 사전 제거**한다.

> `[v6 변경]` 화이트리스트 방식에서 **블랙리스트(제외 키워드) 방식으로 변경**. 실제 구현은 특정 키워드를 포함하는 주문상태/클레임상태를 제외하는 방식이다.

**주문상태 제외 키워드**:

| 제외 키워드 | 설명 |
|------------|------|
| 취소완료 | Cancel Complete |
| 반품완료 | Return Complete |
| 환불완료 | Refund Complete |
| 주문취소 | Order Canceled |
| 취소 | Cancel (부분 일치) |
| 반품 | Return (부분 일치) |
| 환불 | Refund (부분 일치) |

**클레임상태 제외 키워드**:

| 제외 키워드 | 설명 |
|------------|------|
| 취소완료 | Cancel Complete |
| 반품완료 | Return Complete |
| 환불완료 | Refund Complete |
| 취소 | Cancel |
| 반품 | Return |
| 환불 | Refund |

> **예외**: `철회` 상태는 유효한 주문으로 처리한다 (제외 대상 아님).

- 제외된 건수는 업로드 결과 요약에 "무효상태 제외 N건"으로 표시한다.

#### 3.1.6 중복 적재 방지 정책

**주문 데이터 (`purchases`)**:

- `purchase_id`(상품주문번호) 기준 UPSERT 처리 (50건 단위 배치).
- 동일 PK가 DB에 존재하면 `order_status`, `claim_status`만 UPDATE하고 나머지는 스킵.
- **상태 변경으로 인한 무효화 처리**: 기존에 유효 상태로 적재된 주문이, 새 업로드에서 무효 상태(취소/반품)로 변경된 경우 해당 행을 DB에서 삭제하고, 연결된 매칭 정보(`matched_exp_id`)를 해제/정리.
- 업로드 결과 요약: "신규 N건 / 상태변경 N건 / 무효화(삭제) N건 / 중복(스킵) N건 / 무효상태 제외 N건".

> `[v6 변경]` 50건 단위 배치 UPSERT 명시.

**체험단 데이터 (`experiences`)**:

- `naver_id` + `mission_product_name` + `purchase_date` 복합 유니크 제약.
- 동일 조합이 존재하면 INSERT 스킵.
- `naver_id`가 없는 경우 별도 Partial Unique Index로 중복 방지.
- 업로드 결과 요약: "신규 N건 / 중복(스킵) N건".

> `[v6 변경]` `naver_id` 없는 경우의 Partial Unique Index 처리 추가 (DB_DESIGN_PHASE0_1.md 반영).

#### 3.1.7 업로드 롤백

> `[v6 변경]` 업로드 롤백 섹션 신규 추가.

- 업로드 중 에러 발생 시, 해당 배치의 모든 변경 사항을 원복한다.
- 부분 실패 시 성공/실패 건수를 명확히 표시하고 복구 안내를 제공한다.

#### 3.1.8 엑셀 컬럼 매핑 유연화

- 고정 인덱스가 아닌 **헤더 명칭(Header Name)** 기반으로 데이터 추출.
- 필수 컬럼 누락 시 "필수 컬럼 [컬럼명]이 누락되었습니다" 에러 메시지 표시. 누락 컬럼 개수뿐 아니라 **컬럼명 목록**도 함께 표시.
- 헤더 명칭 매핑 관리 UI는 후속 버전에서 검토.

> `[v6 변경]` 누락 컬럼명 목록 표시 동작 명시.

### 3.2 필터링 실행 방식 (Trigger Policy)

- **정책**: **Manual Trigger (버튼 실행 방식)**
- **이유**: 대량 데이터의 1:1 매칭으로 DB 상태를 영구 변경(UPDATE)하는 작업이므로, 업로드 후 → 건수 확인 → [필터링 시작] 버튼의 명시적 단계가 필수.
- **월 선택 제한**: `전체 기간(all)` 선택 시 필터링 실행 금지, 특정 월 선택 시만 실행 가능.
- **재실행 정책**: 동일 기간 데이터로 재실행 시, 기존 매칭 결과 중 `is_manual = true`(수동 분류)인 건은 보존하고, 나머지는 초기화 후 재수행. 재실행 전 확인 팝업 필수.
- **동시성 제어**: 후속 구현 예정 (§9 로드맵 참조).

> `[v6 변경]` 월 선택 제한 규칙 추가. 동시성 제어(Lock)를 후속 구현으로 이관 (현재 미구현).

#### 3.2.1 비동기 처리 (Async Processing)

> `[v6 변경]` 현재 구현은 **프론트엔드에서 동기적으로 필터링을 실행**하는 방식이다. `filter_jobs` 테이블 기반의 서버사이드 비동기 처리(job_id 반환 → Polling)는 데이터 볼륨 증가 시 후속 구현한다.

**현재 동작 (v6 기준)**:
- 필터링은 클라이언트 사이드(`useFilterMatching.ts` composable)에서 실행.
- 완료 시 결과를 단일 트랜잭션으로 Supabase DB에 UPDATE.
- `filter_logs`에 실행 결과 기록.

**후속 구현 계획**:
- 월 purchase 5,000건 이상 시 서버사이드 비동기 전환 검토.
- `filter_jobs` 테이블 활성화, Progress Bar + Polling UI 구현.

### 3.3 핵심 필터링 알고리즘 (Core Logic)

아래 순서대로 순차 실행하여 1:1 매칭(소거) 수행. 각 Rank에서 매칭된 purchase와 experience는 즉시 후보 풀에서 제거되어 다음 Rank에서 중복 매칭되지 않는다.

필터링 실행 시 현재 적용되는 필터 정책의 버전(`filter_ver`)이 매칭된 모든 건에 기록된다.

#### Rank 1 (완벽 일치)

- **조건**: `ID(앞4자리)` + `이름(구매자명 또는 수취인명)` + `상품명(키워드)` + `옵션(키워드)` + `날짜(정확히 동일)` 모두 일치
- **조치**: fake_purchase 확정 및 experience 소거.
- **비고**: "완벽일치_매칭"

#### Rank 2 (날짜 오차 허용)

- **조건**: `ID` + `이름` + `상품명(키워드)` + `옵션(키워드)` 일치 **AND** `구매일 ±1일` 차이
- **조치**: fake_purchase 확정.
- **비고**: "날짜오차_매칭"

#### Rank 3 (옵션 불일치 허용)

- **조건**: `ID` + `이름` + `상품명(키워드)` + `날짜(±1일)` 일치 **BUT** `옵션` 불일치
- **조치**: fake_purchase 확정.
- **비고**: "옵션불일치_매칭"

#### Rank 4 (ID 불일치 허용)

- **조건**: `이름` + `상품명(키워드)` + `옵션(키워드)` + `날짜(±1일)` 일치 **BUT** `ID` 불일치
- **조치**: fake_purchase 확정.
- **비고**: "ID불일치_매칭"

#### Rank 5 (이름 불일치 허용 — 가족/타인 구매)

- **조건**: `ID` + `상품명(키워드)` + `옵션(키워드)` + `날짜(±1일)` 일치 **BUT** `이름` 불일치
- **조치**: fake_purchase 확정.
- **비고**: "이름불일치_매칭"

> **이름 비교 규칙**: purchase의 `구매자명` 또는 `수취인명` 중 하나라도 experience의 `수취인`과 일치하면 "이름 일치"로 판정한다.

> **상품명 비교 규칙 (키워드 추출 방식)**: 스마트스토어 상품명과 체험단 미션상품명에서 아래 **핵심 키워드**를 추출하여 비교한다. 전체 문자열 비교가 아닌, 키워드의 일치 여부로 판정한다.
>
> | 키워드 | 비고 |
> |--------|------|
> | 애착트릿 | |
> | 츄라잇 | |
> | 케어푸 | |
> | 두부모래 | |
> | 이즈바이트 | |
> | 엔자이츄 | |
> | 트릿백 | → 정규화 상품명: 미니 트릿백 |
> | 츄르짜개 | → 정규화 상품명: 츄르짜개 (고양이 간식 디스펜서) |
> | 샘플팩 | → 정규화 상품명: 도시락 샘플팩 |
> | 맛보기 | → 정규화 상품명: 전제품 맛보기 샘플 |

> **옵션 비교 규칙 (상품별 키워드 추출 방식)**: 옵션 비교도 전체 문자열이 아닌 상품별로 정의된 핵심 키워드를 추출하여 비교한다.
>
> | 상품 | 스마트스토어 추출 소스 | 키워드 | 비고 |
> |------|----------------------|--------|------|
> | 애착트릿 | **상품명**에서 추출 | 북어, 연어, 치킨 | 스스에서 옵션이 아닌 상품명에 맛이 포함됨 |
> | 츄라잇 | **옵션**에서 추출 | 데일리핏, 클린펫, 브라이트 | |
>
> 예시 (애착트릿): 스스 상품명 `굿포펫 애착트릿 북어 60g` → **북어** 추출 → 체험단 옵션 `북어` 비교 → 일치
> 예시 (츄라잇): 스스 옵션 `맛 선택: 클린펫 1개 (닭가슴살)` → **클린펫** 추출 → 체험단 옵션 `클린펫` 비교 → 일치

> **옵션 별칭 (Alias) 매핑**: 체험단 옵션 문자열에서 아래 별칭이 발견되면 표준 키워드로 치환하여 비교한다.
>
> | 별칭 | 표준 키워드 |
> |------|------------|
> | 닭가슴살 | 치킨 |
> | 닭고기 | 치킨 |
>
> `[v6 변경]` 옵션 별칭 매핑 규칙 신규 추가. 체험단 옵션에 "닭가슴살" 또는 "닭고기"로 기재된 경우를 "치킨"으로 통일.

> **체험단 미지원 상품 예외 처리**: 아래 상품은 현재 체험단에 지원하고 있지 않으므로, 필터링 매칭 대상에서 **제외**하고 실구매자로 취급한다.
>
> | 정규화 상품명 | 키워드 |
> |--------------|--------|
> | 미니 트릿백 | 트릿백 |
> | 츄르짜개 (고양이 간식 디스펜서) | 츄르짜개 |
> | 도시락 샘플팩 | 샘플팩 |
> | 전제품 맛보기 샘플 | 맛보기 |
> | 동결건조 리뉴얼전 상품 | 동결건조리뉴얼전 |
>
> `[v6 변경]` "동결건조리뉴얼전" 키워드 추가 (실제 구현 반영).

#### 3.3.1 후보 스코어링 알고리즘

> `[v6 변경]` 후보 스코어링 섹션 신규 추가. v5에서는 미기재였으나, 실제 구현에서 동점 후보 중 최적 매칭을 선택하기 위해 스코어링 시스템이 적용되어 있다.

하나의 experience에 대해 여러 purchase 후보가 존재할 경우, 아래 스코어링 기준으로 최적 후보를 선택한다.

| 요소 | 점수 | 조건 |
|------|------|------|
| 이름 매칭 타입 | 30 | 구매자명 + 수취인명 모두 일치 |
| | 20 | 수취인명만 일치 |
| | 10 | 구매자명만 일치 |
| | 0 | 이름 불일치 |
| 날짜 근접도 | 6 | 동일 날짜 (diffDays = 0) |
| | 3 | ±1일 (diffDays = 1) |
| | 0 | 그 외 |
| 옵션 보너스 | 2 | 옵션 키워드 일치 |
| | 0 | 옵션 불일치 |
| 키워드 보너스 | 1 | 양쪽 모두 키워드 추출 성공 |
| | 0 | 어느 한쪽 키워드 추출 실패 |

- **최대 점수**: 39점 (30 + 6 + 2 + 1)
- Rank 4/5에서 동점 후보가 존재하면 `needs_review = true` (모호한 매칭) 플래그 부여.

#### 3.3.2 체험단 중복 제거 (Deduplication)

> `[v6 변경]` 체험단 중복 제거 섹션 신규 추가.

동일 체험단원이 동일 상품에 대해 중복 등록된 경우를 사전 필터링한다.

- 중복 기준: `naver_id` + `상품 키워드` + `purchase_date`
- 동일 조합의 experience가 복수 존재하면 1건만 매칭 후보로 사용하고 나머지는 제외.

#### 수량 처리 규칙

- 필터링 시 `수량`은 매칭 조건에 포함하지 않는다.
- 매칭된 purchase의 수량이 2개 이상인 경우, `quantity_warning = true` 플래그를 부여한다.
- MVP에서는 매칭된 건 전체를 fake_purchase 처리하며, 수량 분리 로직은 후속 버전에서 검토한다.

### 3.4 필터링 결과 검증

#### 3.4.1 Rank별 매칭 건수 분포

| Rank | 매칭 유형 | 건수 |
|------|-----------|------|
| 1 | 완벽일치 | - |
| 2 | 날짜오차 | - |
| 3 | 옵션불일치 | - |
| 4 | ID불일치 | - |
| 5 | 이름불일치 | - |
| - | **합계 (fake_purchase)** | - |

- Rank 4~5 비율이 전체 매칭의 20%를 초과하면 "데이터 품질 확인 권장" 경고를 표시한다.

#### 3.4.2 미매칭 체험단 리스트

| 사유 | 설명 |
|------|------|
| 상품매핑실패 | 미션상품명이 products 테이블과 매핑되지 않음 |
| 기간외주문없음 | 해당 인증일 ±1일 범위에 어떤 유효 purchase도 존재하지 않음 |
| 조건불일치 | 유효 purchase는 존재하나 5개 Rank 어디에도 매칭되지 않음 |

> `[v6 변경]` 미매칭 사유 코드를 실제 구현의 camelCase에서 한글 표기로 통일. 사유 우선순위 순서 변경 (상품매핑실패가 가장 먼저 검사됨).

#### 3.4.3 수동 확인 권장 건

- Rank 4~5로 매칭된 건에 "수동 확인 권장" 태그 부여.
- `needs_review = true`인 건(동점 후보 존재)에 추가 검토 표시.
- `quantity_warning = true`인 건에 "수량 확인 필요" 태그 부여.

> `[v6 변경]` `needs_review` 플래그 추가 (모호한 매칭 감지).

### 3.5 수동 분류 (Manual Classification)

수동으로 분류한 건은 `is_manual = true`로 표시되며, 자동 재분석 시 보호된다.

#### 3.5.1 fake_purchase → real_purchase 해제

1. 해당 purchase의 `is_fake`를 `false`로 변경.
2. `is_manual`을 `true`로 설정.
3. **연결된 experience 매칭 해제**: purchase의 `matched_exp_id`를 NULL로 초기화.
4. purchase의 `match_reason`, `match_rank`, `matched_exp_id`를 NULL로 초기화. `filter_ver`는 유지.

#### 3.5.2 real_purchase → fake_purchase 강제 지정

1. **experience 연결 선택 UI**: 미매칭 experience 목록에서 연결할 건을 선택.
2. **experience 연결 시**: 양쪽에 매칭 정보 설정.
3. **experience 불명 시**: `match_reason = "수동지정_체험단원불명"`, `matched_exp_id = NULL`.
4. `is_fake = true`, `is_manual = true`로 설정.

#### 3.5.3 일괄 작업 (Bulk Actions)

> 후속 구현 예정 (§9 로드맵 Phase 3 참조).

- 수동 분류 목록 좌측에 체크박스(Multi-select) 제공.
- **[선택 건 일괄 Real 해제]**, **[선택 건 일괄 Fake 지정]** 버튼.
- 일괄 Fake 지정 시 experience 연결은 "체험단원 불명"으로 처리.
- 일괄 처리 시에도 `override_logs` 개별 생성.

> `[v6 변경]` 일괄 작업을 후속 구현으로 이관 (현재 미구현).

#### 3.5.4 분류 이력 관리

- 모든 수동 분류는 `override_logs` 테이블에 기록한다.
- `is_manual = true`인 건은 다음 자동 재분석 시 덮어쓰지 않는다.
- 커밋형 UX: 상세 패널에서 수정 후 [저장] 시 목록에 반영.

### 3.6 고객 분석 로직 (Analytics)

분석 대상은 real_purchase(`is_fake = false` AND `needs_review = false`)만 해당한다.

> `[v6 변경]` `needs_review = false` 조건 추가 (모호한 매칭 건은 분석에서 제외).

#### 3.6.1 펫 타입 태깅

- `products` 테이블의 `pet_type`(DOG/CAT/BOTH) 매핑을 통해 구매 상품 속성 확인.
- 고객별 DOG/CAT 구매 건수를 집계하여 펫 타입 결정.
- **폴백 체인**: 상품 매핑 기반 → 상품명 키워드 추론 → BOTH (기본값).

> `[v6 변경]` 펫 타입 폴백 체인 추가. `customers` 테이블 대신 쿼리 시점 계산으로 변경 (§4.1 참조).

#### 3.6.2 성장 단계 분석

| 단계 | 이름 | 예시 상품 | 설명 |
|------|------|-----------|------|
| 1 | Entry | 맛보기 트릿, 소용량 간식 | 저렴한 체험형 제품 |
| 2 | Growth | 덴탈껌, 기능성 간식 | 기능성 제품 |
| 3 | Core | 관절 영양제, 유산균 | 핵심 고기능 제품 |
| 4 | Premium | 정기 구독, 대용량 사료 | 고가/정기 구매 |

고객별 구매 상품의 최고 stage를 쿼리 시점에 계산.

#### 3.6.3 이탈 예측 및 방어

- **기본 기준 (고정)**: `오늘 - 마지막 구매일 > 90일` → `churn_risk = true`

> `[v6 변경]` 이탈 기준을 60일에서 **90일**로 상향 조정. 운영 기준 "3개월 미구매 = 이탈 위험"이 실무에 더 적합하다는 판단.

- **개인화 기준 (동적)**: `오늘 - 마지막 구매일 > 평균 재구매 주기 + 15일` → `churn_risk = true` (후속 구현)
- 주문 1건인 고객은 고정 기준(90일)만 적용.

> `[v6 변경]` 동적 기준은 후속 구현으로 이관. 현재는 고정 기준(90일)만 적용 중.

#### 3.6.4 연관 구매 분석

> 후속 구현 예정 (§9 로드맵 v2.0 참조).

동일 고객의 real_purchase 상품 조합 빈도를 집계하여 상위 연관 상품 쌍 도출.

### 3.7 시스템 관리 (System Administration)

#### 3.7.1 계정 관리 (User Management)

- **위치**: [설정 > 계정 관리]
- **현재 상태**: UI 파일 존재하나 "준비중" 상태. 현재는 Supabase Dashboard에서 직접 관리.
- **계획된 기능**:
  - 사용자 목록 조회 (이름, 이메일, 권한, 상태).
  - 이메일 입력을 통한 신규 사용자 초대.
  - 퇴사자 계정 비활성화/삭제.
  - 본인 비밀번호 및 프로필 변경.
- **권한 등급**:
  - `admin`: 모든 기능 접근 + 계정 초대/권한 변경.
  - `modifier`: 데이터 작업 권한 (업로드/필터링/수동분류/상품관리) + 계정 초대/권한 변경 불가.
  - `viewer`: 대시보드/고객분석/이력 조회만 가능. 데이터 변경 불가.

> `[v6 변경]` 미구현 상태 명시.

#### 3.7.2 상품 마스터 관리 (Product Master)

- **위치**: [상품 관리 > 상품 목록]
- **구현 상태**: ✅ 완료
- **기능**:
  - 검색 (상품명, 상품ID, 펫 타입).
  - 등록/수정 (pet_type, stage, product_line, option_name).
  - Soft Delete (`deleted_at` 타임스탬프 기록).
  - 자동 생성 상품 ID (`P-{timestamp}{random}`).
  - 상품명 가나다순 정렬.

> `[v6 변경]` option_name 필드, 자동 ID 생성 규칙, 정렬 방식 추가 명시.

---

## 4. 데이터베이스 설계

> `[v6 변경]` DB 설계를 실제 운영 중인 스키마(`DB_DESIGN_PHASE0_1.md` 기반)로 전면 갱신. `customers`를 테이블에서 View로 변경. `filter_jobs`, `notifications` 후속 이관.

### 4.1 스키마 개요

**운영 테이블 (7개)**:

| 테이블 | 목적 | 행 수 (2026-02 기준) |
|--------|------|---------------------|
| profiles | 사용자 인증/프로필 | 2 |
| products | 상품 마스터 | 24 (활성 20) |
| campaigns | 캠페인 관리 | 6 |
| purchases | 주문 원본 + 필터링 결과 | 1,041 |
| experiences | 체험단 명단 | 775 |
| filter_logs | 필터링 실행 이력 | 7 |
| override_logs | 수동 분류 이력 | 0 |

**DB View (2개)**:

| View | 목적 |
|------|------|
| customers_summary | 고객 요약 (전체 기간) |
| customers_summary_monthly | 고객 요약 (월별) |

> `[v6 변경]` `customers`를 독립 테이블 대신 **View로 구현**. `purchases`와 `products`를 조인하여 실시간 집계. 데이터 중복 방지 및 필터링 결과 변경 시 자동 반영. 성능 이슈 발생 시 Materialized View 또는 테이블로 전환 검토.

#### purchases (전체 주문)

스마트스토어 유효 주문 원본 + 필터링 결과를 저장하는 메인 테이블.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| purchase_id | TEXT (PK) | 상품주문번호 |
| buyer_id | TEXT | 구매자 네이버ID |
| buyer_name | TEXT | 구매자명 |
| receiver_name | TEXT | 수취인명 |
| product_id | TEXT | 스마트스토어 원본 상품번호 |
| product_name | TEXT | 상품명 |
| option_info | TEXT | 옵션정보 (정규화 후 저장) |
| quantity | INTEGER | 수량 |
| order_date | DATE | 주문일시 |
| order_status | TEXT | 주문상태 (유효 상태만 적재) |
| claim_status | TEXT | 클레임상태 |
| delivery_type | TEXT | 배송속성 |
| mapped_product_id | TEXT | 매핑된 내부 상품 ID (products.product_id) |
| is_fake | BOOLEAN | fake_purchase 여부 (default: false) |
| match_reason | TEXT | 판정 사유 |
| match_rank | INTEGER | 매칭 Rank (1~5, NULL이면 미매칭) |
| matched_exp_id | BIGINT | 매칭된 experience ID (논리적 FK) |
| needs_review | BOOLEAN | 모호한 매칭 수동확인 필요 (default: false) |
| is_manual | BOOLEAN | 수동 분류 여부 (default: false) |
| filter_ver | TEXT | 필터링 정책 버전 |
| quantity_warning | BOOLEAN | 수량 경고 (default: false) |
| created_at | TIMESTAMPTZ | 생성일 |
| updated_at | TIMESTAMPTZ | 수정일 (자동 트리거) |

> `[v6 변경]` VARCHAR → TEXT 변경 (Supabase/PostgreSQL 관례). `mapped_product_id`, `needs_review`, `created_at`, `updated_at` 컬럼 추가. `customer_key` 컬럼 제거 (View에서 계산). `matched_exp_id`에 UNIQUE INDEX (1:1 매칭 무결성 보장).

#### experiences (체험단 명단)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT (PK, auto) | 체험단 레코드 ID |
| upload_batch_id | UUID | 업로드 배치 식별자 |
| campaign_id | BIGINT (FK) | 캠페인 ID (campaigns.id, Hard FK) |
| mission_product_name | TEXT | 미션 상품명 |
| mapped_product_id | TEXT | 매핑된 내부 상품 ID |
| option_info | TEXT | 옵션정보 |
| nickname | TEXT | 닉네임 |
| receiver_name | TEXT | 수취인 |
| naver_id | TEXT | 네이버 아이디 |
| purchase_date | DATE | 구매인증일 |
| address | TEXT | 주소 |
| phone_last4 | TEXT | 연락처 뒷자리 |
| unmatch_reason | TEXT | 미매칭 사유 |
| created_at | TIMESTAMPTZ | 생성일 |

**유니크 제약**:
- `UNIQUE (naver_id, mission_product_name, purchase_date) WHERE naver_id IS NOT NULL` (Partial Unique Index)
- `UNIQUE (receiver_name, mission_product_name, purchase_date) WHERE naver_id IS NULL` (Partial Unique Index)

> `[v6 변경]` naver_id가 NULL인 경우의 중복 방지를 위한 Partial Unique Index 추가.

#### campaigns (캠페인 관리)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT (PK, auto) | 캠페인 ID |
| name | TEXT | 캠페인명 |
| agency | TEXT | 대행사명 (선택) |
| start_date | DATE | 시작일 |
| end_date | DATE | 종료일 |
| budget | NUMERIC | 집행 예산 (선택, 원 단위) |
| created_at | TIMESTAMPTZ | 생성일 |
| deleted_at | TIMESTAMPTZ | Soft Delete |

#### products (상품 마스터)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| product_id | TEXT (PK) | 내부 상품 ID (P-{timestamp}{random}) |
| product_name | TEXT | 상품명 |
| option_name | TEXT | 옵션명 |
| pet_type | TEXT | DOG / CAT / BOTH |
| stage | INTEGER | 성장 단계 (1~4) |
| product_line | TEXT | 상품 라인 |
| created_at | TIMESTAMPTZ | 생성일 |
| deleted_at | TIMESTAMPTZ | Soft Delete |

> `[v6 변경]` `option_name` 컬럼 추가 (옵션 수준 관리). `pet_type`은 CHECK 제약 대신 TEXT로 운영 (유연성).

#### profiles (사용자 프로필)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | Supabase Auth User ID (Hard FK → auth.users) |
| email | TEXT | 이메일 |
| full_name | TEXT | 관리자 실명 |
| role | TEXT | 권한: admin / modifier / viewer |
| status | TEXT | 상태: active / inactive |
| created_at | TIMESTAMPTZ | 계정 생성일 |

- `auth.users` INSERT 시 자동 프로필 생성 트리거 설정.

#### filter_logs (필터링 실행 이력)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| log_id | BIGINT (PK, auto) | 로그 ID |
| executed_at | TIMESTAMPTZ | 실행 일시 |
| executed_by_account_id | UUID (FK) | 로그인 계정 ID |
| executed_by | TEXT | 실제 작업자명 스냅샷 |
| filter_ver | TEXT | 적용된 필터 정책 버전 |
| status | TEXT | 결과 (success / error) |
| summary_json | JSONB | 실행 요약 (Rank별 건수, 처리 시간 등) |
| error_message | TEXT | 에러 메시지 (실패 시) |
| total_purchases_processed | INTEGER | 처리된 purchase 건수 |
| total_exp_processed | INTEGER | 처리된 experience 건수 |
| total_matched | INTEGER | 총 매칭 건수 |
| total_unmatched_exp | INTEGER | 미매칭 experience 건수 |

#### override_logs (수동 분류 이력)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| log_id | BIGINT (PK, auto) | 로그 ID |
| changed_at | TIMESTAMPTZ | 변경 일시 |
| changed_by_account_id | UUID (FK) | 로그인 계정 ID |
| changed_by | TEXT | 실제 작업자명 스냅샷 |
| purchase_id | TEXT | 대상 purchase ID |
| action | TEXT | 변경 유형 (fake해제 / fake지정) |
| prev_is_fake | BOOLEAN | 변경 전 값 |
| new_is_fake | BOOLEAN | 변경 후 값 |
| prev_matched_exp_id | BIGINT | 변경 전 experience ID |
| new_matched_exp_id | BIGINT | 변경 후 experience ID |
| note | TEXT | 관리자 메모 |

#### customers_summary (View)

> `[v6 변경]` 테이블 → View로 전환. `purchases`와 `products`를 실시간 조인 집계.

| 컬럼 | 산출 방식 | 설명 |
|------|-----------|------|
| buyer_name | GROUP BY | 구매자명 |
| buyer_id | GROUP BY | 네이버ID |
| total_orders | COUNT | 총 실구매 건수 |
| first_order_date | MIN(order_date) | 최초 구매일 |
| last_order_date | MAX(order_date) | 최근 구매일 |
| last_order_days | now() - MAX(order_date) | 마지막 주문 경과일 |
| churn_risk | last_order_days > 90 | 이탈 위험 여부 |

> `[v6 변경]` v5의 `customers` 테이블에 있던 `pet_tag`, `max_stage`, `total_amount`, `avg_purchase_cycle` 컬럼은 제거됨:
> - `pet_tag`: 프론트엔드에서 쿼리 시 계산 (폴백 체인 적용)
> - `max_stage`: 프론트엔드에서 쿼리 시 계산
> - `total_amount`: 삭제 (purchases에 금액 필드 없음)
> - `avg_purchase_cycle`: 후속 구현 시 View에 추가 예정

### 4.2 후속 구현 테이블

> `[v6 변경]` 후속 구현으로 이관된 테이블을 별도 섹션으로 분리.

#### notifications (알림 센터) — 후속 구현

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT (PK) | 알림 ID |
| user_id | UUID (FK) | 대상 사용자 |
| type | TEXT | 알림 유형 |
| title | TEXT | 알림 제목 |
| message | TEXT | 알림 본문 |
| is_read | BOOLEAN | 읽음 여부 |
| metadata | JSONB | 추가 데이터 |
| created_at | TIMESTAMPTZ | 생성 일시 |

#### filter_jobs (비동기 필터링 작업) — 후속 구현

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | 작업 ID |
| status | TEXT | 상태 (pending/processing/completed/failed) |
| progress | INTEGER | 진행률 (0~100) |
| started_at | TIMESTAMPTZ | 시작 일시 |
| completed_at | TIMESTAMPTZ | 완료 일시 |
| executed_by | UUID (FK) | 실행자 |
| filter_ver | TEXT | 적용 필터 버전 |
| summary_json | JSONB | 결과 요약 |
| error_message | TEXT | 에러 메시지 |

### 4.3 FK 정책

> `[v6 변경]` FK 정책 섹션 신규 추가.

| 관계 | FK 타입 | 이유 |
|------|---------|------|
| profiles.id → auth.users.id | Hard FK | 인증 무결성 필수 |
| experiences.campaign_id → campaigns.id | Hard FK | 캠페인 누락 방지 |
| purchases.matched_exp_id → experiences.id | 논리적 FK | 적재 순서 의존성 제거 |
| purchases.mapped_product_id → products.product_id | 논리적 FK | 적재 순서 의존성 제거 |
| filter_logs.executed_by_account_id → profiles.id | 논리적 FK | 로그 독립성 |
| override_logs.changed_by_account_id → profiles.id | 논리적 FK | 로그 독립성 |

### 4.4 Soft Delete 운영 정책

| 테이블 | Soft Delete | 이유 |
|--------|:-----------:|------|
| products | ✅ | purchases.mapped_product_id가 참조 |
| campaigns | ✅ | experiences.campaign_id가 참조 |
| purchases, experiences | ❌ | 트랜잭션 데이터 — 삭제 자체를 허용하지 않음 |
| filter_logs, override_logs | ❌ | 감사 이력 — 삭제 불가 |

> `[v6 변경]` `customers`를 Soft Delete 대상에서 제거 (View이므로 해당 없음).

### 4.5 RLS 정책

> `[v6 변경]` RLS 구현 방식 명세 추가.

- **헬퍼 함수**: `is_admin()`, `can_modify_data()`를 사용하여 RLS 정책에서 재귀 호출 방지.
- **viewer**: `deleted_at IS NULL`인 행만 SELECT 가능.
- **modifier**: 전체 SELECT + INSERT/UPDATE/DELETE 가능 (계정 관리 제외).
- **admin**: 전체 권한.

### 4.6 filter_ver 운영 규칙

- 필터링 정책 변경 시마다 `filter_ver` 값을 올린다.
- 필터링 실행 시, 매칭된 모든 purchase의 `filter_ver`에 현재 버전 기록.
- `filter_logs`에도 `filter_ver` 기록으로 이력 추적.
- 재분석 시, 이전 버전으로 분류된 건(`is_manual = false`)만 초기화.

### 4.7 트랜잭션 및 데이터 무결성

- **Atomic Transaction**: `purchases.is_fake` 및 `purchases.matched_exp_id` 업데이트는 하나의 트랜잭션으로 묶는다.
- **수동 분류 트랜잭션**: purchase 판정 변경 + `override_logs` 적재를 하나의 트랜잭션으로 묶는다.
- **Rollback**: 에러 발생 시 해당 배치의 모든 변경 사항을 원복하고 `filter_logs`에 기록.
- **수동 분류 보호**: `is_manual = true`인 건은 자동 재실행 시 덮어쓰지 않는다.
- **1:1 매칭 무결성**: `purchases.matched_exp_id`에 UNIQUE INDEX를 설정하여 하나의 experience가 두 개 이상의 purchase에 연결되는 것을 방지.

> `[v6 변경]` 1:1 매칭 UNIQUE INDEX 무결성 규칙 추가.

---

## 5. 개발자 데이터 처리 시나리오

### 5.1 구현 방향성

| 구분 | 추천 방식 | 이유 |
|------|-----------|------|
| 체험단 필터링 | Code (클라이언트) | 1:1 소거법과 5단계 순차 루프, 스코어링 로직은 코드에서 수행 |
| 고객 분석 | DB (View) | customers_summary View에서 집계 |
| 통계/분석 | DB (SQL) | 매출 합계, 펫 타입 비율 등 집계 함수가 효율적 |
| 데이터 적재 | Code (클라이언트) | 엑셀 파싱, 정규화, UPSERT는 코드에서 수행 후 Supabase SDK로 적재 |

> `[v6 변경]` "서버"를 "클라이언트"로 변경. 현재 구현은 클라이언트 사이드(Nuxt composable)에서 필터링 및 데이터 적재를 수행. 고객 분석을 DB View 기반으로 변경.

### 5.2 Phase 1 — 데이터 준비 (Data Preparation)

**ETL 처리 순서**:

1. 엑셀 파싱: 시트 감지 → 헤더 명칭 기반 컬럼 추출 → 필수 컬럼 검증.
2. 전처리: Trim, 날짜 통일, 옵션 정규화.
3. **주문상태 필터링**: 블랙리스트 기반 무효 주문 제외.
4. **배치 UPSERT**: 유효 주문을 50건 단위로 `purchases`에 적재.
5. experience 데이터 적재 (Partial Unique Index에 의한 중복 방지).
6. 캠페인 자동 생성 (체험단 파일명/시트명 기반).
7. 체험단 미션상품명 → 상품 마스터 키워드 매핑.

> `[v6 변경]` 시트 감지, 배치 UPSERT, 캠페인 자동 생성, 키워드 매핑 반영.

**필터링 엔진 입력 데이터**:

1. 미매칭 experience: `mapped_product_id IS NOT NULL`이고 `purchases.matched_exp_id`에 연결되지 않은 건.
2. 검증 대상 purchase: `is_fake = false` AND `is_manual = false`.
3. 상품 매핑 정보: `products` 테이블 전체.

### 5.3 Phase 2 — 필터링 엔진 구동 (Filtering Logic)

클라이언트 코드에서 동기 수행 (`useFilterMatching.ts`).

- **체험단 중복 제거 (Deduplication)**: 동일 naver_id + 상품 키워드 + purchase_date 조합 사전 필터링.
- **Rank 1~5 순차 순회**: 각 Rank에서 매칭 시 양쪽 풀에서 제거. 후보 스코어링으로 최적 매칭 선택.
- **매칭 후 처리**: `filter_ver` 기록, `quantity >= 2` 시 `quantity_warning = true`, Rank 4~5 동점 시 `needs_review = true`, 미매칭 experience에 `unmatch_reason` 자동 분류.
- **최종 반영**: Supabase SDK를 통한 DB UPDATE. `filter_logs`에 실행 결과 기록.

> `[v6 변경]` 비동기 → 동기, 서버 → 클라이언트로 변경. Deduplication, 스코어링, needs_review 반영.

### 5.4 Phase 3 — 고객 분석 및 CRM (Analytics)

필터링 완료 후, real_purchase(`is_fake = false`, `needs_review = false`)만 대상으로 수행.

1. **고객 목록**: `customers_summary` View에서 조회 + 페이지네이션(20건/페이지).
2. **펫 타입**: purchases × products 조인 → 프론트엔드 폴백 체인으로 결정.
3. **이탈 감지**: View의 `last_order_days > 90` 기준.
4. **다운로드**: CSV 포맷으로 필터 조건 적용 결과 내보내기.

> `[v6 변경]` customers 테이블 UPDATE → View 조회 + 프론트엔드 계산 방식으로 전환.

---

## 6. UI/UX 요구사항

### 6.1 전역 / 네비게이션

- **홈 화면**: 진입 허브 (`매출 분석`, `설정` 카드형 네비게이션).
- **사이드바**: 하단 로그아웃 상시 노출. 현재 경로 하이라이트.
- **월 선택기**: `/dashboard`, `/customers`, `/logs`, `/upload`, `/filter`에서 동작. `전체(all)` 선택 시 업로드/필터링 실행 금지.
- **월 선택기 안정화**: 월 목록은 DB(`purchases.target_month`) 기반으로 동적 조회하고, 조회 지연/실패 시 timeout + retry + 캐시 복구 + stale 응답 무시 정책을 적용한다.
- **월 선택기 UI 일관성**: 새로고침/하이드레이션 구간에도 헤더 월 선택기의 시각 상태를 고정해, 로딩 상태에 따른 버튼 톤 변화(비활성처럼 보이는 상태)를 최소화한다.
- **헤더 새로고침 버튼**: 우측 상단에 수동 새로고침(페이지 reload) 버튼을 제공해 간헐적인 상태 꼬임을 즉시 복구할 수 있게 한다.
- **토스트 알림**: 작업 완료/에러 시 우측 상단 팝업 (자동 사라짐).

### 6.2 대시보드 (매출 분석 > 대시보드)

**현재 상태**: ⚠️ Mock 데이터 사용 중. 실데이터 연동 후속 구현.

**계획된 구성**:
- **KPI 카드**: 전체 purchase 수 / real_purchase 수 / fake_purchase 수.
- **추이 차트**: 월별 실구매 추이 (Line Chart).
- **펫 타입 분포**: 원형 차트 (DOG / CAT / BOTH).
- **이탈 경고**: 이탈 위험군 리스트 카드.
- **대시보드 → 고객 분석 딥링크**: KPI 카드 클릭 시 해당 필터가 적용된 고객 분석 페이지로 이동.

### 6.3 데이터 업로드 (매출 분석 > 데이터 업로드)

- **상태머신**: `업로드 전` → `업로드 진행 중` → `업로드 완료` → `매핑 필요` (매핑 실패 시).
- **결과 요약**: 신규/상태변경/무효화/중복/무효상태 제외 건수 표시.
- **매핑 실패 UI**: 남은/완료 진행 표시 + 상품 검색 + 새로 등록 액션.
- **양식 다운로드**: 주문/체험단 각각 템플릿 제공.
- **월 선택 제한**: `전체(all)`에서 업로드 실행 금지.

### 6.4 필터링 실행 (매출 분석 > 필터링 실행)

- **결과 탭**: 전체 / fake_purchase / real_purchase / 미매칭 체험단 / 수동확인 필요.
- **Rank 분포**: 매칭 유형별 건수 시각화.
- **수동 분류**: 개별 건 상세 패널에서 fake↔real 전환 + 저장 (커밋형 UX).
- **엑셀 다운로드**: 필터링 결과 정리 파일 (현재 CSV, 후속 .xlsx 전환 검토).
- **월 선택 제한**: `전체(all)`에서 실행 금지.

### 6.5 고객 분석 (매출 분석 > 고객 분석)

- **필터**: 펫 타입 / 성장 단계 / 이탈 위험 / 구매 횟수(1회/3+/5+/10+).
- **검색**: 구매자명/네이버ID 텍스트 검색 (초성 검색 지원).
- **페이지네이션**: 20건/페이지.
- **CSV 다운로드**: 현재 필터 조건 적용 결과.
- **URL 쿼리 동기화**: `month`, `purchaseType`, `churn`, `purchaseCount` 파라미터로 재진입/공유 일관성 유지.
- **대시보드 딥링크 수신**: 대시보드에서 전달된 query를 초기 필터에 반영.

> `[v6 변경]` 초성 검색, URL 쿼리 동기화, 구매 횟수 필터 명시.

### 6.6 실행 이력 (매출 분석 > 실행 이력)

- **필터링 이력 탭**: filter_logs 기반. 실행 일시, filter_ver, 처리 건수, Rank별 분포.
- **수동 분류 이력 탭**: override_logs 기반. 변경자, 일시, 대상 purchase, 변경 전/후 값.

### 6.7 상품 관리 (상품 관리 > 상품 목록)

- **리스트**: 검색 바 + 데이터 테이블 (상품명 가나다순).
- **상세/수정**: 행 클릭 시 슬라이드 패널. pet_type, stage, product_line, option_name 수정.
- **등록**: [신규 상품 등록] 버튼 → 등록 폼.
- **삭제**: Soft Delete (deleted_at 기록, 목록에서 숨김).

### 6.8 계정 관리 (설정 > 계정 관리)

**현재 상태**: ❌ 미구현 (UI "준비중" 표시).

**계획**: §3.7.1 참조.

---

## 7. 운영 및 예외 처리

### 7.1 신상품 대응

엑셀에 `products` 테이블에 없는 신규 상품명이 등장하면, 상품 매핑 실패 UI에서 수동 매핑 또는 신규 등록. [상품 관리] 페이지에서 `pet_type`, `stage`, `product_line`, `option_name` 지정.

### 7.2 체험단 상품명 매핑 실패

체험단 미션상품명이 키워드 추출로도 매핑되지 않을 경우, "상품 매핑 실패" 경고 + 수동 매핑 UI. 매핑 완료 전 해당 experience는 필터링에서 보류.

### 7.3 캠페인 관리

- 체험단 업로드 시 캠페인 자동 생성 (파일명/시트명 기반).
- 기존 캠페인 선택도 가능.
- `upload_batch_id` 기준 배치 삭제 가능.
- 배치 삭제 시 연결된 purchase의 `is_fake`도 초기화.

> `[v6 변경]` 캠페인 자동 생성 방식 반영.

### 7.4 알 수 없는 주문상태 처리

블랙리스트에 해당하지 않는 주문상태는 유효로 간주하여 적재한다.

> `[v6 변경]` 화이트리스트 방식에서 블랙리스트 방식으로 변경됨에 따라, 미등록 상태는 적재되는 방향으로 변경.

### 7.5 개인정보 관리

체험단 연락처(`phone_last4`), 주소(`address`) 정보는 매칭 완료 후 90일 뒤 자동 파기(NULL 처리). (후속 구현)

### 7.6 에러 처리

- 필터링 중 에러 발생 시 해당 트랜잭션 전체를 롤백.
- 에러 내용을 `filter_logs` 테이블에 기록.
- 토스트 팝업으로 에러 메시지 노출.
- 업로드 중 에러 발생 시 해당 배치 롤백 + 복구 안내.
- 월 선택기 조회 실패 시 직전 캐시 월 목록을 유지하고, "다시 불러오기" 재시도 액션을 제공한다.
- 월 선택기/상태 꼬임 복구를 위해 헤더 수동 새로고침 버튼을 제공한다.

> `[v6 변경]` 업로드 롤백 추가. 알림 센터 연동은 후속 구현.

---

## 8. 비기능 요구사항

### 8.1 동시성 제어

> 후속 구현 예정. 필터링 실행 중 Lock 적용, 동시 실행 차단.

### 8.2 재실행 정책

- 동일 기간 재실행 시 `is_manual = true`인 건은 보존.
- 나머지 자동 판정 건은 초기화 후 재수행.
- 재실행 전 확인 팝업 필수.

### 8.3 데이터 볼륨

- **현재 규모**: purchase 약 1,041건, experience 약 775건 (누적).
- **월간 규모**: purchase 약 572건, experience 약 340건.
- **목표 규모**: 월 purchase 5,000건, experience 1,000건까지 성능 저하 없이 처리.
- **전환 기준**: 월 5,000건 초과 시 서버사이드 비동기 처리 전환 검토.

> `[v6 변경]` 현재 실제 데이터 볼륨 수치 반영.

### 8.4 백업 및 복구

> 후속 구현 예정. 필터링 실행 전 자동 스냅샷 생성 → 1클릭 복구.

### 8.5 인증 및 보안

- Supabase Auth 기반 세션 관리.
- Auth 미들웨어(`auth.global.ts`)로 모든 페이지 접근 검증.
- RLS 헬퍼 함수(`is_admin()`, `can_modify_data()`)로 서버 측 권한 검증.
- `viewer`는 데이터 변경 불가, `modifier`는 계정 관리 불가.

---

## 9. 개발 로드맵

> `[v6 변경]` 실제 구현 진행 상태를 반영하여 로드맵 전면 갱신.

| 단계 | 범위 | 기능 | 상태 |
|------|------|------|------|
| **Phase 0** | 인프라 | 로그인/인증, 상품 마스터 CRUD, RLS, 프로필 자동 생성 | ✅ 완료 |
| **Phase 1** | 핵심 파이프라인 | 데이터 업로드(시트 감지/레거시 지원/배치 UPSERT/롤백/중복 방지), 5-Rank 필터링(키워드 매칭/스코어링/중복 제거/needs_review), 수동 분류(개별), 고객 분석(실데이터/필터/검색/CSV), 실행 이력, 상품 Soft Delete/옵션 관리 | ✅ 완료 |
| **Phase 2** | 대시보드 + 강화 | 대시보드 실데이터 전환(KPI/추이/분포/이탈 경고), 알림 센터(`notifications` 테이블 활성화), 엑셀 다운로드 .xlsx 전환, URL 쿼리 동기화 완성 | 🔜 다음 |
| **Phase 3** | 관리 + 고도화 | 계정 관리(초대/비활성화/권한 변경), 일괄 수동 분류, 동시성 제어(Lock), 비동기 필터링(`filter_jobs` 활성화), 강제 매칭(미매칭 experience → purchase 수동 연결), 동적 이탈 예측(avg_purchase_cycle + 15일) | 📋 계획 |
| **v2.0** | 분석 확장 | 연관 구매 분석, 캠페인별 매칭률/예산 효율 리포트, 성장 단계 심화 분석, 마케팅 자동화 연동 | 📋 계획 |

### Phase 2 완료 기준

1. 대시보드 KPI 카드가 실제 DB 집계 데이터를 표시.
2. 알림 센터가 필터링/업로드 완료 시 알림 적재 및 표시.
3. 필터링 결과 .xlsx 다운로드 동작.

### Phase 3 완료 기준

1. 계정 관리 페이지에서 사용자 초대/비활성화/권한 변경 동작.
2. 일괄 수동 분류 (체크박스 + 상단 액션 바) 동작.
3. 동시 필터링 실행 차단 (Lock) 동작.
4. 월 5,000건 purchase 기준 필터링 성능 10초 이내.

---

## 부록 A. 구현 파일 맵

> `[v6 변경]` 구현 파일 맵 신규 추가. 주요 소스 파일과 PRD 섹션 간의 대응 관계.

| PRD 섹션 | 구현 파일 | 비고 |
|----------|-----------|------|
| §3.1 데이터 업로드 | `app/composables/useExcelParser.ts` (440L) | 시트 감지, 컬럼 검증, 전처리 |
| §3.1 데이터 업로드 | `app/pages/upload.vue` | 업로드 UI, UPSERT, 롤백 |
| §3.3 필터링 알고리즘 | `app/composables/useFilterMatching.ts` (568L) | 5-Rank 매칭, 스코어링, 중복 제거 |
| §3.3 필터링 실행 | `app/pages/filter.vue` | 필터링 UI, 수동 분류 |
| §3.6 고객 분석 | `app/pages/customers.vue` | 필터, 검색, CSV, 딥링크 |
| §3.7.2 상품 관리 | `app/pages/products.vue` | CRUD, Soft Delete |
| §6.6 실행 이력 | `app/pages/logs.vue` | filter_logs, override_logs |
| §1.4 인증 | `app/composables/useCurrentUser.ts` (140L) | Auth, 프로필, 역할 |
| 월 선택기 | `app/composables/useAnalysisPeriod.ts` (336L) | 기간 선택, 데이터 로딩 |
| 한국어 검색 | `app/composables/useTextSearch.ts` (56L) | 초성 검색 |
| 상태 유지 | `app/composables/useMonthlyWorkflow.ts` (206L) | 월별 워크플로우 |
| 토스트 | `app/composables/useToast.ts` (34L) | 알림 팝업 |

---

## 부록 B. v5 → v6 변경 요약

| 항목 | v5 | v6 | 사유 |
|------|----|----|------|
| 기술 스택 | Nuxt 3 | Nuxt 4.3.1 | 실제 package.json 반영 |
| customers | 독립 테이블 | DB View | 데이터 중복 방지, 실시간 집계 |
| total_amount | customers 컬럼 | 삭제 | purchases에 금액 필드 없음 |
| 이탈 기준 | 60일 고정 + 동적 | 90일 고정 (동적은 후속) | 운영 기준 3개월 |
| 비체험단 상품 | 4개 | 5개 (+동결건조리뉴얼전) | 실제 운영 반영 |
| ETL 상태 필터 | 화이트리스트 | 블랙리스트 | 미등록 상태 적재 허용 |
| 필터링 실행 | 서버 비동기 (job_id) | 클라이언트 동기 | 현재 데이터 볼륨에 적합 |
| filter_jobs | 운영 테이블 | 후속 구현 | 데이터 볼륨 미도달 |
| notifications | 운영 테이블 | 후속 구현 | 알림 센터 미구현 |
| 동시성 제어 | MVP 필수 | 후속 구현 | 현재 단일 사용자 운영 |
| 일괄 수동 분류 | MVP 필수 | 후속 구현 | 개별 분류로 운영 중 |
| 옵션 별칭 | 미기재 | 닭가슴살/닭고기→치킨 | 실제 매칭 오류 방지 |
| 후보 스코어링 | 미기재 | 39점 만점 스코어링 | 동점 후보 최적 선택 |
| 체험단 중복 제거 | 미기재 | naver_id+키워드+날짜 | 중복 등록 사전 필터링 |
| needs_review | 미기재 | Rank 4/5 동점 시 true | 모호한 매칭 감지 |
| 업로드 롤백 | 미기재 | 배치 롤백 + 복구 안내 | 부분 실패 대응 |
| 시트 감지 | 미기재 | 시트명→컬럼→레거시 폴백 | 다양한 엑셀 양식 대응 |
| FK 정책 | 미기재 | Hard FK 2개 + 논리적 FK | 적재 순서 독립성 |
| 월 선택기 로딩 처리 | 미기재 | DB 동적 조회 + timeout/retry/cache + stale guard | 무한 로딩/빈 목록 노출 완화 |
| 헤더 수동 새로고침 | 미기재 | Refresh 버튼 제공 | 간헐 상태 꼬임 즉시 복구 |
