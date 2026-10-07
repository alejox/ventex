-- Pedidos de compra: guards de escritura desde el cliente + RPC de guardado.
--
-- 1) `purchase_orders` / `purchase_order_items` se escribían directo desde el
--    navegador sin ninguna regla: se podía marcar un pedido como recibido sin
--    factura, o reescribir las líneas de un pedido ya emitido o recibido.
--    Mismo patrón que los guards de compras (20261007120200): solo se aplica a
--    escrituras del cliente (`current_user` authenticated/anon). Las RPC
--    SECURITY DEFINER corren como `postgres` y pasan.
--
--    Transiciones permitidas desde el cliente:
--      draft  -> issued | cancelled
--      issued -> completed | cancelled
--    `received` SOLO la pone `receive_purchase_order` (junto con invoice_id).
--    received / completed / cancelled son finales: no se tocan.
--    Las líneas solo cambian con el pedido en borrador.
--    Un pedido recibido no se borra (tiene una compra atada).
--
-- 2) `save_purchase_order(id|null, header, items)`: alta o edición de borrador
--    en una transacción (antes eran tres llamadas sueltas: si fallaba el
--    insert de líneas, el borrador quedaba vacío).

create or replace function public.guard_purchase_order_write()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'received' then
      raise exception 'PEDIDO_RECIBIDO_NO_SE_BORRA: un pedido recibido tiene una compra registrada y no se borra'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'issued')
       or new.invoice_id is not null
       or new.received_at is not null then
      raise exception 'PEDIDO_ESTADO_INVALIDO: un pedido nuevo es borrador o emitido'
        using errcode = '42501';
    end if;
    new.completed_at := null;
    if new.status = 'issued' and new.issued_at is null then
      new.issued_at := now();
    end if;
    return new;
  end if;

  -- UPDATE
  if new.invoice_id is distinct from old.invoice_id
     or new.received_at is distinct from old.received_at
     or (new.status = 'received' and old.status is distinct from 'received') then
    raise exception 'PEDIDO_RECEPCION_POR_RPC: un pedido solo se marca recibido con la acción Recibir, que registra la compra'
      using errcode = '42501';
  end if;

  if new.order_number is distinct from old.order_number
     or new.user_id is distinct from old.user_id then
    raise exception 'PEDIDO_ESTADO_INVALIDO: el número y el negocio de un pedido no cambian'
      using errcode = '42501';
  end if;

  if old.status in ('received', 'completed', 'cancelled') then
    if (new.status, new.distributor_id, new.notes, new.issued_at, new.completed_at)
       is distinct from
       (old.status, old.distributor_id, old.notes, old.issued_at, old.completed_at) then
      raise exception 'PEDIDO_CERRADO: este pedido ya está cerrado y no se puede cambiar'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and not (
       (old.status = 'draft'  and new.status in ('issued', 'cancelled'))
       or (old.status = 'issued' and new.status in ('completed', 'cancelled'))
     ) then
    raise exception 'PEDIDO_TRANSICION_INVALIDA: el pedido no puede pasar de % a %', old.status, new.status
      using errcode = '42501';
  end if;

  -- Fechas de estado: las pone la base, no el reloj del navegador.
  if new.status = 'issued' and old.status = 'draft' then
    new.issued_at := coalesce(new.issued_at, now());
  end if;
  if new.status = 'completed' and old.status = 'issued' then
    new.completed_at := now();
  elsif new.completed_at is distinct from old.completed_at then
    new.completed_at := old.completed_at;
  end if;

  return new;
end;
$function$;

drop trigger if exists purchase_orders_guard_write on public.purchase_orders;
create trigger purchase_orders_guard_write
  before insert or update or delete on public.purchase_orders
  for each row execute function public.guard_purchase_order_write();

create or replace function public.guard_purchase_order_items_write()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_status text;
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select po.status into v_status
      from public.purchase_orders po
     where po.id = old.purchase_order_id;
    if found and v_status <> 'draft' then
      raise exception 'PEDIDO_NO_EDITABLE: solo se cambian los productos de un pedido en borrador'
        using errcode = '42501';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select po.status into v_status
      from public.purchase_orders po
     where po.id = new.purchase_order_id;
    if found and v_status <> 'draft' then
      raise exception 'PEDIDO_NO_EDITABLE: solo se cambian los productos de un pedido en borrador'
        using errcode = '42501';
    end if;
  end if;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists purchase_order_items_guard_write on public.purchase_order_items;
