-- Restos de la misma familia que `worker_login` (20260806134000): `staff_login`
-- referenciaba `profiles.business_key` (recién eliminada) y columnas de
-- `staff` que `20260728000002_purge_dead_staff_login.sql` ya había marcado
-- muertas (`can_login`, `username`, `auth_user_id`). `staff_login_email` es su
-- variante por email, de la misma época.
--
-- Las dos ya estaban con EXECUTE revocado a anon Y authenticated desde
-- `20260730223000_employee_email_invitations.sql` (líneas 388-389) — el
-- sistema de invitaciones por email las retiró en ese momento sin borrarlas.
-- Confirmado (has_function_privilege) que ningún rol puede invocarlas hoy.
drop function if exists public.staff_login(text, text);
drop function if exists public.staff_login_email(text, text);
