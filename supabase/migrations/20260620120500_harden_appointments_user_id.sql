-- appointments era la única tabla sin DEFAULT auth.uid() ni trigger set_user_id
-- (su SQL original se aplicó a mano). Se alinea con la convención del proyecto.
alter table public.appointments alter column user_id set default auth.uid();

drop trigger if exists set_appointments_user_id on public.appointments;
create trigger set_appointments_user_id
  before insert on public.appointments
  for each row execute function public.set_user_id();
