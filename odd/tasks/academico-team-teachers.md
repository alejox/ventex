# academico-team-teachers

## Objective

Unify teacher management into the team ("Equipo → Personal") and make the
school module generic for any kind of academy: the business type is renamed
"Académico" in all user-facing copy.

## Problem / Why

A teacher is already a `public.staff` row extended by
`school_teacher_profiles.staff_id`. Today the owner creates the person in
Personal and then goes to Escuela → Profesores to "convert" them — two screens
for one person. "Instrumentos"/"Escuela de música" also lock the module to
music schools.

## Scope (authorized by user, 2026-09-26)

- Remove "Profesores" from the Escuela nav group; `/dashboard/school/profesores`
  becomes a permanent redirect to `/dashboard/staff`.
- In Personal, when the tenant has the `school` module active, the person form
  gets an optional "Perfil docente" section (specialties, bio, availability),
  created/edited in place.
- UI copy: "Instrumentos" → "Especialidades"; "Escuela de música"/"Escuela" →
  "Académico" (business-type label, module label, nav group, headings, public
  token pages).

## Constraints

- Internal ids stay: `BusinessType "escuela"`, module `school`, column
  `instruments`, routes `/dashboard/school/*`. No DB migration (label-only).
- Component → store → service layering (AGENTS.md).
- UI copy in neutral Spanish.

## TDD

Off. Runner: `npm test` (`npx tsx --test tests/**/*.test.ts`), covers pure
logic only; no component-test harness. Existing tests asserting labels
(`tests/business-escuela.test.ts`) are updated alongside.

## Delivery

Strategy: `ask-on-risk`. Forecast ~300–450 authored changed lines. RDD: off
(global) — no native review.

## Tasks

- [x] **T1** — Rename user-facing "Escuela de música"/"Escuela" to "Académico"
      (config/business.ts labels + nav group, school dashboard heading, public
      token pages, unit tests, e2e heading assertions). Route: delegated writer.
- [x] **T2** — Move teacher profile into Personal: "Perfil docente" section in
      the staff form (specialties, bio, availability) gated by `school` module;
      remove `school-profesores` nav item; redirect
      `/dashboard/school/profesores` → `/dashboard/staff`; update e2e refs.
      Route: delegated writer (2+ non-trivial files, mapping trigger).

## Acceptance criteria

- No "Escuela de música" or "Instrumentos" left in UI copy.
- A tenant with `school` creates a team member and its teacher profile from
  Personal in one flow; Escuela nav no longer lists Profesores.
- Existing teachers still appear/edit correctly (same data).

## Checks

`npx tsc --noEmit`, `npm run lint`, `npm test`.

## Progress

- Branch `feat/academico-team-teachers` created.
- T1 done. Commit `8de0389` — feat(school): renombrar 'Escuela de música' a
  'Académico' en copy de usuario. Route: delegated writer.
  Files: config/business.ts, app/dashboard/school/page.tsx,
  app/dashboard/school/config/page.tsx, app/school/c/[token]/page.tsx,
  app/school/f/[token]/page.tsx, components/onboarding/OnboardingModal.tsx,
  services/school-settings.service.ts, tests/business-escuela.test.ts,
  e2e/school.spec.ts, e2e/school-cycle.spec.ts.
  Checks: `npx tsc --noEmit` clean; `npm test` 294/294 pass; `npm run lint`
  has 7 pre-existing errors/5 warnings, all in files untouched by this task
  (PosCartPanel.tsx, DataTable.tsx, reseller/clients/page.tsx, etc.) —
  confirmed via `git diff --stat` before committing.
  Decision: left per-student/per-lesson "instrumento" labels (StudentForm,
  EnrollmentForm, message-template `{instrumento}` token) unchanged — those
  name the actual subject a specific student studies, not the module/catalog
  label; only the catalog-level "Instrumentos" (Ajustes de Académico) and the
  business-type/module labels were renamed to "Especialidades"/"Académico".
  Profesores screen and TeacherForm.tsx were left untouched in T1 (they are
  fully replaced/deleted in T2) to avoid a wasted diff.
- T2 done. Commit `adb4f84` — feat(school): mover el perfil docente a
  Personal, quitar la pantalla de Profesores. Route: delegated writer.
  Files: app/dashboard/staff/page.tsx, app/dashboard/school/profesores/page.tsx
  (rewritten to permanentRedirect, mirroring
  app/dashboard/settings/trabajadores/page.tsx), app/dashboard/school/page.tsx,
  components/DashboardShell.tsx, components/school/TeacherForm.tsx (deleted),
  config/business.ts, services/school-people.service.ts,
  stores/school-people.store.ts, stores/staff.store.ts,
  e2e/school.spec.ts, e2e/school-cycle.spec.ts.
  Checks: `npx tsc --noEmit` clean; `npm test` 294/294 pass; `npm run lint`
  same 7 pre-existing errors/5 warnings as the T1 baseline, none in files
  touched by T2 (confirmed by file path).
  Diff size: 265 insertions / 374 deletions (639 authored lines), over the
  ~400-line advisory. Justified: 374 of those are deletions from removing two
  fully-superseded files (TeacherForm.tsx, the old profesores/page.tsx body) —
  the actual new logic is concentrated in staff/page.tsx's "Perfil docente"
  section (~150 of the 224 added lines there); did not split further since
  the feature (form + list badge + nav/redirect + e2e) is one coherent unit.
  Key decision — toggle-off never deletes: the "Es profesor" checkbox has no
  delete path. Turning it off for an EXISTING teacher just hides the fields on
  save; the `school_teacher_profiles` row (and any lessons/enrollments/
  availability tied to it) is left completely untouched in the database. There
  is no "delete teacher profile" affordance anywhere in this feature — the
  safest option per the task's own suggested alternatives, and consistent with
  services/AGENTS.md's "archived, never deleted" pattern for `services`.
  Gating helper: `effectiveModules(profile.businessType, profile.modules).school`
  (same computation DashboardShell already uses for the sidebar), not a
  re-derived `profile.modules.school` boolean — keeps the Personal section in
  sync with whatever decides Académico is active elsewhere.
  Reused stores/services as-is: `useSchoolPeopleStore` (`teachers`,
  `fetchTeachers`, `saveTeacher`) and `useSchoolStore` (`settings.instruments`
  for the specialty-chip suggestions, `fetchSettings`) — no new store/service
  was created for this.
