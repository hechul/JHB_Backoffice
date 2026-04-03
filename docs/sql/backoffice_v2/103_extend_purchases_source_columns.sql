begin;

alter table public.purchases
  add column if not exists source_channel text not null default 'excel';

alter table public.purchases
  add column if not exists source_account_key text not null default 'default';

alter table public.purchases
  add column if not exists source_order_id text null;

alter table public.purchases
  add column if not exists source_product_id text null;

alter table public.purchases
  add column if not exists source_option_code text null;

alter table public.purchases
  add column if not exists source_last_changed_at timestamptz null;

alter table public.purchases
  add column if not exists source_sync_run_id uuid null
    references public.commerce_sync_runs(id) on delete set null;

create index if not exists purchases_source_channel_order_idx
  on public.purchases (source_channel, source_account_key, source_order_id);

create index if not exists purchases_source_product_idx
  on public.purchases (source_channel, source_account_key, source_product_id);

create index if not exists purchases_source_sync_run_idx
  on public.purchases (source_sync_run_id);

comment on column public.purchases.source_channel is
  '원본 주문 채널. 1차는 naver, 추후 coupang/kakao 확장 예정';

comment on column public.purchases.source_account_key is
  '같은 채널 내 여러 판매계정/스토어를 구분하기 위한 키. 단일 스토어는 default 사용';

comment on column public.purchases.source_product_id is
  '외부 커머스 채널의 상품 식별자. 내부 product_id와 분리 관리';

commit;
