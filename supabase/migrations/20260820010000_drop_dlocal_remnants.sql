-- Retiro de dLocal del modelo de cobro.
--
-- Qué se va y por qué:
--  * `dlocal_payment_id`, `dlocal_enrollment_id`, `card_id`: columnas muertas.
--    Ninguna función ni consulta las lee ya; su reemplazo es `epayco_ref`.
--  * `checkout_token`: era el `merchant_checkout_token` reusable con el que
--    dLocal cobraba las renovaciones. ePayco NO entrega nada equivalente —
--    para cobrar de nuevo exige tokenizar la tarjeta— así que la columna no
--    tiene con qué llenarse. Si algún día se implementa el cobro recurrente,
--    la columna que haga falta se agrega con el nombre de lo que guarde, en vez
--    de heredar un nombre que ya significa otra cosa.

-- 1. Las dos funciones dejan de nombrar a dLocal y de leer `checkout_token`.
--    `billing_provider_ref` queda en null: sin token reusable, el efecto
--    coherente es que `sync_billing_schedule` apague la recurrencia sola.
create or replace function public.apply_billing_charge(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_order   public.billing_orders%rowtype;
  v_user    uuid;
  v_new_end timestamptz;
begin
  update public.billing_orders b
     set status = 'paid', paid_at = coalesce(b.paid_at, now()), updated_at = now(), error = null
   where b.id = p_order_id
     and b.status = 'pending'
  returning * into v_order;

  if v_order.id is null then
    return jsonb_build_object('applied', false);
  end if;

  -- El dueño sale de la fila recién actualizada: es el dato más nuevo posible y
  -- no puede contradecir a la orden que se está acreditando.
  v_user := v_order.user_id;

  -- Invitado sin cuenta: el pago queda acreditado y la licencia se activa
  -- cuando reclame la orden al registrarse (claim_guest_orders).
  if v_user is null then
    return jsonb_build_object('applied', true, 'guest', true,
                              'months', v_order.period_months, 'plan_id', v_order.plan_id);
  end if;

  -- Una licencia de revendedor manda sobre el cobro online: el revendedor la
  -- recarga con créditos, así que acá no se agenda ninguna recurrencia.
  if exists (select 1 from public.client_licenses cl where cl.user_id = v_user) then
    update public.client_licenses cl
       set status       = 'active',
           activated_at = coalesce(cl.activated_at, now()),
           period_end   = greatest(coalesce(cl.period_end, now()), now())
                          + make_interval(months => v_order.period_months),
           updated_at   = now()
     where cl.user_id = v_user
    returning cl.period_end into v_new_end;

    update public.subscriptions s
       set billing_recurring = false, billing_next_charge_at = null
     where s.user_id = v_user;
  else
    insert into public.subscriptions (
      user_id, plan_id, status, started_at, current_period_end,
      billing_provider, billing_provider_ref,
      billing_payer_name, billing_payer_document, billing_payer_phone, billing_payer_email,
      billing_last_charge_at, billing_error
    ) values (
      v_user, v_order.plan_id, 'active', now(),
      now() + make_interval(months => v_order.period_months),
      'epayco', null,
      v_order.payer_name, v_order.payer_document, v_order.payer_phone, v_order.payer_email,
      now(), null
    )
    on conflict (user_id) do update set
      plan_id            = excluded.plan_id,
      status             = 'active',
      current_period_end = greatest(coalesce(subscriptions.current_period_end, now()), now())
                           + make_interval(months => v_order.period_months),
      billing_provider   = 'epayco',
      -- Se conserva la referencia previa si esta orden no trae una: una
      -- renovación sin medio guardado no puede borrar el que ya funcionaba.
      billing_provider_ref = coalesce(excluded.billing_provider_ref, subscriptions.billing_provider_ref),
      billing_payer_name     = coalesce(excluded.billing_payer_name, subscriptions.billing_payer_name),
      billing_payer_document = coalesce(excluded.billing_payer_document, subscriptions.billing_payer_document),
      billing_payer_phone    = coalesce(excluded.billing_payer_phone, subscriptions.billing_payer_phone),
      billing_payer_email    = coalesce(excluded.billing_payer_email, subscriptions.billing_payer_email),
      billing_last_charge_at = now(),
      billing_error      = null,
      updated_at         = now();

    v_new_end := public.sync_billing_schedule(v_user, v_order.period_months);
  end if;

  return jsonb_build_object('applied', true, 'period_end', v_new_end,
                            'months', v_order.period_months, 'plan_id', v_order.plan_id);
end; $function$;

create or replace function public.claim_guest_orders(p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
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
        'epayco', null,
        v_order.payer_name, v_order.payer_document, v_order.payer_phone, v_order.payer_email,
        now(), null
      )
      on conflict (user_id) do update set
        plan_id              = excluded.plan_id,
        status               = 'active',
        current_period_end   = greatest(coalesce(subscriptions.current_period_end, now()), now())
                               + make_interval(months => v_order.period_months),
        billing_provider     = 'epayco',
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
end; $function$;

-- 2. Las suscripciones que quedaron atadas a un token de dLocal no se pueden
--    cobrar: ese token ya no existe. Dejarlas con `billing_recurring = true`
--    haría que el sistema crea que tiene medio de cobro cuando no lo tiene, y
--    la pantalla le diría al dueño que su plan se renueva solo. Se apaga la
--    recurrencia y se limpia la referencia muerta.
--    `billing_provider` NO se reescribe: es el registro de qué pasarela cobró
--    ese pago, y cambiarlo diría algo falso sobre el pasado.
update public.subscriptions
   set billing_recurring      = false,
       billing_next_charge_at = null,
       billing_provider_ref   = null,
       updated_at             = now()
 where billing_provider = 'dlocalgo';

-- 3. Fuera las columnas y el índice de dLocal.
drop index if exists public.billing_orders_payment_id_idx;

alter table public.billing_orders
  drop column if exists dlocal_payment_id,
  drop column if exists dlocal_enrollment_id,
  drop column if exists card_id,
  drop column if exists checkout_token;
