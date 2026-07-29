-- La comisión se congela EN LA LÍNEA DE VENTA, en el momento de vender.
--
-- Hasta ahora no se guardaba: el reporte de Personal la recalculaba después
-- leyendo `staff.commission_rate` — un modelo por PERSONA que quedó huérfano
-- (ni el POS ni create_sale lo miran) y que está en 0 para todo el mundo, así
-- que el reporte siempre daba cero. El modelo vivo es el de por PRODUCTO:
-- products/services.has_commission + commission_type + commission_value, que
-- el POS ya usa para pedir a quién se le atribuye cada línea.
--
-- Se congela en vez de recalcular porque es plata que se le paga a alguien: si
-- mañana se cambia la comisión de un producto, las liquidaciones ya hechas no
-- pueden moverse solas.
--
-- Base de cálculo: el precio de vitrina (line_total, con IVA incluido), que es
-- sobre lo que ya calculaba el cliente. Para comisión fija, el valor se
-- multiplica por la cantidad de ítems vendidos — cajas si se vendió por caja.

alter table public.sale_items
  add column if not exists commission_amount numeric(12,2) not null default 0;

comment on column public.sale_items.commission_amount is
  'Comisión devengada por esta línea, congelada al vender. 0 si no hay persona atribuida o el ítem no comisiona.';

create index if not exists sale_items_staff_commission_idx
  on public.sale_items (staff_id, created_at desc)
  where staff_id is not null;
