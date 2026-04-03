begin;

create table if not exists public.commerce_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_channel text not null,
  source_account_key text not null default 'default',
  run_type text not null
    check (run_type in ('manual_sync', 'backfill', 'incremental')),
  requested_by_account_id uuid null references public.profiles(id) on delete set null,
  requested_from timestamptz not null,
  requested_to timestamptz not null,
  status text not null
    check (status in ('pending', 'running', 'done', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  summary_json jsonb not null default '{}'::jsonb,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commerce_sync_runs_channel_idx
  on public.commerce_sync_runs (source_channel, source_account_key, started_at desc);

create index if not exists commerce_sync_runs_status_idx
  on public.commerce_sync_runs (status, started_at desc);

create table if not exists public.commerce_sync_windows (
  id bigserial primary key,
  run_id uuid not null references public.commerce_sync_runs(id) on delete cascade,
  window_from timestamptz not null,
  window_to timestamptz not null,
  status text not null
    check (status in ('pending', 'running', 'done', 'failed')),
  changed_count integer not null default 0,
  detail_count integer not null default 0,
  upserted_count integer not null default 0,
  excluded_count integer not null default 0,
  pagination_json jsonb not null default '{}'::jsonb,
  error_message text null,
  created_at timestamptz not null default now()
);

create index if not exists commerce_sync_windows_run_idx
  on public.commerce_sync_windows (run_id, window_from, window_to);

create table if not exists public.commerce_sync_cursors (
  source_channel text not null,
  source_account_key text not null default 'default',
  last_success_from timestamptz null,
  last_success_to timestamptz null,
  last_success_changed_at timestamptz null,
  last_run_id uuid null references public.commerce_sync_runs(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (source_channel, source_account_key)
);

alter table public.commerce_sync_runs enable row level security;
alter table public.commerce_sync_windows enable row level security;
alter table public.commerce_sync_cursors enable row level security;

drop policy if exists "Operators can read commerce sync runs" on public.commerce_sync_runs;
create policy "Operators can read commerce sync runs"
  on public.commerce_sync_runs
  for select
  using (public.can_modify_data());

drop policy if exists "Operators can read commerce sync windows" on public.commerce_sync_windows;
create policy "Operators can read commerce sync windows"
  on public.commerce_sync_windows
  for select
  using (public.can_modify_data());

drop policy if exists "Operators can read commerce sync cursors" on public.commerce_sync_cursors;
create policy "Operators can read commerce sync cursors"
  on public.commerce_sync_cursors
  for select
  using (public.can_modify_data());

commit;
