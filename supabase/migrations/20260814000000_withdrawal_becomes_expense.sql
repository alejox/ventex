-- Un retiro de caja puede llegar al estado de resultados.
--
-- HUECO QUE CIERRA: hasta ahora el retiro descontaba del arqueo
-- (expected := opening_cash + cash_total - withdrawal_total) y moria ahi. Si el
-- cajero sacaba plata para comprar hielo, la caja cuadraba y el gasto no existia
-- en ningun reporte.
--
-- PRINCIPIO: un solo acto en el mostrador, dos consecuencias separadas. El
-- retiro sigue siendo lo unico que cuadra la caja; el gasto es una PROYECCION
-- contable de ese mismo movimiento, no un segundo movimiento. La formula del
-- arqueo NO se toca.

-- 1. Que se hizo con la plata.
--
-- 'traslado' es el default a proposito: mover plata de lugar (a la caja fuerte,
-- al banco) no es una perdida, y contarla como gasto inventaria numeros rojos
-- que no existen. Solo 'gasto' genera el registro contable.
alter table public.cash_movements
  add column if not exists kind text not null default 'traslado';

alter table public.cash_movements drop constraint if exists cash_movements_kind_check;
alter table public.cash_movements
  add constraint cash_movements_kind_check check (kind in ('gasto', 'traslado'));

-- 2. El vinculo, del lado del gasto.
--
-- Va aca y no en cash_movements por tres razones: la vista de Gastos necesita
-- saber el ORIGEN de cada fila (nacio en el mostrador si esto no es null), da
-- trazabilidad hacia el turno y el cajero, y el UNIQUE garantiza que un
-- reintento del RPC no cree dos gastos del mismo retiro.
alter table public.expenses
  add column if not exists cash_movement_id uuid;

alter table public.expenses drop constraint if exists expenses_cash_movement_id_fkey;
alter table public.expenses
  add constraint expenses_cash_movement_id_fkey
  foreign key (cash_movement_id) references public.cash_movements(id) on delete restrict;

create unique index if not exists expenses_cash_movement_id_key
  on public.expenses (cash_movement_id) where cash_movement_id is not null;

-- 3. Categoria sembrada para lo que sale de la caja.
--
-- El cajero ELIGE de las categorias activas; no crea ni edita desde el
-- mostrador. Esta es el valor por defecto de esa lista. Solo para perfiles
-- dueños: los workers resuelven al tenant del dueño via get_effective_user_id().
insert into public.expense_categories (user_id, name, description, color, is_default)
select p.id, 'Caja', 'Salidas de efectivo registradas en el punto de venta', '#f59e0b', false
from public.profiles p
where coalesce(p.is_worker, false) is not true
  and not exists (
    select 1 from public.expense_categories c
    where c.user_id = p.id and lower(trim(c.name)) = 'caja'
  );

-- 4. Un gasto nacido de un retiro no se borra.
--
-- Es la contracara de plata que salio FISICAMENTE del cajon y quedo registrada
-- contra un turno y un cajero. Borrarlo rompe la cadena que sostiene el arqueo.
-- Recategorizar y editar la descripcion si se puede: eso no altera el monto ni
-- el vinculo.
create or replace function public.prevent_delete_cash_expense()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.cash_movement_id is not null then
    raise exception 'Este gasto viene de un retiro de caja y no se puede eliminar. Corregilo desde el turno.';
  end if;
  return old;
end;
$$;
revoke execute on function public.prevent_delete_cash_expense() from public, anon;
grant execute on function public.prevent_delete_cash_expense() to authenticated, service_role;

drop trigger if exists prevent_delete_cash_expense on public.expenses;
create trigger prevent_delete_cash_expense before delete on public.expenses
  for each row execute function public.prevent_delete_cash_expense();

-- 5. El RPC, con el destino de la plata.
--
-- OJO: `create or replace` con una firma DISTINTA no reemplaza nada, crea una
-- funcion nueva. La vieja de 2 argumentos hay que dropearla explicitamente o
-- queda conviviendo como sobrecarga, y es una trampa: es la version que nunca
-- crea el gasto. Se dropea al final, DESPUES de crear la nueva, que con sus
-- defaults cubre por si sola las llamadas de dos argumentos.
create or replace function public.register_cash_withdrawal(
  p_amount numeric,
  p_reason text,
  p_kind text default 'traslado',
  p_category uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace uuid := public.get_effective_user_id();
  membership_id uuid := public.get_active_membership_id();
  active_shift public.shifts;
  movement_id uuid;
  kind text := coalesce(nullif(trim(p_kind), ''), 'traslado');
  category_id uuid;
  local_day date;
begin
  if workspace is null or membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;
  if not public.worker_can('pos') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El retiro debe ser mayor a cero';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo del retiro es obligatorio';
  end if;
  if kind not in ('gasto', 'traslado') then
    raise exception 'Destino de retiro invalido: %', kind;
  end if;

  select * into active_shift
  from public.shifts shift_row
  where shift_row.user_id = workspace
    and shift_row.membership_id = membership_id
    and shift_row.status = 'open'
  for update;

  if not found then
    raise exception 'No tienes un turno abierto';
  end if;

  insert into public.cash_movements (
    amount,
    reason,
    kind,
    shift_id,
    user_id,
    worker_id,
    membership_id
  )
  values (
    p_amount,
    trim(p_reason),
    kind,
    active_shift.id,
    workspace,
    auth.uid(),
    membership_id
  )
  returning id into movement_id;

  -- El gasto va en la MISMA transaccion: o quedan los dos registros, o ninguno.
  if kind = 'gasto' then
    -- La categoria elegida tiene que ser del mismo negocio y estar activa. Si no
    -- vino ninguna, o vino una ajena, cae en la de por defecto ("Otros").
    select c.id into category_id
    from public.expense_categories c
    where c.id = p_category and c.user_id = workspace and c.is_active;

    if category_id is null then
      select c.id into category_id
      from public.expense_categories c
      where c.user_id = workspace and c.is_default
      limit 1;
    end if;

    -- El dia del mostrador, no el de Greenwich: expense_date es una columna
    -- `date` y un retiro de las 8 de la noche en Bogota ya es del dia siguiente
    -- en UTC. Sin sitio configurado cae en America/Bogota.
    select (now() at time zone coalesce(
             (select s.timezone from public.business_sites s where s.user_id = workspace limit 1),
             'America/Bogota'
           ))::date
      into local_day;

    insert into public.expenses (
      user_id,
      description,
      amount,
      expense_date,
      category_id,
      cash_movement_id
    )
    values (
      workspace,
      trim(p_reason),
      p_amount,
      local_day,
      category_id,
      movement_id
    );
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    severity,
    data
  )
  values (
    workspace,
    'cash_withdrawal',
    'Retiro de caja',
    format('Se retiraron %s de la caja: %s', p_amount, trim(p_reason)),
    'info',
    jsonb_build_object(
      'shift_id', active_shift.id,
      'membership_id', membership_id,
      'cash_movement_id', movement_id,
      'amount', p_amount,
      'kind', kind
    )
  );

  return movement_id;
end;
$$;

revoke execute on function public.register_cash_withdrawal(numeric, text, text, uuid) from public, anon;
grant execute on function public.register_cash_withdrawal(numeric, text, text, uuid) to authenticated;

-- La sobrecarga vieja se va: nunca creaba el gasto (ver la nota del punto 5).
drop function if exists public.register_cash_withdrawal(numeric, text);
