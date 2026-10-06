-- Un trabajador sin `inventory_edit` no podía vender productos con stock:
-- `create_sale` descuenta stock con un UPDATE y este guard comparaba la fila
-- entera. En un BEFORE trigger la columna GENERADA `allows_fractions` llega en
-- NULL en NEW (se calcula después), así que NEW siempre parecía distinto de OLD
-- y saltaba "no tienes permiso para editar productos". Se excluye de la
-- comparación, igual que stock_level y updated_at. Mensajes en tuteo.
create or replace function public.products_guard_edit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.purchase_price is distinct from old.purchase_price
     and not public.worker_can('inventory_costs') then
    raise exception 'SIN_PERMISO: no tienes permiso para cambiar el costo de un producto'
      using errcode = '42501';
  end if;

  if public.worker_can('inventory_edit') then
    return new;
  end if;

  if (to_jsonb(new) - 'stock_level' - 'updated_at' - 'allows_fractions')
     is distinct from
     (to_jsonb(old) - 'stock_level' - 'updated_at' - 'allows_fractions') then
    raise exception 'SIN_PERMISO: no tienes permiso para editar productos'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
