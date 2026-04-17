begin;

alter table public.commerce_sync_runs
  add column if not exists source_fulfillment_type text not null default 'default';

alter table public.commerce_sync_cursors
  add column if not exists source_fulfillment_type text not null default 'default';

alter table public.commerce_order_events_raw
  add column if not exists source_fulfillment_type text not null default 'default';

alter table public.commerce_order_lines_raw
  add column if not exists source_fulfillment_type text not null default 'default';

alter table public.commerce_product_mappings
  add column if not exists source_fulfillment_type text not null default 'default';

alter table public.purchases
  add column if not exists source_fulfillment_type text not null default 'default';

drop index if exists commerce_sync_runs_channel_idx;
create index if not exists commerce_sync_runs_channel_idx
  on public.commerce_sync_runs (source_channel, source_fulfillment_type, source_account_key, started_at desc);

alter table public.commerce_sync_cursors
  drop constraint if exists commerce_sync_cursors_pkey;

alter table public.commerce_sync_cursors
  add primary key (source_channel, source_fulfillment_type, source_account_key);

drop index if exists commerce_order_events_raw_line_idx;
create index if not exists commerce_order_events_raw_line_idx
  on public.commerce_order_events_raw (
    source_channel,
    source_fulfillment_type,
    source_account_key,
    source_line_id,
    event_at desc
  );

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'commerce_order_events_raw'
    and con.contype = 'u'
    and pg_get_constraintdef(con.oid) like '%source_channel, source_account_key, source_line_id, event_at, event_type%';

  if constraint_name is not null then
    execute format('alter table public.commerce_order_events_raw drop constraint %I', constraint_name);
  end if;
end $$;

create unique index if not exists commerce_order_events_raw_unique_idx_v2
  on public.commerce_order_events_raw (
    source_channel,
    source_fulfillment_type,
    source_account_key,
    source_line_id,
    event_at,
    event_type
  );

alter table public.commerce_order_lines_raw
  drop constraint if exists commerce_order_lines_raw_pkey;

alter table public.commerce_order_lines_raw
  add primary key (source_channel, source_fulfillment_type, source_account_key, source_line_id);

drop index if exists commerce_order_lines_raw_order_idx;
create index if not exists commerce_order_lines_raw_order_idx
  on public.commerce_order_lines_raw (source_channel, source_fulfillment_type, source_account_key, source_order_id);

drop index if exists commerce_order_lines_raw_product_idx;
create index if not exists commerce_order_lines_raw_product_idx
  on public.commerce_order_lines_raw (source_channel, source_fulfillment_type, source_account_key, source_product_id);

drop index if exists commerce_product_mappings_unique_idx;
create unique index if not exists commerce_product_mappings_unique_idx
  on public.commerce_product_mappings (
    source_channel,
    source_fulfillment_type,
    source_account_key,
    commerce_product_id,
    commerce_option_code,
    canonical_variant
  );

drop index if exists commerce_product_mappings_lookup_idx;
create index if not exists commerce_product_mappings_lookup_idx
  on public.commerce_product_mappings (
    source_channel,
    source_fulfillment_type,
    source_account_key,
    commerce_product_id,
    is_active,
    priority
  );

drop index if exists purchases_source_channel_order_idx;
create index if not exists purchases_source_channel_order_idx
  on public.purchases (source_channel, source_fulfillment_type, source_account_key, source_order_id);

drop index if exists purchases_source_product_idx;
create index if not exists purchases_source_product_idx
  on public.purchases (source_channel, source_fulfillment_type, source_account_key, source_product_id);

comment on column public.commerce_sync_runs.source_fulfillment_type is
  '채널 내 주문/재고 유형. 기본값 default, 쿠팡은 marketplace 또는 rocket_growth';

comment on column public.commerce_sync_cursors.source_fulfillment_type is
  '채널 내 동기화 cursor를 구분하는 유형. 기본값 default, 쿠팡은 marketplace 또는 rocket_growth';

comment on column public.commerce_order_events_raw.source_fulfillment_type is
  '원본 이벤트의 fulfillment 유형. 기본값 default, 쿠팡은 marketplace 또는 rocket_growth';

comment on column public.commerce_order_lines_raw.source_fulfillment_type is
  '원본 주문 라인의 fulfillment 유형. 기본값 default, 쿠팡은 marketplace 또는 rocket_growth';

comment on column public.commerce_product_mappings.source_fulfillment_type is
  '외부 SKU 매핑의 fulfillment 유형. 기본값 default, 쿠팡은 marketplace 또는 rocket_growth';

comment on column public.purchases.source_fulfillment_type is
  '원본 주문의 fulfillment 유형. 기본값 default, 쿠팡은 marketplace 또는 rocket_growth';

commit;
