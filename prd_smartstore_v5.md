# [PRD] 백오피스 — 실구매자 분석 및 체험단 필터링 시스템 v5

> 문서 기준일: 2026-02-19
>  
> 본 문서는 **실구현(개발) 기준**으로 유지/갱신한다.  
> 최근 반영된 UI/UX 변경사항은 하위 섹션(예: 6.6 추가 업데이트)으로 누적 기록한다.

## 1. 프로젝트 개요

- **프로젝트명**: JHBioFarm SmartStore Analytics & Filter
- **서비스 위치**: JHBioFarm 백오피스 웹서비스 내 신규 기능 모듈
- **목적**: 스마트스토어 주문 데이터와 체험단 명단을 대조하여 'fake_purchase(체험단)'를 1:1로 정밀 소거하고, 'real_purchase(순수 실구매)'를 식별하여 CRM(재구매/이탈) 분석을 수행한다.

### 1.1 백오피스 내 위치

이 기능은 JHBioFarm 백오피스 웹서비스에 추가되는 첫 번째 데이터 분석 기능이다. 기존 백오피스의 사이드바 메뉴에 다음 메뉴 그룹을 배치한다.

| 메뉴 그룹 | 페이지 | 설명 |
|-----------|--------|------|
| 매출 분석 > 데이터 업로드 | Upload | 주문/체험단 엑셀 업로드 및 전처리 |
| 매출 분석 > 필터링 실행 | Filter | 체험단 필터링 실행 및 결과 확인, 수동 분류 |
| 매출 분석 > 대시보드 | Dashboard | KPI, 분포 차트, 이탈 경고, 알림 센터 |
| 매출 분석 > 고객 분석 | Customers | 고객 목록 조회, 타겟 추출, 엑셀 다운로드 |
| 매출 분석 > 실행 이력 | Logs | 필터링/수동분류 이력 조회 |
| 상품 관리 > 상품 목록 | Products | 상품 마스터 CRUD, 일괄 업로드 |
| 설정 > 계정 관리 | Users | 관리자 목록, 초대, 비활성화 |

### 1.2 핵심 가치

1. **정확성**: 1:1 소거법을 통해 재구매 건을 오판하지 않음.
2. **유연성**: 날짜 오차(±1일) 및 이름/ID/옵션 불일치 상황을 단계별(Rank)로 구제.
3. **인사이트**: 구매 상품 기반 펫 타입 자동 분류, 성장 단계 추적, 이탈 예측, 연관 구매 분석.

### 1.3 용어 정의

시스템 전반에서 다음 용어를 통일하여 사용한다.

| 용어 | 의미 | 사용처 |
|------|------|--------|
| **purchase** | 스마트스토어의 전체 주문 (필터링 전) | 테이블명, 코드, UI |
| **real_purchase** | 체험단이 아닌 순수 실구매 건 | 뷰, 코드, UI, 리포트 |
| **fake_purchase** | 체험단으로 판정된 주문 건 | 뷰, 코드, UI, 리포트 |
| **experience** | 체험단 명단 원본 | 테이블명, 코드 |
| **campaign** | 체험단 마케팅 단위 (대행사/기간/예산) | 테이블명, 코드, UI |

### 1.4 시스템 접근 및 보안 (System Access)

- **접근 제어**: 본 시스템은 인가된 관리자만 접근 가능한 폐쇄형 백오피스이다. 별도의 회원가입 페이지를 제공하지 않으며, '초대(Invite)' 또는 '관리자 생성' 방식을 통해 계정을 발급한다.
- **인증 방식**: Supabase Auth(Email/Password)를 사용하며, 로그인 성공 시 발급된 세션 토큰을 통해 모든 API 요청을 검증한다.
- **세션 유지**: 보안을 위해 로그인 세션은 최대 24시간 유지되며, 이후 재로그인이 필요하다.

---

## 2. 사용자 시나리오 (User Flow)

### 2.1 메인 워크플로우

1. **인증 (Login)**: 로그인 페이지 접속 → ID/PW 입력 → 인증 성공 시 대시보드 진입.
2. **접속**: 사이드바 [매출 분석 > 데이터 업로드] 메뉴 진입.
3. **업로드 (Input)**:
   - `주문내역.xlsx` (네이버 스마트스토어 양식)
   - `체험단리스트.xlsx` (대행사/자체 양식)
   - 체험단 업로드 시 `캠페인` 선택 (기존 캠페인 또는 신규 생성).
   - **Action**: 드래그 앤 드롭으로 파일 등록.
4. **대기 및 검증 (Pre-check)**:
   - 시스템이 파일 양식(헤더 명칭 기반 필수 컬럼 존재 여부)을 검사.
   - 업로드 결과 요약 표시: "신규 N건 / 상태변경 N건 / 무효화(삭제) N건 / 중복(스킵) N건 / 무효상태 제외 N건".
   - 상품 매핑 실패 건이 있을 경우 수동 매핑 UI 노출.
5. **실행 (Trigger)**: [매출 분석 > 필터링 실행] 페이지에서 **[필터링 시작] 버튼 클릭.**
   - 서버가 즉시 `job_id`를 반환하고, 화면에 진행률 표시.
   - 완료 시 알림 센터에 결과 메시지 적재 + 토스트 팝업 노출.
6. **결과 확인 (Output)**:
   - 필터링 결과 요약 (Rank별 매칭 건수 분포 포함).
   - fake_purchase 상세 리스트, 미매칭 체험단 리스트.
   - [대시보드]에서 real_purchase 기반 KPI, 펫 타입 분포, 이탈 위험 고객 확인.
7. **액션 (Action)**:
   - [고객 분석]에서 필터 조건 조합으로 타겟 고객 추출.
   - [마케팅용 엑셀 다운로드] 또는 [분석용 엑셀 다운로드].

---

## 3. 기능 요구사항 (Functional Requirements)

### 3.1 데이터 업로드 및 전처리

#### 3.1.1 입력 방식

Drag & Drop (다중 파일 업로드 지원).

#### 3.1.2 수집 대상 필드

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

