-- Módulo opt-in "Escuela de música": capa de RPC (fase U1).
--
-- Los 17 RPC siguen el arquetipo redeem_promo (20260815240000): SECURITY
-- DEFINER, `set search_path = ''`, v_uid := get_effective_user_id(),
-- v_actor := auth.uid(), checks de módulo + permiso al INICIO y fail-closed,
-- `FOR UPDATE` donde el diseño lo exige, retornos jsonb y
-- revoke/grant de execute.
--
-- SOLO DOS excepciones, y por diseño (Decisión F): school_confirm_lesson_by_token
-- y school_family_payload son ejecutables por anon con el token como única
-- credencial (el tenant se deriva de la fila que resuelve el token, nunca del
-- llamador). Son los ÚNICOS grants a anon de todo el cambio. El token crudo
-- jamás se persiste: solo su hash sha256 (extensions.digest, pgcrypto 1.3).
--
-- Convenciones del archivo:
--   * Toda lectura/escritura filtra user_id = v_uid (SECURITY DEFINER evita
--     RLS; el filtro de tenencia es explícito, nunca implícito).
--   * Error genérico de permiso/módulo: 42501 con mensaje SIN_PERMISO/...
--     (estilo del repo: errcode 42501).
--   * Nada se borra: cancelar/reprogramar/anular es UPDATE de estado.
--   * La política CONGELADA de la matrícula (school_enrollments.policy_*) es la
--     única fuente para consumo y reprogramación; school_settings.policy solo
--     alimenta el congelado (nunca retroactivo).
--   * `school_request_reschedule` no recibe `p_requested_by_name` ni `p_via`
--     (la tabla aprobada no tiene esas columnas): el pedido guarda
--     requested_by (uuid) y requester_kind; el nombre lo resuelve la UI.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. school_enroll
-- ---------------------------------------------------------------------------
create or replace function public.school_enroll(
  p_student_id uuid,
  p_lesson_plan_id uuid,
  p_instrument text,
  p_sale_id uuid default null,
  p_payer_customer_id uuid default null,
  p_default_teacher_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid        uuid := public.get_effective_user_id();
  v_actor      uuid := (select auth.uid());
  v_student    public.school_students;
  v_plan       public.school_lesson_plans;
  v_service    public.services;
  v_policy     jsonb := '{}'::jsonb;
  v_min_adv    integer;
  v_max_resc   integer;
  v_consume    boolean;
  v_ext_days   integer;
  v_enrollment_id uuid;
  v_instrument text := nullif(btrim(p_instrument), '');
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;
  if v_instrument is null then
    raise exception 'El instrumento es obligatorio';
  end if;

  select * into v_student
  from public.school_students
  where id = p_student_id and user_id = v_uid;
  if not found or v_student.status <> 'active' then
    raise exception 'Estudiante no encontrado o inactivo';
  end if;

  select * into v_plan
  from public.school_lesson_plans
  where id = p_lesson_plan_id and user_id = v_uid;
  if not found then
    raise exception 'Plan de clases no encontrado';
  end if;
  if not v_plan.is_active then
    raise exception 'SIN_PERMISO: el plan de clases está inactivo';
  end if;

  select * into v_service
  from public.services
  where id = v_plan.service_id and user_id = v_uid;
  if not found then
    raise exception 'El servicio del plan no existe';
  end if;

  -- La venta solo se ata si existe, es del tenant y está completada
  -- (completed incluye fiado: factura ≠ pago, pero el POS no tiene otro estado
  -- de venta). Una venta no puede matricular dos veces.
  if p_sale_id is not null then
    if not exists (
      select 1 from public.sales
      where id = p_sale_id and user_id = v_uid and status = 'completed'
    ) then
      raise exception 'La venta no existe, no es de este negocio o no está completada';
    end if;
    if exists (
      select 1 from public.school_enrollments
      where user_id = v_uid and sale_id = p_sale_id
    ) then
      raise exception 'SIN_PERMISO: esa venta ya tiene una matrícula asignada';
    end if;
  end if;

  if p_payer_customer_id is not null
     and not exists (
       select 1 from public.customers
       where id = p_payer_customer_id and user_id = v_uid
     ) then
    raise exception 'El cliente pagador no existe';
  end if;

  if p_default_teacher_profile_id is not null
     and not exists (
       select 1 from public.school_teacher_profiles
       where id = p_default_teacher_profile_id and user_id = v_uid
     ) then
    raise exception 'El profesor por defecto no existe';
  end if;

  -- Política vigente de la escuela (school_settings.policy) congelada en la
  -- matrícula. Sin fila de settings (creación perezosa) → defaults del DDL.
  select coalesce(s.policy, '{}'::jsonb) into v_policy
  from public.school_settings s
  where s.user_id = v_uid;
  if v_policy is null then
    v_policy := '{}'::jsonb;
  end if;
  v_min_adv  := coalesce((v_policy ->> 'min_advance_hours')::int, 24);
  v_max_resc := coalesce((v_policy ->> 'max_reschedules')::int, 2);
  v_consume  := coalesce((v_policy ->> 'consume_on_unjustified_absence')::boolean, false);
  v_ext_days := coalesce((v_policy ->> 'expiry_extension_days')::int, 0);

  insert into public.school_enrollments (
    user_id, student_id, lesson_plan_id, instrument, default_teacher_profile_id,
    sale_id, payer_customer_id, start_date, expiry_date,
    plan_name, contracted_lessons, plan_price, plan_validity_days,
    policy_min_advance_hours, policy_max_reschedules,
    policy_consume_on_unjustified_absence, policy_expiry_extension_days
  )
  values (
    v_uid, v_student.id, v_plan.id, v_instrument, p_default_teacher_profile_id,
    p_sale_id, p_payer_customer_id, current_date,
    current_date + (v_plan.validity_days + v_ext_days),
    v_plan.name, v_plan.lesson_count, v_service.price, v_plan.validity_days,
    v_min_adv, v_max_resc, v_consume, v_ext_days
  )
  returning id into v_enrollment_id;

  -- Libro mayor: la asignación es un movimiento; el saldo ES su suma.
  insert into public.school_class_credit_movements (
    user_id, enrollment_id, kind, amount, reason, created_by
  )
  values (
    v_uid, v_enrollment_id, 'assignment', v_plan.lesson_count,
    'Matrícula de ' || v_plan.name, v_actor
  );

  return jsonb_build_object(
    'id', v_enrollment_id,
    'plan_name', v_plan.name,
    'contracted_lessons', v_plan.lesson_count,
    'plan_price', v_service.price,
    'expiry_date', current_date + (v_plan.validity_days + v_ext_days),
    'balance', v_plan.lesson_count
  );
end;
$fn$;

revoke all on function public.school_enroll(uuid, uuid, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.school_enroll(uuid, uuid, text, uuid, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. school_schedule_lesson
-- ---------------------------------------------------------------------------
create or replace function public.school_schedule_lesson(
  p_enrollment_id uuid,
  p_teacher_profile_id uuid,
  p_instrument text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_room text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := public.get_effective_user_id();
  v_actor   uuid := (select auth.uid());
  v_enr     public.school_enrollments;
  v_teach   public.school_teacher_profiles;
  v_plan    public.school_lesson_plans;
  v_balance integer;
  v_conflict record;
  v_lesson_id uuid;
  v_instrument text := nullif(btrim(p_instrument), '');
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;
  if p_start_at >= p_end_at then
    raise exception 'El horario de la clase es inválido';
  end if;
  if p_end_at <= now() then
    raise exception 'No se puede agendar una clase en el pasado';
  end if;
  if v_instrument is null then
    raise exception 'El instrumento es obligatorio';
  end if;

  select * into v_enr
  from public.school_enrollments
  where id = p_enrollment_id and user_id = v_uid;
  if not found then
    raise exception 'Matrícula no encontrada';
  end if;
  if v_enr.status <> 'active' then
    raise exception 'SIN_PERMISO: la matrícula no está activa';
  end if;
  if v_enr.expiry_date is not null and v_enr.expiry_date < current_date then
    raise exception 'SIN_CREDITO: la matrícula está vencida';
  end if;

  select coalesce(sum(m.amount), 0) into v_balance
  from public.school_class_credit_movements m
  where m.enrollment_id = v_enr.id and m.user_id = v_uid;
  if v_balance <= 0 then
    raise exception 'SIN_CREDITO: la matrícula no tiene clases disponibles';
  end if;

  select * into v_teach
  from public.school_teacher_profiles
  where id = p_teacher_profile_id and user_id = v_uid;
  if not found then
    raise exception 'Profesor no encontrado';
  end if;

  select * into v_plan
  from public.school_lesson_plans
  where id = v_enr.lesson_plan_id and user_id = v_uid;

  if v_instrument <> v_enr.instrument then
    raise exception 'El instrumento debe coincidir con el de la matrícula';
  end if;
  if not (v_instrument = any (v_teach.instruments)) then
    raise exception 'SIN_PERMISO: el profesor no dicta ese instrumento';
  end if;

  -- Serialización del slot: advisory xact lock (se libera solo al commit).
  perform pg_advisory_xact_lock(hashtext(
    v_uid::text || ':' || v_teach.id::text || ':' || extract(epoch from p_start_at)::text
  ));

  -- Conflictos re-chequeados CON el lock tomado (carrera de doble reserva).
  select l.id, l.start_at, l.end_at, l.room
  into v_conflict
  from public.school_lessons l
  where l.user_id = v_uid
    and l.teacher_profile_id = v_teach.id
    and l.status in ('scheduled', 'pending_close')
    and l.start_at < p_end_at and l.end_at > p_start_at
  limit 1;
  if found then
    raise exception 'SIN_HORARIO: el profesor ya tiene una clase en ese horario'
      using errcode = '23503';
  end if;

  -- Cruce del estudiante (otras matrículas del MISMO estudiante).
  if exists (
    select 1
    from public.school_lessons l
    join public.school_lesson_participants par on par.lesson_id = l.id
    where l.user_id = v_uid
      and par.enrollment_id in (
        select e.id from public.school_enrollments e
        where e.user_id = v_uid and e.student_id = v_enr.student_id
      )
      and l.status in ('scheduled', 'pending_close')
      and l.start_at < p_end_at and l.end_at > p_start_at
  ) then
    raise exception 'SIN_HORARIO: el estudiante ya tiene una clase en ese horario';
  end if;

  -- Ocupación del salón.
  if p_room is not null and exists (
    select 1
    from public.school_lessons l
    where l.user_id = v_uid
      and l.room = p_room
      and l.status in ('scheduled', 'pending_close')
      and l.start_at < p_end_at and l.end_at > p_start_at
  ) then
    raise exception 'SIN_HORARIO: el salón está ocupado en ese horario';
  end if;

  insert into public.school_lessons (
    user_id, teacher_profile_id, instrument, room, start_at, end_at,
    capacity, status
  )
  values (
    v_uid, v_teach.id, v_instrument, nullif(btrim(p_room), ''),
    p_start_at, p_end_at, coalesce(v_plan.max_group_size, 1), 'scheduled'
  )
  returning id into v_lesson_id;

  insert into public.school_lesson_participants (
    user_id, lesson_id, enrollment_id, attendance_status
  )
  values (v_uid, v_lesson_id, v_enr.id, 'pending');

  return jsonb_build_object(
    'id', v_lesson_id, 'start_at', p_start_at, 'end_at', p_end_at,
    'teacher_profile_id', v_teach.id, 'instrument', v_instrument,
    'room', nullif(btrim(p_room), '')
  );
end;
$fn$;

revoke all on function public.school_schedule_lesson(uuid, uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.school_schedule_lesson(uuid, uuid, text, timestamptz, timestamptz, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. school_schedule_series
--
-- Materializa clases semanales con fecha inicial explícita. Si CUALQUIER
-- sesión choca, devuelve la lista de conflictos y NO escribe nada (nunca una
-- serie parcial silenciosa). Las fechas bloqueadas del profesor se saltan y se
-- REPORTAN en `skipped` (no son conflicto).
-- ---------------------------------------------------------------------------
create or replace function public.school_schedule_series(
  p_enrollment_id uuid,
  p_teacher_profile_id uuid,
  p_instrument text,
  p_first_at timestamptz,
  p_end_time time,
  p_weekday integer,
  p_count integer default null,
  p_until_date date default null,
  p_room text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid       uuid := public.get_effective_user_id();
  v_actor     uuid := (select auth.uid());
  v_enr       public.school_enrollments;
  v_teach     public.school_teacher_profiles;
  v_plan      public.school_lesson_plans;
  v_balance   integer;
  v_instrument text := nullif(btrim(p_instrument), '');
  v_sessions  integer;
  v_i         integer := 0;
  v_date      date;
  v_end_time  time := p_end_time;
  v_start_s   timestamptz;
  v_end_s     timestamptz;
  v_lesson_id uuid;
  v_conflicts jsonb := '[]'::jsonb;
  v_skipped   jsonb := '[]'::jsonb;
  v_created   jsonb := '[]'::jsonb;
  v_blocked   boolean;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;
  if p_count is null and p_until_date is null then
    raise exception 'Hay que indicar cantidad de sesiones o fecha final';
  end if;
  if p_count is not null and p_count <= 0 then
    raise exception 'La cantidad de sesiones debe ser mayor a cero';
  end if;
  if p_weekday < 1 or p_weekday > 7 then
    raise exception 'El día de la semana debe estar entre 1 (lunes) y 7 (domingo)';
  end if;
  if extract(isodow from p_first_at) <> p_weekday then
    raise exception 'La fecha inicial no cae en el día de la semana indicado';
  end if;
  if v_instrument is null then
    raise exception 'El instrumento es obligatorio';
  end if;

  select * into v_enr
  from public.school_enrollments
  where id = p_enrollment_id and user_id = v_uid;
  if not found then
    raise exception 'Matrícula no encontrada';
  end if;
  if v_enr.status <> 'active' then
    raise exception 'SIN_PERMISO: la matrícula no está activa';
  end if;
  if v_enr.expiry_date is not null and v_enr.expiry_date < current_date then
    raise exception 'SIN_CREDITO: la matrícula está vencida';
  end if;

  select coalesce(sum(m.amount), 0) into v_balance
  from public.school_class_credit_movements m
  where m.enrollment_id = v_enr.id and m.user_id = v_uid;
  if v_balance <= 0 then
    raise exception 'SIN_CREDITO: la matrícula no tiene clases disponibles';
  end if;

  select * into v_teach
  from public.school_teacher_profiles
  where id = p_teacher_profile_id and user_id = v_uid;
  if not found then
    raise exception 'Profesor no encontrado';
  end if;

  select * into v_plan
  from public.school_lesson_plans
  where id = v_enr.lesson_plan_id and user_id = v_uid;

  if v_instrument <> v_enr.instrument then
    raise exception 'El instrumento debe coincidir con el de la matrícula';
  end if;
  if not (v_instrument = any (v_teach.instruments)) then
    raise exception 'SIN_PERMISO: el profesor no dicta ese instrumento';
  end if;

  if p_until_date is not null then
    v_sessions := (p_until_date - p_first_at::date) / 7 + 1;
  else
    v_sessions := p_count;
  end if;
  if v_sessions <= 0 then
    raise exception 'La serie no tiene sesiones en el rango indicado';
  end if;

  -- PASADA 1: detección. Cualquier conflicto → nada escrito.
  for v_i in 0 .. v_sessions - 1 loop
    v_date := p_first_at::date + (v_i * 7);
    v_start_s := v_date + p_first_at::time;
    v_end_s := v_date + v_end_time;

    if exists (
      select 1 from public.school_teacher_blocked_dates bd
      where bd.teacher_profile_id = v_teach.id
        and bd.user_id = v_uid
        and bd.blocked_date = v_date
    ) then
      v_skipped := v_skipped || jsonb_build_array(v_date);
      continue;
    end if;

    -- Profesor ocupado.
    if exists (
      select 1 from public.school_lessons l
      where l.user_id = v_uid
        and l.teacher_profile_id = v_teach.id
        and l.status in ('scheduled', 'pending_close')
        and l.start_at < v_end_s and l.end_at > v_start_s
    ) then
      v_conflicts := v_conflicts ||
        jsonb_build_array(jsonb_build_object('date', v_date, 'reason', 'profesor ocupado'));
      continue;
    end if;
    -- Estudiante ocupado.
    if exists (
      select 1
      from public.school_lessons l
      join public.school_lesson_participants par on par.lesson_id = l.id
      where l.user_id = v_uid
        and par.enrollment_id in (
          select e.id from public.school_enrollments e
          where e.user_id = v_uid and e.student_id = v_enr.student_id
        )
        and l.status in ('scheduled', 'pending_close')
        and l.start_at < v_end_s and l.end_at > v_start_s
    ) then
      v_conflicts := v_conflicts ||
        jsonb_build_array(jsonb_build_object('date', v_date, 'reason', 'estudiante ocupado'));
      continue;
    end if;
    -- Salón ocupado.
    if p_room is not null and exists (
      select 1 from public.school_lessons l
      where l.user_id = v_uid
        and l.room = p_room
        and l.status in ('scheduled', 'pending_close')
        and l.start_at < v_end_s and l.end_at > v_start_s
    ) then
      v_conflicts := v_conflicts ||
        jsonb_build_array(jsonb_build_object('date', v_date, 'reason', 'salón ocupado'));
      continue;
    end if;
  end loop;

  if jsonb_array_length(v_conflicts) > 0 then
    return jsonb_build_object('created', '[]'::jsonb, 'conflicts', v_conflicts, 'skipped', v_skipped);
  end if;

  -- PASADA 2: materialización (ya sin conflictos posibles).
  for v_i in 0 .. v_sessions - 1 loop
    v_date := p_first_at::date + (v_i * 7);
    if exists (
      select 1 from public.school_teacher_blocked_dates bd
      where bd.teacher_profile_id = v_teach.id
        and bd.user_id = v_uid
        and bd.blocked_date = v_date
    ) then
      continue; -- ya reportada en skipped
    end if;
    v_start_s := v_date + p_first_at::time;
    v_end_s := v_date + v_end_time;

    perform pg_advisory_xact_lock(hashtext(
      v_uid::text || ':' || v_teach.id::text || ':' || extract(epoch from v_start_s)::text
    ));

    insert into public.school_lessons (
      user_id, teacher_profile_id, instrument, room, start_at, end_at,
      capacity, status
    )
    values (
      v_uid, v_teach.id, v_instrument, nullif(btrim(p_room), ''),
      v_start_s, v_end_s, coalesce(v_plan.max_group_size, 1), 'scheduled'
    )
    returning id into v_lesson_id;

    insert into public.school_lesson_participants (
      user_id, lesson_id, enrollment_id, attendance_status
    )
    values (v_uid, v_lesson_id, v_enr.id, 'pending');

    v_created := v_created || jsonb_build_array(jsonb_build_object('id', v_lesson_id, 'date', v_date));
  end loop;

  return jsonb_build_object('created', v_created, 'conflicts', v_conflicts, 'skipped', v_skipped);
end;
$fn$;

revoke all on function public.school_schedule_series(uuid, uuid, text, timestamptz, time, integer, integer, date, text) from public, anon;
grant execute on function public.school_schedule_series(uuid, uuid, text, timestamptz, time, integer, integer, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. school_add_participant (carrera del último cupo segura: FOR UPDATE)
-- ---------------------------------------------------------------------------
create or replace function public.school_add_participant(
  p_lesson_id uuid,
  p_enrollment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := public.get_effective_user_id();
  v_actor   uuid := (select auth.uid());
  v_lesson  public.school_lessons;
  v_enr     public.school_enrollments;
  v_count   integer;
  v_participant_id uuid;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;

  select * into v_lesson
  from public.school_lessons
  where id = p_lesson_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Clase no encontrada';
  end if;
  if v_lesson.status not in ('scheduled', 'pending_close') then
    raise exception 'SIN_PERMISO: la clase no admite más participantes';
  end if;

  select * into v_enr
  from public.school_enrollments
  where id = p_enrollment_id and user_id = v_uid;
  if not found or v_enr.status <> 'active' then
    raise exception 'Matrícula no encontrada o inactiva';
  end if;
  if v_enr.expiry_date is not null and v_enr.expiry_date < current_date then
    raise exception 'SIN_CREDITO: la matrícula está vencida';
  end if;
  if v_enr.instrument <> v_lesson.instrument then
    raise exception 'El instrumento de la matrícula no coincide con el de la clase';
  end if;

  select count(*) into v_count
  from public.school_lesson_participants
  where lesson_id = v_lesson.id and user_id = v_uid;
  if v_count >= v_lesson.capacity then
    raise exception 'SIN_CUPO: la clase ya alcanzó su cupo de %', v_lesson.capacity;
  end if;

  if exists (
    select 1
    from public.school_lessons l
    join public.school_lesson_participants par on par.lesson_id = l.id
    where l.user_id = v_uid
      and par.enrollment_id in (
        select e.id from public.school_enrollments e
        where e.user_id = v_uid and e.student_id = v_enr.student_id
      )
      and l.status in ('scheduled', 'pending_close')
      and l.id <> v_lesson.id
      and l.start_at < v_lesson.end_at and l.end_at > v_lesson.start_at
  ) then
    raise exception 'SIN_HORARIO: el estudiante ya tiene una clase en ese horario';
  end if;

  insert into public.school_lesson_participants (
    user_id, lesson_id, enrollment_id, attendance_status
  )
  values (v_uid, v_lesson.id, v_enr.id, 'pending')
  returning id into v_participant_id;

  return jsonb_build_object(
    'participant_id', v_participant_id, 'lesson_id', v_lesson.id,
    'count', v_count + 1, 'capacity', v_lesson.capacity
  );
end;
$fn$;

revoke all on function public.school_add_participant(uuid, uuid) from public, anon;
grant execute on function public.school_add_participant(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. school_confirm_lesson (sesión) — requiere que la clase ya haya terminado
-- ---------------------------------------------------------------------------
create or replace function public.school_confirm_lesson(
  p_lesson_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := public.get_effective_user_id();
  v_actor  uuid := (select auth.uid());
  v_lesson public.school_lessons;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;

  select * into v_lesson
  from public.school_lessons
  where id = p_lesson_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Clase no encontrada';
  end if;
  if v_lesson.status <> 'scheduled' then
    raise exception 'SIN_ESTADO: la clase no está programada (estado actual: %)', v_lesson.status;
  end if;
  if now() < v_lesson.end_at then
    raise exception 'SIN_PERMISO: la clase todavía no terminó';
  end if;

  update public.school_lessons
     set status = 'pending_close',
         confirmed_at = now(),
         confirmed_by = v_actor,
         confirmed_via = 'session',
         confirmed_version = v_lesson.version
   where id = v_lesson.id and user_id = v_uid;

  return jsonb_build_object(
    'id', v_lesson.id, 'status', 'pending_close',
    'confirmed_via', 'session', 'confirmed_version', v_lesson.version
  );
end;
$fn$;

revoke all on function public.school_confirm_lesson(uuid) from public, anon;
grant execute on function public.school_confirm_lesson(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. school_confirm_lesson_by_token (anon, enlace de un solo uso)
--
-- ÚNICO camino de confirmación por token. El hash se busca, no el token crudo.
-- Guardas: propósito, no revocado, no usado, no vencido, versión igual a la de
-- la clase (una reprogramación invalida los enlaces viejos), y clase ya
-- terminada. El GET jamás confirma: solo este RPC (POST) consume el token.
-- ---------------------------------------------------------------------------
create or replace function public.school_confirm_lesson_by_token(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hash   text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_link   public.school_access_links;
  v_lesson public.school_lessons;
begin
  select * into v_link
  from public.school_access_links
  where token_hash = v_hash
  for update;
  if not found then
    raise exception 'LINK_INVALIDO' using errcode = '42501';
  end if;
  if v_link.purpose <> 'teacher_confirm' then
    raise exception 'LINK_INVALIDO' using errcode = '42501';
  end if;
  if v_link.revoked_at is not null or v_link.used_at is not null then
    raise exception 'LINK_INVALIDO: el enlace fue revocado o ya se usó' using errcode = '42501';
  end if;
  if v_link.expires_at <= now() then
    raise exception 'LINK_VENCIDO' using errcode = '42501';
  end if;

  select * into v_lesson
  from public.school_lessons
  where id = v_link.lesson_id
  for update;
  if not found then
    raise exception 'LINK_INVALIDO' using errcode = '42501';
  end if;
  if v_lesson.version <> v_link.version then
    raise exception 'LINK_INVALIDO: la clase cambió; pedí un enlace nuevo' using errcode = '42501';
  end if;
  if v_lesson.status <> 'scheduled' then
    raise exception 'SIN_ESTADO: la clase no está programada' using errcode = '42501';
  end if;
  if now() < v_lesson.end_at then
    raise exception 'SIN_PERMISO: la clase todavía no terminó' using errcode = '42501';
  end if;

  update public.school_access_links
     set used_at = now()
   where id = v_link.id;

  update public.school_lessons
     set status = 'pending_close',
         confirmed_at = now(),
         confirmed_by = v_link.id,
         confirmed_via = 'link',
         confirmed_version = v_lesson.version
   where id = v_lesson.id;

  return jsonb_build_object(
    'id', v_lesson.id, 'status', 'pending_close',
    'confirmed_via', 'link', 'confirmed_version', v_lesson.version
  );
end;
$fn$;

revoke all on function public.school_confirm_lesson_by_token(text) from public, anon;
grant execute on function public.school_confirm_lesson_by_token(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. school_close_lesson — idempotente
--
-- La asistencia viaja como jsonb: [{"participant_id", "status", "observation"}].
-- TODOS los participantes deben estar listados o el cierre se rechaza (nada de
-- pendientes silenciosos). Consumo POR PARTICIPANTE según la política
-- CONGELADA de su matrícula: attended → -1; absent → -1 solo si la matrícula lo
-- contempla; justified → 0 (el derecho a reposición queda en el saldo).
-- Un doble clic: la segunda llamada ve status 'realized' y devuelve
-- {alreadyClosed: true} sin tocar nada.
-- ---------------------------------------------------------------------------
create or replace function public.school_close_lesson(
  p_lesson_id uuid,
  p_attendance jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid       uuid := public.get_effective_user_id();
  v_actor     uuid := (select auth.uid());
  v_lesson    public.school_lessons;
  v_rec       record;
  v_par       public.school_lesson_participants;
  v_enr       public.school_enrollments;
  v_status    text;
  v_obs       text;
  v_consume   integer;
  v_consumers integer := 0;
  v_total     integer := 0;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;
  if p_attendance is null or jsonb_typeof(p_attendance) <> 'array' then
    raise exception 'La asistencia debe ser una lista';
  end if;

  select * into v_lesson
  from public.school_lessons
  where id = p_lesson_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Clase no encontrada';
  end if;
  if v_lesson.status = 'realized' then
    return jsonb_build_object('alreadyClosed', true, 'id', v_lesson.id);
  end if;
  if v_lesson.status <> 'pending_close' then
    raise exception 'SIN_ESTADO: la clase debe estar confirmada (estado actual: %)', v_lesson.status;
  end if;

  -- Cada participante debe estar en la lista, y solo una vez.
  for v_rec in
    select p.id, p.enrollment_id
    from public.school_lesson_participants p
    where p.lesson_id = v_lesson.id and p.user_id = v_uid
  loop
    select a.value ->> 'participant_id', a.value ->> 'status', a.value ->> 'observation'
    into v_par.id, v_status, v_obs
    from jsonb_array_elements(p_attendance) a
    where (a.value ->> 'participant_id')::uuid = v_rec.id;
    if v_par.id is null then
      raise exception 'Falta el participante % en la lista de asistencia', v_rec.id;
    end if;
    if v_status not in ('attended', 'absent', 'justified') then
      raise exception 'Estado de asistencia inválido para el participante %', v_rec.id;
    end if;

    if (select count(*) from jsonb_array_elements(p_attendance) a
        where (a.value ->> 'participant_id')::uuid = v_rec.id) > 1 then
      raise exception 'El participante % está duplicado en la asistencia', v_rec.id;
    end if;

    select * into v_enr
    from public.school_enrollments
    where id = v_rec.enrollment_id and user_id = v_uid;
    if not found then
      raise exception 'Matrícula no encontrada para el participante %', v_rec.id;
    end if;

    -- Consumo según política congelada; solo matrículas activas consumen.
    v_consume := 0;
    if v_enr.status = 'active' and v_status = 'attended' then
      v_consume := -1;
    elsif v_enr.status = 'active' and v_status = 'absent'
          and v_enr.policy_consume_on_unjustified_absence then
      v_consume := -1;
    end if;

    update public.school_lesson_participants
       set attendance_status = v_status,
           observation = nullif(btrim(coalesce(v_obs, '')), ''),
           recorded_by = v_actor,
           recorded_at = now()
     where id = v_rec.id and user_id = v_uid;

    if v_consume < 0 then
      insert into public.school_class_credit_movements (
        user_id, enrollment_id, kind, amount, reason, lesson_id, created_by
      )
      values (
        v_uid, v_enr.id, 'consumption', v_consume,
        'Consumo por clase ' || v_lesson.id::text, v_lesson.id, v_actor
      );
      v_consumers := v_consumers + 1;
    end if;
    v_total := v_total + 1;
  end loop;

  update public.school_lessons
     set status = 'realized',
         closed_at = now(),
         closed_by = v_actor,
         closed_via = 'session'
   where id = v_lesson.id and user_id = v_uid;

  return jsonb_build_object(
    'id', v_lesson.id, 'status', 'realized',
    'participants', v_total, 'consumed', v_consumers
  );
end;
$fn$;

revoke all on function public.school_close_lesson(uuid, jsonb) from public, anon;
grant execute on function public.school_close_lesson(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. school_cancel_lesson — motivo obligatorio, sin consumo ni movimiento
-- ---------------------------------------------------------------------------
create or replace function public.school_cancel_lesson(
  p_lesson_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := public.get_effective_user_id();
  v_actor  uuid := (select auth.uid());
  v_lesson public.school_lessons;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'El motivo de la cancelación es obligatorio';
  end if;

  select * into v_lesson
  from public.school_lessons
  where id = p_lesson_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Clase no encontrada';
  end if;
  if v_lesson.status = 'realized' then
    raise exception 'SIN_PERMISO: una clase realizada no se cancela';
  end if;
  if v_lesson.status = 'cancelled' then
    return jsonb_build_object('alreadyCancelled', true, 'id', v_lesson.id);
  end if;
  if v_lesson.status = 'rescheduled' then
    raise exception 'SIN_ESTADO: la clase fue reprogramada; cancelá la nueva';
  end if;

  update public.school_lessons
     set status = 'cancelled',
         cancel_reason = v_reason,
         cancelled_by = v_actor,
         cancelled_at = now()
   where id = v_lesson.id and user_id = v_uid;

  return jsonb_build_object('id', v_lesson.id, 'status', 'cancelled');
end;
$fn$;

revoke all on function public.school_cancel_lesson(uuid, text) from public, anon;
grant execute on function public.school_cancel_lesson(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. school_request_reschedule
--
-- Valida la política CONGELADA de la matrícula: anticipación mínima (el
-- coordinador la exime con nota) y tope de reprogramaciones. Pendiente
-- CONSERVA la reserva del horario original.
-- La trazabilidad del pedido vive en school_reschedule_requests
-- (lesson_id + participant_id + requested_by + requester_kind).
-- ---------------------------------------------------------------------------
create or replace function public.school_request_reschedule(
  p_lesson_id uuid,
  p_participant_id uuid,
  p_reason text,
  p_requester_kind text default 'coordinator'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid       uuid := public.get_effective_user_id();
  v_actor     uuid := (select auth.uid());
  v_lesson    public.school_lessons;
  v_par       public.school_lesson_participants;
  v_enr       public.school_enrollments;
  v_reason    text := nullif(btrim(coalesce(p_reason, '')), '');
  v_request_id uuid;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;
  if p_requester_kind not in ('coordinator', 'guardian', 'student') then
    raise exception 'Origen de la solicitud inválido';
  end if;
  if v_reason is null then
    raise exception 'El motivo de la reprogramación es obligatorio';
  end if;

  select * into v_lesson
  from public.school_lessons
  where id = p_lesson_id and user_id = v_uid;
  if not found then
    raise exception 'Clase no encontrada';
  end if;
  if v_lesson.status not in ('scheduled', 'pending_close') then
    raise exception 'SIN_ESTADO: la clase no se puede reprogramar (estado actual: %)', v_lesson.status;
  end if;

  select * into v_par
  from public.school_lesson_participants
  where id = p_participant_id and lesson_id = v_lesson.id and user_id = v_uid;
  if not found then
    raise exception 'Participante no encontrado';
  end if;

  select * into v_enr
  from public.school_enrollments
  where id = v_par.enrollment_id and user_id = v_uid;
  if not found then
    raise exception 'Matrícula no encontrada';
  end if;

  -- Anticipación mínima: solo aplica a pedidos de acudiente/estudiante; el
  -- coordinador la exime (decisión registrada en el pedido).
  if p_requester_kind <> 'coordinator'
     and now() > v_lesson.start_at - make_interval(hours => v_enr.policy_min_advance_hours) then
    raise exception 'SIN_PERMISO: la política de la matrícula exige pedirlo con % horas de anticipación',
      v_enr.policy_min_advance_hours;
  end if;

  if v_enr.reschedule_count >= v_enr.policy_max_reschedules then
    raise exception 'SIN_PERMISO: la matrícula ya agotó sus % reprogramaciones',
      v_enr.policy_max_reschedules;
  end if;

  insert into public.school_reschedule_requests (
    user_id, enrollment_id, lesson_id, participant_id, requested_by,
    requester_kind, reason, status
  )
  values (
    v_uid, v_enr.id, v_lesson.id, v_par.id, v_actor,
    p_requester_kind, v_reason, 'pending'
  )
  returning id into v_request_id;

  return jsonb_build_object(
    'id', v_request_id, 'status', 'pending',
    'lesson_id', v_lesson.id, 'participant_id', v_par.id
  );
end;
$fn$;

revoke all on function public.school_request_reschedule(uuid, uuid, text, text) from public, anon;
grant execute on function public.school_request_reschedule(uuid, uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. school_approve_reschedule
--
-- Con fecha: valida conflictos (mismas reglas que school_schedule_lesson),
-- crea la clase nueva, MUEVE las participaciones (todas si el pedido es del
-- grupo, una sola si es de un estudiante), la original pasa a 'rescheduled'
-- con version++, se revocan sus enlaces de confirmación y se notifica.
-- Sin fecha: se libera el hueco (make-up implícito en el saldo sin consumir).
-- Nunca consume dos clases; el presupuesto (reschedule_count) sube una vez.
-- ---------------------------------------------------------------------------
create or replace function public.school_approve_reschedule(
  p_request_id uuid,
  p_new_start_at timestamptz default null,
  p_new_end_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid       uuid := public.get_effective_user_id();
  v_actor     uuid := (select auth.uid());
  v_req       public.school_reschedule_requests;
  v_enr       public.school_enrollments;
  v_lesson    public.school_lessons;
  v_teach     public.school_teacher_profiles;
  v_plan      public.school_lesson_plans;
  v_new_lesson_id uuid;
  v_dated     boolean;
  v_student_name text;
  v_teacher_name text;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;

  select * into v_req
  from public.school_reschedule_requests
  where id = p_request_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Solicitud no encontrada';
  end if;
  if v_req.status <> 'pending' then
    return jsonb_build_object('alreadyDecided', true, 'id', v_req.id, 'status', v_req.status);
  end if;

  select * into v_enr
  from public.school_enrollments
  where id = v_req.enrollment_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Matrícula no encontrada';
  end if;

  select * into v_lesson
  from public.school_lessons
  where id = v_req.lesson_id and user_id = v_uid;
  if not found then
    raise exception 'Clase original no encontrada';
  end if;

  v_dated := p_new_start_at is not null and p_new_end_at is not null;
  if (p_new_start_at is null) <> (p_new_end_at is null) then
    raise exception 'Para reprogramar con fecha hay que dar inicio y fin';
  end if;
  if v_dated and p_new_start_at >= p_new_end_at then
    raise exception 'El horario de la nueva clase es inválido';
  end if;
  if v_dated and p_new_end_at <= now() then
    raise exception 'No se puede reprogramar al pasado';
  end if;

  if v_dated then
    select * into v_teach
    from public.school_teacher_profiles
    where id = v_lesson.teacher_profile_id and user_id = v_uid;

    select * into v_plan
    from public.school_lesson_plans
    where id = v_enr.lesson_plan_id and user_id = v_uid;

    perform pg_advisory_xact_lock(hashtext(
      v_uid::text || ':' || v_teach.id::text || ':' || extract(epoch from p_new_start_at)::text
    ));

    if exists (
      select 1 from public.school_lessons l
      where l.user_id = v_uid
        and l.teacher_profile_id = v_teach.id
        and l.status in ('scheduled', 'pending_close')
        and l.id <> v_lesson.id
        and l.start_at < p_new_end_at and l.end_at > p_new_start_at
    ) then
      raise exception 'SIN_HORARIO: el profesor ya tiene una clase en ese horario';
    end if;

    if exists (
      select 1
      from public.school_lessons l
      join public.school_lesson_participants par on par.lesson_id = l.id
      where l.user_id = v_uid
        and par.enrollment_id in (
          select e.id from public.school_enrollments e
          where e.user_id = v_uid and e.student_id = v_enr.student_id
        )
        and l.status in ('scheduled', 'pending_close')
        and l.start_at < p_new_end_at and l.end_at > p_new_start_at
    ) then
      raise exception 'SIN_HORARIO: el estudiante ya tiene una clase en ese horario';
    end if;

    if v_lesson.room is not null and exists (
      select 1 from public.school_lessons l
      where l.user_id = v_uid
        and l.room = v_lesson.room
        and l.status in ('scheduled', 'pending_close')
        and l.id <> v_lesson.id
        and l.start_at < p_new_end_at and l.end_at > p_new_start_at
    ) then
      raise exception 'SIN_HORARIO: el salón está ocupado en ese horario';
    end if;

    insert into public.school_lessons (
      user_id, teacher_profile_id, instrument, room, start_at, end_at,
      capacity, status
    )
    values (
      v_uid, v_lesson.teacher_profile_id, v_lesson.instrument, v_lesson.room,
      p_new_start_at, p_new_end_at,
      coalesce(v_plan.max_group_size, v_lesson.capacity), 'scheduled'
    )
    returning id into v_new_lesson_id;

    -- Se mueven TODAS las participaciones si el pedido es del grupo
    -- (participant_id nulo); si es de un estudiante, solo la suya.
    if v_req.participant_id is null then
      update public.school_lesson_participants
         set lesson_id = v_new_lesson_id,
             linked_participant_id = null
       where lesson_id = v_lesson.id and user_id = v_uid;
    else
      update public.school_lesson_participants
         set lesson_id = v_new_lesson_id,
             linked_participant_id = null
       where id = v_req.participant_id and lesson_id = v_lesson.id and user_id = v_uid;
    end if;
  end if;

  -- Original: rescheduled + version++ (invalida enlaces viejos por versión) e
  -- invalidación explícita de sus enlaces de confirmación.
  update public.school_lessons
     set status = 'rescheduled',
         version = version + 1,
         rescheduled_to_id = v_new_lesson_id
   where id = v_lesson.id and user_id = v_uid;

  update public.school_access_links
     set revoked_at = now()
   where lesson_id = v_lesson.id
     and user_id = v_uid
     and purpose = 'teacher_confirm'
     and revoked_at is null;

  -- Presupuesto: sube UNA vez por aprobación, nunca por intento.
  update public.school_enrollments
     set reschedule_count = reschedule_count + 1
   where id = v_enr.id and user_id = v_uid;

  update public.school_reschedule_requests
     set status = 'approved',
         decided_by = v_actor,
         decided_at = now(),
         new_start_at = p_new_start_at,
         new_end_at = p_new_end_at
   where id = v_req.id and user_id = v_uid;

  -- Nombre legible para la notificación.
  select c.full_name into v_student_name
  from public.school_students s
  join public.customers c on c.id = s.customer_id
  where s.id = v_enr.student_id and s.user_id = v_uid;

  select st.full_name into v_teacher_name
  from public.school_teacher_profiles tp
  join public.staff st on st.id = tp.staff_id
  where tp.id = v_lesson.teacher_profile_id and tp.user_id = v_uid;

  insert into public.notifications (
    user_id, type, severity, title, body, data
  )
  values (
    v_uid, 'school', 'info', 'Clase reprogramada',
    case when v_dated then
      'La clase del ' || to_char(p_new_start_at, 'DD/MM/YYYY') || ' a las ' ||
      to_char(p_new_start_at, 'HH24:MI') || ' de ' || coalesce(v_student_name, 'estudiante') ||
      ' (' || coalesce(v_teacher_name, 'profesor') || ') fue reprogramada'
    else
      'La clase de ' || coalesce(v_student_name, 'estudiante') ||
      ' (' || coalesce(v_teacher_name, 'profesor') || ') quedó pendiente de reprogramación'
    end,
    jsonb_build_object(
      'request_id', v_req.id, 'old_lesson_id', v_lesson.id,
      'new_lesson_id', v_new_lesson_id, 'student_name', v_student_name,
      'teacher_name', v_teacher_name
    )
  );

  return jsonb_build_object(
    'id', v_req.id, 'status', 'approved',
    'old_lesson_id', v_lesson.id, 'new_lesson_id', v_new_lesson_id
  );
end;
$fn$;

revoke all on function public.school_approve_reschedule(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.school_approve_reschedule(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. school_reject_reschedule
--
-- El rechazo no mueve nada: la clase original conserva su horario (el pedido
-- pendiente nunca liberó la reserva).
-- ---------------------------------------------------------------------------
create or replace function public.school_reject_reschedule(
  p_request_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := public.get_effective_user_id();
  v_actor  uuid := (select auth.uid());
  v_req    public.school_reschedule_requests;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'El motivo del rechazo es obligatorio';
  end if;

  select * into v_req
  from public.school_reschedule_requests
  where id = p_request_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Solicitud no encontrada';
  end if;
  if v_req.status <> 'pending' then
    return jsonb_build_object('alreadyDecided', true, 'id', v_req.id, 'status', v_req.status);
  end if;

  update public.school_reschedule_requests
     set status = 'rejected',
         decided_by = v_actor,
         decided_at = now(),
         decision_note = v_reason
   where id = v_req.id and user_id = v_uid;

  return jsonb_build_object('id', v_req.id, 'status', 'rejected');
end;
$fn$;

revoke all on function public.school_reject_reschedule(uuid, text) from public, anon;
grant execute on function public.school_reject_reschedule(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 12. school_adjust_credit — motivo obligatorio, movimiento 'adjustment'
-- ---------------------------------------------------------------------------
create or replace function public.school_adjust_credit(
  p_enrollment_id uuid,
  p_amount integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := public.get_effective_user_id();
  v_actor  uuid := (select auth.uid());
  v_enr    public.school_enrollments;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_balance integer;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;
  if p_amount = 0 then
    raise exception 'El ajuste no puede ser cero';
  end if;
  if v_reason is null then
    raise exception 'El motivo del ajuste es obligatorio';
  end if;

  select * into v_enr
  from public.school_enrollments
  where id = p_enrollment_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Matrícula no encontrada';
  end if;

  insert into public.school_class_credit_movements (
    user_id, enrollment_id, kind, amount, reason, created_by
  )
  values (
    v_uid, v_enr.id, 'adjustment', p_amount, v_reason, v_actor
  );

  select coalesce(sum(m.amount), 0) into v_balance
  from public.school_class_credit_movements m
  where m.enrollment_id = v_enr.id and m.user_id = v_uid;

  return jsonb_build_object('enrollment_id', v_enr.id, 'balance', v_balance);
end;
$fn$;

revoke all on function public.school_adjust_credit(uuid, integer, text) from public, anon;
grant execute on function public.school_adjust_credit(uuid, integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 13. school_create_confirm_link / 14. school_create_family_link
--
-- El token crudo se devuelve UNA vez (la UI lo incrusta en el wa.me); la base
-- guarda solo el hash sha256. Regenerar revoca los anteriores.
-- ---------------------------------------------------------------------------
create or replace function public.school_create_confirm_link(
  p_lesson_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid       uuid := public.get_effective_user_id();
  v_actor     uuid := (select auth.uid());
  v_lesson    public.school_lessons;
  v_token     text;
  v_link_id   uuid;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;

  select * into v_lesson
  from public.school_lessons
  where id = p_lesson_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Clase no encontrada';
  end if;
  if v_lesson.status <> 'scheduled' then
    raise exception 'SIN_ESTADO: solo las clases programadas reciben enlace de confirmación';
  end if;

  -- Regenerar revoca los anteriores del enlace de esta clase.
  update public.school_access_links
     set revoked_at = now()
   where lesson_id = v_lesson.id
     and user_id = v_uid
     and purpose = 'teacher_confirm'
     and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.school_access_links (
    user_id, purpose, token_hash, lesson_id, expires_at, version
  )
  values (
    v_uid, 'teacher_confirm', encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_lesson.id, now() + interval '24 hours', v_lesson.version
  )
  returning id into v_link_id;

  return jsonb_build_object(
    'link_id', v_link_id, 'token', v_token,
    'expires_at', now() + interval '24 hours'
  );
end;
$fn$;

revoke all on function public.school_create_confirm_link(uuid) from public, anon;
grant execute on function public.school_create_confirm_link(uuid) to authenticated, service_role;

create or replace function public.school_create_family_link(
  p_student_id uuid,
  p_guardian_customer_id uuid,
  p_hours integer default 168
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := public.get_effective_user_id();
  v_actor   uuid := (select auth.uid());
  v_token   text;
  v_link_id uuid;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;
  if p_hours <= 0 or p_hours > 720 then
    raise exception 'La vigencia del enlace debe estar entre 1 y 720 horas';
  end if;

  if not exists (
    select 1 from public.school_students
    where id = p_student_id and user_id = v_uid
  ) then
    raise exception 'Estudiante no encontrado';
  end if;

  -- El acudiente debe existir y estar vinculado al estudiante: el enlace solo
  -- se emite hacia una relación ya registrada.
  if not exists (
    select 1 from public.school_student_guardians g
    where g.user_id = v_uid
      and g.student_id = p_student_id
      and g.customer_id = p_guardian_customer_id
  ) then
    raise exception 'SIN_PERMISO: el acudiente no está vinculado a este estudiante';
  end if;

  -- Regenerar revoca los anteriores del par estudiante/acudiente.
  update public.school_access_links
     set revoked_at = now()
   where user_id = v_uid
     and purpose = 'family_read'
     and student_id = p_student_id
     and guardian_customer_id = p_guardian_customer_id
     and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.school_access_links (
    user_id, purpose, token_hash, student_id, guardian_customer_id, expires_at, version
  )
  values (
    v_uid, 'family_read', encode(extensions.digest(v_token, 'sha256'), 'hex'),
    p_student_id, p_guardian_customer_id,
    now() + make_interval(hours => p_hours), 1
  )
  returning id into v_link_id;

  return jsonb_build_object(
    'link_id', v_link_id, 'token', v_token,
    'expires_at', now() + make_interval(hours => p_hours)
  );
end;
$fn$;

revoke all on function public.school_create_family_link(uuid, uuid, integer) from public, anon;
grant execute on function public.school_create_family_link(uuid, uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 15. school_revoke_link
-- ---------------------------------------------------------------------------
create or replace function public.school_revoke_link(
  p_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := public.get_effective_user_id();
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;

  update public.school_access_links
     set revoked_at = now()
   where id = p_link_id and user_id = v_uid and revoked_at is null;

  return jsonb_build_object('link_id', p_link_id, 'revoked', true);
end;
$fn$;

revoke all on function public.school_revoke_link(uuid) from public, anon;
grant execute on function public.school_revoke_link(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 16. school_family_payload (anon, alcance por token)
--
-- SOLO los datos del estudiante del token: su ficha, su próxima clase y su
-- material. Jamás listados de grupo, jamás datos de otras familias. El tenant
-- se deriva de la fila que resuelve el token (nunca del llamador). El GET de
-- la página familiar renderiza con esto; el token NO se consume (reutilizable
-- hasta expirar).
-- ---------------------------------------------------------------------------
create or replace function public.school_family_payload(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_hash   text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_link   public.school_access_links;
  v_student public.school_students;
  v_cust   public.customers;
  v_guards jsonb := '[]'::jsonb;
  v_next   jsonb;
  v_materials jsonb := '[]'::jsonb;
begin
  select * into v_link
  from public.school_access_links
  where token_hash = v_hash;
  if not found then
    raise exception 'LINK_INVALIDO' using errcode = '42501';
  end if;
  if v_link.purpose <> 'family_read' then
    raise exception 'LINK_INVALIDO' using errcode = '42501';
  end if;
  if v_link.revoked_at is not null then
    raise exception 'LINK_REVOCADO' using errcode = '42501';
  end if;
  if v_link.expires_at <= now() then
    raise exception 'LINK_VENCIDO' using errcode = '42501';
  end if;

  select * into v_student
  from public.school_students
  where id = v_link.student_id;
  if not found then
    raise exception 'LINK_INVALIDO' using errcode = '42501';
  end if;

  select * into v_cust
  from public.customers
  where id = v_student.customer_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'customer_id', g.customer_id,
      'relationship', g.relationship,
      'is_notice_receiver', g.is_notice_receiver
    ) order by g.created_at
  ), '[]'::jsonb) into v_guards
  from public.school_student_guardians g
  where g.student_id = v_student.id
    and g.user_id = v_link.user_id;

  -- Próxima clase del estudiante (vía sus matrículas participando).
  select jsonb_build_object(
    'lesson_id', l.id,
    'start_at', l.start_at,
    'end_at', l.end_at,
    'instrument', l.instrument,
    'room', l.room,
    'status', l.status
  )
  into v_next
  from public.school_lessons l
  join public.school_lesson_participants par on par.lesson_id = l.id
  where par.enrollment_id in (
    select e.id from public.school_enrollments e
    where e.user_id = v_link.user_id and e.student_id = v_student.id
  )
    and l.status in ('scheduled', 'pending_close')
    and l.end_at > now()
  order by l.start_at
  limit 1;

  -- Material dirigido a ESTE estudiante.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id, 'title', m.title, 'instructions', m.instructions,
      'kind', m.kind, 'created_at', m.created_at
    ) order by m.created_at desc
  ), '[]'::jsonb) into v_materials
  from public.school_materials m
  join public.school_material_recipients r on r.material_id = m.id
  where r.student_id = v_student.id
    and m.user_id = v_link.user_id;

  return jsonb_build_object(
    'student', jsonb_build_object(
      'id', v_student.id,
      'full_name', v_cust.full_name,
      'instrument', v_student.instrument,
      'level', v_student.level,
      'status', v_student.status
    ),
    'guardians', v_guards,
    'next_lesson', v_next,
    'materials', v_materials
  );
end;
$fn$;

revoke all on function public.school_family_payload(text) from public, anon;
grant execute on function public.school_family_payload(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 17. school_log_communication
--
-- Bitácora de SOLO estados observables (prepared | shared). Honra
-- notices_enabled del acudiente: si los avisos están apagados, falla cerrado
-- (nada entra silenciosamente a la bitácora de alguien que no quiere avisos).
-- ---------------------------------------------------------------------------
create or replace function public.school_log_communication(
  p_student_id uuid,
  p_guardian_customer_id uuid,
  p_purpose text,
  p_state text,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid    uuid := public.get_effective_user_id();
  v_actor  uuid := (select auth.uid());
  v_guard  public.school_student_guardians;
  v_cust   public.customers;
  v_log_id uuid;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.school_module_enabled() then
    raise exception 'SIN_PERMISO: el módulo Escuela de música no está activo para este negocio'
      using errcode = '42501';
  end if;
  if not public.worker_can('school') then
    raise exception 'SIN_PERMISO: no tenés permiso para operar la escuela'
      using errcode = '42501';
  end if;
  if p_purpose not in ('attendance', 'reschedule', 'material', 'reminder', 'other') then
    raise exception 'Propósito de comunicación inválido';
  end if;
  if p_state not in ('prepared', 'shared') then
    raise exception 'SIN_PERMISO: solo se registran estados observables (preparado o compartido)';
  end if;

  select * into v_guard
  from public.school_student_guardians
  where user_id = v_uid
    and student_id = p_student_id
    and customer_id = p_guardian_customer_id;
  if not found then
    raise exception 'Acudiente no encontrado';
  end if;
  if not v_guard.notices_enabled then
    raise exception 'SIN_PERMISO: el acudiente tiene los avisos desactivados';
  end if;

  select * into v_cust
  from public.customers
  where id = p_guardian_customer_id and user_id = v_uid;

  insert into public.school_communication_log (
    user_id, channel, purpose, state, recipient_phone, recipient_name,
    message, student_id, guardian_customer_id, created_by
  )
  values (
    v_uid, 'whatsapp', p_purpose, p_state,
    coalesce(v_guard.phone, v_cust.phone),
    v_cust.full_name,
    nullif(btrim(coalesce(p_message, '')), ''),
    p_student_id, p_guardian_customer_id, v_actor
  )
  returning id into v_log_id;

  return jsonb_build_object('id', v_log_id, 'state', p_state);
end;
$fn$;

revoke all on function public.school_log_communication(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.school_log_communication(uuid, uuid, text, text, text) to authenticated, service_role;

COMMIT;