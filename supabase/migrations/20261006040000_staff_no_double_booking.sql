-- Una persona del equipo no puede tener dos citas a la misma hora.
--
--  1. Trigger sobre `appointments`: protege TODAS las vías (panel, sitio web,
--     cualquier RPC). Rechaza con SQLSTATE 23P01 una cita que se pisa con otra
--     no cancelada de la MISMA persona. No toca datos existentes: solo valida
--     lo que se inserta o se mueve (persona, día u hora) o una cita que se
--     reactiva desde «cancelada».
--  2. Reserva pública sin elegir persona («con cualquiera disponible»): ahora
--     SE ASIGNA a quien esté libre a esa hora (la que menos citas tenga ese
--     día) en vez de quedar sin asignar.
--  3. Con varias páginas web, el equipo que puede recibir reservas es el que esa
--     página muestra (`catalog.staffIds`), no todo el equipo del negocio.
--
-- Las funciones públicas se parchean sobre su definición viva y la migración
-- aborta si no encuentra un fragmento, en vez de dejarlas a medias.

create or replace function public.appointments_prevent_staff_overlap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.staff_id is null or coalesce(new.status, 'pending') = 'cancelled' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.staff_id is not distinct from new.staff_id
     and old.appointment_date is not distinct from new.appointment_date
     and old.start_time is not distinct from new.start_time
     and old.end_time is not distinct from new.end_time
     and coalesce(old.status, 'pending') <> 'cancelled' then
    return new; -- cambio de estado u otro dato: no se revalida el horario
  end if;

  -- Serializa a quien reserva a la misma persona el mismo día.
  perform pg_advisory_xact_lock(hashtextextended(new.staff_id::text || ':' || new.appointment_date::text, 0));

  if exists (
    select 1
    from public.appointments a
    where a.staff_id = new.staff_id
      and a.appointment_date = new.appointment_date
      and a.id <> new.id
      and coalesce(a.status, 'pending') <> 'cancelled'
      and a.start_time < coalesce(new.end_time, new.start_time + interval '30 minutes')
      and coalesce(a.end_time, a.start_time + interval '30 minutes') > new.start_time
  ) then
    raise exception 'Esa persona ya tiene una cita en ese horario.' using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_prevent_staff_overlap_trg on public.appointments;
create trigger appointments_prevent_staff_overlap_trg
  before insert or update of staff_id, appointment_date, start_time, end_time, status
  on public.appointments
  for each row execute function public.appointments_prevent_staff_overlap();

do $$
declare
  v_filter constant text := $q$public.site_catalog_ids(v_site.published_config, 'staffIds')$q$;
  src text;
  patched text;
begin
  -- ---- public_site_slots y public_site_day_slots: el equipo es el de la página
  foreach src in array array[
    pg_get_functiondef('public.public_site_slots(text,uuid,date,uuid)'::regprocedure),
    pg_get_functiondef('public.public_site_day_slots(text,uuid,date,uuid)'::regprocedure)
  ] loop
    patched := src;
    if position('site_catalog_ids' in patched) = 0 then
      -- la persona elegida debe pertenecer a esta página
      patched := replace(patched,
        $q$where id = p_staff_id and show_on_website$q$,
        $q$where id = p_staff_id and show_on_website and ($q$ || v_filter || $q$ is null or id = any($q$ || v_filter || $q$))$q$);
      -- el cupo se calcula sobre el equipo de la página
      patched := replace(patched,
        $q$from public.staff
   where user_id = v_site.user_id
     and show_on_website$q$,
        $q$from public.staff
   where user_id = v_site.user_id
     and show_on_website
     and ($q$ || v_filter || $q$ is null or id = any($q$ || v_filter || $q$))$q$);
      -- y las citas que ocupan cupo son las de ese equipo
      patched := replace(patched,
        $q$where s.id = a.staff_id and s.show_on_website$q$,
        $q$where s.id = a.staff_id and s.show_on_website
                           and ($q$ || v_filter || $q$ is null or s.id = any($q$ || v_filter || $q$))$q$);
      if patched = src or position('where id = p_staff_id and show_on_website and (' in patched) = 0
         or position('and s.show_on_website' in patched) > 0 and position('s.id = any(' in patched) = 0 then
        raise exception 'slots/day_slots: no se encontraron los fragmentos de equipo para parchear';
      end if;
      execute patched;
    end if;
  end loop;

  -- ---- public_site_book: asigna a quien esté libre cuando no se eligió persona
  src := pg_get_functiondef('public.public_site_book(text,uuid,date,text,text,text,uuid,text)'::regprocedure);
  if position('v_assigned' in src) = 0 then
    patched := src;
    patched := replace(patched, $q$  v_appt_id uuid;
begin$q$, $q$  v_appt_id uuid;
  v_assigned uuid;
begin$q$);
    patched := replace(patched, $q$  select id into v_customer_id
  from public.customers$q$, $q$  v_assigned := p_staff_id;
  if v_assigned is null then
    select s.id into v_assigned
      from public.staff s
     where s.user_id = v_site.user_id
       and s.show_on_website
       and coalesce(s.is_active, true)
       and coalesce(s.status, 'active') = 'active'
       and ($q$ || v_filter || $q$ is null or s.id = any($q$ || v_filter || $q$))
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
         and ($q$ || v_filter || $q$ is null or s.id = any($q$ || v_filter || $q$))
    ) then
      raise exception 'Ese horario ya fue tomado. Elegí otro, por favor.' using errcode = 'P0001';
    end if;
  end if;

  select id into v_customer_id
  from public.customers$q$);
    patched := replace(patched, $q$v_site.user_id, v_customer_id, v_service.id, p_staff_id,$q$,
                                $q$v_site.user_id, v_customer_id, v_service.id, v_assigned,$q$);
    patched := replace(patched, $q$'service', v_service.name, 'status', 'pending',$q$,
                                $q$'service', v_service.name, 'status', 'pending',
    'staff', (select s.full_name from public.staff s where s.id = v_assigned),$q$);
    if position('v_assigned uuid' in patched) = 0 or position('v_service.id, v_assigned,' in patched) = 0
       or position($q$'staff', (select$q$ in patched) = 0 or position('v_assigned := p_staff_id' in patched) = 0 then
      raise exception 'public_site_book: no se encontraron los fragmentos para parchear';
    end if;
    execute patched;
  end if;
end;
$$;
