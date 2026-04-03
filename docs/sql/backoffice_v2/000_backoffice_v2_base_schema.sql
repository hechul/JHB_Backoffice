begin;

create extension if not exists pgcrypto;

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email varchar not null,
  full_name varchar not null,
  role varchar not null default 'viewer',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint profiles_role_check
    check (role in ('admin', 'modifier', 'viewer')),
  constraint profiles_status_check
    check (status in ('pending', 'active', 'rejected', 'inactive'))
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

create or replace function public.can_modify_data()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'modifier')
      and status = 'active'
  );
$$;

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.products (
  product_id varchar primary key,
  product_name varchar not null,
  option_name varchar,
  pet_type varchar not null default 'BOTH'
    check (pet_type in ('DOG', 'CAT', 'BOTH')),
  stage integer check (stage between 1 and 4),
  product_line varchar,
  expected_consumption_days integer,
  deleted_at timestamptz default null,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_pet_type on public.products(pet_type);
create index if not exists idx_products_deleted_at on public.products(deleted_at);
create index if not exists idx_products_name_option on public.products(product_name, option_name);

create or replace view public.products_active
with (security_invoker = true) as
  select *
  from public.products
  where deleted_at is null;

create table if not exists public.campaigns (
  id serial primary key,
  name varchar not null,
  agency varchar,
  start_date date,
  end_date date,
  budget decimal,
  created_at timestamptz not null default now(),
  deleted_at timestamptz default null
);

create index if not exists idx_campaigns_deleted_at on public.campaigns(deleted_at);

create or replace view public.campaigns_active
with (security_invoker = true) as
  select *
  from public.campaigns
  where deleted_at is null;

create table if not exists public.purchases (
  purchase_id varchar primary key,
  upload_batch_id uuid not null,
  target_month varchar(7) not null check (target_month ~ '^\d{4}-\d{2}$'),
  buyer_id varchar not null,
  buyer_name varchar not null,
  receiver_name varchar,
  customer_key varchar not null,
  product_id varchar not null,
  product_name varchar not null,
  option_info varchar,
  source_product_name varchar,
  source_option_info varchar,
  quantity integer not null default 1 check (quantity > 0),
  order_date date not null,
  order_status varchar not null,
  claim_status varchar,
  delivery_type varchar,
  is_fake boolean not null default false,
  match_reason varchar,
  match_rank integer check (match_rank between 1 and 5),
  matched_exp_id integer,
  needs_review boolean not null default false,
  is_manual boolean not null default false,
  filter_ver varchar,
  quantity_warning boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_purchases_customer_key on public.purchases(customer_key);
create index if not exists idx_purchases_product_id on public.purchases(product_id);
create index if not exists idx_purchases_order_date on public.purchases(order_date);
create index if not exists idx_purchases_is_fake on public.purchases(is_fake);
create index if not exists idx_purchases_buyer_id on public.purchases(buyer_id);
create index if not exists idx_purchases_matched_exp on public.purchases(matched_exp_id);
create index if not exists idx_purchases_target_month on public.purchases(target_month);
create index if not exists idx_purchases_upload_batch_id on public.purchases(upload_batch_id);
create index if not exists idx_purchases_month_fake_review
  on public.purchases(target_month, is_fake, needs_review);
create index if not exists idx_purchases_filter_match
  on public.purchases(buyer_id, product_id, order_date)
  where is_fake = false and is_manual = false and needs_review = false;
create unique index if not exists idx_purchases_matched_exp_unique
  on public.purchases(matched_exp_id)
  where matched_exp_id is not null;

drop trigger if exists purchases_updated_at on public.purchases;
create trigger purchases_updated_at
  before update on public.purchases
  for each row execute function public.update_updated_at();

create table if not exists public.experiences (
  id serial primary key,
  upload_batch_id uuid not null,
  target_month varchar(7) not null check (target_month ~ '^\d{4}-\d{2}$'),
  campaign_id integer not null references public.campaigns(id),
  mission_product_name varchar not null,
  mapped_product_id varchar,
  option_info varchar,
  nickname varchar,
  receiver_name varchar not null,
  naver_id varchar not null,
  purchase_date date not null,
  address varchar,
  phone_last4 varchar(4) check (phone_last4 ~ '^\d{4}$'),
  unmatch_reason varchar,
  created_at timestamptz not null default now()
);

create index if not exists idx_experiences_campaign_id on public.experiences(campaign_id);
create index if not exists idx_experiences_naver_id on public.experiences(naver_id);
create index if not exists idx_experiences_purchase_date on public.experiences(purchase_date);
create index if not exists idx_experiences_mapped_product_id on public.experiences(mapped_product_id);
create index if not exists idx_experiences_target_month on public.experiences(target_month);
create index if not exists idx_experiences_upload_batch_id on public.experiences(upload_batch_id);
create index if not exists idx_experiences_filter_match
  on public.experiences(naver_id, mapped_product_id, purchase_date, campaign_id);
create unique index if not exists idx_experiences_unique_with_naver
  on public.experiences (
    campaign_id,
    lower(btrim(naver_id)),
    lower(btrim(mission_product_name)),
    purchase_date
  )
  where nullif(btrim(coalesce(naver_id, '')), '') is not null;
create unique index if not exists idx_experiences_unique_without_naver
  on public.experiences (
    campaign_id,
    lower(btrim(coalesce(receiver_name, ''))),
    lower(btrim(mission_product_name)),
    purchase_date,
    lower(btrim(coalesce(option_info, '')))
  )
  where nullif(btrim(coalesce(naver_id, '')), '') is null;

create or replace view public.customers_summary
with (security_invoker = true) as
select
  customer_key,
  buyer_name,
  buyer_id,
  count(*) as total_orders,
  min(order_date) as first_order_date,
  max(order_date) as last_order_date,
  (current_date - max(order_date)) as last_order_days,
  case
    when (current_date - max(order_date)) > 60 then true
    else false
  end as churn_risk
from public.purchases
where is_fake = false
  and needs_review = false
group by customer_key, buyer_name, buyer_id;

create or replace view public.customers_summary_monthly
with (security_invoker = true) as
select
  target_month,
  customer_key,
  buyer_name,
  buyer_id,
  count(*) as total_orders,
  min(order_date) as first_order_date,
  max(order_date) as last_order_date,
  (current_date - max(order_date)) as last_order_days,
  case
    when (current_date - max(order_date)) > 60 then true
    else false
  end as churn_risk
from public.purchases
where is_fake = false
  and needs_review = false
group by target_month, customer_key, buyer_name, buyer_id;

create table if not exists public.filter_logs (
  log_id serial primary key,
  executed_at timestamptz not null default now(),
  executed_by_account_id uuid references public.profiles(id) on delete set null,
  executed_by varchar not null,
  filter_ver varchar not null,
  target_month varchar,
  status varchar not null check (status in ('success', 'error')),
  summary_json jsonb,
  error_message text,
  total_purchases_processed integer not null default 0,
  total_exp_processed integer not null default 0,
  total_matched integer not null default 0,
  total_unmatched_exp integer not null default 0
);

create index if not exists idx_filter_logs_executed_at on public.filter_logs(executed_at desc);
create index if not exists idx_filter_logs_target_month on public.filter_logs(target_month);
create index if not exists idx_filter_logs_executed_by_account_id on public.filter_logs(executed_by_account_id);

create table if not exists public.override_logs (
  log_id serial primary key,
  changed_at timestamptz not null default now(),
  changed_by_account_id uuid references public.profiles(id) on delete set null,
  changed_by varchar not null,
  purchase_id varchar not null,
  action varchar not null check (action in ('fake해제', 'fake지정')),
  prev_is_fake boolean not null,
  new_is_fake boolean not null,
  prev_matched_exp_id integer,
  new_matched_exp_id integer,
  note text
);

create index if not exists idx_override_logs_changed_at on public.override_logs(changed_at desc);
create index if not exists idx_override_logs_purchase_id on public.override_logs(purchase_id);
create index if not exists idx_override_logs_changed_by_account_id on public.override_logs(changed_by_account_id);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.campaigns enable row level security;
alter table public.purchases enable row level security;
alter table public.experiences enable row level security;
alter table public.filter_logs enable row level security;
alter table public.override_logs enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles"
  on public.profiles for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admins can manage profiles" on public.profiles;
create policy "Admins can manage profiles"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Viewers can read active products" on public.products;
create policy "Viewers can read active products"
  on public.products for select
  using (
    auth.role() = 'authenticated'
    and (
      deleted_at is null
      or public.can_modify_data()
    )
  );

drop policy if exists "Operators can manage products" on public.products;
create policy "Operators can manage products"
  on public.products for all
  using (public.can_modify_data())
  with check (public.can_modify_data());

drop policy if exists "Viewers can read active campaigns" on public.campaigns;
create policy "Viewers can read active campaigns"
  on public.campaigns for select
  using (
    auth.role() = 'authenticated'
    and (
      deleted_at is null
      or public.can_modify_data()
    )
  );

drop policy if exists "Operators can manage campaigns" on public.campaigns;
create policy "Operators can manage campaigns"
  on public.campaigns for all
  using (public.can_modify_data())
  with check (public.can_modify_data());

drop policy if exists "Authenticated users can read purchases" on public.purchases;
create policy "Authenticated users can read purchases"
  on public.purchases for select
  using (auth.role() = 'authenticated');

drop policy if exists "Operators can manage purchases" on public.purchases;
create policy "Operators can manage purchases"
  on public.purchases for all
  using (public.can_modify_data())
  with check (public.can_modify_data());

drop policy if exists "Authenticated users can read experiences" on public.experiences;
create policy "Authenticated users can read experiences"
  on public.experiences for select
  using (auth.role() = 'authenticated');

drop policy if exists "Operators can manage experiences" on public.experiences;
create policy "Operators can manage experiences"
  on public.experiences for all
  using (public.can_modify_data())
  with check (public.can_modify_data());

drop policy if exists "Authenticated users can read filter logs" on public.filter_logs;
create policy "Authenticated users can read filter logs"
  on public.filter_logs for select
  using (auth.role() = 'authenticated');

drop policy if exists "Operators can manage filter logs" on public.filter_logs;
create policy "Operators can manage filter logs"
  on public.filter_logs for all
  using (public.can_modify_data())
  with check (public.can_modify_data());

drop policy if exists "Authenticated users can read override logs" on public.override_logs;
create policy "Authenticated users can read override logs"
  on public.override_logs for select
  using (auth.role() = 'authenticated');

drop policy if exists "Operators can manage override logs" on public.override_logs;
create policy "Operators can manage override logs"
  on public.override_logs for all
  using (public.can_modify_data())
  with check (public.can_modify_data());

comment on column public.products.expected_consumption_days is
  '상품 예상 소비일. 고객 이탈 위험 판정 시 마지막 구매일 기준으로 사용';

comment on column public.purchases.source_product_name is
  '스마트스토어 원본 상품명. 대시보드/고객 분석 수량 계산 시 원문 수량 정보를 복원하는 데 사용';

comment on column public.purchases.source_option_info is
  '스마트스토어 원본 옵션정보. 정규화 option_info와 별도로 원문 옵션 보존';

commit;
