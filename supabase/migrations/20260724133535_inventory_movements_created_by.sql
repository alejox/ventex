-- Quién hizo el movimiento.
--
-- `user_id` es el NEGOCIO (tenencia), no la persona: con un cajero moviendo
-- stock, las dos filas quedaban idénticas y el registro no decía quién hizo la
-- merma. La auditoría sin actor no es auditoría.
--
-- Apunta a `public.profiles` y no a `auth.users` para que PostgREST pueda
-- resolver el nombre con un embed; profiles.id ya referencia a auth.users.
-- Nullable a propósito: los movimientos históricos NO tienen actor conocido y
-- rellenarlos con el dueño sería inventar evidencia.
alter table public.inventory_movements
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create index if not exists inv_movements_created_by_idx
  on public.inventory_movements (created_by);

-- El insert vive dentro de este SECURITY DEFINER, así que el actor se sella acá:
-- `auth.uid()` es la persona autenticada (el cajero), mientras que
-- get_effective_user_id() devuelve el dueño del negocio.
create or replace function public.register_manual_movement(
  p_product_id uuid,
  p_type text,
  p_quantity integer,
  p_notes text default null::text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid   uuid := public.get_effective_user_id();
  v_actor uuid := (select auth.uid());
  v_units integer;
  v_stock integer;
  v_new   integer;
begin
  if v_actor is null then
    raise exception 'No autenticado';
  end if;

  if not public.worker_can('inventory_stock') then
    raise exception 'SIN_PERMISO: no tenés permiso para mover stock'
      using errcode = '42501';
  end if;

  if p_type not in ('in', 'out', 'adjust') then
    raise exception 'Tipo de movimiento inválido: %', p_type;
  end if;

  if p_quantity < 0 then
    raise exception 'La cantidad no puede ser negativa';
  end if;

  select coalesce(units_per_package, 1), stock_level
    into v_units, v_stock
  from public.products
  where id = p_product_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  v_new := case p_type
             when 'adjust' then p_quantity
             when 'in'     then v_stock + (p_quantity * v_units)
             else               v_stock - (p_quantity * v_units)
           end;

  if v_new < 0 then
    raise exception 'STOCK_INSUFICIENTE: hay % unidades y se intentan retirar %',
      v_stock, abs(v_new - v_stock);
  end if;

  insert into public.inventory_movements (user_id, created_by, product_id, type, quantity, reference_type, notes)
  values (v_uid, v_actor, p_product_id, p_type, p_quantity, 'manual', nullif(p_notes, ''));

  update public.products
     set stock_level = v_new,
         updated_at  = now()
   where id = p_product_id and user_id = v_uid;
end;
$function$;

revoke execute on function public.register_manual_movement(uuid, text, integer, text) from public, anon;
grant   execute on function public.register_manual_movement(uuid, text, integer, text) to authenticated;
