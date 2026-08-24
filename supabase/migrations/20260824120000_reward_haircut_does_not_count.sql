-- El corte que paga el premio no cuenta para el premio siguiente.
--
-- El contador lo sube un trigger sobre `sale_items` que no pregunta quien pago,
-- y el canje corre DESPUES de registrar la venta —a proposito: al reves, un
-- cobro fallido le quemaria el premio al cliente por una venta que no existio—.
-- Entre esas dos piezas se colaba el corte gratis:
--
--   progreso 10  ->  se cobra la venta con el corte GRATIS
--                ->  trigger:      10 + 1 = 11
--                ->  redeem_promo: 11 - 10 = 1
--
-- El cliente arrancaba el ciclo siguiente con un credito por un corte que nunca
-- pago. Medido en produccion antes de esta migracion: los 5 canjes de la base
-- tenian `progress_before = 11` contra un umbral de 10, y los 4 que salieron del
-- POS se cobraron en $0.00 con un corte que cuenta adentro. Ninguno era el caso
-- que 20260815250000 quiso proteger.
--
-- Eso NO invalida el carry-over, lo acota: el excedente sigue siendo del cliente
-- cuando el cliente lo PAGO. Lo que se retira del conteo es lo que pago el
-- premio, que es plata que el cliente no puso.
--
-- La senal es el descuento contra el precio de la unidad, no `reward_kind`:
-- `promoDiscountFor` elige la linea mas cara que cuenta y descuenta UNA unidad
-- topada en su precio, asi que el premio cubrio un corte entero solo si el
-- descuento llego a ese precio. Con eso quedan cubiertos de una los tres casos
-- que valen lo mismo —`gratis`, `porcentaje` de 100 y un `monto` que iguala o
-- pasa el precio— y queda afuera el descuento parcial, donde el cliente puso la
-- diferencia y el corte es suyo.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Cuantos cortes de la venta los pago el premio, congelado en el canje.
--
--    Se PERSISTE y no se recalcula: `recalc_haircut_counts()` tiene que poder
--    reconstruir el mismo numero, y para entonces los precios del catalogo
--    pueden haber cambiado. Sin esta columna, recalcular contradiria a
--    `redeem_promo` y ganaria el que corrio ultimo.
-- ---------------------------------------------------------------------------
ALTER TABLE public.promo_redemptions
  ADD COLUMN IF NOT EXISTS rewarded_haircuts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.promo_redemptions.rewarded_haircuts IS
  'Cortes de la venta que pago el premio. No cuentan para el premio siguiente.';

-- Toda columna nueva nace sin permisos: sin GRANT, PostgREST responde
-- "permission denied" y parece un problema de RLS.
GRANT SELECT (rewarded_haircuts) ON public.promo_redemptions TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) El canje descuenta el corte del premio ANTES de elegir el hito.
--
--    Antes, y no solo del sobrante: con hitos de 10 y 11, el corte gratis
--    empujaba el progreso a 11 y entregaba el premio de 11 — uno que el cliente
--    no habia ganado con cortes propios.
-- ---------------------------------------------------------------------------
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
  v_pagados  integer := 0;
  v_efectivo integer;
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

  -- Cuantos cortes de esta venta los pago el premio. El canje a mano desde
  -- Promociones no tiene venta: ahi el premio no pago ningun corte del sistema.
  if p_sale_id is not null and coalesce(p_discount_applied, 0) > 0 then
    select coalesce(
             case
               when max(i.unit_price) > 0
                -- Un centavo de tolerancia: los precios se redondean a dos
                -- decimales y una comparacion exacta contra un numeric calculado
                -- dejaria el corte gratis contando.
                and p_discount_applied >= max(i.unit_price) - 0.005 then 1
               else 0
             end, 0)
      into v_pagados
      from public.sale_items i
     where i.sale_id = p_sale_id
       and i.user_id = v_uid
       and public.sale_item_is_haircut(v_uid, i.service_id);
  end if;

  v_efectivo := greatest(v_progreso - coalesce(v_pagados, 0), 0);

  select * into v_hito
  from public.promo_milestones m
  where m.user_id = v_uid and m.is_active and m.threshold <= v_efectivo
  order by m.threshold desc
  limit 1;

  if not found then
    raise exception 'SIN_PREMIO: al cliente todavia no le corresponde ningun premio';
  end if;

  -- Lo que sobra del umbral entregado arranca el conteo siguiente.
  v_resto := greatest(v_efectivo - v_hito.threshold, 0);

  -- `progress_before` guarda el progreso CRUDO, con el corte gratis adentro:
  -- es lo que `undo_haircut_count` restituye antes de descontar los cortes de
  -- la venta anulada, y esa resta tiene que caer sobre el mismo numero que el
  -- trigger habia sumado.
  insert into public.promo_redemptions
    (user_id, customer_id, milestone_id, threshold, reward, reward_kind, reward_value,
     discount_applied, sale_id, progress_before, rewarded_haircuts, redeemed_by)
  values
    (v_uid, p_customer_id, v_hito.id, v_hito.threshold, v_hito.reward, v_hito.reward_kind,
     v_hito.reward_value, p_discount_applied, p_sale_id, v_progreso, coalesce(v_pagados, 0), v_actor)
  returning id into v_id;

  update public.customers
     set haircuts_since_reward = v_resto
   where id = p_customer_id and user_id = v_uid;

  return jsonb_build_object(
    'id', v_id, 'threshold', v_hito.threshold, 'reward', v_hito.reward,
    'reward_kind', v_hito.reward_kind, 'reward_value', v_hito.reward_value,
    'rewarded_haircuts', coalesce(v_pagados, 0),
    'progress_after', v_resto
  );
