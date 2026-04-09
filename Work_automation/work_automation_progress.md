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

### 기능2 (블로그 미디어 수집) — `Phase D+E 완료 및 아키텍처 개편 (로컬 검증 완료)`
- Playwright + **Render.com** + Supabase DB Pull 패턴 아키텍처 확정 및 적용
- `automation_jobs` DB 테이블 생성 및 활용
- 원본 이미지/동영상 고화질 수집 추출 로직 최적화 (썸네일 파라미터 제외, 중복 제거)
- **(신규 개편)** 1개 URL씩 순차 처리 -> 자동 다운로드 트리거 -> 다운로드 완료 즉시 스토리지 자원 삭제 (Queue 시스템 반영)
- `blog-media.vue` 작업 진행바 UI 최적화 변경 완료
- `useBlogMediaCollector.ts` 큐/폴링 컨트롤러 최적화 반영 (오류 해결 완료)
- **남은 작업: 최신 코드를 Render에 배포하고 운영 서버에서 실제 1개씩 다운로드/삭제되는지 최종 테스트**

---

## 2) 최근 변경 로그

| 일시 | 구분 | 내용 | 상태 |
|---|---|---|---|
| 2026-03-04 | UI | 홈/사이드바에 `업무 자동화` 메뉴 추가 | 완료 |
| 2026-03-04 | API | 우편번호 자동조회 API 추가 (`KAKAO_REST_API_KEY` 연동) | 완료 |
| 2026-03-05 | DB | `automation_jobs` Supabase 테이블 생성 (RLS, index, service_role policy) | 완료 |
| 2026-03-05 | 기능2 | `crawler/` **Render** 크롤러 서버 코드 작성 (`render.yaml` 포함) | 완료 |
| 2026-03-05 | 기능2 | Vercel API: `/api/blog/start`, `/api/blog/cleanup/[jobId]` 추가 | 완료 |
| 2026-03-06 | 기능2 | 네이버 블로그 스마트에디터 원본 파일 경로(`data-linkdata`) 고화질 1순위 추출 로직 적용 (`naver-parser.js`) | 완료 |
| 2026-03-06 | 기능2 | 원본과 저화질 썸네일 중복 수집 방지 디듀플리케이션(Deduplication) 개발 | 완료 |
| 2026-03-06 | 아키텍처 | 한 번에 모두 처리하던 Job을 1 URL씩 순차 Queue 처리로 변경 (스토리지 트래픽/용량 최적화) | 완료 |
| 2026-03-06 | UI | `useBlogMediaCollector.ts`, `blog-media.vue` 파일에 새 Queue(진행률/자동다운로드) 시스템 렌더링 반영 | 완료 |
| 2026-04-09 | 기능2 | 프론트 다운로드를 signed URL+즉시 cleanup 방식에서 `/api/blog/download` 단일 경로로 통일, object URL revoke 지연 처리로 간헐 저장 누락 완화 | 완료 |
| 2026-04-09 | 기능2 | `naver-parser.js`에서 동영상 `vid/inkey` 메타를 메인/자식 frame 모두 탐색하도록 보강 | 완료 |
| 2026-04-09 | 검증 | 실URL 5건 직접 크롤링 검증 완료: 5건 모두 미디어 추출 성공, 이 중 1건은 동영상 1개 포함 상태로 ZIP 생성까지 확인 | 완료 |
| 2026-04-09 | 기능2 | `job-worker.js`를 보강해 동영상 포함 글은 보수적으로 ZIP 파트를 분할하고, 오래된 `running` job은 자동 실패 처리되도록 복구 로직 추가 | 완료 |
| 2026-04-09 | 기능2 | ZIP 내부 파일명을 블로그ID 기반 이름 대신 `1.jpg`, `2.mp4`처럼 순번형 파일명으로 단순화 | 완료 |
| 2026-04-09 | UI | `useBlogMediaCollector.ts`, `blog-media.vue`에 로컬 저장 기반 복구 로직 추가: 새로고침 후 현재 job 상태와 남은 URL 큐를 이어서 재개 | 완료 |

---

## 3) 파일 반영 위치

### 기능1
- `app/pages/automation/index.vue`
- `app/composables/useArgoOrderConverter.ts`
- `server/api/postcode/lookup.post.ts`

### 기능2
- `crawler/index.js` — Render Express 서버 진입점
- `crawler/lib/job-worker.js` — DB polling 워커 (순차 처리 지원)
- `crawler/lib/naver-parser.js` — Playwright (🌟 원본 고화질 추출 로직 최적화 반영)
- `crawler/lib/supabase-uploader.js` — Supabase Storage 로직
- `server/api/blog/start.post.ts` — job 1건 등록
- `server/api/blog/status/[jobId].get.ts` — 상태 폴링 대상
- `server/api/blog/cleanup/[jobId].post.ts` — 🌟다운로드 즉시 Zip 파일 Storage 자동 영구 삭제 보장
- `app/pages/automation/blog-media.vue` — UI (순차 다운로드 UI 적용 완료)
- `app/composables/useBlogMediaCollector.ts` — 🌟Queue 방식의 진척도 관리 + 자동 다운로드 로직 적용 완료

---

## 4) 남은 작업 (기능2)

### ⚠️ Render 최신 배포 & 최종 테스트
1. 원본 고화질 및 `Deduplication`, `Queue 다운로드` 처리가 반영된 최신 코드를 git에 push.
2. Render 서버가 변경점을 자동 배포한 후 대기.
3. 운영 백오피스(`jhb-backoffice.vercel.app`)에서 `https://blog.naver.com/ghddbwls22/224197291551` 링크 및 다른 예시 링크를 넣고 **자동 다운로드** 및 **스토리지 공간 즉시 비워짐** 테스트.
