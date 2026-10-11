-- Presentaciones de insumos: "cada unidad trae" (contenido).
--
-- Un insumo tiene UNA unidad y la receta solo convertía dentro de la misma
-- dimensión: quien compra leche por bolsa no podía contar bolsas en stock y a
-- la vez gastar 150 ml en la receta. `products.content_qty`/`content_unit`
-- declaran qué trae UNA unidad del producto (1 Unidad = 900 ml). Stock,
-- compras y POS siguen en `unit` (bolsas); las recetas pueden medirlo en la
-- dimensión del contenido y product_unit_factor() hace la cuenta
-- (ml → bolsa de 900 ml: factor 1/900; 150 ml = 0,167 bolsas). El costo no
-- cambia: sigue siendo por unidad del producto (purchase_price /
-- units_per_package, por bolsa) y el de 150 ml sale solo de la fracción. No
-- existe un "costo por ml" guardado.
--
-- Reglas (CHECK products_content_shape): los dos nulos o los dos con valor,
-- content_qty > 0, content_unit de MEDIDA (g, kg, lb, ml, L, cm, m) y solo
-- cuando `unit` NO es de medida — "1 kg trae 1000 g" es una conversión que
-- unit_factor ya sabe, no una presentación.
--
-- `allows_fractions` NO cambia (sigue generada desde `unit`): el POS vende
-- bolsas enteras. El stock de un producto con contenido SÍ puede quedar
-- fraccionario por consumo de recetas (9,833 bolsas): es la bolsa abierta. Por
-- eso register_manual_movement acepta fracciones cuando hay contenido (hay que
-- poder ajustar 0,167 bolsas).
--
-- Cambio de regla en la venta: apply_sale_recipe pasa a respetar
-- settings.allow_oversell (coalesce true), igual que register_production_batch.
-- Con sobreventa apagada, un insumo que no alcanza aborta la venta ENTERA con
-- INSUMO_INSUFICIENTE: create_sale no la atrapa (solo maneja unique_violation),
-- que es lo que se quiere. Con sobreventa permitida sigue como antes: negativo
-- + aviso.
--
-- Espejo en TS: lib/units.ts (productUnitFactor, isMeasureUnit). Si cambia
-- uno, cambia el otro. La lista de unidades de medida vive en CUATRO lugares
-- (unit_factor, is_measure_unit, la expresión generada de allows_fractions y
-- lib/units.ts): mantenerlos iguales.
--
-- save_recipe, apply_sale_recipe, register_production_batch y
-- products_guard_recipe se reescriben enteros con la misma firma (los cuerpos
-- vivos coincidían con 20261008100100/100300 al aplicar esto).
-- register_manual_movement se parcha por reemplazo textual sobre
-- pg_get_functiondef, el patrón de 20260824221000 para funciones largas que
-- no se reescriben.

-- ------------------------------------------------------------ helpers
-- Unidad de MEDIDA = la que unit_factor sabe convertir. Corre dentro del CHECK
-- de products, es decir como quien escribe la fila (authenticated, o
-- service_role desde el cliente admin): por eso NO se le revoca el EXECUTE a
-- public, a diferencia del resto de helpers del módulo.
create or replace function public.is_measure_unit(p_unit text)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select coalesce(p_unit in ('g', 'kg', 'lb', 'ml', 'L', 'cm', 'm'), false);
$function$;

-- Factor para pasar una cantidad de `p_from` a la unidad del producto
-- (cantidad_producto = cantidad_from * factor). Mismo contrato que unit_factor
-- (NULL = incompatible), más el contenido:
--   1. si unit_factor(p_from, p_unit) existe → ese factor (misma dimensión);
--   2. si hay contenido y p_from es de su dimensión → factor al contenido /
--      content_qty (150 ml → 150 * (1/900) bolsas);
--   3. si no, NULL.
create or replace function public.product_unit_factor(
  p_from text, p_unit text, p_content_qty numeric, p_content_unit text
)
 returns numeric
 language sql
 immutable
 set search_path to ''
as $function$
  select coalesce(
    public.unit_factor(p_from, p_unit),
    case
      when p_content_qty > 0 and p_content_unit is not null
        then public.unit_factor(p_from, p_content_unit) / p_content_qty
    end
  );
$function$;

revoke execute on function public.product_unit_factor(text, text, numeric, text) from public, anon;
grant execute on function public.product_unit_factor(text, text, numeric, text) to authenticated;

