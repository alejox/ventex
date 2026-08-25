-- El movimiento manual se expresa en unidades O en cajas.
--
-- Hasta ahora `register_manual_movement` multiplicaba SIEMPRE la cantidad por
-- `units_per_package`, así que en un producto que viene de a 24 no había manera
-- de mover 5 unidades sueltas: entraban 120. Y la caja incompleta —que es la
-- regla, no la excepción: llega una caja de 24 con 23— era inexpresable.
--
-- Además el libro de movimientos guardaba la cantidad CRUDA (cajas), mientras
-- que todos los demás escritores de `inventory_movements` —`create_sale`,
-- `void_sale`, las compras— guardan el delta en unidades sueltas. En la pantalla
-- de Movimientos, "+2" de una compra eran 2 unidades y "+2" de un ajuste manual
-- eran 48: el mismo número significaba dos cosas distintas. A partir de acá el
-- movimiento manual guarda unidades, igual que el resto.
--
-- Los movimientos manuales YA registrados no se reescriben: `units_per_package`
-- pudo haber cambiado desde entonces, así que reconstruir sus unidades sería
-- inventar un número que nadie puede verificar.

BEGIN;

-- La firma cambia (aparece `p_unit_mode`), así que la vieja se elimina en vez de
-- reemplazarse: dos sobrecargas con el mismo nombre dejarían a PostgREST sin
-- saber cuál llamar cuando el cliente manda 4 argumentos.
DROP FUNCTION IF EXISTS public.register_manual_movement(uuid, text, integer, text);

CREATE FUNCTION public.register_manual_movement(
  p_product_id uuid,
  p_type       text,
  p_quantity   integer,
  p_notes      text DEFAULT NULL,
  p_unit_mode  text DEFAULT 'package'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_uid   uuid := public.get_effective_user_id();
  v_actor uuid := (select auth.uid());
  v_units integer;
  v_pack  integer;
  v_stock integer;
  v_new   integer;
  v_moved integer;
  v_unit  text;
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

  -- El default es 'package' para que las llamadas viejas de 4 argumentos sigan
  -- significando exactamente lo mismo que antes.
  if coalesce(p_unit_mode, 'package') not in ('unit', 'package') then
    raise exception 'Modo de cantidad inválido: %', p_unit_mode;
  end if;

  if p_quantity < 0 then
    raise exception 'La cantidad no puede ser negativa';
  end if;

  select coalesce(units_per_package, 1), stock_level, unit
    into v_pack, v_stock, v_unit
  from public.products
  where id = p_product_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  if v_unit = 'Servicio' then
    raise exception 'SIN_STOCK: un servicio no lleva inventario';
  end if;

  -- Un `units_per_package` en 0 anularía el movimiento entero.
  v_pack  := greatest(coalesce(v_pack, 1), 1);
  v_units := case when coalesce(p_unit_mode, 'package') = 'package'
                  then p_quantity * v_pack
                  else p_quantity
             end;

  v_new := case p_type
             when 'adjust' then v_units
             when 'in'     then v_stock + v_units
             else               v_stock - v_units
           end;

  if v_new < 0 then
    raise exception 'STOCK_INSUFICIENTE: hay % unidades y se intentan retirar %',
      v_stock, v_units;
  end if;

  -- El ajuste no es un delta: lo que queda registrado es el conteo al que se
  -- llevó el producto, no cuánto se movió.
  v_moved := case when p_type = 'adjust' then v_new else v_units end;

  insert into public.inventory_movements (user_id, created_by, product_id, type, quantity, reference_type, notes)
  values (v_uid, v_actor, p_product_id, p_type, v_moved, 'manual', nullif(p_notes, ''));

  update public.products
     set stock_level = v_new,
         updated_at  = now()
   where id = p_product_id and user_id = v_uid;
end;
$function$;

-- Recrear la función devuelve EXECUTE a PUBLIC: se revoca y se otorga a mano.
-- El REVOKE a `anon` es aparte y hace falta: los privilegios por defecto del
-- proyecto le dan EXECUTE sobre toda función nueva, y aunque acá rebotaría con
-- 'No autenticado', mover stock no es una operación que un visitante deba poder
-- ni intentar.
REVOKE ALL ON FUNCTION public.register_manual_movement(uuid, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_manual_movement(uuid, text, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_manual_movement(uuid, text, integer, text, text) TO authenticated, service_role;

COMMIT;
