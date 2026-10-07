-- handle_new_user no copiaba `business_name` de la metadata del registro, así
-- que todo dueño registrado por correo quedaba sin nombre de negocio. Ahora lo
-- copia (si viene), y se recupera el de los perfiles que quedaron vacíos y sí
-- lo tienen en auth.users. No pisa ningún nombre ya cargado.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  insert into public.profiles (id, full_name, business_name, business_type, modules, phone)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    nullif(btrim(new.raw_user_meta_data->>'business_name'), ''),
    new.raw_user_meta_data->>'business_type',
    coalesce(new.raw_user_meta_data->'modules', '{}'::jsonb),
    nullif(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end; $function$;

update public.profiles p
set business_name = nullif(btrim(u.raw_user_meta_data->>'business_name'), '')
from auth.users u
where u.id = p.id
  and nullif(btrim(p.business_name), '') is null
  and nullif(btrim(u.raw_user_meta_data->>'business_name'), '') is not null;
