-- Recalcular dejaba de ignorar los canjes: era una máquina de regalar premios.
--
-- `recalc_haircut_counts()` es el botón "Recalcular" de Ajustes y la red de
-- seguridad de todo el feature: reconstruye los contadores desde el histórico
-- cuando cambian qué servicios cuentan. Hacía esto:
--
--   set haircut_count         = cortes,
--       haircuts_since_reward = cortes
--
-- Le asignaba al PROGRESO el histórico completo. Medido en producción: un
-- cliente con 12 cortes de por vida y 2 de progreso —porque ya canjeó un premio
-- de 10— pasaba a 12 de progreso y volvía a tener el corte gratis que ya se
-- llevó. Cuanto más fiel es el cliente, más grande el regalo. Y lo peor: no
-- avisa. El dueño toca un botón que dice "recalcular" y la base le da la razón.
--
-- Los dos contadores tienen reglas distintas y hay que reconstruirlos distinto:
--   * `haircut_count`         — de por vida. Es la suma de todo. Estaba bien.
--   * `haircuts_since_reward` — progreso desde el último canje: los cortes
--                               POSTERIORES a ese canje, más lo que sobró de él.
--
-- Sin ese "más lo que sobró" el recálculo contradiría a `redeem_promo`, que
-- desde 20260815250000 arrastra el excedente. Dos funciones que dicen cosas
-- distintas sobre el mismo número son peor que una sola equivocada: la que
-- corrió última gana, y nadie sabe cuál fue.

BEGIN;

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
               -- Sin canjes, progreso e histórico son el mismo número.
               when r.redeemed_at is null then tot.cortes
               -- Con canje: lo hecho después, más el excedente que el canje no
               -- consumió. `progress_before` nulo son canjes anteriores a que
               -- se guardara: se asume que no sobró nada, que es lo que la
               -- función hacía entonces.
               else nuevos.cortes
                    + greatest(coalesce(r.progress_before, r.threshold) - r.threshold, 0)
             end as progreso
        from public.customers c2

        left join lateral (
          select pr.redeemed_at, pr.progress_before, pr.threshold
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
          -- La venta que consumió el premio queda FUERA: el canje corre después
          -- de registrarla, así que sus cortes ya están dentro de
          -- `progress_before` y contarlos otra vez los duplicaría.
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

COMMIT;
