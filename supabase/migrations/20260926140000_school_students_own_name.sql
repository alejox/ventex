-- Académico: a student has their own name. Until now the name was read from
-- the linked customer, so a student linked to a parent's customer showed the
-- parent's name. The customer stays as the billing account (who buys in the
-- POS), which may be shared by siblings — hence the unique constraint goes.

alter table public.school_students
  add column if not exists full_name text;

-- Backfill: existing students start with their customer's name; the business
-- corrects it by editing the student.
update public.school_students s
   set full_name = c.full_name
  from public.customers c
 where c.id = s.customer_id
   and s.full_name is null;

update public.school_students
   set full_name = 'Sin nombre'
 where full_name is null or btrim(full_name) = '';

alter table public.school_students
  alter column full_name set not null;

alter table public.school_students
  drop constraint if exists school_students_full_name_check;
alter table public.school_students
  add constraint school_students_full_name_check
    check (char_length(btrim(full_name)) between 1 and 160);

-- Siblings can share one customer account.
alter table public.school_students
  drop constraint if exists school_students_tenant_customer_unique;

create index if not exists school_students_customer_idx
  on public.school_students (user_id, customer_id);

-- Compatibility: app versions that do not send `full_name` yet keep working —
-- a missing name falls back to the linked customer's name.
create or replace function public.school_students_fill_full_name()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.full_name is null or btrim(new.full_name) = '' then
    select c.full_name into new.full_name
      from public.customers c
     where c.id = new.customer_id;
    new.full_name := coalesce(nullif(btrim(new.full_name), ''), 'Sin nombre');
  end if;
  return new;
end;
$$;

drop trigger if exists school_students_fill_full_name on public.school_students;
create trigger school_students_fill_full_name
  before insert or update on public.school_students
  for each row execute function public.school_students_fill_full_name();
