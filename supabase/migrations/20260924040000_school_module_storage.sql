-- Escuela de música — Fase 5 (U4): bucket de materiales.
--
-- El bucket es PRIVADO (public=false): a diferencia de `staff-photos`, acá no
-- hay lectura pública ni siquiera para el tenant dueño del archivo. Ninguna
-- policy de SELECT se agrega a propósito — toda descarga pasa por
-- `app/api/school/material/download/route.ts`, que valida sesión de
-- trabajador + `worker_can('school')` + tenencia, O un enlace familiar válido
-- (no vencido, no revocado, alcance por token), y entrega con una URL firmada
-- del cliente admin. Una URL de storage suelta nunca sirve por sí sola.
--
-- Nada de video en el MVP (doc §3/§C del proposal): los formatos que entran
-- son los mismos que ya usa el resto del negocio para materiales de estudio
-- (PDF, imagen, audio), con un tope de 20 MB por objeto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-materials', 'school-materials', false, 20971520,
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'audio/mpeg', 'audio/mp4', 'audio/ogg'
  ]
)
on conflict (id) do nothing;

-- Carpeta por tenant, mismo patrón que `staff-photos`
-- (`(storage.foldername(name))[1] = get_effective_user_id()::text`), pero acá
-- la escritura exige ADEMÁS `worker_can('school')`: subir/editar/borrar
-- material es una acción de la escuela, no de cualquier trabajador del
-- negocio con sesión válida.
drop policy if exists school_materials_bucket_insert on storage.objects;
create policy school_materials_bucket_insert on storage.objects
  for insert with check (
    public.worker_can('school')
    and bucket_id = 'school-materials'
    and (storage.foldername(name))[1] = (public.get_effective_user_id())::text
  );

drop policy if exists school_materials_bucket_update on storage.objects;
create policy school_materials_bucket_update on storage.objects
  for update using (
    public.worker_can('school')
    and bucket_id = 'school-materials'
    and (storage.foldername(name))[1] = (public.get_effective_user_id())::text
  ) with check (
    public.worker_can('school')
    and bucket_id = 'school-materials'
    and (storage.foldername(name))[1] = (public.get_effective_user_id())::text
  );

drop policy if exists school_materials_bucket_delete on storage.objects;
create policy school_materials_bucket_delete on storage.objects
  for delete using (
    public.worker_can('school')
    and bucket_id = 'school-materials'
    and (storage.foldername(name))[1] = (public.get_effective_user_id())::text
  );

-- Sin policy de SELECT: en la práctica todas las subidas/descargas de este
-- bucket pasan por rutas de servidor con el cliente admin (service_role
-- ignora RLS), así que las tres policies de arriba son una segunda barrera
-- para cualquier llamada directa desde el cliente — nunca la única.
