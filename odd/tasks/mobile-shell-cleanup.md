# Mobile dashboard navigation cleanup

Reduce mobile header and drawer noise while keeping all actions reachable and preserving desktop behavior and visual identity.

## Scope
- Header below lg: menu/logo, notifications, user menu only. Workspace switching/site links remain accessible in drawer.
- Drawer: identity/context, compact search, primary navigation, secondary tools, existing administration access.
- Mobile group expansion independent of desktop persisted preferences; current group clear without all desktop groups leaking open.
- Preserve owner/worker permissions, links, unsaved-navigation guard, focus trap, Escape/backdrop close and modal handoff.
- Preserve colors, typography, icons, radii and touch-target sizes. No product form changes.
- Branch feat/mobile-shell-cleanup; base7287eff. User explicitly authorized completion and direct-main push. Preserve unrelated .atl changes.
- Delivery ask-on-risk; forecast ~250-350 authored lines, revise after implementation before committing if over400.

## Tasks
- [x] T1 Simplify responsive header and reorder drawer with regression tests. Route delegated: multiple non-trivial files and preparation for writes.
- [x] T2 Independently verify behavior and browser mobile/tablet/desktop layout. Route delegated verification and parent UI inspection. Remaining boundary/account scenarios disclosed below.

## Acceptance and checks
- No secondary header icons below1024px, including360/390/768/1023 widths; desktop1024+ unchanged.
- Search/tools remain reachable; expense owner-only; workspace/site controls not lost.
- Primary navigation visible near drawer top; sensible expansion and no duplicate panel IDs.
- Focused shell/nav/command-palette/site/notification tests with observed RED/GREEN where meaningful, full unit suite, tsc, scoped lint and diff-check.
- Browser menu open/close, search/calculator modal handoff, responsive overflow, primary group state, unchanged desktop.

## Evidence
- User screenshots and local360px Chrome screenshot show seven header actions and oversized top Quick actions block.
- Header buttons combine hidden responsive classes with HEADER_ICON_BUTTON containing inline-flex: inspect CSS display conflict and use unambiguous responsive visibility rather than merely changing breakpoints.
- Drawer already has focus trap and runFromDrawer close-before-modal coordination; preserve these.
- RDD globally off.

## Implementation and verification
- T1 code complete; commit pending parent visual readback. Added a desktop-only wrapper instead of competing button display utilities, reordered mobile drawer, reused workspace/site controls, and isolated mobile accordion state with mobile-prefixed panel IDs.
- Observed RED: three rendered regression assertions failed for responsive boundary, drawer ordering, and controlled active-group collapse. GREEN: all five new assertions pass.
- Focused shell/accessibility/command-palette/site/notification checks: 26 passed.
- Full `npm test`: 935 passed, zero failed/skipped.
- `npx tsc --noEmit`, scoped ESLint and `git diff --check`: passed.
- T2 browser/mobile/tablet/desktop checks remain pending parent inspection. No remote operation or product-form change.
- Authored source/test changes approximately 309 lines before this document; below the 400-line advisory forecast. No commit created.
- Rollback boundary: shell responsive grouping, mobile-only layout/accordion helpers and their tests; desktop persisted preferences and business services remain unchanged.

## Next step
Final independent audit found no confirmed blocking regression. Independent full suite935/935, tsc, diff check and production build passed; sandbox build stalled and owned process was stopped before authorized retry.

Browser: clean header captured at360 and390px; reorganized390px drawer shows navigation first, current group initially open; opening Sales closes Inventory. Calculator opens after drawer closes; Escape closes calculator and restores menu-trigger focus. Tablet768px keeps clean header; desktop with emulation off retains sidebar and full header controls. No data saved. Exact1023/1024 boundary, live worker/multi-workspace switching and search-modal handoff were not exercised in browser; related permissions/state are covered structurally and by tests.

Proceed with authorized commit and direct-main push, excluding .atl. Work-unit identity pending.
