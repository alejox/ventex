-- Varias páginas web ("sedes") por negocio.
--
-- Hasta ahora `business_sites` tenía UNIQUE (user_id): una página por negocio.
-- Cada sede nueva es otra fila con su propio slug (URL), nombre, textos, fotos
-- y diseño. Comparte con las demás lo OPERATIVO del negocio —equipo, servicios,
-- productos, agenda y horarios—: es otra vitrina del mismo negocio, no otro
-- negocio. Las reservas de cualquiera de ellas caen en la misma agenda.
--
-- Las RPC públicas ya resuelven la sede por slug y de ahí sacan el inquilino
-- (`s.user_id`), así que no cambian. Lo que asumía "una fila por inquilino" y sí
-- se toca: publicar (ahora por id) y el nombre público.

-- 1. Quitar el UNIQUE (user_id).
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.business_sites'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname)
        from unnest(con.conkey) k
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
      ) = array['user_id']
  loop
    execute format('alter table public.business_sites drop constraint %I', c.conname);
  end loop;
end;
$$;

create index if not exists business_sites_user_id_idx
  on public.business_sites (user_id, created_at);

-- 2. Nombre propio de la sede (opcional). Vacío = el nombre del negocio.
alter table public.business_sites
  add column if not exists site_name text;

alter table public.business_sites
  drop constraint if exists business_sites_site_name_len;
alter table public.business_sites
  add constraint business_sites_site_name_len
  check (site_name is null or char_length(site_name) <= 80);

-- 3. Tope de sedes por negocio: cada una reserva un slug público.
create or replace function public.business_sites_cap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.business_sites where user_id = new.user_id) >= 10 then
    raise exception 'Llegaste al máximo de 10 páginas web por negocio.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists business_sites_cap_trg on public.business_sites;
create trigger business_sites_cap_trg
  before insert on public.business_sites
  for each row execute function public.business_sites_cap();

-- 4. Publicar / retirar una sede concreta. La versión sin id actualizaba
--    `where user_id = ...` y con varias filas habría publicado TODAS.
drop function if exists public.set_business_site_published(boolean);

create or replace function public.set_business_site_published(p_site_id uuid, p_published boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site public.business_sites%rowtype;
begin
  if auth.uid() is null or auth.uid() <> public.get_effective_user_id() then
    raise exception 'Solo el dueño puede publicar la página web.' using errcode = '42501';
  end if;

  update public.business_sites
  set
    published = p_published,
    published_config = case when p_published then draft_config else published_config end,
    updated_at = now()
  where id = p_site_id
    and user_id = public.get_effective_user_id()
  returning * into v_site;

  if not found then
    raise exception 'Primero guardá la página web.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_site);
end;
$$;

revoke all on function public.set_business_site_published(uuid, boolean) from public, anon;
grant execute on function public.set_business_site_published(uuid, boolean) to authenticated;

-- 5. La vista previa del dueño devolvía "su única fila": ahora, la más antigua.
create or replace function public.own_site_preview()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.site_public_projection(s.user_id)
  from public.business_sites s
  where s.user_id = public.get_effective_user_id()
  order by s.created_at
  limit 1;
$$;

-- 6. El nombre público: el de la sede si lo tiene, si no el del negocio. Se
--    parchea la línea sobre la definición viva en vez de copiar la función
--    entera, y se aborta si no se la encuentra (no dejar a medias).
do $$
declare
  src text := pg_get_functiondef('public.public_site_by_slug(text)'::regprocedure);
  old_line constant text := '''businessName'',    coalesce(nullif(btrim(p.business_name), ''''), ''Mi negocio''),';
  new_line constant text := '''businessName'',    coalesce(nullif(btrim(s.site_name), ''''), nullif(btrim(p.business_name), ''''), ''Mi negocio''),';
begin
  if position(new_line in src) > 0 then
    return; -- ya parcheada
  end if;
  if position(old_line in src) = 0 then
    raise exception 'public_site_by_slug: no se encontró la línea de businessName para parchear';
  end if;
  execute replace(src, old_line, new_line);
end;
$$;
