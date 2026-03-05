-- 2026-03-05
-- 회원가입 승인 후 로그인 실패(Email not confirmed) 해결
-- 목적:
-- 1) profiles.status가 active로 변경되면 auth.users.email_confirmed_at 자동 확정
-- 2) 이미 active 상태인 기존 계정도 일괄 확정(backfill)

begin;

create or replace function public.confirm_auth_user_on_profile_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.status, 'active') = 'active' then
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_confirm_auth_user_on_profile_active on public.profiles;

create trigger trg_confirm_auth_user_on_profile_active
after insert or update of status on public.profiles
for each row
execute function public.confirm_auth_user_on_profile_active();

update auth.users u
set email_confirmed_at = coalesce(u.email_confirmed_at, now())
where exists (
  select 1
  from public.profiles p
  where p.id = u.id
    and coalesce(p.status, 'active') = 'active'
);

commit;
