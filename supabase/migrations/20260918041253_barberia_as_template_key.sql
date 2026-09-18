-- "Barbería" pasa a ser una PLANTILLA elegible, no una consecuencia del tipo de
-- negocio.
--
-- Hasta acá la presentación editorial de barbería se activaba sola cuando el
-- perfil era `salon`, con la clave `moderno` guardada. El selector de Diseño
-- mostraba tres tarjetas y decía "cambian el look, no el contenido" — había una
-- cuarta escondida que nadie podía elegir, y el dueño de una tienda que la
-- quería no tenía ninguna forma de pedirla salvo cambiarse el tipo de negocio,
-- que además le cambia módulos y navegación de todo el panel.

alter table public.business_sites
  drop constraint business_sites_template_valid;

alter table public.business_sites
  add constraint business_sites_template_valid
  check (template = any (array['clasico'::text, 'moderno'::text, 'minimal'::text, 'barberia'::text]));

-- Los salones que HOY están en `moderno` ya ven la presentación de barbería,
-- porque el desvío por tipo de negocio se la daba. Al sacar ese desvío pasarían
-- a la moderna genérica de un día para el otro, en sitios que ya están
-- publicados. Se mueven a la clave nueva para que sigan viendo exactamente lo
-- mismo: es una migración de datos, no un cambio de diseño.
update public.business_sites s
set template = 'barberia'
from public.profiles p
where p.id = s.user_id
  and s.template = 'moderno'
  and p.business_type = 'salon';
