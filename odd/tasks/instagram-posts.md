# Instagram posts on the public business site

## Objective
Let a business owner show Instagram posts on their public site (`app/[slug]`) by pasting post links in the site editor.

## Problem / why
Owners want their Instagram on their Ventex site. Meta retired the Basic Display API (Dec 2024); an automatic feed needs a Meta app, App Review, Business/Creator accounts, per-tenant OAuth and 60-day token refresh. The user chose the simplest path for the client: paste post links, rendered with Instagram's public `embed.js`.

## Scope
- New `LandingConfig.instagramPosts: string[]` (max 6) stored in `business_sites.draft_config` jsonb.
- New section id `instagram` in `SITE_SECTION_IDS` (ordering/visibility handled by the existing sections panel).
- Editor UI to paste/remove links; public render via `embed.js`; works in the live preview.

## Constraints
- No SQL migration: `public_site_by_slug` returns `published_config || jsonb_build_object(...)` (`supabase/migrations/20261005010000_public_site_time_format.sql:51`), so new config keys reach the public site on publish.
- `normalizeLandingConfig` (`services/public-site.types.ts:297`) runs before save (`services/business-site.service.ts:148`): the field must be normalized there or it is dropped.
- Owner-entered URLs render on public pages: accept only `instagram.com/(p|reel|tv)/<id>` and rebuild a canonical permalink.
- UI copy in Colombian Spanish with tuteo.

## Tasks
- [x] T1 — Config + pure helper: `instagramPostUrl(raw)` (canonical permalink or null), `instagramPosts` in `LandingConfig` + default + normalizer (dedupe, cap 6), `instagram` section id + defaults. Tests first (`tests/site-instagram-config.test.ts`). Route: delegated (writer, together with T2).
- [x] T2 — UI: editor input list in `components/landing/LandingEditor.tsx`; client `InstagramSection` (next/script `embed.js` + `window.instgrm.Embeds.process()`) rendered from `ConfigurableSections` in `app/[slug]/templates/SiteSections.tsx`; renders nothing when empty. Route: delegated (writer; 2+ non-trivial files).

## Acceptance criteria
- Pasting `https://www.instagram.com/p/ABC123/?igsh=xyz` saves `https://www.instagram.com/p/ABC123/`; invalid links are rejected with a visible message.
- After publishing, the posts appear on `/[slug]` in the section's configured position; preview shows them too.
- Existing sites get the section appended automatically and show nothing until posts are added.

## Checks
`npm test`, `npx tsc --noEmit`, `npm run lint`.

## Delivery
Strategy: `ask-on-risk`. Forecast ~250 authored lines (under the 400 budget): single PR.

## Progress
- Branch `feat/instagram-posts` from `676b5b2`.
- T1 done in `3cce61d` (`feat(site): store instagram post links in landing config`). Route: delegated writer. Helper in `lib/instagram.ts` (`instagramPostUrl`, `instagramPostList`, `MAX_INSTAGRAM_POSTS = 6`).
  - RED: `npx tsx --test tests/site-instagram-config.test.ts` failed (module `lib/instagram` missing) before implementation.
  - GREEN: same command, 5/5 pass; `npm test` 580/580 pass; `npx tsc --noEmit` clean; eslint on touched files clean.
- T2 done in the commit `feat(site): render instagram posts section and editor` (the commit that checks this box). Route: delegated writer.
  - Editor: `components/landing/InstagramPostsEditor.tsx`, shown under the Instagram section in the Secciones panel.
  - Public: `app/[slug]/templates/InstagramSection.tsx` (client); embed.js via `next/script` (`lazyOnload`, `onReady`) on the public site. The editor preview portals into an iframe (`PreviewFrame`), so there the component injects embed.js into the frame's own document and processes it. Blockquotes are injected with `dangerouslySetInnerHTML` so embed.js can replace them without breaking React reconciliation; permalinks are re-validated at render.
  - Checks: `npm test` 580/580 pass; `npx tsc --noEmit` clean; eslint on touched files clean. Not run: browser check of the live embed (needs network + a real post).

- Review assessment (`676b5b2..e2b7237`, committed-only, unrelated untracked files excluded): risk `medium` (executable change), 387 lines, `review_due: false` (`under_budget`). Parent spot check: test file 5/5 pass; embed markup only interpolates the rebuilt permalink.

- Browser check (2026-10-10, dev :3001, editor preview only — nothing saved or published): a profile link is rejected with the inline error; `…/p/BsOGulcndj-/?igsh=abc123` is stored as `instagram.com/p/BsOGulcndj-/`; the embed renders inside the preview iframe; no console errors; removing the post hides the section. Not checked: public `/[slug]` after publish (needs publishing the real site). UX nit: a single post sits left-aligned (grid `auto-fill`).

## Next step
Manual check in the browser: add a post in the editor (preview), publish, open `/[slug]`. Then decide on PR.
