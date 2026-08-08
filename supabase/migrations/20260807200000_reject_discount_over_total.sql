-- El descuento de una venta no puede superar lo que se está vendiendo.
--
-- `create_sale` cerraba con `v_neto := greatest(v_gross - v_discount, 0)`. Ese
-- `greatest` clampeaba en silencio: con un descuento de $3.000 sobre una venta
-- de $2.000 el total quedaba en $0 y el producto se regalaba sin un solo aviso.
-- El modal del POS ahora acota el porcentaje a 0-100, pero este RPC no se llama
-- solo desde ahí —la cola offline arma su propio payload—, así que el corte
-- tiene que estar acá.
--
-- POR QUÉ ESTO NO REESCRIBE LA FUNCIÓN ENTERA:
-- el cuerpo de `create_sale` son ~300 líneas y ya lleva tres migraciones que lo
-- copian completo para cambiar dos renglones. Una cuarta copia esconde el
-- cambio en vez de mostrarlo. Este parche toca EXACTAMENTE el fragmento que
-- cambia y aborta si no lo encuentra, así que no puede aplicarse a medias ni
-- sobre una versión que no esperaba. El cuerpo completo vive en
-- `20260807190000_sale_line_inherits_header_staff.sql`.

DO $migration$
DECLARE
  v_oid    oid;
  v_source text;
  v_patched text;
  v_needle text := E'    v_neto := greatest(v_gross - v_discount, 0);\n';
  v_replacement text := E''
    '    -- El descuento no puede superar lo que se está vendiendo: clampear a\n'
    '    -- cero regalaba el producto en silencio.\n'
    '    if v_discount < 0 then\n'
    '      raise exception ''DESCUENTO_INVALIDO: el descuento no puede ser negativo'';\n'
    '    end if;\n'
    '    if v_discount > v_gross then\n'
    '      raise exception ''DESCUENTO_EXCEDE_TOTAL: el descuento ($%) supera el valor de la venta ($%)'',\n'
    '        v_discount, v_gross;\n'
    '    end if;\n'
    '\n'
    '    v_neto := v_gross - v_discount;\n';
BEGIN
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_sale';

  v_source := pg_get_functiondef(v_oid);

  IF position(v_needle IN v_source) = 0 THEN
    RAISE EXCEPTION
      'create_sale no contiene el fragmento esperado del descuento: la función cambió y este parche quedó obsoleto';
  END IF;

  v_patched := replace(v_source, v_needle, v_replacement);
  EXECUTE v_patched;

  -- Releer de la base, no confiar en la variable: lo que importa es lo que
  -- quedó instalado.
  IF position('DESCUENTO_EXCEDE_TOTAL' IN pg_get_functiondef(v_oid)) = 0 THEN
    RAISE EXCEPTION 'el parche del descuento no quedó aplicado';
  END IF;
END
$migration$;

-- Recrear la función no puede aflojar quién la ejecuta.
REVOKE ALL ON FUNCTION public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, text, numeric, jsonb, uuid, text, text, jsonb, uuid, uuid, uuid, uuid) TO authenticated, service_role;
