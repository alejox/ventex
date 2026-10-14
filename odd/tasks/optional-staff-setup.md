# Optional staff setup

## Outcome
Owners can skip adding staff without blocking getting-started completion, and explicitly mark the staff step as done with a checkbox. Existing staff still completes the step automatically.

## Scope and decisions
- User explicitly requests optional staff and a manual done check.
- User clarified checkbox placement: inside the staff card, at the far right and vertically centered; control remains a sibling of the navigation Link.
- Reuse optional-step semantics already used by the website: exclude staff from required progress and completion.
- Manual completion is a separate per-membership browser preference, consistent with checklist dismissal. It must not hide the panel or overwrite dismissal/completion flags.
- Persist across reloads on this browser, not across devices. No schema changes or remote access.
- Keep school teacher wording, current navigation visibility, and all required setup steps unchanged.
- Native review disabled globally; ordinary verification remains applicable.
- Delivery ask-on-risk; forecast under 220 authored lines; one work unit.
- Preserve uncommitted CitySelect integration in business settings and unrelated .atl changes; neither belongs in this commit.

## Tasks
- [x] T1 — Optional staff step plus independent reversible manual completion checkbox.
  - Route: delegated direct (multi-file behavior and persistence).
  - Source surfaces: lib/getting-started.ts; components/onboarding/GettingStarted.tsx; tests/getting-started.test.ts; docs/guia-de-uso.md.
  - Acceptance: staff optional and ignored in required counts; owner may mark/unmark without navigating; existing staff auto-completes and cannot be manually undone; checkbox not nested in link; browser storage keyed by existing membership scope, no cross-scope leakage; storage exceptions fail gracefully.
  - Tests: meaningful pure logic RED → GREEN, full unit suite, focused lint, standalone typecheck; isolated real-component browser check of mark/unmark/reload/scope/auto-done/progress/keyboard and storage failure where feasible.
  - Commit: `c057ef2` — feat(onboarding): make staff setup optional with manual completion.
  - Risk assessment: high/unassessable due to untracked task inventory; independent verification completed; native review remains disabled/unmanaged.

## Progress
Implementation complete. Separate membership-keyed staff preference, reversible and with transient fallback if browser storage fails; real staff remains authoritative. Staff excluded from required progress; checkbox inside card, right-aligned and centered.

Observed checks:
- Focused deterministic RED: 12 pass / 4 expected failures; GREEN: 16/16.
- Full suite 979/979; focused ESLint, standalone typecheck, diff-check passed.
- Writer and independent real-component browser harness: mark/unmark, keyboard, reload, membership isolation, separate dismissal, no link navigation, auto-done disabled, teacher wording, optional completion and blocked-storage fallback passed. Parent replay passed.
- Independent layout harness compiled actual globals/Tailwind CSS: checked/unchecked at 390/768/1280px passed rightmost, vertical-center, inside-card, no overflow/overlap assertions. Parent repeated this check.
- Limitations: isolated profile/store/Next Link mocks; authenticated full-dashboard navigation and production build not exercised.
- Rollback boundary: getting-started domain/component/test and guide note, no database changes.

## Next step
Work unit committed locally on `feat/settings-logo-drop`. No push or merge performed. Existing uncommitted CitySelect and .atl changes remain preserved.
