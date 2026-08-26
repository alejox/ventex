-- Fiado: cerrar los tres agujeros por los que la deuda dejaba de cuadrar.
--
-- Vender fiado ya funcionaba (`create_sale` sube `customers.credit_balance` y
-- valida el cupo), pero la deuda solo era correcta en el camino feliz. Medido
-- en la base antes de esta migración: 0 ventas fiadas registradas, así que no
-- hay saldos que reconstruir — se arregla la mecánica, no el histórico.
--
-- 1) El abono se escribía en DOS llamadas desde el navegador: primero el
--    INSERT en `customer_payments`, después el RPC que baja el saldo. Si la
--    segunda no salía, quedaba un abono registrado que nunca descontó nada.
-- 2) Un pago DIVIDIDO con parte fiada no sumaba deuda: `create_sale` mira
--    `v_effective_payment`, que en un split vale 'split' y nunca 'credito'.
--    Mitad en efectivo y mitad fiado se llevaba la mercadería gratis.
-- 3) Anular una venta fiada NO devolvía la deuda: `void_sale` devuelve stock y
--    efectivo, pero jamás tocó `credit_balance`.
--
-- (2) y (3) se resuelven con TRIGGERS y no editando `create_sale`/`void_sale`.
-- Es la misma decisión que se tomó con el contador de cortes, y por el mismo
-- motivo: `create_sale` cobra, descuenta stock, congela comisiones y valida
-- turnos — reescribirla entera para sumarle una línea de fiado es arriesgar una
-- venta por una cuenta por cobrar. Los triggers son aditivos.

-- ---------------------------------------------------------------------------
-- 1) El abono es UNA transacción
-- ---------------------------------------------------------------------------

-- La firma vieja de 2 argumentos se va: mientras exista, alguien puede bajar el
-- saldo sin dejar el abono asentado, que es exactamente el bug que se cierra.
drop function if exists public.register_customer_payment(uuid, numeric);

create or replace function public.register_customer_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_notes text default null
)
returns numeric
language plpgsql
security definer
set search_path to ''
as $$
declare
  caller uuid := auth.uid();
  workspace uuid := public.get_effective_user_id();
  membership_id uuid := public.get_active_membership_id();
  current_balance numeric;
  new_balance numeric;
begin
  if caller is null or workspace is null or membership_id is null then
    raise exception 'WORKSPACE_SELECTION_REQUIRED' using errcode = '42501';
  end if;
  -- Mismo permiso que exige la RLS de `customer_payments`: cobrar un fiado es
  -- atender la cuenta de un cliente, no liquidar plata del negocio.
  if not public.worker_can('customers') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El abono debe ser mayor que cero';
  end if;

  -- FOR UPDATE: dos cobros simultáneos al mismo cliente leerían el mismo saldo
  -- y el segundo pisaría al primero, perdiendo un abono entero.
  select customer.credit_balance into current_balance
  from public.customers customer
  where customer.id = p_customer_id
    and customer.user_id = workspace
  for update;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  -- Cobrar más de lo que debe se RECHAZA en vez de recortarse. El
  -- `greatest(..., 0)` de antes evitaba el saldo negativo, pero dejaba en
  -- `customer_payments` un monto distinto del que bajó del saldo: el historial
  -- y la cuenta dejaban de dar lo mismo, y ese es el único par de números que
  -- esta pantalla tiene para controlarse a sí misma.
  if p_amount > coalesce(current_balance, 0) then
    raise exception 'ABONO_EXCEDE_DEUDA: el abono ($%) supera la deuda ($%)',
      p_amount, coalesce(current_balance, 0);
  end if;

  insert into public.customer_payments (customer_id, amount, notes, user_id)
  values (p_customer_id, p_amount, nullif(btrim(coalesce(p_notes, '')), ''), workspace);

  update public.customers customer
  set credit_balance = coalesce(customer.credit_balance, 0) - p_amount
  where customer.id = p_customer_id
    and customer.user_id = workspace
  returning customer.credit_balance into new_balance;

  -- El saldo nuevo lo devuelve la base y no lo calcula el navegador: restar del
  -- lado del cliente es apostar a que nadie más cobró en el medio.
  return new_balance;
