BEGIN;

-- 0) 하위 호환: status 컬럼이 없는 오래된 스키마 보강
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'active';

-- 1) 현재 역할 상태 확인
SELECT id, email, role, status, created_at
FROM public.profiles
ORDER BY created_at DESC;

-- 2) 운영 계정 role 보정 (이메일은 실제 계정에 맞게 수정)
UPDATE public.profiles
SET role = 'admin', status = 'active'
WHERE lower(email) = 'admin@jhbiofarm.co.kr';

UPDATE public.profiles
SET role = 'modifier', status = 'active'
WHERE lower(email) = 'modifier@jhbiofarm.co.kr';

COMMIT;
