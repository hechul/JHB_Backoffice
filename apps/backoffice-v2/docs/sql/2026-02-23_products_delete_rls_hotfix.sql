BEGIN;

-- 하위 호환: 예전 스키마에 status/role 제약이 누락된 경우 보강
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'active';

UPDATE public.profiles
SET status = 'active'
WHERE status IS NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'modifier', 'viewer'));

-- admin/modifier 데이터 수정 권한 함수 보장
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
      AND COALESCE(status, 'active') = 'active'
  );
$$;

-- products RLS 재정의 (Soft Delete update 허용)
DROP POLICY IF EXISTS "Viewers can read active products" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Operators can manage products" ON public.products;

CREATE POLICY "Viewers can read active products"
  ON public.products
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      deleted_at IS NULL
      OR public.can_modify_data()
    )
  );

CREATE POLICY "Operators can manage products"
  ON public.products
  FOR ALL
  USING (public.can_modify_data())
  WITH CHECK (public.can_modify_data());

COMMIT;
