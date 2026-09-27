-- Ofertas de producto para tiendas: descuentos automáticos por producto o
-- categoría (porcentaje, monto fijo, o "lleva N paga M"), separados del motor
-- de fidelización de cortes (que es exclusivo de salón/barbería). Mismo split
-- de permisos que promo_milestones: lee cualquiera del negocio, escribe solo
-- el dueño.

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_offers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT public.get_effective_user_id()
                REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) > 0),
  kind        text NOT NULL CHECK (kind IN ('percent', 'amount', 'buy_n_pay_m')),
  -- Porcentaje 0<v<=100, monto >0; en "lleva N paga M" el valor no aplica y
  -- queda NULL: el descuento sale de buy_qty/pay_qty, no de un número suelto.
  value       numeric CHECK (
                (kind = 'percent' AND value > 0 AND value <= 100) OR
                (kind = 'amount' AND value > 0) OR
                (kind = 'buy_n_pay_m' AND value IS NULL)
              ),
  buy_qty     integer CHECK (kind <> 'buy_n_pay_m' OR buy_qty > 0),
  pay_qty     integer CHECK (kind <> 'buy_n_pay_m' OR (pay_qty >= 1 AND pay_qty < buy_qty)),
  product_id  uuid REFERENCES public.products(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  starts_on   date,
  ends_on     date CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Exactamente un objetivo: un producto o una categoría, nunca los dos ni
  -- ninguno.
  CHECK ((product_id IS NULL) <> (category_id IS NULL))
);

ALTER TABLE public.product_offers ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_product_offers_user_id ON public.product_offers;
CREATE TRIGGER set_product_offers_user_id
  BEFORE INSERT ON public.product_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE OR REPLACE FUNCTION public.touch_product_offers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

DROP TRIGGER IF EXISTS product_offers_touch_updated_at ON public.product_offers;
CREATE TRIGGER product_offers_touch_updated_at
  BEFORE UPDATE ON public.product_offers
  FOR EACH ROW EXECUTE FUNCTION public.touch_product_offers_updated_at();

-- Leer lo puede cualquiera del negocio: el cajero necesita saber qué ofertas
-- aplican al cobrar.
DROP POLICY IF EXISTS workspace_product_offers_read ON public.product_offers;
CREATE POLICY workspace_product_offers_read
  ON public.product_offers FOR SELECT
  USING (user_id = public.get_effective_user_id());

-- Configurarlas es del dueño, igual que el resto de los ajustes del negocio.
DROP POLICY IF EXISTS workspace_product_offers_write ON public.product_offers;
CREATE POLICY workspace_product_offers_write
  ON public.product_offers FOR ALL
  USING (user_id = public.get_effective_user_id() AND public.is_tenant_owner())
  WITH CHECK (user_id = public.get_effective_user_id() AND public.is_tenant_owner());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_offers TO authenticated;

CREATE INDEX IF NOT EXISTS product_offers_user_active_idx
  ON public.product_offers (user_id, active);

COMMIT;
