-- Agenda privada: un trabajador ve y toca SOLO sus citas.
--
-- Hasta acá `workspace_appointments_read`/`_write` eran
--   user_id = get_effective_user_id() AND worker_can('calendar')
-- así que cualquier trabajador con Agenda leía, editaba y borraba TODAS las citas
-- del negocio (cliente, teléfono, servicio). "Mis citas" era un filtro de la
-- pantalla, nada más.
--
--  1. `current_staff_id()`: la ficha (`workspace_memberships.staff_id`) de la
--     membresía activa de un MIEMBRO; NULL para el dueño. `profiles.staff_id`
--     está vacío en producción y no sirve para esto.
--  2. Policies de `appointments`: el dueño y los administradores
--     (`is_tenant_owner()`) ven todo, como antes, y también el trabajador con el
--     permiso `calendar_all` ("Ver agenda completa", hijo de `calendar`; cobrar
--     sigue exigiendo `pos`). El resto de los trabajadores, solo las filas con
--     su `staff_id`, y WITH CHECK impide crearle una cita a otro o pasarle una
--     propia. `worker_can` lee cualquier clave de `permissions` (jsonb): no hay
--     lista blanca en la base que actualizar.
--  3. `agenda_busy_slots(from, to)`: SECURITY DEFINER, devuelve SOLO fecha,
--     inicio, fin e `is_mine`. Sin persona, cliente, servicio ni título: el
--     trabajador sabe que el horario está ocupado, no por quién.
--  4. `appointments_prevent_staff_overlap` pasa a SECURITY DEFINER: el control
--     de choques tiene que ver TODAS las citas de esa persona, no solo las que
--     la RLS le deja ver a quien guarda.
--
-- Las funciones públicas de reserva (`public_site_*`) y los triggers de venta
-- (`complete_appointment_on_service_sale`, `reopen_appointment_on_sale_void`)
-- ya son SECURITY DEFINER: no cambian.
--
-- Prueba sin persistir: supabase/manual-tests/20261021100000_private_agenda.rollback.sql

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.staff_id
  from public.workspace_memberships m
  where m.id = public.get_active_membership_id()
    and m.workspace_id = public.get_effective_user_id()
    and m.auth_user_id = auth.uid()
    and m.status = 'active'
    and m.member_kind = 'member';
$$;

revoke all on function public.current_staff_id() from public, anon;
grant execute on function public.current_staff_id() to authenticated;

-- ---- Policies ----
drop policy if exists workspace_appointments_read on public.appointments;
drop policy if exists workspace_appointments_write on public.appointments;
drop policy if exists workspace_appointments_insert on public.appointments;
drop policy if exists workspace_appointments_update on public.appointments;
drop policy if exists workspace_appointments_delete on public.appointments;

create policy workspace_appointments_read on public.appointments
  for select to authenticated
  using (
    user_id = (select public.get_effective_user_id())
    and (select public.worker_can('calendar'))
    and ((select public.is_tenant_owner())
         or (select public.worker_can('calendar_all'))
         or staff_id = (select public.current_staff_id()))
  );

create policy workspace_appointments_insert on public.appointments
  for insert to authenticated
  with check (
    user_id = (select public.get_effective_user_id())
    and (select public.worker_can('calendar'))
    and ((select public.is_tenant_owner())
         or (select public.worker_can('calendar_all'))
         or staff_id = (select public.current_staff_id()))
  );

create policy workspace_appointments_update on public.appointments
  for update to authenticated
  using (
    user_id = (select public.get_effective_user_id())
    and (select public.worker_can('calendar'))
    and ((select public.is_tenant_owner())
         or (select public.worker_can('calendar_all'))
         or staff_id = (select public.current_staff_id()))
  )
  with check (
    user_id = (select public.get_effective_user_id())
    and (select public.worker_can('calendar'))
    and ((select public.is_tenant_owner())
         or (select public.worker_can('calendar_all'))
         or staff_id = (select public.current_staff_id()))
  );

create policy workspace_appointments_delete on public.appointments
  for delete to authenticated
  using (
    user_id = (select public.get_effective_user_id())
    and (select public.worker_can('calendar'))
    and ((select public.is_tenant_owner())
         or (select public.worker_can('calendar_all'))
         or staff_id = (select public.current_staff_id()))
  );

-- ---- Horarios ocupados, sin identidad ----
create or replace function public.agenda_busy_slots(p_from date, p_to date)
returns table (appointment_date date, start_time time, end_time time, is_mine boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.get_effective_user_id();
  v_staff uuid := public.current_staff_id();
begin
  if v_tenant is null or not public.worker_can('calendar') then
    raise exception 'Sin permiso para ver la agenda' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;

  return query
    select a.appointment_date,
           a.start_time,
           coalesce(a.end_time, a.start_time + interval '30 minutes')::time,
           coalesce(v_staff is not null and a.staff_id = v_staff, false)
    from public.appointments a
    where a.user_id = v_tenant
      and a.appointment_date between p_from and p_to
      and coalesce(a.status, 'pending') <> 'cancelled'
    order by a.appointment_date, a.start_time;
end;
$$;

revoke all on function public.agenda_busy_slots(date, date) from public, anon;
grant execute on function public.agenda_busy_slots(date, date) to authenticated;

-- ---- El control de choques ve todas las citas de la persona ----
alter function public.appointments_prevent_staff_overlap() security definer;
