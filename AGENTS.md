<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Commands

```bash
npm install           # required first — node_modules is not checked in
npm run dev           # dev server at http://localhost:3000
npm run dev -- -p 3001  # E2E convention — the team's dev server runs on :3001
npm run build         # production build (also serves as typecheck)
npm run lint          # eslint (flat config via eslint-config-next)
npx tsc --noEmit      # standalone typecheck without build
npm run icons         # regenerate app/assets/icons/DashboardIcons.tsx
npx playwright test   # E2E (e2e/) — dev server must be running on :3001 first (no webServer in config)
```

No unit test framework configured. Playwright config (`playwright.config.ts`): `baseURL` is **http://localhost:3001** (the team's dev port, not 3000 — keep it that way; 3000 is often occupied by other local projects), `fullyParallel: false`, `retries: 1`. Supabase schema is managed via MCP (project `omnnucpkdxbqzekzyopt`), configured in `.mcp.json`/`opencode.json`.

# Architecture (mandatory layers)

**Components never perform I/O directly.** All features follow:

`components/app` → `stores/<feature>.store.ts` (Zustand) → `services/<feature>.service.ts` (I/O)

- **Components**: read stores via granular selectors (`useXStore((s) => s.field)`); UI-only state in `useState`. No `axios`/`supabase`/`fetch`.
- **Stores**: state + async actions delegating to services. No JSX, no direct I/O.
- **Services**: the only layer doing I/O. Supabase client for app data (RLS preserved); `axios` (`services/http.ts`) for external APIs only.

Reference slice: `services/inventory.service.ts` → `stores/inventory.store.ts` → `app/dashboard/inventory/page.tsx`.

# Tenancy: key off `get_effective_user_id()`, NOT `auth.uid()`

Workers (`profiles.is_worker`) log in with their **own** auth account, but their tenant is the owner's. Every RLS policy, trigger, and RPC uses `public.get_effective_user_id()` (resolves to the owner's `workspace_id` for workers, `auth.uid()` otherwise). **Any new tenant-scoped table, policy, default, or RPC must key off `get_effective_user_id()`** — using bare `auth.uid()` silently attributes worker writes to the wrong tenant. See `supabase/migrations/20260715000000_add_worker_role.sql` and `20260730230000_align_tenant_insert_defaults.sql` (which enforces this as the `user_id` column default).

# Supabase

- **Client factories** — pick by context:
  - `utils/supabase/client.ts` → `createClient()` — Client Components (browser)
  - `utils/supabase/server.ts` → `await createClient()` — Server Components / Server Actions / route handlers (**async**)
  - `utils/supabase/proxy.ts` → `updateSession(request)` — only inside `proxy.ts`
  - `utils/supabase/admin.ts` → `createAdminClient()` — service-role key, **bypasses RLS**; only for privileged server-side work (admin/reseller), never exposed to clients. Requires `SUPABASE_SERVICE_ROLE_KEY`.
- **Migrations**: apply via MCP `apply_migration`, then save the `.sql` to `supabase/migrations/` (56 files) to keep repo and remote in sync. After schema changes, regenerate `utils/supabase/database.types.ts` (MCP `generate_typescript_types`).
- **`create_sale` RPC**: transactional sale creation (calculates totals server-side, applies IVA from `settings`, decrements stock, freezes staff commission). Employees without an open shift (`public.shifts`) are rejected — enforced inside the RPC, not just gated in the POS UI. Owners are exempt. Shift model: `README-turnos.md`.
- Env vars: see `.env.example` for the full list. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `SUPABASE_SERVICE_ROLE_KEY` for the admin client; `NEXT_PUBLIC_SITE_URL` (auth email redirects + the URLs handed to dLocal, defaults to `http://localhost:3000`); `NEXT_PUBLIC_API_URL` optional (axios base).

# Promociones: el contador lo escribe la base, WhatsApp lo manda una persona

`customers.haircut_count` y `haircuts_since_reward` los mantienen TRIGGERS sobre `sale_items` (suma al vender) y `sales` (resta al anular) — nunca la app, que solo tiene GRANT de SELECT. Qué cuenta como corte sale de `settings.promo_service_ids` y arranca vacío: adivinar que el servicio llamado "Corte" es el que cuenta sería hardcodear el catálogo de un negocio en la base de todos.

