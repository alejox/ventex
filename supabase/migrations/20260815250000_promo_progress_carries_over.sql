-- El excedente del canje es del cliente: el progreso arrastra, no se arrasa.
--
-- `redeem_promo` ponía el progreso en 0. Medido en producción: un cliente llegó
-- a 11 cortes antes de pasar por el mostrador, canjeó un premio de 10, y perdió
-- el corte número 11 — uno que hizo y pagó. Volver antes de canjear le costaba
-- plata.
--
-- El premio CONSUME su umbral y nada más. Con progreso 11 y un hito de 10, el
-- canje deja 1. Es la misma lógica que ya sostiene `availableReward`, que no
-- exige coincidencia exacta con el hito justamente para no castigar al que
-- llegó a 12: sería incoherente perdonarlo al elegir el premio y cobrárselo al
-- entregarlo.
--
-- Con varios hitos el descuento es el del hito ENTREGADO, no el más bajo:
-- progreso 21 contra hitos de 10 y 20 entrega el de 20 y deja 1. Descontar 10
-- dejaría 11 y le regalaría un segundo premio por el mismo mostrador.

BEGIN;

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
  v_resto    integer;
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

  -- Lo que sobra del umbral entregado arranca el conteo siguiente.
  v_resto := greatest(v_progreso - v_hito.threshold, 0);

  insert into public.promo_redemptions
    (user_id, customer_id, milestone_id, threshold, reward, reward_kind, reward_value,
     discount_applied, sale_id, progress_before, redeemed_by)
  values
    (v_uid, p_customer_id, v_hito.id, v_hito.threshold, v_hito.reward, v_hito.reward_kind,
     v_hito.reward_value, p_discount_applied, p_sale_id, v_progreso, v_actor)
  returning id into v_id;

  update public.customers
     set haircuts_since_reward = v_resto
   where id = p_customer_id and user_id = v_uid;

  return jsonb_build_object(
    'id', v_id, 'threshold', v_hito.threshold, 'reward', v_hito.reward,
    'reward_kind', v_hito.reward_kind, 'reward_value', v_hito.reward_value,
    'progress_after', v_resto
  );
end;
$fn$;

REVOKE ALL ON FUNCTION public.redeem_promo(uuid, numeric, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_promo(uuid, numeric, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Devolver el excedente que los canjes ya hechos le comieron a cada cliente.
--
-- Solo el ULTIMO canje de cada cliente: los anteriores ya quedaron absorbidos
-- en el progreso que ese ultimo canje registro en `progress_before`, y sumarlos
-- todos regalaria cortes que nadie hizo. `sale_id is not null or true` no
-- filtra: tambien corrige los canjes hechos a mano desde Promociones.
-- ---------------------------------------------------------------------------
WITH ultimo AS (
  SELECT DISTINCT ON (customer_id)
         customer_id, user_id, progress_before, threshold
  FROM public.promo_redemptions
  ORDER BY customer_id, redeemed_at DESC
)
UPDATE public.customers c
   SET haircuts_since_reward =
         c.haircuts_since_reward + greatest(u.progress_before - u.threshold, 0)
  FROM ultimo u
 WHERE c.id = u.customer_id
   AND c.user_id = u.user_id
   AND u.progress_before IS NOT NULL
   AND u.progress_before > u.threshold;

COMMIT;
