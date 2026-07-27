<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Commands

```bash
npm install           # required first — node_modules is not checked in
npm run dev           # dev server at http://localhost:3000
npm run build         # production build (also serves as typecheck)
npm run lint          # eslint (flat config via eslint-config-next)
npx tsc --noEmit      # standalone typecheck without build
npm run icons         # regenerate app/assets/icons/DashboardIcons.tsx
npx playwright test   # E2E — requires dev server running on port 3001
```

No unit test framework configured. E2E uses Playwright (`e2e/`), expects `http://localhost:3001`.

# Architecture (mandatory layers)

**Components never perform I/O directly.** All features follow:

`components/app` → `stores/<feature>.store.ts` (Zustand) → `services/<feature>.service.ts` (I/O)

- **Components**: read stores via granular selectors (`useXStore((s) => s.field)`); UI-only state in `useState`. No `axios`/`supabase`/`fetch`.
- **Stores**: state + async actions delegating to services. No JSX, no direct I/O.
- **Services**: the only layer doing I/O. Supabase client for app data (RLS preserved); `axios` (`services/http.ts`) for external APIs only.

Reference slice: `services/inventory.service.ts` → `stores/inventory.store.ts` → `app/dashboard/inventory/page.tsx`.

# Next.js 16 specifics

- **`proxy.ts`** (repo root) replaces `middleware.ts`. Exports `proxy(request)`. Handles session refresh and route guards.
- `node_modules/next/dist/docs/` contains the version-specific guides — read before writing Next.js code.

# Supabase

- **Multi-tenant via RLS**: every table has `user_id` FK to `auth.users` + RLS policy scoped to `auth.uid()`. Inserts rely on trigger `set_user_id` (default `auth.uid()`).
- **Client factories** — pick by context:
  - `utils/supabase/client.ts` → `createClient()` — Client Components (browser)
  - `utils/supabase/server.ts` → `await createClient()` — Server Components / Server Actions / route handlers (**async**)
  - `utils/supabase/proxy.ts` → `updateSession(request)` — only inside `proxy.ts`
- **Migrations**: apply via MCP `apply_migration` tool, then save the `.sql` to `supabase/migrations/` to keep repo and remote in sync. After schema changes, regenerate `utils/supabase/database.types.ts`.
- **`create_sale` RPC**: transactional sale creation (calculates totals server-side, applies IVA from `settings`, decrements stock). Employees without an open shift are rejected.

# Conventions

- **UI is entirely in Spanish** — keep new copy consistent.
- **TypeScript path alias**: `@/*` → repo root.
- **Tailwind CSS v4**: no `tailwind.config.*`. Theme tokens defined in `app/globals.css` via `@theme inline`. Use token classes (`bg-surface-container`, `text-on-surface`, etc.) — do not hardcode hex values.
- **Theming**: `:root` = light, `:root[data-theme="dark"]` / `.dark` = dark. Synchronous inline script in `app/layout.tsx` applies saved theme before hydration (defaults to dark). `components/ThemeProvider.tsx` manages toggling via `useTheme()` hook.

# Project skills

- **`ventex-invariants`** (`.claude/skills/ventex-invariants/SKILL.md`) — non-negotiable rules for `public.profiles` RLS and grants, worker permissions, tenancy columns, tax-inclusive pricing, and cash-shift integrity. **Load before touching RLS, grants, tax math, cash shifts, or any route handler using `createAdminClient()`.**
