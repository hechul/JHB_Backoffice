ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS source_product_name VARCHAR,
  ADD COLUMN IF NOT EXISTS source_option_info VARCHAR;

COMMENT ON COLUMN public.purchases.source_product_name IS
  '스마트스토어 원본 상품명. 대시보드/고객 분석 수량 계산 시 g, n개 등 원문 수량 정보를 복원하는 데 사용';

COMMENT ON COLUMN public.purchases.source_option_info IS
  '스마트스토어 원본 옵션정보. 정규화 option_info와 별도로 원문 옵션 보존';

UPDATE public.purchases
SET
  source_product_name = COALESCE(NULLIF(source_product_name, ''), product_name),
  source_option_info = COALESCE(source_option_info, option_info)
WHERE source_product_name IS NULL
   OR source_product_name = ''
   OR source_option_info IS NULL;
