-- Compras por unidad o por caja.
--
-- Hasta acá una línea de compra solo sabía de unidades sueltas: `increment_stock`
-- suma `p_quantity` tal cual, sin multiplicar (a diferencia de
-- `register_manual_movement`, que SÍ multiplica por units_per_package). Comprar
-- 5 cajas de 12 obligaba a escribir 60 y el costo unitario a mano.
--
-- `units_per_package` se CONGELA en la línea a propósito: si mañana el producto
-- pasa de 12 a 24 unidades por caja, esta compra tiene que seguir diciendo 12,
-- porque describe lo que entró ese día. Además es lo que usa la anulación para
-- devolver exactamente el mismo stock que sumó.
alter table public.invoice_items
  add column if not exists unit_kind text not null default 'unit',
  add column if not exists units_per_package integer not null default 1;

alter table public.invoice_items
  drop constraint if exists invoice_items_unit_kind_check;
alter table public.invoice_items
  add constraint invoice_items_unit_kind_check
  check (unit_kind in ('unit', 'package'));

alter table public.invoice_items
  drop constraint if exists invoice_items_units_per_package_check;
alter table public.invoice_items
  add constraint invoice_items_units_per_package_check
  check (units_per_package >= 1);

comment on column public.invoice_items.unit_kind is
  'Si la cantidad está expresada en unidades sueltas (unit) o en cajas/paquetes (package).';
comment on column public.invoice_items.units_per_package is
  'Unidades por caja CONGELADAS al momento de la compra. Las unidades que movió la línea son quantity * units_per_package cuando unit_kind = package.';
