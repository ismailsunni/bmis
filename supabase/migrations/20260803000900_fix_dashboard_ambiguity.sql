-- BMIS 009 — fix an ambiguous column reference in rpc_dashboard_summary.
--
-- The collection-vs-distribution subquery exposes columns named `collected` and
-- `distributed`, which are also the names of two PL/pgSQL variables declared in
-- this function. Referenced unqualified, Postgres cannot tell which is meant and
-- raises 42702 — so the whole dashboard failed for every role, on every login.
--
-- Qualifying them with the subquery alias resolves it. The names are kept as
-- they are because the JSON keys are part of the client contract.

create or replace function public.rpc_dashboard_summary(p_from date, p_to date)
returns jsonb language plpgsql stable security definer
set search_path = '' as $$
declare
  r          text := public.current_role();
  span       int  := greatest(p_to - p_from + 1, 1);
  prev_from  date := p_from - span;
  prev_to    date := p_from - 1;
  collected  numeric;
  prev_coll  numeric;
  distributed numeric;
  ytd        numeric;
  result     jsonb;
begin
  select coalesce(sum(amount), 0) into collected from public.donations
   where status = 'verified'
     and (donated_at at time zone 'Asia/Jakarta')::date between p_from and p_to;

  select coalesce(sum(amount), 0) into prev_coll from public.donations
   where status = 'verified'
     and (donated_at at time zone 'Asia/Jakarta')::date between prev_from and prev_to;

  select coalesce(sum(amount), 0) into distributed from public.distributions
   where status = 'disbursed'
     and (distributed_at at time zone 'Asia/Jakarta')::date between p_from and p_to;

  select coalesce(sum(amount), 0) into ytd from public.donations
   where status = 'verified'
     and (donated_at at time zone 'Asia/Jakarta')::date
         >= date_trunc('year', p_to)::date
     and (donated_at at time zone 'Asia/Jakarta')::date <= p_to;

  result := jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'refreshed_at', (select refreshed_at from public.matview_refresh_log where view_name = 'dashboard'),
    'kpi', jsonb_build_object(
      'collected', collected,
      'collected_prev', prev_coll,
      'collected_delta_pct', case when prev_coll > 0
        then round((collected - prev_coll) / prev_coll * 100, 1) else null end,
      'collected_ytd', ytd,
      'annual_target', coalesce((select (value ->> 'annual_target')::numeric
                                 from public.settings where key = 'targets'), 0),
      'distributed', distributed,
      -- ACR: BAZNAS-style allocation-to-collection ratio
      'acr', case when collected > 0 then round(distributed / collected * 100, 1) else null end,
      'available_balance', (select coalesce(sum(public.fund_balance(id)), 0) from public.fund_types),
      'active_donors', (select count(distinct donor_id) from public.donations
                        where status = 'verified' and donated_at > now() - interval '12 months'),
      'pending', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0))
                  from public.donations where status = 'pending')
    ),
    'balances', (select coalesce(jsonb_agg(jsonb_build_object(
        'fund_type_id', ft.id, 'code', ft.code, 'name', ft.name,
        'balance', public.fund_balance(ft.id)) order by ft.sort_order), '[]'::jsonb)
      from public.fund_types ft where ft.is_active),
    'trend', (select coalesce(jsonb_agg(t order by t ->> 'month'), '[]'::jsonb) from (
        select jsonb_build_object('month', to_char(m.month, 'YYYY-MM'),
                                  'fund_type_id', m.fund_type_id,
                                  'fund_type_name', ft.name,
                                  'collected', m.collected) as t
        from public.mv_monthly_fund_summary m
        join public.fund_types ft on ft.id = m.fund_type_id
        where m.month >= date_trunc('month', p_to - interval '11 months')) s),
    'composition', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', ft.name, 'code', ft.code, 'amount', x.amount)), '[]'::jsonb)
      from (select fund_type_id, sum(amount) as amount from public.donations
            where status = 'verified'
              and (donated_at at time zone 'Asia/Jakarta')::date between p_from and p_to
            group by 1) x join public.fund_types ft on ft.id = x.fund_type_id),
    'collection_vs_distribution', (select coalesce(jsonb_agg(jsonb_build_object(
        'month', y.month, 'collected', y.collected, 'distributed', y.distributed)
        order by y.month), '[]'::jsonb) from (
        select to_char(coalesce(c.month, d.month), 'YYYY-MM') as month,
               coalesce(sum(c.collected), 0) as collected,
               coalesce(sum(d.distributed), 0) as distributed
        from public.mv_monthly_fund_summary c
        full join public.mv_monthly_distribution_summary d
          on d.month = c.month and d.fund_type_id = c.fund_type_id
        where coalesce(c.month, d.month) >= date_trunc('month', p_to - interval '11 months')
        group by 1) y),
    'asnaf', (select coalesce(jsonb_agg(jsonb_build_object(
        'asnaf', ac.code, 'name', ac.name, 'amount', coalesce(x.amount, 0))
        order by ac.sort_order), '[]'::jsonb)
      from public.asnaf_categories ac
      left join (
        select b.asnaf, sum(d.amount) as amount
        from public.distributions d
        join public.beneficiaries b on b.id = d.beneficiary_id
        join public.fund_types ft on ft.id = d.fund_type_id
        where d.status = 'disbursed' and ft.is_zakat
          and (d.distributed_at at time zone 'Asia/Jakarta')::date between p_from and p_to
        group by 1) x on x.asnaf = ac.code),
    'programs', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', p.id, 'name', p.name, 'target', p.target_amount,
                 'collected', coalesce(c.amount, 0), 'end_date', p.end_date) as x
        from public.programs p
        left join (select program_id, sum(amount) as amount from public.donations
                   where status = 'verified' group by 1) c on c.program_id = p.id
        where p.status = 'active'
        order by coalesce(c.amount, 0) desc limit 5) pr),
    'payment_methods', (select coalesce(jsonb_agg(jsonb_build_object(
        'method', payment_method, 'amount', amount, 'count', n)), '[]'::jsonb)
      from (select payment_method, sum(amount) as amount, count(*) as n
            from public.donations where status = 'verified'
              and (donated_at at time zone 'Asia/Jakarta')::date between p_from and p_to
            group by 1) z)
  );

  -- Sections below identify donors or expose operational detail: not for viewer.
  if r <> 'viewer' then
    result := result || jsonb_build_object(
      'recent', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
          select jsonb_build_object('id', d.id, 'receipt_no', d.receipt_no,
                                    'amount', d.amount, 'donated_at', d.donated_at,
                                    'donor_name', case when d.is_anonymous then 'Hamba Allah'
                                                       else dn.full_name end,
                                    'fund_type_name', ft.name) as x
          from public.donations d
          join public.fund_types ft on ft.id = d.fund_type_id
          left join public.donors dn on dn.id = d.donor_id
          where d.status = 'verified'
          order by d.verified_at desc nulls last limit 20) s),
      'top_donors', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
          select jsonb_build_object('id', dn.id, 'name', dn.full_name,
                                    'amount', sum(d.amount), 'count', count(*)) as x
          from public.donations d join public.donors dn on dn.id = d.donor_id
          where d.status = 'verified' and not d.is_anonymous
            and (d.donated_at at time zone 'Asia/Jakarta')::date between p_from and p_to
          group by dn.id, dn.full_name order by sum(d.amount) desc limit 10) s),
      'alerts', jsonb_build_object(
        'stale_pending', (select count(*) from public.donations
                          where status = 'pending' and created_at < now() - interval '3 days'),
        'negative_funds', (select coalesce(jsonb_agg(ft.name), '[]'::jsonb)
                           from public.fund_types ft where public.fund_balance(ft.id) < 0),
        'at_risk_donors', (select count(*) from public.donors dn
                           where dn.is_recurring and dn.deleted_at is null
                             and not exists (select 1 from public.donations d
                                             where d.donor_id = dn.id and d.status = 'verified'
                                               and d.donated_at > now() - interval '2 months'))));
  end if;

  if r = 'amil' then
    result := result || jsonb_build_object('mine', (
      select jsonb_build_object(
        'collected', coalesce(sum(amount) filter (where status = 'verified'), 0),
        'pending_count', count(*) filter (where status in ('draft','pending')))
      from public.donations
      where created_by = auth.uid()
        and (donated_at at time zone 'Asia/Jakarta')::date between p_from and p_to));
  end if;

  if r in ('auditor','super_admin') then
    result := result || jsonb_build_object('audit_summary', (
      select coalesce(jsonb_agg(jsonb_build_object('action', action, 'count', n)), '[]'::jsonb)
      from (select action, count(*) as n from public.audit_log
            where created_at > now() - interval '7 days' group by 1) a));
  end if;

  return result;
end $$;
