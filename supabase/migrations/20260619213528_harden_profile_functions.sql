-- search_path inmutable en set_updated_at (advisor 0011).
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- handle_new_user solo debe ejecutarse por el trigger, no vía RPC público
-- (advisors 0028/0029). Revocar EXECUTE del API expuesto.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
