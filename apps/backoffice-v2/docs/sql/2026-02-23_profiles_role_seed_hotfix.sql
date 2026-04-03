BEGIN;

-- 하위 호환: status 컬럼이 없는 경우 생성
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'active';

-- 운영 계정 role 보정 (실제 이메일 기준으로 수정해서 실행)
UPDATE public.profiles
SET role = 'admin', status = 'active'
WHERE lower(email) = 'admin@jhbiofarm.co.kr';

-- 대표 계정 이메일로 교체 후 사용
-- UPDATE public.profiles
-- SET role = 'modifier', status = 'active'
-- WHERE lower(email) = 'ceo@jhbiofarm.co.kr';

COMMIT;
