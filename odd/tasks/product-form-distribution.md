# Product form distribution

Improve the full product form, Service tab and quick-add layout without changing visual style, then fix four user-authorized save and pricing defects.

## Scope and constraints
- Branch: `fix/hide-iva-without-tax`; base: `b0740cf`.
- Preserve colors, borders, radii, shadows, typography, copy, existing cards and dividers. No list changes.
- Preserve no-IVA behavior and conditional fields. Logic changes are limited to the four explicitly authorized defects below. SKU and barcode share equal-width columns in full and quick-add forms.
- Delivery: user explicitly requested commit and direct-main push after desktop visual validation. No PR chain requested. Exclude unrelated .atl registry changes. Broader visual checks remain disclosed pending.

## Tasks
- [x] T1 Reflow related controls consistently across product, service and quick-add. Route: delegated; multiple non-trivial files and preparation for writing.
- [ ] T2 Validate product logic, run functional checks, independently inspect diff and review desktop/mobile. Route: delegated verification plus parent browser inspection.
- [x] T3 Prevent catalog recreation after recipe failure; guard quick-add concurrent submits; preserve typed totals on delayed no-IVA settings; persist barcode image URL. Route: delegated, multiple non-trivial files and regression tests. User authorized all four fixes.
- [ ] T4 Put presentation and units-per-box before price entry in product forms; retain stock after pricing and equal SKU/barcode widths. Route: delegated, dependent form sections. User explicitly requested browser validation and adjustment.

## Acceptance and checks
- Related fields share responsive rows from sm; mobile remains readable without horizontal overflow.
- No visual-style changes; business logic changes limited to T3. Static diff review distinguishes layout utilities from visual classes.
- Existing product/IVA/barcode/stock/recipe/commission tests, full unit suite, standalone typecheck and scoped ESLint.
- Browser create/edit, product/service, unit/box and quick-add where accessible; do not persist business data.
- Layout-only change has no meaningful deterministic behavioral RED; use existing regression tests and visual inspection.

## Findings and progress
- Original agent left no source edits; only unrelated .atl registry changes exist.
- RDD is globally off; do not start review.
- Confirmed pre-existing quick-add bug: barcode image preview discarded because save submits empty image_url. Report separately; not authorized for layout fix.
- Audit confirmed a conditional quick-add IVA bug: delayed no-IVA settings can recalculate a typed total (119 -> 100 with initial 19% multiplier).
- Desktop before screenshot captured in local Chrome on port 3000; no-IVA product.

## T1 implementation and checks
- Product: consistent name/category breakpoint; uncapped no-IVA purchase/sale columns; package quantity and optional sale price paired from sm.
- Service: price and its existing tax breakdown share one column; duration sits alongside; description spans the row. No-IVA price and duration use consistent widths.
- Quick-add: name/category, SKU/barcode and unit/warehouse are paired; pricing precedes presentation/stock; optional package price aligns beneath unit sale price; unit-only stock no longer reserves an empty grid column.
- Layout-only test-first exception: no meaningful deterministic behavioral RED. Existing regression tests used instead.
- Focused `npx tsx --test` product/IVA/cost/flags/units/autofill/barcode/stock/recipe/commission suite: 93 passed, 0 failed. Initial sandbox npm DNS failure; authorized retry passed.
- `npx tsc --noEmit`: passed. Scoped ESLint on all four source files: passed. `git diff --check`: passed.
- Static JSX comparison: every non-layout attribute preserved across all four source files. Copy and visual class tokens preserved; only layout class changes and transparent wrapper/reordering edits.
- Source diff: 181 additions + 185 deletions (366 authored changed lines, primarily moved JSX). Unrelated .atl edits preserved.
- T1 implemented but commit deliberately pending browser inspection; T2 independent logic/full-suite/desktop/mobile verification remains pending.

## T2 verification and findings
- Full unit suite: 916 passed, 0 failed/skipped; initial sandbox DNS failure resolved by authorized escalation.
- Independent final-diff audit: non-class JSX attributes, handlers, UI copy and visual tokens preserved; plain layout wrappers only, no new behavior regressions found.
- Independent `npx tsc --noEmit` and parent `git diff --check`: passed.
- Native risk assessment was unassessable due untracked task document, treated as high; independent verification completed. RDD stays off.
- Four pre-existing logic findings remain unchanged: recipe-save retry can duplicate newly created catalog rows; quick-add has no concurrent submission guard; delayed no-IVA loading can change entered totals; barcode image preview is not persisted.
- Browser inspection partial: local no-IVA product screenshots and Service tab accessibility readback obtained. Scroll/inspection repeatedly failed with `noWindowsAvailable`; mobile, quick-add, edit and tax-enabled visual checks remain pending. No business data saved.

