<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Commands

```bash
npm install           # required first — node_modules is not checked in
npm run dev           # dev server at http://localhost:3000
npm run dev -- -p 3001  # E2E convention — the team's dev server runs on :3001
npm run build         # production build (also serves as typecheck)
npm run lint          # eslint (flat config via eslint-config-next)
npx tsc --noEmit      # standalone typecheck without build
npm run icons         # regenerate app/assets/icons/DashboardIcons.tsx
npx playwright test   # E2E (e2e/) — dev server must be running on :3001 first (no webServer in config)
```

No unit test framework configured. Playwright config (`playwright.config.ts`): `baseURL` is **http://localhost:3001** (the team's dev port, not 3000 — keep it that way; 3000 is often occupied by other local projects), `fullyParallel: false`, `retries: 1`. Supabase schema is managed via MCP (project `omnnucpkdxbqzekzyopt`), configured in `.mcp.json`/`opencode.json`.

# Architecture (mandatory layers)

**Components never perform I/O directly.** All features follow:

`components/app` → `stores/<feature>.store.ts` (Zustand) → `services/<feature>.service.ts` (I/O)

- **Components**: read stores via granular selectors (`useXStore((s) => s.field)`); UI-only state in `useState`. No `axios`/`supabase`/`fetch`.
- **Stores**: state + async actions delegating to services. No JSX, no direct I/O.
- **Services**: the only layer doing I/O. Supabase client for app data (RLS preserved); `axios` (`services/http.ts`) for external APIs only.

Reference slice: `services/inventory.service.ts` → `stores/inventory.store.ts` → `app/dashboard/inventory/page.tsx`.

# Tenancy: key off `get_effective_user_id()`, NOT `auth.uid()`

Workers (`profiles.is_worker`) log in with their **own** auth account, but their tenant is the owner's. Every RLS policy, trigger, and RPC uses `public.get_effective_user_id()` (resolves to the owner's `workspace_id` for workers, `auth.uid()` otherwise). **Any new tenant-scoped table, policy, default, or RPC must key off `get_effective_user_id()`** — using bare `auth.uid()` silently attributes worker writes to the wrong tenant. See `supabase/migrations/20260715000000_add_worker_role.sql` and `20260730230000_align_tenant_insert_defaults.sql` (which enforces this as the `user_id` column default).

# Supabase

- **Client factories** — pick by context:
  - `utils/supabase/client.ts` → `createClient()` — Client Components (browser)
  - `utils/supabase/server.ts` → `await createClient()` — Server Components / Server Actions / route handlers (**async**)
  - `utils/supabase/proxy.ts` → `updateSession(request)` — only inside `proxy.ts`
  - `utils/supabase/admin.ts` → `createAdminClient()` — service-role key, **bypasses RLS**; only for privileged server-side work (admin/reseller), never exposed to clients. Requires `SUPABASE_SERVICE_ROLE_KEY`.
- **Migrations**: apply via MCP `apply_migration`, then save the `.sql` to `supabase/migrations/` (56 files) to keep repo and remote in sync. After schema changes, regenerate `utils/supabase/database.types.ts` (MCP `generate_typescript_types`).
- **`create_sale` RPC**: transactional sale creation (calculates totals server-side, applies IVA from `settings`, decrements stock, freezes staff commission). Employees without an open shift (`public.shifts`) are rejected — enforced inside the RPC, not just gated in the POS UI. Owners are exempt. Shift model: `README-turnos.md`.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` required; `NEXT_PUBLIC_SITE_URL` (signup email redirect, defaults to `http://localhost:3000`); `NEXT_PUBLIC_API_URL` optional (axios base).

# Next.js 16 specifics

- **`proxy.ts`** (repo root) replaces `middleware.ts`. Exports `proxy(request)`. Handles session refresh and route guards (`/dashboard*`, `/admin*`; **not** `/reseller*` — that route group guards itself via its `layout.tsx` Server Component using `fetchProfileServer()`).
- `node_modules/next/dist/docs/` contains the version-specific guides — read before writing Next.js code.

# Conventions

- **UI is entirely in Spanish** — keep new copy consistent.
- **TypeScript path alias**: `@/*` → repo root.
- **Tailwind CSS v4**: no `tailwind.config.*`. Theme tokens defined in `app/globals.css` via `@theme inline`. Use token classes (`bg-surface-container`, `text-on-surface`, etc.) — do not hardcode hex values.
- **Theming**: `:root` = light, `:root[data-theme="dark"]` / `.dark` = dark. Synchronous inline script in `app/layout.tsx` applies saved theme before hydration (defaults to dark). `components/ThemeProvider.tsx` manages toggling via `useTheme()` hook.
- **Business-type gating**: which modules/nav items a tenant sees is computed from `config/business.ts` (`REGISTRABLE_BUSINESS_TYPES`, `visibleNavItems`, `workerNavItems`) — single source of truth; don't duplicate that logic per page.

# Project skills & docs

- `.agents/skills/` is a git-ignored local cache pinned by `skills-lock.json` (re-fetch via the skills tool if missing): `supabase`, `supabase-postgres-best-practices`, `vercel-react-best-practices`, brainstorming.
- `.claude/skills/ventex-invariants/SKILL.md` is a **personal** skill, not vendored — it may be absent on this machine; don't rely on it. The checked-in substitutes are this tenancy section, `CLAUDE.md`'s Roles & tenancy notes, and `README-turnos.md` (cash-shift model).
