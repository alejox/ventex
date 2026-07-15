-- =====================================================================
-- Rol Trabajador: permite al dueño crear subcuentas para empleados
-- (barberos, cajeros, lavadores) con acceso limitado al dashboard.
-- =====================================================================

-- 1. Columnas del perfil para el rol worker
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_worker         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS workspace_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS staff_id          uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS worker_permissions jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS profiles_workspace_id_idx ON public.profiles (workspace_id);
CREATE INDEX IF NOT EXISTS profiles_is_worker_idx    ON public.profiles (is_worker);

-- 2. Función helper: devuelve workspace_id para workers, auth.uid() para el resto
CREATE OR REPLACE FUNCTION public.get_effective_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT workspace_id FROM public.profiles WHERE id = auth.uid() AND is_worker = true),
    auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_effective_user_id() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_effective_user_id() TO authenticated;

-- 3. Modificar set_user_id para que los workers creen datos con el user_id del dueño
CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  new.user_id = public.get_effective_user_id();
  RETURN new;
END;
$$;

-- 4. Actualizar RLS de profiles
-- Los dueños pueden leer/actualizar a sus workers; los workers solo su propio perfil
DROP POLICY IF EXISTS "profiles_owner" ON public.profiles;
CREATE POLICY "profiles_owner" ON public.profiles
  FOR ALL TO authenticated
  USING (
    id = auth.uid()
    OR (is_worker = true AND workspace_id = auth.uid())
  )
  WITH CHECK (
    id = auth.uid()
    OR (is_worker = true AND workspace_id = auth.uid())
  );

-- 5. Actualizar RLS de todas las tablas de datos para que workers puedan
--    leer/escribir datos del workspace (dueño).
--    Se reemplaza (select auth.uid()) por get_effective_user_id()

-- categories
DROP POLICY IF EXISTS "Users manage own categories" ON public.categories;
CREATE POLICY "Users manage own categories" ON public.categories
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- customers
DROP POLICY IF EXISTS "Users manage own customers" ON public.customers;
CREATE POLICY "Users manage own customers" ON public.customers
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- distributors
DROP POLICY IF EXISTS "Users manage own distributors" ON public.distributors;
CREATE POLICY "Users manage own distributors" ON public.distributors
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- products
DROP POLICY IF EXISTS "Users manage own products" ON public.products;
CREATE POLICY "Users manage own products" ON public.products
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- services
DROP POLICY IF EXISTS "Users manage own services" ON public.services;
CREATE POLICY "Users manage own services" ON public.services
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- staff
DROP POLICY IF EXISTS "Users manage own staff" ON public.staff;
CREATE POLICY "Users manage own staff" ON public.staff
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- invoices
DROP POLICY IF EXISTS "Users manage own invoices" ON public.invoices;
CREATE POLICY "Users manage own invoices" ON public.invoices
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- invoice_items
DROP POLICY IF EXISTS "Users manage own invoice_items" ON public.invoice_items;
CREATE POLICY "Users manage own invoice_items" ON public.invoice_items
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- inventory_movements
DROP POLICY IF EXISTS "Users manage own inventory_movements" ON public.inventory_movements;
CREATE POLICY "Users manage own inventory_movements" ON public.inventory_movements
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- settings
DROP POLICY IF EXISTS "Users manage own settings" ON public.settings;
CREATE POLICY "Users manage own settings" ON public.settings
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- sales
DROP POLICY IF EXISTS "Users manage own sales" ON public.sales;
CREATE POLICY "Users manage own sales" ON public.sales
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- sale_items
DROP POLICY IF EXISTS "Users manage own sale_items" ON public.sale_items;
CREATE POLICY "Users manage own sale_items" ON public.sale_items
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- expenses
DROP POLICY IF EXISTS "Users manage own expenses" ON public.expenses;
CREATE POLICY "Users manage own expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- appointments
DROP POLICY IF EXISTS "Users own appointments" ON public.appointments;
CREATE POLICY "Users own appointments" ON public.appointments
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- vehicles
DROP POLICY IF EXISTS "Users manage own vehicles" ON public.vehicles;
CREATE POLICY "Users manage own vehicles" ON public.vehicles
  FOR ALL TO authenticated
  USING (user_id = public.get_effective_user_id())
  WITH CHECK (user_id = public.get_effective_user_id());

