-- Gastos que nacen de la caja: libros y arqueo no se pueden separar.
--
-- Un gasto creado por register_cash_withdrawal (expenses.cash_movement_id) se
-- podía editar libremente: cambiarle el monto o la fecha dejaba el estado de
-- resultados diciendo una cosa y el arqueo del turno otra; y ponerle
-- cash_movement_id = NULL lo "desataba" para después borrarlo esquivando
-- prevent_delete_cash_expense. Del otro lado, nada impedía insertar desde el
-- cliente un gasto que DIJERA venir de una liquidación o de un retiro.
--
-- guard_commission_expense pasa a cubrir también:
--   * UPDATE de un gasto con cash_movement_id: monto, fecha y el propio
--     cash_movement_id quedan fijos (descripción y categoría siguen libres);
--   * INSERT/UPDATE que pone commission_settlement_id o cash_movement_id: solo
--     desde los RPC (settle_commissions, register_cash_withdrawal).
--
-- ¿Cómo sabe que viene de un RPC? La función pasa a SECURITY INVOKER: dentro de
-- un RPC SECURITY DEFINER el trigger corre como el dueño de la función
-- (postgres); un INSERT/UPDATE directo por PostgREST corre como
-- authenticated/anon. Así no hace falta tocar register_cash_withdrawal para que
-- levante un flag de sesión. app.voiding_settlement sigue valiendo como antes.
--
-- De paso: el mensaje de prevent_delete_cash_expense estaba en voseo.

create or replace function public.guard_commission_expense()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_from_client boolean := current_user in ('authenticated', 'anon');
begin
  if coalesce(current_setting('app.voiding_settlement', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.commission_settlement_id is not null then
      raise exception 'GASTO_DE_LIQUIDACION: este gasto nacio de una liquidacion de comisiones. Anula la liquidacion para reversarlo.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if v_from_client
       and (new.commission_settlement_id is not null or new.cash_movement_id is not null) then
      raise exception 'GASTO_VINCULADO: un gasto de liquidacion o de retiro de caja solo lo crea el sistema.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.commission_settlement_id is not null
     and (new.amount is distinct from old.amount
          or new.expense_date is distinct from old.expense_date
          or new.commission_settlement_id is distinct from old.commission_settlement_id) then
    raise exception 'GASTO_DE_LIQUIDACION: el monto y la fecha los fija la liquidacion de comisiones.'
      using errcode = '42501';
  end if;

  if old.cash_movement_id is not null
     and (new.amount is distinct from old.amount
          or new.expense_date is distinct from old.expense_date
          or new.cash_movement_id is distinct from old.cash_movement_id) then
    raise exception 'GASTO_DE_RETIRO: el monto y la fecha los fija el retiro de caja. Solo puedes cambiar la descripcion y la categoria.'
      using errcode = '42501';
  end if;

  if v_from_client
     and ((old.commission_settlement_id is null and new.commission_settlement_id is not null)
          or (old.cash_movement_id is null and new.cash_movement_id is not null)) then
    raise exception 'GASTO_VINCULADO: un gasto de liquidacion o de retiro de caja solo lo crea el sistema.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists expenses_guard_commission on public.expenses;
create trigger expenses_guard_commission
  before insert or update or delete on public.expenses
  for each row execute function public.guard_commission_expense();

create or replace function public.prevent_delete_cash_expense()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if old.cash_movement_id is not null then
    raise exception 'Este gasto viene de un retiro de caja y no se puede eliminar. Corrígelo desde el turno.';
  end if;
  return old;
end;
$function$;
