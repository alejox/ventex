-- Reintentos de cobro acotados (dunning).
--
-- Sin un contador, una tarjeta rechazada de forma permanente se reintentaba
-- todos los días para siempre y dejaba una fila de `billing_orders` por día. El
-- cron ahora corta después de unos intentos y apaga la recurrencia; el plan se
-- vence solo cuando pasa `current_period_end`, que es lo que ya controla el
-- enforcement de suscripciones.

alter table public.subscriptions
  add column if not exists billing_failed_attempts int not null default 0;

comment on column public.subscriptions.billing_failed_attempts is
  'Cobros automáticos fallidos consecutivos; se resetea al acreditar. El cron abandona al llegar al tope.';

-- Al acreditar un cobro el contador vuelve a cero: `sync_billing_schedule` ya
-- corre en los dos caminos de acreditación, así que es el lugar natural.
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
     set billing_recurring        = v_recurring,
         billing_next_charge_at   = case when v_recurring then v_period_end else null end,
         billing_failed_attempts  = 0
   where s.user_id = p_user_id;

  return v_period_end;
end; $$;

revoke execute on function public.sync_billing_schedule(uuid, int) from public, anon, authenticated;
