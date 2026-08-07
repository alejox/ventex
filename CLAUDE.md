# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Critical:** This project pins **Next.js 16.2.9** with breaking changes from older versions. Before writing or editing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (per AGENTS.md). The most visible difference: middleware is now `proxy.ts` at the repo root (see below). `node_modules` is not committed — run `npm install` first.

## Commands

See `AGENTS.md` (imported above) for the full command list. Two easy-to-miss ones: `npm run icons` regenerates `app/assets/icons/DashboardIcons.tsx`, and E2E is Playwright (`e2e/`, 20+ specs) against a dev server on **port 3001**, not the usual 3000.

## What this is

Ventex is a multi-tenant, multi-vertical business-management platform (Spanish-language UI) on **Supabase** (Postgres + Auth). Each tenant picks a **business type** at registration — `tienda` (general retail; the only type currently open to public signup, see `REGISTRABLE_BUSINESS_TYPES` in `config/business.ts`), `salon`, `lavaautos` (car wash), or `servicios` (professional services) — which determines which modules/nav items it sees. `config/business.ts` is the single source of truth for that gating; don't duplicate its logic elsewhere.

On top of the tenant app there's a licensing/reseller layer: a super-admin panel (`/admin`) manages plans, companies, and credits; a reseller panel (`/reseller`) manages a reseller's own client accounts and license renewals. See **Roles & tenancy** below before touching any of this.

All UI strings are in Spanish — keep new copy consistent.

## Architecture

**Stack:** Next.js 16 App Router · React 19 · Tailwind CSS v4 · Supabase (`@supabase/ssr`). TypeScript path alias `@/*` → repo root.

### Routing & auth flow
- `app/(auth)/` — route group for `login`, `register`, `reset-password`, `update-password` (shared auth layout). `login/page.tsx` is a single mode (email+password or Google) — owners and workers both sign in the same way, since a worker's account is a real `auth.users` row created when they accept their email invitation (see Roles & tenancy below).
- `app/dashboard/` — the authenticated tenant app (POS, sales, inventory, purchases, pedidos, finance, customers, distributors, services, staff, vehicles, billing, calendar/appointments, subscription). `app/dashboard/layout.tsx` is a `"use client"` shell with the sidebar/topbar nav; which items render is computed from `config/business.ts` (`visibleNavItems` for owners, `workerNavItems` for staff), not hardcoded per page.
- `app/admin/` and `app/reseller/` — separate route trees for the super-admin and reseller panels (see Roles & tenancy). Each has its own `layout.tsx` **Server Component** that calls `fetchProfileServer()` and redirects to `/dashboard` unless the matching role flag is set; this is independent of `proxy.ts`.
- `proxy.ts` (repo root) — **this Next version's replacement for `middleware.ts`.** Exports `proxy(request)`. It refreshes the Supabase session and guards routes at the session level: unauthenticated hits to `/dashboard*` or `/admin*` redirect to `/login`; authenticated users on `/login` redirect to `/dashboard`. It does **not** cover `/reseller*` — that path relies entirely on its own `layout.tsx` check above.
- `app/auth/callback/route.ts` — route handler that exchanges an OAuth/email-confirmation `code` for a session, then redirects to `next` (default `/dashboard`).

### Roles & tenancy (read before touching auth, RLS, worker permissions, or cash shifts)
`public.profiles` carries three independent role flags, all read once per request by `fetchProfileServer()` (`services/profile.server.ts`, memoized with React `cache`): `is_super_admin`, `is_reseller`, `is_worker`. A plain owner account has all three `false`.

