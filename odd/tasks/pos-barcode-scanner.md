# POS barcode scanner

## Objective and authorization

Make a hardware barcode reader add a scanned product to the active POS cart automatically, like a supermarket checkout, with or without an Enter suffix. The user explicitly requested this local implementation and clarified that reader models differ.

## Problem, evidence, and scope

`PosCatalog` filters by barcode but its Enter handler only resolves SKU. The existing camera path resolves barcode then SKU and adds through the POS store. Preserve manual name search, SKU entry, stock/oversell behavior, camera scanning, and intentional repeated scans. No database, checkout, pricing, or remote changes.

## Configuration and delivery

- Branch: `fix/pos-barcode-scanner`; no push or PR authorized.
- TDD: off, from existing ODD project configuration. Runner: `npm test` (`npx tsx --test tests/**/*.test.ts`). Ordinary functional checks apply.
- RDD: disabled by explicit global setting (`gentle-ai review mode status`); no review workflow.
- Route: delegated direct. Mapping needed 4+ files; implementation touches the non-trivial POS page, catalog component, and regression tests. One bounded writer owns the change.
- Forecast: approximately 100–180 authored changed lines, below the ~400-line delivery budget. Strategy: `ask-on-risk` (default); one work-unit commit expected.

## Tasks

- [x] **P1 — Add hardware barcode scans to cart.** Route: delegated direct (mapping, preparation, and writer triggers). Reuse the camera's barcode-then-SKU resolution and stock handling for codes entered in the search input, both with and without an Enter suffix. Clear the successful scan, keep the input ready for the next scan, and preserve a useful unmatched-code path. Acceptance: one complete scan adds one item without requiring Enter; Enter does not add it twice; repeated scans increment quantity; SKU and manual search still work; stock limits remain enforced. Checks: focused automated regression, `npm test`, typecheck, lint, build, and `git diff --check`. Commit behavior and tests together.

## Progress and evidence

- Baseline: `PosCatalog.tsx:115-130` Enter matches SKU only; `page.tsx:354-374` camera matches barcode then SKU. `pos.store.ts:453-478` already merges repeated scans and enforces oversell policy.
- New user screenshot showed repeated scanner text concatenated in search. An unsaved product's barcode may be unknown, and different readers may omit Enter. The separate product-save `products.price` NULL error means that product was not added to the catalog; this POS change cannot make an unsaved product scannable.
- Accepted implementation: a complete exact catalog barcode in the focused POS search auto-submits after 250 ms of inactivity; subsequent keystrokes cancel the pending submission. Enter submits immediately and cancels the timer. Successful and scanner-shaped unknown scans clear the search for the next pass; ordinary name searches remain. Each pass goes through the existing cart store; the UI stock precheck now compares post-scan quantity, including fractional-stock cases.
- Verification: `npm test` 390/390 pass (5 focused barcode tests), `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` all exit 0. Authenticated Playwright and physical-reader validation skipped: no deterministic barcode fixture or authorized live-catalog mutation. The input must be focused, and the barcode must belong to a saved product. A >250 ms pause in the middle of one code is inherently ambiguous without a device terminator.
- Delivery: local work-unit commit `71dec47` (`fix(pos): add scanned barcodes to cart without Enter`) on `fix/pos-barcode-scanner`; RDD disabled/unmanaged. No push or PR. Authored change: 237 additions + 29 deletions, below the ~400-line delivery budget. Next step: test with a saved product and physical reader; separately decide whether to authorize the product-price validation fix.
