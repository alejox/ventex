# Primary POS navigation

## Outcome
Expose Punto de Venta directly after Panel, outside expandable modules, and move Historial de ventas to the first position in Finanzas on desktop and mobile.

## Scope and constraints
- User explicitly requests this navigation reorganization.
- Keep existing item IDs, names, routes, business visibility and worker permissions unchanged.
- Billing remains in its existing Ventas group, which automatically renders flat if it is the sole remaining visible item.
- Shared group configuration drives desktop and mobile; no renderer change needed.
- Preserve local catalog-search-focus commits; no remote operation authorized by this request.
- RDD globally disabled; delivery ask-on-risk; forecast below 100 authored lines, one work unit.
- Additional user authorization: remove the printer/cash-drawer setup card from Configuración → General. Preserve receipt printing, manual drawer opening, existing local preferences and automatic opening for already authorized supported devices; no permission bypass or new automatic pairing.

## Tasks
- [x] T1 — Make POS standalone and sales history a Finance item.
  - Route: delegated direct (configuration behavior with regression tests).
  - Source surfaces: config/business.ts; tests/business-production.test.ts.
  - Acceptance: Panel then unlabeled POS group; no POS under any expandable group; sales first in Finanzas; no duplicates or lost items, billing preserved; existing owner/worker visibility and routes unchanged; mobile uses same groups.
  - Checks: focused deterministic tests RED → GREEN; business/mobile-navigation tests; npm test; standalone typecheck; focused lint; diff-check; renderer/browser structural check where useful.
  - Commit: `b85eab3` — feat(navigation): promote POS and move sales history to finance.
  - Risk: high/unassessable inventory; independent verifier completed. RDD disabled/unmanaged.
- [x] T2 — Remove the hardware setup card from General.
  - Route: inline direct; already-understood mechanical removal of one import and one JSX element in one file.
  - Source surface: app/dashboard/settings/page.tsx.
  - Acceptance: no printer/drawer setup card in General; other settings unchanged; drawer store/services and POS print/manual/auto paths untouched.
  - Checks: structural diff/readback; focused lint/typecheck and cash-drawer/receipt regressions; full suite with T1 verification.
  - Commit: follows this verified record; identity added after commit. Risk addressed by the same independent verification; RDD disabled/unmanaged.

## Progress
T1 verified: deterministic RED 2 failures → GREEN focused 10/10; final full suite 986/986; lint/typecheck/diff-check passed. Independent focused business/mobile/drawer/POS checks 51/51; actual desktop/mobile renderer harness confirms standalone POS and Finance ordering; parent replay passed. No authenticated browser navigation tested.

T2 removal structurally reviewed; final full suite and independent verifier confirm only the General card import/render changed. Default auto-open/auto transport and existing device preferences unchanged. USB/serial still require prior browser authorization; no real hardware tested or new automatic pairing implemented.

## Next step
Navigation and hardware-card removal verified locally. Business/modules relocation is tracked separately at odd/tasks/business-modules-tab.md. No push authorized.
