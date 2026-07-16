-- Cargo/rol del trabajador (empleado con login). Los trabajadores son filas de
-- `profiles` (is_worker=true) sin ficha en `staff`, así que el rol vive aquí.
alter table public.profiles add column if not exists worker_role text;
