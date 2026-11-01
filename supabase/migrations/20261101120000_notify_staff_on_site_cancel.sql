-- Avisar al barbero (o a quien atienda) cuando el cliente cancela desde el sitio.
--
-- Hasta acá la cancelación desde el sitio público avisaba solo al DUEÑO: las
-- notificaciones son de todo el negocio (`user_id` = el negocio) y la RLS solo
-- deja leerlas a `is_tenant_owner()`. Un trabajador veía la campana vacía, así
-- que el barbero se enteraba de que le cancelaron cuando llegaba el hueco.
--
--   * `notifications.recipient_staff_id`: null = para el dueño (todo lo que ya
--     existe); con valor = para esa persona del equipo. Las demás funciones que
--     insertan notificaciones nombran sus columnas y no la tocan: siguen siendo
--     del dueño.
--   * RLS (mismos nombres de policy): el dueño/administrador lee y marca las de
--     `recipient_staff_id is null`; un miembro, las suyas por
--     `current_staff_id()` (su membresía activa, NUNCA `profiles.staff_id`, que
--     está vacío en producción). Un administrador con ficha de personal ve las
--     dos.
--   * `public_site_cancel_appointment` queda IDÉNTICA a `20261101110000` y suma
--     un segundo aviso para `appointments.staff_id` SOLO si esa persona tiene
--     membresía activa en el negocio: sin login nadie lo leería. Lleva otro
--     título ("Se canceló una de tus citas") y `event =
--     'cancelled_by_customer_staff'`, para que la campana no le ofrezca el botón
--     de WhatsApp (`cancelNoticeLink`): avisarle al cliente sigue siendo del
--     dueño.
--   * `anon`/`authenticated` pierden TRUNCATE/REFERENCES/TRIGGER sobre
--     `notifications` (TRUNCATE no pasa por RLS), igual que `shifts` y
--     `cash_movements`.
--
-- Prueba sin persistir:
--   supabase/manual-tests/20261101120000_notify_staff_on_site_cancel.rollback.sql

alter table public.notifications
  add column if not exists recipient_staff_id uuid null
    references public.staff(id) on delete cascade;

comment on column public.notifications.recipient_staff_id is
  'Destinatario dentro del equipo. NULL = para el dueño/administradores del negocio.';

create index if not exists notifications_recipient_staff_idx
  on public.notifications (recipient_staff_id)
  where recipient_staff_id is not null;

drop policy if exists workspace_notifications_read on public.notifications;
create policy workspace_notifications_read on public.notifications
  for select to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      (recipient_staff_id is null and public.is_tenant_owner())
      or (recipient_staff_id is not null and recipient_staff_id = public.current_staff_id())
    )
  );

drop policy if exists workspace_notifications_acknowledge on public.notifications;
create policy workspace_notifications_acknowledge on public.notifications
  for update to authenticated
  using (
    user_id = public.get_effective_user_id()
    and (
      (recipient_staff_id is null and public.is_tenant_owner())
      or (recipient_staff_id is not null and recipient_staff_id = public.current_staff_id())
    )
  )
  with check (
    user_id = public.get_effective_user_id()
    and (
      (recipient_staff_id is null and public.is_tenant_owner())
      or (recipient_staff_id is not null and recipient_staff_id = public.current_staff_id())
    )
  );

revoke truncate, references, trigger on public.notifications from anon, authenticated;

