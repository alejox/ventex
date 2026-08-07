-- Documenta schema drift real: `distributor_id` y `supplier_invoice_number` ya
-- existían en la base remota y el código ya los usa (services/purchases.service.ts,
-- app/dashboard/purchases/**), pero NINGUNA migración commiteada los creaba —
-- alguien los aplicó por MCP directo y el .sql nunca volvió al repo.
--
-- Reconstruido leyendo el estado vivo (information_schema.columns,
-- pg_constraint, pg_indexes) el 2026-08-06, no inventado. `if not exists` /
-- el DO block: esto corre sobre una base que YA tiene todo esto, así que tiene
-- que ser un no-op ahí, y a la vez ser lo que crea todo desde cero en un
-- restore limpio.
alter table public.invoices
  add column if not exists distributor_id uuid,
  add column if not exists supplier_invoice_number text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_distributor_id_fkey'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_distributor_id_fkey
      foreign key (distributor_id) references public.distributors(id) on delete set null;
  end if;
end $$;

create index if not exists invoices_distributor_id_idx
  on public.invoices (distributor_id);
