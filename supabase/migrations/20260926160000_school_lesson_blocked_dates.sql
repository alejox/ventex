-- Académico (T12): a single lesson scheduled on a teacher's blocked date is
-- now REJECTED by school_schedule_lesson, mirroring the existing check in
-- school_schedule_series (20260924010000_school_module_rpcs.sql) — that RPC
-- already respects school_teacher_blocked_dates, but for a multi-session
-- series a blocked date is SKIPPED (there are other sessions to fall back
-- on); a single lesson has no "other day" within this same call, so it is
-- rejected outright instead of silently landing on a day the teacher marked
-- unavailable.
--
-- Weekly availability (school_teacher_availability) stays a WARNING only,
-- surfaced client-side (isWithinAvailability in
-- services/school-schedule.service.ts) — never enforced here. Blocked dates
-- are the one thing the database itself refuses.
--
-- The function body below is the CURRENT definition of school_schedule_lesson
-- from 20260924010000_school_module_rpcs.sql, copied verbatim, with only the
-- new blocked-date check added (and this header). Grants are unchanged.

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

  -- Fecha bloqueada del profesor (T12). Mismo cálculo de la fecha local
  -- (`::date`, sin conversión de zona horaria — igual que school_schedule_series)
  -- y mismo filtro de tenant (teacher_profile_id + user_id) que ese RPC. A
  -- diferencia de la serie, que la SALTEA porque tiene otras sesiones, una
  -- clase suelta en un día bloqueado se RECHAZA directamente.
  if exists (
    select 1 from public.school_teacher_blocked_dates bd
    where bd.teacher_profile_id = v_teach.id
      and bd.user_id = v_uid
      and bd.blocked_date = p_start_at::date
  ) then
    raise exception 'SIN_HORARIO: el profesor tiene ese día bloqueado';
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
