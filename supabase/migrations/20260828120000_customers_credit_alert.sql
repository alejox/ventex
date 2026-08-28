-- Aviso de crédito por cliente ("no fiar"), editable por el dueño.
--
-- AVISA, NO BLOQUEA. Es una decisión del negocio, no una omisión: el cupo
-- (`credit_limit`) ya rechaza la venta desde `create_sale` y desde el trigger
-- del split, y esas dos puertas siguen intactas. Este campo es el recordatorio
-- del mostrador — "este debe desde marzo", "solo de contado"— que hoy vive en
-- la cabeza del dueño y no llega al cajero.
--
-- Por qué no se escribe con un UPDATE común: la policy `workspace_customers_write`
-- es ALL y alcanza a cualquiera con `worker_can('pos')`. O sea, el mismo cajero
-- al que el aviso le habla podría apagarlo. Un aviso que su destinatario puede
-- borrar no es un aviso. Por eso las dos columnas solo se tocan por
-- `set_credit_alert`, que revalida dueño, y un trigger cierra la puerta de atrás.

alter table public.customers
  add column if not exists credit_alert boolean not null default false,
  add column if not exists credit_alert_note text;

comment on column public.customers.credit_alert is
  'Aviso interno de crédito ("no fiar"). Solo advierte: no bloquea la venta.';
comment on column public.customers.credit_alert_note is
  'Texto del aviso, editable. Nunca se le envía al cliente.';

-- ---------------------------------------------------------------------------
-- El guard: nadie cambia el aviso por la puerta de atrás
-- ---------------------------------------------------------------------------

create or replace function public.customers_guard_credit_alert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Solo se mira el aviso. `create_sale` y `register_customer_payment` escriben
  -- `credit_balance` sobre esta misma fila todo el día: si el guard mirara la
  -- fila entera, cobrar un fiado fallaría.
  if (new.credit_alert is distinct from old.credit_alert
      or new.credit_alert_note is distinct from old.credit_alert_note)
     and coalesce(current_setting('app.setting_credit_alert', true), '') <> '1'
  then
    raise exception 'AVISO_DE_CREDITO_PROTEGIDO: el aviso lo cambia el dueño desde Créditos'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists customers_guard_credit_alert on public.customers;
create trigger customers_guard_credit_alert
  before update on public.customers
  for each row
  execute function public.customers_guard_credit_alert();

-- ---------------------------------------------------------------------------
-- La única puerta de entrada
-- ---------------------------------------------------------------------------

create or replace function public.set_credit_alert(
  p_customer uuid,
  p_alert boolean,
  p_note text default null
)
returns table (credit_alert boolean, credit_alert_note text)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := public.get_effective_user_id();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_tenant_owner() then
    raise exception 'SIN_PERMISO: el aviso de crédito lo administra el dueño'
      using errcode = '42501';
  end if;

  -- Apagar el aviso se lleva el texto. Dejarlo guardado haría reaparecer un
  -- motivo viejo la próxima vez que alguien prenda el switch, y ese motivo ya
  -- no es el que el dueño tiene en la cabeza.
  if not coalesce(p_alert, false) then
    v_note := null;
  end if;

  perform set_config('app.setting_credit_alert', '1', true);

  return query
  update public.customers c
     set credit_alert = coalesce(p_alert, false),
         credit_alert_note = v_note
   where c.id = p_customer
     and c.user_id = v_uid
  returning c.credit_alert, c.credit_alert_note;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;
end;
$$;

revoke execute on function public.set_credit_alert(uuid, boolean, text) from public, anon;
grant execute on function public.set_credit_alert(uuid, boolean, text) to authenticated;
