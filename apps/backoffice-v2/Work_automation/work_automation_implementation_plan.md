# Work Automation 구현계획

- 프로젝트: JHBioFarm 백오피스 > 업무 자동화
- 기능 1: 배송지 파일(어떤 양식이든) → 아르고 발주 양식 자동 변환 **[✅ 완료]**
- 기능 2: 네이버 블로그 링크 기반 이미지/동영상 수집 자동화 **[🔧 코드 완료 / Render 배포 대기]**
- 최종 수정: 2026-03-05

---

## 기능 1 — 아르고 발주 변환 ✅ 완료

### 완료된 구현

| 항목 | 상세 |
|------|------|
| 파일 파싱 | `.xlsx / .xls / .csv` 다중 파일 동시 업로드 |
| 소스 자동 감지 | 디너의여왕 / 리뷰노트 / **어떤 양식이든** (컬럼 동의어 기반) |
| 이름·주소·연락처 추출 | 광범위한 컬럼명 동의어 매핑으로 유연한 파싱 |
| 우편번호 보완 | 파일 내 추출 → 카카오 API 조회 순서 |
| 사람별 입력 | 수취인 단위 상품명·수량 직접 입력 |
| 제품코드 매핑 | 15개 품목 코드 하드코딩 |
| 수량 규칙 | 디너의여왕(두부모래 2개, 나머지 1개) / 리뷰노트(전 품목 1개) |
| 다운로드 | 아르고 양식(`국내배송 주문`) 엑셀 생성 |

### 파일 위치

- `app/pages/automation/argo-order.vue`
- `app/composables/useArgoOrderConverter.ts`
- `server/api/postcode/lookup.post.ts`

### 환경변수

| 키 | 위치 | 비고 |
|----|------|------|
| `KAKAO_REST_API_KEY` | Vercel | 우편번호 API (선택, 없으면 파일 내 추출만 사용) |

---

## 기능 2 — 블로그 미디어 수집 🔧 코드 완료 / Render 배포 대기

### 아키텍처 — DB Pull 패턴 (Playwright + Render + Supabase)

```
[사용자] URL 입력 (최대 10개) → "수집 시작" 클릭
    ↓
[Vercel 함수 /api/blog/start]
  ① DB에 job 등록 (status: 'pending', urls 배열 저장)
  ② Render /ping에 wake-up 신호 전송 (timeout 2초, 응답 무관)
  ③ job_id 즉시 반환 (< 3초) → Vercel 10초 제약 완전 회피
    ↓
[Render 크롤러 — 5초마다 DB 폴링]
  ① pending job 발견 → status: 'running' 업데이트
  ② Playwright로 블로그 렌더링 → 이미지/동영상 URL 추출
  ③ 이미지 다운로드 → ZIP 생성
  ④ Supabase Storage에 ZIP 업로드 (24시간 서명 URL 발급)
  ⑤ status: 'done' / 'partial' / 'failed' 업데이트
    ↓
[프론트 — 3초마다 폴링]
  pending → running → done 상태 감지
    ↓
[사용자] ZIP 다운로드 버튼 클릭
```

> **왜 DB Pull 패턴인가?**  
> Vercel 서버리스는 Response 반환 즉시 프로세스가 종료되므로 fire-and-forget이 불가능합니다.  
> Render 크롤러가 DB를 직접 폴링하면 이 제약을 완전히 우회할 수 있습니다.

### 무료 플랜 제약

| 서비스 | 플랜 | 제약 |
|--------|------|------|
| Vercel | 무료 | 함수 실행 최대 **10초** |
| Supabase | 무료 | Storage **1GB** (24시간 후 자동 삭제 정책) |
| **Render** | **무료** | RAM 512MB, 15분 비활성 시 슬립, **월 750시간 무료** |

### 처리 한계 정책

