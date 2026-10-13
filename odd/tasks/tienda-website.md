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
- [x] T3 Pure order logic `lib/site-order.ts`: add/remove/qty, totals in cents, WhatsApp message builder (items, qty, unit price, total, optional name/notes), link via existing helpers. Test-first (`tests/site-order.test.ts`).
- [x] T4 (merged into T5 at user request: build the catalog + order UI inside the first tienda template) Public catalog UI (client): category tabs, search, add-to-order, out-of-stock state, floating order drawer, "Enviar pedido por WhatsApp"; hidden order if no WhatsApp configured. Works in all templates' products section for tienda.
- [x] T5 Template "mercado" (Hatbazar-inspired: green, search header, category strip, mint product cards, badges) + new template group `tienda`; `templatesFor("tienda")` and tienda default.
- [x] T6 Template "organico" (Nutrey-inspired: cream backgrounds, orange/green, rounded 25px cards, filter tabs).
- [x] T8 Template "despensa" (Ekomart-inspired, added at user request: "falta un template") — see progress.
- [x] T7 Editor for tienda: hide booking toggle/hours-availability hint, products catalog picker first, WhatsApp required hint for orders; AGENTS.md section "Sitio web de tienda".

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
- T3 (route: inline — 2 new pure modules + mechanical re-export): `lib/site-order.ts` (add/setQty/remove, whole qty capped at 99, total in cents, message builder, link); WhatsApp helpers moved to pure `lib/whatsapp.ts` and re-exported from `services/promos.service.ts` so the public page never imports the Supabase client. Evidence: RED (module missing) → GREEN 8/8; tsc 0; eslint clean; npm test 881/0.
- 2026-10-12 user feedback: the design picker shows salon/barber templates for tienda. Reordered: T4 merged into T5 so "Mercado" ships with the catalog/order UI; `templatesFor("tienda")` must offer ONLY tienda templates.
- T4+T5 (route: delegated writer — 16 files): `StoreCatalog` client component (category tabs, accent-insensitive search via `lib/store-catalog.ts`, Agotado, steppers, floating order button, native `<dialog>` drawer, WhatsApp link, order persisted in localStorage `ventex:pedido:<slug>` via useSyncExternalStore; ordering hidden without usable WhatsApp); used by every tienda products section. `MercadoTemplate` (Hatbazar-inspired, CSS only, Quicksand+Lato via next/font, no licensed assets). `mercado` registered; group "Tiendas"; `templatesFor("tienda")` → only store templates (+ saved current); tienda default template `mercado`; editor preview with sample categories/products/WhatsApp; dashboard site card guards empty default image. Parent fixed 2 legacy expectations in `tests/public-site-config.test.ts` (old contract offered salon templates to tienda). Evidence: RED 14/6 → GREEN 27/0; tsc 0; eslint 0; npm test 895/0 (parent re-run); `npm run build` OK. Not done: browser/visual check at 360px.
- T6 (route: delegated writer — 10 files): `OrganicoTemplate` (Nutrey-inspired from spec only, cream/orange/green, Itim+Outfit via next/font, CSS-only shapes, no licensed assets); `StoreCatalog` `organico` variant (modifier class, order logic untouched); registered in `SITE_TEMPLATES`/`TIENDA_TEMPLATES`, group tienda; tienda default stays `mercado`. Evidence: RED 22/6 → GREEN 28/0; tsc 0; eslint 0; npm test 896/0 (parent re-run); build OK. Not done: browser/visual check.
- T7 (route: inline — editor BusinessPanel + AGENTS.md): tienda hides "Aceptar reservas en línea", hours hint reworded for stores, warning when WhatsApp is missing/invalid (`whatsappNumber`); AGENTS.md section "Sitio web de tienda". No meaningful RED (JSX copy/visibility, no component test harness): checked with tsc 0, eslint clean, npm test 896/0, build OK.
- Feature status: T1–T7 done on `feat/tienda-website`. Pending: browser/visual check (360px + editor preview), user decision on merge/push to main. Follow-ups: drop dead `site_public_projection`/`own_site_preview`/`fetchOwnSitePreview`; add `public/webs/` to .gitignore.
- Bugfix after T7 (user report: "violates check constraint business_sites_draft_config_valid" creating a tienda site): the SQL CHECKs whitelist template ids and lacked `mercado`/`organico`. Migration `20261013020000_allow_store_landing_templates.sql` applied via MCP; live constraints verified; no DB function holds a template list. Guard test `tests/site-templates-db-constraint.test.ts` (RED: "mercado" missing → GREEN). npm test 897/0.
- Fixes after user browser test: React missing-key warning (server JSX slots passed into client `StoreCatalog` now carry keys) and Mercado CTA overlapping the status (CTA `display:flex; width:fit-content`). Commit `89063bf`. Browser-verified on localhost:3000/tienda-el-jardin: no key warning, CTA on its own line.
- T8 (route: delegated writer — 11 files): `DespensaTemplate` (Ekomart tokens only: #629D23/#1F1F25/#2C3C28/#6E777D/#FF8F3C, Barlow; zip NOT extracted, only `_variables.scss`/README read via `unzip -p`); dark category nav, deep-green hero, sticky left category sidebar ≥1024px (chips below), full-width "Agregar" → stepper; `StoreCatalog` `despensa` variant + `navEnd` slot (Mercado header refactored into shared consts, markup unchanged). Migration `20261013030000_allow_despensa_landing_template.sql` applied by parent via MCP; live constraints verified. Evidence: RED 18/6 + constraint RED → GREEN 24/0; tsc 0; eslint 0; npm test 898/0 (parent re-run); build OK. Browser: editor preview shows all three store templates; Despensa renders as designed; Mercado public page unchanged; selection reverted to Mercado, nothing saved.