-- 6. Actualizar create_sale para que use get_effective_user_id()
--    (los workers heredan el user_id del dueño)
DROP FUNCTION IF EXISTS public.create_sale(uuid, text, numeric, jsonb, uuid);
CREATE OR REPLACE FUNCTION public.create_sale(
  p_customer_id     uuid,
  p_payment_method  text,
  p_discount_amount numeric,
  p_items           jsonb,
  p_staff_id        uuid DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid := public.get_effective_user_id();
  v_sale_id    uuid;
  v_subtotal   numeric(12,2) := 0;
  v_discount   numeric(12,2) := COALESCE(p_discount_amount, 0);
  v_tax_rate   numeric(5,4);
  v_tax_exempt boolean := false;
  v_taxable    numeric(12,2);
  v_tax_amount numeric(12,2);
  v_total      numeric(12,2);
  v_item       jsonb;
  v_product    public.products%ROWTYPE;
  v_service    public.services%ROWTYPE;
  v_is_service boolean;
  v_qty        integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta no tiene productos';
  END IF;

  -- Ignora staff ajeno (defensa: el id viene del cliente)
  IF p_staff_id IS NOT NULL THEN
    PERFORM 1 FROM public.staff WHERE id = p_staff_id AND user_id = v_uid;
    IF NOT FOUND THEN p_staff_id := NULL; END IF;
  END IF;

  SELECT s.tax_rate INTO v_tax_rate FROM public.settings s WHERE s.user_id = v_uid;
  v_tax_rate := COALESCE(v_tax_rate, 0.1600);

  IF p_customer_id IS NOT NULL THEN
    SELECT COALESCE(c.tax_exempt, false) INTO v_tax_exempt
    FROM public.customers c WHERE c.id = p_customer_id AND c.user_id = v_uid;
    IF v_tax_exempt THEN
      v_tax_rate := 0;
    END IF;
  END IF;

  INSERT INTO public.sales (user_id, customer_id, staff_id, payment_method, discount_amount, tax_rate)
  VALUES (v_uid, p_customer_id, p_staff_id, COALESCE(p_payment_method, 'efectivo'), v_discount, v_tax_rate)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida en la venta';
    END IF;

    v_is_service := (v_item ? 'service_id') AND (v_item->>'service_id') IS NOT NULL;

    IF v_is_service THEN
      SELECT * INTO v_service FROM public.services
      WHERE id = (v_item->>'service_id')::uuid AND user_id = v_uid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Servicio no encontrado: %', v_item->>'service_id';
      END IF;

      INSERT INTO public.sale_items
        (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total)
      VALUES
        (v_uid, v_sale_id, NULL, v_service.id, v_service.name, NULL,
         v_service.price, v_qty, v_service.price * v_qty);

      v_subtotal := v_subtotal + (v_service.price * v_qty);
    ELSE
      SELECT * INTO v_product FROM public.products
      WHERE id = (v_item->>'product_id')::uuid AND user_id = v_uid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto no encontrado: %', v_item->>'product_id';
      END IF;

      INSERT INTO public.sale_items
        (user_id, sale_id, product_id, service_id, product_name, sku, unit_price, quantity, line_total)
      VALUES
        (v_uid, v_sale_id, v_product.id, NULL, v_product.name, v_product.sku,
         v_product.price, v_qty, v_product.price * v_qty);

      v_subtotal := v_subtotal + (v_product.price * v_qty);

      UPDATE public.products
        SET stock_level = stock_level - v_qty, updated_at = now()
      WHERE id = v_product.id AND user_id = v_uid;
    END IF;
  END LOOP;

  v_taxable    := GREATEST(v_subtotal - v_discount, 0);
  v_tax_amount := ROUND(v_taxable * v_tax_rate, 2);
  v_total      := v_taxable + v_tax_amount;

  UPDATE public.sales
    SET subtotal = v_subtotal, tax_amount = v_tax_amount, total = v_total
  WHERE id = v_sale_id AND user_id = v_uid;

  RETURN v_sale_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_sale(uuid, text, numeric, jsonb, uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.create_sale(uuid, text, numeric, jsonb, uuid) TO authenticated;

-- 7. Función para desactivar un trabajador (SECURITY DEFINER para evitar RLS conflictos)
CREATE OR REPLACE FUNCTION public.deactivate_worker(p_worker_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_worker_id
      AND is_worker = true
      AND workspace_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para desactivar este trabajador';
  END IF;

  UPDATE public.profiles
  SET is_worker = false, workspace_id = null, staff_id = null
  WHERE id = p_worker_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deactivate_worker(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.deactivate_worker(uuid) TO authenticated;
