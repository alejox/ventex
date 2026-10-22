-- Estaciones (sillas): una estación física opcional para las citas.
--
-- Las estaciones son OPCIONALES: un negocio sin ninguna se comporta exactamente
-- como hoy (`appointments.station_id` queda en NULL y ningún trigger nuevo hace
-- nada). La asignación puede ser fija —la ficha de Personal trae
-- `staff.default_station_id` y la cita hereda esa estación al crearse o al
-- cambiar de persona— o compartida: se elige la estación cita por cita. El
-- bloqueo es por estación, no por persona: dos citas no pueden ocupar la
-- MISMA estación a la MISMA hora, aunque sean personas distintas.
--
--  1. `stations`: catálogo del negocio. Lee cualquiera del negocio (el
--     trabajador necesita saber qué estación le tocó); crear, renombrar,
--     activar/desactivar y borrar es del dueño/administrador
--     (`is_tenant_owner()`). Sin `updated_at`: las tablas vecinas de
--     equipo/catálogo (`staff`, `services`) no lo traen.
--  2. `appointments.station_id` y `staff.default_station_id`, ambos
--     `ON DELETE SET NULL`: borrar una estación libera sus citas/fichas, no las
--     borra. Índice parcial para el control de choques por estación.
--  3. Guard de mismo tenant: una FK solo comprueba que la fila referenciada
--     exista, no de quién es (misma lección que `school_guard_same_tenant` en
--     20260924050000). El nombre `stations_guard_...` es a propósito: Postgres
--     dispara los triggers BEFORE ROW en orden alfabético y el guard tiene que
--     correr DESPUÉS de `set_*_user_id`, que es quien fija `NEW.user_id`. Ese
--     mismo orden lo deja después de los dos de choque: una estación ajena que
--     ADEMÁS chocara (caso rarísimo) saldría 23P01 en vez de 42501 — el
--     rechazo es el mismo.
--  4. `appointments_default_station_trg`: hereda la estación fija de la persona
--     asignada. OJO AL ORDEN: Postgres dispara los triggers BEFORE ROW en orden
--     ALFABÉTICO por nombre — este trigger TIENE que correr antes que
--     `appointments_prevent_station_overlap_trg` (por eso el nombre), porque
--     es él quien puede cambiar `NEW.station_id` antes de que el control de
--     choques la lea. Al reasignar la cita a otra persona solo se vuelve a
--     heredar cuando la estación era la fija de la persona anterior (o venía
--     vacía): una estación compartida elegida a mano NO se pisa.
--  5. `appointments_prevent_station_overlap`: espejo del control de choques por
--     persona. SECURITY DEFINER (misma razón que la agenda privada: el control
--     tiene que ver TODAS las citas del negocio, no solo las que la RLS deja
--     ver a quien guarda) y serializa con `pg_advisory_xact_lock` por
--     estación+día. Corre también en `UPDATE OF staff_id` a propósito: el
--     trigger de herencia puede cambiar la estación como efecto de reasignar la
--     cita y el choque hay que revalidarlo. El trigger por persona no se toca:
--     las dos reglas conviven (una cita necesita persona y estación libres).
--
-- Prueba sin persistir: supabase/manual-tests/20261022100000_stations.rollback.sql

-- ---- 1. Catálogo de estaciones ----
create table public.stations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default public.get_effective_user_id()
               references auth.users(id) on delete cascade,
  name       text not null check (btrim(name) <> ''),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Un nombre por negocio, sin distinguir mayúsculas ni espacios de más.
create unique index stations_user_lower_name_idx
  on public.stations (user_id, lower(btrim(name)));

alter table public.stations enable row level security;

create trigger set_stations_user_id
  before insert on public.stations
  for each row execute function public.set_user_id();

-- Estilo de GRANTs seguido: `product_offers` (20260927000000) — GRANT amplio a
-- authenticated; la RLS (no el GRANT) es la que decide quién escribe.
grant select, insert, update, delete on public.stations to authenticated;

-- Leer lo puede cualquiera del negocio (igual que `staff`: el selector de la
-- cita y la herencia de la estación fija lo necesitan)...
drop policy if exists workspace_stations_read on public.stations;
create policy workspace_stations_read on public.stations
  for select to authenticated
  using (user_id = (select public.get_effective_user_id()));

-- ...administrarlas es del dueño/administrador, como el resto de los ajustes.
drop policy if exists workspace_stations_insert on public.stations;
create policy workspace_stations_insert on public.stations
  for insert to authenticated
  with check (
    user_id = (select public.get_effective_user_id())
    and (select public.is_tenant_owner())
  );

drop policy if exists workspace_stations_update on public.stations;
create policy workspace_stations_update on public.stations
  for update to authenticated
  using (
    user_id = (select public.get_effective_user_id())
    and (select public.is_tenant_owner())
  )
  with check (
    user_id = (select public.get_effective_user_id())
    and (select public.is_tenant_owner())
  );

drop policy if exists workspace_stations_delete on public.stations;
create policy workspace_stations_delete on public.stations
  for delete to authenticated
  using (
    user_id = (select public.get_effective_user_id())
    and (select public.is_tenant_owner())
  );

