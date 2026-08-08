-- Los nombres de categoría se guardan normalizados, y la unicidad no distingue
-- mayúsculas.
--
-- Dos hallazgos de QA que en realidad eran uno solo:
--
--   1. "Se pueden crear categorías duplicadas." El índice único
--      `categories_user_id_name_key` existe, pero compara byte a byte: para
--      Postgres 'Electronica' y 'ELECTRONICA' son dos nombres distintos, así
--      que el duplicado entraba sin chistar y fragmentaba inventario y
--      reportes.
--
--   2. "Inventario muestra 'Electronica' en minúsculas y Categorías en
--      mayúsculas." La fila estaba guardada en mixto desde antes de que el
--      formulario normalizara; la pantalla de Categorías lo tapaba con un
--      `text-transform: uppercase` de CSS. Inventario mostraba la verdad.
--
-- La raíz es la misma: el nombre nunca se normalizó en la base. Se arregla acá,
-- que es el único lugar donde la garantía vale para todos los caminos.

BEGIN;

-- 1) Normalizar lo que ya está. Verificado antes de escribir esto: no hay dos
--    filas del mismo negocio que colisionen al pasarlas a mayúsculas.
UPDATE public.categories
SET name = upper(btrim(name))
WHERE name IS DISTINCT FROM upper(btrim(name));

-- 2) La unicidad real: por negocio y sin distinguir mayúsculas.
--    Se suma al índice exacto que ya existía en vez de reemplazarlo: éste es
--    estrictamente más fuerte, y dejar el otro no cuesta nada.
CREATE UNIQUE INDEX IF NOT EXISTS categories_user_id_name_ci_key
  ON public.categories (user_id, upper(btrim(name)));

-- 3) La garantía de que el dato nace normalizado, venga del formulario, de una
--    importación o de un script. Sin esto, mañana vuelve a entrar un
--    'Electronica' y la pantalla vuelve a necesitar maquillaje de CSS.
ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_name_normalized;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_name_normalized
  CHECK (name = upper(btrim(name)) AND name <> '');

COMMIT;
