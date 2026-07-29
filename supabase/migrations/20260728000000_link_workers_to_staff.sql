-- Unifica "Personal" y "Trabajadores": la ficha de public.staff pasa a ser el
-- registro canónico de la persona, y la cuenta de acceso (profiles.is_worker)
-- queda colgada de ella por profiles.staff_id.
--
-- Hasta ahora ese vínculo existía en el esquema pero nadie lo llenaba: los
-- trabajadores vivían solo como cuenta y las fichas solo como ficha, así que el
-- dueño cargaba dos veces a la misma persona.
--
-- Los dos triggers de staff se apagan durante el backfill:
--   * set_staff_user_id fuerza user_id = get_effective_user_id(), que en una
--     migración (sin auth.uid()) sería NULL y violaría el NOT NULL.
--   * trg_enforce_staff_limit rechazaría a los negocios que ya están en el tope
--     de su plan; acá no estamos sumando gente, solo dándole ficha a la que ya
--     tenía acceso.

alter table public.staff disable trigger set_staff_user_id;
alter table public.staff disable trigger trg_enforce_staff_limit;

do $$
declare
  r record;
  v_staff_id uuid;
begin
  for r in
    select p.id,
           p.workspace_id,
           coalesce(nullif(btrim(p.full_name), ''), p.worker_username, 'Trabajador') as nombre,
           p.worker_role
    from public.profiles p
    where p.is_worker
      and p.staff_id is null
      and p.workspace_id is not null
  loop
    insert into public.staff (user_id, full_name, role, status)
    values (r.workspace_id, r.nombre, r.worker_role, 'active')
    returning id into v_staff_id;

    update public.profiles set staff_id = v_staff_id where id = r.id;
  end loop;
end $$;

alter table public.staff enable trigger set_staff_user_id;
alter table public.staff enable trigger trg_enforce_staff_limit;

-- Una ficha no puede tener dos cuentas de acceso.
create unique index if not exists profiles_staff_id_unique
  on public.profiles (staff_id)
  where staff_id is not null;
