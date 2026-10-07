-- Recetas y producción (4/5): lotes de fabricación.
--
-- register_production_batch: consume los insumos de la receta de PRODUCCIÓN,
-- suma stock del preparado, deja kardex ('production'), guarda el lote con su
-- costo y actualiza el costo del preparado. void_production_batch revierte
-- EXACTAMENTE lo que el lote movió ('production_void').
--
-- Costo del preparado: si TODOS los insumos tienen costo, purchase_price pasa a
-- ser el costo por unidad de este lote (en la unidad del producto; por CAJA si
-- units_per_package > 1, igual que el resto de la app). Último evento gana:
-- una compra posterior del mismo producto lo vuelve a fijar
-- (sync_products_last_cost). Anular un lote no toca el costo, igual que anular
-- una compra. El costo se escribe con el flag app.syncing_purchase_cost en un
-- UPDATE aparte, así products_guard_edit deja pasar a quien solo tiene
-- `production` (sin inventory_costs).
--
-- Insumo que no alcanza: respeta settings.allow_oversell. Con sobreventa
-- permitida (el default) el lote se registra, el insumo queda negativo, avisa
-- y viaja en `negative_inputs`; sin ella, INSUMO_INSUFICIENTE.

create or replace function public.register_production_batch(
  p_product_id uuid,
  p_output_qty numeric default null,
  p_batches numeric default null,
  p_notes text default null,
  p_client_batch_id uuid default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_tenant     uuid := public.get_effective_user_id();
  v_actor      uuid := auth.uid();
  v_membership uuid := public.get_active_membership_id();
  v_recipe     public.recipes%rowtype;
  v_product    public.products%rowtype;
  v_existing   public.production_batches%rowtype;
  v_yield      numeric;
  v_factor     numeric;
  v_output     numeric(12,3);
  v_batches    numeric(12,3);
  v_allow_over boolean := true;
  v_number     bigint;
  v_batch_id   uuid;
  v_row        record;
  v_q          numeric(12,3);
  v_new        numeric;
  v_unit_cost  numeric;
  v_line_cost  numeric(12,2);
  v_total      numeric(12,2) := 0;
  v_complete   boolean := true;
  v_inputs     integer := 0;
  v_negative   jsonb := '[]'::jsonb;
  v_cost_out   numeric(14,4);
  v_cost_updated boolean := false;
  v_output_applied boolean;
begin
  if v_actor is null or v_tenant is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.production_module_enabled() then
    raise exception 'MODULO_PRODUCCION_INACTIVO' using errcode = '42501';
  end if;
  if not public.worker_can('production') then
    raise exception 'SIN_PERMISO: no tienes permiso para registrar lotes de producción' using errcode = '42501';
  end if;

  -- Reintento del mismo lote (doble clic, respuesta perdida): devuelve el que
  -- ya existe sin mover nada.
  if p_client_batch_id is not null then
    select * into v_existing
      from public.production_batches b
     where b.user_id = v_tenant and b.client_batch_id = p_client_batch_id;
    if found then
      return jsonb_build_object(
        'batch_id', v_existing.id,
        'batch_number', v_existing.batch_number,
        'output_qty', v_existing.output_qty,
        'output_unit', v_existing.output_unit,
        'cost_updated', false,
        'negative_inputs', '[]'::jsonb,
        'already_registered', true,
        'total_cost', case when public.worker_can('inventory_costs') then v_existing.total_cost end
      );
    end if;
  end if;

  if (coalesce(p_output_qty, 0) > 0) = (coalesce(p_batches, 0) > 0) then
    raise exception 'LOTE_CANTIDAD_INVALIDA: indica cuánto produjiste o cuántas tandas hiciste' using errcode = '22023';
  end if;

  -- Recetas antes que productos.
  select * into v_recipe
    from public.recipes r
   where r.user_id = v_tenant and r.product_id = p_product_id and r.kind = 'production'
   for share;
  if not found then
    raise exception 'RECETA_NO_ENCONTRADA: este producto no tiene receta de producción' using errcode = 'P0002';
  end if;

  perform 1 from public.products pr
   where pr.user_id = v_tenant
     and (pr.id = p_product_id
          or pr.id in (select ri.ingredient_id from public.recipe_items ri where ri.recipe_id = v_recipe.id))
   order by pr.id
     for update;

  select * into v_product from public.products
   where id = p_product_id and user_id = v_tenant;
  if not found then
    raise exception 'Producto no encontrado' using errcode = 'P0002';
  end if;

  v_yield := v_recipe.yield_qty * public.unit_factor(v_recipe.yield_unit, v_product.unit);
  if v_yield is null or v_yield <= 0 then
    raise exception 'RECETA_RENDIMIENTO_INVALIDO' using errcode = '22023';
  end if;

  if coalesce(p_batches, 0) > 0 then
    v_batches := round(p_batches, 3);
    v_output  := round(v_batches * v_yield, 3);
    v_factor  := v_batches;
  else
    v_output  := round(p_output_qty, 3);
    v_factor  := v_output / v_yield;
    v_batches := round(v_factor, 3);
  end if;
  if v_output is null or v_output <= 0 then
    raise exception 'LOTE_CANTIDAD_INVALIDA' using errcode = '22023';
  end if;
  if v_output <> trunc(v_output) and not coalesce(v_product.allows_fractions, false) then
    raise exception 'CANTIDAD_ENTERA: % se produce por % entera(s)', v_product.name, v_product.unit
      using errcode = '22023';
  end if;

  select coalesce(s.allow_oversell, true) into v_allow_over
    from public.settings s where s.user_id = v_tenant;
  v_allow_over := coalesce(v_allow_over, true);

  insert into public.production_batch_counters as c (user_id, last_number)
  values (v_tenant, 1)
  on conflict (user_id) do update set last_number = c.last_number + 1
  returning last_number into v_number;

  v_output_applied := coalesce(v_product.tracks_stock, false);

  insert into public.production_batches (
    user_id, batch_number, product_id, recipe_id, batches, output_qty, output_unit,
    output_stock_applied, notes, client_batch_id, created_by, membership_id
  ) values (
    v_tenant, v_number, v_product.id, v_recipe.id, v_batches, v_output, v_product.unit,
    v_output_applied, nullif(btrim(coalesce(p_notes, '')), ''), p_client_batch_id, v_actor, v_membership
  )
  returning id into v_batch_id;

  -- Insumos.
  for v_row in
    select ri.quantity, ri.unit as line_unit, p.id, p.name, p.unit, p.stock_level, p.tracks_stock,
           p.purchase_price, p.units_per_package
      from public.recipe_items ri
      join public.products p on p.id = ri.ingredient_id and p.user_id = v_tenant
     where ri.recipe_id = v_recipe.id
     order by p.id
  loop
    v_q := round(v_row.quantity * public.unit_factor(v_row.line_unit, v_row.unit) * v_factor, 3);
    continue when v_q is null or v_q <= 0;
    v_inputs := v_inputs + 1;

    v_unit_cost := round(coalesce(v_row.purchase_price, 0) / greatest(coalesce(v_row.units_per_package, 1), 1), 4);
    if v_unit_cost <= 0 then
      v_complete := false;
    end if;
    v_line_cost := round(v_q * v_unit_cost, 2);
    v_total := v_total + v_line_cost;

    if coalesce(v_row.tracks_stock, false) then
      if not v_allow_over and v_row.stock_level - v_q < 0 then
        raise exception 'INSUMO_INSUFICIENTE: % — hay % % y el lote necesita %', v_row.name, v_row.stock_level, v_row.unit, v_q
          using errcode = '22023';
      end if;

      update public.products
         set stock_level = stock_level - v_q, updated_at = now()
       where id = v_row.id and user_id = v_tenant
      returning stock_level into v_new;

      insert into public.inventory_movements (
        user_id, created_by, product_id, type, quantity, reference_type, reference_id, notes
      ) values (
        v_tenant, v_actor, v_row.id, 'out', v_q, 'production', v_batch_id,
        'Lote #' || v_number::text || ' · ' || v_product.name
      );

      perform public.notify_low_ingredient(v_tenant, v_row.id, v_row.stock_level, v_new);

      if v_new < 0 then
        v_negative := v_negative || jsonb_build_object(
          'product_id', v_row.id, 'name', v_row.name, 'stock', v_new, 'unit', v_row.unit);
      end if;
    end if;

    insert into public.production_batch_items (
      user_id, batch_id, ingredient_id, ingredient_name, quantity, unit, stock_applied, unit_cost, line_cost
    ) values (
      v_tenant, v_batch_id, v_row.id, v_row.name, v_q, v_row.unit,
      coalesce(v_row.tracks_stock, false), v_unit_cost, v_line_cost
    );
  end loop;

  if v_inputs = 0 then
    raise exception 'LOTE_SIN_INSUMOS: con esa cantidad la receta no gasta ningún insumo' using errcode = '22023';
  end if;

  -- Salida: el preparado.
  if v_output_applied then
    update public.products
       set stock_level = stock_level + v_output, updated_at = now()
     where id = v_product.id and user_id = v_tenant;

    insert into public.inventory_movements (
      user_id, created_by, product_id, type, quantity, reference_type, reference_id, notes
    ) values (
      v_tenant, v_actor, v_product.id, 'in', v_output, 'production', v_batch_id,
      'Lote #' || v_number::text
    );
  end if;

  v_cost_out := round(v_total / v_output, 4);

  update public.production_batches
     set total_cost = v_total, unit_cost = v_cost_out, cost_complete = v_complete
   where id = v_batch_id;

  -- Costo del preparado (solo si el lote tiene el costo completo).
  if v_complete and v_total > 0 then
    perform set_config('app.syncing_purchase_cost', 'on', true);
    update public.products
       set purchase_price = round(v_cost_out * greatest(coalesce(units_per_package, 1), 1), 2),
           updated_at = now()
     where id = v_product.id and user_id = v_tenant
       and purchase_price is distinct from round(v_cost_out * greatest(coalesce(units_per_package, 1), 1), 2);
    v_cost_updated := found;
    perform set_config('app.syncing_purchase_cost', 'off', true);
  end if;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'batch_number', v_number,
    'output_qty', v_output,
    'output_unit', v_product.unit,
    'batches', v_batches,
    'cost_complete', v_complete,
    'cost_updated', v_cost_updated,
    'negative_inputs', v_negative,
    'already_registered', false,
    'total_cost', case when public.worker_can('inventory_costs') then v_total end
  );
