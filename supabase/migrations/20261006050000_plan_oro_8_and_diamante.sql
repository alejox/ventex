-- Plan Oro: hasta 8 colaboradores (antes 5). Plan nuevo Diamante: 9 en adelante,
-- sin tope de colaboradores, $110.000 al mes.
--
-- `max_collaborators` es un entero NOT NULL y 0 ya significa "solo tú", así que
-- "ilimitado" es 9999 (ver UNLIMITED_COLLABORATORS en config/plans.ts). Ventas
-- mensuales ilimitadas (NULL) como Oro. Mismo cobro anual que los demás planes
-- (`annual_charged_months` = 10, `price_yearly` = 0).
update public.plans
   set max_collaborators = 8, updated_at = now()
 where id = 'oro';

insert into public.plans (
  id, name, max_collaborators, max_monthly_sales, price,
  sort_order, is_active, price_yearly, discount_percent, annual_charged_months
) values (
  'diamante', 'Diamante', 9999, null, 110000,
  4, true, 0, 0, 10
)
on conflict (id) do update set
  name = excluded.name,
  max_collaborators = excluded.max_collaborators,
  max_monthly_sales = excluded.max_monthly_sales,
  price = excluded.price,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

-- Períodos de cobro de Diamante. Sin estas filas la tarjeta no tiene período
-- que cobrar y su botón «Pagar ahora» queda desactivado. Mensual, semestral
-- (7 meses por el precio de 6) y anual (12 meses por 10), como Oro y Plata.
insert into public.plan_periods (plan_id, name, months, price, credits, is_active, sort_order)
select 'diamante', v.name, v.months, v.price, v.credits, true, v.sort_order
from (values
  ('Mensual',   1,  110000,  1, 1),
  ('Semestral', 7,  660000,  6, 3),
  ('Anual',     12, 1100000, 10, 4)
) as v(name, months, price, credits, sort_order)
where not exists (
  select 1 from public.plan_periods pp where pp.plan_id = 'diamante' and pp.months = v.months
);
