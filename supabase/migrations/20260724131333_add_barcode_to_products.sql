-- Código de barras del fabricante (EAN-13 / UPC), distinto del SKU interno:
-- el SKU lo inventa el negocio, el código de barras viene impreso en el empaque.
alter table public.products add column if not exists barcode text;

-- Único POR NEGOCIO, no global: dos comercios distintos venden el mismo EAN.
-- Parcial porque la mayoría de los productos no trae código, y varios NULL no
-- chocan entre sí en un índice único.
create unique index if not exists products_barcode_per_tenant
  on public.products (user_id, barcode)
  where barcode is not null;

-- Los grants de `products` son POR COLUMNA (así se esconde purchase_price de la
-- clave pública). Una columna nueva nace SIN permisos: sin este grant, PostgREST
-- responde "permission denied for table products" en cuanto se la pida.
grant select (barcode), insert (barcode), update (barcode)
  on public.products to authenticated;