-- Cómo se nombra la unidad de un producto en un mensaje de error: "Unidad de
-- 900 ml" si tiene contenido, "kg" si no. Los ceros de la escala de
-- numeric(12,3) se recortan (900.000 → 900) solo cuando hay punto decimal.
create or replace function public.product_unit_label(p_unit text, p_content_qty numeric, p_content_unit text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when p_content_qty is not null and p_content_unit is not null then
      format(
        '%s de %s %s',
        p_unit,
        case when strpos(p_content_qty::text, '.') > 0
             then rtrim(rtrim(p_content_qty::text, '0'), '.')
             else p_content_qty::text end,
        p_content_unit
      )
    else p_unit
  end;
$function$;

revoke execute on function public.product_unit_label(text, numeric, text) from public, anon;
grant execute on function public.product_unit_label(text, numeric, text) to authenticated;

-- ------------------------------------------------------------ products
alter table public.products
  add column if not exists content_qty numeric(12,3),
  add column if not exists content_unit text;

comment on column public.products.content_qty is
  'Qué trae UNA unidad del producto, en content_unit (1 Unidad = 900 ml). Solo para unidades que no son de medida; las recetas lo usan para medir el insumo en ml/g/cm.';
comment on column public.products.content_unit is
  'Unidad del contenido (g, kg, lb, ml, L, cm, m). NULL = sin presentación declarada.';

alter table public.products drop constraint if exists products_content_shape;
alter table public.products add constraint products_content_shape check (
  (content_qty is null and content_unit is null)
  or (
    content_qty > 0
    and public.is_measure_unit(content_unit)
    and not public.is_measure_unit(unit)
  )
);

-- El SELECT de products es por columna (20261008100500): sin esto el cliente
-- no ve las columnas nuevas. INSERT/UPDATE siguen a nivel de tabla.
grant select (content_qty, content_unit) on public.products to authenticated;

-- ------------------------------------------------------------ guard
-- Reglas de integridad (para TODO llamador, también los RPC):
--   * un producto con receta de venta no lleva stock propio;
--   * un cambio de unidad O de contenido no puede dejar sin conversión a una
--     línea de receta que mide este producto (recipe_items.unit) ni al
--     rendimiento de su receta de producción (recipes.yield_unit).
-- El contenido se evalúa como va a quedar: si la unidad nueva es de medida el
-- CHECK exige contenido NULL, así que acá se mira como NULL aunque el UPDATE
-- no lo haya limpiado. Así el error es RECETA_UNIDAD_INCOMPATIBLE (qué receta
-- se rompe) y no un check_violation.
create or replace function public.products_guard_recipe()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_content_qty  numeric := case when public.is_measure_unit(new.unit) then null else new.content_qty end;
  v_content_unit text    := case when public.is_measure_unit(new.unit) then null else new.content_unit end;
  v_bad_unit     text;
begin
  if coalesce(new.tracks_stock, false) and not coalesce(old.tracks_stock, false)
     and exists (
       select 1 from public.recipes r
        where r.product_id = new.id and r.kind = 'sale'
     ) then
    raise exception 'RECETA_SIN_STOCK_PROPIO: % tiene receta; su stock se descuenta de sus insumos', new.name
      using errcode = '22023';
  end if;

  if new.unit is distinct from old.unit
     or new.content_qty is distinct from old.content_qty
     or new.content_unit is distinct from old.content_unit then

    select ri.unit into v_bad_unit
      from public.recipe_items ri
     where ri.ingredient_id = new.id
       and public.product_unit_factor(ri.unit, new.unit, v_content_qty, v_content_unit) is null
     limit 1;
    if v_bad_unit is not null then
      raise exception 'RECETA_UNIDAD_INCOMPATIBLE: % se usa en recetas medido en %, y eso no se puede pasar a %',
        new.name, v_bad_unit, public.product_unit_label(new.unit, v_content_qty, v_content_unit)
        using errcode = '22023';
    end if;

    select r.yield_unit into v_bad_unit
      from public.recipes r
     where r.product_id = new.id and r.kind = 'production'
       and public.product_unit_factor(r.yield_unit, new.unit, v_content_qty, v_content_unit) is null
     limit 1;
    if v_bad_unit is not null then
      raise exception 'RECETA_UNIDAD_INCOMPATIBLE: la receta de producción de % rinde en %, y eso no se puede pasar a %',
        new.name, v_bad_unit, public.product_unit_label(new.unit, v_content_qty, v_content_unit)
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists products_guard_recipe on public.products;
create trigger products_guard_recipe
  before update of unit, tracks_stock, content_qty, content_unit on public.products
  for each row execute function public.products_guard_recipe();

-- ------------------------------------------------------------ save_recipe
-- Igual que en 20261008100100, salvo que la unidad de cada línea y la del
-- rendimiento se validan con product_unit_factor (contenido incluido) y los
-- mensajes UNIDAD_INCOMPATIBLE nombran la presentación ("Unidad de 900 ml").
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
    -- El rendimiento se pasa a la unidad del preparado con su contenido: una
    -- "Botella de jarabe" (Unidad de 1 L) puede rendir "12 L" = 12 botellas.
    if public.product_unit_factor(v_yield_unit, v_target.unit, v_target.content_qty, v_target.content_unit) is null then
      raise exception 'UNIDAD_INCOMPATIBLE: el rendimiento en % no se puede pasar a % (%)',
        v_yield_unit, public.product_unit_label(v_target.unit, v_target.content_qty, v_target.content_unit), v_target.name
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
    if public.product_unit_factor(v_unit, v_ing.unit, v_ing.content_qty, v_ing.content_unit) is null then
      raise exception 'UNIDAD_INCOMPATIBLE: % se maneja en % y no se puede medir en %',
        v_ing.name, public.product_unit_label(v_ing.unit, v_ing.content_qty, v_ing.content_unit), v_unit
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
-- insumo queda bajo. El consumo se guarda en la unidad del PRODUCTO (bolsas),
-- nunca en la del contenido: es lo que void_sale devuelve y lo que el kardex
-- cuenta.
--
-- Sobreventa: settings.allow_oversell se lee UNA vez al entrar. Apagada, un
-- insumo que no alcanza aborta la venta entera (INSUMO_INSUFICIENTE, 22023);
-- permitida (el default), el stock queda negativo y se avisa.
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
  v_allow_over boolean := coalesce(
    (select s.allow_oversell from public.settings s where s.user_id = p_tenant), true);
begin
  for v_row in
    select ri.quantity, ri.unit as line_unit, p.id, p.name, p.unit, p.content_qty, p.content_unit,
           p.stock_level, p.tracks_stock, p.purchase_price, p.units_per_package
      from public.recipe_items ri
      join public.products p on p.id = ri.ingredient_id and p.user_id = p_tenant
     where ri.recipe_id = p_recipe_id
       and ri.user_id = p_tenant
     order by p.id
  loop
    continue when not coalesce(v_row.tracks_stock, false) or v_row.unit = 'Servicio';
    v_q := round(
      v_row.quantity
      * public.product_unit_factor(v_row.line_unit, v_row.unit, v_row.content_qty, v_row.content_unit)
      * p_multiplier, 3);
    continue when v_q is null or v_q <= 0;

    if not v_allow_over and v_row.stock_level - v_q < 0 then
      raise exception 'INSUMO_INSUFICIENTE: % — hay % % y la venta necesita %', v_row.name, v_row.stock_level, v_row.unit, v_q
        using errcode = '22023';
    end if;

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

-- ------------------------------------------------------------ register_production_batch
-- Igual que en 20261008100300, salvo que el rendimiento y las líneas se
-- convierten con product_unit_factor (contenido del preparado y de cada
-- insumo). Nada más cambia.
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

  -- Rendimiento en la unidad del preparado, contenido incluido ("12 L" de una
  -- botella de 1 L = 12 botellas).
  v_yield := v_recipe.yield_qty
    * public.product_unit_factor(v_recipe.yield_unit, v_product.unit, v_product.content_qty, v_product.content_unit);
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
    select ri.quantity, ri.unit as line_unit, p.id, p.name, p.unit, p.content_qty, p.content_unit,
           p.stock_level, p.tracks_stock, p.purchase_price, p.units_per_package
      from public.recipe_items ri
      join public.products p on p.id = ri.ingredient_id and p.user_id = v_tenant
     where ri.recipe_id = v_recipe.id
     order by p.id
  loop
    v_q := round(
      v_row.quantity
      * public.product_unit_factor(v_row.line_unit, v_row.unit, v_row.content_qty, v_row.content_unit)
      * v_factor, 3);
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

-- ------------------------------------------------------------ register_manual_movement
-- El ajuste manual acepta fracciones cuando el producto tiene contenido: una
-- bolsa abierta deja 0,167 bolsas en el inventario y hay que poder corregirlo.
-- Sin contenido sigue la regla de 20260824221000 (CANTIDAD_ENTERA para lo que
-- no se mide). Misma firma: CREATE OR REPLACE conserva los permisos.
do $migration$
declare
  d text;
  anchor text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'register_manual_movement';
  if d is null then
    raise exception 'register_manual_movement no existe';
  end if;

  anchor := E'         coalesce(allows_fractions, false)\n'
         || E'    into v_pack, v_stock, v_unit, v_tracks, v_fractions';
  if position(anchor in d) = 0 then
    raise exception 'register_manual_movement: no se encontró la lectura de allows_fractions';
  end if;
  d := replace(
    d,
    anchor,
    E'         (coalesce(allows_fractions, false) or content_unit is not null)\n'
    || E'    into v_pack, v_stock, v_unit, v_tracks, v_fractions'
  );

  execute d;
end
$migration$;
