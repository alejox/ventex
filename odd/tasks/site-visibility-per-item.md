# Site visibility per product/service

## Objective
Let the owner choose, per product and per service, whether it appears on the public website.

## Problem / why
`public_site_by_slug` only filters by category (`productCategoryIds`/`serviceCategoryIds`); there is no per-item switch.

## Scope
- DB: `products.show_on_site` and `services.show_on_site` (`boolean not null default true`); `public_site_by_slug` excludes `show_on_site = false`.
- App: Switch "Mostrar en el sitio web" in `/dashboard/inventory/product` (product and service tabs); services/stores/types carry the field.
- Out of scope: bulk toggles, catalog list column.

## Constraints
- `products` columns need the column GRANT + `PRODUCT_COLUMNS` (AGENTS.md).
- Migration via MCP + `.sql` in `supabase/migrations/`; regenerate `database.types.ts`.
- UI copy Spanish (Colombia, tuteo); use `components/ui/Switch`.

## Tasks
- [ ] T1 — Migration: columns + grants + `public_site_by_slug` filter (route: inline, parent owns MCP)
- [ ] T2 — App: types, services, stores, form Switch, unit test (route: delegated writer, 2+ non-trivial files)
- [ ] T3 — Verify: `npx tsc --noEmit`, `npm run lint`, `npm test`; commit

## Acceptance
- Default true → existing catalogs unchanged.
- Turning it off hides the item from the public site only (POS, inventory unaffected).

## Progress
- T2 (delegated writer): done, uncommitted. `show_on_site` added to `PRODUCT_COLUMNS`/`SERVICE_COLUMNS`, `Product`/`Service` types and inputs; `flagsPatch`/`servicePayload` send it only when defined (import, quick-ingredient and school-plan creation keep the DB default `true`). Pure `showOnSiteOf` (null/undefined → true). Form `/dashboard/inventory/product`: Switch "Mostrar en el sitio web" for both tabs, hidden for "Solo insumo"; default on, seeded from the saved row. Test `tests/site-visibility.test.ts` (RED observed: `showOnSiteOf is not a function`; GREEN 3/3). Checks: `npx tsc --noEmit` clean; eslint on touched files clean; `npm test` 1111/1111 pass.
