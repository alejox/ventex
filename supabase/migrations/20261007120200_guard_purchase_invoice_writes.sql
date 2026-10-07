-- Compras (invoices.type = 'compra'): las escrituras que mueven stock o plata
-- solo entran por las RPC SECURITY DEFINER.
--
-- Las policies `workspace_invoices_write` / `workspace_invoice_items_write` son
-- FOR ALL para `billing` o `inventory_stock`, y las necesitan las facturas de
-- venta y cotizaciones (billing.service.ts escribe sus líneas directo). Por eso
-- no se tocan grants ni policies: se agregan triggers que distinguen por TIPO.
--
-- Sin esto, una llamada directa a la API podía:
--   - des-anular una compra y volver a anularla (stock restado dos veces);
--   - poner status = 'cancelled' con un update (el stock nunca volvía);
--   - borrar una compra (las líneas caen en cascada, el stock queda sumado);
--   - insertar / borrar invoice_items de una compra sin mover stock;
--   - escribir subtotal/total a mano, desalineados de las líneas.
--
-- "Desde el cliente" = current_user es `authenticated`/`anon` (mismo criterio
-- que guard_commission_expense). Dentro de una función SECURITY DEFINER el
-- current_user es su dueño, así que las RPC pasan. Anular exige además el flag
-- de transacción `app.cancelling_purchase`, que solo levanta
-- cancel_purchase_invoice.
--
-- `paid_at` (lo agrega otra migración con su propio trigger) no se mira: se
-- puede actualizar libremente.

create or replace function public.guard_purchase_invoice_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_from_client boolean := current_user in ('authenticated', 'anon');
  v_sub         numeric;
  t             record;
begin
  if tg_op = 'DELETE' then
    if old.type = 'compra' and v_from_client
       and exists (select 1 from public.invoice_items ii where ii.invoice_id = old.id) then
      raise exception 'COMPRA_NO_SE_BORRA: una compra con productos no se borra; anúlala para devolver el stock'
        using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.type <> 'compra' and new.type <> 'compra' then
    return new;
  end if;

  if new.type is distinct from old.type then
    raise exception 'COMPRA_TIPO_FIJO: una compra no se convierte en otro tipo de documento'
      using errcode = '42501';
  end if;

  if old.status = 'cancelled' and new.status is distinct from 'cancelled' then
    raise exception 'COMPRA_ANULADA: una compra anulada no se puede reactivar; registra una compra nueva'
      using errcode = '42501';
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and coalesce(current_setting('app.cancelling_purchase', true), '') <> 'on' then
    raise exception 'COMPRA_ANULAR_CON_ACCION: para anular una compra usa la acción Anular, que devuelve el stock'
      using errcode = '42501';
  end if;

  -- Totales: si el cliente toca la parte de plata, la base la recalcula desde
  -- las líneas guardadas. El descuento y la tasa sí son datos de entrada.
  if v_from_client
     and (new.subtotal, new.discount_amount, new.tax_rate, new.tax_amount, new.total)
         is distinct from
         (old.subtotal, old.discount_amount, old.tax_rate, old.tax_amount, old.total) then
    select coalesce(sum(ii.line_total), 0) into v_sub
      from public.invoice_items ii
     where ii.invoice_id = new.id;

    if new.discount_amount < 0 or new.discount_amount > round(v_sub, 2) then
      raise exception 'DESCUENTO_COMPRA_INVALIDO: el descuento no puede ser negativo ni mayor que el subtotal'
        using errcode = '22023';
    end if;

    if new.tax_rate < 0 or new.tax_rate > 1 then
      raise exception 'TASA_IVA_INVALIDA: la tasa de IVA debe estar entre 0 y 100 %%'
        using errcode = '22023';
    end if;

    select * into t from public.purchase_totals(v_sub, new.discount_amount, new.tax_rate);
    new.subtotal := t.subtotal;
    new.tax_amount := t.tax_amount;
    new.total := t.total;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_guard_purchase_write on public.invoices;
create trigger invoices_guard_purchase_write
  before update or delete on public.invoices
  for each row execute function public.guard_purchase_invoice_write();

create or replace function public.guard_purchase_invoice_items_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and exists (select 1 from public.invoices i where i.id = old.invoice_id and i.type = 'compra') then
    raise exception 'COMPRA_LINEAS_POR_RPC: las líneas de una compra solo se cambian guardando la compra'
      using errcode = '42501';
  end if;

  if tg_op in ('INSERT', 'UPDATE')
     and exists (select 1 from public.invoices i where i.id = new.invoice_id and i.type = 'compra') then
    raise exception 'COMPRA_LINEAS_POR_RPC: las líneas de una compra solo se cambian guardando la compra'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_items_guard_purchase_write on public.invoice_items;
create trigger invoice_items_guard_purchase_write
  before insert or update or delete on public.invoice_items
  for each row execute function public.guard_purchase_invoice_items_write();

-- Anular levanta el flag que el guard exige. Mismo cuerpo que el vigente,
-- más el set_config alrededor del update.
create or replace function public.cancel_purchase_invoice(p_invoice_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_tenant         uuid := public.get_effective_user_id();
  v_actor          uuid := (select auth.uid());
  v_invoice_number bigint;
  v_status         text;
  v_row            record;
  v_qty            numeric(12,3);
  v_tracks         boolean;
begin
  if v_tenant is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;

  select i.invoice_number, i.status
    into v_invoice_number, v_status
    from public.invoices i
   where i.id = p_invoice_id
     and i.user_id = v_tenant
     and i.type = 'compra'
     for update;

  if not found then
    raise exception 'Factura de compra no encontrada';
  end if;

  if v_status = 'cancelled' then
    raise exception 'La compra ya está anulada' using errcode = '42501';
  end if;

  if not public.worker_can('inventory_stock') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  perform set_config('app.cancelling_purchase', 'on', true);
  update public.invoices set status = 'cancelled' where id = p_invoice_id;
  perform set_config('app.cancelling_purchase', 'off', true);

  for v_row in
    select ii.product_id, sum(ii.quantity) as qty
      from public.invoice_items ii
     where ii.invoice_id = p_invoice_id
       and ii.product_id is not null
     group by ii.product_id
  loop
    v_qty := round(v_row.qty, 3);
    continue when v_qty = 0;

    select coalesce(pr.tracks_stock, true) into v_tracks
      from public.products pr
     where pr.id = v_row.product_id
       and pr.user_id = v_tenant
     for update;

    if not found then
      raise exception 'Producto no encontrado';
    end if;

    continue when not v_tracks;

    update public.products
       set stock_level = stock_level - v_qty
     where id = v_row.product_id
       and user_id = v_tenant;

    insert into public.inventory_movements (
      user_id, created_by, product_id, type, quantity, reference_type, reference_id, notes
    ) values (
      v_tenant, v_actor, v_row.product_id, 'out', v_qty, 'cancellation', p_invoice_id,
      'Anulación de compra #' || v_invoice_number
    );
  end loop;
end;
$function$;
