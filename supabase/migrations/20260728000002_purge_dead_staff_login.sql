-- Limpia los restos del sistema de acceso viejo basado en public.staff
-- (columnas can_login/username/auth_user_id + RPC staff_login), que quedó
-- muerto cuando el login pasó a worker_login contra public.profiles.
--
-- Esas filas eran un peligro además de ruido: sus perfiles tenían
-- is_worker = false, así que quien entrara con esas credenciales habría sido
-- tratado como DUEÑO de su propio tenant en vez de como empleado.
--
-- El criterio no son ids sueltos sino la condición que las define: ficha
-- marcada como "puede entrar" que NO tiene cuenta viva colgada por
-- profiles.staff_id. Por eso es reproducible en cualquier entorno y no toca
-- nada del sistema de acceso actual.

delete from auth.users u
where u.id in (
  select s.auth_user_id
  from public.staff s
  where s.can_login
    and s.auth_user_id is not null
    and not exists (select 1 from public.profiles p where p.staff_id = s.id)
);

delete from public.staff s
where s.can_login
  and not exists (select 1 from public.profiles p where p.staff_id = s.id);
