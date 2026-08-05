-- Cajas Y unidades sueltas en la MISMA línea ("me llegan 3 cajas y 4 unidades").
--
-- El modelo anterior obligaba a elegir una sola presentación por línea, así que
-- una entrega mixta necesitaba dos líneas del mismo producto.
--
-- Se vuelve canónico `quantity` = TOTAL en unidades sueltas. Es el número que
-- mueve el stock y el que ya guardaban todas las filas anteriores, así que
-- `increment_stock` y la anulación funcionan sin traducir nada, y las compras
-- viejas siguen siendo correctas sin backfill.
--
-- `package_quantity` guarda cuántas cajas se tipearon, para poder reabrir la
-- compra tal cual se cargó. Las unidades sueltas se derivan:
--   sueltas = quantity - package_quantity * units_per_package
alter table public.invoice_items
  add column if not exists package_quantity numeric not null default 0;

alter table public.invoice_items
  drop constraint if exists invoice_items_package_quantity_check;
alter table public.invoice_items
  add constraint invoice_items_package_quantity_check
  check (package_quantity >= 0);

-- Las filas que se guardaron con el modelo anterior tenían `quantity` en cajas.
-- Se pasan al canónico. Solo alcanza a las creadas con `unit_kind = 'package'`;
-- todo lo anterior a esta serie de cambios ya estaba en unidades sueltas.
update public.invoice_items
   set package_quantity = quantity,
       quantity         = quantity * greatest(units_per_package, 1)
 where unit_kind = 'package'
   and package_quantity = 0;

comment on column public.invoice_items.quantity is
  'TOTAL en unidades sueltas. Es lo que mueve el stock.';
comment on column public.invoice_items.package_quantity is
  'Cajas tipeadas en la línea. Las unidades sueltas son quantity - package_quantity * units_per_package.';
comment on column public.invoice_items.unit_kind is
  'A qué se refiere unit_price: al precio de una unidad suelta (unit) o al de una caja (package).';
