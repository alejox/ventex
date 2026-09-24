-- Escuela de música — cerrar referencias entre negocios en las tablas school_*.
--
-- RLS filtra lo que cada negocio LEE, pero una FK solo comprueba que la fila
-- referenciada exista, no de quién es. Con las FK simples de 20260924000000,
-- un negocio B con el módulo activo podía insertar un `school_students` suyo
-- apuntando al `customers.id` de un negocio A (el trigger set_user_id le
-- reescribe el user_id a B, pero la referencia queda). De ahí:
--   * `school_family_payload` (SECURITY DEFINER) devolvía el `full_name` del
--     cliente de A en el enlace familiar de B.
--   * Los `ON DELETE CASCADE` hacia `customers` cruzaban de negocio: A no podía
--     borrar su propio cliente (los guards de no-delete de B lo bloqueaban) o
--     borraba filas de B.
-- Medido en la sonda de aislamiento de la fase 6 (6.2), antes de esta migración.
--
-- Arreglo: un trigger genérico, BEFORE INSERT OR UPDATE, que exige que toda
-- referencia a una tabla con tenant tenga el MISMO user_id que la fila nueva.
-- Los pares (columna, tabla) viajan como argumentos del trigger, así cada tabla
-- declara sus referencias en un solo lugar. Se llama `zz_school_tenant_refs`
-- porque Postgres dispara los triggers de una tabla en orden alfabético: tiene
-- que correr DESPUÉS de `*_set_user_id`, que es quien fija NEW.user_id.
--
-- Las tablas estaban vacías al aplicarla: no hay filas que migrar.

create or replace function public.school_guard_same_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_col text;
  v_ref text;
  v_val uuid;
  v_ok  boolean;
  i int := 0;
begin
  while i < tg_nargs loop
    v_col := tg_argv[i];
    v_ref := tg_argv[i + 1];
    v_val := (v_new ->> v_col)::uuid;
    if v_val is not null then
      execute format('select exists (select 1 from public.%I where id = $1 and user_id = $2)', v_ref)
        into v_ok using v_val, new.user_id;
      if not v_ok then
        raise exception 'REFERENCIA_AJENA: %.% no pertenece a este negocio', tg_table_name, v_col
          using errcode = '42501';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end;
$$;

revoke all on function public.school_guard_same_tenant() from public, anon, authenticated;

create trigger zz_school_tenant_refs before insert or update on public.school_students
  for each row execute function public.school_guard_same_tenant('customer_id', 'customers');

create trigger zz_school_tenant_refs before insert or update on public.school_student_guardians
  for each row execute function public.school_guard_same_tenant(
    'student_id', 'school_students', 'customer_id', 'customers');

create trigger zz_school_tenant_refs before insert or update on public.school_teacher_profiles
  for each row execute function public.school_guard_same_tenant('staff_id', 'staff');

create trigger zz_school_tenant_refs before insert or update on public.school_teacher_availability
  for each row execute function public.school_guard_same_tenant('teacher_profile_id', 'school_teacher_profiles');

create trigger zz_school_tenant_refs before insert or update on public.school_teacher_blocked_dates
  for each row execute function public.school_guard_same_tenant('teacher_profile_id', 'school_teacher_profiles');

create trigger zz_school_tenant_refs before insert or update on public.school_lesson_plans
  for each row execute function public.school_guard_same_tenant('service_id', 'services');

create trigger zz_school_tenant_refs before insert or update on public.school_enrollments
  for each row execute function public.school_guard_same_tenant(
    'student_id', 'school_students', 'lesson_plan_id', 'school_lesson_plans',
    'default_teacher_profile_id', 'school_teacher_profiles', 'sale_id', 'sales',
    'payer_customer_id', 'customers');

create trigger zz_school_tenant_refs before insert or update on public.school_lessons
  for each row execute function public.school_guard_same_tenant(
    'teacher_profile_id', 'school_teacher_profiles', 'rescheduled_to_id', 'school_lessons');

create trigger zz_school_tenant_refs before insert or update on public.school_lesson_participants
  for each row execute function public.school_guard_same_tenant(
    'lesson_id', 'school_lessons', 'enrollment_id', 'school_enrollments',
    'linked_participant_id', 'school_lesson_participants');

create trigger zz_school_tenant_refs before insert or update on public.school_class_credit_movements
  for each row execute function public.school_guard_same_tenant(
    'enrollment_id', 'school_enrollments', 'lesson_id', 'school_lessons');

create trigger zz_school_tenant_refs before insert or update on public.school_reschedule_requests
  for each row execute function public.school_guard_same_tenant(
    'lesson_id', 'school_lessons', 'participant_id', 'school_lesson_participants',
    'enrollment_id', 'school_enrollments');

create trigger zz_school_tenant_refs before insert or update on public.school_materials
  for each row execute function public.school_guard_same_tenant(
    'author_staff_id', 'staff', 'lesson_id', 'school_lessons');

create trigger zz_school_tenant_refs before insert or update on public.school_material_recipients
  for each row execute function public.school_guard_same_tenant(
    'material_id', 'school_materials', 'student_id', 'school_students');

create trigger zz_school_tenant_refs before insert or update on public.school_access_links
  for each row execute function public.school_guard_same_tenant(
    'lesson_id', 'school_lessons', 'student_id', 'school_students',
    'guardian_customer_id', 'customers');

create trigger zz_school_tenant_refs before insert or update on public.school_communication_log
  for each row execute function public.school_guard_same_tenant(
    'student_id', 'school_students', 'guardian_customer_id', 'customers');
