begin;

create table if not exists public.commerce_order_events_raw (
  id bigserial primary key,
  source_channel text not null,
  source_account_key text not null default 'default',
  run_id uuid not null references public.commerce_sync_runs(id) on delete cascade,
  window_id bigint null references public.commerce_sync_windows(id) on delete cascade,
  source_order_id text null,
  source_line_id text not null,
  event_type text not null,
  event_at timestamptz not null,
  order_status text null,
  payment_date timestamptz null,
  extra_flags jsonb null,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_channel, source_account_key, source_line_id, event_at, event_type)
);

create index if not exists commerce_order_events_raw_run_idx
  on public.commerce_order_events_raw (run_id, window_id);

create index if not exists commerce_order_events_raw_line_idx
  on public.commerce_order_events_raw (source_channel, source_account_key, source_line_id, event_at desc);

create table if not exists public.commerce_order_lines_raw (
  source_channel text not null,
  source_account_key text not null default 'default',
  source_line_id text not null,
  source_order_id text null,
  source_product_id text null,
  source_option_code text null,
  product_name text not null,
  product_option text null,
  buyer_id text null,
  buyer_name text null,
  receiver_name text null,
  receiver_phone_masked text null,
  receiver_base_address text null,
  receiver_detail_address text null,
  quantity integer not null default 1 check (quantity > 0),
  product_order_status text null,
  claim_status text null,
  order_date timestamptz null,
  payment_date timestamptz null,
  decision_date timestamptz null,
  invoice_number text null,
  last_event_type text null,
  last_event_at timestamptz null,
  raw_json jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  primary key (source_channel, source_account_key, source_line_id)
);

create index if not exists commerce_order_lines_raw_order_idx
  on public.commerce_order_lines_raw (source_channel, source_account_key, source_order_id);

create index if not exists commerce_order_lines_raw_product_idx
  on public.commerce_order_lines_raw (source_channel, source_account_key, source_product_id);

create index if not exists commerce_order_lines_raw_synced_idx
  on public.commerce_order_lines_raw (synced_at desc);

alter table public.commerce_order_events_raw enable row level security;
alter table public.commerce_order_lines_raw enable row level security;

drop policy if exists "Operators can read commerce order events raw" on public.commerce_order_events_raw;
create policy "Operators can read commerce order events raw"
  on public.commerce_order_events_raw
  for select
  using (public.can_modify_data());

drop policy if exists "Operators can read commerce order lines raw" on public.commerce_order_lines_raw;
create policy "Operators can read commerce order lines raw"
  on public.commerce_order_lines_raw
  for select
  using (public.can_modify_data());

commit;
