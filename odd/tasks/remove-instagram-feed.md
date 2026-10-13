# Remove Instagram feed integration

## Objective
Remove the Instagram posts feature (connected account, Meta OAuth, cron sync, public-site section) entirely.

## Why
Meta requires Business Verification + App Review (Advanced Access for `instagram_business_basic`) before any non-tester account can connect. The business cannot be verified yet, so the feature only produces "Rol de desarrollador insuficiente" for real customers.

## Scope
- Remove: `instagram` site section, editor UI, store/services/protocol/popup libs, `/api/instagram/*`, cron entry, env vars, tests, AGENTS.md section.
- Keep: Instagram as a social/profile link (`lib/socialLinks.ts`, `lib/site-links.ts`, `BrandIcons`, contact config) — it does not use Meta's API.
- DB: user authorized dropping `instagram_connections`, `disconnect_instagram()`, `public_instagram_permalinks(text)` (migration `20261012200000_drop_instagram_connections.sql`). Existing migrations stay untouched.

## Constraints
- Saved site configs with `instagram` section or `instagramLayout`/`instagramCount` keys must still load (normalizer drops unknown keys/section ids).

## Tasks
- [x] T1 Remove Instagram feed code, tests, cron, env, docs (route: delegated — 2+ non-trivial files)
- [x] T3 Drop DB objects (inline; applied via MCP 2026-10-12; table had 0 rows; verified 0 instagram objects remain in `public`)
- [x] T4 Regenerate `utils/supabase/database.types.ts` after T1
- [x] T2 Verify: `npx tsc --noEmit`, `npm run lint` on touched paths, `npm test`

## Acceptance
- No reference to the feed remains outside migrations, `database.types.ts`, social-link code and `odd/`.
- Legacy configs normalize without errors (test).

## Progress
- Team photo size feature (separate) done and uncommitted; commit was blocked by the permission classifier — user commits.
- T1 done by delegated writer: 12 files deleted, feed removed from types/server/sections/editor/preview, cron, env, AGENTS.md; legacy-config test added.
- T4: types regenerated via MCP; diff = only instagram_connections + 2 RPCs removed (47 lines, 0 additions).
- T2 evidence: tsc only the 2 pre-existing ProductWalkthrough TS2307 (stale .next/types removed); eslint clean on touched files; npm test 876/879, 3 known failures in tests/product-walkthrough.test.ts; parent spot check of site-legacy/site-links/team-photo tests 10/10.
- Pending: user commit (commits blocked by classifier). Next: commit + deploy.
