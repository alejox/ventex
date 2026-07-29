-- Se van las columnas de comisión POR PERSONA de public.staff.
--
-- La comisión se configura por producto y servicio
-- (`products.has_commission` / `commission_type` / `commission_value`), el POS
-- pide a quién se le atribuye cada línea y el monto queda congelado en
-- `sale_items.commission_amount` al vender. Estas columnas eran el modelo
-- paralelo que nunca se conectó: estaban en 0 para todo el mundo y el reporte
-- de Personal calculaba con ellas, por eso siempre daba cero.
--
-- Ninguna función, vista, trigger ni policy las referencia (verificado sobre
-- pg_get_functiondef y pg_views antes de borrar), y el código de la app dejó de
-- usarlas en el mismo cambio.
--
-- Se va también product_rate_pct, del mismo diseño abandonado.

alter table public.staff
  drop column if exists commission_rate,
  drop column if exists commission_type,
  drop column if exists commission_mode,
  drop column if exists fixed_amount_commission,
  drop column if exists product_rate_pct;