create or replace function public.public_site_cancel_appointment(
  p_slug text, p_phone text, p_appointment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_site public.business_sites%rowtype;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone text;
  v_appt public.appointments%rowtype;
  v_customer_name text;
  v_service_name text;
  v_now timestamp;
begin
  select * into v_site
  from public.business_sites
  where slug = lower(btrim(p_slug))
    and published
    and published_config is not null
    and booking_enabled;
  if not found then
    raise exception 'Este negocio no está recibiendo reservas en línea.' using errcode = 'P0002';
  end if;

  if length(v_digits) < 7 then
    raise exception 'CITA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  v_phone := right(v_digits, 10);

  -- La cita se bloquea antes de mirar su estado: dos cancelaciones a la vez (o
  -- una cancelación y el dueño confirmándola) no se pisan.
  select a.* into v_appt
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  where a.id = p_appointment_id
    and a.user_id = v_site.user_id
    and c.user_id = v_site.user_id
    and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_phone
  for update of a;
  if not found then
    -- Mismo error para "no existe" y "no es de ese teléfono": no se confirma
    -- que una cita ajena existe.
    raise exception 'CITA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;

  if v_appt.status = 'cancelled' then
    return jsonb_build_object('id', v_appt.id, 'status', 'cancelled', 'already', true);
  end if;

  v_now := now() at time zone coalesce(nullif(v_site.timezone, ''), 'America/Bogota');
  if v_appt.status = 'completed' or (v_appt.appointment_date + v_appt.start_time) < v_now then
    raise exception 'CITA_NO_CANCELABLE' using errcode = '22023';
  end if;

  update public.appointments
     set status = 'cancelled'
   where id = v_appt.id;

  select c.full_name into v_customer_name from public.customers c where c.id = v_appt.customer_id;
  v_service_name := coalesce(
    (select sv.name from public.services sv where sv.id = v_appt.service_id),
    v_appt.service_type,
    'Cita'
  );

  insert into public.notifications (user_id, type, severity, title, body, data)
  values (
    v_site.user_id, 'appointment', 'info', 'Cita cancelada por el cliente',
    v_service_name || ' del ' || to_char(v_appt.appointment_date, 'DD/MM/YYYY')
      || ' a las ' || to_char(v_appt.start_time, 'HH24:MI')
      || ' (' || coalesce(v_customer_name, 'cliente') || ')',
    jsonb_build_object(
      'appointment_id', v_appt.id,
      'customer_name', v_customer_name,
      'customer_phone', v_phone,
      'event', 'cancelled_by_customer',
      'date', v_appt.appointment_date,
      'time', to_char(v_appt.start_time, 'HH24:MI'),
      'service', v_service_name
    )
  );

  -- Aviso aparte para quien atiende la cita, solo si tiene acceso a Ventex
  -- (membresía activa con ese `staff_id`): sin login nadie lo leería. Mismo
  -- cuerpo y datos, otro `event` y otro título, para que la campana no le
  -- ofrezca el botón de WhatsApp al cliente (eso lo decide el dueño).
  if v_appt.staff_id is not null and exists (
    select 1
    from public.workspace_memberships m
    where m.workspace_id = v_site.user_id
      and m.staff_id = v_appt.staff_id
      and m.status = 'active'
      -- Igual que `current_staff_id()`: el dueño ya recibe el aviso general.
      and m.member_kind = 'member'
  ) then
    insert into public.notifications (user_id, recipient_staff_id, type, severity, title, body, data)
    values (
      v_site.user_id, v_appt.staff_id, 'appointment', 'info', 'Se canceló una de tus citas',
      v_service_name || ' del ' || to_char(v_appt.appointment_date, 'DD/MM/YYYY')
        || ' a las ' || to_char(v_appt.start_time, 'HH24:MI')
        || ' (' || coalesce(v_customer_name, 'cliente') || ')',
      jsonb_build_object(
        'appointment_id', v_appt.id,
        'customer_name', v_customer_name,
        'customer_phone', v_phone,
        'event', 'cancelled_by_customer_staff',
        'date', v_appt.appointment_date,
        'time', to_char(v_appt.start_time, 'HH24:MI'),
        'service', v_service_name
      )
    );
  end if;

  return jsonb_build_object('id', v_appt.id, 'status', 'cancelled', 'already', false);
end;
$function$;

comment on function public.public_site_cancel_appointment(text, text, uuid) is
  'Sitio público: cancela una cita futura del teléfono dado y avisa al dueño y a quien la atiende (si tiene acceso). Idempotente.';

revoke all on function public.public_site_cancel_appointment(text, text, uuid) from public;
grant execute on function public.public_site_cancel_appointment(text, text, uuid) to anon, authenticated;
