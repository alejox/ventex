-- Mis comisiones: cada miembro del equipo con ficha ve SUS comisiones.
--
-- Por qué RPC y no una consulta a `sale_items`: la RLS de `sale_items` es por
-- negocio (pos|sales|panel), no por persona. Filtrar por staff_id en el cliente
-- dejaría que cualquiera pidiera las líneas de otro cambiando un parámetro.
-- Acá el staff_id NO es un parámetro: sale de `public.current_staff_id()`
-- (membresía activa `member` de la sesión; NULL para el dueño).
--
-- Mismas definiciones que la pantalla del dueño (services/staff.service.ts):
--   - la comisión es `sale_items.commission_amount`, congelada al vender;
--   - pagada = `commission_settlement_id IS NOT NULL`;
--   - solo ventas `completed`: una venta anulada no se cobra (el dueño tampoco
--     la cuenta en devengado ni en "Por pagar");
--   - "Por pagar" = todo lo pendiente sin límite de fecha, con comisión > 0.
--
-- Sin ficha (dueño, o miembro sin staff_id) el RPC RECHAZA con 42501
-- 'SIN_FICHA' en vez de devolver vacío: un vacío se lee como "no te deben
-- nada", que es una afirmación falsa para quien simplemente no tiene ficha.
--
-- Nada de datos de clientes ni de otros miembros: ni nombre del cliente, ni
-- método de pago de la venta, ni staff ajeno.

create or replace function public.my_commission_lines(p_from timestamptz, p_to timestamptz)
returns table (
  sale_item_id uuid,
  sale_id uuid,
  sale_number bigint,
  sold_at timestamptz,
  item_name text,
  quantity numeric,
  line_net numeric,
  commission_amount numeric,
  settled boolean,
  settlement_paid_on date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.current_staff_id();
  v_tenant uuid := public.get_effective_user_id();
begin
  if v_staff is null or v_tenant is null then
    raise exception 'SIN_FICHA' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '370 days' then
    raise exception 'RANGO_INVALIDO' using errcode = '22023';
  end if;

  return query
  select
    si.id,
    s.id,
    s.sale_number,
    s.created_at,
    si.product_name,
    si.quantity,
    round(si.line_total - coalesce(si.discount_amount, 0), 2),
    coalesce(si.commission_amount, 0),
    si.commission_settlement_id is not null,
    cs.paid_on
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  left join public.commission_settlements cs
    on cs.id = si.commission_settlement_id and cs.user_id = v_tenant
  where si.user_id = v_tenant
    and s.user_id = v_tenant
    and si.staff_id = v_staff
    and s.status = 'completed'
    and s.created_at >= p_from
    and s.created_at < p_to
  -- Orden total (desempate por id único): el cliente pagina con .range() y
  -- repite este mismo orden, así ninguna página pisa ni saltea filas.
  order by s.created_at desc, si.id asc;
end;
$$;

comment on function public.my_commission_lines(timestamptz, timestamptz) is
  'Líneas de venta (ventas completadas) del miembro de la sesión (current_staff_id) en [p_from, p_to), máx. 370 días. Sin ficha: 42501 SIN_FICHA.';

-- Totales del período, calculados ACÁ y no sumando en el cliente: PostgREST
-- corta cada respuesta de `my_commission_lines` en max-rows (1.000), y una
-- tarjeta que dependiera de cuántas líneas se cargaron saldría más baja que la
-- del dueño. Mismo filtro exacto que `my_commission_lines`.
create or replace function public.my_commission_period_totals(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.current_staff_id();
  v_tenant uuid := public.get_effective_user_id();
  v_out jsonb;
begin
  if v_staff is null or v_tenant is null then
    raise exception 'SIN_FICHA' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '370 days' then
    raise exception 'RANGO_INVALIDO' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'earned', round(coalesce(sum(si.commission_amount), 0), 2),
    'paid_in_period', round(coalesce(sum(si.commission_amount) filter (where si.commission_settlement_id is not null), 0), 2),
    'pending_in_period', round(coalesce(sum(si.commission_amount) filter (where si.commission_settlement_id is null), 0), 2),
    'lines_count', count(*)
  )
    into v_out
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where si.user_id = v_tenant
    and s.user_id = v_tenant
    and si.staff_id = v_staff
    and s.status = 'completed'
    and s.created_at >= p_from
    and s.created_at < p_to;

  return v_out;
end;
$$;

comment on function public.my_commission_period_totals(timestamptz, timestamptz) is
  'Devengado, pagado y pendiente del miembro de la sesión (current_staff_id) en [p_from, p_to): mismo filtro que my_commission_lines. Sin ficha: 42501 SIN_FICHA.';

-- Resumen: lo pendiente de por vida (el "Por pagar" del dueño para esta
-- persona) y sus últimas liquidaciones, incluidas las anuladas (el dueño las
-- muestra tachadas; esconderlas haría desaparecer un pago que sí se vio).
create or replace function public.my_commission_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.current_staff_id();
  v_tenant uuid := public.get_effective_user_id();
  v_pending numeric;
  v_count integer;
  v_settlements jsonb;
begin
  if v_staff is null or v_tenant is null then
    raise exception 'SIN_FICHA' using errcode = '42501';
  end if;

  select coalesce(sum(si.commission_amount), 0), count(*)
    into v_pending, v_count
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where si.user_id = v_tenant
    and s.user_id = v_tenant
    and si.staff_id = v_staff
    and s.status = 'completed'
    and si.commission_settlement_id is null
    and si.commission_amount > 0;

  select coalesce(jsonb_agg(x order by x.paid_on desc, x.created_at desc), '[]'::jsonb)
    into v_settlements
  from (
    select cs.id, cs.paid_on, cs.payment_method, cs.total_amount, cs.items_count,
           cs.period_from, cs.period_to, cs.status, cs.created_at
    from public.commission_settlements cs
    where cs.user_id = v_tenant
      and cs.staff_id = v_staff
    order by cs.paid_on desc, cs.created_at desc
    limit 24
  ) x;

  return jsonb_build_object(
    'pending_total', round(v_pending, 2),
    'pending_count', v_count,
    'settlements', v_settlements
  );
end;
$$;

comment on function public.my_commission_summary() is
  'Por cobrar (todo lo pendiente) y últimas 24 liquidaciones del miembro de la sesión (current_staff_id). Sin ficha: 42501 SIN_FICHA.';

revoke all on function public.my_commission_lines(timestamptz, timestamptz) from public, anon;
revoke all on function public.my_commission_summary() from public, anon;
revoke all on function public.my_commission_period_totals(timestamptz, timestamptz) from public, anon;
grant execute on function public.my_commission_lines(timestamptz, timestamptz) to authenticated;
grant execute on function public.my_commission_summary() to authenticated;
grant execute on function public.my_commission_period_totals(timestamptz, timestamptz) to authenticated;