#### 3.1.3 전처리 로직

- 모든 텍스트의 공백(Trim) 제거.
- 날짜 포맷 `YYYY-MM-DD`로 통일.
- **옵션 정규화 (Option Normalization)**:
  - 동일 옵션이 표기 순서나 구분자 차이로 매칭에 실패하는 것을 방지한다.
  - `옵션정보` 문자열을 구분자(`/`, `,` 등)로 분리하고, 각 요소를 가나다순으로 정렬한 뒤 표준 구분자(` / `)로 다시 결합하여 저장한다.
  - 예시: "L / Red"와 "Red / L"을 모두 "L / Red"로 변환.
  - 이 정규화는 `purchases`와 `experiences` 양쪽 모두에 적용한다.
- **고유 식별자(Composite Key) 생성**:
  - 생성 규칙: `네이버ID(앞4자리)` + `_` + `구매자명`
  - 목적: 동명이인 및 마스킹 ID 중복 방지.
- **체험단 미션상품명 → 상품 마스터 매핑**:
  - `products` 테이블의 `product_name` 필드와 정확 일치 매칭 우선.
  - 정확 일치 실패 시, 부분 문자열 일치(LIKE) 시도.
  - 매핑 성공 시 `experiences.mapped_product_id`(내부 상품 ID, `products.product_id`) 저장.
  - 매핑 실패 시 "상품 매핑 실패" 경고 표시 → 관리자가 수동으로 매핑 지정.
  - 매핑 완료 전 해당 체험단 건은 필터링에서 보류 처리.

#### 3.1.4 주문상태 기반 ETL 필터링 (무효 주문 제외)

업로드되는 스마트스토어 엑셀은 취소/반품 포함 전체 이력이 담긴 스냅샷이다. 취소된 주문이 체험단 매칭을 소비하지 않도록, **데이터 적재(ETL) 단계에서 무효 주문을 사전 제거**한다.

**제외 대상 (Drop)**:

| 주문상태 | 설명 |
|----------|------|
| 취소요청 | Cancel Request |
| 취소완료 | Cancel Complete |
| 반품요청 | Return Request |
| 반품완료 | Return Complete |
| 직권취소 | Ex officio Cancel |

**적재 대상 (Load)**:

| 주문상태 | 설명 |
|----------|------|
| 결제완료 | Payment Complete |
| 배송준비 | Preparing Shipment |
| 배송중 | In Transit |
| 배송완료 | Delivered |
| 구매확정 | Purchase Confirmed |
| 교환요청 | Exchange Request |
| 교환완료 | Exchange Complete |

- 화이트리스트에 없는 상태값이 등장할 경우, "알 수 없는 주문상태 N건" 경고를 표시하고 해당 건은 적재하지 않는다.
- 제외된 건수는 업로드 결과 요약에 "무효상태 제외 N건"으로 표시한다.

#### 3.1.5 중복 적재 방지 정책

**주문 데이터 (`purchases`)**:

- `purchase_id`(상품주문번호) 기준 UPSERT 처리.
- 동일 PK가 DB에 존재하면 `order_status`, `claim_status`만 UPDATE하고 나머지는 스킵.
- **상태 변경으로 인한 무효화 처리**: 기존에 유효 상태로 적재된 주문이, 새 업로드에서 무효 상태(취소/반품)로 변경된 경우 해당 행을 DB에서 삭제한다. 이때 연결된 매칭 정보는 `purchases.matched_exp_id` 기준으로 해제/정리한다.
- 업로드 결과 요약: "신규 N건 / 상태변경 N건 / 무효화(삭제) N건 / 중복(스킵) N건 / 무효상태 제외 N건".

**체험단 데이터 (`experiences`)**:

- `naver_id` + `mission_product_name` + `purchase_date` 복합 유니크 제약.
- 동일 조합이 존재하면 INSERT 스킵.
- 업로드 결과 요약: "신규 N건 / 중복(스킵) N건".

#### 3.1.6 엑셀 컬럼 매핑 유연화 (Dynamic Column Mapping)

- 스마트스토어 엑셀 양식 변경 시 시스템 중단을 방지한다.
- 엑셀 파싱 시 고정 인덱스(예: A열, B열)가 아닌 **헤더 명칭(Header Name)** 기반으로 데이터를 추출한다.
- 필수 컬럼(상품주문번호, 구매자명 등)이 엑셀에 없을 경우, "필수 컬럼 [컬럼명]이 누락되었습니다"라는 명확한 에러 메시지를 표시한다.
- 헤더 명칭이 기존과 다를 경우를 대비하여, 시스템 설정에서 엑셀 컬럼명 ↔ DB 컬럼명 매핑을 관리할 수 있도록 한다 (후속 버전).

### 3.2 필터링 실행 방식 (Trigger Policy)

- **정책**: **Manual Trigger (버튼 실행 방식)**
- **이유**: 대량 데이터의 1:1 매칭으로 DB 상태를 영구 변경(UPDATE)하는 작업이므로, 업로드 후 → 건수 확인 → [필터링 시작] 버튼의 명시적 단계가 필수.
- **재실행 정책**: 동일 기간 데이터로 재실행 시, 기존 매칭 결과 중 `is_manual = true`(수동 분류)인 건은 보존하고, 나머지는 초기화 후 재수행. 재실행 전 확인 팝업: "기존 자동 판정 결과 N건이 초기화됩니다. 수동 분류 M건은 유지됩니다."
- **동시성 제어**: 필터링 실행 중에는 다른 관리자의 실행 요청을 차단(Lock). "현재 다른 관리자가 분석을 진행 중입니다" 메시지 표시. Lock은 트랜잭션 완료 또는 타임아웃(10분) 시 자동 해제.

#### 3.2.1 비동기 처리 및 진행 상태 (Async & Polling)

