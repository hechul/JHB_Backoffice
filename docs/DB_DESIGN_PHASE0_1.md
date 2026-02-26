# DB 설계서 — Phase 0~1

> 작성일: 2026-02-23
> 기준: PRD v5 §4 + 개발 계획서
> 대상: Phase 0 (인프라) + Phase 1 (핵심 파이프라인)
> Supabase 프로젝트: `qvqblzvypwwlmjxetola` (ap-northeast-2)

---

## 0. 설계 방침

### MVP 최소 테이블 전략

핵심 파이프라인(업로드 → 필터링 → 고객 조회)을 동작시키는 데 필요한 테이블을
**Phase 1 필수와 후속으로 명확히 분리**한다.

| 구분 | 테이블 | 이유 |
|------|--------|------|
| **MVP 필수 (5개)** | `profiles`, `products`, `campaigns`, `purchases`, `experiences` | 이것 없으면 파이프라인 자체가 안 됨 |
| **Phase 1 추가 (2개)** | `filter_logs`, `override_logs` | UI(실행 이력/수동 분류 이력)와 동작 정합성 확보 |
| **후속 추가 (3개)** | `filter_jobs`, `customers` View→테이블, `notifications` | 대량 처리/성능/알림 고도화 영역 |

### 후속 테이블별 추가 시점

| 테이블 | 추가 시점 | 사유 |
|--------|----------|------|
| `filter_jobs` | 데이터 5,000건 이상 시 | MVP에서는 동기 처리로 충분. 비동기 polling은 오버엔지니어링 |
| ~~`override_logs`~~ | ~~수동 분류 기능 안정화 후~~ | → **Phase 1로 이동** (UI 정합성 기준) |
| `customers` (테이블) | View가 느려질 때 | 처음엔 View로 시작, 데이터 늘어나면 테이블로 전환 |

### `customers` View (테이블 대신)

customers는 purchases에서 `is_fake = false`이고 `needs_review = false`인 데이터를 집계한 파생 데이터다.
별도 테이블 대신 **View로 시작**하고, 성능이 필요해지면 테이블로 전환한다.

```sql
CREATE VIEW public.customers_summary
WITH (security_invoker = true) AS
SELECT
  customer_key,
  buyer_name,
  buyer_id,
  COUNT(*) AS total_orders,
  MIN(order_date) AS first_order_date,
  MAX(order_date) AS last_order_date,
  (CURRENT_DATE - MAX(order_date)) AS last_order_days,
  CASE
    WHEN (CURRENT_DATE - MAX(order_date)) > 60 THEN true
    ELSE false
  END AS churn_risk
FROM public.purchases
WHERE is_fake = false
  AND needs_review = false
GROUP BY customer_key, buyer_name, buyer_id;
```

> `total_amount` 컬럼은 제거 — purchases에 금액 필드가 없어 소스 데이터가 존재하지 않음.  
> `pet_tag`, `max_stage`, `avg_purchase_cycle`은 products 조인이 필요하므로 고도화 시 확장.
> 월 선택 UI 대응은 `customers_summary_monthly` View로 처리한다.

---

## 1. 테이블 도입 순서

### MVP 필수 (즉시 생성)

| 순서 | Phase | 테이블 | 용도 | 비고 |
|------|-------|--------|------|------|
| 1 | 0 | `profiles` | 사용자 인증/프로필 | Supabase Auth 연동 |
| 2 | 0 | `products` | 상품 마스터 | Soft Delete |
| 3 | 1-1 | `campaigns` | 캠페인 관리 | Soft Delete |
| 4 | 1-1 | `purchases` | 주문 데이터 | 필터링 결과 포함 |
| 5 | 1-1 | `experiences` | 체험단 데이터 | 부분 유니크(아이디 있음/없음 분리) |
| 6 | 1-2 | `filter_logs` | 필터링 실행 이력 | Phase 1 필수 |
| 7 | 1-2 | `override_logs` | 수동 분류 이력 | Phase 1 필수 |
| - | 1-3 | `customers_summary` | 고객 집계 | **View** (테이블 아님) |
| - | 1-3 | `customers_summary_monthly` | 월별 고객 집계 | **View** (테이블 아님) |

