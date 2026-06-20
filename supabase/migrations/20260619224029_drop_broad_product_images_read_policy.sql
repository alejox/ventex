-- En un bucket público las URLs se sirven sin policy de SELECT; esta policy
-- amplia solo habilitaba listar todos los archivos (advisor 0025). Se elimina.
drop policy if exists "product_images_public_read" on storage.objects;
