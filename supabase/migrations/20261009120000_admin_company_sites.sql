-- Páginas web (landings) de cada negocio para el panel Super Admin → Empresas.
--
-- Complementaria, igual que admin_company_activity: el panel sigue funcionando
-- sin ella. Devuelve todas las sedes (un negocio puede tener hasta 10), con su
-- estado de publicación, para que el admin vea el enlace público de cada una.

create or replace function public.admin_company_sites()
returns table (
  user_id uuid,
  slug text,
  site_name text,
  published boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_super_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
  select s.user_id, s.slug, s.site_name, s.published, s.created_at
  from public.business_sites s
  order by s.user_id, s.created_at;
end;
$function$;

revoke all on function public.admin_company_sites() from public, anon;
grant execute on function public.admin_company_sites() to authenticated;
