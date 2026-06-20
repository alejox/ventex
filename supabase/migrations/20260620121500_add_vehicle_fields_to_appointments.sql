-- Datos del vehículo en la cita (relevante para lavaautos): placa y descripción.
alter table public.appointments
  add column if not exists vehicle_plate text,
  add column if not exists vehicle_model text;
