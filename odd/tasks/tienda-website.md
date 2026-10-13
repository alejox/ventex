# Tienda website: product catalog + WhatsApp order

## Objective
Give `tienda` (general retail) a public website: a product catalog (photos, prices, categories, search) where the visitor builds an order and sends it to the business via WhatsApp.

## Problem / why
`landing` (Página web) is only offered to booking businesses; tienda has no public presence. Full e-commerce (cart checkout, online payments, stock reservation) was rejected for now: weeks of work, new payment/legal surface. A WhatsApp order matches how promos already reach customers.

## Scope
- In: tienda gets "Página web"; tienda-specific site defaults (no booking/services/team); public catalog with category filter, search, stock badge, order drawer, WhatsApp message; two new tienda templates inspired by `public/webs` (Hatbazar → "mercado", Nutrey → "organico"); editor adjustments for tienda; fix visitor RPC parity bug.
- Out: online payments, checkout, stock reservation, customer accounts, order persistence in DB, shipping. Copying template code/assets from `public/webs` (references only — license: TonaTheme/ThemeForest, no SaaS rights confirmed).

## Constraints
- Layers: components → stores → services. Spanish UI (Colombia, tuteo). Tailwind v4 tokens in dashboard; public templates use `--site-*` vars.
- WhatsApp via existing helpers (`whatsappHref` in `app/[slug]/templates/theme.ts`, `whatsappNumber` in `services/promos.service.ts`); `api.whatsapp.com/send`, not wa.me.
- Images: `unoptimized={esImagenAjena(url)}`.
- DB: migrations via MCP + `.sql` in `supabase/migrations/`; regenerate `database.types.ts`. Public RPCs expose only published-site data.
- Existing booking businesses must render exactly as today.

## Tasks
- [x] T1 DB: `public_site_by_slug` parity — exclude `is_ingredient`, `tracks_stock`-aware `inStock`; expose product `categoryId` and the site's used `categories [{id,name}]`. Route: inline (one SQL file + 3 small type edits). `description` dropped: `products` has no such column. `site_public_projection`/`own_site_preview` left untouched: legacy schema, and `fetchOwnSitePreview` has no callers (dead code, follow-up).
- [x] T2 Gating + tienda defaults: `landing` in `BASE_NAV_BY_TYPE.tienda` (+ comments), getting-started copy for tienda (+ `tests/getting-started.test.ts`), tienda site defaults (booking off, products first, services/team/booking hidden, copy), metadata fallback, CommandPalette keywords. Check: unit tests.
- [ ] T3 Pure order logic `lib/site-order.ts`: add/remove/qty, totals in cents, WhatsApp message builder (items, qty, unit price, total, optional name/notes), link via existing helpers. Test-first (`tests/site-order.test.ts`).
- [ ] T4 Public catalog UI (client): category tabs, search, add-to-order, out-of-stock state, floating order drawer, "Enviar pedido por WhatsApp"; hidden order if no WhatsApp configured. Works in all templates' products section for tienda.
- [ ] T5 Template "mercado" (Hatbazar-inspired: green, search header, category strip, mint product cards, badges) + new template group `tienda`; `templatesFor("tienda")` and tienda default.
- [ ] T6 Template "organico" (Nutrey-inspired: cream backgrounds, orange/green, rounded 25px cards, filter tabs).
- [ ] T7 Editor for tienda: hide booking toggle/hours-availability hint, products catalog picker first, WhatsApp required hint for orders; AGENTS.md section "Sitio web de tienda".

## Acceptance
- A tienda owner sees "Página web", creates a site, picks a tienda template, publishes; a visitor filters/searches products, adds quantities, and opens WhatsApp with a readable order message and correct total.
- Ingredients never appear publicly; non-stock-tracked products are not shown as out of stock.
- Salon/barber/escuela sites unchanged.

## Delivery
- Forecast ~1,700 authored lines (> 400): feature branch `feat/tienda-website`, one work-unit commit per task; merge/push decided by the user.

## Progress
- 2026-10-12: exploration done; T1 bug confirmed on live DB (`public_site_by_slug` reads products directly, no `is_ingredient`/`tracks_stock` handling; `own_site_preview` delegates to `site_public_projection`).
- T1 evidence: migration `20261013010000_public_site_products_parity_and_categories.sql` applied via MCP. Probe before→after: super-alejo/nuevo products 29→26 (3 ingredients hidden), out-of-stock 3→1; tiendalore out-of-stock 10→9, 19 categories; all products carry `categoryId`; services/staff/hours/whatsapp keys intact; missing slug → null; grants unchanged (anon/authenticated EXECUTE). RPC return type is `Json`, so `database.types.ts` needs no regeneration. tsc clean, eslint clean, npm test 868/0.
- T1 commit: `3f48032` on `feat/tienda-website`. Native review: RDD off (global) — not run. Next: T2.
- T2 (route: delegated writer — 9 files): `landing` in tienda base nav; getting-started "site" step for tienda ("Publica tu catálogo en línea"); pure `siteDefaultsFor(businessType)` in `services/public-site.types.ts` (tienda: booking off, products first, services/team/booking hidden, products copy "Nuestros productos" / "Haz tu pedido por WhatsApp"; other types deepEqual `defaultLandingConfig()`); `emptySiteInput(businessType)`; tienda metadata fallback; CommandPalette keywords. Evidence: RED getting-started 5/2 + site-defaults 0/5 → GREEN 12/0 (parent re-run 12/0); tsc 0; eslint clean; npm test 873/0. Known gap left for T7: editor still shows booking checkbox + "disponibilidad de reservas" hours hint for tienda. Note: tienda checklist now also requires `sitePublished` to be complete.
