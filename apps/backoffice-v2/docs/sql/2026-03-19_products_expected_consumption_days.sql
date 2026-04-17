BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS expected_consumption_days INTEGER;

COMMENT ON COLUMN public.products.expected_consumption_days IS
  '상품 예상 소비일. 고객 이탈 위험 판정 시 마지막 구매일 기준으로 사용';

COMMIT;
