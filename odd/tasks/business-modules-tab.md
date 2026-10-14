# Business modules settings tab

## Outcome
Move the existing Negocio y módulos card out of General into its own Configuración tab, preserving business type changes, module toggles, confirmation, save and refresh.

## Constraints
- User explicitly requests a separate tab for business modules.
- Label: Negocio y módulos. Route: /dashboard/settings/modulos, protected by existing settings layout.
- Move existing behavior without domain or persistence changes; General retains normal preferences and the hardware card remains removed.
- Preserve pending POS/navigation and local catalog-focus work. No remote operations authorized.
- Delivery ask-on-risk, forecast approximately 390 authored changed lines (relocation counted as additions plus deletions), one work unit; avoid cosmetic churn.
- RDD disabled globally; ordinary verification applies.

## Tasks
- [x] T1 — Relocate business/modules card into its own tab.
  - Route: delegated direct; three-file UI relocation and dependency cleanup.
  - Source surfaces: app/dashboard/settings/page.tsx; app/dashboard/settings/SettingsTabs.tsx; app/dashboard/settings/modulos/page.tsx.
  - Acceptance: new tab active only at exact modules route; card absent General and present on new route; module/type confirmation/save unchanged; inherited worker authorization preserved; no device setup card reintroduced.
  - Verification: relocation without new domain logic, so existing deterministic business tests plus actual component/tab browser checks replace artificial source-only RED. Observe missing-tab/route behavior before change where practical; focused lint, typecheck, full tests, production build.
  - Commit: follows this completed record; exact identity added after commit.
  - Risk: high/unassessable due to new route inventory; independent verification passed. Native review disabled/unmanaged.

## Progress
Relocated entire card/form with byte-identical BusinessModulesForm. General retains owner-shift/profile preferences and hardware-card removal. Tab follows Datos de tu negocio; new route inherits settings authorization.

Observed checks:
- Missing modules route observed before relocation; no artificial RED for unchanged domain logic.
- Focused business tests 13/13; full suite 986/986; focused ESLint, standalone TypeScript and diff-check passed.
- Production build passed and includes /dashboard/settings/modulos. Sandbox stall resolved by approved external rerun.
- Actual-component Chromium harness passed exact active tab, defaults/toggle, same-type save, type-change cancel/confirm, module cleanup, refresh, card relocation and hardware absence.
- Independent verifier confirmed byte-identical moved form and remaining General forms/helpers; repeated focused tests, typecheck and browser harness. Parent replay passed.
- Limitations: mocked stores/router; authenticated backend persistence and server guard execution not exercised. No hardware tested.
- Authored source relocation 398 changed lines; no size-only rewrites. Task artifact records proof separately.
- Rollback boundary: the three source files; no database/store/service changes.

## Next step
Commit local work unit; no push authorized. Related local POS navigation and hardware-removal work already committed.
