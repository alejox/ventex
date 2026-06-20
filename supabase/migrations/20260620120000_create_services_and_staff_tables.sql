-- =====================================================================
-- Módulos de Salón / Barbería: catálogo de servicios + barberos/staff.
-- Convención del proyecto: RLS FOR ALL TO authenticated con
-- (select auth.uid()), trigger set_user_id, e índice en user_id.
-- =====================================================================

-- ---------- services: catálogo de servicios (corte, barba, tinte...) ----------
create table if not exists public.services (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null,
  description      text,
  price            numeric(12,2) not null default 0,
  duration_minutes integer not null default 30 check (duration_minutes > 0),
  status           text not null default 'active',  -- active | inactive
  created_at       timestamptz not null default now()
);

-- ---------- staff: barberos / estilistas / empleados ----------
create table if not exists public.staff (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  full_name       text not null,
  role            text,                              -- Barbero | Estilista | ...
  phone           text,
  email           text,
  commission_rate numeric(5,2) not null default 0 check (commission_rate >= 0 and commission_rate <= 100),
  status          text not null default 'active',    -- active | inactive
  created_at      timestamptz not null default now()
);

-- ---------- RLS ----------
alter table public.services enable row level security;
alter table public.staff    enable row level security;

create policy "Users manage own services" on public.services
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users manage own staff" on public.staff
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------- Triggers set_user_id (función ya endurecida en migración previa) ----------
create trigger set_services_user_id before insert on public.services for each row execute function public.set_user_id();
create trigger set_staff_user_id     before insert on public.staff    for each row execute function public.set_user_id();

-- ---------- Índices en foreign keys ----------
create index if not exists services_user_id_idx on public.services (user_id);
create index if not exists staff_user_id_idx     on public.staff (user_id);
