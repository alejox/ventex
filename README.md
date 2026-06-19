# Ventex

Plataforma multi-tenant de gestión de negocio (POS) con interfaz en español. Reúne punto de venta, inventario, finanzas y clientes en una sola aplicación, con aislamiento de datos por usuario.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Supabase (Postgres + Auth) · Zustand · Axios · TypeScript.

> Este proyecto fija **Next.js 16.2.9**, que trae cambios de ruptura respecto a versiones anteriores (entre otros, el middleware ahora es `proxy.ts` en la raíz). Antes de tocar código de Next, lee la guía correspondiente en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

## Requisitos

- Node.js 20+
- Una cuenta/proyecto de [Supabase](https://supabase.com)

## Puesta en marcha

```bash
npm install        # node_modules no está versionado
# crea .env.local con las variables de abajo
npm run dev        # http://localhost:3000
```

### Variables de entorno (`.env.local`)

| Variable | Requerida | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Clave publishable / anon del proyecto |
| `NEXT_PUBLIC_SITE_URL` | — | Base para el redirect de confirmación de email (por defecto `http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL` | — | Base URL del cliente HTTP axios (APIs externas) |

## Scripts

```bash
npm run dev      # servidor de desarrollo
npm run build    # build de producción
npm run start    # sirve el build
npm run lint     # eslint (config plana de eslint-config-next)
```

No hay framework de tests configurado.

## Arquitectura: component → store → services (obligatoria)

Todo el trabajo de funcionalidad sigue una arquitectura por capas estricta. **Los componentes nunca hacen I/O directamente**:

- **Componentes** (`app/**`, `components/**`): leen de un store de Zustand con selectores granulares y disparan acciones. El estado solo-UI (modales, campos de formulario) vive en `useState` local. Nada de `axios`/`supabase`/`fetch` aquí.
- **Stores** (`stores/<feature>.store.ts`, Zustand): estado + acciones asíncronas que delegan en los services. Sin JSX ni I/O directo.
- **Services** (`services/<feature>.service.ts`): la única capa que hace I/O. Los datos propios usan el cliente `@supabase/ssr` (RLS por usuario); axios queda para APIs externas.

Slice de referencia: `services/inventory.service.ts` → `stores/inventory.store.ts` → `app/dashboard/inventory/page.tsx`.

### Clientes de Supabase (elige por contexto)

- `utils/supabase/client.ts` → `createClient()` — Client Components (navegador).
- `utils/supabase/server.ts` → `await createClient()` — Server Components, Server Actions, route handlers (**async**).
- `utils/supabase/proxy.ts` → `updateSession(request)` — solo dentro de `proxy.ts` para refrescar la sesión.

Los tipos de la base de datos se generan en `utils/supabase/database.types.ts` y se inyectan vía el genérico `Database` en los tres factories.

## Estructura

```
app/
  (auth)/          login · register · reset-password · update-password
  dashboard/       app autenticada (POS, ventas, inventario, finanzas, clientes, distribuidores, ajustes)
  auth/callback/   intercambio de código OAuth/email por sesión
  page.tsx         landing pública (/)
proxy.ts           reemplazo de middleware en Next 16: refresca sesión y protege /dashboard
services/          capa de I/O por feature
stores/            stores de Zustand por feature
utils/supabase/    factories de cliente + tipos generados
```

## Base de datos (Supabase, esquema `public`)

Tablas: `customers`, `distributors`, `products`, `categories`, `sales`, `sale_items`, `expenses`, `settings`.

- **RLS habilitado en todas** con una política `FOR ALL TO authenticated` que usa `(select auth.uid()) = user_id`.
- El `user_id` lo asigna automáticamente un trigger `set_user_id` (`SECURITY INVOKER`) + `DEFAULT auth.uid()`, así que los inserts de la app no lo envían.
- Las **ventas se registran vía la RPC `create_sale`** (transaccional): calcula totales en el servidor, aplica el IVA de `settings` (0% si el cliente es exento) y descuenta stock.

## Despliegue

Optimizado para [Vercel](https://vercel.com). Configura las variables de entorno en el proyecto y conecta el repositorio. Recuerda revisar los advisors de Supabase (`get_advisors`) tras cambios de esquema.
