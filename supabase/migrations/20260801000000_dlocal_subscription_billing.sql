-- dLocal subscription billing: Nequi (enrollment) + Tarjeta (card_id) payments

-- 1. Campos de facturación en subscriptions
alter table public.subscriptions
  add column if not exists billing_provider text,
  add column if not exists billing_provider_ref text,
  add column if not exists billing_network_reference text,
  add column if not exists billing_transaction_link_id text,
  add column if not exists billing_card_last4 text,
  add column if not exists billing_card_brand text,
  add column if not exists billing_payer_name text,
  add column if not exists billing_payer_document text,
  add column if not exists billing_payer_phone text,
  add column if not exists billing_payer_email text,
  add column if not exists billing_recurring boolean not null default false,
  add column if not exists billing_next_charge_at timestamptz,
  add column if not exists billing_last_charge_at timestamptz,
  add column if not exists billing_error text;

comment on column public.subscriptions.billing_provider is 'Proveedor de cobro online: nequi | card | null';
comment on column public.subscriptions.billing_provider_ref is 'Enrollment ID (nequi) o card_id (tarjeta) en dLocal';
comment on column public.subscriptions.billing_network_reference is 'network_tx_reference del primer cobro (requerido en MITs de tarjeta)';
comment on column public.subscriptions.billing_transaction_link_id is 'TLID de Mastercard (obligatorio en MITs desde 2026-10-23)';
comment on column public.subscriptions.billing_recurring is 'true = cobro automático mensual (plan Mensual)';

-- 2. Órdenes de facturación (una por pago solicitado a dLocal)
create table if not exists public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  user_id uuid not null,
  plan_id text not null references public.plans(id),
  plan_period_id uuid not null references public.plan_periods(id),
  period_name text not null,
  period_months int not null check (period_months between 1 and 60),
  amount numeric not null check (amount >= 0),
  currency text not null default 'COP',
  method text not null check (method in ('nequi','card')),
  status text not null default 'pending' check (status in ('pending','paid','failed','cancelled')),
  dlocal_payment_id text,
  dlocal_enrollment_id text,
  card_id text,
  payer_name text,
  payer_document text,
  payer_phone text,
  payer_email text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists billing_orders_user_idx on public.billing_orders (user_id, created_at desc);
create index if not exists billing_orders_status_idx on public.billing_orders (status);

alter table public.billing_orders enable row level security;

create policy "billing_orders_select_own"
  on public.billing_orders for select
  to authenticated
  using (user_id = public.get_effective_user_id());

-- 3. Aplica un cobro confirmado (idempotente; solo la invoca el servidor)
create or replace function public.apply_billing_charge(
  p_order_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order   public.billing_orders%rowtype;
  v_new_end timestamptz;
begin
  update public.billing_orders b
     set status = 'paid', paid_at = coalesce(b.paid_at, now()), updated_at = now(), error = null
   where b.id = p_order_id and b.user_id = p_user_id and b.status = 'pending'
  returning * into v_order;

  if v_order.id is null then
    return jsonb_build_object('applied', false);
  end if;

  if exists (select 1 from public.client_licenses cl where cl.user_id = p_user_id) then
    update public.client_licenses cl
       set status       = 'active',
           activated_at = coalesce(cl.activated_at, now()),
           period_end   = greatest(coalesce(cl.period_end, now()), now())
                          + make_interval(months => v_order.period_months),
           updated_at   = now()
     where cl.user_id = p_user_id
    returning cl.period_end into v_new_end;
  else
    update public.subscriptions s
       set status             = 'active',
           plan_id            = v_order.plan_id,
           current_period_end = greatest(coalesce(s.current_period_end, now()), now())
                                + make_interval(months => v_order.period_months),
           billing_last_charge_at = now(),
           billing_error      = null,
           updated_at         = now()
     where s.user_id = p_user_id
    returning s.current_period_end into v_new_end;
  end if;

  return jsonb_build_object('applied', true, 'period_end', v_new_end, 'months', v_order.period_months, 'plan_id', v_order.plan_id);
end; $$;

-- No se expone a clientes: solo el servidor (service role) la invoca
revoke execute on function public.apply_billing_charge(uuid, uuid) from public, anon, authenticated;
