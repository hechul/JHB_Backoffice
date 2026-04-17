BEGIN;

-- ------------------------------------------------------------------
-- 1) profiles.role 확장: admin/modifier/viewer
-- ------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'modifier', 'viewer'));

-- ------------------------------------------------------------------
-- 2) 권한 함수 추가: 데이터 수정 권한(admin + modifier)
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- 3) RLS 정책 재정의
--    - profiles: admin만 CUD
--    - data tables: admin + modifier CUD
-- ------------------------------------------------------------------

-- products
DROP POLICY IF EXISTS "Viewers can read active products" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Operators can manage products" ON public.products;

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

-- campaigns
DROP POLICY IF EXISTS "Viewers can read active campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Admins can manage campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Operators can manage campaigns" ON public.campaigns;

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

-- purchases
DROP POLICY IF EXISTS "Admins can manage purchases" ON public.purchases;
DROP POLICY IF EXISTS "Operators can manage purchases" ON public.purchases;

CREATE POLICY "Operators can manage purchases"
  ON public.purchases FOR ALL
  USING (public.can_modify_data());

-- experiences
DROP POLICY IF EXISTS "Admins can manage experiences" ON public.experiences;
DROP POLICY IF EXISTS "Operators can manage experiences" ON public.experiences;

CREATE POLICY "Operators can manage experiences"
  ON public.experiences FOR ALL
  USING (public.can_modify_data());

-- filter_logs
DROP POLICY IF EXISTS "Admins can manage filter logs" ON public.filter_logs;
DROP POLICY IF EXISTS "Operators can manage filter logs" ON public.filter_logs;

CREATE POLICY "Operators can manage filter logs"
  ON public.filter_logs FOR ALL
  USING (public.can_modify_data());

-- override_logs
DROP POLICY IF EXISTS "Admins can manage override logs" ON public.override_logs;
DROP POLICY IF EXISTS "Operators can manage override logs" ON public.override_logs;

CREATE POLICY "Operators can manage override logs"
  ON public.override_logs FOR ALL
  USING (public.can_modify_data());

-- ------------------------------------------------------------------
-- 4) 실행/변경 이력: 계정 ID + 실제 작업자명 분리 추적
-- ------------------------------------------------------------------
ALTER TABLE public.filter_logs
  ADD COLUMN IF NOT EXISTS executed_by_account_id UUID
  REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.override_logs
  ADD COLUMN IF NOT EXISTS changed_by_account_id UUID
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_filter_logs_executed_at
  ON public.filter_logs(executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_filter_logs_target_month
  ON public.filter_logs(target_month);

CREATE INDEX IF NOT EXISTS idx_filter_logs_executed_by_account_id
  ON public.filter_logs(executed_by_account_id);

CREATE INDEX IF NOT EXISTS idx_override_logs_changed_at
  ON public.override_logs(changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_override_logs_purchase_id
  ON public.override_logs(purchase_id);

CREATE INDEX IF NOT EXISTS idx_override_logs_changed_by_account_id
  ON public.override_logs(changed_by_account_id);

-- ------------------------------------------------------------------
-- 5) (선택) 초기 운영 계정 role 지정 예시
--    실제 이메일에 맞게 수정 후 사용
-- ------------------------------------------------------------------
-- UPDATE public.profiles SET role = 'admin'    WHERE email = 'admin@your-company.com';
-- UPDATE public.profiles SET role = 'modifier' WHERE email = 'ceo@your-company.com';

COMMIT;