- **No se tocó `create_sale`.** Es la función más crítica de la app —cobra, descuenta stock, congela comisiones, valida turnos— y sumarle contar cortes es la clase de cambio que rompe una venta por un feature de marketing. Los triggers son aditivos.
- **El envío es un enlace `wa.me`, no la API de Meta.** Abre WhatsApp con el mensaje escrito y lo manda una persona desde la ficha del cliente. Sin BSP, sin plantillas aprobadas, sin costo por conversación. Consecuencia: el texto es libre (con la API habría que ceñirse a una plantilla aprobada) y no hay estado de entrega que registrar.
- **Dos contadores con roles distintos**: `haircut_count` es de por vida (el número de la relación, `{total}` en el mensaje) y `haircuts_since_reward` es el PROGRESO hacia el premio (`{cortes}`), que vuelve a 0 al canjear. El premio sale del progreso, nunca del histórico.
- **`redeem_promo(customer)`** registra el canje en `promo_redemptions` —con umbral y premio CONGELADOS— y reinicia el progreso, todo en una transacción: sueltas, un fallo en el reinicio deja al cliente con el premio entregado y el contador intacto para reclamarlo otra vez. Requiere `worker_can('pos')`, no dueño: se canjea en el mostrador.
- **El POS aplica el descuento**, pero solo si el premio declara su forma: `promo_milestones.reward_kind` ∈ `texto|gratis|porcentaje|monto`. `texto` es el default y existe a propósito — "una cerveza" no se descuenta de la cuenta. `promoDiscountFor` (puro, testeado) elige la línea MÁS CARA de las que cuentan y descuenta UNA unidad, topado en su precio.
- **Una venta de total 0 NO tiene fila en `sale_payments`.** Con el premio al 100% el total queda en cero y `create_sale` reventaba contra `sale_payments_amount_check` (`amount > 0`), tirando abajo la venta entera. No se aflojó el CHECK —un pago de cero no es un pago, y habilitarlo dejaría entrar splits vacíos que la misma función rechaza—: simplemente no se inserta.
- **Anular la venta devuelve el premio.** `promo_redemptions.sale_id` ata el canje a su venta y `progress_before` guarda el progreso previo, que es lo único que permite reconstruirlo (el progreso es acumulado y no se deduce hacia atrás desde cero). `undo_haircut_count` restituye ese valor ANTES de descontar los cortes de la venta: al revés, la resta caería sobre un cero y `greatest(...,0)` se la comería.
- **Aplicar es explícito**, con un botón: descontar solo sería regalar plata sin que nadie lo decida. Y el canje corre DESPUÉS de que la venta quedó registrada — al revés, un cobro fallido le quema el premio al cliente por una venta que no existió.
- `availableReward` devuelve el hito más alto que el progreso ALCANZÓ O PASÓ; no exige coincidencia exacta, porque perder el premio de 10 por llegar a 12 es la forma más rápida de que el cliente no vuelva.
- **Trampa del mensaje**: el editor precarga el texto por defecto y guardarlo lo CONGELA, así que mejorar el default después no alcanza a quien ya guardó. Por eso Ajustes avisa si hay hitos y el mensaje no incluye `{premio}`.
- `recalc_haircut_counts()` reconstruye los contadores desde el histórico. Es el backfill Y la red de seguridad si cambian qué servicios cuentan.
- `settings` se crea PEREZOSAMENTE: un negocio que nunca abrió Ajustes no tiene fila. Todo lo que escriba ahí tiene que leer-e-insertar-o-actualizar (ver `savePromoConfig`).
- La lógica pura —qué hito aplica, cómo se arma el mensaje, cómo se normaliza el teléfono— vive en `services/promos.service.ts` y está testeada sin base (`tests/promos.test.ts`).

# Comisiones: el estado vive en la LÍNEA de venta

`sale_items.commission_amount` es el monto congelado al vender; `sale_items.commission_settlement_id` dice si ya se pagó. No hay total "pendiente" guardado en ninguna parte — se deriva sumando las líneas sin liquidación, y eso es lo que impide que el número y el detalle se contradigan.

