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

### Phase 2 — automatic feed via Instagram Login (user request 2026-10-10)
The owner connects their Instagram professional account once (OAuth); new posts show up on the site automatically. Manual links stay as the fallback. The user is creating the Meta app (env `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`, redirect `${NEXT_PUBLIC_SITE_URL}/api/instagram/callback`); until Meta approves Advanced Access only tester accounts can connect.
- [x] T3 — Pure protocol module `services/instagram-protocol.ts` (authorize URL, token/refresh response parsing, expiry math, needs-refresh rule, media response → permalinks) with tests first. Route: delegated writer.
- [x] T4 — Migration `instagram_connections` (one row per tenant, `user_id default get_effective_user_id()`; token columns never readable by `authenticated`; owner reads status columns; public SECURITY DEFINER function returns only cached permalinks for a published site slug). File only — applying to the remote project waits for user approval. Route: delegated writer.
- [x] T5 — Server routes: `/api/instagram/connect` (owner only, state cookie), `/api/instagram/callback` (verify state, code → short → long token, fetch profile + media, upsert with admin client), `/api/instagram/sync` (`CRON_SECRET`, refresh tokens + media), disconnect. Degrade with a clear message when env is missing. Route: delegated writer.
- [x] T6 — UI + render: `LandingConfig.instagramSource: "manual" | "account"`, editor connect/disconnect + mode switch, public site and preview use cached account media when `account`. Route: delegated writer.

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

- Phase 2 (T3–T6), route: delegated writer (one bounded writer for 2+ non-trivial files).
  - T3 `fb7bc90` `feat(instagram): add pure instagram login protocol helpers`. RED: `npx tsx --test tests/instagram-protocol.test.ts` failed with `Cannot find module '../services/instagram-protocol'`. GREEN: 12/12 pass.
  - T4 `9f4baa9` `feat(instagram): add instagram_connections table with token-safe grants`. Migration file only — **NOT applied** to the remote project (waits for user approval). Types added by hand to `utils/supabase/database.types.ts`; `npx tsc --noEmit` clean.
  - T5 `87ab461` `feat(instagram): connect accounts via oauth and sync posts daily`. Adds OAuth state helpers (+1 test, written together with the code — no separate RED observed), `services/instagram.server.ts`, `/api/instagram/{connect,callback,sync}`, daily cron `0 9 * * *`, env vars. Sync exports GET (Vercel Cron uses GET) and POST.
  - T6 `a673896` `feat(site): show posts from a connected instagram account`. RED: `npx tsx --test tests/site-instagram-config.test.ts` 6/7 (instagramSource test failing). GREEN: 7/7. Also adds the return-to-editor helper (+1 test) so the OAuth round trip lands on `?site=<id>&tab=sections`.
  - Checks after T6: `npx tsx --test tests/instagram-protocol.test.ts` 14/14; `npm test` 596/596; `npx tsc --noEmit` clean; eslint on every touched file clean.
  - Not checked: real OAuth round trip and media fetch against Meta (needs the Meta app, env vars and a tester account); migration grants on a live database.
  - Parent spot check: protocol + config tests 21/21; migration revokes all from anon/authenticated and grants only status columns.
  - Review assessment (`676b5b2..422c11f`, committed-only, unrelated untracked excluded): risk `medium`, 1764 lines, `review_due: true` (`slice_budget_reached`). Native review PENDING: preflight STATUS asks for an `intended_untracked_selection` (the user's unrelated untracked files) and my submission was rejected as `invalid_request` (exact JSON shape unknown). Not retried blindly.

- Migration `20261010120000_instagram_connections.sql` APPLIED to the remote project (user-approved, 2026-10-10) via MCP `apply_migration`. Live checks: `authenticated` cannot SELECT `access_token`/`ig_user_id` nor INSERT; `anon` cannot read the table or run `disconnect_instagram()`; `public_instagram_permalinks('no-existe')` → `{}`; RLS on. Security advisors only flag the intentional SECURITY DEFINER RPCs (same pattern as `public_site_by_slug`).
- Meta app: Instagram App ID `1452775806291607`; only `instagram_business_basic` added; business login redirect `https://www.ventex.app/api/instagram/callback`; tester @ventex.app invited (pending acceptance). Prod `NEXT_PUBLIC_SITE_URL` must be `https://www.ventex.app` (apex 308-redirects to www).

- Popup connect (branch `feat/instagram-connect-popup` from `7293a43`), route: delegated writer. `b038650` `feat(instagram): connect the account in a popup without leaving the editor`. "Conectar Instagram" opens `/api/instagram/connect?popup=1` in a popup; the callback renders a no-store page that `postMessage`s the result to the exact site origin (plus a same-origin BroadcastChannel in case Instagram's COOP severs `window.opener`) and closes; the editor validates origin/type/result, toasts, and refreshes the status; a hand-closed popup refreshes once; a blocked popup falls back to the same-tab flow.
  - RED: `npx tsx --test tests/instagram-popup.test.ts` failed (module `lib/instagram-popup` missing). GREEN: 8/8.
  - Checks: `npm test` 865/865; `npx tsc --noEmit` clean; eslint on every touched file clean.
  - Not checked: real popup round trip in a browser against Meta (whether Instagram's COOP severs the opener is unverified; the BroadcastChannel covers it either way).

## Next step
Phase 2: user approves applying `20261010120000_instagram_connections.sql`, sets `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET` and registers the redirect URI in Meta, then a tester account runs Conectar Instagram end to end.

Phase 1 (earlier): Manual check in the browser: add a post in the editor (preview), publish, open `/[slug]`. Then decide on PR.
