-- Avisar a quien atiende la cita cuando entra una reserva desde el sitio.
--
-- `public_site_book` avisaba solo al DUEÑO ("Nueva reserva pendiente"). El
-- barbero asignado se enteraba al abrir el calendario. Mismo modelo que la
-- cancelación (`20261101120000_notify_staff_on_site_cancel.sql`):
--
--   * La notificación del dueño queda IDÉNTICA (`recipient_staff_id` null): el
--     dueño la sigue viendo una sola vez.
--   * Se suma una SEGUNDA fila con `recipient_staff_id = v_assigned` SOLO si esa
--     persona tiene membresía activa de miembro en el negocio (sin login nadie
--     la leería; el dueño/admin ya recibe la general). La RLS de
--     `notifications` (por `current_staff_id()`) hace que solo esa persona la
--     vea: ningún otro miembro recibe duplicados.
--   * Título "Nueva reserva asignada a ti", mismo cuerpo, `event =
--     'booked_staff'`.
--
-- El resto de la función es idéntico a la definición viva (`20261101130000`).

create or replace function public.public_site_book(
  p_slug text, p_service_id uuid, p_date date, p_time text,
  p_customer_name text, p_customer_phone text,
  p_staff_id uuid default null::uuid, p_notes text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_site public.business_sites%rowtype;
  v_service public.services%rowtype;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9+]', '', 'g');
  v_start time;
  v_customer_id uuid;
  v_recent int;
  v_open_slots int;
  v_appt_id uuid;
  v_assigned uuid;
  v_excluded uuid;
  v_body text;
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

  if length(v_name) < 3 then
    raise exception 'Escribe tu nombre completo.' using errcode = 'P0001';
  end if;
  if length(v_phone) < 7 then
    raise exception 'Escribe un teléfono válido para confirmarte la cita.' using errcode = 'P0001';
  end if;

  begin
    v_start := p_time::time;
  exception when others then
    raise exception 'La hora seleccionada no es válida.' using errcode = 'P0001';
  end;

  select * into v_service
  from public.services
  where id = p_service_id
    and user_id = v_site.user_id
    and coalesce(status, 'active') = 'active';
  if not found then
    raise exception 'El servicio seleccionado ya no está disponible.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_site.user_id::text || ':' || p_date::text, 0));

  select count(*) into v_recent
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  where a.user_id = v_site.user_id
    and c.phone = v_phone
    and a.created_at > now() - interval '24 hours'
    and coalesce(a.status, 'pending') <> 'cancelled';
  if v_recent >= 10 then
    raise exception 'Ya tienes varias reservas pendientes. Escríbenos para coordinar.' using errcode = 'P0001';
  end if;

  select count(*) into v_open_slots
  from public.public_site_slots(p_slug, p_service_id, p_date, p_staff_id);
  if v_open_slots = 0 then
    raise exception 'El negocio no atiende ese día. Elige otra fecha, por favor.' using errcode = 'P0001';
  end if;

  perform 1
  from public.public_site_slots(p_slug, p_service_id, p_date, p_staff_id) slot
  where slot.slot_time = to_char(v_start, 'HH24:MI');
  if not found then
    raise exception 'Ese horario ya fue tomado. Elige otro, por favor.' using errcode = 'P0001';
  end if;

  v_assigned := p_staff_id;
  if v_assigned is null then
    -- "Any available" never lands on the admin unless the business opted in
    -- (null when nothing is excluded, see site_booking_excluded_staff).
    v_excluded := public.site_booking_excluded_staff(v_site.user_id, v_site.published_config);

    select s.id into v_assigned
      from public.staff s
     where s.user_id = v_site.user_id
       and s.show_on_website
       and coalesce(s.is_active, true)
       and coalesce(s.status, 'active') = 'active'
       and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or s.id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
       and s.id is distinct from v_excluded
       and not exists (
         select 1 from public.appointments a
          where a.staff_id = s.id
            and a.appointment_date = p_date
            and coalesce(a.status, 'pending') <> 'cancelled'
            and a.start_time < v_start + make_interval(mins => coalesce(v_service.duration_minutes, 30))
            and coalesce(a.end_time, a.start_time + interval '30 minutes') > v_start)
     order by (select count(*) from public.appointments a2
                where a2.staff_id = s.id and a2.appointment_date = p_date
                  and coalesce(a2.status, 'pending') <> 'cancelled'),
              s.full_name
     limit 1;

    -- Hay equipo visible pero nadie libre: otra reserva se llevó el cupo.
    if v_assigned is null and exists (
      select 1 from public.staff s
       where s.user_id = v_site.user_id and s.show_on_website
         and coalesce(s.is_active, true) and coalesce(s.status, 'active') = 'active'
         and (public.site_catalog_ids(v_site.published_config, 'staffIds') is null or s.id = any(public.site_catalog_ids(v_site.published_config, 'staffIds')))
         and s.id is distinct from v_excluded
    ) then
      raise exception 'Ese horario ya fue tomado. Elige otro, por favor.' using errcode = 'P0001';
    end if;
  end if;

  select id into v_customer_id
  from public.customers
  where user_id = v_site.user_id and phone = v_phone
  limit 1;

  if v_customer_id is null then
    insert into public.customers (user_id, full_name, phone)
    values (v_site.user_id, v_name, v_phone)
    returning id into v_customer_id;
  end if;

  insert into public.appointments (
    user_id, customer_id, service_id, staff_id, title, service_type,
    appointment_date, start_time, end_time, status, notes
  ) values (
    v_site.user_id, v_customer_id, v_service.id, v_assigned,
    v_service.name || ' · ' || v_name, v_service.name,
    p_date, v_start,
    v_start + make_interval(mins => coalesce(v_service.duration_minutes, 30)),
    'pending', nullif(btrim(coalesce(p_notes, '')), '')
  ) returning id into v_appt_id;

  v_body := v_service.name || ' para el ' || to_char(p_date, 'DD/MM/YYYY') || ' a las ' || to_char(v_start, 'HH24:MI') || ' (' || v_name || ')';

  insert into public.notifications (user_id, type, severity, title, body, data)
  values (
    v_site.user_id, 'appointment', 'info', 'Nueva reserva pendiente',
    v_body,
    jsonb_build_object('appointment_id', v_appt_id, 'customer_name', v_name, 'customer_phone', v_phone)
  );

  -- Aviso aparte para quien atiende la cita, solo si tiene acceso a Ventex
  -- (membresía activa de miembro con ese `staff_id`), igual que la cancelación.
  if v_assigned is not null and exists (
    select 1
    from public.workspace_memberships m
    where m.workspace_id = v_site.user_id
      and m.staff_id = v_assigned
      and m.status = 'active'
      -- Igual que `current_staff_id()`: el dueño ya recibe el aviso general.
      and m.member_kind = 'member'
  ) then
    insert into public.notifications (user_id, recipient_staff_id, type, severity, title, body, data)
    values (
      v_site.user_id, v_assigned, 'appointment', 'info', 'Nueva reserva asignada a ti',
      v_body,
      jsonb_build_object(
        'appointment_id', v_appt_id,
        'customer_name', v_name,
        'customer_phone', v_phone,
        'event', 'booked_staff',
        'date', p_date,
        'time', to_char(v_start, 'HH24:MI'),
        'service', v_service.name
      )
    );
  end if;

  return jsonb_build_object(
    'id', v_appt_id, 'date', p_date, 'time', to_char(v_start, 'HH24:MI'),
    'service', v_service.name, 'status', 'pending',
    'staff', (select s.full_name from public.staff s where s.id = v_assigned),
    'whatsapp', v_site.published_config #>> '{contact,whatsapp}'
  );
end;
$function$;

comment on function public.public_site_book(text, uuid, date, text, text, text, uuid, text) is
  'Sitio público: reserva una cita pendiente y avisa al dueño y a quien la atiende (si tiene acceso).';

revoke all on function public.public_site_book(text, uuid, date, text, text, text, uuid, text) from public;
grant execute on function public.public_site_book(text, uuid, date, text, text, text, uuid, text) to anon, authenticated;
