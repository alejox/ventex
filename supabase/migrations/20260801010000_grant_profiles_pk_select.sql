-- Los UPDATE/SELECT client-side filtran SIEMPRE por la PK (`WHERE id = ...`):
-- el revoke masivo de 20260730223000 dejó sin SELECT a `id`, y Postgres exige
-- permiso de lectura sobre las columnas del WHERE. Sin esto, cualquier
-- `update profiles set ... where id = ...` (onboarding OAuth, ajustes, perfil)
-- falla con "permission denied for table profiles".
-- La visibilidad de filas sigue intacta: la RLS de profiles filtra por el
-- policy de fila propia/dueño; este grant solo permite filtrar por PK.
grant select (id) on public.profiles to authenticated;
