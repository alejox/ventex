-- Módulo opt-in "Escuela de música": tablas académicas (fase U1).
--
-- Todo sigue el patrón de tenencia del repo: user_id NOT NULL con default
-- get_effective_user_id(), trigger set_user_id(), RLS user_id =
-- get_effective_user_id(), grants SOLO a authenticated y revoke a anon.
-- Arquetipos: 20260802130000_public_site_allow_definer_tenant.sql (set_user_id),
-- 20260730230000_align_tenant_insert_defaults.sql (default de tenencia),
-- 20260815240000_void_sale_undoes_redemption.sql (congelado de condiciones).
--
-- La tabla de planes académicos se llama school_lesson_plans y NUNCA "plans":
-- public.plans es la tabla de suscripciones SaaS.
--
-- Nunca se borra: school_lessons, school_lesson_participants y
-- school_enrollments tienen triggers BEFORE DELETE que revientan. Cancelar,
-- anular o corregir es siempre un UPDATE de estado; la asistencia vive en la
-- fila del participante y no se toca.

-- ---------------------------------------------------------------------------
-- Gate del módulo: lectura autoritativa de profiles.modules para el tenant
-- efectivo (el dueño; para workers, el workspace del dueño). SECURITY DEFINER
-- lee modules pese a los grants por columna (precedente site_public_projection).
-- ---------------------------------------------------------------------------
create or replace function public.school_module_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (p.modules ->> 'school')::boolean
    from public.profiles p
    where p.id = public.get_effective_user_id()
  ), false);
$$;

revoke execute on function public.school_module_enabled() from public, anon;
grant execute on function public.school_module_enabled() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Estudiantes
-- ---------------------------------------------------------------------------
create table public.school_students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'inactive')),
  instrument text not null,
  level text,
  contact_phone text,
  contact_email text,
  is_minor boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  constraint school_students_tenant_customer_unique unique (user_id, customer_id)
);

alter table public.school_students enable row level security;

create policy school_students_read on public.school_students
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_students_insert on public.school_students
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_students_update on public.school_students
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());
create policy school_students_delete on public.school_students
  for delete to authenticated using (user_id = public.get_effective_user_id());

create trigger school_students_set_user_id before insert on public.school_students
  for each row execute function public.set_user_id();

revoke all on public.school_students from anon;
revoke all on public.school_students from public;
grant select, insert, update, delete on public.school_students to authenticated;

-- ---------------------------------------------------------------------------
-- Acudientes (relación estudiante ↔ cliente, con UN receptor de avisos)
-- ---------------------------------------------------------------------------
create table public.school_student_guardians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  student_id uuid not null references public.school_students(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  relationship text,
  phone text,
  email text,
  is_notice_receiver boolean not null default false,
  notices_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint school_student_guardians_unique unique (user_id, student_id, customer_id)
);

-- A lo sumo un receptor por estudiante. Que exista al menos uno es regla de
-- negocio (se garantiza en la UI y en school_enroll): "exactamente uno" no se
-- puede expresar como constraint sin estar siempre insertando de a pares.
create unique index school_students_one_notice_receiver
  on public.school_student_guardians (user_id, student_id)
  where is_notice_receiver;

alter table public.school_student_guardians enable row level security;

create policy school_student_guardians_read on public.school_student_guardians
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_student_guardians_insert on public.school_student_guardians
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_student_guardians_update on public.school_student_guardians
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());
create policy school_student_guardians_delete on public.school_student_guardians
  for delete to authenticated using (user_id = public.get_effective_user_id());

create trigger school_student_guardians_set_user_id before insert on public.school_student_guardians
  for each row execute function public.set_user_id();

revoke all on public.school_student_guardians from anon;
revoke all on public.school_student_guardians from public;
grant select, insert, update, delete on public.school_student_guardians to authenticated;

-- ---------------------------------------------------------------------------
-- Perfiles de profesor (extienden staff; NO existe identidad paralela)
-- ---------------------------------------------------------------------------
create table public.school_teacher_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  staff_id uuid not null unique references public.staff(id) on delete restrict,
  instruments text[] not null default '{}',
  bio text,
  created_at timestamptz not null default now()
);

alter table public.school_teacher_profiles enable row level security;

create policy school_teacher_profiles_read on public.school_teacher_profiles
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_teacher_profiles_insert on public.school_teacher_profiles
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_teacher_profiles_update on public.school_teacher_profiles
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());
create policy school_teacher_profiles_delete on public.school_teacher_profiles
  for delete to authenticated using (user_id = public.get_effective_user_id());

