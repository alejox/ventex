# Store promotions: product offers (phase 1) and purchase loyalty (phase 2)

## Objective

Give general retail (`tienda`) its own promotions model — automatic product/category offers first, purchase-based loyalty later — and stop showing the salon haircut-counter promotions to retail. Salon/barbershop promotions stay exactly as they are.

## Problem

- `app/dashboard/settings/SettingsTabs.tsx` always shows the "Promociones" tab, so a `tienda` owner lands on the haircut-counter setup ("qué cuenta como corte", `{cortes}` message), which is meaningless for retail.
- The haircut engine (`promo_milestones`, `promo_redemptions`, haircut triggers, `redeem_promo`, `settings.promo_service_ids`) is services-only by design. Reusing it for retail would conflate two domains AGENTS.md deliberately keeps apart.

## Evidence (exploration)

- Nav item `promociones` requires module `services`; no `tienda` account has it stored (live DB: 3 tienda accounts, 0 with services), so the nav is already hidden — the leak is the Ajustes tab and the direct URL.
- POS discounts are per-line client-side (`CartLine.discountAmount`, `setLineDiscounts`) and flattened to one sale-level `p_discount_amount`; `create_sale` recomputes prices server-side, caps discount at gross (`DESCUENTO_EXCEDE_TOTAL`), and IVA is derived after the discount. No per-line discount is persisted (`sale_items` has no discount column).
- `computeTotals` (client) mirrors `create_sale` math; tests use `npx tsx --test tests/**/*.test.ts` with pure fixtures (`tests/pos-discount.test.ts`).
- No per-product tax; categories are `id, name, description`.

## Decisions

- **Do not touch `create_sale`.** Offers produce per-line `discountAmount` in the POS and travel through the existing sale-level discount, exactly like the salon reward and the manual discount.
- **Own tables** for retail offers; no reuse of haircut tables/RPCs.
- **Offers auto-apply** in the POS (retail advertises the price), shown per line with the offer name; the cashier can remove them for a sale. A line with a manual discount keeps the manual one (no stacking); among several offers the largest discount for that line wins.
- **Owner configures, `pos` operates** — same split as salon promos (write = `is_tenant_owner()`, read = workspace members).
- **Placement:** for `tienda`, Ajustes → "Promociones" shows the offers manager instead of the haircut setup. Salon keeps the haircut page unchanged.
- Known limitation kept from today's model: which line absorbed a discount is not persisted server-side.

## Scope — phase 1 (this round)

- [x] T1 — Gate haircut promotions by business: a single helper in `config/business.ts` decides; Ajustes tab + `/dashboard/settings/promociones` show haircut setup only where it applies; salon/escuela/lavaautos/servicios unchanged.
- [x] T2 — Schema: `product_offers` (tenant via `get_effective_user_id()` default, name, kind `percent|amount|buy_n_pay_m`, value, buy_qty/pay_qty, target product or category, starts_on/ends_on, active, timestamps) with RLS (members read, owner write), indexes, CHECK constraints. Apply via MCP, save `.sql` in `supabase/migrations/`, regenerate `utils/supabase/database.types.ts`.
- [x] T3 — Pure pricing `offerDiscountsFor(cart, offers, today)` in `services/offers.service.ts` with tests (percent, amount capped at line, buy N pay M with quantities/fractions, date window, inactive, category target, best-offer-wins, manual discount untouched).
- [x] T4 — Offers manager UI for `tienda` (service → store → page per AGENTS.md layers): list, create, edit, activate/deactivate, delete; Spanish copy; token classes.
- [x] T5 — POS integration for `tienda`: fetch active offers, apply automatically, show offer name per line, allow removing for the sale; totals preview via existing `computeTotals`.
- [x] T6 — Docs: AGENTS.md "Ofertas de tienda" section; verification; commits.

## Phase 2 (later, not started)

- Purchase-based loyalty for `tienda` (every N purchases or $X spent → reward), with its own counters; design after phase 1 ships.

## Out of scope