end;
$function$;

revoke execute on function public.register_production_batch(uuid, numeric, numeric, text, uuid) from public, anon;
grant execute on function public.register_production_batch(uuid, numeric, numeric, text, uuid) to authenticated;

-- ------------------------------------------------------------ anular lote
create or replace function public.void_production_batch(p_batch_id uuid, p_reason text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_tenant uuid := public.get_effective_user_id();
  v_actor  uuid := auth.uid();
  v_batch  public.production_batches%rowtype;
  v_row    record;
  v_new    numeric;
  v_output_negative boolean := false;
  v_stock_after numeric;
begin
  if v_actor is null or v_tenant is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.worker_can('production') then
    raise exception 'SIN_PERMISO: no tienes permiso para anular lotes de producción' using errcode = '42501';
  end if;

  select * into v_batch
    from public.production_batches b
   where b.id = p_batch_id and b.user_id = v_tenant
   for update;
  if not found then
    raise exception 'Lote no encontrado' using errcode = 'P0002';
  end if;
  if v_batch.status <> 'completed' then
    raise exception 'LOTE_YA_ANULADO: este lote ya estaba anulado' using errcode = '22023';
  end if;

  perform 1 from public.products pr
   where pr.user_id = v_tenant
     and (pr.id = v_batch.product_id
          or pr.id in (select bi.ingredient_id from public.production_batch_items bi
                        where bi.batch_id = v_batch.id and bi.stock_applied and bi.ingredient_id is not null))
   order by pr.id
     for update;

  if v_batch.output_stock_applied then
    update public.products
       set stock_level = stock_level - v_batch.output_qty, updated_at = now()
     where id = v_batch.product_id and user_id = v_tenant
    returning stock_level into v_stock_after;
    v_output_negative := coalesce(v_stock_after, 0) < 0;

    insert into public.inventory_movements (
      user_id, created_by, product_id, type, quantity, reference_type, reference_id, notes
    ) values (
      v_tenant, v_actor, v_batch.product_id, 'out', v_batch.output_qty, 'production_void', v_batch.id,
      'Anulación de lote #' || v_batch.batch_number::text
    );
  end if;

  for v_row in
    select bi.ingredient_id, bi.quantity
      from public.production_batch_items bi
     where bi.batch_id = v_batch.id and bi.stock_applied and bi.ingredient_id is not null
     order by bi.ingredient_id
  loop
    update public.products
       set stock_level = stock_level + v_row.quantity, updated_at = now()
     where id = v_row.ingredient_id and user_id = v_tenant;

    insert into public.inventory_movements (
      user_id, created_by, product_id, type, quantity, reference_type, reference_id, notes
    ) values (
      v_tenant, v_actor, v_row.ingredient_id, 'in', v_row.quantity, 'production_void', v_batch.id,
      'Anulación de lote #' || v_batch.batch_number::text
    );
  end loop;

  update public.production_batches
     set status = 'void', voided_at = now(), voided_by = v_actor,
         void_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), '')
   where id = v_batch.id;

  return jsonb_build_object(
    'batch_id', v_batch.id,
    'output_went_negative', v_output_negative,
    'output_stock_after', v_stock_after
  );
end;
$function$;

revoke execute on function public.void_production_batch(uuid, text) from public, anon;
grant execute on function public.void_production_batch(uuid, text) to authenticated;

-- ------------------------------------------------------------ costos de lotes
-- Mismo modelo que get_product_costs: el costo solo sale con inventory_costs.
create or replace function public.get_production_batch_costs(p_ids uuid[])
 returns table(batch_id uuid, total_cost numeric, unit_cost numeric, items jsonb)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select b.id, b.total_cost, b.unit_cost,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', bi.id, 'unit_cost', bi.unit_cost, 'line_cost', bi.line_cost))
             from public.production_batch_items bi
            where bi.batch_id = b.id
         ), '[]'::jsonb)
    from public.production_batches b
   where b.user_id = public.get_effective_user_id()
     and b.id = any(p_ids)
     and public.worker_can('inventory_costs');
$function$;

revoke execute on function public.get_production_batch_costs(uuid[]) from public, anon;
grant execute on function public.get_production_batch_costs(uuid[]) to authenticated;