- 대량 데이터(5,000건 이상) 필터링 시 Serverless Function 타임아웃 발생 가능성을 방지한다.
- **[필터링 시작]** 버튼 클릭 시, 서버는 즉시 `job_id`를 반환하고 로직은 백그라운드에서 수행한다.
- 프론트엔드는 처리가 완료될 때까지 2초 간격으로 상태(`processing` / `completed` / `failed`)를 조회(Polling)한다.
- 화면에는 "분석 중입니다... (35%)"와 같은 진행률(Progress Bar)을 표시한다.
- 완료 시 알림 센터에 결과 메시지를 적재하고, 토스트 팝업을 노출한다.
- 실패 시 에러 메시지와 함께 롤백 완료 상태를 표시한다.

### 3.3 핵심 필터링 알고리즘 (Core Logic)

아래 순서대로 순차 실행하여 1:1 매칭(소거) 수행. 각 Rank에서 매칭된 purchase와 experience는 즉시 후보 풀에서 제거되어 다음 Rank에서 중복 매칭되지 않는다.

필터링 실행 시 현재 적용되는 필터 정책의 버전(`filter_ver`)이 매칭된 모든 건에 기록된다.

#### Rank 1 (완벽 일치)

- **조건**: `ID(앞4자리)` + `이름(구매자명 또는 수취인명)` + `상품명(정규화)` + `옵션(정규화 후)` + `날짜(정확)` 모두 일치
- **조치**: fake_purchase 확정 및 experience 소거.
- **비고**: "완벽일치_매칭"

#### Rank 2 (날짜 오차 허용)

- **조건**: `ID` + `이름` + `상품명(정규화)` + `옵션(정규화 후)` 일치 **AND** `구매일 ±1일` 차이
- **조치**: fake_purchase 확정.
- **비고**: "날짜오차_매칭"

#### Rank 3 (옵션 불일치 허용)

- **조건**: `ID` + `이름` + `상품명(정규화)` + `날짜(±1일)` 일치 **BUT** `옵션` 불일치
- **조치**: fake_purchase 확정.
- **비고**: "옵션불일치_매칭"

#### Rank 4 (ID 불일치 허용)

- **조건**: `이름` + `상품명(정규화)` + `옵션(정규화 후)` + `날짜(±1일)` 일치 **BUT** `ID` 불일치
- **조치**: fake_purchase 확정.
- **비고**: "ID불일치_매칭"

#### Rank 5 (이름 불일치 허용 — 가족/타인 구매)

- **조건**: `ID` + `상품명(정규화)` + `옵션(정규화 후)` + `날짜(±1일)` 일치 **BUT** `이름` 불일치
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
>
> 예시: `굿포펫 츄라잇 고양이 종합 면역력 영양제 스틱 14포` → **츄라잇** 추출 → 체험단 미션상품명에서도 **츄라잇** 추출 → 일치

> **옵션 비교 규칙 (상품별 키워드 추출 방식)**: 옵션 비교도 전체 문자열이 아닌 상품별로 정의된 핵심 키워드를 추출하여 비교한다.
>
> | 상품 | 스마트스토어 추출 소스 | 키워드 | 비고 |
> |------|----------------------|--------|------|
> | 애착트릿 | **상품명**에서 추출 | 북어, 연어, 치킨 | 스스에서 옵션이 아닌 상품명에 맛이 포함됨 |
> | 츄라잇 | **옵션**에서 추출 | 데일리핏, 클린펫, 브라이트 | |
>
> 예시 (애착트릿): 스스 상품명 `굿포펫 애착트릿 북어 60g` → **북어** 추출 → 체험단 옵션 `북어` 비교 → 일치
> 예시 (츄라잇): 스스 옵션 `맛 선택: 클린펫 1개 (닭가슴살)` → **클린펫** 추출 → 체험단 옵션 `클린펫` 비교 → 일치
>
> 옵션 키워드가 정의되지 않은 상품은 옵션 비교를 생략한다(무조건 일치 처리).

> **체험단 미지원 상품 예외 처리**: 아래 상품은 현재 체험단에 지원하고 있지 않으므로, 필터링 매칭 대상에서 **제외**하고 실구매자로 취급한다.
>
> | 정규화 상품명 | 키워드 |
> |--------------|--------|
> | 미니 트릿백 | 트릿백 |
> | 츄르짜개 (고양이 간식 디스펜서) | 츄르짜개 |
> | 도시락 샘플팩 | 샘플팩 |
> | 전제품 맛보기 샘플 | 맛보기 |

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
| 기간외_주문없음 | 해당 인증일 ±1일 범위에 어떤 유효 purchase도 존재하지 않음 |
| 상품매핑_실패 | 미션상품명이 products 테이블과 매핑되지 않음 |
| 조건_불일치 | 유효 purchase는 존재하나 5개 Rank 어디에도 매칭되지 않음 |

#### 3.4.3 수동 확인 권장 건

- Rank 4~5로 매칭된 건에 "수동 확인 권장" 태그 부여.
- `quantity_warning = true`인 건에 "수량 확인 필요" 태그 부여.

### 3.5 수동 분류 (Manual Classification)

수동으로 분류한 건은 `is_manual = true`로 표시되며, 자동 재분석 시 보호된다.

#### 3.5.1 fake_purchase → real_purchase 해제

1. 해당 purchase의 `is_fake`를 `false`로 변경.
2. `is_manual`을 `true`로 설정.
3. **연결된 experience 매칭 해제**: purchase의 `matched_exp_id`를 NULL로 초기화하고, 관련 experience는 미매칭 상태로 재분류 대상이 된다.
4. purchase의 `match_reason`, `match_rank`, `matched_exp_id`를 NULL로 초기화. `filter_ver`는 유지.

#### 3.5.2 real_purchase → fake_purchase 강제 지정

1. **experience 연결 선택 UI**: 미매칭 experience 목록에서 연결할 건을 선택 (수취인명/ID/상품명/인증일로 검색).
2. **experience 연결 시**: 양쪽에 매칭 정보 설정.
3. **experience 불명 시**: `match_reason = "수동지정_체험단원불명"`, `matched_exp_id = NULL`.
4. `is_fake = true`, `is_manual = true`로 설정.

#### 3.5.3 일괄 작업 (Bulk Actions)