## T3 implementation and checks
- Product and service creation retain separate created IDs before recipe persistence. A recipe failure retries an update with current fields, never another creation; type switching is disabled after partial creation. Generated SKU is retained. Stock already created is shown through existing edit-stock controls; optional additional entries use the existing movement action instead of replaying initial stock.
- Quick-add uses a synchronous submit lock and disabled submit/advanced-navigation buttons while saving; `finally` releases the lock after failures.
- Price pairs accept an optional business-settings key. Changes to business IVA enablement or rate preserve typed totals; manual per-price IVA selector changes still preserve base. Shared-hook consumers without the key retain previous behavior.
- Quick-add persists HTTP(S) barcode image previews unless a File is selected. Cleared, blob and data previews are not saved as image URLs.
- Full SKU/barcode changed from 1:2 to equal 1:1 columns; quick-add already uses equal columns. No other new layout/style changes.
- Observed RED: new save/image/guard imports missing and `repricePair` absent; regression command failed before implementation. Initial sandbox tsx IPC denied; authorized rerun observed RED.
- GREEN: focused product/stock/recipe/commission suite, including real price-hook render transitions: 103 passed, 0 failed. New coverage includes creation/update failures, retry identity, synchronous acquisition/release, external image selection and no-IVA/rate/manual-selector transitions.
- `npm test`: 926 passed, 0 failed/skipped. Initial sandbox registry DNS failure; authorized rerun passed.
- `npx tsc --noEmit`: passed. Scoped ESLint on all edited source/test files: passed. `git diff --check`: passed.
- Independent final verification and remaining T2 browser scenarios pending; no commit or remote changes.

## T4 dependency-order implementation and checks
- Full product composition now renders presentation selector and units-per-box before purchase/sale prices, then optional box sale price, recipe, existing stock/price flags and stock controls. Commission stays afterward. Service layout and equal SKU/barcode columns are preserved.
- Presentation controls align with the units-per-box input itself (26px desktop label/gap offset). The same label/input/helper geometry is reserved invisibly in unit mode from `sm`, preventing the price section from jumping. Reserved inputs are disabled and hidden from accessibility; mobile removes the reserved field entirely.
- In box mode, units-per-box sits to the right of the Unit/Box selector from `sm`, and stacks below on mobile, in full and quick-add forms.
- Quick-add now renders presentation and units-per-box before prices, with quantity and stock summary afterward. All existing handlers, copy and visual classes are preserved; no new cards or dividers.
- `ProductPresentationSection` receives transparent pricing/recipe slots, so screen-reader/keyboard order matches visual order rather than using CSS reordering.
- No arithmetic, automatic price clearing or conversion changed. Switching presentation after entering a price still changes its unit/box interpretation; this task establishes the prerequisite order, not an inferred conversion rule.
- Observed rendered-DOM RED: three dependency-order tests failed before slots were rendered. GREEN: three rendered tests cover box, unit and ingredient modes. Quick-add is parent-browser verification because its router/auth integration is not mounted in these component tests.
- Independent T3 audit found a recipe RPC may commit before recipe-cache refresh fails. The form now retains attempted recipe kind before the call; off/type-change retries remove that uncertain recipe using the retained catalog identity. Added observed RED/GREEN regression for this case.
- Focused cached `tsx --test` layout/product/stock/recipe/commission suite: 107 passed, 0 failed/skipped. `npx tsc --noEmit` and scoped ESLint passed. `git diff --check` passed.
- Final alignment refinement observed RED (missing reserved control), then GREEN: 14 layout/save/tax tests passed.
- Final browser checks, independent verifier and full-suite rerun remain parent-owned; no commit or remote changes.

## Next step
Work-unit commit: `930bfa6` — `fix(inventory): stabilize product forms and save retries`. Includes T1/T3/T4 implementation and regression tests. Prior no-IVA commit `b0740cf` is included in the authorized main delivery. Full tests 930/930, typecheck/lint/build/diff checks passed. T2 remains partial only for disclosed visual scenarios.

Final independent verification: 930 full unit tests passed, 0 failed/skipped; typecheck, scoped lint and parent diff check passed. Plain npm test stalled resolving npx; exact cached underlying runner completed with authorization. Recipe success/refetch failure cleanup finding corrected and independently verified. No confirmed code blocker remains.

Final local browser: fresh Caja -> Unidad -> Caja screenshots now match accessibility state. Main purchase/sale prices retain identical screen position; tabs align with the units-per-box input; SKU/barcode equal widths visible. Optional box-sale field appears below main prices. Mobile, quick-add, editing and tax-enabled visual checks remain pending. No data saved.

T4 browser reproduction: entered 12000 purchase cost in unit mode; selecting box retained 12000 but relabeled it per box; setting 12 units derived unit cost 1000. No save performed. This confirms UX dependency risk, not the reported historical incident root cause. Correct order: identity -> presentation/pack size -> prices -> recipe/stock -> commission, preserving styles and copy.

Independent T3 verification complete, no confirmed blocker. Production `npm run build` passed after authorized escalation (initial sandbox Turbopack stalled; owned process stopped before retry). User authorized delivery directly to main after desktop visual verification. Commit identity pending. Remaining visual checks are follow-up limitations, not claimed complete.
