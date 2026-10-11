# Site links in the header + Instagram section options

## Objective
1. The header "Ver sitio web" opens the RIGHT public site when a tenant has more than one site.
2. Instagram section: account-only (manual links removed) with configurable card layout.

## Problem / why
- `components/DashboardShell.tsx` (~line 670) renders one "Ver sitio web" link that always points to the tenant's main site. Tenants can now have several sites ("Mis páginas", `20261006000000_multiple_business_sites.sql`), so editing site B and clicking it opens site A.
- The user wants Instagram only through the connected account (manual mode removed) and options for how the post cards are shown.

## Decisions (user asked for "una solución práctica")
- Header: 0 published sites → keep current behavior (hidden or as today). 1 site → direct link (unchanged). 2+ sites → the button opens a small menu listing every site (name, public URL, Publicada/Borrador badge), each opening in a new tab; when the editor is open on a site (`/dashboard/landing?site=<id>`), that site is listed first and marked "Editando".
- Instagram: remove `instagramSource`/manual links UI; the section always uses the connected account's cached posts. New options in `LandingConfig`: `instagramLayout: "grid" | "carousel"` (default "grid") and `instagramCount: 3 | 6 | 9` (default 6). Raise the cached cap to 9 (`MAX_INSTAGRAM_POSTS`); existing connections hold up to 6 until the next daily sync or a reconnect.

## Tasks
- [x] T1 — Header site menu (store/service for the tenant's sites, DashboardShell UI, tests for the pure "which sites / order" logic). Route: delegated writer.
- [x] T2 — Instagram: drop manual mode (config normalizer ignores old `instagramPosts`/`instagramSource`), add layout + count options (editor controls + public render + preview), raise cap to 9, tests. Update AGENTS.md Instagram section. Route: delegated writer.

## Acceptance criteria
- With two sites, the header shows both and opens the chosen one; with one site behavior is unchanged.
- The Instagram editor shows only the account flow plus "Diseño" (Cuadrícula / Carrusel) and "Cantidad" (3 / 6 / 9); preview and public site honor them.
- Old configs with manual posts load without errors and render the account posts.

## Checks
`npm test`, `npx tsc --noEmit`, `npx eslint <touched>`, `npm run build`.

## Progress
- Branch `feat/site-links-instagram-options` from `origin/main` `5e2acea`.
- T1 done in `ac4f894` feat(shell): list every site in the header "Ver sitio web" menu. Route: delegated writer.
  - Pure logic `lib/site-links.ts` (`siteLinksView`, `editingSiteIdFrom`); RED: `npx tsx --test tests/site-links.test.ts` → "Cannot find module '../lib/site-links'"; GREEN: 6/6 pass.
  - Store/service unchanged: the shell reads the existing `useBusinessSiteStore.sites`.
  - Draft sites: listed with a "Borrador" badge but NOT links (non-interactive row, "Publícala para poder verla"). Linking to the editor was rejected: `/dashboard/landing` decides its mode once at mount, so a same-route link would not switch the open editor, and that page is outside this scope.
  - Menu order: site in the editor first ("Editando", read from `?site=` when the menu opens), then published, then drafts; disclosure button (`aria-expanded`), Escape returns focus, ArrowUp/Down move between links, outside click closes. The mobile drawer has no "Ver sitio web" entry, so nothing to align there.
- T2 done in `188d46b` feat(instagram): show only the connected account with grid or carousel options. Route: delegated writer.
  - RED: `npx tsx --test tests/site-instagram-config.test.ts tests/instagram-protocol.test.ts` → 6 of 24 failing (new layout/count/old-key/cap-9 tests); GREEN: 24/24.
  - Account posts moved out of `LandingConfig` into `PublicSite.instagramPosts` (server fetch only when the section is visible; preview fills it from the store).
  - Carousel: scroll-snap row, 340px cards, prev/next `IconButton`s always rendered (disabled at the ends → no layout shift), smooth scroll unless reduced motion.
- Verification (after T2): `npm test` 878/878 pass; `npx tsc --noEmit` clean; `npx eslint <touched>` clean; `npm run build` succeeded.
- Next: push / PR is the user's decision.
