-- RLS de public.staff reescrito sobre get_effective_user_id().
--
-- Antes convivían tres policies y ninguna hacía lo que aparentaba:
--
--   staff_read / staff_write  -> escritas contra current_tenant() e
--     is_tenant_owner(), que resuelven por profiles.owner_id. Esa columna está
--     NULL en TODOS los perfiles, incluidos los trabajadores: is_tenant_owner()
--     devolvía true para un empleado y current_tenant() devolvía su propio id,
--     así que nunca casaban con las fichas del negocio. Decorativas.
--
--   "Users manage own staff" -> ALL con get_effective_user_id(). Como las
--     policies se combinan con OR, era la única viva, y le daba a cualquier
--     trabajador escritura total sobre las fichas y las comisiones del equipo.
--
-- Ahora el SELECT sigue abierto a todo el negocio (el selector de personal de
-- las citas y la atribución de ventas lo necesitan), pero crear, editar y
-- borrar fichas vuelve a ser exclusivo del dueño.
--
-- El predicado de dueño es `auth.uid() = get_effective_user_id()`: para el dueño
-- la función devuelve su propio uid, para un trabajador devuelve el del negocio.
-- No se usa is_tenant_owner() a propósito — está rota mientras owner_id no se
-- llene, y arreglar esa función es una limpieza de tenencia aparte.

drop policy if exists "Users manage own staff" on public.staff;
drop policy if exists staff_read on public.staff;
drop policy if exists staff_write on public.staff;

create policy staff_tenant_read on public.staff
  for select to authenticated
  using (user_id = public.get_effective_user_id());

create policy staff_owner_insert on public.staff
  for insert to authenticated
  with check (
    user_id = public.get_effective_user_id()
    and (select auth.uid()) = public.get_effective_user_id()
  );

create policy staff_owner_update on public.staff
  for update to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (select auth.uid()) = public.get_effective_user_id()
  )
  with check (
    user_id = public.get_effective_user_id()
    and (select auth.uid()) = public.get_effective_user_id()
  );

create policy staff_owner_delete on public.staff
  for delete to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (select auth.uid()) = public.get_effective_user_id()
  );
