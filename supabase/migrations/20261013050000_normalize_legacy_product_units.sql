-- The quick-add modal offered "Kg" and "Litro", which are not measure units
-- (`is_measure_unit` knows "kg" and "L"). Products saved with them were treated
-- as countable: `allows_fractions` false, no conversion in recipes. Same meaning,
-- canonical spelling: the stock value does not change. Measured before applying:
-- 3 products with "Kg", 0 with "Litro"; no recipe line, recipe yield, batch or
-- sale consumption used either spelling. The modal now shares PRODUCT_UNITS
-- (lib/units.ts) with the full product form.
--
-- `products_guard_edit` only lets an app user with `inventory_edit` change a
-- product; a migration has no app user, so that one guard is switched off for
-- this transaction only (every other trigger, recipe guards included, still
-- runs and validates the change).
alter table public.products disable trigger products_guard_edit;
update public.products set unit = 'kg' where unit = 'Kg';
update public.products set unit = 'L' where unit = 'Litro';
alter table public.products enable trigger products_guard_edit;
