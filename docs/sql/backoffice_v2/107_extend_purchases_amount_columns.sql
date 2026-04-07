begin;

alter table public.purchases
  add column if not exists payment_amount numeric null;

alter table public.purchases
  add column if not exists order_discount_amount numeric null;

alter table public.purchases
  add column if not exists delivery_fee_amount numeric null;

alter table public.purchases
  add column if not exists delivery_discount_amount numeric null;

alter table public.purchases
  add column if not exists expected_settlement_amount numeric null;

alter table public.purchases
  add column if not exists payment_commission numeric null;

alter table public.purchases
  add column if not exists sale_commission numeric null;

comment on column public.purchases.payment_amount is
  '주문 라인 기준 결제 금액. 채널 응답이 제공하지 않으면 null';

comment on column public.purchases.order_discount_amount is
  '주문 라인 기준 할인 금액. 쿠폰/즉시할인 등 채널별 총 할인';

comment on column public.purchases.delivery_fee_amount is
  '주문 라인 기준 배송비. 주문 단위만 제공되는 채널은 안전하게 null 처리 가능';

comment on column public.purchases.delivery_discount_amount is
  '주문 라인 기준 배송비 할인 금액';

comment on column public.purchases.expected_settlement_amount is
  '주문 라인 기준 정산 예정 금액';

comment on column public.purchases.payment_commission is
  '주문 라인 기준 결제 수수료';

comment on column public.purchases.sale_commission is
  '주문 라인 기준 판매 수수료';

create index if not exists purchases_target_month_payment_amount_idx
  on public.purchases (target_month, payment_amount desc nulls last);

create index if not exists purchases_source_channel_payment_amount_idx
  on public.purchases (source_channel, payment_amount desc nulls last);

commit;
