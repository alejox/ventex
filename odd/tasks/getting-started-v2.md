# Getting started v2: the order a business actually sets up, and a payment-methods section

## Objective

"Primeros pasos" follows the real setup order of a new business:

1. Business and IVA.
2. First supplier.
3. First product or service.
4. Payment methods.
5. Staff.
6. First sale.
7. Website, which is optional.

Payment methods get their own section in Configuración.

## Problem

- The current order is business → catalog → staff (salon, escuela, lavaautos, servicios only) → site → first sale.
- There is no supplier step and no payment-methods step.
- The site counts as required.
- Payment methods ("Cobrar por transferencia" with the Colombian transfer media, and "Cobrar con datáfono" with which terminals) are buried in Configuración → General among unrelated preferences.

## Decisions (user, 2026-10-14)

Order and visibility:

| # | Step | Shown when | Done when |
|---|---|---|---|
| 1 | Configura tu negocio e IVA | always | `businessConfigured` (unchanged) |
| 2 | Crea tu primer proveedor | nav has `distributors` | a `distributors` row exists |
| 3 | Crea tu primer producto/servicio (escuela: plan de clases) | always | `hasProduct \|\| hasService` (unchanged `catalogStep`) |
| 4 | Configura tus métodos de pago | always | the owner saved the new "Métodos de pago" section at least once (`settings.payment_methods_configured_at` is not null), even if they kept cash only |
| 5 | Agrega a tu personal (escuela: profesores) | nav has `staff` (now includes tienda) | `hasStaff` |
| 6 | Registra tu primera venta | always | `hasSale` |
| 7 | Publica tu página web · *Opcional* | nav has `landing` | `sitePublished`; **does not count** toward completion or progress |

- Visibility comes from `visibleNavItems(businessType, modules)`. It replaces the hardcoded `STAFF_TYPES`.
- The post-login landing rule (data + catalog) is unchanged.

## Scope

- DB: `settings.payment_methods_configured_at timestamptz null`, as a migration authored by the writer and applied by the parent.
- `lib/getting-started.ts`:
  - New steps and order.
  - An `optional` flag.
  - `allGettingStartedDone` and progress ignore optional steps.
  - New facts `hasDistributor` and `paymentMethodsConfigured`.
- `services/getting-started.service.ts`: fetch the new facts, fail-open as today.
- `components/onboarding/GettingStarted.tsx`: an "Opcional" tag; the progress counts required steps only.
- New Configuración tab **"Métodos de pago"** (`/dashboard/settings/pagos`):
  - It moves the transfer and datáfono settings out of General, with their existing behaviour and copy.
  - Its explicit "Guardar" stamps `payment_methods_configured_at = now()`.
  - General keeps the rest.
- Command palette and links that point at those settings are updated.
- Docs: `docs/guia-de-uso.md`.

## Tasks

- [x] **T1 Payment-methods section.** Migration plus types; service, store and save stamping; the new tab and page; General cleanup; palette and links.
  - Route: delegated (writer trigger: 2+ non-trivial files). Migration `20261014110000_settings_payment_methods_configured_at.sql` authored, NOT applied (parent applies).
  - `savePaymentMethods` sends only the four payment fields + the stamp; General's save no longer sends them. The palette has only one "Configuración" command, built in `components/DashboardShell.tsx` (outside the writer's surface): no dedicated entry added. No POS hint linked to these settings.
  - Commit `106c11c`. Evidence: `npx tsc --noEmit` clean; eslint on touched files clean; `npm test` 966/966.
- [x] **T2 Getting started v2.** New facts, order, optional site step, UI tag and progress; tests.
  - Route: delegated. RED observed first (`tests/getting-started.test.ts`: 10 fail / 3 pass), then GREEN (13/13).
  - Visibility from `visibleNavItems` (`distributors`, `staff`, `landing`); `STAFF_TYPES` removed. Supplier step links to `/dashboard/distributors?new=1`, now handled by `OpenOnNewParam` on that page. The facts query reads `settings` with `*` so the missing column (pre-migration) never fails the query.
  - Evidence: `npx tsc --noEmit` clean; eslint on touched files clean; `npm test` 972/972.
- [ ] **T3 Docs.** Guide sections 2 and 3 plus the new section.

## Acceptance criteria

- The checklist for each business type shows the steps above in that order, gated by nav.
- A cash-only business completes step 4 by saving the section.
- An unpublished site never blocks "Primeros pasos" from completing.
- The transfer and datáfono settings work exactly as before, now under Métodos de pago.
- `npm test`, `npx tsc --noEmit` and eslint on the touched files all pass.

## Progress

- 2026-10-14: decisions taken. Branch `feat/getting-started-v2`.

## Next step

T1–T3 through one delegated writer. The parent reviews and applies the migration.
