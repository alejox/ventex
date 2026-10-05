-- Una cita pagada queda COMPLETADA, se cobre desde donde se cobre.
--
-- Hasta acá la cita y la venta no se conocían: el botón "Cobrar" de la cita
-- creaba la venta y después, en otra llamada, cambiaba el estado; y cobrar el
-- mismo corte desde el POS —lo que hace el barbero con el cliente parado en el
-- mostrador— no tocaba la cita en absoluto. Resultado: citas cobradas que
-- seguían "Pendiente" o "Confirmada" en el calendario.
--
-- `appointments.sale_id` ata la cita a la venta que la pagó. Sirve para tres
-- cosas: saber que ya está paga (y no cobrarla dos veces), que el trigger no
-- use la misma cita para dos ventas, y deshacerlo si la venta se anula.
--
-- No se tocó `create_sale` (ver AGENTS.md): todo esto son triggers aditivos.

alter table public.appointments
  add column if not exists sale_id uuid references public.sales(id) on delete set null;

create index if not exists appointments_sale_id_idx
  on public.appointments (sale_id) where sale_id is not null;

-- Al vender un SERVICIO a un cliente con cita ese mismo día por ese mismo
-- servicio, la cita se completa. Se elige la más cercana a la hora de la venta:
-- un cliente con dos cortes el mismo día (raro, pero existe) paga el que está
-- sentado en la silla, no el de la tarde.
--
-- El día se mide en la zona del negocio (`business_sites.timezone`): la base
-- corre en UTC y una venta de las 20:00 en Colombia ya es "mañana" en UTC.
--
-- SECURITY DEFINER porque quien vende puede tener `pos` sin `calendar`: el
-- cajero no edita la agenda, pero su cobro sí tiene que cerrarla.
create or replace function public.complete_appointment_on_service_sale()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale  public.sales%rowtype;
  v_tz    text;
  v_local timestamp;
  v_appt  uuid;
begin
  if new.service_id is null then
    return new;
  end if;

  select * into v_sale from public.sales where id = new.sale_id;
  if not found or v_sale.customer_id is null or v_sale.status <> 'completed' then
    return new;
  end if;

  select coalesce(nullif(btrim(timezone), ''), 'America/Bogota') into v_tz
    from public.business_sites
   where user_id = v_sale.user_id;
  v_tz := coalesce(v_tz, 'America/Bogota');
  v_local := v_sale.created_at at time zone v_tz;

  select a.id into v_appt
    from public.appointments a
   where a.user_id = v_sale.user_id
     and a.customer_id = v_sale.customer_id
     and a.service_id = new.service_id
     and a.appointment_date = v_local::date
     and a.status in ('pending', 'confirmed')
     and a.sale_id is null
   order by abs(extract(epoch from (a.appointment_date + a.start_time) - v_local))
   limit 1
   for update skip locked;

  if v_appt is not null then
    update public.appointments
       set status = 'completed', sale_id = v_sale.id
     where id = v_appt;
  end if;

  return new;
end;
$$;

revoke all on function public.complete_appointment_on_service_sale() from public, anon, authenticated;

drop trigger if exists sale_items_complete_appointment on public.sale_items;
create trigger sale_items_complete_appointment
  after insert on public.sale_items
  for each row execute function public.complete_appointment_on_service_sale();

-- Anular la venta reabre la cita: el servicio no se cobró, así que no puede
-- seguir figurando como hecho y pago. Vuelve a "confirmada" y no a "pendiente"
-- porque el cliente vino: lo que falta es cobrarlo, no confirmarlo.
create or replace function public.reopen_appointment_on_sale_void()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'void' and old.status is distinct from 'void' then
    update public.appointments
       set status = 'confirmed', sale_id = null
     where sale_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.reopen_appointment_on_sale_void() from public, anon, authenticated;

drop trigger if exists sales_reopen_appointment on public.sales;
create trigger sales_reopen_appointment
  after update of status on public.sales
  for each row execute function public.reopen_appointment_on_sale_void();
