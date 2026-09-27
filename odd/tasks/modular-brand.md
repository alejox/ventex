# Modular Ventex brand

## Objective and authorization

Implement the approved modular identity from `README-VENTEX-IMPLEMENTACION-DE-MARCA.md` and `Ventex-Branding-Modular/` across the existing landing and product, without changing business logic or deploying. The user explicitly authorized implementation.

## Problem and current evidence

The current inline logo and indigo tokens predate the approved three-piece mark. Landing copy and metadata define Ventex too narrowly as POS; some future sectors appear without a clear availability label. The landing video already supports reduced motion but has no user pause control or interactive error fallback. The kit's mockups are conceptual, not product screenshots.

## Scope and constraints

- Use approved production SVG curves and adapt the existing light/dark Tailwind token system; preserve semantic colors.
- Preserve the original hero video, registration and billing routes, existing dashboard/POS behavior, tenant branding on receipts/public sites, PWA route/shortcut configuration, and existing permissions.
- Do not change database, auth, APIs, calculations, or deploy. Do not commit the entire design kit or use its mockups as product evidence.
- DejaVu Sans files are absent from the kit; use a documented system fallback until a licensed distribution is available.

## Configuration and delivery

- Branch: `feat/modular-brand`, based on `65aff06` (which matches `origin/main` at start).
- TDD: off, from prior project ODD configuration in `odd/tasks/academico-team-teachers.md`. Runner: `npm test` (`npx tsx --test tests/**/*.test.ts`). Ordinary functional checks still apply.
- RDD: disabled by explicit global preference (`gentle-ai review mode status`), so no native review or consent flow.
- Delivery strategy: `ask-on-risk` with user-selected `stacked-to-main` chain. Forecast: ~700–1100 authored changed lines across independent work units. Each independent PR slice targets `main`; no PR or push without a separate user decision. Running count: 0. Slice boundaries and commits: pending.

## Tasks

- [x] **T1 — Identity foundation.** Copy approved logo assets into production paths; update shared logo variants, light/dark color tokens, app metadata and actual PWA icons while retaining identifiers and behavior. Route: delegated writer (mapping/preparation and 2+ non-trivial files). Acceptance: three-piece symbol visible at intended sizes; app and landing use the same identity; both themes and semantic states remain legible. Checks: icon dimensions and rendered review, lint, typecheck/build.
- [ ] **T2 — Landing and video.** Update platform positioning and sector availability honestly, retain real CTAs/pricing, apply logo sizing, add video pause/replay and error fallback without harming reduced-motion or mobile behavior; add Devtecia credit. Route: delegated writer (2+ non-trivial files). Acceptance: video remains available; navigation and links work; future sectors are labeled; no unsupported claims. Checks: responsive visual snapshots at 360/390/768/1024/1440, keyboard/reduced-motion/video interaction, lint/build and relevant E2E.
- [ ] **T3 — Product shell and operations.** Integrate appropriate full/symbol logo in sidebar/mobile/auth/shared product surfaces, improve navigation accessibility and visual hierarchy of existing dashboard/POS without touching data or payments. Route: delegated writer (2+ non-trivial files). Acceptance: collapsed and expanded shell usable; dashboard metrics and POS totals/receipts unchanged; tenant logo preserved. Checks: responsive keyboard/zoom review, lint/build, relevant tests and safe E2E only.
- [ ] **T4 — Final validation and documentation.** Compare before/after captures where accessible, run complete checks and record anything untestable without authenticated safe data; update implementation notes. Route: delegated writer if non-trivial edits emerge; otherwise inline. Acceptance: verified outcomes and limitations documented, no production deployment.

## Progress and evidence

- Exploration: CodeGraph-backed map of logo, theme, landing, video, PWA, shell, dashboard, POS and tenant-brand boundaries completed.
- T1 observed: approved SVGs copied unchanged; 64/180/192/512px icon dimensions verified; maskable, app and Apple icons visually inspected; full logo seen in local landing capture at 360/390/768/1024/1440 with no document overflow. Scoped ESLint and `npx tsc --noEmit` passed; `npm run build` passed; `npm test` passed 349/349. Full-repo lint fails on seven existing `react-hooks/set-state-in-effect` errors outside changed files. Runtime harness: local production server `:3001`, landing at five widths. Rollback boundary: `public/brand/`, shared Logo, theme/layout/manifest and app/PWA icons. Commit: pending.
- Baseline before captures: unavailable because the pre-existing dev server held the Next lock and did not respond; after captures are in `/private/tmp/ventex-brand-after-{width}.png`. Authenticated screens require safe test access.
- User selected a chain onto `main` (stacked-to-main). Next step: close T1 commit and verify T2.
