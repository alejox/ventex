-- Académico: levels catalog, student birth date and optional age range on
-- lesson plans. Additive only: every new column is nullable or defaulted, so
-- existing rows and current app code keep working unchanged.

-- Levels catalog, authored in Configuración de Académico (same shape as
-- `instruments`), feeding the level selector on the student form.
alter table public.school_settings
  add column if not exists levels text[] not null default '{}';

-- Birth date instead of a stored age, so the age never goes stale.
alter table public.school_students
  add column if not exists birth_date date
    check (birth_date is null or birth_date >= date '1900-01-01');

-- Optional age range for group plans. It only produces a warning when
-- enrolling (the business decides): nothing in the database enforces it.
alter table public.school_lesson_plans
  add column if not exists min_age integer check (min_age is null or min_age between 0 and 120),
  add column if not exists max_age integer check (max_age is null or max_age between 0 and 120);

alter table public.school_lesson_plans
  drop constraint if exists school_lesson_plans_age_range_check;
alter table public.school_lesson_plans
  add constraint school_lesson_plans_age_range_check
    check (min_age is null or max_age is null or min_age <= max_age);
