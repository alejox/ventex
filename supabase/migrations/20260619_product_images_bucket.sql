-- Bucket público para imágenes de producto (5MB máx, solo imágenes).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Nota: al ser un bucket público, las URLs se sirven sin policy de SELECT.
-- No se crea una policy de lectura amplia para no permitir listar archivos.

-- Escritura aislada por usuario: el primer segmento de la ruta debe ser su uid
-- (objetos guardados como `${auth.uid()}/archivo`).
create policy "product_images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "product_images_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "product_images_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
