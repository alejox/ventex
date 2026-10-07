-- Recetas y producción (1/5): esquema.
--
-- Módulo OPT-IN `production` (profiles.modules->>'production'), disponible para
-- todo tipo de negocio y apagado por defecto. Dos piezas:
--
--   * Receta de VENTA (kind 'sale'): un producto o un servicio declara qué
--     insumos gasta por unidad vendida (latte → café 20 g, leche 200 ml, vaso).
--     create_sale descuenta los insumos y deja en sale_item_consumptions
--     EXACTAMENTE lo que descontó, que es lo que void_sale devuelve. Un
--     producto con receta de venta NO lleva stock propio (tracks_stock=false):
--     su stock está en sus insumos.
--   * Receta de PRODUCCIÓN (kind 'production'): un preparado (líquido de
--     granizado, masa de pizza) declara sus insumos y su RENDIMIENTO. Registrar
--     un lote (production_batches) consume insumos y suma stock del preparado,
--     que a su vez puede ser insumo de una receta de venta. Solo un nivel: la
--     venta no "expande" preparados, los consume como cualquier insumo.
--
-- Unidades: la línea guarda la cantidad en la unidad que escribió la persona
-- (20 g de un insumo que se compra en kg) y se convierte al usarla con
-- unit_factor(). Espejo en TS: lib/units.ts — si cambia uno, cambia el otro.
--
-- Escrituras SOLO por RPC (SECURITY DEFINER): ninguna tabla nueva tiene policy
-- de INSERT/UPDATE/DELETE y a anon/authenticated se les revoca la escritura.
-- Las columnas de COSTO se leen solo por get_production_batch_costs (permiso
-- inventory_costs): GRANT por columna, nunca SELECT de tabla entera.

-- ------------------------------------------------------------ helpers
create or replace function public.production_module_enabled()
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce((
    select (p.modules ->> 'production')::boolean
    from public.profiles p
    where p.id = public.get_effective_user_id()
  ), false);
$function$;

revoke execute on function public.production_module_enabled() from public, anon;
grant execute on function public.production_module_enabled() to authenticated;

-- Factor para pasar una cantidad de `p_from` a `p_to` (cantidad_to =
-- cantidad_from * factor). NULL = unidades incompatibles. Base por dimensión:
-- masa en g, volumen en ml, longitud en cm. Toda otra unidad (Unidad, Par,
-- Docena, Caja, Pack…) solo es compatible consigo misma.
create or replace function public.unit_factor(p_from text, p_to text)
 returns numeric
 language sql
 immutable
 set search_path to ''
as $function$
  with u(unit, dim, base) as (
    values
      ('g',  'mass',   1::numeric),
      ('kg', 'mass',   1000::numeric),
      ('lb', 'mass',   453.59237::numeric),
      ('ml', 'volume', 1::numeric),
      ('L',  'volume', 1000::numeric),
      ('cm', 'length', 1::numeric),
      ('m',  'length', 100::numeric)
  )
  select case
    when p_from is null or p_to is null then null
    when p_from = p_to then 1::numeric
    else (
      select f.base / t.base
        from u f join u t on t.dim = f.dim
       where f.unit = p_from and t.unit = p_to
    )
  end;
$function$;

revoke execute on function public.unit_factor(text, text) from public, anon;
grant execute on function public.unit_factor(text, text) to authenticated;

-- ------------------------------------------------------------ products
alter table public.products
  add column if not exists is_ingredient boolean not null default false;

comment on column public.products.is_ingredient is
  'Solo insumo: se compra y tiene stock, pero no se vende (no aparece en el POS ni en el sitio público).';

-- ------------------------------------------------------------ recipes
create table if not exists public.recipes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('sale', 'production')),
  product_id  uuid references public.products(id) on delete cascade,
  service_id  uuid references public.services(id) on delete cascade,
  yield_qty   numeric(12,3),
  yield_unit  text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint recipes_one_target check ((product_id is null) <> (service_id is null)),
  constraint recipes_production_shape check (
    kind <> 'production' or (product_id is not null and yield_qty > 0 and yield_unit is not null)
  ),
  constraint recipes_sale_shape check (kind <> 'sale' or (yield_qty is null and yield_unit is null))
);

