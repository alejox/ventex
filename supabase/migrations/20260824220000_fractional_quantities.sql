-- Cantidades con decimales: vender 1,5 kg.
--
-- Hasta acá `sale_items.quantity` y `products.stock_level` eran `integer`, así
-- que el catálogo podía decir "kg" pero la venta no podía decir "medio". Quien
-- vende por peso tenía dos salidas y las dos mienten: inventar una unidad
-- ("malla de 5 kg") o esconder el peso dentro del precio.
--
-- El corte NO es una preferencia por producto: sale de la unidad de medida.
-- Medio kilo de papa es una venta; media unidad de un televisor es un error de
-- tipeo. Por eso `allows_fractions` es una columna GENERADA a partir de `unit`:
-- la lista de unidades medibles vive en UN solo lugar, y no hay forma de que el
-- cliente y el servidor terminen con dos listas distintas.
--
-- `numeric(12,3)` y no `real`: el binario flotante no puede representar 0,1, y
-- un stock que se corrige solo en el tercer decimal es un stock que nunca cierra
-- contra el conteo del estante.
--
-- Las compras YA aceptaban decimales (`invoice_items.quantity` es numeric): lo
-- que hacían era redondearlos contra el stock entero. Recibir 12,5 kg sumaba 13.
-- Eso deja de pasar acá.

BEGIN;

ALTER TABLE public.products
  ALTER COLUMN stock_level   TYPE numeric(12,3),
  ALTER COLUMN minimum_stock TYPE numeric(12,3);

ALTER TABLE public.sale_items
  ALTER COLUMN quantity TYPE numeric(12,3);

ALTER TABLE public.inventory_movements
  ALTER COLUMN quantity TYPE numeric(12,3);

ALTER TABLE public.purchase_order_items
  ALTER COLUMN quantity TYPE numeric(12,3);

-- Qué unidades se miden. Generada y no editable a mano: si fuera una bandera
-- más, alguien podría marcar "Unidad" como fraccionable y vender medio televisor.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS allows_fractions boolean
    GENERATED ALWAYS AS (unit = ANY (ARRAY['kg', 'g', 'lb', 'L', 'ml', 'm', 'cm'])) STORED;

-- Una columna nueva de `products` nace sin permisos. Generada = solo SELECT.
GRANT SELECT (allows_fractions) ON public.products TO authenticated;

-- ---------------------------------------------------------------------------
-- create_sale: la cantidad deja de ser entera, y la fracción se valida.
-- ---------------------------------------------------------------------------
DO $migration$
DECLARE
  d text;
  anchor text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'create_sale';
  IF d IS NULL THEN
    RAISE EXCEPTION 'create_sale no existe';
  END IF;

  -- `v_units` sigue siendo entero: son las unidades que trae una caja, y media
  -- caja no es una presentación.
  anchor := '    v_qty         integer;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'create_sale: no se encontró la declaración de v_qty';
  END IF;
  d := replace(d, anchor, '    v_qty         numeric(12,3);');

  anchor := '    v_stock_delta integer;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'create_sale: no se encontró la declaración de v_stock_delta';
  END IF;
  d := replace(d, anchor, '    v_stock_delta numeric(12,3);');

  anchor := '      v_qty := (v_item->>''quantity'')::integer;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'create_sale: no se encontró la lectura de la cantidad';
  END IF;
  d := replace(d, anchor, '      v_qty := round((v_item->>''quantity'')::numeric, 3);');

  -- Un servicio se cobra de a uno: no hay medio corte de pelo. Además los
  -- contadores de promociones son enteros y suman `quantity` sin preguntar.
  anchor := E'        if not found then\n          raise exception ''Servicio no encontrado: %'', v_item->>''service_id'';\n        end if;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'create_sale: no se encontró la validación del servicio';
  END IF;
  d := replace(d, anchor, anchor
    || E'\n\n        if v_qty <> trunc(v_qty) then\n'
    || E'          raise exception ''CANTIDAD_ENTERA: % se cobra por unidad entera'', v_service.name;\n'
    || E'        end if;');

  -- Un producto admite fracción solo si su unidad se mide.
  anchor := E'        if not found then\n          raise exception ''Producto no encontrado'';\n        end if;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'create_sale: no se encontró la validación del producto';
  END IF;
  d := replace(d, anchor, anchor
    || E'\n\n        if v_qty <> trunc(v_qty) and not coalesce(v_product.allows_fractions, false) then\n'
    || E'          raise exception ''CANTIDAD_ENTERA: % se vende por % entera(s)'', v_product.name, v_product.unit;\n'
    || E'        end if;');

  EXECUTE d;