- 수동 분류 목록 좌측에 체크박스(Multi-select) 제공.
- 상단 액션 바에 **[선택 건 일괄 Real 해제]**, **[선택 건 일괄 Fake 지정]** 버튼 배치.
- 일괄 Fake 지정 시 experience 연결은 모두 "체험단원 불명"으로 처리한다. 개별 연결이 필요한 건은 건별 수동 분류를 사용한다.
- 일괄 처리 시에도 각각의 트랜잭션 로그(`override_logs`)가 개별적으로 생성되어야 한다.

#### 3.5.4 분류 이력 관리

- 모든 수동 분류는 `override_logs` 테이블에 기록한다.
- `is_manual = true`인 건은 다음 자동 재분석 시 덮어쓰지 않는다.

### 3.6 고객 분석 로직 (Analytics)

분석 대상은 real_purchase(`is_fake = false`)만 해당한다.

#### 3.6.1 펫 타입 태깅

- `products` 테이블의 `pet_type`(DOG/CAT/BOTH) 매핑을 통해 구매 상품 속성 확인.
- 고객별 DOG/CAT 구매 건수를 집계하여 `customers.pet_tag` 업데이트.

#### 3.6.2 성장 단계 분석

| 단계 | 이름 | 예시 상품 | 설명 |
|------|------|-----------|------|
| 1 | Entry | 맛보기 트릿, 소용량 간식 | 저렴한 체험형 제품 |
| 2 | Growth | 덴탈껌, 기능성 간식 | 기능성 제품 |
| 3 | Core | 관절 영양제, 유산균 | 핵심 고기능 제품 |
| 4 | Premium | 정기 구독, 대용량 사료 | 고가/정기 구매 |

고객별 구매 상품의 최고 stage를 `customers.max_stage`에 저장.

#### 3.6.3 이탈 예측 및 방어

- **기본 기준 (고정)**: `오늘 - 마지막 구매일 > 60일` → `churn_risk = true`
- **개인화 기준 (동적)**: `오늘 - 마지막 구매일 > 평균 재구매 주기 + 15일` → `churn_risk = true`
- 두 기준 중 하나라도 충족 시 이탈 위험으로 분류.
- 주문 1건인 고객은 고정 기준(60일)만 적용.

#### 3.6.4 연관 구매 분석

동일 고객의 real_purchase 상품 조합 빈도를 집계하여 상위 연관 상품 쌍 도출. 대시보드 내 "자주 함께 구매되는 상품" Top 10 테이블 출력.

### 3.7 시스템 관리 (System Administration)

#### 3.7.1 계정 관리 (User Management)

- **위치**: [설정 > 계정 관리]
- **기능**:
  - **사용자 목록**: 등록된 사용자(이름, 이메일, 권한, 상태) 조회.
  - **초대(Invite)**: 이메일 입력을 통한 신규 사용자 초대 메일 발송 (Supabase Auth 연동).
  - **권한 회수**: 퇴사자 또는 보직 변경자의 계정을 '비활성화(Inactive)' 또는 '삭제' 처리.
  - **정보 수정**: 본인의 비밀번호 및 프로필 이름 변경 기능.
- **권한 등급**:
  - `admin`: 모든 기능 접근 가능 + 계정 초대/권한 변경 가능.
  - `modifier`: 데이터 작업 권한(admin과 동일: 업로드/필터링 실행/수동 분류/상품 관리) + 계정 초대/권한 변경 불가.
  - `viewer`: 대시보드/고객 분석/이력 조회만 가능. 데이터 변경 작업 불가.

#### 3.7.2 상품 마스터 관리 (Product Master)

- **위치**: [상품 관리 > 상품 목록]
- **목적**: 엑셀 업로드 전/후에 신상품 정보를 사전에 등록하거나, 기존 상품의 속성(펫 타입, 성장 단계)을 수정하여 필터링 및 분석 정확도를 높임.
- **기능**:
  - **조회/검색**: 상품명, 상품ID, 펫 타입 등으로 검색.
  - **등록/수정**: 신규 상품 수동 등록 및 기존 상품 정보(`pet_type`, `stage`, `product_line`) 수정.
  - **일괄 업로드**: 신상품 목록 엑셀 업로드 기능 (선택 사항).

---

## 4. 데이터베이스 설계

### 4.1 스키마 구조

#### purchases (전체 주문)

스마트스토어 유효 주문 원본 + 필터링 결과를 저장하는 메인 테이블.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| purchase_id | VARCHAR (PK) | 상품주문번호 |
| buyer_id | VARCHAR | 구매자 네이버ID |
| buyer_name | VARCHAR | 구매자명 |
| receiver_name | VARCHAR | 수취인명 |
| customer_key | VARCHAR | 복합키 (ID앞4자리_구매자명) |
| product_id | VARCHAR | 스마트스토어 원본 상품번호 |
| product_name | VARCHAR | 상품명 |
| option_info | VARCHAR | 옵션정보 (정규화 후 저장) |
| quantity | INTEGER | 수량 |
| order_date | DATE | 주문일시 |
| order_status | VARCHAR | 주문상태 (유효 상태만 적재) |
| claim_status | VARCHAR | 클레임상태 |
| delivery_type | VARCHAR | 배송속성 |
| is_fake | BOOLEAN | fake_purchase 여부 (default: false) |
| match_reason | VARCHAR | 판정 사유 |
| match_rank | INTEGER | 매칭 Rank (1~5, NULL이면 미매칭) |
| matched_exp_id | INTEGER | 매칭된 experience ID (FK) |
| is_manual | BOOLEAN | 수동 분류 여부 (default: false) |
| filter_ver | VARCHAR | 필터링 정책 버전 |
| quantity_warning | BOOLEAN | 수량 경고 (default: false) |

> `is_fake = false` → **real_purchase**, `is_fake = true` → **fake_purchase**

