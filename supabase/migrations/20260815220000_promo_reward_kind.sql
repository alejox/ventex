-- El premio deja de ser solo texto: pasa a tener forma aplicable.
--
-- "Tu próximo corte es gratis 🎉" le dice al cliente lo que gana, pero al POS
-- no le dice nada: no hay monto, ni porcentaje, ni sobre qué línea. Para que la
-- caja aplique el descuento sola hace falta que el premio declare QUÉ es.
--
-- `texto` sigue siendo el default y existe a propósito: un premio como "una
-- cerveza" o "un producto de regalo" no se puede descontar de la cuenta, y
-- forzarlo a un porcentaje sería inventarle un precio. Esos siguen anunciándose
-- en el mensaje y entregándose a mano.

BEGIN;

ALTER TABLE public.promo_milestones
  ADD COLUMN IF NOT EXISTS reward_kind text NOT NULL DEFAULT 'texto',
  ADD COLUMN IF NOT EXISTS reward_value numeric(12,2);

ALTER TABLE public.promo_milestones
  DROP CONSTRAINT IF EXISTS promo_milestones_reward_kind_check;
ALTER TABLE public.promo_milestones
  ADD CONSTRAINT promo_milestones_reward_kind_check
  CHECK (reward_kind IN ('texto', 'gratis', 'porcentaje', 'monto'));

-- Un porcentaje o un monto SIN valor no se puede aplicar, y guardarlo así deja
-- una promo que la caja va a ignorar en silencio. Que reviente al guardarla.
ALTER TABLE public.promo_milestones
  DROP CONSTRAINT IF EXISTS promo_milestones_reward_value_check;
ALTER TABLE public.promo_milestones
  ADD CONSTRAINT promo_milestones_reward_value_check
  CHECK (
    (reward_kind IN ('texto', 'gratis') AND reward_value IS NULL)
    OR (reward_kind = 'porcentaje' AND reward_value > 0 AND reward_value <= 100)
    OR (reward_kind = 'monto' AND reward_value > 0)
  );

GRANT SELECT (reward_kind, reward_value), INSERT (reward_kind, reward_value),
      UPDATE (reward_kind, reward_value)
  ON public.promo_milestones TO authenticated;

-- El canje congela lo entregado; el TIPO también, para que un reporte futuro
-- pueda distinguir un corte regalado de un 20% de descuento.
ALTER TABLE public.promo_redemptions
  ADD COLUMN IF NOT EXISTS reward_kind text,
  ADD COLUMN IF NOT EXISTS reward_value numeric(12,2),
  -- Lo que efectivamente se descontó de esa cuenta. Null = se entregó a mano.
  ADD COLUMN IF NOT EXISTS discount_applied numeric(12,2);

GRANT SELECT (reward_kind, reward_value, discount_applied)
  ON public.promo_redemptions TO authenticated;

-- El canje pasa a registrar la forma del premio y lo descontado.
CREATE OR REPLACE FUNCTION public.redeem_promo(
  p_customer_id uuid,
  p_discount_applied numeric DEFAULT NULL
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
     discount_applied, redeemed_by)
  values
    (v_uid, p_customer_id, v_hito.id, v_hito.threshold, v_hito.reward, v_hito.reward_kind,
     v_hito.reward_value, p_discount_applied, v_actor)
  returning id into v_id;

  update public.customers
     set haircuts_since_reward = 0
   where id = p_customer_id and user_id = v_uid;

  return jsonb_build_object(
    'id', v_id,
    'threshold', v_hito.threshold,
    'reward', v_hito.reward,
    'reward_kind', v_hito.reward_kind,
    'reward_value', v_hito.reward_value
  );
end;
$fn$;

REVOKE ALL ON FUNCTION public.redeem_promo(uuid, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_promo(uuid, numeric) TO authenticated;

COMMIT;
