-- El costo de compra deja de ser legible con un SELECT directo.
--
-- El código ya estaba escrito como si `purchase_price` no se pudiera leer
-- (PRODUCT_COLUMNS sin `*`, costos por get_product_costs / attachCosts, que
-- exigen worker_can('inventory_costs')), pero el REVOKE nunca había tenido
-- efecto: `authenticated` conservaba el SELECT de TABLA ENTERA, y un grant de
-- tabla gana sobre la revocación de una columna. Cualquier trabajador con
-- acceso a productos podía pedir purchase_price por la API.
--
-- Ahora: SELECT por columna (todas menos purchase_price). INSERT/UPDATE/DELETE
-- siguen a nivel de tabla (escribir el costo lo controla products_guard_edit).
-- Verificado antes de aplicar: ninguna consulta del cliente lee products con
-- `*` ni pide purchase_price, y ninguna función SECURITY INVOKER lo lee.
--
-- Si agregas una columna a products, agrégala también a este GRANT y a
-- PRODUCT_COLUMNS (services/inventory.service.ts).

revoke select on public.products from authenticated;
revoke truncate, references, trigger on public.products from authenticated;
revoke all on public.products from anon;

grant select (
  id, created_at, updated_at, user_id, name, sku, price, stock_level, image_url, status,
  category_id, unit, distributor_id, minimum_stock, icon, has_commission, commission_type,
  commission_value, units_per_package, barcode, package_price, tracks_stock, open_price,
  allows_fractions, is_ingredient
) on public.products to authenticated;
