-- Un servicio vive en UNA sola tabla: `services`.
--
-- Hasta ahora vivía en dos, emparejadas por NOMBRE con `ilike`: `services`
-- (agenda, sitio público, venta por `service_id`) y `products` con
-- `unit = 'Servicio'` (inventario, venta por `product_id`). La sincronización
-- era unidireccional —la pantalla de Servicios nunca escribía el gemelo— y las
-- llamadas que sí lo intentaban estaban envueltas en `catch {}` vacíos, así que
-- cualquier fallo desaparecía sin rastro.
--
-- Medido contra este mismo proyecto antes de esta migración: CERO gemelos. Un
-- salón tenía 2 servicios invisibles en Inventario; una tienda tenía un "BAÑO"
-- que no se podía agendar ni aparecía en su sitio público. Y en `sale_items`
-- había líneas del mismo dominio por los dos caminos (`service_id` y
-- `product_id`), así que ningún reporte de servicios cuadraba.
--
-- `services` es la que manda porque es la que el dominio necesita: tiene
-- duración y descripción, y le apuntan FKs reales (`appointments.service_id`,
-- `sale_items.service_id`, el sitio público). El producto-servicio era el
-- accidente: obligó a parchear tres RPCs y agregar un CHECK entero
-- (20260807180000_services_have_no_stock.sql) para que no se inventariara.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) `services` gana la categoría, que hasta ahora solo sabía guardar el gemelo.
--
--    El formulario de alta siempre mostró el selector de Categoría para un
--    servicio, pero lo escribía en `products.category_id`. Al retirar el gemelo
--    esa categoría se perdía, y el catálogo unificado filtra por categoría
--    tanto productos como servicios.
-- ---------------------------------------------------------------------------
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS category_id uuid
  REFERENCES public.categories(id) ON DELETE SET NULL;

-- Toda columna nueva nace SIN permisos: sin este GRANT, PostgREST responde
-- "permission denied for table services" y parece un problema de RLS.
GRANT SELECT (category_id), INSERT (category_id), UPDATE (category_id)
  ON public.services TO authenticated;

CREATE INDEX IF NOT EXISTS services_category_id_idx
  ON public.services (category_id);

-- ---------------------------------------------------------------------------
-- 2) Los servicios que hoy solo existen como producto se mudan a `services`.
--
--    Sin esto, la tienda que creó su "BAÑO" desde Inventario lo perdería del
--    POS en el mismo despliegue que lo saca del catálogo de productos.
--
--    `set_user_id()` hace `coalesce(get_effective_user_id(), new.user_id)`: en
--    una migración no hay sesión, así que respeta el `user_id` explícito de
--    cada fila y cada servicio queda en el negocio del que salió.
--
--    El emparejado por nombre se usa acá por última vez, y solo para no
--    duplicar lo que ya esté migrado: hace idempotente la migración.
-- ---------------------------------------------------------------------------
INSERT INTO public.services (
  user_id, name, description, price, duration_minutes, status,
  has_commission, commission_type, commission_value, category_id
)
SELECT
  p.user_id,
  p.name,
  NULL,
  p.price,
  30,
  CASE WHEN p.status = 'inactive' THEN 'inactive' ELSE 'active' END,
  COALESCE(p.has_commission, false),
  CASE WHEN COALESCE(p.has_commission, false) THEN p.commission_type ELSE NULL END,
  CASE WHEN COALESCE(p.has_commission, false) THEN p.commission_value ELSE NULL END,
  p.category_id
FROM public.products p
WHERE p.unit = 'Servicio'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.user_id = p.user_id
      AND lower(btrim(s.name)) = lower(btrim(p.name))
  );

-- ---------------------------------------------------------------------------
-- 3) El backstop: no nacen más productos-servicio.
--
--    Las filas viejas se quedan donde están, y a propósito:
--    `sale_items.product_id` las referencia y borrarlas dejaría el histórico de
--    ventas apuntando a NULL. La aplicación deja de leerlas (filtra
--    `unit <> 'Servicio'` en las tres consultas que tocan `products`), así que
--    no vuelven a aparecer ni en el catálogo ni en el POS.
--
--    `NOT VALID` es exactamente por eso: valida los INSERT y UPDATE de acá en
--    adelante sin exigirle nada al histórico ya escrito.
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_unit_is_not_service;
ALTER TABLE public.products
  ADD CONSTRAINT products_unit_is_not_service
  CHECK (unit <> 'Servicio') NOT VALID;

COMMENT ON CONSTRAINT products_unit_is_not_service ON public.products IS
  'Un servicio vive en public.services, no como producto. Las filas anteriores a 20260815 siguen existiendo por el histórico de sale_items (constraint NOT VALID).';

COMMIT;
