begin;

create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null default 'blog_media',
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending',
  total_urls integer not null default 0,
  success_count integer not null default 0,
  fail_count integer not null default 0,
  storage_path text,
  download_url text,
  expires_at timestamptz,
  summary_json jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_jobs_job_type_check
    check (job_type in ('blog_media')),
  constraint automation_jobs_status_check
    check (status in ('pending', 'running', 'done', 'partial', 'failed')),
  constraint automation_jobs_total_urls_check
    check (total_urls >= 0),
  constraint automation_jobs_success_count_check
    check (success_count >= 0),
  constraint automation_jobs_fail_count_check
    check (fail_count >= 0)
);

create index if not exists idx_automation_jobs_status_created_at
  on public.automation_jobs(status, created_at asc);

create index if not exists idx_automation_jobs_created_by_created_at
  on public.automation_jobs(created_by, created_at desc);

create or replace function public.set_automation_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_automation_jobs_updated_at on public.automation_jobs;
create trigger trg_automation_jobs_updated_at
before update on public.automation_jobs
for each row execute function public.set_automation_jobs_updated_at();

alter table public.automation_jobs enable row level security;

drop policy if exists "Users can read own automation jobs" on public.automation_jobs;
drop policy if exists "Users can insert own automation jobs" on public.automation_jobs;
drop policy if exists "Admins can read all automation jobs" on public.automation_jobs;
drop policy if exists "Admins can update automation jobs" on public.automation_jobs;
drop policy if exists "Admins can delete automation jobs" on public.automation_jobs;

create policy "Users can read own automation jobs"
  on public.automation_jobs for select
  using (
    auth.role() = 'authenticated'
    and (
      created_by = auth.uid()
      or public.is_admin()
    )
  );

create policy "Users can insert own automation jobs"
  on public.automation_jobs for insert
  with check (
    auth.role() = 'authenticated'
    and (
      created_by = auth.uid()
      or public.is_admin()
      or created_by is null
    )
  );

create policy "Admins can update automation jobs"
  on public.automation_jobs for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete automation jobs"
  on public.automation_jobs for delete
  using (public.is_admin());

commit;
