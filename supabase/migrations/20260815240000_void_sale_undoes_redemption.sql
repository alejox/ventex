-- Anular la venta devuelve el premio.
--
-- El canje no estaba atado a la venta que lo consumió, así que anular dejaba al
-- cliente sin el corte gratis Y sin su progreso: medido, un cliente con 11
-- cortes que canjeó y cuya venta se anuló quedaba en 0 y sin premio, por una
-- venta que no existió. Es la peor forma de perder un cliente: castigarlo por
-- un error del mostrador.
--
-- Se resuelve atando el canje a su venta y guardando el progreso que tenía
-- ANTES de reiniciarse, que es lo único que permite reconstruirlo. Calcularlo
-- de nuevo no serviría: el progreso es acumulado y no se puede deducir hacia
-- atrás una vez puesto en cero.

BEGIN;

ALTER TABLE public.promo_redemptions
  -- Null = canje a mano desde Promociones, sin venta asociada. Ese no se
  -- revierte solo porque no hay nada que anular.
  ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS progress_before integer;

CREATE INDEX IF NOT EXISTS promo_redemptions_sale_idx
  ON public.promo_redemptions (sale_id) WHERE sale_id IS NOT NULL;

GRANT SELECT (sale_id, progress_before) ON public.promo_redemptions TO authenticated;

DROP FUNCTION IF EXISTS public.redeem_promo(uuid, numeric);

CREATE OR REPLACE FUNCTION public.redeem_promo(
  p_customer_id uuid,
  p_discount_applied numeric DEFAULT NULL,
  p_sale_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
declare
  v_uid      uuid := public.get_effective_user_id();
  v_actor    uuid := (select auth.uid());
  v_progreso integer;
  v_hito     public.promo_milestones;
  v_id       uuid;
begin
  if v_actor is null or v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.worker_can('pos') then
    raise exception 'SIN_PERMISO: no tenes permiso para canjear promociones'
      using errcode = '42501';
  end if;

  select haircuts_since_reward into v_progreso
  from public.customers
  where id = p_customer_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  select * into v_hito
  from public.promo_milestones m
  where m.user_id = v_uid and m.is_active and m.threshold <= v_progreso
  order by m.threshold desc
  limit 1;

  if not found then
    raise exception 'SIN_PREMIO: al cliente todavia no le corresponde ningun premio';
  end if;

  insert into public.promo_redemptions
    (user_id, customer_id, milestone_id, threshold, reward, reward_kind, reward_value,
     discount_applied, sale_id, progress_before, redeemed_by)
  values
    (v_uid, p_customer_id, v_hito.id, v_hito.threshold, v_hito.reward, v_hito.reward_kind,
     v_hito.reward_value, p_discount_applied, p_sale_id, v_progreso, v_actor)
  returning id into v_id;

  update public.customers
     set haircuts_since_reward = 0
   where id = p_customer_id and user_id = v_uid;

  return jsonb_build_object(
    'id', v_id, 'threshold', v_hito.threshold, 'reward', v_hito.reward,
    'reward_kind', v_hito.reward_kind, 'reward_value', v_hito.reward_value
  );
end;
$fn$;

REVOKE ALL ON FUNCTION public.redeem_promo(uuid, numeric, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_promo(uuid, numeric, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- La anulación revierte el canje ANTES de descontar los cortes.
--
-- El orden importa: primero se restituye el progreso que había al canjear, y
-- recién entonces se le restan los cortes de esta venta. Al revés, la resta
-- caería sobre un cero y `greatest(...,0)` la comería.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_haircut_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
declare
  v_cortes integer;
  v_canje  public.promo_redemptions;
begin
  if new.status is not distinct from old.status or new.status <> 'void' then
    return new;
  end if;
  if new.customer_id is null then
    return new;
  end if;

  -- 1) Si esta venta consumio un premio, se lo devuelve.
  select * into v_canje
  from public.promo_redemptions r
  where r.sale_id = new.id and r.user_id = new.user_id
  limit 1;

  if found then
    update public.customers
       set haircuts_since_reward = coalesce(v_canje.progress_before, haircuts_since_reward)
     where id = new.customer_id and user_id = new.user_id;

    delete from public.promo_redemptions where id = v_canje.id;
  end if;

  -- 2) Y despues se descuentan los cortes de la venta anulada.
  select coalesce(sum(item.quantity), 0) into v_cortes
  from public.sale_items item
  where item.sale_id = new.id
    and item.user_id = new.user_id
    and public.sale_item_is_haircut(new.user_id, item.service_id);

  if v_cortes > 0 then
    update public.customers
       set haircut_count = greatest(haircut_count - v_cortes, 0),
           haircuts_since_reward = greatest(haircuts_since_reward - v_cortes, 0)
     where id = new.customer_id and user_id = new.user_id;
  end if;

  return new;
end;
$fn$;

COMMIT;