create trigger school_teacher_profiles_set_user_id before insert on public.school_teacher_profiles
  for each row execute function public.set_user_id();

revoke all on public.school_teacher_profiles from anon;
revoke all on public.school_teacher_profiles from public;
grant select, insert, update, delete on public.school_teacher_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Disponibilidad semanal y excepciones de fecha (bloqueos) del profesor
-- ---------------------------------------------------------------------------
create table public.school_teacher_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  teacher_profile_id uuid not null references public.school_teacher_profiles(id) on delete cascade,
  weekday integer not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  created_at timestamptz not null default now(),
  constraint school_teacher_availability_unique
    unique (user_id, teacher_profile_id, weekday, start_time)
);

alter table public.school_teacher_availability enable row level security;

create policy school_teacher_availability_read on public.school_teacher_availability
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_teacher_availability_insert on public.school_teacher_availability
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_teacher_availability_update on public.school_teacher_availability
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());
create policy school_teacher_availability_delete on public.school_teacher_availability
  for delete to authenticated using (user_id = public.get_effective_user_id());

create trigger school_teacher_availability_set_user_id before insert on public.school_teacher_availability
  for each row execute function public.set_user_id();

revoke all on public.school_teacher_availability from anon;
revoke all on public.school_teacher_availability from public;
grant select, insert, update, delete on public.school_teacher_availability to authenticated;

create table public.school_teacher_blocked_dates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  teacher_profile_id uuid not null references public.school_teacher_profiles(id) on delete cascade,
  blocked_date date not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint school_teacher_blocked_dates_unique
    unique (user_id, teacher_profile_id, blocked_date)
);

alter table public.school_teacher_blocked_dates enable row level security;

create policy school_teacher_blocked_dates_read on public.school_teacher_blocked_dates
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_teacher_blocked_dates_insert on public.school_teacher_blocked_dates
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_teacher_blocked_dates_update on public.school_teacher_blocked_dates
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());
create policy school_teacher_blocked_dates_delete on public.school_teacher_blocked_dates
  for delete to authenticated using (user_id = public.get_effective_user_id());

create trigger school_teacher_blocked_dates_set_user_id before insert on public.school_teacher_blocked_dates
  for each row execute function public.set_user_id();

revoke all on public.school_teacher_blocked_dates from anon;
revoke all on public.school_teacher_blocked_dates from public;
grant select, insert, update, delete on public.school_teacher_blocked_dates to authenticated;

-- ---------------------------------------------------------------------------
-- Planes de clase: el precio lo lleva la fila de `services` (un solo evento de
-- dinero, el POS). NUNCA llamada "plans" (esa es la tabla de suscripciones).
-- ---------------------------------------------------------------------------
create table public.school_lesson_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  name text not null,
  service_id uuid not null references public.services(id) on delete restrict,
  lesson_count integer not null check (lesson_count > 0),
  duration_minutes integer not null check (duration_minutes > 0),
  validity_days integer not null default 30 check (validity_days > 0),
  max_group_size integer not null default 1 check (max_group_size >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint school_lesson_plans_tenant_name_unique unique (user_id, name)
);

create index school_lesson_plans_active_idx
  on public.school_lesson_plans (user_id, is_active);

alter table public.school_lesson_plans enable row level security;

create policy school_lesson_plans_read on public.school_lesson_plans
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_lesson_plans_insert on public.school_lesson_plans
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_lesson_plans_update on public.school_lesson_plans
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());
create policy school_lesson_plans_delete on public.school_lesson_plans
  for delete to authenticated using (user_id = public.get_effective_user_id());

create trigger school_lesson_plans_set_user_id before insert on public.school_lesson_plans
  for each row execute function public.set_user_id();

revoke all on public.school_lesson_plans from anon;
revoke all on public.school_lesson_plans from public;
grant select, insert, update, delete on public.school_lesson_plans to authenticated;

