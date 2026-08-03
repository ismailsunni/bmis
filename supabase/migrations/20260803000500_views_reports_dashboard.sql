-- BMIS 005 — masked views, materialized aggregates, dashboard & report RPCs

-- --------------------------------------------------------------- PII masking
-- `viewer` never selects from base tables (RLS denies it). These
-- security_invoker views are the only donor-shaped data it can reach, and they
-- drop or mask every PII column.
-- Definer-rights on purpose: `viewer` has no SELECT on public.donors, so an
-- invoker-rights view would return an empty set for the one role it exists for.
-- Safe because every PII column is masked or dropped here.
create view public.donors_masked_v as
  select id, donor_code, donor_type,
         case when public.current_role() = 'viewer'
              then split_part(full_name, ' ', 1) || ' ***' else full_name end as full_name,
         case when public.current_role() = 'viewer'
              then null else left(nik, 4) || '****' end as nik_masked,
         case when public.current_role() = 'viewer' then null else city end as city,
         province, is_recurring, tags, branch_id, created_at
  from public.donors
  where deleted_at is null;

-- Definer-rights, same reason: aggregate-safe columns only, no donor identity.
create view public.donations_public_v as
  select d.id, d.receipt_no, d.fund_type_id, ft.name as fund_type_name,
         d.program_id, p.name as program_name,
         d.amount, d.payment_method, d.donated_at, d.branch_id
  from public.donations d
  join public.fund_types ft on ft.id = d.fund_type_id
  left join public.programs p on p.id = d.program_id
  where d.status = 'verified';

-- Convenience join for list screens; inherits RLS from the base tables.
create view public.donations_v with (security_invoker = true) as
  select d.*, ft.name as fund_type_name, ft.code as fund_type_code,
         dn.full_name as donor_name, dn.donor_code,
         p.name as program_name, a.name as account_name,
         cb.full_name as created_by_name, vb.full_name as verified_by_name
  from public.donations d
  join public.fund_types ft on ft.id = d.fund_type_id
  left join public.donors dn on dn.id = d.donor_id
  left join public.programs p on p.id = d.program_id
  left join public.accounts a on a.id = d.account_id
  left join public.profiles cb on cb.id = d.created_by
  left join public.profiles vb on vb.id = d.verified_by;

create view public.distributions_v with (security_invoker = true) as
  select d.*, ft.name as fund_type_name, ft.code as fund_type_code,
         b.full_name as beneficiary_name, b.beneficiary_code, b.asnaf,
         p.name as program_name, a.name as account_name,
         rb.full_name as requested_by_name, ab.full_name as approved_by_name
  from public.distributions d
  join public.fund_types ft on ft.id = d.fund_type_id
  left join public.beneficiaries b on b.id = d.beneficiary_id
  left join public.programs p on p.id = d.program_id
  left join public.accounts a on a.id = d.account_id
  left join public.profiles rb on rb.id = d.requested_by
  left join public.profiles ab on ab.id = d.approved_by;

-- ------------------------------------------------------ materialized rollups
-- Heaviest aggregates. Refreshed by pg_cron every 15 minutes; the dashboard
-- shows the refresh timestamp so nobody mistakes them for live figures.
create materialized view public.mv_monthly_fund_summary as
select date_trunc('month', d.donated_at at time zone 'Asia/Jakarta') as month,
       d.fund_type_id,
       sum(d.amount)   as collected,
       count(*)        as donation_count,
       count(distinct d.donor_id) as donor_count
from public.donations d
where d.status = 'verified'
group by 1, 2;
create unique index mv_monthly_fund_summary_key
  on public.mv_monthly_fund_summary (month, fund_type_id);

create materialized view public.mv_monthly_distribution_summary as
select date_trunc('month', d.distributed_at at time zone 'Asia/Jakarta') as month,
       d.fund_type_id, b.asnaf,
       sum(d.amount) as distributed,
       count(*)      as distribution_count
from public.distributions d
left join public.beneficiaries b on b.id = d.beneficiary_id
where d.status = 'disbursed'
group by 1, 2, 3;
create unique index mv_monthly_distribution_summary_key
  on public.mv_monthly_distribution_summary (month, fund_type_id, asnaf);

create table public.matview_refresh_log (
  view_name text primary key,
  refreshed_at timestamptz not null default now()
);

