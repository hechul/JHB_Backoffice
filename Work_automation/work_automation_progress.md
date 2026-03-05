# Work Automation 진행상황

- 프로젝트: JHBioFarm 백오피스 > 업무 자동화
- 대상 기능: 기능1(배송지→아르고 변환), 기능2(블로그 이미지/동영상 수집 자동화)
- 문서 목적: 작업 진행상황을 누적 기록하고, 다음 작업자가 바로 이어서 개발 가능하도록 상태를 고정

---

## 1) 현재 상태 요약

### 기능1 (아르고 발주 변환) — `완료`
- 어떤 양식이든 자동 처리 (컬럼 동의어 기반 유연 파싱)
- 다중 파일 합본 변환
- 사람별 상품명/수량 직접 입력 방식
- 우편번호 자동조회 (파일 내 추출 → 카카오 API)
- 아르고 양식 엑셀 다운로드

### 기능2 (블로그 미디어 수집) — `Phase D+E 구현 완료 / Render 배포 대기`
- Playwright + **Render.com** + Supabase DB Pull 패턴 아키텍처 확정
- `automation_jobs` DB 테이블 생성 완료
- Render 크롤러 서버 코드 완성 (`crawler/` 폴더, `render.yaml` 포함)
- Vercel API 라우트 완성 (`/api/blog/start`, `/api/blog/status/[jobId]`)
- `blog-media.vue` UI 페이지 + `useBlogMediaCollector.ts` composable 완성
- 자동화 허브 블로그 미디어 카드 활성화
- **남은 작업: Render에 `crawler/` 폴더를 배포하고 `CRAWLER_SERVER_URL` 환경변수 설정**

---

## 2) 최근 변경 로그

| 일시 | 구분 | 내용 | 상태 |
|---|---|---|---|
| 2026-03-04 | UI | 홈/사이드바에 `업무 자동화` 메뉴 추가 | 완료 |
| 2026-03-04 | 기능 | 아르고 발주 변환 MVP 구현 | 완료 |
| 2026-03-04 | API | 우편번호 자동조회 API 추가 (`KAKAO_REST_API_KEY` 연동) | 완료 |
| 2026-03-04 | 테스트 | `useArgoOrderConverter` 유닛 테스트 추가 | 완료 |
| 2026-03-05 | 기능 | 어떤 양식이든 자동 처리 (컬럼 동의어 기반 파싱으로 확장) | 완료 |
| 2026-03-05 | 계획 | 기능2 구현 계획 확정 (Playwright+**Render.com**, DB Pull 패턴) | 완료 |
| 2026-03-05 | DB | `automation_jobs` Supabase 테이블 생성 (RLS, index, service_role policy) | 완료 |
| 2026-03-05 | 기능2 | `crawler/` **Render** 크롤러 서버 코드 작성 (`render.yaml` 포함) | 완료 |
| 2026-03-05 | 기능2 | Vercel API: `/api/blog/start`, `/api/blog/status/[jobId]` 추가 | 완료 |
| 2026-03-05 | 기능2 | `blog-media.vue` + `useBlogMediaCollector.ts` 작성 | 완료 |
| 2026-03-05 | 기능2 | 자동화 허브 블로그 미디어 카드 활성화 | 완료 |

---

## 3) 파일 반영 위치

### 기능1
- `app/pages/automation/index.vue` (블로그 미디어 카드 활성화)
- `app/pages/automation/argo-order.vue`
- `app/composables/useArgoOrderConverter.ts`
- `server/api/postcode/lookup.post.ts`

### 기능2 (신규)
- `crawler/index.js` — **Render** Express 서버 진입점
- `crawler/lib/job-worker.js` — DB polling 워커 (5초 간격)
- `crawler/lib/naver-parser.js` — Playwright 기반 이미지/동영상 URL 추출
- `crawler/lib/zipper.js` — 이미지 다운로드 + ZIP 생성
- `crawler/lib/supabase-uploader.js` — Supabase Storage 업로드
- `crawler/routes/ping.js` — 헬스체크 엔드포인트
- `crawler/package.json`, `crawler/Dockerfile`
- `server/api/blog/start.post.ts` — job 등록 + Render ping
- `server/api/blog/status/[jobId].get.ts` — 상태 조회 (폴링용)
- `app/pages/automation/blog-media.vue` — UI 페이지
- `app/composables/useBlogMediaCollector.ts` — 폴링 흐름 제어

---

## 4) 남은 작업 (기능2)

### ⚠️ Render 배포 필수 (수동)
1. [render.com](https://render.com) 가입 후 새 Web Service 생성
2. `crawler/` 폴더를 GitHub 레포로 push → Render에 연결 (Dockerfile 자동 감지)
3. Render 환경변수 설정:
   - `SUPABASE_URL` = `https://qvqblzvypwwlmjxetola.supabase.co`
   - `SUPABASE_SERVICE_KEY` = Supabase > Settings > API > **service_role** 키
4. Render 배포 후 URL 확인 (예: `https://jhb-blog-crawler.onrender.com`)
5. Vercel 환경변수 설정:
   - `CRAWLER_SERVER_URL` = Render URL
6. Vercel 재배포

### Phase F (선택적 후속)
- 실패 URL 재시도 버튼 (이미 UI에 구현됨)
- Job 이력 목록 UI
- Storage 만료 파일 자동 삭제

---

## 5) 운영 환경변수

| 키 | 위치 | 비고 |
|----|------|------|
| `KAKAO_REST_API_KEY` | Vercel | 우편번호 자동조회 |
| `CRAWLER_SERVER_URL` | Vercel | **Render** 크롤러 URL |
| `SUPABASE_URL` | **Render** | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_KEY` | **Render** | service_role 키 (RLS 우회) |

---

## 6) 기록 규칙

- 이 문서는 작업 단위 종료 시 반드시 업데이트
- 변경 로그는 `일시/구분/내용/상태` 4컬럼으로 추가
- 상태값 표준: `완료`, `진행중`, `보류`, `취소`


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
| 2026-03-04 | 기능 | 사람(행)별 상품명/수량 직접 입력 방식으로 전환(수취인 단위 입력값 기준 제품코드/수량 반영) | 완료 |
| 2026-03-04 | API | 우편번호 자동조회 정확도 개선(주소 정규화 + 후보 재시도 + 조회 캐시) | 완료 |
| 2026-03-04 | API | 우편번호 조회 진단 정보 추가(키 미설정/호출제한/응답없음 토스트 안내) | 완료 |
| 2026-03-04 | 로직 | 배송지 파일 파서 + 소스 감지 + 매핑/수량 규칙 구현 | 완료 |
| 2026-03-04 | API | 우편번호 조회 API 추가(`KAKAO_REST_API_KEY` 연동) | 완료 |
| 2026-03-04 | 테스트 | `useArgoOrderConverter` 유닛 테스트 추가 | 완료 |
| 2026-03-05 | 검증 | 아르고 변환 최근 변경분 재점검(`build`, 전체 `test:unit`, `useArgoOrderConverter` 단위 테스트) 이상 없음 확인 | 완료 |
| 2026-03-05 | 계획 | 기능2(네이버 블로그 이미지/동영상 수집) 구현 계획을 `work_automation_implementation_plan.md`에 신규 반영 | 완료 |

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
