-- user_id ya lo fija el trigger set_*_user_id (anti-spoofing). Añadimos además
-- DEFAULT auth.uid() para que los tipos generados marquen user_id como opcional
-- en INSERT, evitando pasarlo manualmente desde la app.
alter table public.categories   alter column user_id set default auth.uid();
alter table public.products      alter column user_id set default auth.uid();
alter table public.customers     alter column user_id set default auth.uid();
alter table public.distributors  alter column user_id set default auth.uid();
alter table public.expenses      alter column user_id set default auth.uid();
alter table public.settings      alter column user_id set default auth.uid();
alter table public.sales         alter column user_id set default auth.uid();
alter table public.sale_items    alter column user_id set default auth.uid();
