-- ¿El negocio cobra por transferencia?
--
-- Mismo criterio que `accepts_card`: una opción de pago que el negocio no
-- maneja es una que el cajero tiene que descartar en cada venta.
alter table public.settings
  add column if not exists accepts_transfer boolean not null default true;
