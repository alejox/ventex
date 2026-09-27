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

## Phase 2 — redeemable points (user chose "Puntos canjeables")

Decisions (parent, fixed):

- **Ledger, not a mutable counter.** `loyalty_points_ledger` rows (customer, sale_id, delta, kind `earn|redeem|reverse|adjust`) are the source of truth; the customer balance is derived (view or trigger-maintained column the app can only SELECT). Every movement is auditable and reversible by sale.
- **Earn on the net charged total** (`sales.total`, i.e. after offers/manual/points discounts), only for sales with a customer, only for `tienda` tenants with points enabled. Rule configurable: 1 point per `$X` (floor). Earning must also work for sales that arrive later through the offline queue.
- **Redeem in the POS as a discount**: configurable value per point and minimum points to redeem; the cashier chooses how many points (up to balance and up to the sale total). The redemption RPC runs **after** the sale is recorded and is tied to its `sale_id` (same reason as the haircut reward: a failed charge must not burn points). Idempotent per sale.
- **Voiding a sale reverses both** its earned and redeemed points.
- **Do not touch `create_sale`** nor the haircut engine. Owner configures (Ajustes → Promociones, tienda branch), `pos` permission operates; all tenancy through `get_effective_user_id()`.

- [ ] P1 — Schema + earn/reverse mechanism (trigger or idempotent RPC; investigate how `sales.total` is finalized inside `create_sale` and how void works before choosing) + settings columns, applied via MCP, `.sql` saved, types regenerated, advisors checked.
- [x] P2 — Pure logic (`pointsEarnedFor`, `maxRedeemablePoints`, `pointsDiscount`) + tests.
- [x] P3 — Settings UI (tienda branch): enable, $ per point, value per point, minimum.
- [ ] P4 — POS: show customer balance, redeem N points as a discount line, call redeem RPC after the sale; Clientes shows balance and movement history.
- [ ] P5 — AGENTS.md section, verification, commits.
- [ ] P6 — Protect the ledger-derived customer balance from direct API writes without breaking ordinary customer edits; verify the additive hardening migration in the authorized project before delivery.

## Out of scope

- Any change to salon/barbershop promotion behavior, haircut triggers, `redeem_promo`, or `create_sale`.
- Server-side enforcement of offers (same trust model as manual discounts today).

## Route and delivery

- Route: delegated direct writer (schema + service + store + 2 pages + POS). Decisions above are fixed by the parent.
- TDD: not configured; pure-logic tests added for T3; checks: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Delivery: work-unit commits on `feat/modular-brand`; user chose to upload this phase together rather than chain PRs. Strategy: `exception-ok` for the >400-line review slice, without shrinking tests, docs or code to fit a line budget. Push/merge remain subject to remote authorization.

## Acceptance criteria

- A `tienda` owner never sees the haircut setup; a salon owner sees it exactly as before.
- A `tienda` owner can create a % / amount / "lleva N paga M" offer for a product or category with dates.
- In the POS, eligible lines get the offer discount automatically with its name visible; totals and the charged sale match; removing it restores the price.
- tsc, lint, tests, build pass.

Phase 2 additionally requires a retail-only points configuration; points earned on the final paid total for identified customers; a balance-backed POS redemption tied once to the completed sale; void reversal of both earned and redeemed movements; and balance plus movement history in Customers. A point discount must never be charged without its matching redemption, nor redeem points after its discount has changed or disappeared.

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

## Phase 2 recovery (2026-09-27)

- Resumed six existing local work-unit commits on `feat/modular-brand`: P1 `786c852` (ledger schema, earn/redeem/void triggers, trigger EXECUTE revocation, generated types); P2 `3779387` (pure logic and 15 tests); P3 `8a73add` (retail loyalty settings); P4 `5c3b714` and `4023737` (POS redemption and customer history); P5 documentation `990689a`.
- Local baseline: `npm test` passed 380/380. `gentle-ai review mode status` reports globally disabled, so native review is not started.
- P1 remains open: repository SQL and types exist, but this recovery has no independent proof that both migrations were applied to the intended Supabase project or that advisors and grants were checked. Remote access requires separate destination/operation/credential authorization.
- P4 remains open pending live-business verification. Audit found that customer changes, cart edits and multiple tabs could separate the discounted cart from its redemption marker. Correction `f67f920` moves the marker into each `SaleTab`, checks a snapshot before checkout, exposes removal for invalidated redemptions, blocks offline queuing with points, and routes loyalty I/O through the store in both POS and Customers while retaining lazy history loading. `npm test` passed 382/382; the worker reported `npx tsc --noEmit`, `npm run lint -- --quiet`, and `git diff --check` passing. A separate post-edit `npm run build` passed.
- P5 remains open until remote verification is resolved and final checks are recorded. No push, PR, or merge was performed in this recovery.
- Phase 2 authored diff through `990689a` is 1,393 additions/deletions (excluding 80 generated type lines); this exceeds the advisory ~400-line delivery budget. User explicitly chose to upload it together (`exception-ok`, no chain). RDD is globally off (`disabled/unmanaged`).
- Next: verify remote migration state only with explicit authorization; confirm live POS/customer behavior before marking P1/P4/P5 complete. Do not call phase 2 delivered until the live boundary is confirmed.

## Phase 2 remote audit and hardening (2026-09-27)

- Supabase CLI login and linked project `omnnucpkdxbqzekzyopt` verified. Remote migration history records `loyalty_points` as `20260927063041` and `loyalty_points_revoke_trigger_execute` as `20260927063418`; the checked-in SQL uses `20260927010000` and `20260927020000`. Both are already deployed under those remote versions. Because local/remote migration histories diverge broadly, **do not run `supabase db push`**.
- Read-only remote checks found the ledger, settings/customer columns, active earn/reverse/balance triggers, three idempotency indexes, and ledger RLS. The three trigger functions deny EXECUTE to `anon` and `authenticated`. Security advisors returned 151 WARN results; the loyalty-specific warnings were the intentional authenticated cashier RPC and unnecessary anonymous EXECUTE on the same RPC.
- P1 remains open because the live grant check found a blocker: `customers` has table-wide INSERT/UPDATE for API roles, so the column-level SELECT grant does **not** protect `customers.loyalty_points`; tenant users allowed to edit customers can also edit the derived balance directly. This contradicts the ledger-only invariant and must be fixed before delivery.
- P6 local correction `558724d`: `supabase/migrations/20260927030000_protect_customer_loyalty_balance.sql` removes table-wide customer INSERT/UPDATE from API roles, restores them on existing ordinary customer columns but excludes `loyalty_points`, checks effective grants and trigger-owner access, and removes anonymous EXECUTE on the cashier RPC. No generated/identity customer columns exist in the target database. The worker reported `npm test` 385/385, `npx tsc --noEmit`, `npm run lint`, and `npm run build` passing; SQL was not applied to a local database (`psql` unavailable) or remote yet.
- Next: request explicit authorization to apply **this third migration** to the same Supabase project using the CLI session. Then verify effective grants, advisors, and a permitted customer write/ledger balance path where practical; finish P1/P6 proof and delivery. Do not push the feature before this blocker is closed.
