-- Recetas y producción (2/5): guardar recetas y aplicarlas al vender.
--
-- Orden de bloqueo en TODO el módulo: recetas primero, productos después y en
-- orden de id (el mismo orden que create_sale, void_sale y
-- replace_purchase_invoice_items). Así nadie se cruza en un deadlock.

-- ------------------------------------------------------------ aviso de insumo
-- "Reponer insumo": cuando el stock queda en negativo o cruza el mínimo desde
-- arriba. Un solo aviso abierto por producto (índice notifications_one_open_insumo,
-- ON CONFLICT DO NOTHING: corre dentro de create_sale y un unique_violation ahí
-- se confundiría con un reintento de la venta).
create or replace function public.notify_low_ingredient(
  p_tenant uuid, p_product_id uuid, p_old numeric, p_new numeric
)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_name text;
  v_unit text;
  v_min  numeric;
begin
  select p.name, p.unit, coalesce(p.minimum_stock, 0)
    into v_name, v_unit, v_min
    from public.products p
   where p.id = p_product_id and p.user_id = p_tenant;
  if not found then
    return;
  end if;

  if p_new < 0 or (p_new <= v_min and p_old > v_min) then
    insert into public.notifications (user_id, type, severity, title, body, data)
    values (
      p_tenant,
      'insumo_bajo',
      'warning',
      'Reponer insumo: ' || v_name,
      case
        when p_new < 0 then format('%s quedó en negativo (%s %s). Registra la compra o ajusta el stock.', v_name, p_new, v_unit)
        else format('Quedan %s %s de %s (mínimo %s).', p_new, v_unit, v_name, v_min)
      end,
      jsonb_build_object('product_id', p_product_id, 'stock', p_new)
    )
    on conflict (user_id, (data ->> 'product_id')) where type = 'insumo_bajo' and read_at is null
    do nothing;
  end if;
end;
$function$;

revoke execute on function public.notify_low_ingredient(uuid, uuid, numeric, numeric) from public, anon, authenticated;

-- ------------------------------------------------------------ save_recipe
-- Crea, reemplaza o borra (p_items vacío) la receta de un producto o servicio.
--   p_kind 'sale'       → por unidad vendida. Producto o servicio.
--   p_kind 'production' → por lote, con rendimiento. Solo producto.
-- Una receta de VENTA sobre un producto le apaga el stock propio. Si ese
-- producto todavía tiene stock, se rechaza (RECETA_CON_STOCK) salvo que el
-- llamador confirme p_clear_stock: entonces se lleva a 0 con su movimiento.
create or replace function public.save_recipe(
  p_product_id uuid,
  p_service_id uuid,
  p_kind text,
  p_items jsonb,
  p_yield_qty numeric default null,
  p_yield_unit text default null,
  p_notes text default null,
  p_clear_stock boolean default false
)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_tenant   uuid := public.get_effective_user_id();
  v_actor    uuid := auth.uid();
  v_recipe   public.recipes%rowtype;
  v_has_old  boolean := false;
  v_target   public.products%rowtype;
  v_service  public.services%rowtype;
  v_item     jsonb;
  v_ing      public.products%rowtype;
  v_ing_id   uuid;
  v_qty      numeric;
  v_unit     text;
  v_yield_unit text;
  v_ids      uuid[] := '{}';
  v_pos      integer := 0;
  v_cycle    boolean;
