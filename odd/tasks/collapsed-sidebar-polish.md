# Collapsed sidebar polish and landing gating

## Objective

Make the collapsed (icon rail) sidebar feel intentional: smooth expand/collapse, square icon buttons with small radii, and an animated tooltip that names each icon. Hide the "Landing" nav item from general retail (`tienda`) tenants.

## Problem

- Expanding the sidebar flashes: the width animates from `w-20` to `w-60` while the expanded content (labels, group headers, footer labels) renders immediately inside a still-narrow column, so text wraps/clips and appears to vanish.
- The collapsed rail uses pill-shaped (`rounded-xl`) buttons, an active accent bar that collides with the rounded background, and a toggle button with an oval focus ring. Visually noisy.
- Icons only expose the native `title` tooltip: slow, unstyled, and not discoverable.
- `landing` is in `UNIVERSAL_NAV_IDS` (`config/business.ts`), so a general store sees the public booking site editor that belongs to appointment-based businesses (barbershops/salons).

## Scope

- S1 — Smooth expand/collapse: content must not render in its expanded layout until there is room (or must not wrap/clip while width animates). Respect `prefers-reduced-motion`.
- S2 — Collapsed rail restyle: square icon buttons (fixed size, small radius, e.g. `rounded-lg`), consistent active state without the colliding edge bar, lighter group separators, toggle button with a correct focus ring. Apply to nav items and the footer (admin, plan, settings) in collapsed mode.
- S3 — Animated tooltip on hover and keyboard focus in the collapsed rail, rendered through a portal with fixed positioning (the nav's `overflow-y-auto` would clip an absolutely positioned tooltip). `role="tooltip"`, linked with `aria-describedby`, no native `title` duplicate, reduced-motion aware, token colors only.
- S4 — Landing gating: move `landing` out of `UNIVERSAL_NAV_IDS` into `BASE_NAV_BY_TYPE` for every type except `tienda`. Keep `config/business.ts` as the single source of truth; check worker nav and any tests that assert nav membership.

## Out of scope

- Expanded-mode redesign (done in `dashboard-sidebar-ux`).
- Route-level blocking of `/dashboard/landing` for `tienda` unless an existing per-module route-guard pattern already covers it.
- Header/search changes.

## Route and delivery

- Route: delegated direct writer (DashboardShell, business config, new tooltip component).
- TDD: not configured; ordinary checks (`npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`).
- Delivery: work-unit commits on `feat/modular-brand`, then fast-forward to `main` per the user's standing request.

## Checklist

- [x] S1 — Smooth expand/collapse animation
- [x] S2 — Collapsed rail restyle (square icons)
- [x] S3 — Animated tooltip
- [x] S4 — Hide Landing from `tienda`
- [x] S5 — Verification and commits

## Acceptance criteria

- Expanding/collapsing shows no wrapped, clipped, or vanishing text mid-transition.
- Collapsed icons are square with small radii; active state is clear and not clipped.
- Hovering or focusing any collapsed icon shows an animated tooltip with its name, not clipped by the nav scroll container.
- A `tienda` account does not see "Landing"; salon, escuela, lavaautos, and servicios still do.
- tsc, lint, tests, and build pass.

## Progress

- **S1**: Added a `sidebarExpandedContent` state, separate from `sidebarCollapsed` (which now only drives the animated `width`). The `<aside>` transitions `width` only (`transition-[width]`, `motion-reduce:transition-none`) with `overflow-hidden`. Expanding waits for the width transition to finish (`onTransitionEnd`, filtered to `e.target === e.currentTarget && e.propertyName === "width"`) before flipping to the labeled layout; collapsing (and reduced motion) flips immediately in the toggle button's `onClick`, no effect involved — avoids `react-hooks/set-state-in-effect`. Logo (`LogoSymbol`/`LogoHorizontal`), the "Menú Principal" label, group dividers, and the nav-group-vs-rail branch all key off `sidebarExpandedContent` instead of `sidebarCollapsed`.
- **S2**: New shared `COLLAPSED_ICON_BUTTON`/`COLLAPSED_FOCUS_RING` classes (`w-11 h-11 rounded-lg`, `mx-auto` for centering in the full-width row) applied to the main rail items and the collapsed footer links (admin, reseller, footer nav, settings). Dropped the colliding `before:` accent bar — active state is a tinted background only. Focus moved from `outline` to `ring` (box-shadow), which follows `border-radius` correctly (the outline rendered as an oval on rounded corners in some browsers). Collapsed group dividers lightened from `border-outline-variant/10` to `/8`. Toggle button kept its own smaller size but got the same ring-based focus style.
- **S3**: New `components/ui/SidebarTooltip.tsx`. Uses a render-prop (`children: (trigger) => ReactElement`) instead of `cloneElement`, because `cloneElement(children, { ref, ... })` tripped `react-hooks/refs` ("Cannot access refs during render") — the linter can't see that `cloneElement` is a safe consumer of a ref-bearing object. The render-prop pattern lets each call site spread `{...trigger}` directly onto its own `<Link>`, keeping `ref` a plain JSX attribute. Position is computed via `getBoundingClientRect()` on show and rendered through `createPortal(..., document.body)` with `position: fixed`, matching the existing pattern in `components/ui/Select.tsx` (the nav's `overflow-y-auto` would clip an absolutely positioned tooltip). Entrance is a `requestAnimationFrame`-delayed opacity/translate-x class flip (`transition-[opacity,transform] duration-150`), skipped instantly under `prefers-reduced-motion` (also has `motion-reduce:transition-none` as a CSS-level backstop). Hides on Escape, window scroll (capture, to catch the nav's own scroll), mouseleave, and blur. `role="tooltip"`; native `title` removed from every wrapped trigger; `aria-label` kept on the link itself instead of `aria-describedby` (the plan's stated alternative) to avoid a double announcement.
- **S4**: `landing` moved out of `UNIVERSAL_NAV_IDS` into `BASE_NAV_BY_TYPE` for `salon`, `lavaautos`, `servicios`, `escuela` (not `tienda`), with updated Spanish comments explaining why. Checked `workerNavItems`: `landing` isn't a `WorkerPermission` at all, so workers never saw it regardless — no change needed there. Checked `groupNavItems`/`NAV_GROUP_ORDER` (`presencia` group), `QUICK_ACTIONS`/`BASE_QUICK_BY_TYPE` (no quick action references `landing`), `tests/business-escuela.test.ts` (doesn't assert on `landing`), and `e2e/` (`landing-brand.spec.ts`, `public-site.spec.ts`, `auth.spec.ts` all test the *public marketing* landing page or the business's own published site page, not sidebar-nav visibility) — none needed updating. Did not add route-level blocking of `/dashboard/landing` for `tienda`: no existing per-module route-guard pattern exists to reuse (checked `app/dashboard/landing/page.tsx`, `app/dashboard/school/*`, `app/dashboard/vehicles/page.tsx` — all module-gated pages rely on nav-only gating, no server-side redirect precedent), matching the plan's out-of-scope note.
- **S5**: see Verification evidence below. Commits: `feat(nav): hide landing from general retail` (config/business.ts) and `feat(nav): polish collapsed sidebar rail with animated tooltips` (DashboardShell.tsx, SidebarTooltip.tsx, plan doc).

## Verification evidence

- `npx tsc --noEmit`: pass, no output.
- `npm run lint`: pass, no errors/warnings (one `react-hooks/refs` error surfaced mid-implementation from the first `cloneElement`-based tooltip draft; fixed by switching to the render-prop API described in S3 above).
- `npm test`: pass — 351/351, 0 failures.
- `npm run build`: pass — Turbopack production build compiled and typechecked successfully, all 78 pages generated.
- Not independently verified: visual behavior (no-flash expand/collapse timing, tooltip animation smoothness, exact focus-ring rendering across browsers) — no running dev server or browser was used in this session; verification is limited to tsc/lint/tests/build as scoped in S5.
