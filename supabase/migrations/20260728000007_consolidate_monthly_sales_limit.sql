-- Una sola fuente de verdad para el tope de ventas del plan.
--
-- Había dos: assert_monthly_sales_limit() (correcta, pero muerta) y el bloque
-- que se agregó en create_sale en 20260728000006.
--
-- Por qué la original nunca corría: su trigger es BEFORE INSERT sobre sales y
-- exige `coalesce(new.total,0) > 0`, pero create_sale inserta la venta SIN
-- total y lo calcula después con un UPDATE. new.total llegaba nulo, la
-- condición daba falso y la función jamás se llamaba desde el POS. Por eso un
-- negocio en plan Gratis llegó a $3.370.400 con tope de $1.000.000.
--
-- Ahora create_sale la invoca de forma explícita con p_add = 0 (evalúa lo ya
-- acumulado, sin adivinar el total de la venta en curso, que todavía no existe)
-- y el trigger queda como red de seguridad para inserts directos a sales que sí
-- traen total.
--
-- El mensaje gana el prefijo LIMITE_VENTAS: que el POS reconoce para abrir el
-- modal de upgrade en vez de mostrar un error suelto.

create or replace function public.assert_monthly_sales_limit(p_uid uuid, p_add numeric)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_max numeric;
  v_month_total numeric;
begin
  select pl.max_monthly_sales into v_max
  from public.subscriptions s
  join public.plans pl on pl.id = s.plan_id
  where s.user_id = p_uid;

  if not found then
    select max_monthly_sales into v_max from public.plans where id = 'gratis';
  end if;

  if v_max is null then
    return; -- ilimitado (Oro)
  end if;

  select coalesce(sum(total), 0) into v_month_total
  from public.sales
  where user_id = p_uid
    and status = 'completed'
    and created_at >= date_trunc('month', now());

  if v_month_total + coalesce(p_add, 0) >= v_max then
    raise exception 'LIMITE_VENTAS: Alcanzaste el tope de ventas de tu plan para este mes.'
      using errcode = 'P0001';
  end if;
end;
$$;
