-- Zero out stock, price, package_price for all parent container products that group variants
-- Parent products are container items, so financial value and sellable inventory belong exclusively to variants.

UPDATE public.products
SET
  stock_level = 0,
  price = 0,
  package_price = NULL
WHERE id IN (
  SELECT DISTINCT parent_product_id
  FROM public.products
  WHERE parent_product_id IS NOT NULL
);
