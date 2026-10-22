# Hero title font picker

## Objective
Let the business choose the font of the landing hero title, including handwritten/cursive options, from the editor's Diseño tab.

## Problem / why
Every template hardcodes its hero title font. The owner wants to personalize the main title, especially with a handwritten cursive.

## Scope
- New optional `hero.titleFont` in `LandingConfig` (`null` = template default), normalized in `services/public-site.types.ts` (unknown values → `null`).
- Curated font list loaded with `next/font/google` in one shared module (`app/[slug]/templates/hero-fonts.ts`), `preload: false` so only the chosen font downloads.
- All 10 templates apply the chosen font to the hero `<h1>` only (inline style wins over CSS modules); script fonts drop uppercase/tracking.
- Editor: "Fuente del título principal" picker in the Diseño tab (`DesignPanel`), right after "Color principal" (user moved it from Secciones → Portada), each option previewed in its own font.
- Pure registry + normalizer in `lib/hero-title-fonts.ts` (testable under `tsx --test`); `next/font` instances only in `app/[slug]/templates/hero-fonts.ts`.

## Constraints
- No DB migration: `business_sites_*_config_valid` CHECKs validate only `version` and `template`.
- Only the hero title changes; body/section fonts stay per template.
- UI copy in Spanish (Colombia, tuteo).

## Tasks
- [x] T1 — Config field + normalization + font registry + tests (route: delegated writer; trigger: 2+ non-trivial files). Evidence: RED `Cannot find module '../lib/hero-title-fonts'` / `'../components/landing/HeroTitleFontField'`; GREEN `npm test` 1027/1027.
- [x] T2 — Apply in all 10 templates (route: delegated writer, same unit). Evidence: `style={heroTitleFontStyle(hero.titleFont)}` on the hero h1 of all 10; `npx tsc --noEmit` clean.
- [x] T3 — Editor picker in the Diseño tab after "Color principal" (route: delegated writer, same unit). Evidence: `tests/landing-hero-title.test.tsx` picker tests green; eslint clean on touched files. Visual check in browser pending.
- [x] T4 — Follow-up: 13 more fonts (20 total) grouped Elegantes/Modernas/Manuscritas, and compact picker (one preview + native grouped `<select>`, since `components/ui/Select` has no `<optgroup>` support) replacing the button grid (route: delegated writer; trigger: 2+ non-trivial files). Evidence: RED 6 failing tests (missing `heroTitleFontGroups`/`group`/new ids, no preview/select); GREEN `npm test` 1031/1031; `tsc` clean; eslint clean; `npm run build` exit 0 (all Google fonts resolved). Browser check pending.
- [x] T5 — Picker uses the shared `components/ui/Select` (user request). `Select` extended backward-compatibly: `<optgroup>` children flattened with `group` + non-interactive headers (`role="presentation"`, `aria-hidden`) before each visible group, per-option `style` applied to its row and to the trigger label, optional `aria-describedby` passthrough; `readOptions`/`groupHeaderBefore` exported (route: delegated writer; trigger: 2+ non-trivial files). Evidence: RED 5 failing in `tests/ui-select-groups.test.tsx` + 3 in `tests/landing-hero-title.test.tsx` (flat-markup baseline captured before the change kept passing); GREEN `npm test` 1038/1038; `tsc` clean; eslint clean; `npm run build` exit 0. Open-listbox rendering (headers, per-option font) not visually checked.

- [x] T6 — Any chosen font is independent of the template: filled (no Qutter outline), no forced uppercase or tracking; "De la plantilla" keeps the full template style (route: inline; 2 small files) — RED 2 fails, then `tests/hero-title-font.test.ts` 14/14, `npm test` 1040/1040.

## Acceptance criteria
- Choosing a font changes the hero title in the editor preview and the published site.
- "De la plantilla" restores the template's original font.
- Saved configs without the field behave exactly as before.

## Checks
`npm test`, `npx tsc --noEmit`, `npm run lint` (scoped to touched files).

## Progress
- 2026-10-21: document created; T1–T3 delegated as one writer unit.
- Engram mirror: pending (Engram tools not loaded this session).
- Commits: not made — `main` has uncommitted staff/hero-title work awaiting the user's commit decision.

- 2026-10-21: T1–T3 implemented (fonts: Playfair Display, Montserrat, Bebas Neue, Dancing Script, Pacifico, Great Vibes, Caveat). Checks: `npm test` 1027 pass, `tsc` clean, eslint clean. `npm run build` and browser check not run.
- 2026-10-21: T4 done — added Cormorant Garamond, Abril Fatface, Oswald, Raleway, Anton, Satisfy, Sacramento, Allura, Kaushan Script, Lobster, Permanent Marker, Shadows Into Light, Amatic SC; picker is now preview + grouped select. `npm run build` passes.
- 2026-10-21: T5 done — picker on the shared Select with search, groups and each option in its own font; native select and `selectClassName` removed.

## Next step
Run T1–T3, then visual check and the user's commit decision.
