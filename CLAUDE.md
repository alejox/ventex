# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Critical:** This project pins **Next.js 16.2.9** with breaking changes from older versions. Before writing or editing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (per AGENTS.md). The most visible difference: middleware is now `proxy.ts` at the repo root (see below). `node_modules` is not committed — run `npm install` first.

## Commands

```bash
npm install      # required first — node_modules is not checked in
npm run dev      # start dev server at http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint (flat config via eslint-config-next)
```

There is no test framework configured.

## What this is

Ventex is a multi-tenant POS / business-management app (Spanish-language UI). The backend is **Supabase** (Postgres + Auth). All UI strings are in Spanish — keep new copy consistent.

## Architecture

**Stack:** Next.js 16 App Router · React 19 · Tailwind CSS v4 · Supabase (`@supabase/ssr`). TypeScript path alias `@/*` → repo root.

### Routing & auth flow
- `app/(auth)/` — route group for `login`, `register`, `reset-password`, `update-password` (shared auth layout).
- `app/dashboard/` — the authenticated app (POS, inventory, finance, customers, distributors, calendar). `app/dashboard/layout.tsx` is a `"use client"` shell with the sidebar/topbar nav.
- `proxy.ts` (repo root) — **this Next version's replacement for `middleware.ts`.** Exports `proxy(request)`. It refreshes the Supabase session and guards routes: unauthenticated hits to `/dashboard*` redirect to `/login`; authenticated users on `/login` redirect to `/dashboard`.
- `app/auth/callback/route.ts` — route handler that exchanges an OAuth/email-confirmation `code` for a session, then redirects to `next` (default `/dashboard`).

### Supabase client factories — pick by context
There are **three** ways to construct a Supabase client; use the one matching where the code runs:
- `utils/supabase/client.ts` → `createClient()` — browser/Client Components (`createBrowserClient`).
- `utils/supabase/server.ts` → `await createClient()` — Server Components, Server Actions, route handlers (`createServerClient` wired to `next/headers` cookies). It is **async**.
- `utils/supabase/proxy.ts` → `updateSession(request)` — used only inside `proxy.ts` to refresh cookies on the request/response.

`utils/supabase/actions.ts` holds the `"use server"` auth actions (`login`, `signup`, `signout`) using the server client + `revalidatePath` + `redirect`. Note: the login *page* currently signs in client-side via `client.ts` directly rather than calling the `login` action — both patterns exist in the codebase.

### Database (Supabase Postgres, `public` schema)
Connected via the `supabase` MCP server (project `omnnucpkdxbqzekzyopt`). Tables: `customers`, `distributors`, `products`, `categories`. **Every table has RLS enabled and a `user_id` FK to `auth.users`** — the app is tenant-isolated per authenticated user, so all rows you insert must set `user_id`, and queries are scoped by RLS. `products.category_id` → `categories.id`. Use the MCP `list_tables` / `apply_migration` tools for schema work (changes apply to the remote project directly).

Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL` (used for the signup email redirect; falls back to `http://localhost:3000`). `NEXT_PUBLIC_API_URL` is optional (base URL for the axios HTTP client — see data flow below).

### Data flow: component → store → services (MANDATORY)
All feature work follows a strict layered architecture. **Components never perform I/O directly** — they read from a zustand store and dispatch store actions; the store delegates to a services layer that owns the actual I/O.

- **Components** (`app/**`, `components/**`): consume zustand stores via granular selectors (`useXStore((s) => s.field)`) and call store actions. UI-only state (modals, form fields) stays in local `useState`. No `axios`/`supabase`/`fetch` here.
- **Stores** (`stores/<feature>.store.ts`, **zustand** `^5`): hold state + async actions that delegate to services. Use functional updates (`set((s) => …)`). No JSX, no direct I/O. Actions return a boolean/result the component can act on (e.g. close a modal on success).
- **Services** (`services/<feature>.service.ts`): the only layer that performs I/O. App data uses the existing `@supabase/ssr` client (`utils/supabase/client.ts`) so RLS/per-user auth stays intact and **inserts must set `user_id`**. **axios** (`^1`, shared instance in `services/http.ts`) is reserved for external HTTP APIs. Services own the domain types and return plain data.

Reference vertical slice: `services/inventory.service.ts` → `stores/inventory.store.ts` → `app/dashboard/inventory/page.tsx`. Replicate this pattern for new modules. Older pages that still fetch via the Supabase client inside `useEffect` should be migrated to this flow when touched.

### Theming & design system
- **Tailwind CSS v4** — no `tailwind.config.*`. Configuration lives in `app/globals.css` via `@import "tailwindcss"` and an `@theme inline { ... }` block.
- Colors follow a Material-3-style token set (`--primary`, `--surface`, `--on-surface`, `--surface-container-*`, `--outline-variant`, etc.) defined as CSS variables. Use the generated utility classes (`bg-surface-container`, `text-on-surface-variant`, `border-outline-variant`, `text-error`, …) rather than hardcoding hex values where a token exists.
- Light/dark theming: `:root` = light, `:root[data-theme="dark"], .dark` = dark (the "Indigo Pulse" palette). A synchronous inline script in `app/layout.tsx` `<head>` applies the saved theme (`data-theme` + `dark` class) from `localStorage` **before hydration** to avoid flicker (FOUC), **defaulting to dark**. `components/ThemeProvider.tsx` (client, in the root layout) lazily initializes its state from that DOM attribute and exposes toggling via the `useTheme()` hook (no theme-applying `useEffect`).
- Font: `Plus_Jakarta_Sans` via `next/font/google`, exposed as `--font-plus-jakarta-sans` and the `font-sans` family.
- Shared icons live in `app/assets/icons/DashboardIcons.tsx`; brand marks in `components/Logo.tsx`.

## Project skills

Agent skills are vendored under `.agents/skills/` (those pulled via the skills tool are pinned in `skills-lock.json` with their GitHub source + content hash). Consult them when relevant:

- **`vercel-react-best-practices`** (`vercel-labs/agent-skills`) — 70 React/Next.js performance rules across 8 categories (waterfalls, bundle size, server perf, re-renders, etc.), prioritized by impact. Read `.agents/skills/vercel-react-best-practices/SKILL.md` for the index and `rules/<rule>.md` for each rule (full compiled guide in that folder's `AGENTS.md`). **Apply when writing, reviewing, or refactoring React/Next.js code.**
- **`supabase`** (`supabase`) — guidance for ANY Supabase task: Database, Auth, Edge Functions, Realtime, Storage, `@supabase/ssr` integration, RLS, CLI/MCP, migrations. **Apply when touching anything Supabase.**
- **`supabase-postgres-best-practices`** (`supabase`) — Postgres performance/best-practice rules (query perf, indexing, connection management, schema design) under `references/`. **Apply when writing, reviewing, or optimizing SQL, schema, or migrations.**
- **`Brainstorming Ideas Into Designs`** (`obra/superpowers-skills`) — Socratic, phase-based idea refinement. Use **before** writing code/plans when a feature idea is still rough.

MCP: the **`supabase`** server is configured in `.mcp.json` (project `omnnucpkdxbqzekzyopt`) for schema/database work.
