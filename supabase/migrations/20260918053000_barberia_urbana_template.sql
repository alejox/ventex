-- Tercera plantilla de barbería: `barberia-urbana`.
--
-- Las tres son barberías y ninguna es la variante de otra: `barberia` es
-- editorial (oscura, dorada, serifa grande), `barberia-artesanal` es de papel
-- (clara, cobre, manuscrita) y esta es de barrio — verde, condensada en
-- versalitas y con el teléfono y la dirección arriba de todo, antes que
-- cualquier foto.

alter table public.business_sites
  drop constraint business_sites_template_valid;

alter table public.business_sites
  add constraint business_sites_template_valid
  check (template = any (array[
    'clasico'::text,
    'moderno'::text,
    'minimal'::text,
    'barberia'::text,
    'barberia-artesanal'::text,
    'barberia-urbana'::text
  ]));