### 후속 추가 (파이프라인 안정화 후)

| 테이블 | 용도 | 추가 조건 |
|--------|------|----------|
| `filter_jobs` | 비동기 작업 추적 | 데이터 대량화 시 |
| `customers` (테이블) | 고객 집계 성능 최적화 | View 성능 저하 시 |
| `notifications` | 알림 센터 | Phase 2 |

---

## 2. 마이그레이션 SQL

### 기존 테이블 정리

MCP로 생성된 기존 10개 테이블을 모두 DROP 후 재생성한다.

```sql
-- Migration 001: drop_existing_tables
DROP TABLE IF EXISTS public.override_logs CASCADE;
DROP TABLE IF EXISTS public.filter_logs CASCADE;
DROP TABLE IF EXISTS public.filter_jobs CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.purchases CASCADE;
DROP TABLE IF EXISTS public.experiences CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.campaigns CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP VIEW IF EXISTS public.products_active;
DROP VIEW IF EXISTS public.customers_active;
DROP VIEW IF EXISTS public.campaigns_active;
DROP VIEW IF EXISTS public.customers_summary;
DROP VIEW IF EXISTS public.customers_summary_monthly;
```

---

### Migration 002: `profiles`

```sql
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       VARCHAR NOT NULL,
  full_name   VARCHAR NOT NULL,
  role        VARCHAR NOT NULL DEFAULT 'viewer'
              CHECK (role IN ('admin', 'modifier', 'viewer')),
  status      VARCHAR NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS 정책에서 권한 판별 재귀를 피하기 위한 함수
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
  );
$$;

-- 데이터 수정 권한(admin + modifier)
CREATE OR REPLACE FUNCTION public.can_modify_data()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'modifier')
      AND status = 'active'
  );
$$;

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage profiles"
  ON public.profiles FOR ALL
  USING (public.is_admin());

-- 회원가입 시 프로필 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'viewer',
    'active'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

> **운영 권한 정책(확정)**  
> - 초기 운영 계정은 `admin` 1개, `modifier` 1개를 사용한다.  
> - `modifier`는 데이터 수정 권한은 `admin`과 동일하지만, 계정 초대/권한 변경은 불가하다.  
> - 신규 가입 기본 role은 `viewer`로 생성하고, 승격은 `admin` 계정만 수행한다.

---

### Migration 003: `products`

```sql
CREATE TABLE public.products (
  product_id    VARCHAR PRIMARY KEY,
  product_name  VARCHAR NOT NULL,
  option_name   VARCHAR,
  pet_type      VARCHAR NOT NULL DEFAULT 'BOTH'
                CHECK (pet_type IN ('DOG', 'CAT', 'BOTH')),
  stage         INTEGER CHECK (stage BETWEEN 1 AND 4),
  product_line  VARCHAR,
  deleted_at    TIMESTAMPTZ DEFAULT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_pet_type ON public.products(pet_type);
CREATE INDEX idx_products_deleted_at ON public.products(deleted_at);
CREATE INDEX idx_products_name_option ON public.products(product_name, option_name);

CREATE VIEW public.products_active
WITH (security_invoker = true) AS
  SELECT * FROM public.products WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewers can read active products"
  ON public.products FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      deleted_at IS NULL
      OR public.can_modify_data()
    )
  );

CREATE POLICY "Operators can manage products"
  ON public.products FOR ALL
  USING (public.can_modify_data());
```

---

### Migration 004: `campaigns`

```sql
CREATE TABLE public.campaigns (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR NOT NULL,
  agency      VARCHAR,
  start_date  DATE,
  end_date    DATE,
  budget      DECIMAL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_campaigns_deleted_at ON public.campaigns(deleted_at);

CREATE VIEW public.campaigns_active
WITH (security_invoker = true) AS
  SELECT * FROM public.campaigns WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewers can read active campaigns"
  ON public.campaigns FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      deleted_at IS NULL
      OR public.can_modify_data()
    )
  );