- **Liquidar es un solo RPC**: `settle_commissions(staff, from, to, from_ts, to_ts, método, pagado_el, excluidos[])`. En una transacción suma las líneas pendientes (con `FOR UPDATE`), crea la fila en `commission_settlements`, crea el gasto en la categoría "Comisiones" (creándola si no existe) y estampa cada línea. **No repliques ninguno de esos pasos desde el cliente**: la idempotencia es que solo entra lo que tiene `commission_settlement_id IS NULL`.
- **El rango viaja en instantes, no en fechas.** `sales.created_at` es timestamptz y la base corre en UTC: cortar por `created_at::date` mete la venta de las 20:00 en Colombia en el día siguiente. `commissionPeriodOf()` (`services/staff.service.ts`) arma los dos formatos desde la zona del navegador; `from`/`to` son solo para imprimir.
- **El gasto generado no se edita ni se borra**: el trigger `expenses_guard_commission` lo rechaza. Para revertir se usa `void_commission_settlement`, que libera las líneas y borra el gasto (levanta `app.voiding_settlement` para pasar el guard).
- **Liquidar es del dueño**: los dos RPC revalidan `is_tenant_owner()`, igual que la policy de escritura de `expenses`.
- **Anular una venta ya liquidada NO reversa la comisión** — esa plata ya se entregó. Se avisa en tres lugares (confirmación de anulación en Ventas, chip en el historial, aviso en el comprobante); no lo conviertas en un bloqueo ni lo hagas cuadrar en silencio.
- **Pagar en efectivo descuenta del arqueo.** La liquidación inserta un `cash_movements` con `kind = 'comision'` — el tercer valor, junto a `gasto` y `traslado`. `comision` significa "descuadra la caja pero NO va al estado de resultados", porque el gasto ya lo creó la liquidación: reusar `kind = 'gasto'` contaría la misma plata dos veces. `close_shift` ya resta todos los movimientos del turno sin mirar el `kind`, así que el arqueo sale solo.
- **De qué cajón sale** lo decide `open_shift_for_commission(staff)`: primero el turno abierto de la persona a la que se le paga (vía `profiles.staff_id`), si no el único turno abierto del negocio. Con dos o más turnos abiertos y ninguno suyo devuelve NULL a propósito — adivinar metería un faltante en la caja de otro empleado. Sin turno abierto no hay movimiento y el gasto se crea igual.
- **Anular con el turno ya cerrado no reescribe su arqueo.** `void_commission_settlement` devuelve `{cash_returned, cash_locked_in_closed_shift}`: solo borra el movimiento si el turno sigue abierto. Un conteo que alguien ya firmó no se toca.

# Catálogo: un servicio vive SOLO en `services`

A service is one row in `public.services` — never also a `products` row. It used to be both, matched by name with `ilike`, and the sync was one-way and swallowed by empty `catch {}`; measured in production before `20260815000000_services_single_source_of_truth.sql`, **zero** pairs were actually in sync. `services` wins because it holds `duration_minutes`/`description` and is the FK target of `appointments.service_id`, `sale_items.service_id`, and the public booking site.

- **Never write a product with `unit = 'Servicio'`.** The constraint `products_unit_is_not_service` rejects it. Rows predating the migration survive only because `sale_items.product_id` references them; `SERVICE_UNIT`/`isServiceItem` exist to keep those out of every products query (`fetchProducts`, `fetchCatalog`, the Pedidos query).
- **One screen, one form.** `/dashboard/inventory` is the catalog (`lib/catalog.ts` merges both tables in memory) and `/dashboard/inventory/product` is the only creation form: `?id=` edits a product, `?serviceId=` edits a service, `?type=servicio` opens the Servicio tab. `/dashboard/services` is a permanent redirect; nav item `inventory` is named "Producto - Servicio" and shows for either the `inventory` or `services` module.
- **Services are archived, never deleted.** `sale_items.service_id` and `appointments.service_id` are `ON DELETE SET NULL`, so deleting detaches history instead of removing the service. Use `setServiceStatus`.
- Writing to `services` requires `worker_can('services')`, not `inventory_edit` — the two halves of the catalog have separate write permissions.

# Subscription billing (dLocal **Go**)

Not the dLocal Payins/Direct API — a different product with a different contract. `services/dlocalgo.service.ts` is the only place that talks to it.

