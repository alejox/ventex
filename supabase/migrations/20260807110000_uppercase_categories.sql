-- Normalizar a MAYÚSCULAS todas las categorías existentes en la base de datos
UPDATE public.categories
SET name = UPPER(name)
WHERE name IS NOT NULL AND name != UPPER(name);