#### experiences (체험단 명단)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL (PK) | 체험단 레코드 ID |
| upload_batch_id | UUID | 업로드 배치 식별자 |
| campaign_id | INTEGER (FK) | 캠페인 ID (campaigns.id 참조) |
| mission_product_name | VARCHAR | 미션 상품명 |
| mapped_product_id | VARCHAR | 매핑된 내부 상품 ID (`products.product_id`) |
| option_info | VARCHAR | 옵션정보 (정규화 후 저장) |
| nickname | VARCHAR | 닉네임 |
| receiver_name | VARCHAR | 수취인 |
| naver_id | VARCHAR | 네이버 아이디 |
| purchase_date | DATE | 구매인증일 |
| address | VARCHAR | 주소 |
| phone_last4 | VARCHAR | 연락처 뒷자리 |
| unmatch_reason | VARCHAR | 미매칭 사유 |
| **UNIQUE** | | `(naver_id, mission_product_name, purchase_date)` |

#### campaigns (캠페인 관리)

체험단 마케팅의 단위를 관리하여 분석의 기준을 마련한다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL (PK) | 캠페인 ID |
| name | VARCHAR | 캠페인명 (예: 25년 1월 신제품 체험단) |
| agency | VARCHAR | 대행사명 (선택) |
| start_date | DATE | 시작일 |
| end_date | DATE | 종료일 |
| budget | DECIMAL | 집행 예산 (선택, 원 단위) |
| created_at | TIMESTAMP | 생성일 |
| deleted_at | TIMESTAMPTZ | Soft Delete 타임스탬프 (NULL=활성, §4.3 참조) |

#### products (상품 마스터)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| product_id | VARCHAR (PK) | 내부 상품 ID |
| product_name | VARCHAR | 상품명 |
| pet_type | ENUM | DOG / CAT / BOTH |
| stage | INTEGER | 성장 단계 (1~4) |
| product_line | VARCHAR | 상품 라인 |
| deleted_at | TIMESTAMPTZ | Soft Delete 타임스탬프 (NULL=활성, §4.3 참조) |

#### customers (고객 요약)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| customer_key | VARCHAR (PK) | 복합키 (ID앞4자리_구매자명) |
| buyer_name | VARCHAR | 구매자명 |
| buyer_id | VARCHAR | 네이버ID |
| pet_tag | ENUM | DOG / CAT / BOTH |
| max_stage | INTEGER | 도달한 최고 성장 단계 |
| total_orders | INTEGER | 총 real_purchase 건수 |
| total_amount | DECIMAL | 총 real_purchase 금액 |
| first_order_date | DATE | 최초 구매일 |
| last_order_date | DATE | 최근 구매일 |
| last_order_days | INTEGER | 마지막 주문 경과일 |
| avg_purchase_cycle | DECIMAL | 평균 재구매 주기 (일) |
| churn_risk | BOOLEAN | 이탈 위험 여부 |
| deleted_at | TIMESTAMPTZ | Soft Delete 타임스탬프 (NULL=활성, §4.3 참조) |

#### profiles (사용자 프로필)

Supabase Auth의 `users` 테이블과 1:1로 매핑되는 공개 프로필 정보.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | Supabase Auth User ID (FK) |
| email | VARCHAR | 이메일 (로그인 ID) |
| full_name | VARCHAR | 관리자 실명 (화면 표시용) |
| role | VARCHAR | 권한 등급, CHECK(`role IN ('admin', 'modifier', 'viewer')`) |
| status | VARCHAR | 상태, CHECK(`status IN ('active', 'inactive')`) |
| created_at | TIMESTAMP | 계정 생성일 |

#### filter_logs (필터링 실행 이력)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| log_id | SERIAL (PK) | 로그 ID |
| executed_at | TIMESTAMP | 실행 일시 |
| executed_by_account_id | UUID (FK) | 로그인 계정 ID (`profiles.id`) |
| executed_by | VARCHAR | 실행 시 팝업 입력한 실제 작업자명 스냅샷 |
| filter_ver | VARCHAR | 적용된 필터 정책 버전 |
| status | VARCHAR | 결과 (success / error) |
| summary_json | JSONB | 실행 요약 (Rank별 건수, 처리 시간, 미매칭 건수 등) |
| error_message | TEXT | 에러 메시지 (실패 시) |
| total_purchases_processed | INTEGER | 처리된 purchase 건수 |
| total_exp_processed | INTEGER | 처리된 experience 건수 |
| total_matched | INTEGER | 총 매칭 건수 (fake_purchase) |
| total_unmatched_exp | INTEGER | 미매칭 experience 건수 |

> `executed_by`는 공용 계정 사용 상황을 고려해 "실제 작업자명"을 팝업 입력받아 스냅샷으로 저장한다.
>  
> `executed_by_account_id`는 로그인 계정 추적용으로 별도 저장한다.

#### override_logs (수동 분류 이력)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| log_id | SERIAL (PK) | 로그 ID |
| changed_at | TIMESTAMP | 변경 일시 |
| changed_by_account_id | UUID (FK) | 로그인 계정 ID (`profiles.id`) |
| changed_by | VARCHAR | 변경 시 팝업 입력한 실제 작업자명 스냅샷 |
| purchase_id | VARCHAR | 대상 purchase ID |
| action | VARCHAR | 변경 유형 (fake해제 / fake지정) |
| prev_is_fake | BOOLEAN | 변경 전 값 |
| new_is_fake | BOOLEAN | 변경 후 값 |
| prev_matched_exp_id | INTEGER | 변경 전 연결 experience ID |
| new_matched_exp_id | INTEGER | 변경 후 연결 experience ID (불명 시 NULL) |
| note | TEXT | 관리자 메모 (선택) |

> `changed_by`는 공용 계정 사용 상황을 고려해 "실제 작업자명"을 팝업 입력받아 스냅샷으로 저장한다.
>  
> `changed_by_account_id`는 로그인 계정 추적용으로 별도 저장한다.

#### notifications (알림 센터)

비동기 작업 완료/에러 등의 알림을 저장하여 알림 센터에 표시한다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL (PK) | 알림 ID |
| user_id | UUID (FK) | 대상 사용자 (profiles.id) |
| type | VARCHAR | 알림 유형 (filter_complete, upload_complete, error 등) |
| title | VARCHAR | 알림 제목 |
| message | TEXT | 알림 본문 |
| is_read | BOOLEAN | 읽음 여부 (default: false) |
| metadata | JSONB | 추가 데이터 (job_id, 관련 URL 등) |
| created_at | TIMESTAMP | 생성 일시 |