end;
$fn$;

REVOKE ALL ON FUNCTION public.redeem_promo(uuid, numeric, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_promo(uuid, numeric, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Recalcular tiene que dar el mismo numero que el canje.
--
--    Dos funciones que dicen cosas distintas sobre el mismo contador son peor
--    que una sola equivocada: gana la que corrio ultima y nadie sabe cual fue.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_haircut_counts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
declare
  v_uid   uuid := public.get_effective_user_id();
  v_filas integer;
begin
  if v_uid is null or not public.is_tenant_owner() then
    raise exception 'SIN_PERMISO: solo el dueno puede recalcular el contador'
      using errcode = '42501';
  end if;

  update public.customers c
     set haircut_count = x.cortes,
         haircuts_since_reward = x.progreso
    from (
      select c2.id,
             tot.cortes,
             case
               -- Sin canjes, progreso e historico son el mismo numero.
               when r.redeemed_at is null then tot.cortes
               -- Con canje: lo hecho despues, mas el excedente que el canje no
               -- consumio, menos el corte que pago el premio. `progress_before`
               -- nulo son canjes anteriores a que se guardara: se asume que no
               -- sobro nada, que es lo que la funcion hacia entonces.
               else nuevos.cortes
                    + greatest(
                        coalesce(r.progress_before, r.threshold)
                        - coalesce(r.rewarded_haircuts, 0)
                        - r.threshold, 0)
             end as progreso
        from public.customers c2

        left join lateral (
          select pr.redeemed_at, pr.progress_before, pr.threshold, pr.rewarded_haircuts
            from public.promo_redemptions pr
           where pr.user_id = v_uid and pr.customer_id = c2.id
           order by pr.redeemed_at desc
           limit 1
        ) r on true

        cross join lateral (
          select coalesce(sum(item.quantity), 0)::integer as cortes
            from public.sale_items item
            join public.sales sale on sale.id = item.sale_id
           where sale.user_id = v_uid
             and sale.status = 'completed'
             and sale.customer_id = c2.id
             and item.user_id = v_uid
             and public.sale_item_is_haircut(v_uid, item.service_id)
        ) tot

        cross join lateral (
          -- La venta que consumio el premio queda FUERA: el canje corre despues
          -- de registrarla, asi que sus cortes ya estan dentro de
          -- `progress_before` y contarlos otra vez los duplicaria.
          select coalesce(sum(item.quantity), 0)::integer as cortes
            from public.sale_items item
            join public.sales sale on sale.id = item.sale_id
           where sale.user_id = v_uid
             and sale.status = 'completed'
             and sale.customer_id = c2.id
             and item.user_id = v_uid
             and public.sale_item_is_haircut(v_uid, item.service_id)
             and r.redeemed_at is not null
             and sale.created_at > r.redeemed_at
        ) nuevos

       where c2.user_id = v_uid
    ) x
   where c.id = x.id and c.user_id = v_uid;

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4) Los canjes ya hechos: marcar cuales pagaron un corte y devolver el credito.
--
--    Se aplica la misma regla hacia atras, contra el precio congelado en la
--    linea de esa venta. Los canjes a mano (`sale_id is null`) quedan en 0: sin
--    venta no hay corte que el premio haya pagado.
-- ---------------------------------------------------------------------------
WITH tope AS (
  SELECT r.id, max(i.unit_price) AS precio
    FROM public.promo_redemptions r
    JOIN public.sale_items i
      ON i.sale_id = r.sale_id AND i.user_id = r.user_id
   WHERE r.sale_id IS NOT NULL
     AND public.sale_item_is_haircut(r.user_id, i.service_id)
   GROUP BY r.id
)
UPDATE public.promo_redemptions r
   SET rewarded_haircuts = 1
  FROM tope t
 WHERE r.id = t.id
   AND t.precio > 0
   AND coalesce(r.discount_applied, 0) >= t.precio - 0.005;

-- Solo el ULTIMO canje de cada cliente: los anteriores ya quedaron absorbidos
-- en el progreso que ese ultimo canje registro en `progress_before`.
WITH ultimo AS (
  SELECT DISTINCT ON (customer_id)
         customer_id, user_id, rewarded_haircuts
    FROM public.promo_redemptions
   ORDER BY customer_id, redeemed_at DESC
)
UPDATE public.customers c
   SET haircuts_since_reward = greatest(c.haircuts_since_reward - u.rewarded_haircuts, 0)
  FROM ultimo u
 WHERE c.id = u.customer_id
   AND c.user_id = u.user_id
   AND u.rewarded_haircuts > 0;

COMMIT;
