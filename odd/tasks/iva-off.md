# IVA off: one control, no IVA anywhere when the business does not charge it

## Objective

When a business does not charge IVA, IVA must not appear anywhere in the platform. IVA is configured in exactly one place, and setting it up comes before loading the catalog.

## Problem

- Three independent controls write or describe IVA and can contradict each other:
  - "Desglosar IVA" + "Tasa de IVA (%)" in Ajustes → General (`settings.include_tax`, `settings.tax_rate`).
  - "Responsabilidad tributaria" in Ajustes → Datos de tu negocio (`business_profile.taxResponsibility`), which only feeds the receipt "Régimen" line.
  - The "Desglosar IVA" switch in the POS "Configuración de venta" modal (`components/SaleConfigModal.tsx`).
- Choosing "No responsable de IVA" does not turn IVA off.
- Several surfaces show IVA even with `include_tax = false`:
  - POS exempt-customer rows.
  - The "(exento)" tags.
  - Receipt "Régimen".
  - Sale detail "Impuesto (0%)".
  - Sales and invoice exports.
  - The billing tax field.
  - Customer exemption UI and columns.
  - Getting-started and help copy.
- "Primeros pasos" asked for the catalog before IVA, so products were priced before the tax regime was known.

## Why

A business that is not responsible for IVA printed receipts and screens with IVA it does not charge. That is a fiscal and trust problem, and the cause is that the platform has no single answer to "does this business charge IVA?".

## Scope

- Single source of truth: `settings.include_tax`, the field `create_sale` already gates on (migration `20261008100200`, `:246-272`, `:645-648`).
- One IVA control, placed in Ajustes → Datos de tu negocio:
  - "Responsable de IVA" (with the rate) → `include_tax = true`.
  - "No responsable de IVA" → `include_tax = false`.
  - It keeps `taxResponsibility` in sync.
- The duplicates in Ajustes → General and in the POS are removed.
- Every sales-side surface hides IVA when `include_tax = false`. Historical sales with `tax_amount > 0` still show their IVA, because it was really charged.

## Constraints and decisions

- **Purchases and "Recibir pedido" stay exactly as they are** (user decision, 2026-10-14). That IVA is the supplier's and is deliberately driven by `rawRate`.
- No DB migration: `create_sale` already uses `include_tax`.
- UI copy is Colombian Spanish with tuteo.
- Layering: components → stores → services.

## Tasks

- [x] **T1 Getting started order.** "Configura los datos del negocio y el IVA" comes first for every business type, before the catalog.
  - Route: inline (one file plus its test).
  - Tests: `tests/getting-started.test.ts`. RED was 3 order failures; GREEN is 942/942.
- [x] **T2 Single IVA control.**
  - Datos de tu negocio owns the regime and the rate, and saves `include_tax`, `tax_rate` and `taxResponsibility` together.
  - Ajustes → General drops "Desglosar IVA" and "Tasa de IVA".
  - The POS `SaleConfigModal` drops its "Desglosar IVA" switch, and the now-unused POS writer is removed.
  - The receipt "Régimen" line derives from `include_tax`. With IVA off it prints no IVA wording.
  - Route: delegated writer (2+ non-trivial files).
  - Tests: `tests/tax-regime.test.ts` (new: regime from `include_tax`, save mapping) and two receipt cases in `tests/receipt.test.tsx`. RED: 5 failures (missing helpers, stale profile text on the receipt). GREEN: 947/947.
  - Notes: the regime moved out of the DIAN accordion into its own "IVA" card; `SettingsInput.tax_rate`/`include_tax` are now optional, so General and other callers no longer overwrite them; `updateIncludeTax` and the POS `setIncludeTax` were removed.
  - Commit: `fedcb6f`.
- [x] **T3 Hide IVA on sales-side surfaces** when `include_tax = false`:
  - POS exempt branch (check `includeTax` first) and the "(exento)" tags.
  - Sale detail "Impuesto" (show only if `includeTax || tax_amount > 0`).
  - Sales export and invoice export "Impuesto" columns.
  - Billing quote/invoice tax field.
  - Customer list, form and detail exemption UI.
  - Import help/columns that mention IVA.
  - `IngredientQuickModal` copy.
  - Route: delegated writer.
  - Tests: `tests/pos-cart-iva-off.test.tsx` (new), plus cases in `tests/reports.test.ts`, `tests/billing-view.test.ts` and `tests/import.test.ts`. RED: 2 POS + 2 export + 2 import failures. GREEN: 953/953.
  - Exception: billing form, customers screen, sale detail, `SaleConfigModal` tags and `IngredientQuickModal` copy are UI-only gating with no runnable RED (the POS store renders its initial state under SSR); checked by `tsc` and lint.
  - Notes: the product import price help is now neutral ("Precio final, el que paga el cliente") because `PRODUCT_IMPORT` is a constant used by the inventory page; a customer file that still has "Exento de IVA" imports with that column ignored and `tax_exempt` untouched.
- [x] **T4 Copy and docs.**
  - The getting-started step copy matches where IVA now lives.
  - `docs/guia-de-uso.md` describes the single control.
  - Route: delegated writer (same worker as T2/T3).
  - Exception: copy and docs only, no runnable RED; `tests/getting-started.test.ts` stays green (7/7).

## Acceptance criteria

- With "No responsable de IVA", no sales-side screen, receipt, export or form shows "IVA" or "Impuesto". Purchases and pedidos are excluded by decision.
- Switching the regime updates `include_tax` in one save, and the POS reflects it before the next charge (existing `refreshPosConfig`).
- Old sales that carried IVA still print and show it.
- `npm test`, `npx tsc --noEmit` and `npm run lint` all pass.

## Checks

- `npm test`
- `npx tsc --noEmit`
- `npx eslint <touched files>`
- Manual: toggle the regime in Datos de tu negocio and check the POS cart, the checkout, the receipt, the sale detail and the customers screen.

## Progress

- 2026-10-14: T1 done on branch `feat/iva-off`, commit `5634bff`.
- 2026-10-14: T2 done, commit `fedcb6f`.
- 2026-10-14: T3 done, commit `f93059c`.
- 2026-10-14: T4 done (getting-started hint and `docs/guia-de-uso.md`), committed with this update.

## Next step

Manual check from the Checks list (toggle the regime and walk the POS, receipt, sale detail and customers). Then review and delivery under ordinary repository policy.