begin
  if v_actor is null or v_tenant is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.production_module_enabled() then
    raise exception 'MODULO_PRODUCCION_INACTIVO' using errcode = '42501';
  end if;
  if (p_product_id is null) = (p_service_id is null) then
    raise exception 'RECETA_DESTINO_INVALIDO: la receta es de un producto o de un servicio' using errcode = '22023';
  end if;
  if p_kind not in ('sale', 'production') then
    raise exception 'RECETA_TIPO_INVALIDO' using errcode = '22023';
  end if;
  if p_kind = 'production' and p_product_id is null then
    raise exception 'RECETA_TIPO_INVALIDO: solo un producto se fabrica en lotes' using errcode = '22023';
  end if;
  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'RECETA_LINEA_INVALIDA' using errcode = '22023';
  end if;

  if p_product_id is not null then
    if not public.worker_can('inventory_edit') then
      raise exception 'SIN_PERMISO: no tienes permiso para editar productos' using errcode = '42501';
    end if;
  elsif not public.worker_can('services') then
    raise exception 'SIN_PERMISO: no tienes permiso para editar servicios' using errcode = '42501';
  end if;

  -- 1. La receta actual (recetas antes que productos).
  select * into v_recipe
    from public.recipes r
   where r.user_id = v_tenant
     and (r.product_id = p_product_id or r.service_id = p_service_id)
   for update;
  v_has_old := found;

  -- 2. Destino + insumos, en orden de id.
  select coalesce(array_agg(distinct (it ->> 'ingredient_id')::uuid), '{}')
    into v_ids
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
   where nullif(it ->> 'ingredient_id', '') is not null;

  perform 1 from public.products pr
   where pr.user_id = v_tenant
     and (pr.id = p_product_id or pr.id = any(v_ids))
   order by pr.id
     for update;

  if p_product_id is not null then
    select * into v_target from public.products
     where id = p_product_id and user_id = v_tenant;
    if not found or v_target.unit = 'Servicio' then
      raise exception 'Producto no encontrado' using errcode = 'P0002';
    end if;
  else
    select * into v_service from public.services
     where id = p_service_id and user_id = v_tenant;
    if not found then
      raise exception 'Servicio no encontrado' using errcode = 'P0002';
    end if;
  end if;

  -- Sin líneas = sin receta. El stock propio queda como está: la pantalla
  -- ofrece volver a controlarlo.
  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    if v_has_old then
      delete from public.recipes where id = v_recipe.id;
    end if;
    return null;
  end if;

  -- Un producto que es insumo de otra receta necesita stock propio: no puede
  -- pasar a tener receta de venta.
  if p_kind = 'sale' and p_product_id is not null
     and exists (select 1 from public.recipe_items ri where ri.ingredient_id = p_product_id) then
    raise exception 'RECETA_ES_INSUMO: % es insumo de otra receta y necesita su propio stock', v_target.name
      using errcode = '22023';
  end if;

  if p_kind = 'production' then
    if coalesce(p_yield_qty, 0) <= 0 then
      raise exception 'RECETA_RENDIMIENTO_INVALIDO: indica cuánto rinde un lote' using errcode = '22023';
    end if;
    v_yield_unit := coalesce(nullif(btrim(coalesce(p_yield_unit, '')), ''), v_target.unit);
    if public.unit_factor(v_yield_unit, v_target.unit) is null then
      raise exception 'UNIDAD_INCOMPATIBLE: el rendimiento en % no se puede pasar a % (%)', v_yield_unit, v_target.unit, v_target.name
        using errcode = '22023';
    end if;
  end if;

  -- 3. Validar líneas.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_ing_id := nullif(v_item ->> 'ingredient_id', '')::uuid;
    v_qty    := nullif(v_item ->> 'quantity', '')::numeric;
    v_unit   := nullif(btrim(coalesce(v_item ->> 'unit', '')), '');

    if v_ing_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'RECETA_LINEA_INVALIDA: cada insumo necesita una cantidad mayor que cero' using errcode = '22023';
    end if;
    if v_ing_id = p_product_id then
      raise exception 'RECETA_CICLICA: un producto no puede ser insumo de sí mismo' using errcode = '22023';
    end if;

    select * into v_ing from public.products
     where id = v_ing_id and user_id = v_tenant;
    if not found or v_ing.unit = 'Servicio' then
      raise exception 'RECETA_LINEA_INVALIDA: insumo no encontrado' using errcode = '22023';
    end if;

    v_unit := coalesce(v_unit, v_ing.unit);
    if public.unit_factor(v_unit, v_ing.unit) is null then
      raise exception 'UNIDAD_INCOMPATIBLE: % se maneja en % y no se puede medir en %', v_ing.name, v_ing.unit, v_unit
        using errcode = '22023';
    end if;

    if exists (select 1 from public.recipes r where r.product_id = v_ing_id and r.kind = 'sale') then
      raise exception 'RECETA_INSUMO_SIN_STOCK: % tiene su propia receta de venta y no lleva stock; usa sus insumos', v_ing.name
        using errcode = '22023';
    end if;
  end loop;

  if (select count(*) from jsonb_array_elements(p_items))
     <> (select count(distinct it ->> 'ingredient_id') from jsonb_array_elements(p_items) it) then
    raise exception 'RECETA_INSUMO_REPETIDO: cada insumo va una sola vez en la receta' using errcode = '22023';
  end if;

  -- 4. Ciclos: siguiendo las recetas de PRODUCCIÓN desde los insumos nuevos no
  -- se puede volver al producto (A usa B y B usa A).
  if p_kind = 'production' then
    with recursive reach(id) as (
      select unnest(v_ids)
      union
      select ri.ingredient_id
        from reach
        join public.recipes r on r.product_id = reach.id and r.kind = 'production' and r.user_id = v_tenant
        join public.recipe_items ri on ri.recipe_id = r.id
    )
    select exists (select 1 from reach where id = p_product_id) into v_cycle;
    if v_cycle then
      raise exception 'RECETA_CICLICA: % ya se usa (directa o indirectamente) en uno de sus insumos', v_target.name
        using errcode = '22023';
    end if;
  end if;

  -- 5. Receta de venta sobre un producto con stock: confirmar antes de perderlo.
  if p_kind = 'sale' and p_product_id is not null
     and coalesce(v_target.tracks_stock, false)
     and coalesce(v_target.stock_level, 0) <> 0 then
    if not coalesce(p_clear_stock, false) then
      raise exception 'RECETA_CON_STOCK: % tiene % % en stock', v_target.name, v_target.stock_level, v_target.unit
        using errcode = '22023';
    end if;
    update public.products
       set stock_level = 0, updated_at = now()
     where id = v_target.id and user_id = v_tenant;
    insert into public.inventory_movements (
      user_id, created_by, product_id, type, quantity, reference_type, reference_id, notes
    ) values (
      v_tenant, v_actor, v_target.id,
      case when v_target.stock_level > 0 then 'out' else 'in' end,
      abs(v_target.stock_level), 'recipe_conversion', v_target.id,
      'Pasa a receta: el stock se descuenta de sus insumos'
    );
  end if;

  -- 6. Escribir.
  if v_has_old then
    update public.recipes
       set kind = p_kind,
           yield_qty = case when p_kind = 'production' then round(p_yield_qty, 3) end,
           yield_unit = case when p_kind = 'production' then v_yield_unit end,
           notes = nullif(btrim(coalesce(p_notes, '')), ''),
           updated_at = now()
     where id = v_recipe.id
    returning * into v_recipe;
    delete from public.recipe_items where recipe_id = v_recipe.id;
  else
    insert into public.recipes (user_id, kind, product_id, service_id, yield_qty, yield_unit, notes)
    values (
      v_tenant, p_kind, p_product_id, p_service_id,
      case when p_kind = 'production' then round(p_yield_qty, 3) end,
      case when p_kind = 'production' then v_yield_unit end,
      nullif(btrim(coalesce(p_notes, '')), '')
    )
    returning * into v_recipe;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pos := v_pos + 1;
    select * into v_ing from public.products where id = (v_item ->> 'ingredient_id')::uuid;
    insert into public.recipe_items (user_id, recipe_id, ingredient_id, quantity, unit, position)
    values (
      v_tenant, v_recipe.id, v_ing.id,
      round((v_item ->> 'quantity')::numeric, 4),
      coalesce(nullif(btrim(coalesce(v_item ->> 'unit', '')), ''), v_ing.unit),
      v_pos
    );
  end loop;

  -- 7. Stock propio: la receta de venta lo apaga; el preparado lo necesita.
  if p_product_id is not null then
    if p_kind = 'sale' and coalesce(v_target.tracks_stock, false) then
      update public.products
         set tracks_stock = false, minimum_stock = 0, updated_at = now()
       where id = p_product_id and user_id = v_tenant;
    elsif p_kind = 'production' and not coalesce(v_target.tracks_stock, false) then
      update public.products
         set tracks_stock = true, updated_at = now()
       where id = p_product_id and user_id = v_tenant;
    end if;
  end if;

  return v_recipe.id;
