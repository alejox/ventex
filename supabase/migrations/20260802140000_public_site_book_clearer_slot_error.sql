-- The slot re-check collapsed two very different failures into "ya fue tomado":
-- a genuinely taken slot, and a day the shop simply does not open. Tell them apart
-- so the visitor knows whether to pick another hour or another day.
create or replace function public.public_site_book(
  p_slug           text,
  p_service_id     uuid,
  p_date           date,
  p_time           text,
  p_customer_name  text,
  p_customer_phone text,
  p_staff_id       uuid default null,
  p_notes          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site        public.business_sites%rowtype;
  v_service     public.services%rowtype;
  v_name        text := btrim(coalesce(p_customer_name, ''));
  v_phone       text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9+]', '', 'g');
  v_start       time;
  v_customer_id uuid;
  v_recent      int;
  v_open_slots  int;
  v_appt_id     uuid;
begin
  select * into v_site
    from public.business_sites
   where slug = lower(btrim(p_slug)) and published and booking_enabled;
  if not found then
    raise exception 'Este negocio no está recibiendo reservas en línea.' using errcode = 'P0002';
  end if;

  if length(v_name) < 3 then
    raise exception 'Escribí tu nombre completo.' using errcode = 'P0001';
  end if;
  if length(v_phone) < 7 then
    raise exception 'Escribí un teléfono válido para confirmarte la cita.' using errcode = 'P0001';
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

  select count(*) into v_recent
    from public.appointments a
    join public.customers c on c.id = a.customer_id
   where a.user_id = v_site.user_id
     and c.phone = v_phone
     and a.created_at > now() - interval '24 hours'
     and coalesce(a.status, 'pending') <> 'cancelled';
  if v_recent >= 3 then
    raise exception 'Ya tenés varias reservas pendientes. Escribinos para coordinar.' using errcode = 'P0001';
  end if;

  -- Re-check server-side: the client already filtered, but the client is not to
  -- be trusted and the slot may have been taken meanwhile.
  select count(*) into v_open_slots
    from public.public_site_slots(p_slug, p_service_id, p_date, p_staff_id);

  if v_open_slots = 0 then
    raise exception 'El negocio no atiende ese día. Elegí otra fecha, por favor.' using errcode = 'P0001';
  end if;

  perform 1
    from public.public_site_slots(p_slug, p_service_id, p_date, p_staff_id) s
   where s.slot_time = to_char(v_start, 'HH24:MI');
  if not found then
    raise exception 'Ese horario ya fue tomado. Elegí otro, por favor.' using errcode = 'P0001';
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
  )
  values (
    v_site.user_id, v_customer_id, v_service.id, p_staff_id,
    v_service.name || ' · ' || v_name, v_service.name,
    p_date, v_start,
    v_start + make_interval(mins => coalesce(v_service.duration_minutes, 30)),
    'pending',
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_appt_id;

  return jsonb_build_object(
    'id', v_appt_id, 'date', p_date, 'time', to_char(v_start, 'HH24:MI'),
    'service', v_service.name, 'status', 'pending', 'whatsapp', v_site.whatsapp
  );
end;
$$;

revoke all on function public.public_site_book(text, uuid, date, text, text, text, uuid, text) from public;
grant execute on function public.public_site_book(text, uuid, date, text, text, text, uuid, text) to anon, authenticated;
