import type { Page, Locator } from "@playwright/test";

// ============================================================================
// El `<Select>` de la plataforma (components/ui/Select.tsx) NO es un <select>
// nativo: es un botón `role="combobox"` que abre una lista portada a
// `document.body`. `page.selectOption()` no sirve acá — hay que abrir, (si es
// buscable) escribir en el buscador, y clickear la opción por su texto.
//
// FamilyLinkDialog es la única excepción de este módulo: su selector de
// acudiente SÍ es un `<select>` nativo (ver componente), así que ese no pasa
// por este helper.
// ============================================================================

export interface PickComboOptions {
  /** Placeholder del buscador (prop `searchPlaceholder` del `<Select>`). */
  searchPlaceholder?: string;
  /** Texto a escribir en el buscador; por defecto, el texto de la opción. */
  searchQuery?: string;
  /** Contenedor a partir del cual buscar el combobox (por defecto, `page`). */
  root?: Page | Locator;
}

export async function pickCombo(
  page: Page,
  label: string | RegExp,
  optionText: string | RegExp,
  opts: PickComboOptions = {}
): Promise<void> {
  const root = opts.root ?? page;
  const combo = root.getByRole("combobox", { name: label, exact: typeof label === "string" });
  await combo.click();
  if (opts.searchPlaceholder) {
    const query = opts.searchQuery ?? (typeof optionText === "string" ? optionText : "");
    const search = page.getByRole("combobox", { name: opts.searchPlaceholder });
    await search.fill(query);
  }
  const option = page.getByRole("option", { name: optionText }).first();
  await option.click();
}
