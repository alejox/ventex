-- The super-admin panel listed every profile as a company. Invited staff get a
-- profile too (every auth user does, via handle_new_user), so barbers showed up
-- as businesses. `profiles.is_worker` cannot tell them apart: it is false for
-- every row in production (memberships replaced it).
--
-- A staff-only account is a member of some workspace and owns none. If that
-- person later opens their own business they own a workspace and show up again.

create or replace function public.is_staff_only_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
           select 1 from public.workspace_memberships m
           where m.auth_user_id = p_user_id and m.member_kind = 'member'
         )
     and not exists (
           select 1 from public.workspaces w where w.owner_user_id = p_user_id
         );
$$;

revoke execute on function public.is_staff_only_account(uuid) from public, anon, authenticated;

create or replace function public.admin_companies()
 returns table(user_id uuid, business_name text, full_name text, email text, plan_id text, plan_name text, status text, is_super_admin boolean, is_reseller boolean, license_status text, reseller_name text, period_end timestamp with time zone, staff_count bigint, monthly_sales numeric, total_sales numeric, created_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select p.id,
         p.business_name,
         p.full_name,
         u.email::text,
         coalesce(s.plan_id, 'gratis'),
         pl.name,
         coalesce(s.status, 'active'),
         p.is_super_admin,
         p.is_reseller,
         cl.status,
         coalesce(pr.business_name, pr.full_name),
         coalesce(cl.period_end, s.current_period_end),
         (select count(*) from public.staff st where st.user_id = p.id and st.status = 'active'),
         (select coalesce(sum(sa.total), 0) from public.sales sa
          where sa.user_id = p.id and sa.status = 'completed'
            and sa.created_at >= date_trunc('month', now())),
         (select coalesce(sum(sa.total), 0) from public.sales sa
          where sa.user_id = p.id and sa.status = 'completed'),
         p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.subscriptions s on s.user_id = p.id
  left join public.plans pl on pl.id = coalesce(s.plan_id, 'gratis')
  left join public.client_licenses cl on cl.user_id = p.id
  left join public.profiles pr on pr.id = p.reseller_id
  where public.is_super_admin()
    and not public.is_staff_only_account(p.id)
  order by p.created_at desc;
$function$;

create or replace function public.admin_stats()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v jsonb;
begin
  if not public.is_super_admin() then raise exception 'No autorizado'; end if;
  select jsonb_build_object(
    'companies', (select count(*) from public.profiles p
                  where not public.is_staff_only_account(p.id)),
    'monthly_sales', (select coalesce(sum(total), 0) from public.sales
                      where status = 'completed' and created_at >= date_trunc('month', now())),
    'total_sales', (select coalesce(sum(total), 0) from public.sales where status = 'completed'),
    'staff_total', (select count(*) from public.staff where status = 'active'),
    'by_plan', (select coalesce(jsonb_object_agg(plan_id, cnt), '{}'::jsonb) from (
        select coalesce(s.plan_id, 'gratis') as plan_id, count(*) as cnt
        from public.profiles p left join public.subscriptions s on s.user_id = p.id
        where not public.is_staff_only_account(p.id)
        group by 1) t)
  ) into v;
  return v;
end;
$function$;

create or replace function public.admin_company_activity()
 returns table(user_id uuid, business_type text, registered_at timestamp with time zone, last_sign_in_at timestamp with time zone, last_operational_activity_at timestamp with time zone, activation_stage text, monthly_sales_count bigint, monthly_gmv numeric, customers_count bigint, products_count bigint, services_count bigint, staff_count bigint)
 language plpgsql
 security definer
 set search_path to ''
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
      and not public.is_staff_only_account(p.id)
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
