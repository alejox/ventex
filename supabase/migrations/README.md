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
