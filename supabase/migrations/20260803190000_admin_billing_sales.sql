-- Ventas de la PLATAFORMA para el panel de super admin: las cuentas vendidas
-- por la pasarela (dLocal Go), no las ventas del POS de cada empresa.
--
-- Se llaman `admin_billing_*` justamente para no confundirlas con `public.sales`,
-- que es el POS del inquilino y ya vive en `admin_stats` como GMV.
--
-- Fuera de alcance a propósito: las recargas que hace un revendedor con
-- créditos. Ésas no pasan por la pasarela — no entra plata por acá — y tienen su
-- propio ledger en `admin_credit_movements`.
--
-- Autorización: igual que el resto del panel, `is_super_admin()` se verifica
-- DENTRO de la función. El guard del layout es la primera capa; ésta es la que
-- vale, porque una RPC SECURITY DEFINER se puede llamar sin pasar por la UI.

-- ---------------------------------------------------------------------------
-- 1. Detalle: una fila por orden de cobro.
-- ---------------------------------------------------------------------------
create or replace function public.admin_billing_sales(p_limit integer default 200)
returns table(
  id uuid,
  order_id text,
  status text,
  amount numeric,
  currency text,
  plan_id text,
  period_name text,
  period_months integer,
  payment_method_type text,
  payer_name text,
  contact_email text,
  company_id uuid,
  company_name text,
  is_guest boolean,
  created_at timestamptz,
  paid_at timestamptz,
  error text
)
language sql
stable
security definer
set search_path to ''
as $$
  select bo.id,
         bo.order_id,
         bo.status,
         bo.amount,
         bo.currency,
         bo.plan_id,
         bo.period_name,
         bo.period_months,
         bo.payment_method_type,
         bo.payer_name,
         -- Un pago de invitado todavía no tiene cuenta: su único contacto es el
         -- correo con el que pagó.
         coalesce(u.email::text, bo.payer_email, bo.guest_email),
         bo.user_id,
         coalesce(nullif(btrim(pr.business_name), ''), pr.full_name),
         bo.user_id is null,
         bo.created_at,
         bo.paid_at,
         bo.error
  from public.billing_orders bo
  left join public.profiles pr on pr.id = bo.user_id
  left join auth.users u on u.id = bo.user_id
  where public.is_super_admin()
  -- Las pagadas se ordenan por cuándo entró la plata; las que nunca se pagaron
  -- no tienen `paid_at` y caen por su fecha de creación.
  order by coalesce(bo.paid_at, bo.created_at) desc
  limit least(coalesce(p_limit, 200), 1000);
$$;

-- ---------------------------------------------------------------------------
-- 2. Totales.
--
-- Los importes se suman sin separar por moneda porque hoy la pasarela cobra
-- todo en COP. Si algún día se vende en otra, esto tiene que pasar a un desglose
-- por moneda: sumar pesos con dólares daría un número que parece bien y no lo es.
-- ---------------------------------------------------------------------------
create or replace function public.admin_billing_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v jsonb;
begin
  if not public.is_super_admin() then raise exception 'No autorizado'; end if;

  select jsonb_build_object(
    'gross_total',    (select coalesce(sum(amount), 0) from public.billing_orders where status = 'paid'),
    'gross_month',    (select coalesce(sum(amount), 0) from public.billing_orders
                       where status = 'paid' and paid_at >= date_trunc('month', now())),
    'gross_prev_month', (select coalesce(sum(amount), 0) from public.billing_orders
                       where status = 'paid'
                         and paid_at >= date_trunc('month', now()) - interval '1 month'
                         and paid_at <  date_trunc('month', now())),
    'sold_total',     (select count(*) from public.billing_orders where status = 'paid'),
    'sold_month',     (select count(*) from public.billing_orders
                       where status = 'paid' and paid_at >= date_trunc('month', now())),
    'pending',        (select count(*) from public.billing_orders where status = 'pending'),
    -- Sólo los últimos 30 días: un rechazo de hace medio año no dice nada del
    -- estado de hoy.
    'failed_30d',     (select count(*) from public.billing_orders
                       where status in ('failed', 'cancelled') and created_at >= now() - interval '30 days'),
    -- Pagos de invitado cobrados que todavía no reclamó nadie: plata cobrada sin
    -- cuenta detrás, y es lo único de esta pantalla que exige una acción.
    'unclaimed',      (select count(*) from public.billing_orders
                       where status = 'paid' and user_id is null),
    'by_plan',        (select coalesce(jsonb_object_agg(plan_id, item), '{}'::jsonb) from (
                         select plan_id,
                                jsonb_build_object('sold', count(*), 'gross', coalesce(sum(amount), 0)) as item
                         from public.billing_orders
                         where status = 'paid'
                         group by plan_id) t),
    'by_method',      (select coalesce(jsonb_object_agg(method_type, cnt), '{}'::jsonb) from (
                         select coalesce(payment_method_type, 'OTRO') as method_type, count(*) as cnt
                         from public.billing_orders
                         where status = 'paid'
                         group by 1) t)
  ) into v;

  return v;
end;
$$;
