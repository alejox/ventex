-- Structured expense categories. Keep the legacy expenses.category column for
-- backwards compatibility while existing records are migrated to "Otros".
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.get_effective_user_id() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#6366f1',
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_categories_name_not_blank check (length(trim(name)) > 0),
  constraint expense_categories_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists expense_categories_user_name_key
  on public.expense_categories (user_id, lower(trim(name)));
create index if not exists expense_categories_user_active_idx
  on public.expense_categories (user_id, is_active);
-- At most one default category per tenant. "Otros" is the only is_default row.
create unique index if not exists expense_categories_one_default_per_user
  on public.expense_categories (user_id) where is_default;

alter table public.expenses add column if not exists category_id uuid;
alter table public.expenses add column if not exists updated_at timestamptz not null default now();
-- Align with the tenant convention (AGENTS.md): worker writes must land on the
-- owner's tenant. Behavior-neutral today (owners: auth.uid() == effective id;
-- workers: RLS blocks writes), future-proof if workers ever get expense access.
alter table public.expenses alter column user_id set default public.get_effective_user_id();
alter table public.expenses drop constraint if exists expenses_amount_check;
alter table public.expenses add constraint expenses_amount_positive check (amount > 0);

alter table public.expense_categories enable row level security;
-- Workers of the tenant read categories (same tenant view the owner manages);
-- only the owner writes them, mirroring the expenses RLS split.
create policy "workspace_expense_categories_owner_write" on public.expense_categories
  for all to authenticated
  using (user_id = public.get_effective_user_id() and public.is_tenant_owner())
  with check (user_id = public.get_effective_user_id() and public.is_tenant_owner());
create policy "workspace_expense_categories_read" on public.expense_categories
  for select to authenticated
  using (user_id = public.get_effective_user_id());

alter table public.expenses drop constraint if exists expenses_category_id_fkey;
alter table public.expenses add constraint expenses_category_id_fkey
  foreign key (category_id) references public.expense_categories(id) on delete restrict;

create index if not exists expenses_category_id_idx on public.expenses (category_id);

-- updated_at maintenance reuses the repo's canonical trigger (same as settings).
drop trigger if exists handle_expense_categories_updated_at on public.expense_categories;
create trigger handle_expense_categories_updated_at before update on public.expense_categories
  for each row execute function public.handle_updated_at();
drop trigger if exists handle_expenses_updated_at on public.expenses;
create trigger handle_expenses_updated_at before update on public.expenses
  for each row execute function public.handle_updated_at();

-- The default category is protected at the database level, not just in the UI:
-- it cannot be deleted, deactivated, or demoted. The unique partial index above
-- already guarantees at most one default per tenant.
create or replace function public.protect_default_expense_category()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.is_default then
    if new.is_default is distinct from true then
      raise exception 'La categoría por defecto no puede dejar de ser la categoría por defecto';
    end if;
    if new.is_active is distinct from true then
      raise exception 'La categoría por defecto no puede desactivarse';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_default_expense_category() from public, anon;
grant execute on function public.protect_default_expense_category() to authenticated, service_role;
drop trigger if exists protect_default_expense_category on public.expense_categories;
create trigger protect_default_expense_category before update on public.expense_categories
  for each row execute function public.protect_default_expense_category();

create or replace function public.prevent_delete_default_expense_category()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.is_default then
    raise exception 'La categoría por defecto no puede eliminarse';
  end if;
  return old;
end;
$$;
revoke execute on function public.prevent_delete_default_expense_category() from public, anon;
grant execute on function public.prevent_delete_default_expense_category() to authenticated, service_role;
drop trigger if exists prevent_delete_default_expense_category on public.expense_categories;
create trigger prevent_delete_default_expense_category before delete on public.expense_categories
  for each row execute function public.prevent_delete_default_expense_category();

-- Seed the required default without creating duplicates on repeated migration
-- runs. Only owner profiles get one: worker profiles resolve to the owner's
-- tenant via get_effective_user_id(), so their own row would be dead weight.
insert into public.expense_categories (user_id, name, description, color, is_default)
select p.id, 'Otros', 'Gastos todavía no clasificados', '#64748b', true
from public.profiles p
where coalesce(p.is_worker, false) is not true
  and not exists (
    select 1 from public.expense_categories c
    where c.user_id = p.id and lower(trim(c.name)) = 'otros'
  );

-- Migrate legacy free-text categories: exact name match first, then default.
update public.expenses e
set category_id = c.id
from public.expense_categories c
where e.category_id is null
  and c.user_id = e.user_id
  and lower(trim(c.name)) = lower(trim(coalesce(nullif(e.category, ''), 'Otros')));

update public.expenses e
set category_id = c.id
from public.expense_categories c
where e.category_id is null and c.user_id = e.user_id and c.is_default;
