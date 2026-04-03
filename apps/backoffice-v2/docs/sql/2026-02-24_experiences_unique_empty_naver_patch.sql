-- 2026-02-24
-- 목적:
-- 1) 체험단 아이디(naver_id) 공백 행도 적재 가능하도록 유니크 기준 분리
-- 2) 아이디 있음/없음 각각에 맞는 중복 방지 정책 적용
--
-- 적용 전 권장:
-- - 운영 시간 외 실행
-- - experiences 백업 스냅샷 확보

BEGIN;

-- 1) 기존 단일 유니크 제약 제거 (campaign_id + naver_id + mission_product_name + purchase_date)
ALTER TABLE public.experiences
  DROP CONSTRAINT IF EXISTS experiences_campaign_id_naver_id_mission_product_name_purchase_date_key;

-- 2) 새 유니크 인덱스 생성 전, 정책 기준으로 기존 중복 정리
-- 2-1) naver_id가 있는 행: 기존과 유사하게 campaign + naver_id + 상품명 + 구매일 기준
WITH ranked_with_naver AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        campaign_id,
        lower(btrim(coalesce(naver_id, ''))),
        lower(btrim(mission_product_name)),
        purchase_date
      ORDER BY id
    ) AS rn
  FROM public.experiences
  WHERE nullif(btrim(coalesce(naver_id, '')), '') IS NOT NULL
)
DELETE FROM public.experiences e
USING ranked_with_naver r
WHERE e.id = r.id
  AND r.rn > 1;

-- 2-2) naver_id가 비어 있는 행: campaign + 수취인 + 상품명 + 구매일 + 옵션 기준
WITH ranked_without_naver AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        campaign_id,
        lower(btrim(coalesce(receiver_name, ''))),
        lower(btrim(mission_product_name)),
        purchase_date,
        lower(btrim(coalesce(option_info, '')))
      ORDER BY id
    ) AS rn
  FROM public.experiences
  WHERE nullif(btrim(coalesce(naver_id, '')), '') IS NULL
)
DELETE FROM public.experiences e
USING ranked_without_naver r
WHERE e.id = r.id
  AND r.rn > 1;

-- 3) 부분 유니크 인덱스(아이디 있음/없음 분리) 재생성
DROP INDEX IF EXISTS public.idx_experiences_unique_with_naver;
DROP INDEX IF EXISTS public.idx_experiences_unique_without_naver;

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

COMMIT;