#### filter_jobs (비동기 필터링 작업)

§3.2.1 비동기 처리 시 작업 상태를 추적하기 위한 테이블.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID (PK) | 작업 ID (job_id) |
| status | VARCHAR | 상태 (pending / processing / completed / failed) |
| progress | INTEGER | 진행률 (0~100) |
| started_at | TIMESTAMP | 시작 일시 |
| completed_at | TIMESTAMP | 완료 일시 |
| executed_by | UUID (FK) | 실행자 (profiles.id) |
| filter_ver | VARCHAR | 적용 필터 버전 |
| summary_json | JSONB | 실행 결과 요약 |
| error_message | TEXT | 에러 메시지 (실패 시) |

### 4.2 Soft Delete 운영 정책

마스터 데이터 테이블(`products`, `customers`, `campaigns`)은 다른 테이블이 FK로 참조하고 있어,
Hard Delete(행 삭제) 시 과거 데이터의 조인이 깨진다. 이를 방지하기 위해 **Soft Delete** 방식을 적용한다.

#### 적용 대상

| 테이블 | Soft Delete | 이유 |
|--------|:-----------:|------|
| products | ✅ | purchases.product_id가 FK로 참조 |
| customers | ✅ | purchases.customer_id가 FK로 참조 |
| campaigns | ✅ | experiences.campaign_id가 FK로 참조 |
| purchases, experiences | ❌ | 트랜잭션 데이터 — 삭제 자체를 허용하지 않음 |
| filter_logs, override_logs | ❌ | 감사 이력 — 삭제 불가 |
| notifications, filter_jobs | ❌ | FK 참조 없음, 삭제해도 무관 |

#### 삭제 동작

```sql
-- 삭제 시: 행을 지우지 않고 deleted_at에 타임스탬프만 기록
UPDATE products SET deleted_at = now() WHERE id = :id;

-- 복구 시: deleted_at을 NULL로 초기화
UPDATE products SET deleted_at = NULL WHERE id = :id;
```

#### View (활성 데이터 전용)

매번 `WHERE deleted_at IS NULL`을 쓰는 실수를 방지하기 위해, 활성 데이터만 반환하는 View를 제공한다.

| View | 원본 테이블 |
|------|------------|
| `products_active` | products |
| `customers_active` | customers |
| `campaigns_active` | campaigns |

#### RLS 정책

- **일반 사용자(viewer)**: `deleted_at IS NULL`인 행만 조회 가능
- **수정자(modifier)**: 삭제된 항목 포함 조회 + 데이터 변경(CUD) 가능, 계정 초대/권한 변경 불가
- **관리자(admin)**: 전체 조회 + 데이터 변경(CUD) + 계정 초대/권한 변경 가능

### 4.3 filter_ver 운영 규칙

- 필터링 정책(Rank 조건, 날짜 오차 범위, Rank 추가/삭제 등)이 변경될 때마다 `filter_ver` 값을 올린다.
- 필터링 실행 시, 매칭된 모든 purchase의 `filter_ver`에 현재 버전이 기록된다.
- `filter_logs`에도 `filter_ver`가 기록되어, 어떤 버전으로 실행했는지 이력 추적이 가능하다.
- 정책 변경 후 재분석 시, 이전 버전으로 분류된 건(`is_manual = false`)만 초기화되고 수동 분류 건은 보호된다.

### 4.3 트랜잭션 및 데이터 무결성

- **Atomic Transaction**: `purchases.is_fake` 및 `purchases.matched_exp_id` 업데이트는 반드시 하나의 트랜잭션으로 묶는다 (All or Nothing).
- **수동 분류 트랜잭션**: 수동 분류 시 purchase 측 판정 변경 + 로그(`override_logs`) 적재를 하나의 트랜잭션으로 묶는다.
- **Rollback**: 에러 발생 시 해당 배치의 모든 변경 사항을 원복하고 `filter_logs`에 기록한다.
- **수동 분류 보호**: `is_manual = true`인 건은 자동 재실행 시 덮어쓰지 않는다.

---

## 5. 개발자 데이터 처리 시나리오

### 5.1 구현 방향성

| 구분 | 추천 방식 | 이유 |
|------|-----------|------|
| 체험단 필터링 | Code (서버) | 1:1 소거법과 5단계 순차 루프는 SQL로 구현 시 복잡도와 디버깅 난이도가 높음 |
| 통계/분석 | DB (SQL) | 매출 합계, 펫 타입 비율 등 집계 함수가 효율적 |
| 데이터 적재 | Code (서버) | 엑셀 파싱(헤더 기반), 옵션 정규화, 상태 필터링, UPSERT 처리는 코드에서 수행 후 DB 적재 |

### 5.2 Phase 1 — 데이터 준비 (Data Preparation)

**ETL 처리 순서**:

1. 엑셀 파싱: 헤더 명칭 기반 컬럼 추출 + 필수 컬럼 검증.
2. 전처리: Trim, 날짜 통일, **옵션 정규화** (구분자 분리 → 정렬 → 표준 구분자 결합).
3. **주문상태 필터링**: 화이트리스트 기반 유효 주문만 추출. 무효 건은 카운팅 후 폐기.
4. **UPSERT 처리**: 유효 주문을 `purchases`에 적재. 기존 건 중 상태가 무효로 변경된 건은 삭제 + 연결된 experience 매칭 초기화.
5. experience 데이터 적재 (복합 유니크 제약에 의한 중복 방지).
6. 체험단 미션상품명 → 상품 마스터 ID 매핑.

**필터링 엔진 입력 데이터**:

1. 미매칭 experience: `mapped_product_id IS NOT NULL`이고 `purchases.matched_exp_id`에 연결되지 않은 건.
2. 검증 대상 purchase: `is_fake = false` AND `is_manual = false`.
3. 상품 매핑 정보: `products` 테이블 전체.

