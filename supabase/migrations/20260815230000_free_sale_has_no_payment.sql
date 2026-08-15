-- Una venta que no cobra nada no tiene un pago que registrar.
--
-- Con el premio "el próximo corte es gratis" aplicado, la venta queda en $0 y
-- el cobro fallaba entero:
--
--   new row for relation "sale_payments" violates check constraint
--   "sale_payments_amount_check"
--
-- `create_sale` inserta siempre una fila en `sale_payments` por el total, y esa
-- tabla exige `amount > 0`. Con total cero, la inserción explota y se cae la
-- venta completa — justo la venta que el feature de promociones existe para
-- permitir.
--
-- El arreglo NO es aflojar el CHECK a `>= 0`: un pago de cero no es un pago, y
-- permitirlo dejaría entrar splits vacíos que la propia `create_sale` valida y
-- rechaza unas líneas más arriba. Lo correcto es no insertar nada: si no entró
-- plata, no hay movimiento que anotar. El arqueo y los reportes suman cero
-- igual, con una fila menos.
--
-- El parche se aplica sobre la definición VIVA de la función y no reescribiendo
-- sus ~400 líneas acá: `create_sale` es la función más crítica de la app
-- —cobra, descuenta stock, congela comisiones, valida turnos e idempotencia— y
-- volver a tipearla entera para cambiar una línea es la forma más fácil de
-- perder algo en el camino. Si el bloque no aparece tal cual, esto falla en vez
-- de aplicar un parche a ciegas.

BEGIN;

DO $outer$
DECLARE
  def   text;
  nueva text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_sale';

  IF def IS NULL THEN
    RAISE EXCEPTION 'create_sale no existe';
  END IF;

  -- El `else` del bloque de pagos pasa a exigir que haya algo que cobrar.
  nueva := replace(
    def,
    E'    else\n      insert into public.sale_payments (sale_id, payment_method, amount,',
    E'    elsif v_total > 0 then\n      insert into public.sale_payments (sale_id, payment_method, amount,'
  );

  IF nueva = def THEN
    RAISE EXCEPTION 'No se encontro el bloque a parchear: create_sale cambio de forma';
  END IF;

  EXECUTE nueva;
END $outer$;

-- Que quede constancia de por qué la tabla puede no tener filas para una venta.
COMMENT ON TABLE public.sale_payments IS
  'Un movimiento de dinero por venta. Una venta de total 0 —premio canjeado al 100%— no tiene ninguna fila acá: no entro plata.';

COMMIT;
