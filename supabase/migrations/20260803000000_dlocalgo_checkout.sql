-- Migración del cobro online de dLocal Payins/Direct a dLocal **Go**.
--
-- Qué cambia en el modelo:
--  * El medio de pago YA NO se elige en Ventex: el checkout de dLocal Go es
--    hosteado y el pagador elige allá (Nequi, PSE, tarjeta, efectivo). Por eso
--    `method` deja de ser un enum ('nequi','card') y pasa a guardar lo que
--    dLocal reporte, con 'checkout' como valor inicial mientras no se sepa.
--  * La renovación se cobra con el `merchant_checkout_token` del primer pago,
--    que reemplaza al enrollment de Nequi y al card_id de Payins. Se guarda en
--    `billing_orders.checkout_token` y se copia a
--    `subscriptions.billing_provider_ref` al acreditar.
--  * El próximo cobro se agenda al FIN del periodo pagado, no a "hoy + 30 días":
--    quien renueva antes de vencer no puede perder los días que le quedaban.

-- 1. Nuevas columnas del flujo dLocal Go.
alter table public.billing_orders
  add column if not exists checkout_token text,
  add column if not exists payment_method_type text;

comment on column public.billing_orders.checkout_token is
  'merchant_checkout_token de dLocal Go: reusable para cobrar la renovación';
comment on column public.billing_orders.payment_method_type is
  'Medio con el que se pagó, informado por dLocal Go (CREDIT_CARD, BANK_TRANSFER, …)';

-- 2. `method` deja de ser un enum cerrado.
alter table public.billing_orders
  drop constraint if exists billing_orders_method_check;

alter table public.billing_orders
  alter column method set default 'checkout';

-- 3. El webhook resuelve la orden por el id de pago de dLocal: la notificación
--    trae `payment_id` y nada más.
create index if not exists billing_orders_payment_id_idx
  on public.billing_orders (dlocal_payment_id);