### 5.3 Phase 2 — 필터링 엔진 구동 (Filtering Logic)

서버 코드에서 비동기(Async) 수행. `job_id` 반환 후 백그라운드 처리.

- **Rank 1~5 순차 순회**: 각 Rank에서 매칭 시 양쪽 풀에서 제거.
- **매칭 후 처리**: `filter_ver` 기록, `quantity >= 2` 시 `quantity_warning = true`, 미매칭 experience에 `unmatch_reason` 자동 분류.
- **최종 반영**: 단일 트랜잭션으로 DB UPDATE. `filter_logs`에 실행 결과 기록. 알림 센터에 완료 메시지 적재.

### 5.4 Phase 3 — 고객 분석 및 CRM (Analytics)

필터링 완료 후, real_purchase(`is_fake = false`)만 대상으로 수행.

1. **펫 타입 태깅**: purchases × products 조인 → customers.pet_tag 업데이트.
2. **성장 단계**: purchases × products 조인 → MAX(stage) → customers.max_stage 업데이트.
3. **이탈 감지**: MAX(order_date) 기준 경과일 및 평균 주기 계산 → customers.churn_risk 업데이트.
4. **연관 구매**: 동일 고객 상품 조합 빈도 집계 → 별도 분석 결과 테이블 저장.

---

## 6. UI/UX 요구사항

### 6.1 대시보드 (매출 분석 > 대시보드)

- **KPI 카드**: 전체 purchase 수 vs real_purchase 수 vs fake_purchase 수.
- **필터링 요약**: "총 N건 중 fake_purchase M건 감지" — 클릭 시 상세 리스트. 각 건에 Rank, 판정 사유, filter_ver 표시.
- **Rank별 분포**: 매칭 유형별 건수 분포 차트.
- **미매칭 체험단**: 매칭되지 않은 experience 건수 및 사유별 분류.
- **펫 타입 분포**: 원형 차트 (DOG / CAT / BOTH).
- **성장 단계 분포**: 막대 차트 (Entry ~ Premium 단계별 고객 수).
- **이탈 경고**: 이탈 위험군 리스트 카드.
- **연관 구매**: 자주 함께 구매되는 상품 조합 Top 10 테이블.
- **알림 센터**: 우측 상단 알림 아이콘. 필터링/대용량 업로드 등 비동기 작업 완료 시 결과 메시지 적재. 다른 페이지에 있어도 토스트(Toast) 팝업 노출.

### 6.2 수동 분류 화면 (매출 분석 > 필터링 실행)

- **fake → real 해제**: fake_purchase 목록에서 [real로 변경] 버튼. 연결된 experience 매칭 자동 해제.
- **real → fake 지정**: real_purchase 목록에서 [fake로 지정] 버튼. 미매칭 experience 검색 패널 또는 [체험단원 불명] 버튼.
- **일괄 작업**: 목록 좌측 체크박스(Multi-select) + 상단 **[선택 건 일괄 Real 해제]** / **[선택 건 일괄 Fake 지정]** 버튼. 일괄 처리 시에도 `override_logs` 개별 생성.
- **진행률 표시**: 필터링 실행 중 Progress Bar + 백분율 표시. 완료/실패 시 상태 전환.
- **분류 이력**: [매출 분석 > 실행 이력] 페이지의 [수동 분류 이력] 탭에서 조회.

### 6.3 고객 분석 및 다운로드 (매출 분석 > 고객 분석)

필터 조건 조합: 실구매 여부 + 펫 타입 + 성장 단계 + 기간 + 이탈 위험 여부.

**마케팅용 엑셀**: customer_key, buyer_name, buyer_id, pet_tag, max_stage, total_orders, last_order_date, churn_risk.

**분석용 엑셀**: purchase_id, buyer_name, buyer_id, product_name, option_info, quantity, order_date, is_fake, match_reason, match_rank, matched_exp_id, is_manual, filter_ver, quantity_warning.

**파일명 규칙**: `{용도}_{필터조건요약}_{YYYYMMDD}.xlsx`

### 6.4 실행 이력 조회 (매출 분석 > 실행 이력)

- **필터링 이력 탭**: `filter_logs` 기반. 실행 일시, filter_ver, 처리 건수, Rank별 분포, 에러 여부.
- **수동 분류 이력 탭**: `override_logs` 기반. 변경자, 일시, 대상 purchase, 변경 전/후 값, 메모.

### 6.5 시스템 관리 화면

- **로그인 페이지**: 이메일/비밀번호 입력 폼. "로그인 상태 유지" 체크박스. 회원가입 버튼 없음.
- **계정 관리 페이지** (설정 > 계정 관리): 카드형 또는 테이블형 사용자 목록 (이름, 이메일, 권한, 상태). [초대하기] 버튼 클릭 시 이메일 입력 모달. 각 행에 [비활성화] / [삭제] 버튼.
- **상품 관리 페이지** (상품 관리 > 상품 목록): 검색 바가 있는 데이터 테이블 (상품명/상품ID/펫타입으로 검색). 각 행 우측에 [수정] 버튼. 상단에 [신규 상품 등록] 버튼. 선택 사항으로 [일괄 업로드] 버튼.

### 6.6 추가 업데이트 (2026-02-19, 구현 반영)

- 본 항목은 기존 6.1~6.5를 대체하지 않으며, 최근 확정된 화면 동작만 추가 명시한다.
- 전역/네비게이션:
  - 홈 화면은 진입 허브로 단순화(`매출 분석`, `설정`).
  - 사이드바 하단 로그아웃 상시 노출.
  - 헤더 월 선택기는 `/dashboard`, `/customers`, `/logs`, `/upload`, `/filter`에서 동작.
- 대시보드:
  - 대표/운영자 정보형 화면으로 구성(KPI + 추이/분포/위험 고객).
  - "이번 달 작업 파이프라인" 블록은 제외.
  - `전체 주문`은 ETL 유효 주문 기준으로 운영하고, 별도 보정 문구는 두지 않음.
