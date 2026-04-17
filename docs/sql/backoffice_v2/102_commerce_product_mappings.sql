begin;

create table if not exists public.commerce_product_mappings (
  id bigserial primary key,
  source_channel text not null,
  source_account_key text not null default 'default',
  commerce_product_id text not null,
  commerce_option_code text not null default '',
  commerce_product_name text not null default '',
  commerce_option_name text not null default '',
  internal_product_id text not null references public.products(product_id) on delete cascade,
  matching_mode text not null
    check (matching_mode in ('product_id_only', 'product_id_option', 'name_option_rule', 'manual')),
  canonical_variant text not null default '',
  rule_json jsonb not null default '{}'::jsonb,
  mapping_source text not null default 'manual'
    check (mapping_source in ('manual', 'fallback_name_option', 'product_sync', 'imported')),
  priority integer not null default 100 check (priority > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists commerce_product_mappings_unique_idx
  on public.commerce_product_mappings (
    source_channel,
    source_account_key,
    commerce_product_id,
    commerce_option_code,
    canonical_variant
  );

create index if not exists commerce_product_mappings_internal_idx
  on public.commerce_product_mappings (internal_product_id, is_active, priority);

create index if not exists commerce_product_mappings_lookup_idx
  on public.commerce_product_mappings (
    source_channel,
    source_account_key,
    commerce_product_id,
    is_active,
    priority
  );

alter table public.commerce_product_mappings enable row level security;

drop policy if exists "Operators can read commerce product mappings" on public.commerce_product_mappings;
create policy "Operators can read commerce product mappings"
  on public.commerce_product_mappings
  for select
  using (public.can_modify_data());

drop policy if exists "Operators can manage commerce product mappings" on public.commerce_product_mappings;
create policy "Operators can manage commerce product mappings"
  on public.commerce_product_mappings
  for all
  using (public.can_modify_data())
  with check (public.can_modify_data());

commit;
