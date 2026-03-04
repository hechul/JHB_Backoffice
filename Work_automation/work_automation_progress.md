# Work Automation 진행상황

- 프로젝트: JHBioFarm 백오피스 > 업무 자동화
- 대상 기능: 블로그 체험단 배송지 파일 → 아르고 발주 양식 자동 변환
- 문서 목적: 작업 진행상황을 누적 기록하고, 다음 작업자가 바로 이어서 개발 가능하도록 상태를 고정
- 기준일: 2026-03-04 (Asia/Seoul)

---

## 1) 현재 상태 요약

- 상태: `MVP 1차 구현 완료`
- 코드 반영 완료 항목:
  - 홈/사이드바에 `업무 자동화` 진입점 추가
  - `/automation`, `/automation/argo-order` 페이지 추가
  - 배송지 파일 파싱 + 소스 자동 감지(디너의여왕/리뷰노트)
  - 품목 힌트 기반 제품코드 매핑
  - 발주 수량 규칙 반영
    - 디너의여왕: 두부모래 2, 그 외 1
    - 리뷰노트: 전 품목 1
  - 우편번호 자동 보완 API 추가 (`/api/postcode/lookup`)
  - 아르고 양식(`국내배송 주문`) 엑셀 다운로드 구현
  - 미해결 행(옵션/우편번호/품목 미확정) 테이블 표시
  - 빌드/유닛테스트 통과

---

## 2) 최근 변경 로그

| 일시 | 구분 | 내용 | 상태 |
|---|---|---|---|
| 2026-03-04 | UI | 홈/사이드바에 `업무 자동화` 메뉴 추가 | 완료 |
| 2026-03-04 | UI | `/automation` 허브 페이지 추가 | 완료 |
| 2026-03-04 | UI | `/automation/argo-order` 변환 페이지 추가 | 완료 |
| 2026-03-04 | UX/IA | 업무 자동화를 매출분석/상품관리 사이드바에서 분리하고 독립 레이아웃(`home`) 영역으로 전환 | 완료 |
| 2026-03-04 | UX/IA | 홈의 업무 자동화 카드 진입 경로를 `/automation`으로 변경, 자동화 화면에서 선택형 진입 구조 확정 | 완료 |
| 2026-03-04 | UX | `home` 레이아웃에 뒤로가기/홈으로 버튼 추가, 좌상단 `JHBioFarm` 로고 클릭 시 홈 이동 가능하도록 변경 | 완료 |
| 2026-03-04 | UX | `default` 레이아웃(매출 분석 영역)에도 동일하게 뒤로가기/홈 버튼과 좌상단 로고 홈 이동을 적용 | 완료 |
| 2026-03-04 | 기능 | 아르고 변환을 단일 파일 방식에서 다중 파일 합본 변환 방식으로 확장 (`.xlsx/.xls/.csv` 여러 개 업로드 후 1개 통합 양식 다운로드) | 완료 |
| 2026-03-04 | 기능 | 파일별 기본 품목 선택 기능 추가(혼합 업로드 시 전역 기본 품목 오매핑 방지) | 완료 |
| 2026-03-04 | 로직 | 배송지 파일 파서 + 소스 감지 + 매핑/수량 규칙 구현 | 완료 |
| 2026-03-04 | API | 우편번호 조회 API 추가(`KAKAO_REST_API_KEY` 연동) | 완료 |
| 2026-03-04 | 테스트 | `useArgoOrderConverter` 유닛 테스트 추가 | 완료 |

---

## 3) 파일 반영 위치

- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/app/pages/automation/index.vue`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/app/pages/automation/argo-order.vue`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/app/composables/useArgoOrderConverter.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/server/api/postcode/lookup.post.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/nuxt.config.ts`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/app/layouts/default.vue`
- `/Users/huicheol/Desktop/스마트스토어/smartstore_purchase/app/pages/index.vue`

---

## 4) 남은 이슈 / TODO

- 품목 힌트 없는 파일에서 자동 판별 정확도 추가 개선 필요
- 옵션 필수 품목(애착트릿/츄라잇 등)의 사용자 선택 UX 고도화 필요
- 변환 이력(누가/언제/몇 건 변환) DB 저장 필요 여부 결정
- 아르고 템플릿 고정값(배송요청사항/비고/출고요청 사유) 운영 정책 확정 필요
- 카카오 주소 API 키 미설정 환경 fallback 정책(수동 업로드용 CSV) 제공 검토

---

## 5) 운영 체크리스트

- 환경변수:
  - `KAKAO_REST_API_KEY` (선택, 우편번호 자동조회 품질 향상)
- 빌드 검증:
  - `npm run build`
- 테스트:
  - `npm run test:unit`

---

## 6) 다음 작업 예정 (우선순위)

1. 품목/옵션 미해결 행에 대해 `일괄 선택` UX 추가
2. 변환 결과/미해결 목록을 CSV로 동시 다운로드 제공
3. DB 저장 기반 변환 이력 페이지 추가(필요 시 `/automation/logs`)

---

## 7) 기록 규칙

- 이 문서는 작업 단위 종료 시 반드시 업데이트
- 변경 로그는 `일시/구분/내용/상태` 4컬럼으로 추가
- 상태값 표준: `완료`, `진행중`, `보류`, `취소`