- 데이터 업로드:
  - 상태머신: `업로드 전 -> 업로드 진행 중 -> 업로드 완료 -> 매핑 필요`.
  - `전체 기간(all)`에서는 업로드 실행 금지, 특정 월 선택 시만 실행.
  - 주문/체험단 각각 `양식 다운로드` 제공.
  - 누락 컬럼은 개수뿐 아니라 컬럼명 목록을 함께 표시.
  - 매핑 실패 화면에 `남은/완료` 진행 표시 + 검색 연결 + `새로 등록` 액션 제공.
- 필터링 실행(화면 라벨: 필터링):
  - `전체 기간(all)`에서는 실행 금지, 특정 월 선택 시만 실행.
  - 분석 결과 노출 시 `정리 엑셀 다운로드` 버튼 제공(최종 규격은 `.xlsx`, 프로토타입 단계에서는 CSV 사용 가능).
  - 상세 패널 수정값은 `저장` 시 목록에 반영(커밋형 UX).
- 고객 분석:
  - 구매 횟수 필터(1/3+/5+/10+)를 실제 필터 로직에 반영.
  - 대시보드에서 전달된 query(`month`, `purchaseType`, `churn`, `purchaseCount`)를 초기 필터에 반영.
  - 필터 변경 시 URL query 동기화로 재진입/공유 일관성 유지.

---

## 7. 운영 및 예외 처리

### 7.1 신상품 대응

엑셀에 `products` 테이블에 없는 신규 상품명/옵션 조합이 등장하면, "신규 상품 정보 입력" 팝업 노출. 관리자가 [상품 관리] 페이지에서 `pet_type`, `stage`, `product_line`을 지정하여 등록. 또는 팝업에서 바로 간편 등록 가능.

### 7.2 체험단 상품명 매핑 실패

체험단 미션상품명이 products 테이블의 어떤 상품과도 매칭되지 않을 경우, "상품 매핑 실패" 경고와 함께 수동 매핑 UI 제공. 매핑 완료 전에는 해당 experience 건은 필터링에서 보류 처리.

### 7.3 캠페인 관리

- 체험단 업로드 시 기존 `campaigns`에서 캠페인을 선택하거나, 신규 캠페인을 생성한다.
- `upload_batch_id` 기준으로 특정 배치를 통째로 삭제 가능.
- 배치 삭제 시 해당 배치와 매칭된 purchase의 `is_fake`도 함께 초기화.
- 캠페인별 매칭률 조회: `campaigns.id` 기준 GROUP BY로 매칭/미매칭 건수, 집행 예산 대비 효율 확인.

### 7.4 알 수 없는 주문상태 처리

화이트리스트에 없는 주문상태 값이 등장할 경우, "알 수 없는 주문상태 N건" 경고를 표시하고 적재하지 않는다.

### 7.5 개인정보 관리

체험단 연락처(`phone_last4`), 주소(`address`) 정보는 매칭 완료 후 90일 뒤 자동 파기(NULL 처리).

### 7.6 에러 처리

- 필터링 중 에러 발생 시 해당 트랜잭션 전체를 롤백한다.
- 에러 내용을 `filter_logs` 테이블에 기록한다.
- 알림 센터에 "필터링 중 오류가 발생하여 모든 변경이 롤백되었습니다. 사유: [에러 메시지]"를 적재하고, 토스트 팝업으로 노출한다.

---

## 8. 비기능 요구사항

### 8.1 동시성 제어

- 필터링 실행 중 Lock 적용. 동시 실행 요청 시 차단 메시지 노출.
- Lock은 트랜잭션 완료 또는 타임아웃(10분) 시 자동 해제.

### 8.2 재실행 정책

- 동일 기간 재실행 시 `is_manual = true`인 건은 보존.
- 나머지 자동 판정 건은 초기화 후 재수행.
- 재실행 전 확인 팝업 필수.

### 8.3 데이터 볼륨

- **현재 규모**: purchase 약 572건, experience 약 340건 (월 기준).
- **목표 규모**: 월 purchase 5,000건, experience 1,000건까지 성능 저하 없이 처리.

### 8.4 백업 및 복구

- 필터링 실행 전 자동 스냅샷 생성 (purchases + experiences 테이블 상태).
- 문제 발생 시 직전 스냅샷으로 1클릭 복구 기능 제공.

### 8.5 인증 및 보안

- Supabase Auth 기반 세션 관리. 세션 최대 24시간.
- 모든 API 요청에 세션 토큰 검증 필수.
- `viewer` 권한은 데이터 변경 API 호출 불가 (서버 측 검증).
- `modifier` 권한은 데이터 변경 API 호출 가능, 계정 초대/권한 변경 API 호출 불가 (서버 측 검증).

---

## 9. 개발 로드맵

| 단계 | 범위 | 기능 |
|------|------|------|
| MVP | Phase 1 | **로그인/인증 시스템**, **계정 관리(초대/비활성화)**, **상품 마스터 관리(CRUD)**, 데이터 업로드(헤더 기반 파싱/옵션 정규화/ETL 상태 필터링/UPSERT/무효화 시 매칭 복구), 5-Rank 필터링(filter_ver 기록/비동기 처리/진행률 표시), 수량 경고, 결과 검증(Rank분포/미매칭리스트), 수동 분류(is_manual/쌍 관리/일괄 작업), 기본 대시보드(KPI + 필터링 로그), 알림 센터(토스트), 실행 이력 로깅, 캠페인 관리 |
| v1.1 | Phase 2 | 펫 타입 태깅, 이탈 감지(고정+동적 이중 기준), 이탈 경고 카드, **강제 매칭 기능** (미매칭 experience → purchase 검색 → 1:1 수동 연결) |
| v1.2 | Phase 3 | 성장 단계 분석, 타겟 추출(마케팅용/분석용 엑셀 다운로드), 엑셀 컬럼 매핑 관리 UI |
| v2.0 | Phase 4 | 연관 구매 분석, 캠페인별 매칭률/예산 효율 리포트, 마케팅 자동화 연동 |