-- 4. Agenda de cobro compartida por las dos funciones de acreditación.
--    Devuelve el fin de periodo y deja `billing_recurring` /
--    `billing_next_charge_at` consistentes con lo que realmente se puede cobrar:
--    sin token reusable no hay recurrencia posible, y sólo el plan de 1 mes se
--    renueva solo.
create or replace function public.sync_billing_schedule(
  p_user_id uuid,
  p_months int
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_period_end timestamptz;
  v_ref text;
  v_recurring boolean;
begin
  select s.current_period_end, s.billing_provider_ref
    into v_period_end, v_ref
    from public.subscriptions s
   where s.user_id = p_user_id;

  v_recurring := p_months = 1 and v_ref is not null;

  update public.subscriptions s
     set billing_recurring      = v_recurring,
         billing_next_charge_at = case when v_recurring then v_period_end else null end
   where s.user_id = p_user_id;

  return v_period_end;
end; $$;

revoke execute on function public.sync_billing_schedule(uuid, int) from public, anon, authenticated;

-- 5. apply_billing_charge v3: `billing_provider_ref` toma el checkout_token.
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
   where b.id = p_order_id
     and (p_user_id is null or b.user_id = p_user_id)
     and b.status = 'pending'
  returning * into v_order;

  if v_order.id is null then
    return jsonb_build_object('applied', false);
  end if;

  -- Invitado sin cuenta: el pago queda acreditado y la licencia se activa
  -- cuando reclame la orden al registrarse (claim_guest_orders).
  if p_user_id is null then
    return jsonb_build_object('applied', true, 'guest', true,
                              'months', v_order.period_months, 'plan_id', v_order.plan_id);
  end if;

  -- Una licencia de revendedor manda sobre el cobro online: el revendedor la
  -- recarga con créditos, así que acá no se agenda ninguna recurrencia.
  if exists (select 1 from public.client_licenses cl where cl.user_id = p_user_id) then
    update public.client_licenses cl
       set status       = 'active',
           activated_at = coalesce(cl.activated_at, now()),
           period_end   = greatest(coalesce(cl.period_end, now()), now())
                          + make_interval(months => v_order.period_months),
           updated_at   = now()
     where cl.user_id = p_user_id
    returning cl.period_end into v_new_end;

    update public.subscriptions s
       set billing_recurring = false, billing_next_charge_at = null
     where s.user_id = p_user_id;
  else
    insert into public.subscriptions (
      user_id, plan_id, status, started_at, current_period_end,
      billing_provider, billing_provider_ref,
      billing_payer_name, billing_payer_document, billing_payer_phone, billing_payer_email,
      billing_last_charge_at, billing_error
    ) values (
      p_user_id, v_order.plan_id, 'active', now(),
      now() + make_interval(months => v_order.period_months),
      'dlocalgo', v_order.checkout_token,
      v_order.payer_name, v_order.payer_document, v_order.payer_phone, v_order.payer_email,
      now(), null
    )
    on conflict (user_id) do update set
      plan_id            = excluded.plan_id,
      status             = 'active',
      current_period_end = greatest(coalesce(subscriptions.current_period_end, now()), now())
                           + make_interval(months => v_order.period_months),
      billing_provider   = 'dlocalgo',
      -- El token solo se reemplaza si esta orden trajo uno nuevo: una renovación
      -- sin token no puede borrar el medio de cobro que ya funcionaba.
      billing_provider_ref = coalesce(excluded.billing_provider_ref, subscriptions.billing_provider_ref),
      billing_payer_name     = coalesce(excluded.billing_payer_name, subscriptions.billing_payer_name),
      billing_payer_document = coalesce(excluded.billing_payer_document, subscriptions.billing_payer_document),
      billing_payer_phone    = coalesce(excluded.billing_payer_phone, subscriptions.billing_payer_phone),
      billing_payer_email    = coalesce(excluded.billing_payer_email, subscriptions.billing_payer_email),
      billing_last_charge_at = now(),
      billing_error      = null,
      updated_at         = now();

    v_new_end := public.sync_billing_schedule(p_user_id, v_order.period_months);
  end if;

  return jsonb_build_object('applied', true, 'period_end', v_new_end,
                            'months', v_order.period_months, 'plan_id', v_order.plan_id);
end; $$;

-- 6. claim_guest_orders v2: mismo cambio de `billing_provider_ref`.
create or replace function public.claim_guest_orders(
  p_email text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid           uuid := auth.uid();
  v_session_email text;
  v_order         public.billing_orders%rowtype;
  v_claimed       int := 0;
  v_activated     int := 0;
  v_new_end       timestamptz;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select lower(trim(u.email)) into v_session_email
    from auth.users u
   where u.id = v_uid;

  -- Sin correo en la sesión no hay nada que comparar: cortar antes de que
  -- `is distinct from` deje pasar un null contra un null.
  if v_session_email is null
     or v_session_email is distinct from lower(trim(p_email)) then
    raise exception 'El correo no coincide con la sesión';
  end if;

  for v_order in
    select *
      from public.billing_orders b
     where b.guest_email = v_session_email
       and b.user_id is null
       and b.status in ('pending', 'paid')
     order by b.created_at, b.id
    for update
  loop
    update public.billing_orders
       set user_id = v_uid, updated_at = now()
     where id = v_order.id;

    v_claimed := v_claimed + 1;

    -- Las pendientes se activan solas: ya quedaron con user_id, así que el
    -- webhook de dLocal las acredita cuando confirme el pago.
    if v_order.status <> 'paid' then
      continue;
    end if;

    if exists (select 1 from public.client_licenses cl where cl.user_id = v_uid) then
      update public.client_licenses cl
         set status       = 'active',
             activated_at = coalesce(cl.activated_at, now()),
             period_end   = greatest(coalesce(cl.period_end, now()), now())
                            + make_interval(months => v_order.period_months),
             updated_at   = now()
       where cl.user_id = v_uid
      returning cl.period_end into v_new_end;

      update public.subscriptions s
         set billing_recurring = false, billing_next_charge_at = null
       where s.user_id = v_uid;
    else
      insert into public.subscriptions (
        user_id, plan_id, status, started_at, current_period_end,
        billing_provider, billing_provider_ref,
        billing_payer_name, billing_payer_document, billing_payer_phone, billing_payer_email,
        billing_last_charge_at, billing_error
      ) values (
        v_uid, v_order.plan_id, 'active', now(),
        now() + make_interval(months => v_order.period_months),
        'dlocalgo', v_order.checkout_token,
        v_order.payer_name, v_order.payer_document, v_order.payer_phone, v_order.payer_email,
        now(), null
      )
      on conflict (user_id) do update set
        plan_id              = excluded.plan_id,
        status               = 'active',
        current_period_end   = greatest(coalesce(subscriptions.current_period_end, now()), now())
                               + make_interval(months => v_order.period_months),
        billing_provider     = 'dlocalgo',
        billing_provider_ref = coalesce(excluded.billing_provider_ref, subscriptions.billing_provider_ref),
        billing_payer_name     = coalesce(excluded.billing_payer_name, subscriptions.billing_payer_name),
        billing_payer_document = coalesce(excluded.billing_payer_document, subscriptions.billing_payer_document),
        billing_payer_phone    = coalesce(excluded.billing_payer_phone, subscriptions.billing_payer_phone),
        billing_payer_email    = coalesce(excluded.billing_payer_email, subscriptions.billing_payer_email),
        billing_last_charge_at = now(),
        billing_error        = null,
        updated_at           = now();

      v_new_end := public.sync_billing_schedule(v_uid, v_order.period_months);
    end if;

    v_activated := v_activated + 1;
  end loop;

  return jsonb_build_object(
    'claimed',   v_claimed,
    'activated', v_activated,
    'period_end', v_new_end
  );
end; $$;

-- 7. Grants: apply_billing_charge solo servidor; el claim lo corre el usuario
--    autenticado con su propia sesión (verifica que el correo coincida).
revoke execute on function public.apply_billing_charge(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.claim_guest_orders(text) from public, anon;
grant execute on function public.claim_guest_orders(text) to authenticated;

-- 8. Apagar la recurrencia de quien ya tiene licencia de revendedor y de quien
--    quedó marcado como recurrente sin un token con el que cobrar (era el caso
--    del invitado que pagaba con tarjeta en el flujo anterior).
update public.subscriptions s
   set billing_recurring = false,
       billing_next_charge_at = null
 where s.billing_recurring
   and (
     s.billing_provider_ref is null
     or exists (select 1 from public.client_licenses cl where cl.user_id = s.user_id)
   );
