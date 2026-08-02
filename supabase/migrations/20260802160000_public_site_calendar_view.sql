-- Calendar view for the public micro-site.
--
-- `public_site_slots` returns ONLY free slots and stays the function that
-- validates a booking inside `public_site_book`. This one exists to PAINT the
-- grid: it emits every slot of the day with its state.
--
-- What it does NOT return, and must never return: appointment id, customer id
-- or name, phone, notes, or which professional is busy. A visitor sees "there
-- is something at 11:00" and nothing more. A taken slot's row is
-- indistinguishable from any other.
create or replace function public.public_site_day_slots(
  p_slug       text,
  p_service_id uuid,
  p_date       date,
  p_staff_id   uuid default null
)
returns table (slot_time text, slot_state text)
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

  v_min := v_open_min;
  while v_min + v_duration <= v_close_min loop
    v_start := make_time(v_min / 60, v_min % 60, 0);
    v_end   := make_time((v_min + v_duration) / 60, (v_min + v_duration) % 60, 0);

    select count(*) into v_taken
      from public.appointments a
     where a.user_id = v_site.user_id
       and a.appointment_date = p_date
       and coalesce(a.status, 'pending') <> 'cancelled'
       and (p_staff_id is null or a.staff_id = p_staff_id)
       and a.start_time < v_end
       and coalesce(a.end_time, a.start_time + interval '30 minutes') > v_start;

    slot_time := to_char(v_start, 'HH24:MI');
    if ((p_date + v_start) at time zone v_site.timezone) <= now() + interval '30 minutes' then
      slot_state := 'past';
    elsif v_taken >= v_capacity then
      slot_state := 'taken';
    else
      slot_state := 'free';
    end if;
    return next;

    v_min := v_min + v_site.slot_interval_minutes;
  end loop;

  return;
end;
$$;

-- Per-day summary for the day picker: how many slots each day still has free.
-- Reuses public_site_slots on purpose, so "how many there are" and "which ones
-- they are" can never disagree.
create or replace function public.public_site_availability(
  p_slug       text,
  p_service_id uuid,
  p_from       date,
  p_days       int default 21,
  p_staff_id   uuid default null
)
returns table (day date, is_open boolean, free_slots int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_site  public.business_sites%rowtype;
  v_open  boolean;
  v_i     int;
  v_day   date;
begin
  select * into v_site
    from public.business_sites
   where slug = lower(btrim(p_slug)) and published and booking_enabled;
  if not found then return; end if;

  for v_i in 0 .. greatest(least(coalesce(p_days, 21), 60), 1) - 1 loop
    v_day := p_from + v_i;

    select h.is_open into v_open
      from public.business_hours h
     where h.user_id = v_site.user_id
       and h.weekday = extract(dow from v_day)::smallint;

    day        := v_day;
    is_open    := coalesce(v_open, false);
    free_slots := (
      select count(*)::int
        from public.public_site_slots(p_slug, p_service_id, v_day, p_staff_id)
    );
    return next;
  end loop;

  return;
end;
$$;

revoke all on function public.public_site_day_slots(text, uuid, date, uuid) from public;
revoke all on function public.public_site_availability(text, uuid, date, int, uuid) from public;

grant execute on function public.public_site_day_slots(text, uuid, date, uuid) to anon, authenticated;
grant execute on function public.public_site_availability(text, uuid, date, int, uuid) to anon, authenticated;
