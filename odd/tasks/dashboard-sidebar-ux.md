# Dashboard sidebar UX refinement

## Objective

Improve the dashboard sidebar's hierarchy, density, active-state clarity, and user control without changing navigation permissions, route contracts, or module ordering.

## Problem

The current sidebar is functionally correct but visually dominant. Active groups cannot be collapsed, parent and child items have similar emphasis, and the operational menu is not visually distinct enough from account/admin actions.

## Scope

- Allow the active navigation group to be collapsed while retaining active-route semantics.
- Strengthen parent/child hierarchy and active child treatment in expanded and collapsed modes.
- Compact the expanded sidebar without truncating existing labels.
- Make the account/administration footer section more explicit.
- Preserve `visibleNavItems`, `workerNavItems`, module gating, responsive focus behavior, and persisted collapse preferences.

## Out of scope

- Reordering modules.
- Hiding items behind a “Más” menu.
- Changing route names, permissions, or business-type gating.
- Redesigning the global header/search.

## Authorized scope

The user explicitly authorized implementation of the validated first UX iteration.

## Route and delivery

- Route: delegated direct writer; implementation spans `components/SidebarNavGroup.tsx` and `components/DashboardShell.tsx`.
- Delivery strategy: stacked-to-main work-unit commit, continuing the user's prior chain preference.
- Forecast: approximately 80–140 authored changed lines; below the 400-line slice budget.
- TDD: no explicit TDD mode found; use ordinary functional checks with the repository's lint, typecheck, build, and targeted browser validation where available.

## Checklist

- [x] S1 — Refine group toggle and active child semantics.
- [x] S2 — Apply visual hierarchy, density, and account/admin separation.
- [x] S3 — Run verification and record evidence.

## Acceptance criteria

- Active groups open by default but can be collapsed.
- Active child remains discoverable and accessible when its group is collapsed.
- Parent controls expose correct `aria-expanded`, `aria-controls`, and keyboard behavior.
- Expanded sidebar is visibly less dense without truncating labels.
- Footer account/admin area has clear visual separation.
- Permission-filtered navigation and responsive drawer behavior are unchanged.
- Lint, TypeScript, build, and diff checks pass.

## Progress

S1–S3 complete. Active group opens by default and can be collapsed (local override keyed to the active item); active child gets a left accent bar; sidebar narrowed to w-60 with tighter paddings; footer labelled "Cuenta y administración" on desktop and mobile.

## Verification evidence

- `npx tsc --noEmit`: exit 0
- `npx eslint components/SidebarNavGroup.tsx components/DashboardShell.tsx`: clean
- `git diff --check`: clean
- `npm run build`: success
- Browser/E2E validation: not run

## Next step

Visual check in the browser; push/PR is the user's decision.
