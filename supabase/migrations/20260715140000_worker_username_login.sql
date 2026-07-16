-- Usuario de acceso del trabajador (único por negocio). El trabajador inicia sesión
-- con: llave del negocio (del dueño) + este usuario + su contraseña.
alter table public.profiles add column if not exists worker_username text;

-- Unicidad del usuario dentro de un mismo negocio (workspace).
create unique index if not exists profiles_worker_username_unique
  on public.profiles (workspace_id, lower(worker_username))
  where worker_username is not null;

-- Resuelve el correo (auth) del trabajador a partir de la llave del negocio + usuario.
-- business_key es único (profiles_business_key_unique), así que identifica un solo dueño.
-- Un trabajador activo tiene is_worker=true y workspace_id=<dueño>.
create or replace function public.worker_login(p_business_key text, p_username text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select au.email
  from public.profiles owner
  join public.profiles w
    on w.workspace_id = owner.id
   and w.is_worker = true
   and lower(w.worker_username) = lower(trim(p_username))
  join auth.users au on au.id = w.id
  where owner.business_key = upper(trim(p_business_key))
  limit 1;
$function$;

grant execute on function public.worker_login(text, text) to anon, authenticated;
