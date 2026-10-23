-- =====================================================================
-- ICUI (parte 2): tasa configurable por negocio.
--
-- La tarifa nacional del ICUI cambió con los años (10 % → 15 % → 20 %), así que
-- no puede quedar fija en el código. Vive en `settings.icui_rate`, igual que el
-- IVA en `settings.tax_rate`, y la edita el dueño en Datos de tu negocio.
--
-- `lib/icui.ts` sigue teniendo `ICUI_RATE = 0.2` como respaldo (dato del
-- usuario: "Su tarifa actual es del 20 %"), pero la compra usa la tasa
-- configurada del negocio cuando existe.
-- =====================================================================

alter table public.settings
  add column if not exists icui_rate numeric(5,4) not null default 0.2000;

comment on column public.settings.icui_rate is
  'Tasa de ICUI del negocio (0..1). 0.20 = 20 %. Respaldo de la tarifa nacional cuando no está configurada.';
