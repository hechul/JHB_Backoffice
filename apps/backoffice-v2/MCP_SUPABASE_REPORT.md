# Antigravity IDE × Supabase MCP 연동 보고서

> **작성일**: 2026-02-13  
> **프로젝트**: JHB 백오피스 (smartstore_purchase)  
> **도구**: Antigravity IDE + Supabase MCP Server

---

## 1. 개요

Antigravity IDE에 내장된 AI 코딩 에이전트가 **MCP(Model Context Protocol)** 를 통해 Supabase 데이터베이스에 직접 접속하여, 테이블 생성·RLS 정책 설정·스키마 검증 등의 작업을 자동 수행할 수 있는지 검증하였다.

### MCP란?

MCP(Model Context Protocol)는 AI 시스템이 외부 툴·데이터와 표준화된 방식으로 통신하기 위한 프로토콜이다. Supabase에서 공식 MCP 서버(`@supabase/mcp-server-supabase`)를 제공하며, 이를 통해 AI 에이전트가 별도의 대시보드 접근 없이 DB 스키마 관리, 데이터 조작, 보안 점검까지 수행할 수 있다.

---

## 2. 환경 설정

### 2.1 MCP 서버 설정 파일

**경로**: `~/.gemini/antigravity/mcp_config.json`

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "<Personal Access Token>",
        "SUPABASE_PROJECT_REF": "qvqblzvypwwlmjxetola"
      }
    }
  }
}
```

### 2.2 인증 방식

| 항목 | 값 |
|------|-----|
| 인증 키 | Supabase Personal Access Token (PAT) |
| 프로젝트 | JHB_BackOffice (`qvqblzvypwwlmjxetola`) |
| 리전 | ap-northeast-2 (서울) |

> **참고**: Service Role Key가 아닌 **PAT(Personal Access Token)** 을 사용해야 MCP 서버가 정상 작동한다.

---

## 3. 사용 가능한 MCP 도구

AI 에이전트가 MCP를 통해 호출할 수 있는 주요 도구:

| 도구 | 용도 | 비고 |
|------|------|------|
| `apply_migration` | 테이블 생성, RLS 정책 등 DDL 실행 | 마이그레이션 이력 자동 관리 |
| `execute_sql` | 데이터 조회/삽입/수정 (DML) | 이력 관리 없음 |
| `list_tables` | 현재 테이블 목록 조회 | 스키마별 조회 가능 |
| `list_migrations` | 적용된 마이그레이션 이력 | 버전+이름으로 추적 |
| `get_advisors` | 보안/성능 경고 확인 | RLS 누락 등 자동 감지 |
| `generate_typescript_types` | 현재 스키마 기반 TS 타입 생성 | 프론트엔드 연동용 |
| `list_projects` | 접근 가능한 프로젝트 목록 | — |
| `deploy_edge_function` | Edge Function 배포 | 서버리스 함수 |

---

## 4. 실행 과정

### 4.1 초기 상태 확인

```
도구: list_tables(project_id, schemas=["public"])
결과: [] (테이블 없음)

