-- 2026-03-09
-- 회원가입 자동 승인 + 기본 역할 modifier 전환
-- 목적:
-- 1) 신규 가입 즉시 active 상태로 생성
-- 2) 신규 가입 기본 role을 modifier로 설정

begin;

alter table public.profiles
  alter column status set default 'active';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, status, created_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'modifier',
    'active',
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role = coalesce(public.profiles.role, 'modifier'),
    status = coalesce(public.profiles.status, 'active');

  return new;
end;
$$;

update public.profiles
set status = 'active'
where status = 'pending';

update public.profiles
set role = 'modifier'
where role is null;

commit;
