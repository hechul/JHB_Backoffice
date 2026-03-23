-- 월 선택기 성능 보강용 집계 RPC
-- useAnalysisPeriod.ts 에서 우선 호출하며, 없으면 기존 쿼리 경로로 fallback 됩니다.

create or replace function public.get_purchase_month_counts()
returns table(
  target_month text,
  count bigint
)
language sql
stable
security invoker
as $$
  select
    p.target_month::text as target_month,
    count(*)::bigint as count
  from public.purchases p
  where p.target_month is not null
  group by p.target_month
  order by p.target_month desc
$$;

grant execute on function public.get_purchase_month_counts() to authenticated;
