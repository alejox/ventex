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

- [x] **T3** — (user request 2026-09-26) Specialty/instrument fields become
      selectors fed by the Académico catalog (`school_settings.instruments`),
      not free text: StudentForm, EnrollmentForm, and Personal's Perfil
      docente (drop the comma text input, keep chip multi-select). Legacy
      values not in the catalog stay selectable; empty catalog shows a hint
      linking to Configuración. Labels "Instrumento" → "Especialidad".
      Route: delegated writer (3 non-trivial files).

- [x] **T4** — (user request 2026-09-26) New student is created by typing
      the student's name; a customer is created behind the scenes. An
      "elegir un cliente existente" link keeps the current customer picker to
      avoid duplicates. Route: delegated writer.
- [ ] **T5** — Levels catalog: `school_settings.levels text[]`, edited in
      Configuración de Académico; StudentForm "Nivel" becomes a selector
      (legacy values preserved like specialties). Route: delegated writer.
- [ ] **T6** — Age ranges for group plans: `school_students.birth_date`,
      `school_lesson_plans.min_age/max_age` (optional). PlanForm edits the
      range when `max_group_size > 1`; EnrollmentForm WARNS (does not block)
      when the student's age is outside the range (user decision
      2026-09-26: warn and allow). Route: delegated writer.
      Migration `20260926120000_school_levels_and_age_ranges.sql` applied via
      MCP by the orchestrator.

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
- T3 done. Commit `d28ada8` — feat(school): elegir especialidades desde el
  catálogo en lugar de escribirlas. Route: delegated writer.
  Files: components/school/StudentForm.tsx, components/school/EnrollmentForm.tsx,
  app/dashboard/staff/page.tsx, services/school-settings.service.ts (new pure
  `specialtyOptions`/`specialtyLabel`), tests/school-settings.test.ts (new),
  e2e/school-cycle.spec.ts.
  Checks: `npx tsc --noEmit` clean; `npm test` 302/302 pass (294 baseline + 8
  new); `npm run lint` same 7 pre-existing errors/5 warnings as the T1/T2
  baseline, none in files touched by T3.
  Decisions: `school.config/page.tsx` (the catalog author) left untouched, as
  scoped. `specialtyOptions(catalog, selected)` returns the catalog in order
  plus any already-selected value(s) not in it (deduped) so a legacy
  instrument/specialty is never silently dropped when editing; `specialtyLabel`
  suffixes those with " (fuera del catálogo)" for display only — the stored
  value is always the raw name. StudentForm and EnrollmentForm each call
  `useSchoolStore`'s `fetchSettings` on mount (same pattern as the staff page)
  since neither route already had the catalog loaded. Staff page: replaced the
  `specialtiesText` (comma string) state with a `specialties: string[]` state
  directly toggled by the chip buttons — dropped the now-unused `normalizeName`
  import along with it; added `aria-pressed` to the chip buttons for a11y and
  so e2e can detect toggle state without inspecting CSS classes. Added
  `id`/`htmlFor` to the new `<select>`s (`student-instrument`,
  `enrollment-instrument`) so e2e can target them via `getByLabel`, matching
  how `components/ui/Select.tsx` already binds its own label. E2e: inserted a
  new "02b" step in `school-cycle.spec.ts` (before "03 profesor") that adds
  "Piano" to the Académico catalog via `/dashboard/school/config` if it's not
  already there — the suite had no prior catalog seeding since instrument
  fields were free text; the fill/click sites in tests 03–05 switched to
  `selectOption`/a guarded chip click. `e2e/school.spec.ts` needed no changes
  (it never touches these fields).
- T4 done. Commit `<T4_HASH>` — feat(school): crear alumno escribiendo su
  nombre. Route: delegated writer (writer trigger: 2+ non-trivial files —
  StudentForm.tsx + customers.store.ts).
  Files: components/school/StudentForm.tsx, stores/customers.store.ts,
  app/dashboard/school/estudiantes/page.tsx, e2e/school-cycle.spec.ts,
  odd/tasks/academico-team-teachers.md.
  Checks: reported once at the end of T6 below (T4/T5/T6 share several files
  — see the note there for why); this task's own logic is covered by the full
  `npx tsc --noEmit` / `npm run lint` / `npm test` run reported on T6.
  Decisions:
  - Fixed the layering violation named in scope: StudentForm no longer calls
    `fetchCustomers` from `services/customers.service.ts` directly — it reads
    `useCustomersStore` (already used by the Clientes screen), which was the
    natural home since it already had `fetchCustomers`/`addCustomer`.
  - `useCustomersStore.addCustomer` now returns `Customer | null` instead of
    `boolean` — StudentForm needs the created customer's `id` right away (not
    a re-read of the store's list) to save the student in the same submit and
    to keep it in `createdCustomerId` for a safe retry. Only one existing
    caller (`app/dashboard/customers/page.tsx`), unchanged: it only ever did
    `if (ok)`, which still works against a truthy `Customer`.
  - Default mode for a NEW student is "type a name" (`useExistingCustomer`
    starts `false`). The customer list is now fetched lazily — only when that
    toggle is on, never for edit mode — instead of always on mount like the
    old code did; no behavior anyone depended on, since the picker wasn't
    shown at all unless choosing an existing customer.
  - Partial-failure handling: customer creation and the student insert are
    two separate calls (no transaction/RPC exists for this pair). If the
    customer is created but `saveStudent` then fails, `createdCustomerId`
    stays in component state, so a retry (same open form) reuses that id
    instead of creating a second customer. If the user closes the modal at
    that point instead of retrying, the created customer is simply an orphan
    row with no linked student — accepted, documented in the component's own
    JSDoc, same class of harmless-orphan tradeoff as ePayco's unclaimed guest
    orders (AGENTS.md).
  - Editing an existing student shows the customer's name as **read-only**
    text (not an editable input): `updateCustomer` requires the customer's
    full `NewCustomerInput` shape (email/phone/identification/doc_type/
    tax_exempt), and StudentForm only ever has the joined `full_name` — not
    those other fields — so submitting from here would silently null them
    out. The read-only note links to Clientes instead. Verified via
    `codegraph_explore`/grep that `<StudentForm student={...}>` (edit mode)
    has no caller yet — only `app/dashboard/school/estudiantes/page.tsx`
    renders it, always without `student` — so this path is dead code today,
    implemented correctly ahead of whenever a caller is added.
  - e2e (`e2e/school-cycle.spec.ts`, test "04 alumno + acudiente"): the
    customer for `STUDENT_CUSTOMER_NAME` is already created earlier in that
    same test via the pre-existing `createCustomer()` helper (it's reused
    later as the enrollment's payer) — so the test clicks the new "elegí un
    cliente existente" link and keeps the existing `pickCombo`, instead of
    switching to the name-typing path (which would create a *second*,
    unrelated customer with the same name). `e2e/school.spec.ts` doesn't touch
    StudentForm at all (verified by grep) — untouched.
