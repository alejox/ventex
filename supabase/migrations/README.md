# Migraciones de Supabase

Orden cronológico (por prefijo de timestamp en el nombre del archivo). Levantar
desde cero: `supabase db reset` (aplica todas en orden).

| Migración | Origen |
|---|---|
| `20260617000000_base_schema` | **Local reconstruida** — esquema base (categories, customers, distributors, products) |
| `20260618000000_create_appointments` | **Local** — no está en el historial remoto |
| `20260618232030_harden_rls_indexes_and_set_user_id_trigger` | Historial remoto |
| `20260618232645_add_sales_expenses_settings_schema` | Historial remoto |
| `20260618235432_default_user_id_to_auth_uid` | Historial remoto |
| `20260619213452_create_profiles_with_trigger_and_backfill` | Historial remoto |
| `20260619213528_harden_profile_functions` | Historial remoto |
| `20260619223751_create_product_images_bucket` | Historial remoto |
| `20260619224029_drop_broad_product_images_read_policy` | Historial remoto |
| `20260620005908_add_distributor_id_to_products` | Historial remoto |
| `20260620012351_add_doc_type_to_distributors_and_customers` | Historial remoto |
| `20260620120000_create_services_and_staff_tables` | Historial remoto — módulos Salón / Barbería |
| `20260620120500_harden_appointments_user_id` | Historial remoto — default + trigger en appointments |
| `20260620121000_link_appointments_to_services_and_staff` | Historial remoto — FKs service_id / staff_id en citas |
| `20260620121500_add_vehicle_fields_to_appointments` | Historial remoto — placa / modelo de vehículo (lavaautos) |
| `20260620122000_create_vehicles_and_link_appointments` | Historial remoto — tabla vehicles + FK vehicle_id en citas |
| `20260620122500_create_invoices_and_items` | Historial remoto — facturación (servicios profesionales) |
| `20260620123000_pos_sell_services_create_sale_v2` | Historial remoto — POS cobra servicios (sale_items.service_id + create_sale) |
| `20260620123500_sales_staff_id_and_create_sale_v3` | Historial remoto — venta atribuida a staff (comisiones) + cobrar cita |
| `20260924000000_school_module_tables` | **MCP apply_migration** — módulo opt-in Escuela de música: gate + 16 tablas `school_*` + guardas "nunca se borra" |
| `20260924010000_school_module_rpcs` | **MCP apply_migration** — los 17 RPC `school_*` (matrícula, clases, reprogramación, saldo, enlaces y bitácora); ejecución `anon` SOLO en los dos RPC de token |
| `20260924020000_school_module_void_reconciliation` | **MCP apply_migration** — trigger `schools_reconcile_on_void` sobre `sales`: al anular la venta de una matrícula la cierra (`voided`), cancela sus clases exclusivas, revierte el saldo con un `void` y cancela pedidos de reprogramación pendientes. Sin borrados; `create_sale`/`void_sale` intactos |
| `20260924030000_school_revoke_trigger_function_execute` | **MCP apply_migration** — revoca `EXECUTE` de `school_reconcile_voided_sale()` y `school_guard_no_delete()` (SECURITY DEFINER, invocadas solo por trigger) para que el advisor de seguridad deje de verlas ejecutables por `anon`/`authenticated` vía RPC |
| `20260924040000_school_module_storage` | Bucket privado `school-materials` (20 MB, sin video) + policies de storage (`worker_can('school')` + carpeta por tenant, sin SELECT — toda descarga pasa por `/api/school/material/download`). **MCP apply_migration** (el bucket se había creado antes vía la API REST de Storage; el `insert ... on conflict do nothing` lo deja igual) — las 3 policies de `storage.objects` aplicadas y verificadas en `pg_policies` |
| `20260924050000_school_same_tenant_references` | **MCP apply_migration** — trigger `zz_school_tenant_refs` (función `school_guard_same_tenant()`) en las 15 tablas `school_*` con FK: toda referencia a `customers`, `services`, `staff`, `sales` o a otra tabla `school_*` debe tener el mismo `user_id` que la fila. Cierra una fuga medida en la sonda de aislamiento: un negocio podía crear un estudiante sobre el cliente de otro y leer su nombre por el enlace familiar |

## Notas

- **Las 9 migraciones "Historial remoto"** son el volcado verbatim del historial
  real del proyecto Supabase (`supabase_migrations.schema_migrations`). La BD
  remota ya las tiene aplicadas; estos archivos son su versión versionada.
- **`base_schema`** se reconstruyó desde la estructura viva porque las 4 tablas
  originales se crearon antes de que existiera el tracking de migraciones. Refleja
  el estado *previo* a las migraciones posteriores (sin `doc_type`,
  `distributor_id` ni `DEFAULT auth.uid()`, que se añaden después). Es
  funcionalmente equivalente, no un volcado byte-a-byte del DDL original.
- **`create_appointments`** tampoco está en el historial remoto (se aplicó por el
  SQL Editor). La tabla existe en la BD.

## Convención del proyecto

El esquema remoto se modifica con la herramienta MCP `apply_migration` (aplica
directo al proyecto remoto y lo registra en el historial). Al hacerlo, **volcar
también el `.sql` a esta carpeta** para que repo y BD no diverjan.
