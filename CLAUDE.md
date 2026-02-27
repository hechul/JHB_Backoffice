# 프로젝트 컨텍스트 — JHBioFarm 백오피스

## 프로젝트 요약
스마트스토어 주문 데이터에서 체험단(fake_purchase)을 1:1 소거하고 실구매(real_purchase)를 식별하는 백오피스 시스템.
Nuxt 3 + TypeScript + Supabase (ap-northeast-2).

## 현재 상태
- UI/UX 9개 화면 mock 구현 완료
- PRD v5 확정
- 스토리보드 완료 (Figma + MD)
- 개발 계획서 작성 완료
- DB 테이블 10개 MCP로 생성됨 (재설계 예정)
- 실 데이터 연동 미착수

## 다음 단계
DB 설계 (개발 계획서 Phase 0부터)

## 필수 읽기 파일

| 순서 | 파일 | 내용 |
|------|------|------|
| 1 | `docs/DEVELOPMENT_PLAN.md` | 개발 계획서 — Phase 구조, 우선순위, 완료 기준 |
| 2 | `prd_smartstore_v5.md` | PRD — 비즈니스 로직, DB 스키마, 필터링 알고리즘 |
| 3 | `STORYBOARD_SMARTSTORE_V5.md` | 스토리보드 — 화면별 상태/액션/데이터/예외 |
| 4 | `MCP_SUPABASE_REPORT.md` | Supabase 현황 — 생성된 테이블, RLS, 마이그레이션 |
| 5 | `PROJECT_STATUS.md` | 프로젝트 작업 현황 |

## 참고 파일

| 파일 | 내용 |
|------|------|
| `UI_UX_SCREEN_COMPOSITION_V5.md` | 화면 구성안 (SC-001~009) |
| `UI_FEATURE_ANALYSIS.md` | 기능 분석 (V1 필수/제외/추가 분류) |
| `gpt_log.md` | GPT 대화 기록 (스토리보드 작업 과정) |
| `docs/storyboard.md` | 스토리보드 뼈대 (Figma 작업용) |

## 핵심 개발 방침
뼈대를 먼저 세우고 살을 붙인다:
1. Phase 0: 로그인 + 상품 (인프라)
2. Phase 1: 업로드 → 필터링 → 고객 조회 (최소 동작)
3. Phase 2: 대시보드 + 이력 (같은 화면에 기능 추가)
4. Phase 3: 계정 관리 + 고도화

## 기술 스택
- 프레임워크: Nuxt 3 + TypeScript
- 백엔드: Supabase (Auth, DB, Edge Functions)
- 아이콘: lucide-vue-next
- 차트: chart.js
- Supabase 프로젝트: qvqblzvypwwlmjxetola (ap-northeast-2)