create or replace function public.refresh_dashboard_matviews()
returns void language plpgsql security definer
set search_path = '' as $$
begin
  refresh materialized view concurrently public.mv_monthly_fund_summary;
  refresh materialized view concurrently public.mv_monthly_distribution_summary;
  insert into public.matview_refresh_log (view_name, refreshed_at)
  values ('dashboard', now())
  on conflict (view_name) do update set refreshed_at = now();
end $$;

select cron.schedule('bmis-refresh-dashboard', '*/15 * * * *',
                     $$select public.refresh_dashboard_matviews()$$);

-- ------------------------------------------------------------- fund balances
create or replace function public.rpc_fund_balance_report(p_from date, p_to date)
returns table (
  fund_type_id uuid, fund_type_code text, fund_type_name text,
  opening numeric, collected numeric, distributed numeric, closing numeric
) language sql stable security definer
set search_path = '' as $$
  with ft as (select * from public.fund_types where is_active),
  don as (
    select fund_type_id,
      sum(amount) filter (where (donated_at at time zone 'Asia/Jakarta')::date < p_from) as before,
      sum(amount) filter (where (donated_at at time zone 'Asia/Jakarta')::date between p_from and p_to) as during
    from public.donations where status = 'verified' group by 1),
  dis as (
    select fund_type_id,
      sum(amount) filter (where (distributed_at at time zone 'Asia/Jakarta')::date < p_from) as before,
      sum(amount) filter (where (distributed_at at time zone 'Asia/Jakarta')::date between p_from and p_to) as during
    from public.distributions where status = 'disbursed' group by 1)
  select ft.id, ft.code, ft.name,
         coalesce(don.before, 0) - coalesce(dis.before, 0)                       as opening,
         coalesce(don.during, 0)                                                 as collected,
         coalesce(dis.during, 0)                                                 as distributed,
         coalesce(don.before, 0) - coalesce(dis.before, 0)
           + coalesce(don.during, 0) - coalesce(dis.during, 0)                   as closing
  from ft
  left join don on don.fund_type_id = ft.id
  left join dis on dis.fund_type_id = ft.id
  order by ft.sort_order;
$$;
revoke execute on function public.rpc_fund_balance_report(date, date) from public;
grant execute on function public.rpc_fund_balance_report(date, date) to authenticated;

-- ---------------------------------------------------------------- dashboard
-- SECURITY DEFINER by necessity: `viewer` has no SELECT on the base tables, so
-- an invoker-rights function would return zeros for exactly the role that is
-- supposed to see the aggregate dashboard. The function is therefore
-- aggregate-only and gates every donor-identifying section on the caller role.
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
        'month', month, 'collected', collected, 'distributed', distributed)
        order by month), '[]'::jsonb) from (
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
revoke execute on function public.rpc_dashboard_summary(date, date) from public;
grant execute on function public.rpc_dashboard_summary(date, date) to authenticated;

-- ------------------------------------------------------------ donor lifetime
create or replace function public.rpc_donor_statement(p_donor_id uuid, p_year int default null)
returns jsonb language sql stable
set search_path = '' as $$
  select jsonb_build_object(
    'donor', to_jsonb(dn) - 'nik',
    'total', coalesce((select sum(amount) from public.donations
                       where donor_id = p_donor_id and status = 'verified'
                         and (p_year is null or extract(year from donated_at) = p_year)), 0),
    'by_fund', (select coalesce(jsonb_agg(jsonb_build_object('name', ft.name, 'amount', x.amount)), '[]'::jsonb)
                from (select fund_type_id, sum(amount) as amount from public.donations
                      where donor_id = p_donor_id and status = 'verified'
                        and (p_year is null or extract(year from donated_at) = p_year)
                      group by 1) x join public.fund_types ft on ft.id = x.fund_type_id),
    'donations', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', d.id, 'receipt_no', d.receipt_no, 'amount', d.amount,
                    'donated_at', d.donated_at, 'fund_type_name', ft.name)
                    order by d.donated_at desc), '[]'::jsonb)
                  from public.donations d join public.fund_types ft on ft.id = d.fund_type_id
                  where d.donor_id = p_donor_id and d.status = 'verified'
                    and (p_year is null or extract(year from d.donated_at) = p_year)))
  from public.donors dn where dn.id = p_donor_id;
$$;