- **Workers** (`is_worker`) are staff sub-accounts an owner creates. The canonical record of a person is their **`public.staff` row** (name, role, commission); the login account is an optional facet of it, linked by `profiles.staff_id`, and both are administered together in `/dashboard/staff` ("Personal") through `stores/staff.store.ts` — there is no separate worker store, and Ajustes no longer has a Trabajadores tab (`/dashboard/settings/trabajadores` is a permanent redirect). `lib/team.ts` merges the two halves for display. Writing to `public.staff` is owner-only at the RLS level; SELECT stays open to the whole tenant because appointments need the roster. Workers are onboarded by email invitation (`/api/worker/create` → `services/invitation-email.server.ts`, accepted via `accept_workspace_invitation`), which gives them a real `auth.users` row — they then log in through the same `login/page.tsx` as an owner (email+password or Google), no separate flow. A worker's own `auth.uid()` is **not** the tenant id: every RLS policy and the `set_user_id` trigger call `get_effective_user_id()` instead, which resolves to `profiles.workspace_id` (the owner) for workers and to `auth.uid()` for everyone else. **Any new tenant-scoped table, policy, or RPC must key off `get_effective_user_id()`, not `auth.uid()`**, or a worker's writes silently attribute to the wrong tenant. What a worker can *see* is a separate, additive concern: granular `worker_permissions` (`config/business.ts`), with parent/child gating — e.g. `inventory_costs`/`inventory_edit`/`inventory_stock` all require `inventory`.
- **Cash shifts**: a worker must have an open shift (`public.shifts`; RPCs `open_shift`/`current_shift`/`close_shift`) before `create_sale` will let them record a sale — enforced *inside* `create_sale` itself, not just gated in the POS UI. Owners are exempt (their sales carry `shift_id = null`). Full model (arqueo/cierre math) is documented in `README-turnos.md`.
- **Super admin** (`/admin`) and **reseller** (`/reseller`) are guarded twice by design: the route's `layout.tsx` redirects non-role users server-side, and the cross-tenant RPCs it calls (e.g. `admin_save_plan`) independently re-check `is_super_admin()`/`is_reseller()` in SQL. Treat both checks as required — don't drop either when adding admin/reseller functionality.

### Supabase client factories — pick by context
There are **three** ways to construct a Supabase client; use the one matching where the code runs:
- `utils/supabase/client.ts` → `createClient()` — browser/Client Components (`createBrowserClient`).
- `utils/supabase/server.ts` → `await createClient()` — Server Components, Server Actions, route handlers (`createServerClient` wired to `next/headers` cookies). It is **async**.
- `utils/supabase/proxy.ts` → `updateSession(request)` — used only inside `proxy.ts` to refresh cookies on the request/response.

