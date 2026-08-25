-- El movimiento manual respeta la misma regla que la venta.
--
-- `create_sale` ya rechaza media unidad de lo que no se mide (CANTIDAD_ENTERA).
-- Sin este corte, el ajuste manual dejaba entrar 2,5 televisores: un stock que
-- después nadie puede vender, porque la venta sí exige entero. Medio televisor
-- quedaría parado en el inventario para siempre.
--
-- La firma no cambia, así que es CREATE OR REPLACE y los permisos se conservan.

BEGIN;

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

  anchor := E'  select coalesce(units_per_package, 1), stock_level, unit, coalesce(tracks_stock, true)\n'
         || E'    into v_pack, v_stock, v_unit, v_tracks';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'register_manual_movement: no se encontró la lectura del producto';
  END IF;
  d := replace(
    d,
    anchor,
    E'  select coalesce(units_per_package, 1), stock_level, unit, coalesce(tracks_stock, true),\n'
    || E'         coalesce(allows_fractions, false)\n'
    || E'    into v_pack, v_stock, v_unit, v_tracks, v_fractions'
  );

  anchor := E'  if not v_tracks then\n'
         || E'    raise exception ''SIN_STOCK: este producto no lleva inventario'';\n'
         || E'  end if;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'register_manual_movement: no se encontró el corte de inventario';
  END IF;
  d := replace(d, anchor, anchor
    || E'\n\n  if p_quantity <> trunc(p_quantity) and not v_fractions then\n'
    || E'    raise exception ''CANTIDAD_ENTERA: este producto se mueve por unidad entera'';\n'
    || E'  end if;');

  anchor := '  v_tracks boolean;';
  IF position(anchor IN d) = 0 THEN
    RAISE EXCEPTION 'register_manual_movement: no se encontró la declaración de v_tracks';
  END IF;
  d := replace(d, anchor, anchor || E'\n  v_fractions boolean;');

  EXECUTE d;
END
$migration$;

COMMIT;
