-- ¿El negocio cobra con tarjeta?
--
-- Una tienda de barrio sin datáfono no tiene por qué ver "Datáfono" entre los
-- medios de pago: cada opción que no aplica es una que el cajero tiene que
-- descartar en cada venta.
--
-- `settings` tiene grants a nivel de tabla para authenticated, así que la
-- columna nueva queda cubierta sin grants por columna (a diferencia de
-- `products`, donde el SELECT es columna por columna).
alter table public.settings
  add column if not exists accepts_card boolean not null default true;
