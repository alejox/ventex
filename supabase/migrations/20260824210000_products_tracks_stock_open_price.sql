-- Dos banderas por producto: "no lleva inventario" y "precio abierto".
--
-- Nacen del caso de las verduras. Las papas llegan y una parte se pudre; contar
-- unidades no da nunca, y el precio cambia todas las semanas. La salida fácil
-- era darlas de alta como servicios, pero un servicio no tiene costo, ni
-- proveedor, ni compra, ni valorización — y las papas tienen las cuatro. Sacarlas
-- del inventario borraba el margen justo donde el margen es más flaco.
--
-- `tracks_stock = false`: el producto sigue siendo producto (costo, proveedor,
-- compras, margen) pero NADIE le toca las existencias. No descuenta al vender,
-- no devuelve al anular, no recibe unidades en una compra y no admite
-- movimientos manuales. Ese conteo dejaría de significar algo, y un número que
-- no significa nada es peor que no tenerlo.
--
-- `open_price = true`: el precio se asigna AL VENDER. `create_sale` sigue siendo
-- quien decide —el cliente nunca pudo mandar un precio, y eso es lo que impide
-- que un cajero invente el importe de una venta—, pero ahora acepta uno SOLO
-- para los productos marcados. Para el resto, mandar un precio es un error
-- explícito, no una preferencia que se ignora en silencio. Y un producto de
-- precio abierto EXIGE el precio: caer al del catálogo cobraría el de la semana
-- pasada sin que nadie se entere. `products.price` queda como precio sugerido.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tracks_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS open_price   boolean NOT NULL DEFAULT false;

-- Los permisos de `products` son POR COLUMNA: una columna nueva nace sin
-- ninguno, y PostgREST responde "permission denied for table products" — que
-- parece un problema de RLS y no lo es.
GRANT SELECT (tracks_stock, open_price) ON public.products TO authenticated;
GRANT INSERT (tracks_stock, open_price) ON public.products TO authenticated;
GRANT UPDATE (tracks_stock, open_price) ON public.products TO authenticated;