`utils/supabase/actions.ts` holds the `"use server"` auth actions (`login`, `signup`, `signout`) using the server client + `revalidatePath` + `redirect`. They are the **only** auth path: `login`/`signup` are wired to the `/login` and `/register` pages via `useActionState` (the login *page* used to sign in client-side via `client.ts` directly — that dual pattern is gone; don't reintroduce it). `signout` is used as a `<form action={signout}>` in `ShellUserMenu`, `OnboardingModal`, and `LicenseBlocked`. Google OAuth (`GoogleButton`) intentionally stays client-side (`signInWithOAuth` + the `/auth/confirm` callback route) — that's the standard `@supabase/ssr` pattern.

### Database (Supabase Postgres, `public` schema)
Connected via the `supabase` MCP server (project `omnnucpkdxbqzekzyopt`). The schema is much bigger than the original 4-table POS: `supabase/migrations/` (30+ files) is the source of truth for current shape — customers, distributors, products/categories, sales/sale_items, invoices/invoice_items (purchases), inventory_movements, services, staff, vehicles, appointments, shifts, settings, profiles, plans, and the reseller/admin schema. **Every table has RLS enabled and a `user_id` FK**, but tenancy resolves through `get_effective_user_id()` — see Roles & tenancy above — not bare `auth.uid()`. `products.category_id` → `categories.id`. Use the MCP `list_tables` / `apply_migration` tools for schema work (changes apply to the remote project directly); a handful of objects (`is_super_admin()`, `is_reseller()`, parts of the reseller schema) appear to have been applied this way without the `.sql` making it back into `supabase/migrations/` — if you're touching that area, verify against the live project with `list_tables`/`execute_sql` rather than trusting the migrations folder alone, and don't repeat the gap.

Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL` (used for the signup email redirect **and** for the notification/return URLs handed to dLocal; falls back to `http://localhost:3000`). `NEXT_PUBLIC_API_URL` is optional (base URL for the axios HTTP client — see data flow below). **`.env.example` is the full list** — including the dLocal Go and `CRON_SECRET` variables described in AGENTS.md's *Subscription billing* section.

### Data flow: component → store → services
See AGENTS.md's **Architecture (mandatory layers)** section (imported above) for the rule itself. Reference vertical slice: `services/inventory.service.ts` → `stores/inventory.store.ts` → `app/dashboard/inventory/page.tsx` — replicate this pattern for new modules. Older pages that still fetch via the Supabase client inside `useEffect` should be migrated to this flow when touched.

### Theming & design system
- **Tailwind CSS v4** — no `tailwind.config.*`. Configuration lives in `app/globals.css` via `@import "tailwindcss"` and an `@theme inline { ... }` block.
- Colors follow a Material-3-style token set (`--primary`, `--surface`, `--on-surface`, `--surface-container-*`, `--outline-variant`, etc.) defined as CSS variables. Use the generated utility classes (`bg-surface-container`, `text-on-surface-variant`, `border-outline-variant`, `text-error`, …) rather than hardcoding hex values where a token exists.
- Light/dark theming: `:root` = light, `:root[data-theme="dark"], .dark` = dark (the "Indigo Pulse" palette). A synchronous inline script in `app/layout.tsx` `<head>` applies the saved theme (`data-theme` + `dark` class) from `localStorage` **before hydration** to avoid flicker (FOUC), **defaulting to dark**. `components/ThemeProvider.tsx` (client, in the root layout) lazily initializes its state from that DOM attribute and exposes toggling via the `useTheme()` hook (no theme-applying `useEffect`).
- Font: `Plus_Jakarta_Sans` via `next/font/google`, exposed as `--font-plus-jakarta-sans` and the `font-sans` family.
- Shared icons live in `app/assets/icons/DashboardIcons.tsx`; brand marks in `components/Logo.tsx`.

## Project skills

Both `.agents/skills/` and `.claude/skills/` are git-ignored local caches — if a path below doesn't exist on your machine, that's expected, not broken.

Vendored under `.agents/skills/`, pinned in `skills-lock.json` (GitHub source + content hash) — re-fetch via the skills tool if missing:

- **`vercel-react-best-practices`** (`vercel-labs/agent-skills`) — 70 React/Next.js performance rules across 8 categories (waterfalls, bundle size, server perf, re-renders, etc.), prioritized by impact. Read `.agents/skills/vercel-react-best-practices/SKILL.md` for the index and `rules/<rule>.md` for each rule (full compiled guide in that folder's `AGENTS.md`). **Apply when writing, reviewing, or refactoring React/Next.js code.**
- **`supabase`** (`supabase`) — guidance for ANY Supabase task: Database, Auth, Edge Functions, Realtime, Storage, `@supabase/ssr` integration, RLS, CLI/MCP, migrations. **Apply when touching anything Supabase.**
- **`supabase-postgres-best-practices`** (`supabase`) — Postgres performance/best-practice rules (query perf, indexing, connection management, schema design) under `references/`. **Apply when writing, reviewing, or optimizing SQL, schema, or migrations.**
- **`Brainstorming Ideas Into Designs`** (`obra/superpowers-skills`) — Socratic, phase-based idea refinement. Use **before** writing code/plans when a feature idea is still rough.

`.claude/skills/ventex-invariants/SKILL.md`, referenced by `AGENTS.md`'s own Project skills section, is a **personal** skill — not vendored, not tracked in `skills-lock.json`, so there's no reproducible way to fetch it if it's absent. When it's missing, the **Roles & tenancy** section above and `README-turnos.md` are the closest checked-in substitute for the invariants it's meant to cover (profiles RLS/grants, worker permissions, tenancy, tax-inclusive pricing, cash-shift integrity) — keep them accurate as that fallback.

MCP: the **`supabase`** server is configured in `.mcp.json` (project `omnnucpkdxbqzekzyopt`) for schema/database work.
