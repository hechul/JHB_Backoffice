# Attendance Management 구현 계획

- 프로젝트: JHBioFarm 백오피스 > 근태 관리
- 작성일: 2026-03-05 (Asia/Seoul)
- 목적: 회원가입 후 관리자 승인 기반 접근 제어 + 근태관리 모듈 도입

---

## 1) 목표

- 사용자 개별 회원가입을 허용하되, 승인 전에는 업무 화면 접근을 차단한다.
- 관리자 승인 후에만 백오피스 및 근태관리 기능 접근이 가능하도록 한다.
- 근태관리는 MVP로 출근/퇴근 기록과 월별 조회부터 시작한다.

---

## 2) 핵심 정책

### 계정 상태 정책

- `pending`: 가입 완료, 승인 대기
- `active`: 승인 완료, 서비스 이용 가능
- `rejected`: 승인 반려
- `inactive`: 비활성 계정

### 권한 정책

- `admin`: 승인/반려, 권한관리, 근태 운영 전체
- `modifier`: 근태 조회/관리(정책 범위 내)
- `viewer`: 본인 근태 조회/입력

### 접근 정책

- 비로그인: `/login`만 접근
- 로그인 + `pending|rejected|inactive`: `/pending-approval`만 접근
- 로그인 + `active`: 기존 백오피스 + 근태관리 접근

---

## 3) 범위

### In Scope (이번 단계)

1. 로그인 페이지 내 회원가입 탭 추가
2. 승인 대기 페이지(`/pending-approval`) 추가
3. 글로벌 미들웨어에서 계정 상태 기반 라우팅 차단
4. 계정관리(`/settings/users`)에 승인대기 사용자 승인/반려 액션 추가
5. 근태관리 라우트 골격(`/attendance`) 추가

### Out of Scope (후속)

1. 근태 상세 기능(출근/퇴근/정정요청/승인 워크플로우 전체)
2. 근태 집계 대시보드 및 엑셀 다운로드
3. 알림 고도화(승인/반려 메일/SMS)

---

## 4) 데이터/DB 변경 계획

### profiles 상태 확장

- `status` 체크 제약을 다음 값으로 확장:
  - `pending`, `active`, `rejected`, `inactive`

### 신규 가입 기본값

- 신규 가입 시 `role='viewer'`, `status='pending'` 기본 생성
- 관리자 승인 시 `status='active'` 변경

### SQL 마이그레이션

- `docs/sql/2026-03-05_profiles_signup_approval_patch.sql` 추가 완료
  - `profiles_status_check` 재정의
  - `handle_new_user()` 기본 상태 변경

---

## 5) 구현 단계

## Phase A — 인증/승인 게이트

1. `/login`에 회원가입 UI 추가
2. 회원가입 성공 메시지 및 승인대기 안내
3. `/pending-approval` 페이지 신설
4. `auth.global.ts`에 상태 기반 라우팅 반영

## Phase B — 관리자 승인 기능

1. `/settings/users`에 승인대기 필터/배지 추가
2. 승인(`pending -> active`) 버튼
3. 반려(`pending -> rejected`) 버튼
4. 기존 활성/비활성 토글과 충돌 없이 공존

## Phase C — 근태관리 시작점

1. `/attendance` 페이지 생성(모듈 허브)
2. 홈/사이드바 진입점 추가
3. 승인 완료 계정만 접근 가능 확인

---

## 6) 검증 계획

### 시나리오 테스트

1. 신규 회원가입 -> 로그인 시 `/pending-approval` 이동 확인
2. 관리자 승인 -> 재로그인 시 정상 접근 확인
3. 관리자 반려 -> 업무 화면 차단 확인
4. 비승인 계정의 `/attendance` 직접 URL 접근 차단 확인

### 기술 검증

1. `npm run build`
2. `npm run test:unit`

---

## 7) 완료 기준 (DoD)

- 회원가입 후 승인 전 사용자는 업무 화면 접근이 불가하다.
- 관리자 화면에서 승인/반려 처리가 가능하다.
- 승인 완료 후 근태관리 메뉴와 페이지 접근이 가능하다.
- 빌드/테스트가 통과한다.

---

## 8) 진행상황 로그

- 2026-03-05 15:20: Phase A 시작
  - `/login`에 회원가입 탭 추가
  - `/pending-approval` 페이지 추가
  - `auth.global.ts`에 상태 기반 접근 제어 반영
  - `useCurrentUser`에 `status`/`isApproved` 반영
- 2026-03-05 16:10: Phase B 진행
  - `/settings/users`에 승인 대기/반려 상태 배지 추가
  - 승인/반려 액션 버튼 및 상태 변경 로직 반영
- 2026-03-05 16:20: Phase C 시작
  - 홈/사이드바에 `근태 관리` 진입점 추가
  - `/attendance`, `/attendance/records` 기본 화면 추가
  - SQL 패치 파일 초안 추가: `docs/sql/2026-03-05_profiles_signup_approval_patch.sql`
