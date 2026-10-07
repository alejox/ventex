-- [4] sales.payment_method no tenía CHECK: cualquier texto que llegara a
-- create_sale quedaba guardado, y los reportes/arqueos (que agrupan por método)
-- lo trataban como un método más. create_sale ya lo valida
-- (20261007140000, METODO_PAGO_INVALIDO); esto lo cierra en la tabla.
--
-- Conjunto: los cuatro de sale_payments_payment_method_check + 'split', que lo
-- pone create_sale cuando el cobro llega repartido. Medido antes de aplicar:
-- en vivo solo hay efectivo/tarjeta/transferencia/credito, así que se valida en
-- el acto (NOT VALID + VALIDATE no bloquea escrituras mientras revisa).

alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check
  check (payment_method = any (array['efectivo'::text, 'tarjeta'::text, 'transferencia'::text, 'credito'::text, 'split'::text]))
  not valid;
alter table public.sales validate constraint sales_payment_method_check;
