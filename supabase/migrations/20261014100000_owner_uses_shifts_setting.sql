-- El dueño y los administradores pueden elegir trabajar con caja (turno, retiros,
-- arqueo). Apagado por defecto: ningún negocio existente ve un cambio.
--
-- No se toca create_sale: el dueño siempre puede vender sin caja ("Iniciar sin
-- abrir caja"), así que no hay exigencia de servidor. Las RPC de turno
-- (open_shift/current_shift/close_shift/register_cash_withdrawal) ya aceptan al
-- dueño: van por membresía activa. Esta columna solo decide la UI del POS y el
-- respaldo de register_customer_payment (20261014100100).
alter table public.settings
  add column if not exists owner_uses_shifts boolean not null default false;

-- Guard HERMANO de guard_shift_requirement_setting, no una extensión: el trigger
-- existente está declarado `update of require_active_shift`, así que extenderlo
-- obligaba a recrear el trigger y a reescribir una función viva. Con uno propio,
-- cada regla se lee sola y la existente queda intacta.
create or replace function public.guard_owner_uses_shifts_setting()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.owner_uses_shifts)
     or (tg_op = 'UPDATE' and new.owner_uses_shifts is distinct from old.owner_uses_shifts) then
    if auth.uid() is not null and not public.is_tenant_owner()
       and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Solo el administrador del negocio puede cambiar si el administrador usa caja'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists settings_guard_owner_uses_shifts on public.settings;
create trigger settings_guard_owner_uses_shifts
before insert or update of owner_uses_shifts on public.settings
for each row execute function public.guard_owner_uses_shifts_setting();

-- `settings` tiene GRANT a nivel de tabla para authenticated (SELECT/INSERT/UPDATE),
-- así que la columna nueva queda legible y escribible sin GRANT por columna; la
-- RLS del negocio y este guard deciden quién la cambia.
