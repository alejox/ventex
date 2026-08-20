-- Referencias de ePayco en la orden de cobro.
--
-- Por qué columnas nuevas y no reusar `dlocal_payment_id`: los identificadores
-- de ePayco son TRES y con roles distintos, y meterlos en una columna cuyo
-- nombre dice "dlocal" dejaría el esquema mintiendo sobre qué guarda.
--
-- Diferencia de fondo con dLocal: allá el id de pago existía al CREAR la orden
-- (lo devolvía `POST /v1/payments`). En ePayco `x_ref_payco` nace recién cuando
-- alguien paga, así que estas columnas arrancan NULL y se llenan con la primera
-- observación —venga del webhook o del polling.

alter table public.billing_orders
  add column if not exists epayco_ref text,
  add column if not exists epayco_transaction_id text,
  add column if not exists epayco_status_code text;

comment on column public.billing_orders.epayco_ref is
  'x_ref_payco: referencia de ePayco. Nace al pagar, no al crear la orden';
comment on column public.billing_orders.epayco_transaction_id is
  'x_transaction_id: id de la transacción en la red, para cruzar con soporte';
comment on column public.billing_orders.epayco_status_code is
  'Último código de estado observado (1..11). Sirve para no reprocesar la misma notificación';

-- El webhook resuelve la orden por `extras.extra1` (uuid) o por `invoice`
-- (`order_id`), pero una vez estampada la referencia hay que poder ir al revés:
-- de una ref de ePayco a la orden, que es como llega un reclamo de soporte.
create index if not exists billing_orders_epayco_ref_idx
  on public.billing_orders (epayco_ref)
  where epayco_ref is not null;

-- `order_id` es EXACTAMENTE el `invoice` que se le manda a ePayco y el
-- `referenceClient` con el que se lo consulta después. El polling filtra por
-- ese valor, así que necesita ser único y buscable.
create unique index if not exists billing_orders_order_id_key
  on public.billing_orders (order_id);