도구: list_migrations(project_id)
결과: [] (마이그레이션 없음)
```

### 4.2 테이블 생성 (apply_migration)

PRD v5 기준 **10개 테이블**을 순차적으로 생성하였다.

#### ① profiles (관리자 계정)

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR NOT NULL,
  full_name VARCHAR NOT NULL,
  role VARCHAR NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin', 'viewer')),
  status VARCHAR NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

```
도구: apply_migration(name="create_profiles", query=위 SQL)
결과: { "success": true }
```

#### ② campaigns (체험단 캠페인)

```sql
CREATE TABLE public.campaigns (
  id SERIAL PRIMARY KEY,
  campaign_name VARCHAR NOT NULL,
  platform VARCHAR,
  agency VARCHAR,
  start_date DATE,
  end_date DATE,
  budget DECIMAL,           -- 피드백 반영: INTEGER → DECIMAL
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### ③~⑩ 나머지 테이블

동일한 방식으로 아래 테이블들을 순차 생성:

| # | 테이블 | 주요 특징 |
|---|--------|----------|
| ③ | `products` | CHECK(pet_type, growth_stage) |
| ④ | `customers` | buyer_id UNIQUE |
| ⑤ | `purchases` | 인덱스 4개, FK→products, customers |
| ⑥ | `experiences` | 인덱스 3개, FK→campaigns |
| ⑦ | `filter_logs` | 필터링 실행 이력 |
| ⑧ | `override_logs` | 수동 분류 변경 이력 |
| ⑨ | `notifications` | 알림 센터 (피드백 반영으로 신규 추가) |
| ⑩ | `filter_jobs` | 비동기 작업 추적 (피드백 반영으로 신규 추가) |

**모든 테이블 생성 결과**: `{ "success": true }`

### 4.3 RLS 정책 설정 (테이블 생성과 동시에 적용)

각 테이블 생성 시 아래 보안 정책을 함께 적용하였다:

```sql
-- 1) RLS 활성화
ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;

-- 2) 읽기 정책: 로그인한 사용자만
CREATE POLICY "Authenticated users can read {table}"
  ON public.{table} FOR SELECT
  USING (auth.role() = 'authenticated');

-- 3) 관리 정책: admin만 CUD 가능
CREATE POLICY "Admins can manage {table}"
  ON public.{table} FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

`notifications` 테이블은 별도로 **자기 알림만 조회/수정 가능** 정책 적용:

```sql
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);
```

### 4.4 결과 검증

#### 테이블 목록 확인

```
도구: list_tables(project_id, schemas=["public"])
결과: 10개 테이블 전부 확인 (모두 rls_enabled: true)
```

#### 마이그레이션 이력 확인

```
도구: list_migrations(project_id)
결과:
  20260213_001  create_profiles
  20260213_002  create_campaigns
  20260213_003  create_products
  20260213_004  create_customers
  20260213_005  create_purchases
  20260213_006  create_experiences
  20260213_007  create_filter_logs
  20260213_008  create_override_logs
  20260213_009  create_notifications
  20260213_010  create_filter_jobs
```

#### 보안 점검

```
도구: get_advisors(project_id, type="security")
결과: { "lints": [] }   ← 경고 0건 (모든 테이블 RLS 정상)
```

---

## 5. 핵심 결론

### ✅ 검증 완료 사항

| 항목 | 결과 |
|------|------|
| MCP 서버 연결 | ✅ 정상 |
| 테이블 생성 (DDL) | ✅ 10개 테이블 전부 성공 |
| FK 관계 설정 | ✅ 6개 외래키 정상 |
| CHECK 제약 조건 | ✅ role, status, pet_type 등 적용 |
| 인덱스 생성 | ✅ 7개 인덱스 생성 |
| RLS 정책 설정 | ✅ 모든 테이블 적용 완료 |
| 마이그레이션 이력 관리 | ✅ 10개 마이그레이션 기록 |
| 보안 점검 (Advisors) | ✅ 경고 0건 |

### 💡 장점

1. **Supabase 대시보드 접속 불필요** — IDE 내에서 AI 에이전트가 직접 DB 스키마 관리
2. **마이그레이션 이력 자동 관리** — 변경 이력 추적, 롤백 가능
3. **보안 자동 점검** — RLS 누락 등 보안 이슈 자동 감지
4. **PRD → DB 스키마 자동 변환** — PRD 문서를 읽고 SQL로 변환하여 즉시 적용
5. **TypeScript 타입 자동 생성** — 프론트엔드 연동 시 타입 안정성 확보

### ⚠️ 참고 사항

- DB 스키마 변경 시 새로운 `apply_migration`으로 `ALTER TABLE` 실행 (기존 마이그레이션은 수정 불가)
- 현재 생성된 스키마는 **테스트 목적**이며, 실제 운영 시 스키마 조정이 필요할 수 있음
- 데이터 삽입/조회는 `execute_sql`로 별도 수행

---

## 6. 향후 계획

1. **프론트엔드 연동**: `generate_typescript_types`로 TS 타입 생성 → Nuxt.js 앱과 Supabase 클라이언트 연동
2. **Edge Function 배포**: 체험단 필터링 로직을 Supabase Edge Function으로 배포 (`deploy_edge_function`)
3. **실 데이터 적재**: 엑셀 업로드 기능 구현 후 `purchases`, `experiences` 테이블에 데이터 적재
4. **스키마 고도화**: 운영 요구사항에 따라 `apply_migration`으로 점진적 스키마 변경
