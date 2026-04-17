-- 2026-03-31
-- 스트레스 게임 상위 기록 저장용 테이블
-- 목적:
-- 1) 로그인 사용자별 최고 기록 저장
-- 2) 홈/게임 화면에서 상위 3명 조회

begin;

create table if not exists public.stress_game_scores (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  user_name      text not null,
  best_score     integer not null default 0 check (best_score >= 0),
  last_played_at timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_stress_game_scores_best_score
  on public.stress_game_scores(best_score desc, updated_at asc);

create or replace function public.submit_stress_game_score(
  p_score integer,
  p_user_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  insert into public.stress_game_scores (
    user_id,
    user_name,
    best_score,
    last_played_at
  )
  values (
    v_user_id,
    coalesce(nullif(trim(p_user_name), ''), '이름 없음'),
    greatest(coalesce(p_score, 0), 0),
    now()
  )
  on conflict (user_id) do update
  set user_name = excluded.user_name,
      best_score = greatest(public.stress_game_scores.best_score, excluded.best_score),
      last_played_at = now();
end;
$$;

create or replace function public.set_stress_game_scores_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_stress_game_scores_updated_at on public.stress_game_scores;
create trigger trg_stress_game_scores_updated_at
before update on public.stress_game_scores
for each row execute function public.set_stress_game_scores_updated_at();

alter table public.stress_game_scores enable row level security;

drop policy if exists "Authenticated users can read stress leaderboard" on public.stress_game_scores;
drop policy if exists "Users can insert own stress score" on public.stress_game_scores;
drop policy if exists "Users can update own stress score" on public.stress_game_scores;

create policy "Authenticated users can read stress leaderboard"
  on public.stress_game_scores for select
  using (auth.role() = 'authenticated');

create policy "Users can insert own stress score"
  on public.stress_game_scores for insert
  with check (
    auth.role() = 'authenticated'
    and auth.uid() = user_id
  );

create policy "Users can update own stress score"
  on public.stress_game_scores for update
  using (
    auth.role() = 'authenticated'
    and auth.uid() = user_id
  )
  with check (
    auth.role() = 'authenticated'
    and auth.uid() = user_id
  );

grant execute on function public.submit_stress_game_score(integer, text) to authenticated;

commit;
