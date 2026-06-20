-- Conecta las citas con el catálogo de servicios y el equipo (barberos/staff).
-- on delete set null: borrar un servicio o barbero no borra la cita histórica.
alter table public.appointments
  add column if not exists service_id uuid references public.services(id) on delete set null;

alter table public.appointments
  add column if not exists staff_id uuid references public.staff(id) on delete set null;

create index if not exists appointments_service_id_idx on public.appointments (service_id);
create index if not exists appointments_staff_id_idx    on public.appointments (staff_id);
