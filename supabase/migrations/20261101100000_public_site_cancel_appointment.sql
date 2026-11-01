-- Cancelar una cita desde el sitio público, con el teléfono con el que se reservó.
--
-- Hasta ahora la única forma de cancelar era escribirle al negocio por
-- WhatsApp. Dos RPC públicas (anon/authenticated), atadas a un sitio publicado
-- con reservas activas, igual que `public_site_book`:
--
--   * `public_site_find_appointments(slug, teléfono)`: las próximas citas
--     pendientes/confirmadas de ese teléfono en ese negocio. Devuelve fecha,
--     hora, servicio y profesional; NUNCA el nombre del cliente.
--   * `public_site_cancel_appointment(slug, teléfono, cita)`: la pasa a
--     `cancelled` (libera el cupo) y avisa al dueño con una notificación.
--     Idempotente: cancelar dos veces devuelve `already = true` sin otro aviso.
--
-- El teléfono se compara por los ÚLTIMOS 10 DÍGITOS, sin símbolos: un cliente
-- creado desde el panel con "+57 300 123 4567" y uno del sitio con
-- "3001234567" son el mismo. Espejo puro en `phoneLookupKey` (lib/co-mobile.ts).
--
-- Límite aceptado (el "más simple" que se pidió): quien sepa un teléfono puede
-- ver y cancelar las próximas citas de ese teléfono en ese sitio. Sin OTP.

create or replace function public.public_site_find_appointments(p_slug text, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_site public.business_sites%rowtype;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone text;
  v_now timestamp;
  v_result jsonb;
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

  -- Un número tan corto empataría con medio directorio: mejor no devolver nada.
  if length(v_digits) < 7 then
    return '[]'::jsonb;
  end if;
  v_phone := right(v_digits, 10);

  -- "Ahora" en la hora local del negocio: las citas se guardan en hora de pared.
  v_now := now() at time zone coalesce(nullif(v_site.timezone, ''), 'America/Bogota');

  select coalesce(jsonb_agg(row_data order by sort_key), '[]'::jsonb) into v_result
  from (
    select
      a.appointment_date + a.start_time as sort_key,
      jsonb_build_object(
        'id', a.id,
        'date', a.appointment_date,
        'time', to_char(a.start_time, 'HH24:MI'),
        'service', coalesce(sv.name, a.service_type),
        'staff', st.full_name,
        'status', a.status
      ) as row_data
    from public.appointments a
    join public.customers c on c.id = a.customer_id
    left join public.services sv on sv.id = a.service_id
    left join public.staff st on st.id = a.staff_id
    where a.user_id = v_site.user_id
      and c.user_id = v_site.user_id
      and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_phone
      and a.status in ('pending', 'confirmed')
      and (a.appointment_date + a.start_time) >= v_now
    order by a.appointment_date, a.start_time
    limit 10
  ) upcoming;

  return v_result;
end;
$function$;

comment on function public.public_site_find_appointments(text, text) is
  'Sitio público: próximas citas pendientes/confirmadas de un teléfono (últimos 10 dígitos). Sin nombre del cliente.';

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
      'customer_phone', v_phone
    )
  );

  return jsonb_build_object('id', v_appt.id, 'status', 'cancelled', 'already', false);
end;
$function$;

comment on function public.public_site_cancel_appointment(text, text, uuid) is
  'Sitio público: cancela una cita futura del teléfono dado y avisa al dueño. Idempotente.';

revoke all on function public.public_site_find_appointments(text, text) from public;
revoke all on function public.public_site_cancel_appointment(text, text, uuid) from public;
grant execute on function public.public_site_find_appointments(text, text) to anon, authenticated;
grant execute on function public.public_site_cancel_appointment(text, text, uuid) to anon, authenticated;
