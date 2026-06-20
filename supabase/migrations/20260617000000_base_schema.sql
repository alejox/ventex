-- =====================================================================
-- ESQUEMA BASE (reconstruido).
-- Estas 4 tablas se crearon ANTES de que empezara el historial de
-- migraciones de Supabase, por lo que su DDL original no estaba versionado.
-- Este archivo lo reconstruye desde la estructura viva para que el repo
-- pueda levantar la BD desde cero (supabase db reset).
--
-- Refleja el estado PREVIO a las migraciones posteriores, por eso aquí:
--   - NO existe customers.doc_type / distributors.doc_type
--       (los añade 20260620012351)
--   - NO existe products.distributor_id
--       (lo añade 20260620005908)
--   - user_id NO lleva DEFAULT auth.uid()
--       (lo añade 20260618235432)
--   - Las políticas usan los nombres antiguos que
--       20260618232030 elimina y reemplaza.
-- =====================================================================

-- ---------- categories ----------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default timezone('utc'::text, now()),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text
);

-- ---------- customers ----------
create table if not exists public.customers (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  email          text,
  phone          text,
  identification text,
  tax_exempt     boolean default false,
  created_at     timestamptz default now(),
  user_id        uuid not null references auth.users(id) on delete cascade
);

-- ---------- distributors ----------
create table if not exists public.distributors (
  id            uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  rfc_rut       text,
  status        text default 'active',
  created_at    timestamptz default now(),
  user_id       uuid not null references auth.users(id) on delete cascade
);

-- ---------- products ----------
create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default timezone('utc'::text, now()),
  updated_at     timestamptz not null default timezone('utc'::text, now()),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  sku            text not null,
  price          numeric not null default 0.00,
  stock_level    integer not null default 0,
  image_url      text,
  status         text default 'active',
  category_id    uuid references public.categories(id) on delete set null,
  unit           text not null default 'Unidad',
  purchase_price numeric not null default 0
);

-- ---------- RLS ----------
alter table public.categories   enable row level security;
alter table public.customers    enable row level security;
alter table public.distributors enable row level security;
alter table public.products     enable row level security;

grant select, insert, update, delete on public.categories   to authenticated;
grant select, insert, update, delete on public.customers     to authenticated;
grant select, insert, update, delete on public.distributors  to authenticated;
grant select, insert, update, delete on public.products      to authenticated;

-- Políticas iniciales (nombres antiguos). 20260618232030 las reemplaza por
-- una política única "Users manage own X" por tabla.
create policy "users can manage their own categories" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users can manage their own customers" on public.customers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users can manage their own distributors" on public.distributors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Usuarios pueden ver sus propios productos" on public.products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Trigger set_user_id (versión base; endurecida luego) ----------
create or replace function public.set_user_id()
returns trigger language plpgsql as $$
begin
  new.user_id = auth.uid();
  return new;
end;
$$;

create trigger set_categories_user_id   before insert on public.categories   for each row execute function public.set_user_id();
create trigger set_customers_user_id     before insert on public.customers     for each row execute function public.set_user_id();
create trigger set_distributors_user_id  before insert on public.distributors  for each row execute function public.set_user_id();
create trigger set_products_user_id      before insert on public.products      for each row execute function public.set_user_id();