-- ---------------------------------------------------------------------------
-- Matrículas: congelan lo CONTRATADO (precedente promo_redemptions). Editar el
-- catálogo o la configuración después NO cambia lo que ya se vendió.
-- ---------------------------------------------------------------------------
create table public.school_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  student_id uuid not null references public.school_students(id) on delete restrict,
  lesson_plan_id uuid not null references public.school_lesson_plans(id) on delete restrict,
  instrument text not null,
  default_teacher_profile_id uuid references public.school_teacher_profiles(id) on delete set null,
  -- Null = matrícula manual sin venta POS. La venta anulada NO se borra la
  -- matrícula (la anulación la reconciliará el trigger de la fase U3).
  sale_id uuid references public.sales(id) on delete set null,
  payer_customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'expired', 'voided', 'cancelled')),
  start_date date not null default current_date,
  expiry_date date,
  reschedule_count integer not null default 0 check (reschedule_count >= 0),
  -- Snapshot congelado al matricular (la política de reprogramación incluida).
  plan_name text not null,
  contracted_lessons integer not null check (contracted_lessons > 0),
  plan_price numeric(12, 2) not null default 0,
  plan_validity_days integer not null default 30,
  policy_min_advance_hours integer not null default 24,
  policy_max_reschedules integer not null default 2,
  policy_consume_on_unjustified_absence boolean not null default false,
  policy_expiry_extension_days integer not null default 0,
  created_at timestamptz not null default now()
);

create index school_enrollments_sale_idx
  on public.school_enrollments (user_id, sale_id) where sale_id is not null;
create index school_enrollments_student_idx
  on public.school_enrollments (user_id, student_id);

alter table public.school_enrollments enable row level security;

create policy school_enrollments_read on public.school_enrollments
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_enrollments_insert on public.school_enrollments
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_enrollments_update on public.school_enrollments
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());

create trigger school_enrollments_set_user_id before insert on public.school_enrollments
  for each row execute function public.set_user_id();

revoke all on public.school_enrollments from anon;
revoke all on public.school_enrollments from public;
grant select, insert, update on public.school_enrollments to authenticated;

-- ---------------------------------------------------------------------------
-- Clases: viven en tablas paralelas; appointments y el sitio público NO se
-- tocan. El estado viaja en status; NUNCA se borra una fila.
-- ---------------------------------------------------------------------------
create table public.school_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  teacher_profile_id uuid not null references public.school_teacher_profiles(id) on delete restrict,
  instrument text not null,
  room text,
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  capacity integer not null check (capacity >= 1),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'pending_close', 'realized', 'cancelled', 'rescheduled')),
  version integer not null default 1,
  confirmed_at timestamptz,
  confirmed_by uuid,
  confirmed_via text check (confirmed_via in ('session', 'link')),
  confirmed_version integer,
  closed_at timestamptz,
  closed_by uuid,
  closed_via text check (closed_via in ('session', 'link')),
  cancel_reason text,
  cancelled_by uuid,
  cancelled_at timestamptz,
  rescheduled_to_id uuid references public.school_lessons(id) on delete set null,
  created_at timestamptz not null default now()
);

create index school_lessons_teacher_idx
  on public.school_lessons (user_id, teacher_profile_id, start_at);
create index school_lessons_room_idx
  on public.school_lessons (user_id, room, start_at) where room is not null;
create index school_lessons_status_idx
  on public.school_lessons (user_id, status, end_at);

alter table public.school_lessons enable row level security;

create policy school_lessons_read on public.school_lessons
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_lessons_insert on public.school_lessons
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_lessons_update on public.school_lessons
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());

create trigger school_lessons_set_user_id before insert on public.school_lessons
  for each row execute function public.set_user_id();

revoke all on public.school_lessons from anon;
revoke all on public.school_lessons from public;
grant select, insert, update on public.school_lessons to authenticated;

-- ---------------------------------------------------------------------------
-- Participantes: esta fila ES el registro de asistencia. Nunca se borra.
-- ---------------------------------------------------------------------------
create table public.school_lesson_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.school_lessons(id) on delete restrict,
  enrollment_id uuid not null references public.school_enrollments(id) on delete restrict,
  attendance_status text not null default 'pending'
    check (attendance_status in ('pending', 'attended', 'absent', 'justified')),
  observation text,
  recorded_by uuid,
  recorded_at timestamptz,
  linked_participant_id uuid references public.school_lesson_participants(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint school_lesson_participants_unique
    unique (user_id, lesson_id, enrollment_id)
);

create index school_lesson_participants_enrollment_idx
  on public.school_lesson_participants (user_id, enrollment_id);

alter table public.school_lesson_participants enable row level security;

create policy school_lesson_participants_read on public.school_lesson_participants
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_lesson_participants_insert on public.school_lesson_participants
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_lesson_participants_update on public.school_lesson_participants
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());