- Any change to salon/barbershop promotion behavior, haircut triggers, `redeem_promo`, or `create_sale`.
- Server-side enforcement of offers (same trust model as manual discounts today).

## Route and delivery

- Route: delegated direct writer (schema + service + store + 2 pages + POS). Decisions above are fixed by the parent.
- TDD: not configured; pure-logic tests added for T3; checks: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Delivery: work-unit commits on `feat/modular-brand`, fast-forward to `main` after parent review (user's standing workflow). Forecast ~700–900 authored lines across commits.

## Acceptance criteria

- A `tienda` owner never sees the haircut setup; a salon owner sees it exactly as before.
- A `tienda` owner can create a % / amount / "lleva N paga M" offer for a product or category with dates.
- In the POS, eligible lines get the offer discount automatically with its name visible; totals and the charged sale match; removing it restores the price.
- tsc, lint, tests, build pass.

## Progress

Plan created after exploration.

**Phase 1 implemented (2026-09-27), all 6 tasks done, one commit per task:**

- T1 `4d89171` — `usesHaircutPromos()` in `config/business.ts`; `SettingsTabs.tsx` hides the tab when neither the haircut engine nor `tienda` applies; `settings/promociones/page.tsx` branches on `businessType === "tienda"`.
- T2 `61aeb72` — `product_offers` applied live via MCP (`apply_migration`), saved to `supabase/migrations/20260927000000_product_offers.sql`, types regenerated (`utils/supabase/database.types.ts`). `get_advisors` (security) showed the same 4 pre-existing findings as before the migration — none reference `product_offers`.
- T3 `320bc97` — `offerDiscountsFor`/`applyOfferDiscounts`/`todayLocal` in `services/offers.service.ts`; 14 tests in `tests/offers.test.ts` (percent, amount capped at line, buy-N-pay-M incl. fractional skip, date window, inactive, category target, best-offer-wins, manual-discount untouched, removal/staleness reset). `CatalogItem.category_id` and `CartLine.offerId`/`offerName` added to `services/pos.service.ts`; existing `tests/pos-discount.test.ts`/`tests/product-flags.test.ts` fixtures updated for the new required field.
- T4 `4859165` — `stores/offers.store.ts` + `app/dashboard/settings/promociones/OffersManager.tsx`: list/create/edit/pause/delete, owner-only editing, product/category picker from `useInventoryStore`.
- T5 `d890eed` — `pos.store.ts` fetches active offers on `init()` and recomputes via `get().recomputeOffers()` from every cart-mutating action (never a `useEffect`); per-tab `removedOfferKeys` for session-scoped "quitar"; `PosCartPanel` shows the offer name + amount with a "Quitar" action, distinct from the manual-discount badge.
- T6 (this commit) — AGENTS.md "Ofertas de tienda" section; this progress update.

**Verification (all green):**
- `npx tsc --noEmit` — no errors.
- `npm run lint` — no errors/warnings.
- `npm test` — 365/365 passing (14 new in `tests/offers.test.ts`).
- `npm run build` — production build succeeds (Next.js 16.2.9, Turbopack), `/dashboard/settings/promociones` and `/dashboard/pos` build as dynamic routes as expected.

**Not verified (needs a human in the browser):** actual POS/Ajustes visual behavior for a live `tienda` account (offer creation → POS auto-apply → totals → "Quitar" → checkout), and that a salon/lavaautos/servicios/escuela account's Ajustes/Promociones renders byte-for-byte as before. No E2E spec was added for this feature (out of scope for phase 1; `e2e/` wasn't touched).

**Known pre-existing issue found, not fixed (out of scope):** `AGENTS.md` on disk has a duplicated tail — the "Comisiones"/"Catálogo"/"Subscription billing"/"Next.js 16 specifics"/"Conventions"/"Project skills & docs" sections each appear twice (lines ~149–204 repeat ~84–139), with a stray sentence fragment at the seam. The new "Ofertas de tienda" section was inserted once, after the first (canonical) Promociones section. Flagging for the parent/user to decide whether to deduplicate separately.
