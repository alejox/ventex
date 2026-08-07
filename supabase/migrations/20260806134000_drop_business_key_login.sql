-- El login de empleado por `business_key` + usuario nunca llegó a usarse desde
-- el cliente: `worker_login` no tiene ningún caller en el código actual
-- (`rg "worker_login"` solo aparece en el tipo generado), y la única forma de
-- que un dueño consiguiera una `business_key` —`BusinessKeyCard`, en
-- Ajustes— tampoco se renderizaba en ningún lado. `login/page.tsx` solo tiene
-- el modo email+contraseña; el toggle Dueño/Empleado que describía CLAUDE.md
-- ya no existe en el código. El sistema de invitaciones por email
-- (20260730223000_employee_email_invitations.sql) es el camino real hoy.
--
-- Confirmado por el usuario que ya no se usa: se saca de punta a punta —
-- función, generador de llaves, índice único y la columna misma.
drop function if exists public.worker_login(text, text);
drop function if exists public.generate_business_key();
drop index if exists public.profiles_business_key_unique;

alter table public.profiles drop column if exists business_key;
