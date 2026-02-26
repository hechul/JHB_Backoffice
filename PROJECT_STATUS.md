# JHBioFarm 백오피스 — 프로젝트 작업 현황

## 프로젝트 개요

스마트스토어 주문 데이터에서 실구매자와 체험단을 분류하는 백오피스 시스템.  
Nuxt 3 + Supabase 기반이며, 현재 **프론트엔드 UI가 완성**된 상태.

---

## 완료된 작업

### 1. 디자인 시스템 구축
- `app/assets/css/main.css` — CSS 변수, 유틸리티, 컴포넌트 스타일 정의
- 공통 컴포넌트 9개 생성:
  - `ToastContainer`, `SlidePanel`, `EmptyState`, `StepIndicator`
  - `ConfirmModal`, `SearchInput`, `Tooltip`, `KpiCard`, `StatusBadge`

### 2. 레이아웃
- `app/layouts/default.vue` — 사이드바(접기/펼치기, 모바일 반응형), 헤더(브레드크럼, 기간 선택기)
- `app/layouts/home.vue` — **[NEW]** 사이드바 없는 홈 전용 레이아웃

### 3. 페이지 (모두 mock 데이터)

| 페이지 | 파일 | 주요 기능 |
|--------|------|----------|
| **홈** | `pages/index.vue` | 모듈 카드 그리드 (매출분석/상품관리/주문관리/설정) |
| **대시보드** | `pages/dashboard.vue` | 파이프라인 상태바, KPI 카드, 차트, 이탈위험 고객 |
| **업로드** | `pages/upload.vue` | 드래그앤드롭, 파일 검증, 업로드 프로그레스, 수동 매핑 |
| **필터링** | `pages/filter.vue` | 실행 확인 모달, 진행바, 탭별 결과, SlidePanel 상세 |
| **고객 조회** | `pages/customers.vue` | 다중 필터, 검색, 고객 상세 Drawer |
| **실행 이력** | `pages/logs.vue` | 필터/수동분류 로그, 확장 가능 상세 |

### 4. 네비게이션 구조
```
/ (홈, home 레이아웃) → 매출 분석 카드 클릭
  └─ /dashboard (default 레이아웃 + 사이드바)
  └─ /upload
  └─ /filter
  └─ /customers
  └─ /logs
  └─ 사이드바 "홈으로" → / 복귀
```

### 5. MCP + Supabase 연결 설정
- `~/.gemini/antigravity/mcp_config.json` — 안티그래비티 MCP 서버 설정 완료
- MCP 연결 테스트 완료 (2026-02-13): 프로젝트 목록 조회 및 DB 접근 확인됨
- 프로젝트 내 `.gemini/settings.json`은 삭제됨 (글로벌 경로로 이전)
- Supabase 프로젝트: **JHB_BackOffice** (`qvqblzvypwwlmjxetola`, ap-northeast-2, ACTIVE_HEALTHY)
- public 스키마 테이블: 아직 없음 (스키마 생성 필요)

---

## 아직 안 된 것 (다음 단계)

### 🔴 최우선: 백엔드 연동
- **모든 페이지가 mock 데이터** → Supabase 실제 데이터로 교체 필요
- ✅ MCP 연결 완료 → DB 스키마 생성 후 연동 시작

### 🟡 PRD 갭
- `prd_gap_analysis.md` 참고 (20개 갭 식별됨)
- 주요: 체험단 검색 패널, 업로드 요약 강화, 동시성 제어 UI
- 상세 내용: `/Users/huicheol/.gemini/antigravity/brain/4ad021c9-c22d-4183-90ef-c9fc66e12542/prd_gap_analysis.md`

### 🟢 운영 품질
- 로딩 상태 (스켈레톤), 페이지네이션, 테이블 정렬
- URL 쿼리 파라미터 연동, API 에러 핸들링

---

## 주요 파일 위치

```
smartstore_purchase/
├── app/
│   ├── assets/css/main.css          ← 디자인 시스템
│   ├── components/                   ← 공통 컴포넌트 9개
│   ├── composables/useToast.ts       ← 토스트 상태관리
│   ├── layouts/
│   │   ├── default.vue               ← 사이드바 레이아웃
│   │   └── home.vue                  ← 홈 전용 레이아웃
│   └── pages/                        ← 6개 페이지
└── prd_smartstore_v4.md              ← PRD 문서

# MCP 설정 (글로벌)
~/.gemini/antigravity/mcp_config.json  ← 안티그래비티 MCP 서버 설정
```

---

## 기술 스택
- **프레임워크**: Nuxt 3 + TypeScript
- **백엔드**: Supabase (연동 예정)
- **아이콘**: lucide-vue-next
- **차트**: chart.js
