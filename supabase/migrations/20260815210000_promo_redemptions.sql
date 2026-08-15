-- Canjear el premio: el corte gratis se entrega y el progreso vuelve a cero.
--
-- Hasta acá el premio se calculaba con aritmética de múltiplos sobre el total
-- de por vida (`haircut_count % 10 = 0`). Con la redención eso deja de servir:
-- si el contador que importa vuelve a 0 al canjear, el premio tiene que salir
-- del PROGRESO, no del histórico.
--
-- Por eso los dos números que ya existían pasan a tener roles claros:
--   * `haircut_count`          — de por vida. Nunca baja salvo por anulación.
--                                Es el número de la relación ("llevás 47 con
--                                nosotros") y el que sirve para reportes.
--   * `haircuts_since_reward`  — progreso hacia el premio. Sube al cortar y
--                                vuelve a 0 al canjear. Es el que decide.
--
-- Y `recurring` se cae: con el progreso reiniciándose en cada canje, TODO hito
-- se repite por construcción. Un interruptor que no puede cambiar nada es peor
-- que no tenerlo, porque promete una decisión que no existe.

BEGIN;

ALTER TABLE public.promo_milestones DROP COLUMN IF EXISTS recurring;

-- ---------------------------------------------------------------------------
-- El registro de canjes.
--
-- No es opcional: sin él, "¿ya le dimos el corte gratis?" solo se puede
-- responder de memoria, y el contador en cero no distingue entre un cliente que
-- canjeó ayer y uno que nunca vino.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT public.get_effective_user_id()
                 REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  -- El hito puede borrarse después; el canje no se borra con él.
  milestone_id uuid REFERENCES public.promo_milestones(id) ON DELETE SET NULL,
  -- Congelados al canjear: si mañana el negocio cambia el premio de los 10
  -- cortes, este canje tiene que seguir diciendo lo que se entregó ese día.
  threshold    integer NOT NULL,
  reward       text NOT NULL,
  redeemed_at  timestamptz NOT NULL DEFAULT now(),
  redeemed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS promo_redemptions_customer_idx
  ON public.promo_redemptions (user_id, customer_id, redeemed_at DESC);

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_promo_redemptions_user_id ON public.promo_redemptions;
CREATE TRIGGER set_promo_redemptions_user_id
  BEFORE INSERT ON public.promo_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- Lo lee cualquiera del negocio: el cajero necesita ver si ya se canjeó.
DROP POLICY IF EXISTS workspace_promo_redemptions_read ON public.promo_redemptions;
CREATE POLICY workspace_promo_redemptions_read
  ON public.promo_redemptions FOR SELECT
  USING (user_id = public.get_effective_user_id());

GRANT SELECT ON public.promo_redemptions TO authenticated;

-- ---------------------------------------------------------------------------
-- Canjear.
--
-- Todo en un RPC y no en dos escrituras desde el cliente: registrar el canje y
-- poner el progreso en cero tienen que pasar juntos o no pasar. Si se hiciera
-- suelto y fallara la segunda, el cliente se llevaría el corte gratis con el
-- contador intacto y podría reclamarlo otra vez.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_promo(p_customer_id uuid)
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
  -- Se canjea en el mostrador, así que alcanza con poder cobrar. Exigir dueño
  -- obligaría a llamarlo cada vez que un cliente llega a los 10.
  if not public.worker_can('pos') then
    raise exception 'SIN_PERMISO: no tenés permiso para canjear promociones'
      using errcode = '42501';
  end if;

  -- `for update`: dos cajeros canjeando al mismo cliente a la vez entregarían
  -- dos premios contra el mismo progreso.
  select haircuts_since_reward into v_progreso
  from public.customers
  where id = p_customer_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  -- El premio es el hito MÁS ALTO que el progreso ya alcanzó. No hace falta que
  -- sea exacto: un cliente que llegó a 12 sin canjear igual tiene ganado el
  -- de 10.
  select * into v_hito
  from public.promo_milestones m
  where m.user_id = v_uid and m.is_active and m.threshold <= v_progreso
  order by m.threshold desc
  limit 1;

  if not found then
    raise exception 'SIN_PREMIO: al cliente todavía no le corresponde ningún premio';
  end if;

  insert into public.promo_redemptions
    (user_id, customer_id, milestone_id, threshold, reward, redeemed_by)
  values
    (v_uid, p_customer_id, v_hito.id, v_hito.threshold, v_hito.reward, v_actor)
  returning id into v_id;

  -- Solo el progreso. `haircut_count` es el histórico de la relación con el
  -- cliente y ponerlo en cero borraría que vino 47 veces.
  update public.customers
     set haircuts_since_reward = 0
   where id = p_customer_id and user_id = v_uid;

  return jsonb_build_object(
    'id', v_id,
    'threshold', v_hito.threshold,
    'reward', v_hito.reward
  );
end;
$fn$;

REVOKE ALL ON FUNCTION public.redeem_promo(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_promo(uuid) TO authenticated;

COMMIT;