end;
$$;

grant execute on function public.register_customer_payment(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) El fiado que viaja dentro de un pago dividido
-- ---------------------------------------------------------------------------

create or replace function public.credit_apply_split_payment()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  sale_row record;
  customer_row record;
begin
  if new.payment_method <> 'credito' then
    return new;
  end if;

  select sale.payment_method, sale.customer_id, sale.user_id
  into sale_row
  from public.sales sale
  where sale.id = new.sale_id;

  if not found then
    return new;
  end if;

  -- El fiado PURO ya lo sumó `create_sale`, y esa misma venta deja también su
  -- fila en `sale_payments`. Sin este corte la deuda se contaría dos veces.
  if sale_row.payment_method <> 'split' then
    return new;
  end if;

  -- Fiarle a nadie es una deuda que no se puede cobrar. `create_sale` ya lo
  -- exige para el fiado puro; el split entraba sin pasar por ese control.
  if sale_row.customer_id is null then
    raise exception 'CREDITO_SIN_CLIENTE: un pago a crédito necesita un cliente asignado';
  end if;

  select customer.credit_limit, customer.credit_balance
  into customer_row
  from public.customers customer
  where customer.id = sale_row.customer_id
    and customer.user_id = sale_row.user_id
  for update;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  if customer_row.credit_limit is not null
     and (coalesce(customer_row.credit_balance, 0) + new.amount) > customer_row.credit_limit then
    raise exception 'El cliente excede su cupo de crédito ($%)', customer_row.credit_limit;
  end if;

  update public.customers customer
  set credit_balance = coalesce(customer.credit_balance, 0) + new.amount
  where customer.id = sale_row.customer_id
    and customer.user_id = sale_row.user_id;

  return new;
end;
$$;

drop trigger if exists sale_payments_apply_credit on public.sale_payments;
create trigger sale_payments_apply_credit
  after insert on public.sale_payments
  for each row
  execute function public.credit_apply_split_payment();

-- ---------------------------------------------------------------------------
-- 3) Anular una venta fiada devuelve la deuda
-- ---------------------------------------------------------------------------

create or replace function public.credit_release_voided_sale()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  credit_amount numeric := 0;
begin
  if new.customer_id is null then
    return new;
  end if;

  if new.payment_method = 'credito' then
    credit_amount := coalesce(new.total, 0);
  elsif new.payment_method = 'split' then
    select coalesce(sum(payment.amount), 0)
    into credit_amount
    from public.sale_payments payment
    where payment.sale_id = new.id
      and payment.user_id = new.user_id
      and payment.payment_method = 'credito';
  end if;

  if credit_amount <= 0 then
    return new;
  end if;

  -- `greatest(..., 0)` mantiene la convención de la columna (el saldo nunca es
  -- negativo). Tiene un borde conocido: si el cliente ya había abonado parte de
  -- una venta que después se anula, ese excedente no queda como plata a favor.
  -- Registrar saldos a favor es otro modelo —y otra pantalla—; acá se elige no
  -- inventarlo en silencio.
  update public.customers customer
  set credit_balance = greatest(coalesce(customer.credit_balance, 0) - credit_amount, 0)
  where customer.id = new.customer_id
    and customer.user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists sales_release_credit_on_void on public.sales;
create trigger sales_release_credit_on_void
  after update of status on public.sales
  for each row
  when (old.status = 'completed' and new.status = 'void')
  execute function public.credit_release_voided_sale();

-- ---------------------------------------------------------------------------
-- 4) Lo que la pantalla de Créditos necesita leer
-- ---------------------------------------------------------------------------

-- Los deudores se filtran por `credit_balance > 0` sobre una tabla que ya se
-- recorre entera por otras pantallas; el índice parcial deja esa consulta en
-- las pocas filas que importan en vez de escanear toda la cartera.
create index if not exists customers_with_debt_idx
  on public.customers (user_id, credit_balance desc)
  where credit_balance > 0;

-- El historial de abonos se lee siempre por cliente y en orden cronológico.
create index if not exists customer_payments_by_customer_idx
  on public.customer_payments (user_id, customer_id, created_at desc);