-- ---- 2. Columnas ----
alter table public.appointments
  add column station_id uuid references public.stations(id) on delete set null;

-- El control de choques por estación consulta por (estación, día, hora).
create index appointments_station_schedule_idx
  on public.appointments (station_id, appointment_date, start_time)
  where station_id is not null;

alter table public.staff
  add column default_station_id uuid references public.stations(id) on delete set null;

-- ---- 3. Guard: la estación tiene que ser del MISMO negocio ----
create or replace function public.stations_guard_same_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_station uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if v_station is not null and not exists (
    select 1 from public.stations s
    where s.id = v_station and s.user_id = new.user_id
  ) then
    raise exception 'La estación no pertenece a este negocio.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.stations_guard_same_tenant() from public, anon, authenticated;

-- Los nombres arrancan con `stations_` a propósito: en orden alfabético corren
-- DESPUÉS de `set_appointments_user_id` / `set_staff_user_id`, que fijan
-- NEW.user_id (mismo truco que `zz_school_tenant_refs` en 20260924050000).
drop trigger if exists stations_guard_appointment_tenant on public.appointments;
create trigger stations_guard_appointment_tenant
  before insert or update of station_id on public.appointments
  for each row execute function public.stations_guard_same_tenant('station_id');

drop trigger if exists stations_guard_staff_tenant on public.staff;
create trigger stations_guard_staff_tenant
  before insert or update of default_station_id on public.staff
  for each row execute function public.stations_guard_same_tenant('default_station_id');

-- ---- 4. Herencia de la estación fija de la persona asignada ----
-- SECURITY INVOKER alcanza: `staff` se lee a nivel de todo el negocio, y desde
-- los RPC de reserva pública (SECURITY DEFINER) corre como su dueño igual.
create or replace function public.appointments_default_station()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_default uuid;
begin
  if tg_op = 'INSERT' then
    if new.station_id is null and new.staff_id is not null then
      select s.default_station_id into v_default
      from public.staff s
      where s.id = new.staff_id;
      new.station_id := v_default; -- puede ser NULL: la cita queda sin estación
    end if;
    return new;
  end if;

  -- UPDATE: solo si cambió la persona. Se vuelve a heredar cuando la estación
  -- era la fija de la persona anterior (o venía vacía); una estación compartida
  -- elegida a mano NO se pisa.
  if old.staff_id is distinct from new.staff_id then
    select s.default_station_id into v_default
    from public.staff s
    where s.id = new.staff_id;
    if new.station_id is null or new.station_id = (
      select s2.default_station_id from public.staff s2 where s2.id = old.staff_id
    ) then
      new.station_id := v_default;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.appointments_default_station() from public, anon, authenticated;

-- OJO AL ORDEN: Postgres dispara los triggers BEFORE ROW en orden alfabético
-- por nombre. Este TIENE que llamarse `appointments_default_station_*` (antes
-- que `appointments_prevent_station_overlap_trg`): es él quien puede cambiar
-- NEW.station_id antes de que el control de choques por estación la lea.
drop trigger if exists appointments_default_station_trg on public.appointments;
create trigger appointments_default_station_trg
  before insert or update of staff_id on public.appointments
  for each row execute function public.appointments_default_station();

-- ---- 5. Una estación no puede tener dos citas a la vez ----
create or replace function public.appointments_prevent_station_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.station_id is null or coalesce(new.status, 'pending') = 'cancelled' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.station_id is not distinct from new.station_id
     and old.appointment_date is not distinct from new.appointment_date
     and old.start_time is not distinct from new.start_time
     and old.end_time is not distinct from new.end_time
     and coalesce(old.status, 'pending') <> 'cancelled' then
    return new; -- cambio de estado u otro dato: no se revalida el horario
  end if;

  -- Serializa a quien reserva la MISMA estación el mismo día.
  perform pg_advisory_xact_lock(hashtextextended('station:' || new.station_id::text || ':' || new.appointment_date::text, 0));

  if exists (
    select 1
    from public.appointments a
    where a.station_id = new.station_id
      and a.appointment_date = new.appointment_date
      and a.id <> new.id
      and coalesce(a.status, 'pending') <> 'cancelled'
      and a.start_time < coalesce(new.end_time, new.start_time + interval '30 minutes')
      and coalesce(a.end_time, a.start_time + interval '30 minutes') > new.start_time
  ) then
    raise exception 'Esa estación ya está ocupada en ese horario.' using errcode = '23P01';
  end if;

  return new;
end;
$$;

revoke all on function public.appointments_prevent_station_overlap() from public, anon, authenticated;

-- Incluye `staff_id` a propósito: reasignar la cita puede cambiar la estación
-- (herencia del punto 4) y el choque hay que revalidarlo. El cortocircuito de
-- arriba evita revalidar cuando nada del horario movió.
drop trigger if exists appointments_prevent_station_overlap_trg on public.appointments;
create trigger appointments_prevent_station_overlap_trg
  before insert or update of station_id, staff_id, appointment_date, start_time, end_time, status
  on public.appointments
  for each row execute function public.appointments_prevent_station_overlap();
