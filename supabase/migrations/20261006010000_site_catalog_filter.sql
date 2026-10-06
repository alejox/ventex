-- Cada página web elige, por sección, qué muestra.
--
-- La configuración vive en el snapshot publicado (`published_config.catalog`):
--   { "serviceCategoryIds": [uuid], "productCategoryIds": [uuid], "staffIds": [uuid] }
-- Una lista vacía o ausente = sin filtro (se muestra todo, como siempre). Las
-- páginas ya publicadas no tienen la clave, así que no cambian.
--
-- Solo se toca la proyección pública. Las RPC de reserva siguen contando la
-- capacidad sobre todo el equipo visible en la web: la página decide qué se
-- MUESTRA, no hace una agenda aparte.

-- ids de una lista del snapshot, o null si no hay filtro.
create or replace function public.site_catalog_ids(p_config jsonb, p_key text)
returns uuid[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(p_config #> array['catalog', p_key]) = 'array'
     and jsonb_array_length(p_config #> array['catalog', p_key]) > 0
    then array(
      select e.value::uuid
      from jsonb_array_elements_text(p_config #> array['catalog', p_key]) e(value)
      where e.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    else null
  end;
$$;

revoke all on function public.site_catalog_ids(jsonb, text) from public;
grant execute on function public.site_catalog_ids(jsonb, text) to anon, authenticated;

-- Se parchea la definición viva de `public_site_by_slug` (tres condiciones) en
-- vez de copiarla entera, y se aborta si no se encuentra alguna.
do $$
declare
  src text := pg_get_functiondef('public.public_site_by_slug(text)'::regprocedure);
  svc_old constant text := 'where sv.user_id = s.user_id and coalesce(sv.status, ''active'') = ''active''';
  svc_new constant text := 'where sv.user_id = s.user_id and coalesce(sv.status, ''active'') = ''active'' and (public.site_catalog_ids(s.published_config, ''serviceCategoryIds'') is null or sv.category_id = any(public.site_catalog_ids(s.published_config, ''serviceCategoryIds'')))';
  prd_old constant text := 'where pr.user_id = s.user_id and coalesce(pr.status, ''active'') = ''active''';
  prd_new constant text := 'where pr.user_id = s.user_id and coalesce(pr.status, ''active'') = ''active'' and (public.site_catalog_ids(s.published_config, ''productCategoryIds'') is null or pr.category_id = any(public.site_catalog_ids(s.published_config, ''productCategoryIds'')))';
  stf_old constant text := 'where stf.user_id = s.user_id';
  stf_new constant text := 'where stf.user_id = s.user_id and (public.site_catalog_ids(s.published_config, ''staffIds'') is null or stf.id = any(public.site_catalog_ids(s.published_config, ''staffIds'')))';
begin
  if position('site_catalog_ids' in src) > 0 then
    return; -- ya parcheada
  end if;
  if position(svc_old in src) = 0 or position(prd_old in src) = 0 or position(stf_old in src) = 0 then
    raise exception 'public_site_by_slug: no se encontraron las condiciones de servicios/productos/equipo para parchear';
  end if;
  execute replace(replace(replace(src, svc_old, svc_new), prd_old, prd_new), stf_old, stf_new);
end;
$$;
