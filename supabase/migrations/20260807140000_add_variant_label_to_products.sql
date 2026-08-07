-- Add variant_label column to products
-- Stores the short label that differentiates a variant from its parent.
-- e.g. 'ROJO / L', 'AZUL / XL', '500ML'
-- The full product name is composed as: "{parent_name} - {variant_label}"
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant_label text;

-- Backfill: extract label from existing variant names that follow the pattern
-- "PARENT NAME - LABEL" (the separator used by the form going forward)
UPDATE public.products
SET variant_label = TRIM(UPPER(SPLIT_PART(name, ' - ', 2)))
WHERE parent_product_id IS NOT NULL
  AND name LIKE '% - %'
  AND variant_label IS NULL;