| 항목 | 한계값 |
|------|--------|
| 1회 최대 URL | **10개** |
| URL당 최대 이미지 | **30개** |
| Render 처리 타임아웃 | **120초** |
| ZIP 보관 기간 | **24시간** |
| 동영상 수집 | best-effort (네이버 플레이어 특성상 추출 불가 케이스 다수) |

### Cold Start 대응

Render 무료 플랜은 15분 비활성 시 슬립됩니다.

- Vercel 함수가 job 등록 후 `/ping`으로 Render를 깨움
- 슬립 → 완전 실행까지 **40~60초** 소요
- 프론트에서 `pending` 상태 동안 "서버 준비 중 (최대 90초)..." 안내 표시

### 구현 완료된 파일

#### Vercel 프로젝트
| 파일 | 역할 |
|------|------|
| `server/api/blog/start.post.ts` | URL 검증 → job DB 등록 → Render ping → job_id 즉시 반환 |
| `server/api/blog/status/[jobId].get.ts` | 프론트 폴링용 job 상태 조회 |
| `app/pages/automation/blog-media.vue` | URL 입력 / 진행 상태 / ZIP 다운로드 / 실패 재시도 UI |
| `app/composables/useBlogMediaCollector.ts` | job 등록 → 3초 폴링 → 완료 감지 흐름 제어 |

#### Render 크롤러 (`crawler/` 폴더)
| 파일 | 역할 |
|------|------|
| `index.js` | Express 서버 + DB 폴링 워커 시작 |
| `lib/job-worker.js` | 5초 간격 pending job 감지 → 크롤링 실행 |
| `lib/naver-parser.js` | Playwright Chromium으로 블로그 렌더링 → 이미지/동영상 URL 추출 |
| `lib/zipper.js` | 이미지 다운로드 → ZIP Buffer 생성 (파일명: `블로그ID_포스트번호_001.jpg`) |
| `lib/supabase-uploader.js` | Supabase Storage 업로드 → 24시간 서명 URL 반환 |
| `routes/ping.js` | GET /ping 헬스체크 (Render 슬립 해제용) |
| `Dockerfile` | `mcr.microsoft.com/playwright:v1.40.0-jammy` 베이스 |
| `render.yaml` | Render 배포 설정 |

#### Supabase DB
```sql
automation_jobs
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
  job_type      text DEFAULT 'blog_media'
  created_by    uuid REFERENCES profiles(id)
  status        text  -- 'pending' | 'running' | 'done' | 'partial' | 'failed'
  total_urls    int
  success_count int
  fail_count    int
  storage_path  text        -- ZIP 파일 경로
  download_url  text        -- 서명된 다운로드 URL (24시간)
  expires_at    timestamptz
  summary_json  jsonb       -- urls 배열 + failures 배열
  completed_at  timestamptz
  created_at    timestamptz DEFAULT now()
```

### 환경변수

| 키 | 위치 | 비고 |
|----|------|------|
| `CRAWLER_SERVER_URL` | Vercel | Render 서버 URL |
| `SUPABASE_URL` | Render | `https://qvqblzvypwwlmjxetola.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Render | service_role 키 (RLS 우회) |

### ⚠️ 남은 작업 — Render 배포 (수동)

1. `crawler/` 폴더를 GitHub 레포로 push
2. [render.com](https://render.com) > New Web Service > GitHub 연결 > Dockerfile 자동 감지
3. Render 환경변수 설정 (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`)
4. Render 배포 완료 후 URL 확인 (예: `https://jhb-blog-crawler.onrender.com`)
5. Vercel 환경변수에 `CRAWLER_SERVER_URL` 추가 → 재배포

### Phase F — 운영 기능 (선택적 후속)

- Job 이력 목록 UI (`/automation/blog-media` 하단 섹션)
- Storage 만료 파일 자동 삭제 (Render cron 또는 Supabase Edge Function)
- URL 20개 초과 대량 처리 방안 (분할 처리)
