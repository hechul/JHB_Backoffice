-- 2026-03-05
-- 회원가입 승인 플로우용 profiles 상태/트리거 패치
-- 목적:
-- 1) profiles.status 값 확장 (pending/active/rejected/inactive)
-- 2) 신규 가입 기본값 role='viewer', status='pending'

begin;

alter table public.profiles
  add column if not exists status text;

update public.profiles
set status = 'active'
where status is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles drop constraint profiles_status_check;
  end if;
end
$$;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('pending', 'active', 'rejected', 'inactive'));

alter table public.profiles
  alter column status set default 'pending';

alter table public.profiles
  alter column status set not null;

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
    'viewer',
    'pending',
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role = coalesce(public.profiles.role, 'viewer'),
    status = coalesce(public.profiles.status, 'pending');

  return new;
end;
$$;

commit;