create trigger school_lesson_participants_set_user_id before insert on public.school_lesson_participants
  for each row execute function public.set_user_id();

revoke all on public.school_lesson_participants from anon;
revoke all on public.school_lesson_participants from public;
grant select, insert, update on public.school_lesson_participants to authenticated;

-- ---------------------------------------------------------------------------
-- Libro mayor de créditos de clase: append-only, el saldo ES su suma.
-- ---------------------------------------------------------------------------
create table public.school_class_credit_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  enrollment_id uuid not null references public.school_enrollments(id) on delete restrict,
  kind text not null
    check (kind in ('assignment', 'consumption', 'cancel_return', 'void', 'adjustment')),
  amount integer not null,
  reason text not null,
  lesson_id uuid references public.school_lessons(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index school_credit_movements_enrollment_idx
  on public.school_class_credit_movements (user_id, enrollment_id, created_at);

alter table public.school_class_credit_movements enable row level security;

create policy school_credit_movements_read on public.school_class_credit_movements
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_credit_movements_insert on public.school_class_credit_movements
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_credit_movements_update on public.school_class_credit_movements
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());

create trigger school_credit_movements_set_user_id before insert on public.school_class_credit_movements
  for each row execute function public.set_user_id();

revoke all on public.school_class_credit_movements from anon;
revoke all on public.school_class_credit_movements from public;
grant select, insert, update on public.school_class_credit_movements to authenticated;

-- ---------------------------------------------------------------------------
-- Pedidos de reprogramación: pendiente conserva la reserva del horario.
-- ---------------------------------------------------------------------------
create table public.school_reschedule_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  enrollment_id uuid not null references public.school_enrollments(id) on delete restrict,
  lesson_id uuid references public.school_lessons(id) on delete set null,
  participant_id uuid references public.school_lesson_participants(id) on delete set null,
  requested_by uuid,
  requester_kind text not null check (requester_kind in ('coordinator', 'guardian', 'student')),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  new_start_at timestamptz,
  new_end_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.school_reschedule_requests enable row level security;

create policy school_reschedule_requests_read on public.school_reschedule_requests
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_reschedule_requests_insert on public.school_reschedule_requests
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_reschedule_requests_update on public.school_reschedule_requests
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());

create trigger school_reschedule_requests_set_user_id before insert on public.school_reschedule_requests
  for each row execute function public.set_user_id();

revoke all on public.school_reschedule_requests from anon;
revoke all on public.school_reschedule_requests from public;
grant select, insert, update on public.school_reschedule_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Materiales: archivo privado O enlace externo (exactamente uno). El enlace
-- externo conserva las condiciones de acceso del servicio tercero.
-- ---------------------------------------------------------------------------
create table public.school_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  title text not null,
  instructions text,
  kind text not null check (kind in ('file', 'link')),
  file_path text,
  file_name text,
  file_size bigint,
  mime_type text,
  external_url text,
  author_staff_id uuid references public.staff(id) on delete set null,
  lesson_id uuid references public.school_lessons(id) on delete set null,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  constraint school_materials_exactly_one check (
    (kind = 'file' and file_path is not null and external_url is null)
    or (kind = 'link' and external_url is not null and file_path is null)
  )
);

alter table public.school_materials enable row level security;

create policy school_materials_read on public.school_materials
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_materials_insert on public.school_materials
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_materials_update on public.school_materials
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());
create policy school_materials_delete on public.school_materials
  for delete to authenticated using (user_id = public.get_effective_user_id());

create trigger school_materials_set_user_id before insert on public.school_materials
  for each row execute function public.set_user_id();

revoke all on public.school_materials from anon;
revoke all on public.school_materials from public;
grant select, insert, update, delete on public.school_materials to authenticated;

create table public.school_material_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  material_id uuid not null references public.school_materials(id) on delete cascade,
  student_id uuid not null references public.school_students(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint school_material_recipients_unique unique (material_id, student_id)
);

alter table public.school_material_recipients enable row level security;

create policy school_material_recipients_read on public.school_material_recipients
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_material_recipients_insert on public.school_material_recipients
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_material_recipients_update on public.school_material_recipients
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());
create policy school_material_recipients_delete on public.school_material_recipients
  for delete to authenticated using (user_id = public.get_effective_user_id());

create trigger school_material_recipients_set_user_id before insert on public.school_material_recipients
  for each row execute function public.set_user_id();