-- ---------------------------------------------------------------------------
-- create_sale: precio abierto + sin descuento de stock.
--
-- Se parchea el cuerpo vigente en vez de reescribir la función entera: son 400
-- líneas que cobran, calculan IVA, congelan comisiones y validan turnos, y
-- volver a tipearlas para cambiar tres bloques es la forma más rápida de perder
-- algo por el camino. Cada reemplazo va con guarda: si el anclaje no aparece,
-- la migración falla y no aplica una función a medio parchear.
-- ---------------------------------------------------------------------------
DO $migration$
DECLARE
  d text;
  anchor text;
  patched text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_sale';
  IF d IS NULL THEN
    RAISE EXCEPTION 'create_sale no existe';
  END IF;

  -- 1) Variables nuevas.
  anchor := '    v_unit_price  numeric(12,2);';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'create_sale: no se encontró la declaración de v_unit_price';
  END IF;
  patched := anchor || E'\n    v_custom_price numeric(12,2);\n    v_open_price  boolean;';
  d := replace(d, anchor, patched);

  -- 2) Precio: el del catálogo, o el que asignó el cajero si el producto lo permite.
  anchor := E'        v_kind := coalesce(v_item->>''kind'', ''unit'');\n'
         || E'        if v_kind = ''package'' then\n'
         || E'          if v_product.package_price is null then\n'
         || E'            raise exception ''SIN_PRECIO_CAJA: % no tiene precio por caja'', v_product.name;\n'
         || E'          end if;\n'
         || E'          v_unit_price := v_product.package_price;\n'
         || E'          v_units      := greatest(coalesce(v_product.units_per_package, 1), 1);\n'
         || E'        else\n'
         || E'          v_kind       := ''unit'';\n'
         || E'          v_unit_price := v_product.price;\n'
         || E'          v_units      := 1;\n'
         || E'        end if;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'create_sale: no se encontró el bloque de precio por unidad/caja';
  END IF;
  patched :=
       E'        v_kind := coalesce(v_item->>''kind'', ''unit'');\n'
    || E'        v_open_price   := coalesce(v_product.open_price, false);\n'
    || E'        v_custom_price := nullif(v_item->>''unit_price'', '''')::numeric;\n'
    || E'\n'
    || E'        -- El precio lo sigue decidiendo el servidor. La única puerta es\n'
    || E'        -- esta bandera, y está cerrada por defecto.\n'
    || E'        if v_custom_price is not null and not v_open_price then\n'
    || E'          raise exception ''PRECIO_NO_EDITABLE: % se cobra al precio del catálogo'', v_product.name;\n'
    || E'        end if;\n'
    || E'        if v_open_price and v_custom_price is null then\n'
    || E'          raise exception ''PRECIO_REQUERIDO: hay que asignarle precio a % al vender'', v_product.name;\n'
    || E'        end if;\n'
    || E'        if v_custom_price is not null and v_custom_price < 0 then\n'
    || E'          raise exception ''PRECIO_INVALIDO: el precio de % no puede ser negativo'', v_product.name;\n'
    || E'        end if;\n'
    || E'        v_custom_price := round(v_custom_price, 2);\n'
    || E'\n'
    || E'        if v_kind = ''package'' then\n'
    || E'          if v_custom_price is null and v_product.package_price is null then\n'
    || E'            raise exception ''SIN_PRECIO_CAJA: % no tiene precio por caja'', v_product.name;\n'
    || E'          end if;\n'
    || E'          v_unit_price := coalesce(v_custom_price, v_product.package_price);\n'
    || E'          v_units      := greatest(coalesce(v_product.units_per_package, 1), 1);\n'
    || E'        else\n'
    || E'          v_kind       := ''unit'';\n'
    || E'          v_unit_price := coalesce(v_custom_price, v_product.price);\n'
    || E'          v_units      := 1;\n'
    || E'        end if;';
  d := replace(d, anchor, patched);

  -- 3) Stock: el producto sin inventario no descuenta ni entra al control de
  --    sobreventa, igual que un servicio.
  anchor := E'        if v_product.unit = ''Servicio'' then\n          v_stock_delta := 0;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'create_sale: no se encontró el corte de stock del servicio';
  END IF;
  patched := E'        if v_product.unit = ''Servicio''\n'
          || E'           or not coalesce(v_product.tracks_stock, true) then\n'
          || E'          v_stock_delta := 0;';
  d := replace(d, anchor, patched);

  EXECUTE d;
END
$migration$;

-- ---------------------------------------------------------------------------
-- void_sale: no devuelve unidades a un producto que no las lleva.
-- ---------------------------------------------------------------------------
DO $migration$
DECLARE
  d text;
  anchor text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'void_sale';
  IF d IS NULL THEN
    RAISE EXCEPTION 'void_sale no existe';
  END IF;

  anchor := '      and prod.unit <> ''Servicio''';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'void_sale: no se encontró el filtro de servicios';
  END IF;
  d := replace(
    d,
    anchor,
    anchor || E'\n      and coalesce(prod.tracks_stock, true)'
  );

  EXECUTE d;
END
$migration$;

-- ---------------------------------------------------------------------------
-- Compras: el costo se registra igual; las unidades no.
--
-- Recibir una compra de papas no puede inventar existencias de un producto que
-- justamente se marcó como imposible de contar.
-- ---------------------------------------------------------------------------
DO $migration$
DECLARE
  d text;
  anchor text;
  patched text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'replace_purchase_invoice_items';
  IF d IS NULL THEN
    RAISE EXCEPTION 'replace_purchase_invoice_items no existe';
  END IF;

  anchor := E'    update public.products\n'
         || E'       set stock_level = stock_level + v_delta\n'
         || E'     where id = v_row.product_id\n'
         || E'       and user_id = v_tenant;\n'
         || E'\n'
         || E'    if not found then\n'
         || E'      raise exception ''Producto no encontrado'';\n'
         || E'    end if;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'replace_purchase_invoice_items: no se encontró el ajuste de stock';
  END IF;
  patched := E'    select coalesce(pr.tracks_stock, true) into v_tracks\n'
          || E'      from public.products pr\n'
          || E'     where pr.id = v_row.product_id\n'
          || E'       and pr.user_id = v_tenant\n'
          || E'     for update;\n'
          || E'\n'
          || E'    if not found then\n'
          || E'      raise exception ''Producto no encontrado'';\n'
          || E'    end if;\n'
          || E'\n'
          || E'    -- Sin inventario no hay unidades que recibir ni movimiento que\n'
          || E'    -- anotar: la compra ya dejó el costo, que es lo único que se sabe.\n'
          || E'    continue when not v_tracks;\n'
          || E'\n'
          || E'    update public.products\n'
          || E'       set stock_level = stock_level + v_delta\n'
          || E'     where id = v_row.product_id\n'
          || E'       and user_id = v_tenant;';
  d := replace(d, anchor, patched);

  anchor := '  v_delta          integer;';
  IF position(anchor IN d) = 0 THEN
    anchor := '  v_delta integer;';
  END IF;
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'replace_purchase_invoice_items: no se encontró la declaración de v_delta';
  END IF;
  d := replace(d, anchor, anchor || E'\n  v_tracks         boolean;');

  EXECUTE d;
