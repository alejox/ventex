-- Numeración de pedidos de compra con contador por negocio.
--
-- Antes `set_purchase_order_number` calculaba max(order_number) + 1: dos altas
-- simultáneas del mismo negocio leían el mismo máximo y la segunda chocaba
-- contra `purchase_orders_number_per_tenant` con un 23505 crudo.
--
-- Ahora el número sale de una fila por negocio en `purchase_order_counters`,
-- incrementada con INSERT ... ON CONFLICT DO UPDATE: la fila queda bloqueada
-- hasta el fin de la transacción, así que dos altas concurrentes se ordenan en
-- vez de leer el mismo máximo. Los números existentes no cambian: el contador
-- arranca en el máximo actual de cada negocio.

create table if not exists public.purchase_order_counters (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  last_number bigint not null default 0
);

-- Solo la escribe el trigger (SECURITY DEFINER). Nadie desde el cliente.
alter table public.purchase_order_counters enable row level security;
revoke all on public.purchase_order_counters from anon, authenticated;

insert into public.purchase_order_counters (user_id, last_number)
select po.user_id, max(po.order_number)
  from public.purchase_orders po
 group by po.user_id
on conflict (user_id) do update
  set last_number = greatest(public.purchase_order_counters.last_number, excluded.last_number);

create or replace function public.set_purchase_order_number()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := coalesce(public.get_effective_user_id(), new.user_id);
  v_n   bigint;
begin
  if new.order_number is null or new.order_number = 0 then
    -- Primera vez del negocio: arranca en su máximo actual (por si hubiera
    -- pedidos anteriores al contador). Con fila existente, +1 bloqueando.
    insert into public.purchase_order_counters as c (user_id, last_number)
    values (
      v_uid,
      (select coalesce(max(po.order_number), 0) + 1
         from public.purchase_orders po
        where po.user_id = v_uid)
    )
    on conflict (user_id) do update
      set last_number = c.last_number + 1
    returning c.last_number into v_n;
    new.order_number := v_n;
  else
    -- Número explícito (solo código de servidor): el contador no puede quedar
    -- por detrás, o el próximo automático chocaría.
    insert into public.purchase_order_counters as c (user_id, last_number)
    values (v_uid, new.order_number)
    on conflict (user_id) do update
      set last_number = greatest(c.last_number, excluded.last_number);
  end if;
  return new;
end;
$function$;