CREATE POLICY "Operators can manage campaigns"
  ON public.campaigns FOR ALL
  USING (public.can_modify_data());
```

---

### Migration 005: `purchases`

```sql
CREATE TABLE public.purchases (
  purchase_id       VARCHAR PRIMARY KEY,
  upload_batch_id   UUID NOT NULL,
  target_month      VARCHAR(7) NOT NULL CHECK (target_month ~ '^\d{4}-\d{2}$'),
  buyer_id          VARCHAR NOT NULL,
  buyer_name        VARCHAR NOT NULL,
  receiver_name     VARCHAR,
  customer_key      VARCHAR NOT NULL,
  product_id        VARCHAR NOT NULL,
  product_name      VARCHAR NOT NULL,
  option_info       VARCHAR,
  quantity          INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  order_date        DATE NOT NULL,
  order_status      VARCHAR NOT NULL,
  claim_status      VARCHAR,
  delivery_type     VARCHAR,
  is_fake           BOOLEAN NOT NULL DEFAULT false,
  match_reason      VARCHAR,
  match_rank        INTEGER CHECK (match_rank BETWEEN 1 AND 5),
  matched_exp_id    INTEGER,
  needs_review      BOOLEAN NOT NULL DEFAULT false,
  is_manual         BOOLEAN NOT NULL DEFAULT false,
  filter_ver        VARCHAR,
  quantity_warning  BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_purchases_customer_key ON public.purchases(customer_key);
CREATE INDEX idx_purchases_product_id ON public.purchases(product_id);
CREATE INDEX idx_purchases_order_date ON public.purchases(order_date);
CREATE INDEX idx_purchases_is_fake ON public.purchases(is_fake);
CREATE INDEX idx_purchases_buyer_id ON public.purchases(buyer_id);
CREATE INDEX idx_purchases_matched_exp ON public.purchases(matched_exp_id);
CREATE INDEX idx_purchases_target_month ON public.purchases(target_month);
CREATE INDEX idx_purchases_upload_batch_id ON public.purchases(upload_batch_id);

-- 복합 인덱스: 월별 실구매 조회 최적화
CREATE INDEX idx_purchases_month_fake_review
  ON public.purchases(target_month, is_fake, needs_review);

-- 필터링 Rank 매칭 최적화 복합 인덱스
CREATE INDEX idx_purchases_filter_match
  ON public.purchases(buyer_id, product_id, order_date)
  WHERE is_fake = false AND is_manual = false AND needs_review = false;

-- 1:1 매칭 무결성: 하나의 experience에 하나의 purchase만 연결
CREATE UNIQUE INDEX idx_purchases_matched_exp_unique
  ON public.purchases(matched_exp_id)
  WHERE matched_exp_id IS NOT NULL;

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER purchases_updated_at
  BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read purchases"
  ON public.purchases FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Operators can manage purchases"
  ON public.purchases FOR ALL
  USING (public.can_modify_data());
```

---

### Migration 006: `experiences`

```sql
CREATE TABLE public.experiences (
  id                    SERIAL PRIMARY KEY,
  upload_batch_id       UUID NOT NULL,
  target_month          VARCHAR(7) NOT NULL CHECK (target_month ~ '^\d{4}-\d{2}$'),
  campaign_id           INTEGER NOT NULL REFERENCES public.campaigns(id),
  mission_product_name  VARCHAR NOT NULL,
  mapped_product_id     VARCHAR,
  option_info           VARCHAR,
  nickname              VARCHAR,
  receiver_name         VARCHAR NOT NULL,
  naver_id              VARCHAR NOT NULL,
  purchase_date         DATE NOT NULL,
  address               VARCHAR,
  phone_last4           VARCHAR(4) CHECK (phone_last4 ~ '^\d{4}$'),
  unmatch_reason        VARCHAR,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_experiences_campaign_id ON public.experiences(campaign_id);
CREATE INDEX idx_experiences_naver_id ON public.experiences(naver_id);
CREATE INDEX idx_experiences_purchase_date ON public.experiences(purchase_date);
CREATE INDEX idx_experiences_mapped_product_id ON public.experiences(mapped_product_id);
CREATE INDEX idx_experiences_target_month ON public.experiences(target_month);
CREATE INDEX idx_experiences_upload_batch_id ON public.experiences(upload_batch_id);

-- 필터링 후보 조회 최적화
CREATE INDEX idx_experiences_filter_match
  ON public.experiences(naver_id, mapped_product_id, purchase_date, campaign_id);

-- 부분 유니크 (아이디 있음/없음 분리)
CREATE UNIQUE INDEX idx_experiences_unique_with_naver
  ON public.experiences (
    campaign_id,
    lower(btrim(naver_id)),
    lower(btrim(mission_product_name)),
    purchase_date
  )
  WHERE nullif(btrim(coalesce(naver_id, '')), '') IS NOT NULL;

CREATE UNIQUE INDEX idx_experiences_unique_without_naver
  ON public.experiences (
    campaign_id,
    lower(btrim(coalesce(receiver_name, ''))),
    lower(btrim(mission_product_name)),
    purchase_date,
    lower(btrim(coalesce(option_info, '')))
  )
  WHERE nullif(btrim(coalesce(naver_id, '')), '') IS NULL;

-- RLS
ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read experiences"
  ON public.experiences FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Operators can manage experiences"
  ON public.experiences FOR ALL
  USING (public.can_modify_data());
```

---

### Migration 007: `customers_summary` View

```sql
CREATE VIEW public.customers_summary
WITH (security_invoker = true) AS
SELECT
  customer_key,
  buyer_name,
  buyer_id,
  COUNT(*) AS total_orders,
  MIN(order_date) AS first_order_date,
  MAX(order_date) AS last_order_date,
  (CURRENT_DATE - MAX(order_date)) AS last_order_days,
  CASE
    WHEN (CURRENT_DATE - MAX(order_date)) > 60 THEN true
    ELSE false
  END AS churn_risk
FROM public.purchases
WHERE is_fake = false
  AND needs_review = false
GROUP BY customer_key, buyer_name, buyer_id;
```

> `security_invoker = true`: View를 호출하는 사용자의 RLS 정책이 적용되어 권한 우회를 방지.

---

### Migration 008: `customers_summary_monthly` View

```sql
CREATE VIEW public.customers_summary_monthly
WITH (security_invoker = true) AS
SELECT
  target_month,
  customer_key,
  buyer_name,
  buyer_id,
  COUNT(*) AS total_orders,
  MIN(order_date) AS first_order_date,
  MAX(order_date) AS last_order_date,
  (CURRENT_DATE - MAX(order_date)) AS last_order_days,
  CASE
    WHEN (CURRENT_DATE - MAX(order_date)) > 60 THEN true
    ELSE false
  END AS churn_risk
FROM public.purchases
WHERE is_fake = false
  AND needs_review = false
GROUP BY target_month, customer_key, buyer_name, buyer_id;
```

---

### Migration 009: `filter_logs` (Phase 1 필수)

```sql
CREATE TABLE public.filter_logs (
  log_id                    SERIAL PRIMARY KEY,
  executed_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_by_account_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  executed_by               VARCHAR NOT NULL,
  filter_ver                VARCHAR NOT NULL,
  target_month              VARCHAR,
  status                    VARCHAR NOT NULL CHECK (status IN ('success', 'error')),
  summary_json              JSONB,
  error_message             TEXT,
  total_purchases_processed INTEGER NOT NULL DEFAULT 0,
  total_exp_processed       INTEGER NOT NULL DEFAULT 0,
  total_matched             INTEGER NOT NULL DEFAULT 0,
  total_unmatched_exp       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_filter_logs_executed_at ON public.filter_logs(executed_at DESC);
CREATE INDEX idx_filter_logs_target_month ON public.filter_logs(target_month);
CREATE INDEX idx_filter_logs_executed_by_account_id ON public.filter_logs(executed_by_account_id);

ALTER TABLE public.filter_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read filter logs"
  ON public.filter_logs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Operators can manage filter logs"
  ON public.filter_logs FOR ALL
  USING (public.can_modify_data());
```

> `executed_by`: 실행 시 팝업에서 입력한 "실제 작업자명" 스냅샷 (공용 계정 환경 대응)
>  
> `executed_by_account_id`: 로그인 계정(`profiles.id`) 추적용

---

### Migration 010: `override_logs` (Phase 1 필수)

```sql
CREATE TABLE public.override_logs (
  log_id              SERIAL PRIMARY KEY,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by_account_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by          VARCHAR NOT NULL,
  purchase_id         VARCHAR NOT NULL,
  action              VARCHAR NOT NULL CHECK (action IN ('fake해제', 'fake지정')),
  prev_is_fake        BOOLEAN NOT NULL,
  new_is_fake         BOOLEAN NOT NULL,
  prev_matched_exp_id INTEGER,
  new_matched_exp_id  INTEGER,
  note                TEXT
);

CREATE INDEX idx_override_logs_changed_at ON public.override_logs(changed_at DESC);
CREATE INDEX idx_override_logs_purchase_id ON public.override_logs(purchase_id);
CREATE INDEX idx_override_logs_changed_by_account_id ON public.override_logs(changed_by_account_id);

ALTER TABLE public.override_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read override logs"
  ON public.override_logs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Operators can manage override logs"
  ON public.override_logs FOR ALL
  USING (public.can_modify_data());
```

> `changed_by`: 판정 변경 시 팝업에서 입력한 "실제 작업자명" 스냅샷
>  
> `changed_by_account_id`: 로그인 계정(`profiles.id`) 추적용

---

## 3. 테이블 관계도 (ERD)

```
┌─────────────┐
│  auth.users │
│  (Supabase) │
└──────┬──────┘
       │ 1:1
       ▼
┌──────────────┐
│   profiles   │
└──────────────┘


┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   products   │◄······│  purchases   │──────►│  experiences │
└──────────────┘ 논리적 └──────────────┘ FK    └──────┬───────┘
                              │                      │
                              │ (집계)                │ campaign_id (FK)
                              ▼                      ▼
                       ┌────────────────┐     ┌──────────────┐
                       │customers_summary│     │  campaigns   │
                       │   (View)       │     └──────────────┘
                       └────────────────┘
```

**FK 관계:**

| 자식 | FK 컬럼 | 부모 | 종류 |
|------|---------|------|------|
| profiles | id | auth.users | 1:1, CASCADE |
| experiences | campaign_id | campaigns | N:1, 하드 FK |
| purchases → products | product_id | products.product_id | 논리적 참조 (FK 미설정) |
| purchases → experiences | matched_exp_id | experiences.id | 논리적 참조 (FK 미설정) |

> **FK 미설정 이유**: purchases가 products보다 먼저 업로드될 수 있어, 적재 순서에 제약이 생기는 것을 방지. 앱 레벨에서 무결성 관리.
> **매칭 단일 소스**: Phase 1에서는 `purchases.matched_exp_id`만을 매칭의 단일 진실 소스로 사용한다.
> (`experiences.is_matched`, `experiences.matched_purchase_id`는 저장하지 않음)

---

## 4. Soft Delete 정책

| 테이블 | Soft Delete | 이유 |
|--------|:-----------:|------|
| products | ✅ | purchases에서 참조, 삭제 시 과거 데이터 조인 깨짐 방지 |
| campaigns | ✅ | experiences에서 참조 |
| purchases | ❌ | 트랜잭션 데이터 — 삭제 허용 안 함 |
| experiences | ❌ | 트랜잭션 데이터 — 삭제 허용 안 함 |

**활성 데이터 View:**

| View | 원본 테이블 |
|------|------------|
| `products_active` | products |
| `campaigns_active` | campaigns |

---

## 5. RLS 정책 요약

| 테이블 | viewer (SELECT) | modifier (SELECT) | modifier (CUD) | admin (CUD) |
|--------|:---------------:|:-----------------:|:--------------:|:-----------:|
| profiles | 전체 | 전체 | ❌ | ✅ |
| products | 활성만 | 전체(삭제 포함) | ✅ | ✅ |
| campaigns | 활성만 | 전체(삭제 포함) | ✅ | ✅ |
| purchases | 전체 | 전체 | ✅ | ✅ |
| experiences | 전체 | 전체 | ✅ | ✅ |
| filter_logs | 전체 | 전체 | ✅ | ✅ |
| override_logs | 전체 | 전체 | ✅ | ✅ |

---

## 6. 인덱스 목록

| 테이블 | 인덱스 | 컬럼 | 비고 |
|--------|--------|------|------|
| products | idx_products_pet_type | pet_type | 필터 |
| products | idx_products_deleted_at | deleted_at | Soft Delete |
| campaigns | idx_campaigns_deleted_at | deleted_at | Soft Delete |
| purchases | idx_purchases_customer_key | customer_key | 고객 조회 |
| purchases | idx_purchases_product_id | product_id | 상품 조인 |
| purchases | idx_purchases_order_date | order_date | 기간 필터 |
| purchases | idx_purchases_is_fake | is_fake | 필터링 결과 |
| purchases | idx_purchases_buyer_id | buyer_id | ID 매칭 |
| purchases | idx_purchases_matched_exp | matched_exp_id | 매칭 조인 |
| purchases | idx_purchases_target_month | target_month | 월 스코프 조회 |
| purchases | idx_purchases_upload_batch_id | upload_batch_id | 배치 롤백/재처리 |
| purchases | idx_purchases_month_fake_review | target_month, is_fake, needs_review | 월별 실구매/검토 조회 (복합) |
| purchases | idx_purchases_filter_match | buyer_id, product_id, order_date | Rank 1 최적화 (partial) |
| purchases | **idx_purchases_matched_exp_unique** | matched_exp_id (NOT NULL) | **1:1 매칭 무결성 (UNIQUE)** |
| experiences | idx_experiences_campaign_id | campaign_id | 캠페인 조인 |
| experiences | idx_experiences_naver_id | naver_id | ID 매칭 |
| experiences | idx_experiences_purchase_date | purchase_date | 날짜 매칭 |
| experiences | idx_experiences_mapped_product_id | mapped_product_id | 상품 매칭 |
| experiences | idx_experiences_target_month | target_month | 월 스코프 조회 |
| experiences | idx_experiences_upload_batch_id | upload_batch_id | 배치 롤백/재처리 |
| experiences | idx_experiences_filter_match | naver_id, mapped_product_id, purchase_date, campaign_id | 필터링 후보 최적화 |
| experiences | **idx_experiences_unique_with_naver** | campaign_id + naver_id + mission_product_name + purchase_date | **아이디 있는 체험단 중복 방지 (UNIQUE, partial)** |
| experiences | **idx_experiences_unique_without_naver** | campaign_id + receiver_name + mission_product_name + purchase_date + option_info | **아이디 없는 체험단 중복 방지 (UNIQUE, partial)** |
| filter_logs | idx_filter_logs_executed_at | executed_at | 최신 실행 이력 정렬 |
| filter_logs | idx_filter_logs_target_month | target_month | 월별 실행 이력 조회 |
| filter_logs | idx_filter_logs_executed_by_account_id | executed_by_account_id | 계정 기준 실행 이력 조회 |
| override_logs | idx_override_logs_changed_at | changed_at | 최신 변경 이력 정렬 |
| override_logs | idx_override_logs_purchase_id | purchase_id | 주문 단위 변경 이력 조회 |
| override_logs | idx_override_logs_changed_by_account_id | changed_by_account_id | 계정 기준 변경 이력 조회 |

---

## 7. 후속 추가 테이블 스키마 (참고용)

파이프라인 안정화 후 필요 시 아래 테이블을 추가한다.

### `filter_jobs` (비동기 처리 필요 시)

```sql
CREATE TABLE public.filter_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status          VARCHAR NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress        INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  target_month    VARCHAR,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  executed_by     UUID NOT NULL REFERENCES public.profiles(id),
  filter_ver      VARCHAR NOT NULL,
  summary_json    JSONB,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `customers` 테이블 (View 성능 저하 시)

```sql
CREATE TABLE public.customers (
  customer_key        VARCHAR PRIMARY KEY,
  buyer_name          VARCHAR NOT NULL,
  buyer_id            VARCHAR NOT NULL,
  pet_tag             VARCHAR DEFAULT 'BOTH' CHECK (pet_tag IN ('DOG', 'CAT', 'BOTH')),
  max_stage           INTEGER CHECK (max_stage BETWEEN 1 AND 4),
  total_orders        INTEGER NOT NULL DEFAULT 0,
  first_order_date    DATE,
  last_order_date     DATE,
  last_order_days     INTEGER,
  avg_purchase_cycle  DECIMAL,
  churn_risk          BOOLEAN NOT NULL DEFAULT false,
  deleted_at          TIMESTAMPTZ DEFAULT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> `total_amount` 컬럼은 제거함 — purchases 테이블에 금액 필드가 없어 소스 데이터 부재.

### `notifications` (알림 센터 고도화 시)

```sql
CREATE TABLE public.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          VARCHAR NOT NULL,
  title         VARCHAR NOT NULL,
  body          TEXT NOT NULL,
  payload_json  JSONB,
  is_read       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 8. 변경 이력

| 버전 | 일자 | 내용 |
|------|------|------|
| v1.0 | 2026-02-23 | Phase 0~1 DB 설계 초안 (9개 테이블) |
| v1.1 | 2026-02-23 | MVP 최소 전략으로 변경 — 핵심 5개 테이블 + customers View, 나머지 4개는 후속 추가 |
| v1.2 | 2026-02-23 | 리뷰 피드백 반영: ①1:1 매칭 UNIQUE INDEX 추가 ②admin→viewer 기본값 변경 ③View security_invoker 추가 ④filter_logs Phase 1 이동 ⑤복합 인덱스 보강 ⑥quantity>0, phone_last4 CHECK 추가 |
| v1.3 | 2026-02-23 | 문서 정합성 통일: ①filter_logs를 Phase 1 메인 마이그레이션으로 고정 ②후속 섹션에서 filter_logs 제거 ③customers_summary 예시 SQL과 본문 SQL 통일(security_invoker) |
| v1.4 | 2026-02-23 | 보안/정합성 반영: ①RLS admin 체크를 is_admin()으로 통일 ②handle_new_user role 기본값 viewer 고정 ③View security_invoker 적용 범위 확대 ④purchases/experiences에 target_month·upload_batch_id·needs_review 반영 ⑤match 단일 소스 오브 트루스(purchases.matched_exp_id)로 정리 ⑥override_logs를 Phase 1 본 마이그레이션으로 확정하고 후속 섹션 정리 |
| v1.5 | 2026-02-23 | 운영 권한/이력 정책 반영: ①role에 modifier 추가(admin/modifier/viewer) ②데이터 수정 권한 함수 can_modify_data() 도입 ③제품/캠페인/주문/체험단/로그 CUD를 admin+modifier로 확장 ④profiles CUD는 admin 전용 유지 ⑤filter_logs/override_logs에 계정ID 추적 컬럼 + 인덱스 추가 ⑥실행/수정 시 실제 작업자명 팝업 입력값을 스냅샷으로 저장하도록 명시 |
| v1.6 | 2026-02-23 | 상품 옵션 단위 운영 반영: ①products.option_name 컬럼 추가 ②`product_name+option_name` 인덱스 추가 ③체험단 업로드 매핑 기준을 상품명 단일에서 상품명+옵션 조합 기준으로 확장 |
