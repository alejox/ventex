-- Recargas de planes (revendedor y super admin), modalidad anual y catálogo
-- público de planes para la landing.
--
-- Modelo: el precio anual NO se almacena. Se deriva de `price` y
-- `annual_charged_months` (meses que se cobran de los 12 que se entregan), de
-- modo que nunca puedan divergir: 29.000 x 10 = 290.000 con 2 meses de regalo.

-- ---------------------------------------------------------------------------
-- 1. Modalidad anual parametrizable por plan
-- ---------------------------------------------------------------------------
alter table public.plans
  add column if not exists annual_charged_months int not null default 10;

alter table public.plans
  drop constraint if exists plans_annual_charged_months_range;

-- 0 = el plan no ofrece modalidad anual. Máx 12 (cobrar 12 de 12 = sin regalo).
alter table public.plans
  add constraint plans_annual_charged_months_range
  check (annual_charged_months between 0 and 12);

-- ---------------------------------------------------------------------------
-- 2. Catálogo público: la landing (anónima) muestra los planes activos
-- ---------------------------------------------------------------------------
drop policy if exists "plans_public_read" on public.plans;
create policy "plans_public_read" on public.plans
  for select to anon
  using (is_active);

grant select on public.plans to anon;

-- ---------------------------------------------------------------------------
-- 3. Alta/edición de planes desde el super admin (p_id null => crea)
--    Sustituye a admin_update_plan, que no permitía crear ni tocar el anual.
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_plan(
  p_id text,
  p_name text,
  p_max_collaborators int,
  p_max_monthly_sales numeric,
  p_price numeric,
  p_annual_charged_months int,
  p_sort_order int,
  p_is_active boolean
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id text;
begin
  if not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  -- Slug seguro: minúsculas, sin espacios ni caracteres raros.
  v_id := lower(regexp_replace(coalesce(p_id, ''), '[^a-zA-Z0-9_-]', '', 'g'));
  if v_id = '' then
    raise exception 'El identificador del plan es obligatorio';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'El nombre del plan es obligatorio';
  end if;

  insert into public.plans as pl (
    id, name, max_collaborators, max_monthly_sales, price,
    annual_charged_months, sort_order, is_active
  )
  values (
    v_id,
    trim(p_name),
    greatest(coalesce(p_max_collaborators, 0), 0),
    p_max_monthly_sales,
    greatest(coalesce(p_price, 0), 0),
    least(greatest(coalesce(p_annual_charged_months, 0), 0), 12),
    coalesce(p_sort_order, 0),
    coalesce(p_is_active, true)
  )
  on conflict (id) do update set
    name                  = excluded.name,
    max_collaborators     = excluded.max_collaborators,
    max_monthly_sales     = excluded.max_monthly_sales,
    price                 = excluded.price,
    annual_charged_months = excluded.annual_charged_months,
    sort_order            = excluded.sort_order,
    is_active             = excluded.is_active,
    updated_at            = now();

  return v_id;
end; $$;

grant execute on function public.admin_save_plan(
  text, text, int, numeric, numeric, int, int, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Recarga de un cliente por su REVENDEDOR (consume créditos del plan)
--    mensual = 1 crédito -> +1 mes | anual = annual_charged_months -> +12 meses
-- ---------------------------------------------------------------------------
create or replace function public.reseller_recharge_client(
  p_user_id uuid,
  p_period text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_reseller uuid := auth.uid();
  v_plan     text;
  v_price    numeric;
  v_charged  int;
  v_months   int;
  v_cost     int;
  v_balance  int;
  v_new_end  timestamptz;
begin
  if not public.is_reseller() then
    raise exception 'No autorizado';
  end if;
  if p_period not in ('monthly', 'annual') then
    raise exception 'Periodo inválido';
  end if;

  -- El cliente debe existir y ser de ESTE revendedor.
  select s.plan_id
    into v_plan
    from public.client_licenses cl
    join public.subscriptions s on s.user_id = cl.user_id
   where cl.user_id = p_user_id
     and cl.reseller_id = v_reseller;

  if v_plan is null then
    raise exception 'El cliente no existe o no te pertenece';
  end if;

  select p.price, p.annual_charged_months
    into v_price, v_charged
    from public.plans p
   where p.id = v_plan;

  -- El plan gratis no se gestiona (regla por precio, no por id).
  if coalesce(v_price, 0) <= 0 then
    raise exception 'El plan gratis no requiere recarga';
  end if;

  if p_period = 'annual' then
    if coalesce(v_charged, 0) <= 0 then
      raise exception 'Este plan no ofrece modalidad anual';
    end if;
    v_cost   := v_charged;
    v_months := 12;
  else
    v_cost   := 1;
    v_months := 1;
  end if;

  v_balance := public.reseller_credit_balance(p_plan => v_plan, p_reseller => v_reseller);
  if v_balance < v_cost then
    raise exception 'Créditos insuficientes: la recarga cuesta % y tienes % del plan %',
      v_cost, v_balance, v_plan;
  end if;

  insert into public.reseller_credits (
    reseller_id, client_id, plan_id, delta, reason, note, created_by
  ) values (
    v_reseller, p_user_id, v_plan, -v_cost, 'consume',
    case when p_period = 'annual'
      then 'Recarga anual (12 meses)'
      else 'Recarga mensual (1 mes)'
    end,
    v_reseller
  );

  -- Si la licencia está vigente la recarga se SUMA encima; si venció, cuenta
  -- desde hoy (no se regalan los días transcurridos vencidos).
  update public.client_licenses cl
     set status       = 'active',
         activated_at = coalesce(cl.activated_at, now()),
         period_start = case
                          when coalesce(cl.period_end, now()) <= now() then now()
                          else cl.period_start
                        end,
         period_end   = greatest(coalesce(cl.period_end, now()), now())
                        + make_interval(months => v_months),
         updated_at   = now()
   where cl.user_id = p_user_id
     and cl.reseller_id = v_reseller
  returning cl.period_end into v_new_end;

  return jsonb_build_object(
    'period_end',   v_new_end,
    'credits_used', v_cost,
    'months',       v_months,
    'plan_id',      v_plan
  );
end; $$;

grant execute on function public.reseller_recharge_client(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Recarga de una empresa por el SUPER ADMIN (sin créditos: él es la fuente)
--    Cliente de revendedor -> extiende su licencia. Cuenta directa -> extiende
--    el periodo de su suscripción.
-- ---------------------------------------------------------------------------
create or replace function public.admin_recharge_company(
  p_user_id uuid,
  p_months int
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_plan    text;
  v_price   numeric;
  v_managed boolean := false;
  v_new_end timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;
  if coalesce(p_months, 0) < 1 or p_months > 60 then
    raise exception 'Los meses a recargar deben estar entre 1 y 60';
  end if;

  select s.plan_id into v_plan
    from public.subscriptions s
   where s.user_id = p_user_id;

  if v_plan is null then
    raise exception 'La empresa no tiene suscripción';
  end if;

  select p.price into v_price from public.plans p where p.id = v_plan;
  if coalesce(v_price, 0) <= 0 then
    raise exception 'El plan gratis no requiere recarga';
  end if;

  if exists (select 1 from public.client_licenses cl where cl.user_id = p_user_id) then
    v_managed := true;
    update public.client_licenses cl
       set status       = 'active',
           activated_at = coalesce(cl.activated_at, now()),
           period_start = case
                            when coalesce(cl.period_end, now()) <= now() then now()
                            else cl.period_start
                          end,
           period_end   = greatest(coalesce(cl.period_end, now()), now())
                          + make_interval(months => p_months),
           updated_at   = now()
     where cl.user_id = p_user_id
    returning cl.period_end into v_new_end;
  else
    update public.subscriptions s
       set status             = 'active',
           current_period_end = greatest(coalesce(s.current_period_end, now()), now())
                                + make_interval(months => p_months),
           updated_at         = now()
     where s.user_id = p_user_id
    returning s.current_period_end into v_new_end;
  end if;

  return jsonb_build_object(
    'period_end', v_new_end,
    'months',     p_months,
    'managed',    v_managed
  );
end; $$;

grant execute on function public.admin_recharge_company(uuid, int) to authenticated;
