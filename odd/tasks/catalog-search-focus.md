# Catalog search focus

## Outcome
Products and services share a search field that is ready for typing on catalog entry and desktop window/tab return, like the POS initial focus experience.

## Scope and constraints
- User authorizes focus behavior in Products and Services, including opening or returning from another window.
- Keep URL-backed search text and filters intact; focus only, no resetting or selecting text unnecessarily.
- Initial focus follows POS behavior; return focus is desktop/fine-pointer only to avoid repeatedly opening mobile keyboards.
- Do not steal focus from another input, textarea, select, contenteditable control, or an open modal/dialog. Entry with `?new=1` must leave the new-item dialog usable.
- No POS behavior changes, network I/O, schema changes, or remote operations.
- Delivery ask-on-risk; forecast below 220 authored lines; one work unit. RDD disabled globally.

## Tasks
- [x] T1 — Focus catalog search safely on entry and visible desktop return.
  - Route: delegated direct (new focus behavior, event lifecycle, tests).
  - Allowed source surfaces: app/dashboard/inventory/page.tsx; lib/useCatalogSearchFocus.ts; tests/catalog-search-focus.test.ts.
  - Acceptance: products/services/new tab entry focused; return focus on window focus/visibility/pageshow; active editors and modal focus preserved; search text unchanged; listeners/animation frames cleaned up on unmount; no offscreen focus while hidden.
  - Checks: deterministic meaningful focus policy/lifecycle tests RED → GREEN where runnable; focused lint; standalone typecheck; full npm test; isolated real-hook or page browser checks with real events and dialogs, including mobile policy.
  - Commit: `20377e7` — feat(catalog): focus search on entry and window return.
  - Risk: unassessable/high (untracked inventory); independent verifier and targeted correction validation completed. Native review disabled/unmanaged.

## Progress
Catalog callback ref binds focus when the search input mounts, even after loading. Entry focuses on first visible attempt; desktop return events restore safely, preserving active editors/dialogs and URL query. Barcode scanner custom overlay also blocks focus.

Observed verification:
- Meaningful deterministic RED then GREEN 3/3; independent browser verification found an initial/mobile rAF rescheduling race.
- Bounded correction retained entry intent across early focus/pageshow and hidden frames; RED 2 new failures then GREEN 5/5.
- Full suite 984/984, focused ESLint, standalone typecheck and diff-check passed.
- Actual hook/shared Modal Chromium harness passed delayed mount, StrictMode, new tab, URL preservation, return events, active editors, modal/new-item simulation, scanner overlay, hidden frames, mobile policy and unmount cleanup.
- Independent targeted validation passed mobile early focus/pageshow/hidden-entry cases, editor/modal intent consumption and detached-ref guard. Parent replayed edge harness successfully.
- Limitations: isolated hook/Modal harness, not authenticated full catalog/ProductModal/OpenOnNewParam E2E; production build not run (typecheck passed).
- Rollback boundary: inventory search ref, focus hook and regression tests; POS untouched.

## Next step
Committed locally on feat/catalog-search-focus. No push performed or authorized by this new request.
