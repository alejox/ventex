-- Señales de adquisición y activación para el panel Super Admin.
--
-- Esta RPC complementa admin_companies; no la reemplaza porque su DDL remoto
-- no forma parte del historial versionado. Solo considera perfiles empresa
-- (nunca workers) y ventas completadas (nunca anuladas).

create index if not exists sales_company_activity_idx
  on public.sales (user_id, created_at desc)
  include (total)
  where status = 'completed';

create or replace function public.admin_company_activity()
returns table (
  user_id uuid,
  business_type text,
  registered_at timestamptz,
  last_sign_in_at timestamptz,
  last_operational_activity_at timestamptz,
  activation_stage text,
  monthly_sales_count bigint,
  monthly_gmv numeric,
  customers_count bigint,
  products_count bigint,
  services_count bigint,
  staff_count bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.is_super_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
  with companies as (
    select
      p.id,
      p.business_name,
      p.business_type,
      p.created_at,
      u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.is_worker is not true
  ),
  sale_activity as (
    select
      s.user_id,
      count(*) filter (
        where s.created_at >= date_trunc('month', now())
      )::bigint as monthly_sales_count,
      coalesce(sum(s.total) filter (
        where s.created_at >= date_trunc('month', now())
      ), 0)::numeric as monthly_gmv,
      count(*)::bigint as completed_sales_count,
      max(s.created_at) as last_activity_at
    from public.sales s
    where s.status = 'completed'
    group by s.user_id
  ),
  customer_activity as (
    select
      c.user_id,
      count(*)::bigint as record_count,
      max(c.created_at) as last_activity_at
    from public.customers c
    group by c.user_id
  ),
  product_activity as (
    select
      p.user_id,
      count(*)::bigint as record_count,
      max(greatest(p.created_at, p.updated_at)) as last_activity_at
    from public.products p
    group by p.user_id
  ),
  service_activity as (
    select
      s.user_id,
      count(*)::bigint as record_count,
      max(s.created_at) as last_activity_at
    from public.services s
    group by s.user_id
  ),
  staff_activity as (
    select
      s.user_id,
      count(*)::bigint as record_count,
      max(s.created_at) as last_activity_at
    from public.staff s
    group by s.user_id
  )
  select
    c.id,
    c.business_type,
    c.created_at,
    c.last_sign_in_at,
    greatest(
      sa.last_activity_at,
      ca.last_activity_at,
      pa.last_activity_at,
      sva.last_activity_at,
      sta.last_activity_at
    ),
    case
      when coalesce(sa.completed_sales_count, 0) > 0 then 'activated'
      when coalesce(pa.record_count, 0) + coalesce(sva.record_count, 0) > 0
        then 'catalog_ready'
      when c.business_type is not null
        or nullif(trim(c.business_name), '') is not null
        or coalesce(ca.record_count, 0) + coalesce(sta.record_count, 0) > 0
        then 'setup_started'
      else 'registered'
    end,
    coalesce(sa.monthly_sales_count, 0),
    coalesce(sa.monthly_gmv, 0),
    coalesce(ca.record_count, 0),
    coalesce(pa.record_count, 0),
    coalesce(sva.record_count, 0),
    coalesce(sta.record_count, 0)
  from companies c
  left join sale_activity sa on sa.user_id = c.id
  left join customer_activity ca on ca.user_id = c.id
  left join product_activity pa on pa.user_id = c.id
  left join service_activity sva on sva.user_id = c.id
  left join staff_activity sta on sta.user_id = c.id
  order by c.created_at desc;
end;
$function$;

comment on function public.admin_company_activity() is
  'Super Admin: altas, login, activación y actividad operativa por empresa.';

revoke all on function public.admin_company_activity() from public;
revoke execute on function public.admin_company_activity() from anon;
grant execute on function public.admin_company_activity() to authenticated;
