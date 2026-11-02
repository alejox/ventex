-- Prueba manual SIN persistir de:
--   20261101120000_notify_staff_on_site_cancel.sql
--
-- DO que termina en RAISE: nada queda escrito (cliente, cita, notificaciones
-- ni selecciones de sesión). Corre contra la base con la migración YA aplicada.
--
-- Elige un negocio con sitio publicado con reservas Y una membresía activa de
-- miembro con `staff_id` (alguien del equipo con login). Crea un cliente y una
-- cita futura atendida por esa persona, la cancela como visitante anónimo y
-- después mira la campana como el miembro y como el dueño (RLS real: rol
-- `authenticated` + `request.jwt.claims` con `sub` y `session_id`, y una fila
-- en `workspace_session_selections`, que es de donde `get_active_membership_id`,
-- `get_effective_user_id`, `is_tenant_owner` y `current_staff_id` sacan la
-- membresía activa).
--
-- Resultado esperado:
--   cancel -> already=false
--   filas del dueño (recipient_staff_id null) = 1 | filas del barbero = 1
--   título barbero = "Se canceló una de tus citas", event cancelled_by_customer_staff
--   miembro ve: 1 (solo la suya) — 2 si el miembro es administrador (is_admin)
--   miembro marca leídas: 1 fila (no puede marcar la del dueño; 2 si es admin)
--   dueño ve: 1 (la general; la del barbero NO)

do $test$
declare
  v_slug text; v_owner uuid; v_owner_mem uuid;
  v_member_uid uuid; v_member_mem uuid; v_staff uuid; v_is_admin boolean;
  v_customer uuid; v_appt uuid;
  v_res jsonb; v_n int; v_title text; v_event text;
  v_out text := '';
begin
  select s.slug, s.user_id, m.auth_user_id, m.id, m.staff_id, coalesce(m.is_admin, false)
    into v_slug, v_owner, v_member_uid, v_member_mem, v_staff, v_is_admin
  from public.business_sites s
  join public.workspace_memberships m
    on m.workspace_id = s.user_id
   and m.status = 'active'
   and m.member_kind = 'member'
   and m.staff_id is not null
  where s.published and s.published_config is not null and s.booking_enabled
  order by coalesce(m.is_admin, false)  -- preferir un miembro que no sea admin
  limit 1;
  if v_slug is null then
    raise exception 'Precondición: no hay negocio con sitio publicado con reservas y un miembro activo con staff_id';
  end if;

  select id into v_owner_mem
  from public.workspace_memberships
  where workspace_id = v_owner and member_kind = 'owner' and status = 'active'
  limit 1;
  if v_owner_mem is null then raise exception 'Precondición: el negocio % no tiene membresía de dueño activa', v_owner; end if;

  v_out := v_out || 'miembro is_admin=' || v_is_admin || E'\n';

  insert into public.customers (user_id, full_name, phone)
  values (v_owner, 'Cliente Prueba Barbero', '+57 399 000 2233')
  returning id into v_customer;

  insert into public.appointments (user_id, customer_id, staff_id, title, appointment_date, start_time, end_time, status)
  values (v_owner, v_customer, v_staff, 'Prueba barbero', '2099-03-01', '10:00', '10:30', 'pending')
  returning id into v_appt;

  -- Como visitante anónimo.
  perform set_config('role', 'anon', true);
  v_res := public.public_site_cancel_appointment(v_slug, '3990002233', v_appt);
  v_out := v_out || 'cancel: ' || v_res::text || E'\n';
  perform set_config('role', 'postgres', true);

  select count(*) into v_n from public.notifications
  where data ->> 'appointment_id' = v_appt::text and recipient_staff_id is null;
  v_out := v_out || 'filas del dueño: ' || v_n || E'\n';

  select count(*), max(title), max(data ->> 'event') into v_n, v_title, v_event
  from public.notifications
  where data ->> 'appointment_id' = v_appt::text and recipient_staff_id = v_staff;
  v_out := v_out || 'filas del barbero: ' || v_n || ' | título: ' || coalesce(v_title, '-')
           || ' | event: ' || coalesce(v_event, '-') || E'\n';

  insert into public.workspace_session_selections (session_id, auth_user_id, workspace_id, membership_id)
  values ('notif-barbero-miembro', v_member_uid, v_owner, v_member_mem),
         ('notif-barbero-dueno', v_owner, v_owner, v_owner_mem);

  -- Como el miembro (el barbero).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member_uid, 'role', 'authenticated', 'session_id', 'notif-barbero-miembro')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.notifications where data ->> 'appointment_id' = v_appt::text;
  v_out := v_out || 'miembro ve: ' || v_n || ' (current_staff_id ok=' || (public.current_staff_id() = v_staff) || ')' || E'\n';
  update public.notifications set read_at = now()
  where data ->> 'appointment_id' = v_appt::text and read_at is null;
  get diagnostics v_n = row_count;
  v_out := v_out || 'miembro marca leídas: ' || v_n || E'\n';
  perform set_config('role', 'postgres', true);

  -- Como el dueño.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated', 'session_id', 'notif-barbero-dueno')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.notifications where data ->> 'appointment_id' = v_appt::text;
  v_out := v_out || 'dueño ve: ' || v_n || E'\n';
  perform set_config('role', 'postgres', true);

  raise exception E'ROLLBACK (esperado). Resultado:\n%', v_out;
end;
$test$;