create unique index if not exists recipes_one_per_product on public.recipes (product_id) where product_id is not null;
create unique index if not exists recipes_one_per_service on public.recipes (service_id) where service_id is not null;
create index if not exists recipes_user_id_idx on public.recipes (user_id);

create table if not exists public.recipe_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  recipe_id     uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.products(id) on delete restrict,
  quantity      numeric(14,4) not null check (quantity > 0),
  unit          text not null,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint recipe_items_one_per_ingredient unique (recipe_id, ingredient_id)
);

create index if not exists recipe_items_ingredient_idx on public.recipe_items (ingredient_id);
create index if not exists recipe_items_user_id_idx on public.recipe_items (user_id);

-- Lo que cada línea de venta descontó de cada insumo. Sin claves únicas a
-- propósito: create_sale atrapa unique_violation para su idempotencia, y un
-- choque acá se confundiría con un reintento.
create table if not exists public.sale_item_consumptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  sale_id       uuid not null references public.sales(id) on delete cascade,
  sale_item_id  uuid not null references public.sale_items(id) on delete cascade,
  ingredient_id uuid references public.products(id) on delete set null,
  quantity      numeric(12,3) not null check (quantity > 0),
  unit          text not null,
  unit_cost     numeric(14,4),
  created_at    timestamptz not null default now()
);

create index if not exists sale_item_consumptions_sale_idx on public.sale_item_consumptions (sale_id);
create index if not exists sale_item_consumptions_ingredient_idx on public.sale_item_consumptions (ingredient_id, created_at);
create index if not exists sale_item_consumptions_user_id_idx on public.sale_item_consumptions (user_id);

-- ------------------------------------------------------------ producción
create table if not exists public.production_batch_counters (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  last_number bigint not null default 0
);

create table if not exists public.production_batches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  batch_number    bigint not null,
  product_id      uuid not null references public.products(id) on delete restrict,
  recipe_id       uuid references public.recipes(id) on delete set null,
  batches         numeric(12,3),
  output_qty      numeric(12,3) not null check (output_qty > 0),
  output_unit     text not null,
  -- Si el lote sumó stock al preparado (anular resta exactamente eso).
  output_stock_applied boolean not null default true,
  total_cost      numeric(12,2),
  unit_cost       numeric(14,4),
  cost_complete   boolean not null default false,
  status          text not null default 'completed' check (status in ('completed', 'void')),
  notes           text,
  client_batch_id uuid,
  created_by      uuid,
  membership_id   uuid,
  created_at      timestamptz not null default now(),
  voided_at       timestamptz,
  voided_by       uuid,
  void_reason     text,
  constraint production_batches_number_per_tenant unique (user_id, batch_number)
);

create unique index if not exists production_batches_client_id
  on public.production_batches (user_id, client_batch_id) where client_batch_id is not null;
create index if not exists production_batches_recent on public.production_batches (user_id, created_at desc);
create index if not exists production_batches_product_idx on public.production_batches (product_id);

create table if not exists public.production_batch_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  batch_id      uuid not null references public.production_batches(id) on delete cascade,
  ingredient_id uuid references public.products(id) on delete set null,
  ingredient_name text not null,
  quantity      numeric(12,3) not null check (quantity > 0),
  unit          text not null,
  -- Si este insumo se descontó del stock (uno sin control de stock solo cuenta
  -- para el costo). Anular devuelve únicamente lo que se descontó.
  stock_applied boolean not null default true,
  unit_cost     numeric(14,4),
  line_cost     numeric(12,2),
  created_at    timestamptz not null default now()
);

create index if not exists production_batch_items_batch_idx on public.production_batch_items (batch_id);
create index if not exists production_batch_items_ingredient_idx on public.production_batch_items (ingredient_id);
create index if not exists production_batch_items_user_id_idx on public.production_batch_items (user_id);

-- ------------------------------------------------------------ RLS y grants
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.sale_item_consumptions enable row level security;
alter table public.production_batch_counters enable row level security;
alter table public.production_batches enable row level security;
alter table public.production_batch_items enable row level security;

create policy workspace_recipes_read on public.recipes
  for select to authenticated
  using (
    user_id = (select public.get_effective_user_id())
    and (
      (select public.worker_can('inventory')) or (select public.worker_can('inventory_edit'))
      or (select public.worker_can('services')) or (select public.worker_can('catalogo'))
      or (select public.worker_can('production'))
    )
  );