create trigger purchase_order_items_guard_write
  before insert or update or delete on public.purchase_order_items
  for each row execute function public.guard_purchase_order_items_write();

create or replace function public.save_purchase_order(
  p_order_id uuid,
  p_header   jsonb,
  p_items    jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tenant uuid := public.get_effective_user_id();
  v_id     uuid := p_order_id;
  v_status text := coalesce(nullif(p_header->>'status', ''), 'draft');
  v_dist   uuid := nullif(p_header->>'distributor_id', '')::uuid;
  v_notes  text := nullif(btrim(coalesce(p_header->>'notes', '')), '');
  v_cur    text;
begin
  if v_tenant is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;

  if not public.worker_can('inventory_stock') then
    raise exception 'SIN_PERMISO: no tienes permiso para guardar pedidos' using errcode = '42501';
  end if;

  if v_status not in ('draft', 'issued') then
    raise exception 'PEDIDO_ESTADO_INVALIDO: un pedido se guarda como borrador o emitido'
      using errcode = '22023';
  end if;

  if v_dist is not null and not exists (
    select 1 from public.distributors d where d.id = v_dist and d.user_id = v_tenant
  ) then
    raise exception 'PROVEEDOR_NO_ENCONTRADO: elige un proveedor de este negocio'
      using errcode = '22023';
  end if;

  if v_status = 'issued' and v_dist is null then
    raise exception 'PEDIDO_SIN_PROVEEDOR: asigna un proveedor antes de emitir el pedido'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'PEDIDO_SIN_LINEAS: agrega al menos un producto al pedido' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_items) as item
     where coalesce(nullif(item->>'quantity', '')::numeric, 0) <= 0
        or coalesce(nullif(item->>'unit_price', '')::numeric, 0) < 0
        or btrim(coalesce(item->>'product_name', '')) = ''
  ) then
    raise exception 'LINEA_PEDIDO_INVALIDA: una línea del pedido tiene cantidad, costo o nombre inválido'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_items) as item
     where nullif(item->>'product_id', '') is not null
       and not exists (
         select 1 from public.products pr
          where pr.id = (item->>'product_id')::uuid
            and pr.user_id = v_tenant
       )
  ) then
    raise exception 'PRODUCTO_NO_ENCONTRADO: un producto del pedido ya no existe en este negocio'
      using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.purchase_orders (user_id, distributor_id, notes, status, issued_at)
    values (v_tenant, v_dist, v_notes, v_status, case when v_status = 'issued' then now() end)
    returning id into v_id;
  else
    select po.status into v_cur
      from public.purchase_orders po
     where po.id = v_id
       and po.user_id = v_tenant
       for update;

    if not found then
      raise exception 'PEDIDO_NO_ENCONTRADO: el pedido no existe en este negocio' using errcode = '22023';
    end if;

    if v_cur <> 'draft' then
      raise exception 'PEDIDO_NO_EDITABLE: solo se edita un pedido en borrador' using errcode = '22023';
    end if;

    update public.purchase_orders
       set distributor_id = v_dist,
           notes = v_notes,
           status = v_status,
           issued_at = case when v_status = 'issued' then now() else issued_at end,
           updated_at = now()
     where id = v_id;

    delete from public.purchase_order_items where purchase_order_id = v_id;
  end if;

  insert into public.purchase_order_items (
    user_id, purchase_order_id, product_id, product_name, sku, quantity, unit_price
  )
  select v_tenant,
         v_id,
         nullif(item->>'product_id', '')::uuid,
         btrim(item->>'product_name'),
         nullif(btrim(coalesce(item->>'sku', '')), ''),
         (item->>'quantity')::numeric,
         coalesce(nullif(item->>'unit_price', '')::numeric, 0)
    from jsonb_array_elements(p_items) as item;

  return v_id;
end;
$function$;

revoke all on function public.save_purchase_order(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_purchase_order(uuid, jsonb, jsonb) to authenticated;
