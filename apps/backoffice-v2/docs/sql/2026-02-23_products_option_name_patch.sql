BEGIN;

-- 상품을 옵션 단위로 관리하기 위한 컬럼
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS option_name VARCHAR;

-- 상품명 + 옵션 조합 조회 최적화
CREATE INDEX IF NOT EXISTS idx_products_name_option
  ON public.products(product_name, option_name);

COMMIT;
