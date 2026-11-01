-- La notificación "Cita cancelada por el cliente" trae los datos del aviso.
--
-- Desde la campana, el dueño puede "Avisar por WhatsApp" al cliente que canceló
-- desde el sitio: un enlace `api.whatsapp.com/send` con el mensaje ya escrito
-- que manda una PERSONA (sin API de Meta, igual que las promociones). Para
-- armar ese mensaje sin otra consulta ni parsear el `body` (que es texto para
-- leer, no un contrato), el `data` de la notificación suma:
--
--   * `event = 'cancelled_by_customer'`: identifica el aviso sin depender del
--     título, que es copy y puede cambiar.
--   * `date` (YYYY-MM-DD), `time` (HH24:MI) y `service`: lo que dice el mensaje.
--
-- La función queda IDÉNTICA a `20261101100000` salvo ese `jsonb_build_object`.
-- Las notificaciones ya guardadas no se reescriben: el cliente las reconoce por
-- el título y arma el mensaje con lo que traen (`cancelNoticeLink`,
-- lib/appointment-cancel-message.ts).

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

  return jsonb_build_object('id', v_appt.id, 'status', 'cancelled', 'already', false);
end;
$function$;

comment on function public.public_site_cancel_appointment(text, text, uuid) is
  'Sitio público: cancela una cita futura del teléfono dado y avisa al dueño. Idempotente.';

revoke all on function public.public_site_cancel_appointment(text, text, uuid) from public;
grant execute on function public.public_site_cancel_appointment(text, text, uuid) to anon, authenticated;
