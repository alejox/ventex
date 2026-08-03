-- `apply_billing_charge` deriva el dueño de la ORDEN en vez de recibirlo.
--
-- Por qué se va `p_user_id`:
--  * Era siempre `billing_orders.user_id`, leído por el llamador un instante
--    antes de la llamada: un argumento que no podía decir nada nuevo.
--  * Aceptaba NULL (pago de invitado: acredita la orden sin activar licencia) y
--    la nulabilidad de un argumento no se puede expresar en los tipos generados
--    de Supabase —salen todos como no-nulos—, así que el caso invitado obligaba
--    a un cast que MENTÍA sobre el valor (`order.user_id as string`).
--  * Cierra una carrera real: si `claim_guest_orders` ataba la orden a una cuenta
--    nueva entre esa lectura y la llamada, la acreditación seguía entrando por la
--    rama de invitado con el NULL viejo y la licencia no se activaba nunca (la
--    orden ya estaba `paid`, así que un claim posterior tampoco la tomaba).
--    Leyendo `user_id` del `returning` del propio UPDATE —que espera el lock de
--    la fila y re-evalúa el WHERE— el pago se acredita al dueño que quedó atado.
--
-- Se DROPEA la versión de dos argumentos: `create or replace` no cambia la firma,
-- crearía una sobrecarga y dejaría vivo el camino viejo.

drop function if exists public.apply_billing_charge(uuid, uuid);

create or replace function public.apply_billing_charge(
  p_order_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
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

    v_new_end := public.sync_billing_schedule(v_user, v_order.period_months);
  end if;

  return jsonb_build_object('applied', true, 'period_end', v_new_end,
                            'months', v_order.period_months, 'plan_id', v_order.plan_id);
end; $$;

-- Sólo el servidor la invoca (service role), igual que la versión anterior.
revoke execute on function public.apply_billing_charge(uuid) from public, anon, authenticated;
