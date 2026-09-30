# POS barcode scanner

## Objective and authorization

Make a hardware barcode reader add a scanned product to the active POS cart automatically, like a supermarket checkout, with or without an Enter suffix. The user explicitly requested this local implementation and clarified that reader models differ.

## Problem, evidence, and scope

`PosCatalog` filters by barcode but its Enter handler only resolves SKU. The existing camera path resolves barcode then SKU and adds through the POS store. Preserve manual name search, SKU entry, stock/oversell behavior, camera scanning, and intentional repeated scans. A related product-save failure can prevent the barcode from reaching the catalog: product price lacks validation and may become `NaN`/`NULL`. Preserve tax-inclusive pricing and open-price semantics. No database migration or checkout changes.

## Configuration and delivery

- Branch: `fix/pos-barcode-scanner`; user requested integration to `main` after correction. Remote destination and credential/session authorization must be clarified before any remote operation.
- TDD: off, from existing ODD project configuration. Runner: `npm test` (`npx tsx --test tests/**/*.test.ts`). Ordinary functional checks apply.
- RDD: disabled by explicit global setting (`gentle-ai review mode status`); no review workflow.
- Route: delegated direct. Mapping needed 4+ files; implementation touches the non-trivial POS page, catalog component, and regression tests. One bounded writer owns the change.
- Forecast: POS work unit 266 authored changed lines plus approximately 116 for the product-price guard, totaling approximately 382 authored lines, below the ~400-line delivery budget. Strategy: `ask-on-risk` (default); use coherent work-unit commits. No PR requested.

## Tasks

- [x] **P1 — Add hardware barcode scans to cart.** Route: delegated direct (mapping, preparation, and writer triggers). Reuse the camera's barcode-then-SKU resolution and stock handling for codes entered in the search input, both with and without an Enter suffix. Clear the successful scan, keep the input ready for the next scan, and preserve a useful unmatched-code path. Acceptance: one complete scan adds one item without requiring Enter; Enter does not add it twice; repeated scans increment quantity; SKU and manual search still work; stock limits remain enforced. Checks: focused automated regression, `npm test`, typecheck, lint, build, and `git diff --check`. Commit behavior and tests together.
- [x] **P2 — Reject invalid product sale prices before persistence.** Route: delegated direct (mapping spans form, pricing component, MoneyInput, inventory service/store, and quick modal; writer touches multiple non-trivial files). Validate the displayed final sale price in the product form and show a field-level message/focus; guard create/update in the service so `NaN` is never sent to Supabase, including alternate callers. Preserve the quick-create path, `open_price`, and tax calculations. Acceptance: empty, malformed, and non-finite prices never reach the database; fixed-price products require >0; an explicit 0 remains valid as the suggested catalog price of an `open_price` product; valid 190000 persists as 190000; the form explains invalid input. Checks: focused regression, `npm test`, lint, typecheck, build, `git diff --check`.

## Progress and evidence

- Baseline: `PosCatalog.tsx:115-130` Enter matches SKU only; `page.tsx:354-374` camera matches barcode then SKU. `pos.store.ts:453-478` already merges repeated scans and enforces oversell policy.
- New user screenshot showed repeated scanner text concatenated in search. An unsaved product's barcode may be unknown, and different readers may omit Enter. The separate product-save `products.price` NULL error means that product was not added to the catalog; this POS change cannot make an unsaved product scannable.
- Accepted implementation: a complete exact catalog barcode in the focused POS search auto-submits after 250 ms of inactivity; subsequent keystrokes cancel the pending submission. Enter submits immediately and cancels the timer. Successful and scanner-shaped unknown scans clear the search for the next pass; ordinary name searches remain. Each pass goes through the existing cart store; the UI stock precheck now compares post-scan quantity, including fractional-stock cases.
- Verification: `npm test` 390/390 pass (5 focused barcode tests), `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` all exit 0. Authenticated Playwright and physical-reader validation skipped: no deterministic barcode fixture or authorized live-catalog mutation. The input must be focused, and the barcode must belong to a saved product. A >250 ms pause in the middle of one code is inherently ambiguous without a device terminator.
- Delivery to date: local work-unit commit `71dec47` (`fix(pos): add scanned barcodes to cart without Enter`) and evidence commit `e965ec4` on `fix/pos-barcode-scanner`; RDD disabled/unmanaged. POS authored change: 237 additions + 29 deletions. User subsequently authorized product-price correction and requested delivery to `main`. Next step: complete P2 locally, verify, then clarify remote credential/session before pushing.
- P2 domain clarification: `products.price` is NOT NULL but can be 0 for an open-price product, where it is only a suggested catalog price. `create_sale` allows an explicitly chosen sale price of 0. Reject missing/non-finite values, not legitimate explicit zero in this case.
- P2 implementation: the full product form validates the current final sale price, focuses its field, and shows an inline accessible error. `parseProductSalePrice` validates both create/update before Supabase I/O; the inventory store runs it before optional image upload so invalid input cannot orphan a new asset. Fixed-price products require >0, while open-price products allow an explicit 0. No tax calculation or database migration changed.
- P2 verification: `npm test` 394/394 pass (4 new product-price tests), `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` all exit 0. Authenticated browser save and physical scanner checks remain pending; no live product was created. The screenshot's visible 190000 would pass this parser, so that exact previous NULL still lacks a proven causal trace; if it recurs, capture the actual outgoing payload and DB error without assuming an empty UI field.
- P2 rollback boundary: revert the price parser/guards, product form feedback/ref plumbing, and product-sale-price tests only; the independent POS scanner work unit remains intact. Next step: commit P2, then integrate locally to `main` and request explicit remote session authorization before any fetch/push.
