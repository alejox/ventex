-- "Primeros pasos" marca el paso "Configura tus métodos de pago" cuando el
-- negocio guardó al menos una vez la sección Ajustes → Métodos de pago. Un
-- negocio que solo cobra en efectivo también lo completa: lo que cuenta es
-- haber DECIDIDO, no tener transferencia o datáfono encendidos.
--
-- Nullable y sin default: los negocios existentes quedan en NULL (nunca
-- guardaron la sección nueva) y nadie cambia de comportamiento en el POS, que
-- sigue leyendo accepts_transfer/accepts_card como siempre.
--
-- Sin guard: hoy un trabajador con el permiso `settings` ya guarda los medios
-- de pago, así que estampar la fecha en el mismo guardado no le da nada nuevo.
-- `settings` tiene GRANT a nivel de tabla para authenticated (SELECT/INSERT/
-- UPDATE): la columna queda legible y escribible sin GRANT por columna; la RLS
-- del negocio decide de quién es la fila.
alter table public.settings
  add column if not exists payment_methods_configured_at timestamptz;
