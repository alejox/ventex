-- Segunda plantilla de barbería: `barberia-artesanal`.
--
-- No es una variante de color de la que ya existe. `barberia` es oscura,
-- dorada y editorial; esta es clara y cálida, con titulares manuscritos y los
-- servicios en círculos. Un negocio elige una estética, no un tono.
--
-- Se agrega al CHECK en vez de reemplazar: los salones que ya están en
-- `barberia` siguen viendo exactamente lo mismo.

alter table public.business_sites
  drop constraint business_sites_template_valid;

alter table public.business_sites
  add constraint business_sites_template_valid
  check (template = any (array[
    'clasico'::text,
    'moderno'::text,
    'minimal'::text,
    'barberia'::text,
    'barberia-artesanal'::text
  ]));
