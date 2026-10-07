-- open_shift_for_commission: encontrar el turno de la persona por su MEMBRESÍA.
--
-- Antes buscaba el turno abierto de la persona a la que se le paga uniendo
-- shifts.worker_id → profiles.staff_id. En producción profiles.staff_id está
-- NULL para todos los miembros: el vínculo real persona ↔ cuenta vive en
-- workspace_memberships.staff_id, y cada turno lleva su membership_id. Con el
-- join viejo el primer paso nunca encontraba nada y todo caía en el "único
-- turno abierto" (o en NULL con dos turnos abiertos aunque uno fuera suyo).
--
-- Se conserva el resto: si la persona no tiene turno abierto, el único turno
-- abierto del negocio; con dos o más y ninguno suyo, NULL a propósito.

create or replace function public.open_shift_for_commission(p_staff_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid   uuid := public.get_effective_user_id();
  v_shift uuid;
  v_count integer;
begin
  if v_uid is null then
    return null;
  end if;

  select shift_row.id into v_shift
  from public.shifts shift_row
  join public.workspace_memberships m
    on m.id = shift_row.membership_id
   and m.workspace_id = v_uid
   and m.staff_id = p_staff_id
   and m.status = 'active'
  where shift_row.user_id = v_uid
    and shift_row.status = 'open'
  order by shift_row.opened_at
  limit 1;

  if v_shift is not null then
    return v_shift;
  end if;

  select count(*) into v_count
  from public.shifts shift_row
  where shift_row.user_id = v_uid and shift_row.status = 'open';

  if v_count <> 1 then
    return null;
  end if;

  select shift_row.id into v_shift
  from public.shifts shift_row
  where shift_row.user_id = v_uid and shift_row.status = 'open';

  return v_shift;
end;
$function$;
