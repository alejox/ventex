-- Grant permissions on the new variant_label column to authenticated users.
-- Mirrors the pattern used for every other writable column on products.
GRANT SELECT, INSERT, UPDATE (variant_label) ON public.products TO authenticated;
