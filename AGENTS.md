<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project skills

- **`ventex-invariants`** (`.claude/skills/ventex-invariants/SKILL.md`) — non-negotiable rules for `public.profiles` RLS and grants, worker permissions, tenancy columns, tax-inclusive pricing, and cash-shift integrity. **Load before touching RLS, grants, tax math, cash shifts, or any route handler using `createAdminClient()`.**