- **Auth**: `Authorization: Bearer <API_KEY>:<SECRET_KEY>`. No per-request signing.
- **Hosted checkout**: `POST /v1/payments` returns `redirect_url`; the payer picks Nequi / PSE / card / cash there. **No card data ever reaches Ventex** — there is no tokenization, no Smart Fields, no PCI surface. (`DLOCAL_SMART_API_KEY` belongs to the *transparent* checkout, which is card-only and therefore unused here.)
- **Notifications** carry only `{"payment_id":"DP-…"}`. Always re-read the payment with `getPayment` before touching state, and verify the signature: `HMAC-SHA256(api_key + raw_body, secret_key)` in `Authorization: V2-HMAC-SHA256, Signature: <hex>`. The body must be the **raw** text — re-serializing breaks the signature.
- **Renewals** reuse the first payment's `merchant_checkout_token` (`POST /v1/payments/recurring/{token}`), stored in `billing_orders.checkout_token` → `subscriptions.billing_provider_ref`.
- **Three paths can credit a payment** — webhook, order polling, renewal cron — and all three go through `applyPaymentToOrder` (`services/subscription-billing.server.ts`). `apply_billing_charge` is idempotent, so they can race safely. Polling reconciles against dLocal on purpose: it makes the flow work when a notification is lost, and locally where `localhost` is unreachable.
- **`apply_billing_charge(order)`**: takes the order id only and derives the owner from the row it just marked paid (`p_user_id` was dropped — it was always `billing_orders.user_id`, its nullability couldn't be expressed in the generated types, and a stale read raced with `claim_guest_orders`). A row with no `user_id` is a guest checkout: the order is marked paid without activating a licence, and `claim_guest_orders(email)` activates it when the visitor registers with that same email. The returned `guest` flag — not the caller's copy of the row — decides whether the guest email goes out. A `client_licenses` row always wins over online billing (the reseller recharges it), so recurrence is forced off for those users.
- **`/api/billing/recurring` requires `CRON_SECRET`** and returns 503 without it. Do **not** re-add an `x-vercel-cron` header bypass: that header is forgeable and would let anyone trigger real charges. Vercel injects `Authorization: Bearer $CRON_SECRET` automatically when the variable exists.
- `DLOCAL_ENV` selects sandbox (default, `DLOCAL_SBX_*`) vs production (`DLOCAL_API_KEY`/`DLOCAL_SECRET_KEY`). The default is sandbox on purpose: an unconfigured deploy cannot charge real money.
- **Buying and renewing always go through the checkout — never WhatsApp.** WhatsApp is support-only (`Soporte` button + the "¿Dudas?" link under the landing prices). Don't reintroduce WhatsApp purchase CTAs on the plan cards. If dLocal is unconfigured, `/api/billing/subscribe` degrades with a 503 and a message pointing at WhatsApp; there is no client-side feature flag.

# Next.js 16 specifics

- **`proxy.ts`** (repo root) replaces `middleware.ts`. Exports `proxy(request)`. Handles session refresh and route guards (`/dashboard*`, `/admin*`; **not** `/reseller*` — that route group guards itself via its `layout.tsx` Server Component using `fetchProfileServer()`).
- `node_modules/next/dist/docs/` contains the version-specific guides — read before writing Next.js code.

# Conventions

- **UI is entirely in Spanish** — keep new copy consistent.
- **TypeScript path alias**: `@/*` → repo root.
- **Tailwind CSS v4**: no `tailwind.config.*`. Theme tokens defined in `app/globals.css` via `@theme inline`. Use token classes (`bg-surface-container`, `text-on-surface`, etc.) — do not hardcode hex values.
- **Theming**: `:root` = light, `:root[data-theme="dark"]` / `.dark` = dark. Synchronous inline script in `app/layout.tsx` applies saved theme before hydration (defaults to dark). `components/ThemeProvider.tsx` manages toggling via `useTheme()` hook.
- **Business-type gating**: which modules/nav items a tenant sees is computed from `config/business.ts` (`REGISTRABLE_BUSINESS_TYPES`, `visibleNavItems`, `workerNavItems`) — single source of truth; don't duplicate that logic per page.

# Project skills & docs

- `.agents/skills/` is a git-ignored local cache pinned by `skills-lock.json` (re-fetch via the skills tool if missing): `supabase`, `supabase-postgres-best-practices`, `vercel-react-best-practices`, brainstorming.
- `.claude/skills/ventex-invariants/SKILL.md` is a **personal** skill, not vendored — it may be absent on this machine; don't rely on it. The checked-in substitutes are this tenancy section, `CLAUDE.md`'s Roles & tenancy notes, and `README-turnos.md` (cash-shift model).
