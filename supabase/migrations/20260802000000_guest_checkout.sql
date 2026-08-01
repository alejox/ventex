-- Checkout de invitado: un visitante de la landing paga sin cuenta; al
-- registrarse reclama su pago y la licencia se activa.

-- 1. La orden puede existir sin usuario (pago de invitado).
alter table public.billing_orders
  alter column user_id drop not null;

alter table public.billing_orders
  add column if not exists guest_email text;

create index if not exists billing_orders_guest_email_idx
  on public.billing_orders (guest_email, status);

-- 2. apply_billing_charge v2:
--    - p_user_id null (invitado): solo marca la orden como pagada, la
--      activación de la licencia ocurre al reclamar (claim_guest_orders).
--    - p_user_id presente sin fila de subscriptions: la crea (antes el update
--      no hacía nada y el pago quedaba acreditado sin licencia).
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

  if p_user_id is null then
    return jsonb_build_object('applied', true, 'guest', true, 'months', v_order.period_months, 'plan_id', v_order.plan_id);
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
    insert into public.subscriptions (
      user_id, plan_id, status, started_at, current_period_end,
      billing_provider, billing_provider_ref, billing_recurring, billing_next_charge_at,
      billing_payer_name, billing_payer_document, billing_payer_phone, billing_payer_email,
      billing_last_charge_at, billing_error
    ) values (
      p_user_id, v_order.plan_id, 'active', now(),
      now() + make_interval(months => v_order.period_months),
      v_order.method, coalesce(v_order.dlocal_enrollment_id, v_order.card_id),
      v_order.period_months = 1,
      case when v_order.period_months = 1 then now() + interval '30 days' else null end,
      v_order.payer_name, v_order.payer_document, v_order.payer_phone, v_order.payer_email,
      now(), null
    )
    on conflict (user_id) do update set
      plan_id            = excluded.plan_id,
      status             = 'active',
      current_period_end = greatest(coalesce(subscriptions.current_period_end, now()), now())
                           + make_interval(months => v_order.period_months),
      billing_last_charge_at = now(),
      billing_error      = null,
      updated_at         = now()
    returning current_period_end into v_new_end;
  end if;

  return jsonb_build_object('applied', true, 'period_end', v_new_end, 'months', v_order.period_months, 'plan_id', v_order.plan_id);
end; $$;

-- 3. Reclamo de pagos de invitado: ata las órdenes del correo a la sesión y
--    activa las licencias de las ya pagadas. Idempotente (solo toma órdenes
--    con user_id null). Las pendientes se activan solas cuando llega el
--    webhook de dLocal, porque ya quedaron con user_id.
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

  if v_session_email is distinct from lower(trim(p_email)) then
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
    else
      insert into public.subscriptions (
        user_id, plan_id, status, started_at, current_period_end,
        billing_provider, billing_provider_ref, billing_recurring, billing_next_charge_at,
        billing_payer_name, billing_payer_document, billing_payer_phone, billing_payer_email,
        billing_last_charge_at, billing_error
      ) values (
        v_uid, v_order.plan_id, 'active', now(),
        now() + make_interval(months => v_order.period_months),
        v_order.method, coalesce(v_order.dlocal_enrollment_id, v_order.card_id),
        v_order.period_months = 1,
        case when v_order.period_months = 1 then now() + interval '30 days' else null end,
        v_order.payer_name, v_order.payer_document, v_order.payer_phone, v_order.payer_email,
        now(), null
      )
      on conflict (user_id) do update set
        plan_id              = excluded.plan_id,
        status               = 'active',
        current_period_end   = greatest(coalesce(subscriptions.current_period_end, now()), now())
                               + make_interval(months => v_order.period_months),
        billing_provider     = excluded.billing_provider,
        billing_provider_ref = excluded.billing_provider_ref,
        billing_recurring    = excluded.billing_recurring,
        billing_next_charge_at = excluded.billing_next_charge_at,
        billing_payer_name   = excluded.billing_payer_name,
        billing_payer_document = excluded.billing_payer_document,
        billing_payer_phone  = excluded.billing_payer_phone,
        billing_payer_email  = excluded.billing_payer_email,
        billing_last_charge_at = now(),
        billing_error        = null,
        updated_at           = now()
      returning current_period_end into v_new_end;
    end if;

    v_activated := v_activated + 1;
  end loop;

  return jsonb_build_object(
    'claimed',   v_claimed,
    'activated', v_activated,
    'period_end', v_new_end
  );
end; $$;

-- Solo lo invoca el servidor (service role), como apply_billing_charge.
revoke execute on function public.apply_billing_charge(uuid, uuid) from public, anon, authenticated;

-- El claim lo ejecuta el usuario autenticado con su propia sesión (verifica
-- que el correo coincida), nunca anónimo.
revoke execute on function public.claim_guest_orders(text) from public, anon;
grant execute on function public.claim_guest_orders(text) to authenticated;