revoke all on public.school_material_recipients from anon;
revoke all on public.school_material_recipients from public;
grant select, insert, update, delete on public.school_material_recipients to authenticated;

-- ---------------------------------------------------------------------------
-- Enlaces de acceso con token: SOLO se guarda el hash sha256. El token crudo
-- lo ve la UI una única vez para armar el wa.me.
-- ---------------------------------------------------------------------------
create table public.school_access_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('teacher_confirm', 'family_read')),
  token_hash text not null unique,
  lesson_id uuid references public.school_lessons(id) on delete set null,
  student_id uuid references public.school_students(id) on delete cascade,
  guardian_customer_id uuid references public.customers(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create index school_access_links_lesson_idx
  on public.school_access_links (user_id, lesson_id) where lesson_id is not null;

alter table public.school_access_links enable row level security;

create policy school_access_links_read on public.school_access_links
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_access_links_insert on public.school_access_links
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_access_links_update on public.school_access_links
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());

create trigger school_access_links_set_user_id before insert on public.school_access_links
  for each row execute function public.set_user_id();

revoke all on public.school_access_links from anon;
revoke all on public.school_access_links from public;
grant select, insert, update on public.school_access_links to authenticated;

-- ---------------------------------------------------------------------------
-- Bitácora de comunicación: SOLO estados observables (preparado / compartido).
-- Nunca "enviado", "entregado" ni "leído": no hay API de WhatsApp detrás.
-- ---------------------------------------------------------------------------
create table public.school_communication_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  purpose text not null check (purpose in ('attendance', 'reschedule', 'material', 'reminder', 'other')),
  state text not null check (state in ('prepared', 'shared')),
  recipient_phone text,
  recipient_name text,
  message text,
  student_id uuid references public.school_students(id) on delete set null,
  guardian_customer_id uuid references public.customers(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index school_communication_log_student_idx
  on public.school_communication_log (user_id, student_id, created_at);

alter table public.school_communication_log enable row level security;

create policy school_communication_log_read on public.school_communication_log
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_communication_log_insert on public.school_communication_log
  for insert to authenticated with check (user_id = public.get_effective_user_id());

create trigger school_communication_log_set_user_id before insert on public.school_communication_log
  for each row execute function public.set_user_id();

revoke all on public.school_communication_log from anon;
revoke all on public.school_communication_log from public;
grant select, insert on public.school_communication_log to authenticated;

-- ---------------------------------------------------------------------------
-- Configuración de la escuela: una fila por tenant, creada perezosamente
-- (leer-e-insertar-o-actualizar, precedente saveSettings/savePromoConfig).
-- ---------------------------------------------------------------------------
create table public.school_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id()
           references auth.users(id) on delete cascade,
  instruments text[] not null default '{}',
  rooms text[] not null default '{}',
  policy jsonb not null default '{}'::jsonb check (pg_column_size(policy) <= 4096),
  message_templates jsonb not null default '{}'::jsonb
    check (pg_column_size(message_templates) <= 4096),
  storage_quota_bytes bigint not null default 104857600 check (storage_quota_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_settings_tenant_unique unique (user_id)
);

alter table public.school_settings enable row level security;

create policy school_settings_read on public.school_settings
  for select to authenticated using (user_id = public.get_effective_user_id());
create policy school_settings_insert on public.school_settings
  for insert to authenticated with check (user_id = public.get_effective_user_id());
create policy school_settings_update on public.school_settings
  for update to authenticated using (user_id = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id());

create trigger school_settings_set_user_id before insert on public.school_settings
  for each row execute function public.set_user_id();

revoke all on public.school_settings from anon;
revoke all on public.school_settings from public;
grant select, insert, update on public.school_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Garantía "nunca se borra" exigida por la base misma, no por convención.
-- Cancelar/reprogramar/anular es UPDATE de estado; borrar revienta.
-- ---------------------------------------------------------------------------
create or replace function public.school_guard_no_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  raise exception 'SIN_PERMISO: las clases, sus asistencias y las matrículas no se borran; se cancelan, se cierran o se anulan' using errcode = '42501';
end;
$fn$;

create trigger school_lessons_no_delete before delete on public.school_lessons
  for each row execute function public.school_guard_no_delete();
create trigger school_lesson_participants_no_delete before delete on public.school_lesson_participants
  for each row execute function public.school_guard_no_delete();
create trigger school_enrollments_no_delete before delete on public.school_enrollments
  for each row execute function public.school_guard_no_delete();