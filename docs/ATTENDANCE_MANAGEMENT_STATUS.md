# Attendance Management Status

- 기준일: 2026-03-11 (Asia/Seoul)
- 범위: 근태 관리 화면, 레이아웃, 관리자/개인 근태 UX
- 비범위: 로그인/회원가입, 매출분석, 업무 자동화

## 현재 근태 라우트

- `/attendance/records`: 개인 출퇴근 기록
- `/attendance/admin`: 관리자 금일 근태 이력
- `/attendance/leave`: 휴가/반차 신청
- `/attendance/leave-approvals`: 관리자 휴가 승인
- `/attendance/weekly`: 관리자 주별 근태 보드 / 일반 사용자 개인 근태 기록
- `/attendance/calendar`: 월별 근태 캘린더
- `/attendance/settings`: 근무 기준 설정

## 2026-03-11 반영 사항

### 1. 근태 전용 레이아웃 리프레시

- 파일: `app/layouts/attendance.vue`
- 목적: 굿포펫 홈과 톤을 맞춘 iPhone 스타일의 정돈된 glass UI 적용
- 반영 내용:
  - 배경 오브(orb)와 밝은 유리 질감 레이어 추가
  - 사이드바, 상단 헤더, 콘텐츠 셸을 liquid/glass 느낌으로 재정리
  - 카드, 요약영역, 상태 칩, 필터 칩, 모달, 입력창, 버튼에 근태 전용 deep style 적용
  - 페이지 단위 등장 애니메이션, 섹션 stagger, 모달 진입 애니메이션 추가
  - 휴가 승인 대기 배지는 유지하면서 시각적 톤을 레이아웃과 통일

### 2. 출퇴근 기록 UX 보강

- 파일: `app/pages/attendance/records.vue`
- 반영 내용:
  - `퇴근하기` 전 확인 모달 추가
  - 출근 전 상태일 때 카드 강조(`mode-cta`) 추가
  - 오늘 상태/액션 영역 배치 정리
  - `근무 중` 라벨에 현재 누적 근무시간 표시

### 3. 관리자 금일 근태 이력 보강

- 파일: `app/pages/attendance/admin.vue`
- 반영 내용:
  - 마지막 새로고침 시각 표시
  - 지각 기준 시각이 지난 뒤 미출근 인원을 상단 배너로 노출
  - 결근/미출근 관찰이 빠르게 되도록 관리자 정보 밀도 보강

### 4. 휴가 승인 화면 톤 통일

- 파일: `app/pages/attendance/leave-approvals.vue`
- 반영 내용:
  - 기존 파란색/빨간색 강조를 제거하고 흰색 기반 카드/필터/버튼/상태칩으로 통일
  - 승인/반려 액션 버튼도 동일한 중성 톤으로 정리
  - 휴가 승인 화면만 별도 스코프로 처리해서 다른 화면 버튼에는 영향 없음

### 5. 주별 근태 기록 표시 정리

- 파일: `app/pages/attendance/weekly.vue`
- 반영 내용:
  - 일반 사용자 제목을 `내 근태 기록`으로 조정
  - 빈 메모는 숨기도록 정리
  - 일자 카드 톤 함수 인자를 단순화해 템플릿 가독성 개선

## 현재 변경 파일

- `app/layouts/attendance.vue`
- `app/pages/attendance/admin.vue`
- `app/pages/attendance/leave-approvals.vue`
- `app/pages/attendance/records.vue`
- `app/pages/attendance/weekly.vue`
- `docs/ATTENDANCE_MANAGEMENT_STATUS.md`

## 검증

- `npm run build` 통과
- 확인된 경고:
  - `SUPABASE_SERVICE_KEY` deprecation warning
- 이번 변경은 UI/UX 및 화면 보강 중심이며 로그인/회원가입 로직은 수정하지 않음

## 운영 메모

- 현재 근태 변경은 attendance 범위에만 한정되어 있음
- 기존 정상 동작 기능(로그인/회원가입, 매출분석, 자동화)은 이번 범위에서 건드리지 않음
- 일부 화면은 테이블 부재 시 fallback 안내를 유지:
  - `attendance_records`
  - `attendance_work_sessions`
  - `attendance_settings`
  - `leave_requests`

## 후속 확인 메모

- `/attendance/weekly`는 관리자와 일반 사용자의 표시 방식이 다름
  - 관리자: 주별 보드
  - 일반 사용자: 개인 기록 중심 뷰
- 주별/휴가 상태 집계 로직은 실제 운영 데이터 기준으로 한 번 더 점검 여지 있음
