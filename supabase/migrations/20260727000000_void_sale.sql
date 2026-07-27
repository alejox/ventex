-- Anulación de venta (void).
--
-- Revierte una venta completa: devuelve el stock, registra movimientos
-- de inventario y, si fue en efectivo dentro de un turno abierto, registra
-- una salida de caja por el total devuelto.
--
-- Reglas:
--   - Solo ventas con status = 'completed'
--   - Workers deben tener caja abierta (misma validación que create_sale)
--   - Todo es atómico: si algo falla, hace rollback

create or replace function public.void_sale(
  p_sale_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
  declare
    v_auth        uuid := (select auth.uid());
    v_uid         uuid := public.get_effective_user_id();
    v_is_worker   boolean := false;
    v_shift_id    uuid;
    v_sale        record;
    v_item        record;
    v_return_units integer;
    v_sale_number integer;
  begin
    if v_auth is null then
      raise exception 'No autenticado';
    end if;

    -- Verificar la venta
    select s.id, s.status, s.total, s.payment_method, s.shift_id, s.sale_number
    into v_sale
    from sales s
    where s.id = p_sale_id and s.user_id = v_uid;

    if not found then
      raise exception 'Venta no encontrada';
    end if;

    if v_sale.status != 'completed' then
      raise exception 'Solo se pueden anular ventas completadas';
    end if;

    v_sale_number := v_sale.sale_number;

    -- Workers necesitan caja abierta
    select coalesce(is_worker, false) into v_is_worker
    from public.profiles where id = v_auth;

    if v_is_worker then
      select id into v_shift_id from public.shifts
      where worker_id = v_auth and status = 'open';
      if v_shift_id is null then
        raise exception 'Debes abrir turno antes de anular una venta';
      end if;
    end if;

    -- Marcar venta como anulada
    update sales set status = 'void' where id = p_sale_id;

    -- Devolver stock y registrar movimientos
    for v_item in
      select si.product_id, si.quantity, si.unit_kind, si.units_per_item
      from sale_items si
      where si.sale_id = p_sale_id and si.product_id is not null
    loop
      if v_item.unit_kind = 'package' then
        v_return_units := v_item.quantity * v_item.units_per_item;
      else
        v_return_units := v_item.quantity;
      end if;

      -- Devolver stock
      update products
      set stock_level = stock_level + v_return_units
      where id = v_item.product_id;

      -- Registrar movimiento de inventario
      insert into inventory_movements (
        product_id, quantity, type, reference_type, reference_id, created_by, user_id, notes
      ) values (
        v_item.product_id,
        v_return_units,
        'in',
        'sale_void',
        p_sale_id,
        v_auth,
        v_uid,
        'Anulación de venta #' || v_sale_number::text
      );
    end loop;

    -- Si fue efectivo y hay turno, registrar salida de caja
    if v_sale.payment_method = 'efectivo' and v_sale.shift_id is not null then
      insert into cash_movements (amount, reason, shift_id, user_id, worker_id)
      values (
        -v_sale.total,
        'Devolución - Venta #' || v_sale_number::text || ' anulada',
        v_sale.shift_id,
        v_uid,
        v_auth
      );
    end if;
  end;
$function$;
