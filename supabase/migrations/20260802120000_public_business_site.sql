-- Public per-tenant micro-site ("sitio web del negocio") + opening hours + online booking.
--
-- Security model — read this before touching anything here:
--   The `anon` role gets ZERO table access. Every public read goes through a
--   SECURITY DEFINER function that hand-picks the columns it exposes. That is
--   deliberate: `products` carries `purchase_price` / `commission_value` and
--   `staff` carries `email` / `phone` / `pos_pin_hash`. A plain "allow anon to
--   SELECT" policy on those tables would publish the tenant's cost structure
--   and its employees' personal data to the whole internet.
--
-- Tenancy follows the project rule: `get_effective_user_id()`, never `auth.uid()`.

-- ---------------------------------------------------------------------------
-- 1. Site configuration (one per tenant)
-- ---------------------------------------------------------------------------

create table if not exists public.business_sites (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique default public.get_effective_user_id()
                          references auth.users (id) on delete cascade,
  slug                  text not null unique,
  template              text not null default 'clasico',
  published             boolean not null default false,
  booking_enabled       boolean not null default true,
  headline              text,
  about                 text,
  hero_image_url        text,
  whatsapp              text,
  address               text,
  instagram             text,
  timezone              text not null default 'America/Bogota',
  slot_interval_minutes smallint not null default 30,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint business_sites_template_valid
    check (template in ('clasico', 'moderno', 'minimal')),

  -- Lowercase, url-safe, 3..40 chars, no leading/trailing dash.
  constraint business_sites_slug_shape
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),

  -- The public site lives at the site root (`/<slug>`), so a slug must never
  -- collide with a real route. Next.js resolves static segments before dynamic
  -- ones, so an existing route already wins — but a tenant claiming "dashboard"
  -- would still get an unreachable, confusing site. Block it at the source.
  constraint business_sites_slug_not_reserved
    check (slug not in (
      'admin', 'api', 'auth', 'dashboard', 'reseller', 'offline', 'assets',
      'login', 'register', 'reset-password', 'update-password', 'workspace',
      'www', 'app', 'ventex', 'soporte', 'ayuda', 'blog', 'docs', 'legal',
      'precios', 'planes', 'checkout', 'billing', 'pricing', 'terms',
      'privacidad', 'privacy', 'static', 'public', 'null', 'undefined'
    )),

  constraint business_sites_slot_interval_valid
    check (slot_interval_minutes in (10, 15, 20, 30, 60))
);

comment on table public.business_sites is
  'Public micro-site config per tenant. Served at /<slug> through SECURITY DEFINER RPCs; anon never reads this table directly.';

-- ---------------------------------------------------------------------------
-- 2. Opening hours (one row per weekday, per tenant)
-- ---------------------------------------------------------------------------

create table if not exists public.business_hours (
  user_id    uuid not null default public.get_effective_user_id()
               references auth.users (id) on delete cascade,
  weekday    smallint not null,           -- 0 = Sunday .. 6 = Saturday (matches extract(dow))
  is_open    boolean not null default true,
  opens_at   time not null default '09:00',
  closes_at  time not null default '18:00',

  primary key (user_id, weekday),
  constraint business_hours_weekday_range check (weekday between 0 and 6),
  constraint business_hours_range_valid   check (closes_at > opens_at)
);

comment on table public.business_hours is
  'Opening hours per weekday. Drives the bookable slots offered on the public site.';

-- ---------------------------------------------------------------------------
-- 3. RLS — tenant-scoped, authenticated only. Public access is RPC-only.
-- ---------------------------------------------------------------------------

alter table public.business_sites  enable row level security;
alter table public.business_hours  enable row level security;

drop policy if exists workspace_business_sites_read  on public.business_sites;
drop policy if exists workspace_business_sites_write on public.business_sites;
drop policy if exists workspace_business_hours_read  on public.business_hours;
drop policy if exists workspace_business_hours_write on public.business_hours;

-- The whole tenant may read its own site config (workers included: the booking
-- screens in the panel need the hours).
create policy workspace_business_sites_read
  on public.business_sites for select to authenticated
  using (user_id = public.get_effective_user_id());

