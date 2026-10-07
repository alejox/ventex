-- invoices.paid_at: CUÁNDO se pagó un documento.
--
-- Finanzas contaba una compra/factura pagada en su `issue_date`: una compra a
-- crédito emitida en agosto y pagada en octubre salía como egreso de agosto,
-- cuando la plata salió de la caja en octubre. "Flujo de caja" es caja: cuenta
-- cuando se paga.
--
-- * Trigger `invoices_stamp_paid_at` (nombre propio: otros triggers de
--   `invoices` los maneja el flujo de compras):
--   - pasa a 'paid' → paid_at = now() (salvo que la misma sentencia mande uno).
--   - sale de 'paid' → paid_at = NULL.
--   - se crea YA pagado → si la fecha de emisión es anterior a hoy, el mediodía
--     de ese día en hora de Colombia (se registró una compra vieja: se pagó
--     cuando se emitió); si es de hoy o futura, now().
-- * Backfill: las pagadas existentes toman el mediodía de su issue_date. El
--   mediodía y no la medianoche para que ninguna zona de América corra el día.
BEGIN;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE OR REPLACE FUNCTION public.invoices_stamp_paid_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.status = 'paid' then
      if new.paid_at is null then
        new.paid_at := case
          when new.issue_date < (now() at time zone 'America/Bogota')::date
            then (new.issue_date::timestamp + time '12:00') at time zone 'America/Bogota'
          else now()
        end;
      end if;
    else
      new.paid_at := null;
    end if;
    return new;
  end if;

  if new.status is distinct from 'paid' then
    new.paid_at := null;
  elsif old.status is distinct from 'paid' then
    -- Recién pagada: ahora, salvo que la sentencia mande su propia fecha.
    if new.paid_at is null or new.paid_at is not distinct from old.paid_at then
      new.paid_at := now();
    end if;
  elsif new.paid_at is null then
    -- Sigue pagada: nunca queda sin fecha.
    new.paid_at := coalesce(old.paid_at, now());
  end if;
  return new;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.invoices_stamp_paid_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS invoices_stamp_paid_at ON public.invoices;
CREATE TRIGGER invoices_stamp_paid_at
  BEFORE INSERT OR UPDATE OF status, paid_at ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_stamp_paid_at();

UPDATE public.invoices
   SET paid_at = (issue_date::timestamp + time '12:00') at time zone 'America/Bogota'
 WHERE status = 'paid' AND paid_at IS NULL;

CREATE INDEX IF NOT EXISTS invoices_user_paid_at_idx
  ON public.invoices (user_id, paid_at)
  WHERE status = 'paid';

DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM public.invoices WHERE status = 'paid' AND paid_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.invoices WHERE status <> 'paid' AND paid_at IS NOT NULL) THEN
    RAISE EXCEPTION 'invoices.paid_at quedó inconsistente con status';
  END IF;
END;
$check$;

COMMIT;
