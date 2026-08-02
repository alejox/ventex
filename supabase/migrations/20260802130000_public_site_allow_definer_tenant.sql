-- Two fixes the public micro-site exposed.
--
-- 1. set_user_id() overwrote new.user_id unconditionally with
--    get_effective_user_id(). For a visitor with no session that is NULL, so a
--    public booking wiped the row's tenant and died on the NOT NULL constraint.
--    The coalesce keeps the anti-forgery guarantee EXACTLY as it was whenever a
--    session exists (still an unconditional overwrite), and only lets an
--    explicitly supplied tenant survive when there is no session at all — i.e.
--    inside a SECURITY DEFINER RPC such as public_site_book(). anon cannot reach
--    these tables directly: RLS grants it no policy, so this opens no new path.
--    Trigger is installed on: appointments, categories, customers, distributors,
--    expenses, inventory_movements, invoice_items, invoices, products,
--    purchase_order_items, purchase_orders, sale_items, sales, services,
--    settings, staff, vehicles.
create or replace function public.set_user_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.user_id = coalesce(public.get_effective_user_id(), new.user_id);
  return new;
end;
$$;

-- 2. New tables inherited Supabase's blanket grants to anon. RLS already denies
--    anon (no policy targets it), but the micro-site's whole design is "anon
--    touches no table", so make the grants say so too.
revoke all on public.business_sites from anon;
revoke all on public.business_hours from anon;