-- Owner-only write. Note this does NOT use is_tenant_owner(): that helper
-- resolves through profiles.owner_id, which is never populated, so it returns
-- true for workers too. For an owner get_effective_user_id() == auth.uid();
-- for a worker it returns the OWNER's id, so the equality is the correct test.
create policy workspace_business_sites_write
  on public.business_sites for all to authenticated
  using      (user_id = public.get_effective_user_id() and auth.uid() = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id() and auth.uid() = public.get_effective_user_id());

create policy workspace_business_hours_read
  on public.business_hours for select to authenticated
  using (user_id = public.get_effective_user_id());

create policy workspace_business_hours_write
  on public.business_hours for all to authenticated
  using      (user_id = public.get_effective_user_id() and auth.uid() = public.get_effective_user_id())
  with check (user_id = public.get_effective_user_id() and auth.uid() = public.get_effective_user_id());

-- Column privileges are NOT implied by RLS: without these grants PostgREST
-- answers "permission denied" and it looks like a policy bug.
grant select, insert, update, delete on public.business_sites to authenticated;
grant select, insert, update, delete on public.business_hours to authenticated;

create index if not exists business_sites_slug_idx
  on public.business_sites (slug) where published;

-- Slot computation scans the day's appointments for one tenant.
create index if not exists appointments_tenant_date_idx
  on public.appointments (user_id, appointment_date);

-- ---------------------------------------------------------------------------
-- 4. Public read: the whole site payload, column by column.
-- ---------------------------------------------------------------------------

create or replace function public.public_site_by_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'slug',            s.slug,
    'template',        s.template,
    'businessName',    coalesce(nullif(btrim(p.business_name), ''), 'Mi negocio'),
    'businessType',    p.business_type,
    'headline',        s.headline,
    'about',           s.about,
    'heroImageUrl',    s.hero_image_url,
    'logoUrl',         st.business_profile ->> 'logoUrl',
    'whatsapp',        s.whatsapp,
    'address',         s.address,
    'instagram',       s.instagram,
    'bookingEnabled',  s.booking_enabled,
    'timezone',        s.timezone,
    'hours', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'weekday',  h.weekday,
               'isOpen',   h.is_open,
               'opensAt',  to_char(h.opens_at,  'HH24:MI'),
               'closesAt', to_char(h.closes_at, 'HH24:MI')
             ) order by h.weekday), '[]'::jsonb)
      from public.business_hours h
      where h.user_id = s.user_id
    ),
    'services', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id',              sv.id,
               'name',            sv.name,
               'description',     sv.description,
               'price',           sv.price,
               'durationMinutes', coalesce(sv.duration_minutes, 30),
               'icon',            sv.icon
             ) order by sv.name), '[]'::jsonb)
      from public.services sv
      where sv.user_id = s.user_id
        and coalesce(sv.status, 'active') = 'active'
    ),
    -- Deliberately NOT selected: purchase_price, commission_*, distributor_id,
    -- minimum_stock, barcode. Those are the tenant's business, not the public's.
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id',       pr.id,
               'name',     pr.name,
               'price',    pr.price,
               'imageUrl', pr.image_url,
               'icon',     pr.icon,
               'unit',     pr.unit,
               'inStock',  coalesce(pr.stock_level, 0) > 0
             ) order by pr.name), '[]'::jsonb)
      from public.products pr
      where pr.user_id = s.user_id
        and coalesce(pr.status, 'active') = 'active'
        and pr.parent_product_id is null
    ),
    -- Deliberately NOT selected: email, phone, pos_pin_hash, permissions,
    -- username, is_admin.
    'staff', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id',       stf.id,
               'fullName', stf.full_name,
               'role',     stf.role
             ) order by stf.full_name), '[]'::jsonb)
      from public.staff stf
      where stf.user_id = s.user_id
        and coalesce(stf.is_active, true)
        and coalesce(stf.status, 'active') = 'active'
    )
  )
  from public.business_sites s
  join public.profiles p on p.id = s.user_id
  left join public.settings st on st.user_id = s.user_id
  where s.slug = lower(btrim(p_slug))
    and s.published;
