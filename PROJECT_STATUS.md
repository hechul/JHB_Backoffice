# JHBioFarm 백오피스 — 프로젝트 작업 현황

## 프로젝트 개요

스마트스토어 주문 데이터에서 실구매자와 체험단을 분류하는 백오피스 시스템.  
Nuxt 4 + Supabase 기반이며, 현재 **Phase 1 핵심 기능(업로드/필터링/고객분석/로그/상품관리)이 실데이터로 동작**하는 상태.

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

### 3. 페이지 (실데이터 연동 기준)

| 페이지 | 파일 | 주요 기능 |
|--------|------|----------|
| **홈** | `pages/index.vue` | 백오피스 진입 허브 |
| **대시보드** | `pages/dashboard.vue` | 대표용 요약 화면(현재 mock/준비중 상태 유지) |
| **업로드** | `pages/upload.vue` | 통합 엑셀(주문+체험단) 파싱/검증/DB 적재/상품 매핑 |
| **필터링** | `pages/filter.vue` | 5단계 자동 매칭, 확인 필요 큐, 수동 확정, 결과 다운로드 |
| **고객 분석** | `pages/customers.vue` | 실구매 고객만 조회, 필터/검색/상세/엑셀 다운로드 |
| **실행 이력** | `pages/logs.vue` | 필터링 실행 이력 + 수동 변경 이력 |
| **상품 목록** | `pages/products.vue` | 상품 등록/수정/삭제(Soft delete), 옵션 단위 관리 |

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
- Supabase 프로젝트: **JHB_BackOffice** (`qvqblzvypwwlmjxetola`, ap-northeast-2)
- public 스키마: Phase 1 테이블 운영 중 (`profiles`, `purchases`, `experiences`, `products`, `campaigns`, `filter_logs`, `override_logs`)

### 6. 안정화 보강 (2026-02-27)
- `/upload` 상품 매핑 반영 범위 확장: `purchases`뿐 아니라 `experiences.mapped_product_id`까지 동시 반영
- `/upload` 매핑 성공 판정 강화: 실제 업데이트 건수(주문/체험단)를 검증하고 0건 반영은 실패 처리
- `/upload` 업로드 롤백 보강: 주문/체험단 적재 중 실패 시 자동 복구(부분 반영 상태 최소화)
- `/filter` 실행 롤백 보강: 필터 실행 중간 실패 시 이전 판정 상태(`purchases`, `experiences.unmatch_reason`) 자동 복구
- 월 선택기 최적화: `purchases` 전체 행 스캔 방식 제거, 월 단위 count 조회 방식으로 변경

---

## 아직 안 된 것 (다음 단계)

### 🔴 최우선: 운영 품질 고도화
- 대시보드 실데이터 전환(현재는 mock/준비중 유지)
- 월 선택기 정책 확정(누적 월 노출/보관 기간)

### 🟡 PRD 갭
- `prd_gap_analysis.md` 참고 (20개 갭 식별됨)
- 주요: 체험단 검색 패널, 업로드 요약 강화, 동시성 제어 UI
- 상세 내용: `/Users/huicheol/.gemini/antigravity/brain/4ad021c9-c22d-4183-90ef-c9fc66e12542/prd_gap_analysis.md`

### 🟢 운영 품질
- 로딩 상태(스켈레톤) 보강
- URL 쿼리 파라미터 동기화 보강
- API 에러 핸들링/재시도 UX 보강

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
│   └── pages/                        ← 핵심 화면 구현
└── prd_smartstore_v5.md              ← PRD 문서

# MCP 설정 (글로벌)
~/.gemini/antigravity/mcp_config.json  ← 안티그래비티 MCP 서버 설정
```

---

## 기술 스택
- **프레임워크**: Nuxt 4 + TypeScript
- **백엔드**: Supabase (연동 완료, Phase 1 운영)
- **아이콘**: lucide-vue-next
- **차트**: chart.js