end;
$function$;

revoke execute on function public.save_recipe(uuid, uuid, text, jsonb, numeric, text, text, boolean) from public, anon;
grant execute on function public.save_recipe(uuid, uuid, text, jsonb, numeric, text, text, boolean) to authenticated;

-- ------------------------------------------------------------ apply_sale_recipe
-- Interna: la llama create_sale con los insumos YA bloqueados. Descuenta,
-- deja kardex y la fila de consumo (lo que void_sale devuelve) y avisa si el
-- insumo no alcanza. Nunca frena la venta: el stock puede quedar negativo.
create or replace function public.apply_sale_recipe(
  p_tenant uuid,
  p_actor uuid,
  p_sale_id uuid,
  p_sale_number bigint,
  p_sale_item_id uuid,
  p_recipe_id uuid,
  p_multiplier numeric
)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_row record;
  v_q   numeric(12,3);
  v_new numeric;
begin
  for v_row in
    select ri.quantity, ri.unit as line_unit, p.id, p.unit, p.stock_level, p.tracks_stock,
           p.purchase_price, p.units_per_package
      from public.recipe_items ri
      join public.products p on p.id = ri.ingredient_id and p.user_id = p_tenant
     where ri.recipe_id = p_recipe_id
       and ri.user_id = p_tenant
     order by p.id
  loop
    continue when not coalesce(v_row.tracks_stock, false) or v_row.unit = 'Servicio';
    v_q := round(v_row.quantity * public.unit_factor(v_row.line_unit, v_row.unit) * p_multiplier, 3);
    continue when v_q is null or v_q <= 0;

    update public.products
       set stock_level = stock_level - v_q, updated_at = now()
     where id = v_row.id and user_id = p_tenant
    returning stock_level into v_new;

    insert into public.inventory_movements (
      user_id, created_by, product_id, type, quantity, reference_type, reference_id, notes
    ) values (
      p_tenant, p_actor, v_row.id, 'out', v_q, 'sale', p_sale_id,
      'Venta #' || p_sale_number::text || ' · receta'
    );

    insert into public.sale_item_consumptions (user_id, sale_id, sale_item_id, ingredient_id, quantity, unit, unit_cost)
    values (
      p_tenant, p_sale_id, p_sale_item_id, v_row.id, v_q, v_row.unit,
      round(coalesce(v_row.purchase_price, 0) / greatest(coalesce(v_row.units_per_package, 1), 1), 4)
    );

    perform public.notify_low_ingredient(p_tenant, v_row.id, v_row.stock_level, v_new);
  end loop;
end;
$function$;

revoke execute on function public.apply_sale_recipe(uuid, uuid, uuid, bigint, uuid, uuid, numeric) from public, anon, authenticated;
