-- =====================================================================
-- Consolida la seguridad y el rendimiento del esquema multi-tenant.
-- 1. RLS: una sola política FOR ALL por tabla, TO authenticated,
--    con auth.uid() envuelto en SELECT y WITH CHECK explícito.
-- 2. Índices en las foreign keys sin cobertura.
-- 3. Trigger set_user_id endurecido (SECURITY INVOKER, search_path fijo,
--    EXECUTE revocado) y extendido a las 4 tablas para consistencia.
-- =====================================================================

-- ---------- 1. Eliminar políticas existentes (duplicadas / TO public) ----------
drop policy if exists "users can manage their own categories" on public.categories;
drop policy if exists "Usuarios eliminan sus propias categorias" on public.categories;
drop policy if exists "Usuarios insertan sus propias categorias" on public.categories;
drop policy if exists "Usuarios ven sus propias categorias" on public.categories;
drop policy if exists "Usuarios actualizan sus propias categorias" on public.categories;

drop policy if exists "users can manage their own customers" on public.customers;
drop policy if exists "users can manage their own distributors" on public.distributors;

drop policy if exists "Usuarios pueden eliminar sus propios productos" on public.products;
drop policy if exists "Usuarios pueden insertar sus propios productos" on public.products;
drop policy if exists "Usuarios pueden ver sus propios productos" on public.products;
drop policy if exists "Usuarios pueden actualizar sus propios productos" on public.products;

-- ---------- 2. Política única por tabla (ownership + WITH CHECK) ----------
create policy "Users manage own categories" on public.categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own customers" on public.customers
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own distributors" on public.distributors
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own products" on public.products
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------- 3. Índices en foreign keys sin cobertura ----------
create index if not exists customers_user_id_idx on public.customers (user_id);
create index if not exists distributors_user_id_idx on public.distributors (user_id);
create index if not exists products_category_id_idx on public.products (category_id);

-- ---------- 4. Endurecer la función del trigger ----------
create or replace function public.set_user_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.user_id = (select auth.uid());
  return new;
end;
$$;

revoke execute on function public.set_user_id() from public, anon, authenticated;

-- ---------- 5. Triggers consistentes en las 4 tablas ----------
drop trigger if exists set_customers_user_id on public.customers;
create trigger set_customers_user_id
  before insert on public.customers
  for each row execute function public.set_user_id();

drop trigger if exists set_distributors_user_id on public.distributors;
create trigger set_distributors_user_id
  before insert on public.distributors
  for each row execute function public.set_user_id();
