-- Garantiza que la llave de la tienda (business_key) sea única entre negocios,
-- de forma case-insensitive (staff_login compara con upper(trim(...))).
-- Los perfiles sin llave (workers, o dueños que aún no la generaron) no chocan.
create unique index if not exists profiles_business_key_unique
  on public.profiles (upper(business_key))
  where business_key is not null;