create policy workspace_recipe_items_read on public.recipe_items
  for select to authenticated
  using (
    user_id = (select public.get_effective_user_id())
    and (
      (select public.worker_can('inventory')) or (select public.worker_can('inventory_edit'))
      or (select public.worker_can('services')) or (select public.worker_can('catalogo'))
      or (select public.worker_can('production'))
    )
  );

create policy workspace_sale_item_consumptions_read on public.sale_item_consumptions
  for select to authenticated
  using (
    user_id = (select public.get_effective_user_id())
    and ((select public.worker_can('sales')) or (select public.worker_can('inventory_stock')))
  );

create policy workspace_production_batches_read on public.production_batches
  for select to authenticated
  using (
    user_id = (select public.get_effective_user_id())
    and ((select public.worker_can('production')) or (select public.worker_can('inventory_stock')))
  );

create policy workspace_production_batch_items_read on public.production_batch_items
  for select to authenticated
  using (
    user_id = (select public.get_effective_user_id())
    and ((select public.worker_can('production')) or (select public.worker_can('inventory_stock')))
  );
-- production_batch_counters: RLS sin policies = nadie la lee desde la API.

revoke all on public.recipes, public.recipe_items, public.sale_item_consumptions,
  public.production_batch_counters, public.production_batches, public.production_batch_items
  from anon, authenticated;

grant select on public.recipes, public.recipe_items to authenticated;

-- Costos fuera del SELECT directo: se piden por get_production_batch_costs.
grant select (id, user_id, sale_id, sale_item_id, ingredient_id, quantity, unit, created_at)
  on public.sale_item_consumptions to authenticated;
grant select (id, user_id, batch_number, product_id, recipe_id, batches, output_qty, output_unit,
              output_stock_applied, cost_complete, status, notes, client_batch_id, created_by, membership_id, created_at,
              voided_at, voided_by, void_reason)
  on public.production_batches to authenticated;
grant select (id, user_id, batch_id, ingredient_id, ingredient_name, quantity, unit, stock_applied, created_at)
  on public.production_batch_items to authenticated;

-- ------------------------------------------------------------ avisos
-- Un solo aviso abierto de "reponer insumo" por producto: la venta siguiente
-- no apila otro mientras el dueño no marque el primero como leído.
create unique index if not exists notifications_one_open_insumo
  on public.notifications (user_id, (data ->> 'product_id'))
  where type = 'insumo_bajo' and read_at is null;

-- ------------------------------------------------------------ integridad
-- Reglas de integridad (para TODO llamador, también los RPC):
--   * un producto con receta de venta no lleva stock propio;
--   * la unidad de un insumo o de un preparado no cambia de dimensión (kg→g
--     sí; kg→Unidad rompería todas las recetas que lo usan).
create or replace function public.products_guard_recipe()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if coalesce(new.tracks_stock, false) and not coalesce(old.tracks_stock, false)
     and exists (
       select 1 from public.recipes r
        where r.product_id = new.id and r.kind = 'sale'
     ) then
    raise exception 'RECETA_SIN_STOCK_PROPIO: % tiene receta; su stock se descuenta de sus insumos', new.name
      using errcode = '22023';
  end if;

  if new.unit is distinct from old.unit
     and public.unit_factor(old.unit, new.unit) is null
     and (
       exists (select 1 from public.recipe_items ri where ri.ingredient_id = new.id)
       or exists (select 1 from public.recipes r where r.product_id = new.id and r.kind = 'production')
     ) then
    raise exception 'RECETA_UNIDAD_INCOMPATIBLE: % se usa en recetas; no puede pasar de % a %', new.name, old.unit, new.unit
      using errcode = '22023';
  end if;

  return new;
end;
$function$;

drop trigger if exists products_guard_recipe on public.products;
create trigger products_guard_recipe
  before update of unit, tracks_stock on public.products
  for each row execute function public.products_guard_recipe();

-- Quien registra lotes (`production`) necesita ver los productos: el preparado
-- y sus insumos. Misma policy de lectura, con un permiso más.
alter policy workspace_products_read on public.products
  using (
    user_id = public.get_effective_user_id()
    and (
      public.worker_can('pos') or public.worker_can('catalogo') or public.worker_can('inventory')
      or public.worker_can('inventory_costs') or public.worker_can('inventory_edit') or public.worker_can('inventory_stock')
      or public.worker_can('production')
    )
  );