END
$migration$;

-- ---------------------------------------------------------------------------
-- void_sale: devuelve el mismo decimal que descontó.
-- ---------------------------------------------------------------------------
DO $migration$
DECLARE
  d text;
  anchor text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'void_sale';
  IF d IS NULL THEN
    RAISE EXCEPTION 'void_sale no existe';
  END IF;

  anchor := '  return_units integer;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'void_sale: no se encontró la declaración de return_units';
  END IF;
  d := replace(d, anchor, '  return_units numeric(12,3);');

  EXECUTE d;
END
$migration$;

-- ---------------------------------------------------------------------------
-- Compras: recibir 12,5 kg suma 12,5, no 13.
-- ---------------------------------------------------------------------------
DO $migration$
DECLARE
  d text;
  anchor text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'replace_purchase_invoice_items';
  IF d IS NULL THEN
    RAISE EXCEPTION 'replace_purchase_invoice_items no existe';
  END IF;

  anchor := '  v_delta          integer;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'replace_purchase_invoice_items: no se encontró la declaración de v_delta';
  END IF;
  d := replace(d, anchor, '  v_delta          numeric(12,3);');

  anchor := '    v_delta := round(v_row.diff)::integer;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'replace_purchase_invoice_items: no se encontró el redondeo del delta';
  END IF;
  d := replace(d, anchor, '    v_delta := round(v_row.diff, 3);');

  EXECUTE d;
END
$migration$;

DO $migration$
DECLARE
  d text;
  anchor text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'cancel_purchase_invoice';
  IF d IS NULL THEN
    RAISE EXCEPTION 'cancel_purchase_invoice no existe';
  END IF;

  anchor := '  v_qty            integer;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'cancel_purchase_invoice: no se encontró la declaración de v_qty';
  END IF;
  d := replace(d, anchor, '  v_qty            numeric(12,3);');

  anchor := '    v_qty := round(v_row.qty)::integer;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'cancel_purchase_invoice: no se encontró el redondeo de la cantidad';
  END IF;
  d := replace(d, anchor, '    v_qty := round(v_row.qty, 3);');

  EXECUTE d;
END
$migration$;

-- ---------------------------------------------------------------------------
-- Movimiento manual: cargar 2,5 kg de entrada.
--
-- Acá SÍ cambia la firma (`p_quantity` pasa a numeric), así que es DROP + CREATE
-- y no un reemplazo: eso RESETEA los permisos, a diferencia de un CREATE OR
-- REPLACE. Se vuelven a otorgar abajo, a mano.
-- ---------------------------------------------------------------------------
DO $migration$
DECLARE
  d text;
  anchor text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'register_manual_movement';
  IF d IS NULL THEN
    RAISE EXCEPTION 'register_manual_movement no existe';
  END IF;

  anchor := 'p_quantity integer';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'register_manual_movement: no se encontró el parámetro p_quantity';
  END IF;
  d := replace(d, anchor, 'p_quantity numeric(12,3)');

  -- `v_pack` queda entero: las unidades por caja no se fraccionan.
  d := replace(d, '  v_units integer;', '  v_units numeric(12,3);');
  d := replace(d, '  v_stock integer;', '  v_stock numeric(12,3);');
  d := replace(d, '  v_new   integer;', '  v_new   numeric(12,3);');
  d := replace(d, '  v_moved integer;', '  v_moved numeric(12,3);');

  IF position('v_units numeric(12,3);' IN d) = 0 THEN
    RAISE EXCEPTION 'register_manual_movement: no se encontraron las variables de cantidad';
  END IF;

  DROP FUNCTION IF EXISTS public.register_manual_movement(uuid, text, integer, text, text);
  EXECUTE d;
END
$migration$;

REVOKE ALL ON FUNCTION public.register_manual_movement(uuid, text, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_manual_movement(uuid, text, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_manual_movement(uuid, text, numeric, text, text) TO authenticated, service_role;

COMMIT;
