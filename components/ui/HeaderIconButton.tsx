/**
 * Clase común de los botones de solo ícono del header de los shells (A18):
 * 40×40 de área táctil, nombre accesible por `aria-label` (lo pone cada botón)
 * y foco visible con el rol de tinta (`ring-primary-ink`), que en oscuro sí
 * contrasta (7.36:1 sobre #17171c; `ring-primary` daba 2.65:1).
 *
 * Es una CLASE y no un componente porque la usan cosas distintas —un
 * `<button>`, el disparador de la campana, el ThemeToggle— que ya tienen su
 * propio JSX; para un botón nuevo, `IconButton` (Button.tsx) da lo mismo.
 */
export const HEADER_ICON_BUTTON =
  "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink";
