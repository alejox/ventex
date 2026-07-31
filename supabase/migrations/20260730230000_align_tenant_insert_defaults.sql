-- Keep PostgREST-generated Insert types aligned with the database behavior.
-- Tenant ownership is still enforced by the existing triggers and RLS policies;
-- these defaults only allow clients to omit values the database derives.

alter table public.customer_payments
  alter column user_id set default public.get_effective_user_id();

alter table public.delivery_persons
  alter column user_id set default public.get_effective_user_id();

alter table public.deliveries
  alter column user_id set default public.get_effective_user_id();

alter table public.purchase_orders
  alter column user_id set default public.get_effective_user_id();

alter table public.purchase_order_items
  alter column user_id set default public.get_effective_user_id();

-- set_purchase_order_number() replaces zero with the next tenant sequence.
alter table public.purchase_orders
  alter column order_number set default 0;

do $$
declare
  target_table text;
  actual_default text;
  is_not_null boolean;
  has_auth_user_fk boolean;
begin
  foreach target_table in array array[
    'customer_payments',
    'delivery_persons',
    'deliveries',
    'purchase_orders',
    'purchase_order_items'
  ]
  loop
    select pg_get_expr(default_value.adbin, default_value.adrelid), column_def.attnotnull
      into actual_default, is_not_null
    from pg_catalog.pg_attribute column_def
    join pg_catalog.pg_class table_def
      on table_def.oid = column_def.attrelid
    join pg_catalog.pg_namespace schema_def
      on schema_def.oid = table_def.relnamespace
    left join pg_catalog.pg_attrdef default_value
      on default_value.adrelid = column_def.attrelid
     and default_value.adnum = column_def.attnum
    where schema_def.nspname = 'public'
      and table_def.relname = target_table
      and column_def.attname = 'user_id'
      and not column_def.attisdropped;

    if actual_default is null
      or position('get_effective_user_id()' in actual_default) = 0
    then
      raise exception 'Expected public.%.user_id to default to get_effective_user_id(), got %',
        target_table,
        actual_default;
    end if;

    if is_not_null is distinct from true then
      raise exception 'Expected public.%.user_id to remain NOT NULL', target_table;
    end if;

    select exists (
      select 1
      from pg_catalog.pg_constraint constraint_def
      join pg_catalog.pg_attribute fk_column
        on fk_column.attrelid = constraint_def.conrelid
       and fk_column.attnum = any (constraint_def.conkey)
      where constraint_def.conrelid = format('public.%I', target_table)::regclass
        and constraint_def.contype = 'f'
        and constraint_def.confrelid = 'auth.users'::regclass
        and fk_column.attname = 'user_id'
    )
      into has_auth_user_fk;

    if not has_auth_user_fk then
      raise exception 'Expected public.%.user_id to keep its auth.users foreign key',
        target_table;
    end if;
  end loop;

  select pg_get_expr(default_value.adbin, default_value.adrelid)
    into actual_default
  from pg_catalog.pg_attribute column_def
  join pg_catalog.pg_class table_def
    on table_def.oid = column_def.attrelid
  join pg_catalog.pg_namespace schema_def
    on schema_def.oid = table_def.relnamespace
  left join pg_catalog.pg_attrdef default_value
    on default_value.adrelid = column_def.attrelid
   and default_value.adnum = column_def.attnum
  where schema_def.nspname = 'public'
    and table_def.relname = 'purchase_orders'
    and column_def.attname = 'order_number'
    and not column_def.attisdropped;

  if actual_default is null or actual_default !~ '^0(::.*)?$' then
    raise exception 'Expected public.purchase_orders.order_number to default to 0, got %',
      actual_default;
  end if;
end;
$$;