END
$migration$;

DO $migration$
DECLARE
  d text;
  anchor text;
  patched text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'cancel_purchase_invoice';
  IF d IS NULL THEN
    RAISE EXCEPTION 'cancel_purchase_invoice no existe';
  END IF;

  anchor := E'    update public.products\n'
         || E'       set stock_level = stock_level - v_qty\n'
         || E'     where id = v_row.product_id\n'
         || E'       and user_id = v_tenant;\n'
         || E'\n'
         || E'    if not found then\n'
         || E'      raise exception ''Producto no encontrado'';\n'
         || E'    end if;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'cancel_purchase_invoice: no se encontró el ajuste de stock';
  END IF;
  patched := E'    select coalesce(pr.tracks_stock, true) into v_tracks\n'
          || E'      from public.products pr\n'
          || E'     where pr.id = v_row.product_id\n'
          || E'       and pr.user_id = v_tenant\n'
          || E'     for update;\n'
          || E'\n'
          || E'    if not found then\n'
          || E'      raise exception ''Producto no encontrado'';\n'
          || E'    end if;\n'
          || E'\n'
          || E'    continue when not v_tracks;\n'
          || E'\n'
          || E'    update public.products\n'
          || E'       set stock_level = stock_level - v_qty\n'
          || E'     where id = v_row.product_id\n'
          || E'       and user_id = v_tenant;';
  d := replace(d, anchor, patched);

  anchor := '  v_qty            integer;';
  IF position(anchor IN d) = 0 THEN
    anchor := '  v_qty integer;';
  END IF;
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'cancel_purchase_invoice: no se encontró la declaración de v_qty';
  END IF;
  d := replace(d, anchor, anchor || E'\n  v_tracks         boolean;');

  EXECUTE d;
END
$migration$;

-- ---------------------------------------------------------------------------
-- Movimiento manual: no hay stock que mover.
-- ---------------------------------------------------------------------------
DO $migration$
DECLARE
  d text;
  anchor text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'register_manual_movement';
  IF d IS NULL THEN
    RAISE EXCEPTION 'register_manual_movement no existe';
  END IF;

  anchor := E'  select coalesce(units_per_package, 1), stock_level, unit\n'
         || E'    into v_pack, v_stock, v_unit';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'register_manual_movement: no se encontró la lectura del producto';
  END IF;
  d := replace(
    d,
    anchor,
    E'  select coalesce(units_per_package, 1), stock_level, unit, coalesce(tracks_stock, true)\n'
    || E'    into v_pack, v_stock, v_unit, v_tracks'
  );

  anchor := E'  if v_unit = ''Servicio'' then\n'
         || E'    raise exception ''SIN_STOCK: un servicio no lleva inventario'';\n'
         || E'  end if;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'register_manual_movement: no se encontró el corte del servicio';
  END IF;
  d := replace(
    d,
    anchor,
    anchor || E'\n\n  if not v_tracks then\n'
           || E'    raise exception ''SIN_STOCK: este producto no lleva inventario'';\n'
           || E'  end if;'
  );

  anchor := '  v_unit  text;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'register_manual_movement: no se encontró la declaración de v_unit';
  END IF;
  d := replace(d, anchor, anchor || E'\n  v_tracks boolean;');

  EXECUTE d;
END
$migration$;

-- Los permisos NO se retocan: `pg_get_functiondef` devuelve un CREATE OR
-- REPLACE, y reemplazar una función conserva su dueño y su ACL. Volver a
-- escribirlos acá sería la única forma de cambiarlos sin querer.

COMMIT;
