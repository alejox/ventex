-- El consecutivo se calculaba con user_id todavía nulo.
--
-- Los triggers BEFORE INSERT corren en orden alfabético de su nombre:
-- `set_purchase_orders_number` va ANTES que `set_purchase_orders_user_id`
-- (n < u), así que cuando se buscaba el máximo del negocio, new.user_id aún no
-- había sido resuelto por set_user_id. `where user_id = null` no matchea nada,
-- el máximo daba 0 y TODOS los pedidos nacían con número 1 — el segundo insert
-- reventaba contra el índice único por tenant.
--
-- Se resuelve sin depender del orden: el trigger calcula la tenencia por su
-- cuenta con la misma función que usa set_user_id.

create or replace function public.set_purchase_order_number()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := coalesce(new.user_id, public.get_effective_user_id());
begin
  if new.order_number is null or new.order_number = 0 then
    select coalesce(max(order_number), 0) + 1 into new.order_number
    from public.purchase_orders
    where user_id = v_uid;
  end if;
  return new;
end;
$$;