$$;

-- ---------------------------------------------------------------------------
-- 5. Public read: bookable slots for a service on a given day.
-- ---------------------------------------------------------------------------
--
-- Capacity model (this is the whole "sin barbero específico" story):
--   * A specific barber was chosen  -> capacity 1, only that barber's
--     appointments block the slot.
--   * "Cualquiera"                  -> capacity = number of active staff, so
--     the slot stays open until every barber is busy. Falls back to 1 when the
--     tenant has no staff loaded (a one-person shop).

create or replace function public.public_site_slots(
  p_slug       text,
  p_service_id uuid,
  p_date       date,
  p_staff_id   uuid default null
)
returns table (slot_time text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_site       public.business_sites%rowtype;
  v_hours      public.business_hours%rowtype;
  v_duration   int;
  v_capacity   int;
  v_open_min   int;
  v_close_min  int;
  v_min        int;
  v_start      time;
  v_end        time;
  v_taken      int;
begin
  select * into v_site
    from public.business_sites
   where slug = lower(btrim(p_slug)) and published and booking_enabled;
  if not found then return; end if;

  -- Never offer a day in the past, and cap how far ahead strangers can book.
  if p_date < (now() at time zone v_site.timezone)::date
     or p_date > (now() at time zone v_site.timezone)::date + 90 then
    return;
  end if;

  select * into v_hours
    from public.business_hours
   where user_id = v_site.user_id
     and weekday = extract(dow from p_date)::smallint;
  if not found or not v_hours.is_open then return; end if;

  select coalesce(duration_minutes, 30) into v_duration
    from public.services
   where id = p_service_id
     and user_id = v_site.user_id
     and coalesce(status, 'active') = 'active';
  if v_duration is null or v_duration <= 0 then return; end if;

  if p_staff_id is not null then
    perform 1 from public.staff
     where id = p_staff_id
       and user_id = v_site.user_id
       and coalesce(is_active, true)
       and coalesce(status, 'active') = 'active';
    if not found then return; end if;
    v_capacity := 1;
  else
    select greatest(count(*), 1) into v_capacity
      from public.staff
     where user_id = v_site.user_id
       and coalesce(is_active, true)
       and coalesce(status, 'active') = 'active';
  end if;

  v_open_min  := extract(hour from v_hours.opens_at)  * 60 + extract(minute from v_hours.opens_at);
  v_close_min := extract(hour from v_hours.closes_at) * 60 + extract(minute from v_hours.closes_at);

  -- Integer minute arithmetic on purpose: `time + interval` wraps past midnight
  -- and would loop forever on a late closing time.
  v_min := v_open_min;
  while v_min + v_duration <= v_close_min loop
    v_start := make_time(v_min / 60, v_min % 60, 0);
    v_end   := make_time((v_min + v_duration) / 60, (v_min + v_duration) % 60, 0);

    -- 30 min of breathing room: nobody books a slot that starts in 5 minutes.
    if ((p_date + v_start) at time zone v_site.timezone) > now() + interval '30 minutes' then
      select count(*) into v_taken
        from public.appointments a
       where a.user_id = v_site.user_id
         and a.appointment_date = p_date
         and coalesce(a.status, 'pending') <> 'cancelled'
         and (p_staff_id is null or a.staff_id = p_staff_id)
         and a.start_time < v_end
         and coalesce(a.end_time, a.start_time + interval '30 minutes') > v_start;

      if v_taken < v_capacity then
        slot_time := to_char(v_start, 'HH24:MI');
        return next;
      end if;
    end if;

    v_min := v_min + v_site.slot_interval_minutes;
  end loop;

  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Public write: book an appointment.
-- ---------------------------------------------------------------------------
--
-- Lands in public.appointments with status 'pending', which the dashboard
-- calendar already renders in amber ("Pendiente"). No sync, no mirror table:
-- the public site writes to the same table the panel reads.

create or replace function public.public_site_book(
  p_slug           text,
  p_service_id     uuid,
  p_date           date,
  p_time           text,
  p_customer_name  text,
  p_customer_phone text,
  p_staff_id       uuid default null,
  p_notes          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site        public.business_sites%rowtype;
  v_service     public.services%rowtype;
  v_name        text := btrim(coalesce(p_customer_name, ''));
  v_phone       text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9+]', '', 'g');
  v_start       time;
  v_customer_id uuid;
  v_recent      int;
  v_appt_id     uuid;
begin
  select * into v_site
    from public.business_sites
   where slug = lower(btrim(p_slug)) and published and booking_enabled;
  if not found then
    raise exception 'Este negocio no está recibiendo reservas en línea.'
      using errcode = 'P0002';
  end if;

  if length(v_name) < 3 then
    raise exception 'Escribí tu nombre completo.' using errcode = 'P0001';
  end if;
  if length(v_phone) < 7 then
    raise exception 'Escribí un teléfono válido para confirmarte la cita.' using errcode = 'P0001';
  end if;

  begin
    v_start := p_time::time;
  exception when others then
    raise exception 'La hora seleccionada no es válida.' using errcode = 'P0001';
  end;

  select * into v_service
    from public.services
   where id = p_service_id
     and user_id = v_site.user_id
     and coalesce(status, 'active') = 'active';
  if not found then
    raise exception 'El servicio seleccionado ya no está disponible.' using errcode = 'P0002';
  end if;

  -- Anti-spam: a stranger cannot flood the tenant's agenda from one phone.
  select count(*) into v_recent
    from public.appointments a
    join public.customers c on c.id = a.customer_id
   where a.user_id = v_site.user_id
     and c.phone = v_phone
     and a.created_at > now() - interval '24 hours'
     and coalesce(a.status, 'pending') <> 'cancelled';
  if v_recent >= 3 then
    raise exception 'Ya tenés varias reservas pendientes. Escribinos para coordinar.'
      using errcode = 'P0001';
  end if;

  -- Re-check the slot server-side. The client already filtered, but the client
  -- is not to be trusted and the slot may have been taken meanwhile.
  perform 1
    from public.public_site_slots(p_slug, p_service_id, p_date, p_staff_id) s
   where s.slot_time = to_char(v_start, 'HH24:MI');
  if not found then
    raise exception 'Ese horario ya fue tomado. Elegí otro, por favor.' using errcode = 'P0001';
  end if;

  -- Reuse the customer record when the phone is already known to this tenant.
  select id into v_customer_id
    from public.customers
   where user_id = v_site.user_id and phone = v_phone
   limit 1;

  if v_customer_id is null then
    insert into public.customers (user_id, full_name, phone)
    values (v_site.user_id, v_name, v_phone)
    returning id into v_customer_id;
  end if;

  insert into public.appointments (
    user_id, customer_id, service_id, staff_id, title, service_type,
    appointment_date, start_time, end_time, status, notes
  )
  values (
    v_site.user_id,
    v_customer_id,
    v_service.id,
    p_staff_id,
    v_service.name || ' · ' || v_name,
    v_service.name,
    p_date,
    v_start,
    v_start + make_interval(mins => coalesce(v_service.duration_minutes, 30)),
    'pending',
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_appt_id;

  return jsonb_build_object(
    'id',        v_appt_id,
    'date',      p_date,
    'time',      to_char(v_start, 'HH24:MI'),
    'service',   v_service.name,
    'status',    'pending',
    'whatsapp',  v_site.whatsapp
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Execution grants — the ONLY thing anon is allowed to do.
-- ---------------------------------------------------------------------------

revoke all on function public.public_site_by_slug(text)                     from public;
revoke all on function public.public_site_slots(text, uuid, date, uuid)     from public;
revoke all on function public.public_site_book(text, uuid, date, text, text, text, uuid, text) from public;

grant execute on function public.public_site_by_slug(text)                  to anon, authenticated;
grant execute on function public.public_site_slots(text, uuid, date, uuid)  to anon, authenticated;
grant execute on function public.public_site_book(text, uuid, date, text, text, text, uuid, text) to anon, authenticated;
