-- `terminos` pasa a ser una ruta real, asi que deja de estar disponible como slug.
--
-- El sitio publico de cada negocio vive en la raiz (`/<slug>`), y por eso
-- `business_sites_slug_not_reserved` bloquea los nombres que ya son rutas. La
-- lista traia `privacidad`, `privacy`, `terms` y `legal` — pero NO `terminos`,
-- que es justo la ruta que se agrega ahora (`app/(legal)/terminos`).
--
-- Sin esto, un negocio podia reclamar el slug `terminos` y quedarse con un sitio
-- inalcanzable: Next.js resuelve los segmentos estaticos antes que los
-- dinamicos, asi que `/terminos` mostraria el documento legal y el negocio no
-- tendria forma de darse cuenta salvo visitando su propia URL. Verificado antes
-- de aplicar: ningun tenant lo tiene tomado hoy.
--
-- Se suma tambien `terminos-y-condiciones`, que es como lo escribiria alguien
-- que quiere publicar SUS propios terminos en su micro-sitio y terminaria
-- chocando con el mismo documento.

BEGIN;

ALTER TABLE public.business_sites
  DROP CONSTRAINT IF EXISTS business_sites_slug_not_reserved;

ALTER TABLE public.business_sites
  ADD CONSTRAINT business_sites_slug_not_reserved
  CHECK (slug NOT IN (
    'admin', 'api', 'auth', 'dashboard', 'reseller', 'offline', 'assets',
    'login', 'register', 'reset-password', 'update-password', 'workspace',
    'www', 'app', 'ventex', 'soporte', 'ayuda', 'blog', 'docs', 'legal',
    'precios', 'planes', 'checkout', 'billing', 'pricing', 'terms',
    'privacidad', 'privacy', 'static', 'public', 'null', 'undefined',
    'terminos', 'terminos-y-condiciones'
  ));

COMMIT;
