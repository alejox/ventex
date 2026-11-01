-- Prueba manual SIN persistir de:
--   20261101100000_public_site_cancel_appointment.sql
--
-- DO que termina en RAISE: nada queda escrito (cliente, citas ni
-- notificaciones). Corre contra la base con la migración YA aplicada.
--
-- Elige solo un sitio publicado con reservas activas, crea un cliente con el
-- teléfono en formato de panel ("+57 399 000 1122") y tres citas: una futura
-- pendiente, una futura completada y una pasada confirmada. Busca y cancela con
-- el teléfono en formato de sitio ("3990001122").
--
-- Resultado esperado:
--   find: 1 cita (solo la futura pendiente), sin nombre del cliente
--   find teléfono corto -> []
--   cancel -> already=false, status cancelled, 1 notificación
--   re-cancel -> already=true, sin notificación nueva
--   find después de cancelar -> []
--   cancel teléfono ajeno -> CITA_NO_ENCONTRADA
--   cancel completada -> CITA_NO_CANCELABLE | cancel pasada -> CITA_NO_CANCELABLE

do $test$
declare
  v_slug text; v_owner uuid; v_customer uuid;
  v_future uuid; v_done uuid; v_past uuid;
  v_found jsonb; v_res jsonb; v_notes int; v_notes_after int;
  v_out text := '';
begin
  select slug, user_id into v_slug, v_owner
  from public.business_sites
  where published and published_config is not null and booking_enabled
  limit 1;
  if v_slug is null then raise exception 'Precondición: no hay sitio publicado con reservas'; end if;

  insert into public.customers (user_id, full_name, phone)
  values (v_owner, 'Cliente Prueba Cancelar', '+57 399 000 1122')
  returning id into v_customer;

  insert into public.appointments (user_id, customer_id, title, appointment_date, start_time, end_time, status)
  values (v_owner, v_customer, 'Prueba futura', '2099-03-01', '10:00', '10:30', 'pending')
  returning id into v_future;
  insert into public.appointments (user_id, customer_id, title, appointment_date, start_time, end_time, status)
  values (v_owner, v_customer, 'Prueba completada', '2099-03-02', '10:00', '10:30', 'completed')
  returning id into v_done;
  insert into public.appointments (user_id, customer_id, title, appointment_date, start_time, end_time, status)
  values (v_owner, v_customer, 'Prueba pasada', '2000-01-01', '10:00', '10:30', 'confirmed')
  returning id into v_past;

  -- Como visitante anónimo.
  perform set_config('role', 'anon', true);

  v_found := public.public_site_find_appointments(v_slug, '3990001122');
  v_out := v_out || 'find: ' || jsonb_array_length(v_found) || ' citas, id ok=' ||
           ((v_found -> 0 ->> 'id')::uuid = v_future) || ', trae nombre=' ||
           (v_found::text ilike '%Cliente Prueba%') || E'\n';

  v_out := v_out || 'find corto: ' || public.public_site_find_appointments(v_slug, '12345')::text || E'\n';

  perform set_config('role', 'postgres', true);
  select count(*) into v_notes from public.notifications where user_id = v_owner;
  perform set_config('role', 'anon', true);

  v_res := public.public_site_cancel_appointment(v_slug, '399 000 1122', v_future);
  v_out := v_out || 'cancel: ' || v_res::text || E'\n';

  v_res := public.public_site_cancel_appointment(v_slug, '3990001122', v_future);
  v_out := v_out || 're-cancel: ' || v_res::text || E'\n';

  perform set_config('role', 'postgres', true);
  select count(*) into v_notes_after from public.notifications where user_id = v_owner;
  v_out := v_out || 'notificaciones nuevas: ' || (v_notes_after - v_notes) || E'\n';
  perform set_config('role', 'anon', true);

  v_out := v_out || 'find después: ' || public.public_site_find_appointments(v_slug, '3990001122')::text || E'\n';

  begin
    perform public.public_site_cancel_appointment(v_slug, '3110000000', v_future);
    v_out := v_out || 'teléfono ajeno: NO FALLÓ (mal)' || E'\n';
  exception when others then
    v_out := v_out || 'teléfono ajeno: ' || sqlstate || ' ' || sqlerrm || E'\n';
  end;

  begin
    perform public.public_site_cancel_appointment(v_slug, '3990001122', v_done);
    v_out := v_out || 'completada: NO FALLÓ (mal)' || E'\n';
  exception when others then
    v_out := v_out || 'completada: ' || sqlstate || ' ' || sqlerrm || E'\n';
  end;

  begin
    perform public.public_site_cancel_appointment(v_slug, '3990001122', v_past);
    v_out := v_out || 'pasada: NO FALLÓ (mal)' || E'\n';
  exception when others then
    v_out := v_out || 'pasada: ' || sqlstate || ' ' || sqlerrm || E'\n';
  end;

  perform set_config('role', 'postgres', true);
  raise exception E'ROLLBACK (esperado). Resultado:\n%', v_out;
end;
$test$;
