# Revisión UX/UI de Ventex — 2026-10-06

Revisión de solo lectura hecha por 6 agentes en paralelo, cada uno sobre un área del producto. Cerca de 140 hallazgos con archivo:línea, severidad y propuesta. Se verificaron contra el código los más graves (premio `gratis` fijo, `DataTable.tsx:392`, `--primary-dim` claro, WhatsApp de relleno, texto de "Anular compra", falta de `error.tsx`, `tw-animate-css` no instalado).

Las líneas citadas reflejan el código del commit `693e43c`; pueden haberse movido desde entonces.

## Índice

- [Resumen consolidado](#resumen-consolidado)
  - [1. Errores que cuestan plata o confianza](#1-errores-que-cuestan-plata-o-confianza)
  - [2. Problemas transversales](#2-problemas-transversales)
  - [3. Quick wins](#3-quick-wins)
  - [4. Mejoras de mayor impacto](#4-mejoras-de-mayor-impacto)
- [A. Shell y sistema de diseño](#a-shell-y-sistema-de-diseño)
- [B. Primer contacto: landing, auth, onboarding, suscripción](#b-primer-contacto-landing-auth-onboarding-suscripción)
- [C. Punto de venta, ventas y turnos](#c-punto-de-venta-ventas-y-turnos)
- [D. Catálogo, compras, clientes, proveedores, vehículos](#d-catálogo-compras-clientes-proveedores-vehículos)
- [E. Calendario, personal, comisiones, escuela y ajustes](#e-calendario-personal-comisiones-escuela-y-ajustes)
- [F. Home, finanzas, facturación, admin y reseller](#f-home-finanzas-facturación-admin-y-reseller)

---

# Resumen consolidado

## 1. Errores que cuestan plata o confianza

| # | Problema | Dónde | Ref. |
|---|---|---|---|
| 1 | Todo premio de cortes se guarda como "corte gratis": si el premio es "Una cerveza", el POS ofrece descontar el corte completo. | `app/dashboard/settings/promociones/page.tsx:87` | E1 |
| 2 | Una cita marcada "completada" pierde el botón Cobrar: el servicio queda sin venta ni comisión. | `components/appointments/AppointmentModal.tsx:313, 647` | E2 |
| 3 | Comisiones solo mira el mes en curso: el día 1 lo adeudado del mes anterior desaparece de "Por pagar". | `app/dashboard/staff/comisiones/page.tsx:59` | E3 |
| 4 | Los totales del home salen por debajo de lo real a partir de ~1.000 ventas (corte de PostgREST). | `services/finance.service.ts:129` | F1 |
| 5 | "Anular compra" dice que devuelve el stock, pero lo resta. | `app/dashboard/purchases/page.tsx:323` | D6 |
| 6 | La ficha del cliente suma ventas anuladas. | `services/customers.service.ts:71` | D4 |
| 7 | Precios y Mi Plan prometen renovación automática y "Cancela cuando quieras"; el cobro recurrente no existe. | `components/PricingSection.tsx:295`, `app/dashboard/subscription/page.tsx:492` | B4 |
| 8 | El botón "Ayuda" del header abre WhatsApp a un número falso (`573000000000`). | `components/DashboardShell.tsx:173` | A1 |
| 9 | El login borra el correo cuando la contraseña es incorrecta. | `app/(auth)/login/page.tsx:54-109` | B1 |
| 10 | En móvil el reseller solo ve la primera página de clientes. | `app/reseller/clients/page.tsx:251` | F5 |
| 11 | Si el cobro falla en el POS, el error sale arriba del catálogo, tapado en móvil por el carrito. | `stores/pos.store.ts:1109`, `app/dashboard/pos/page.tsx:625` | C3 |
| 12 | El cambio a entregar desaparece al confirmar el cobro. | `CheckoutModal.tsx:416`, `SuccessModal.tsx:62` | C4 |
| 13 | Si falla la subida de foto de un servicio, el botón queda en "Guardando…" para siempre. | `app/dashboard/inventory/product/page.tsx:417` | D2 |

## 2. Problemas transversales

- **Moneda en 3-4 formatos** (`$45,000.00` en-US, `$45000.00`, `$ 45.000`). Un único `formatCOP()` en `lib/` (`es-CO`, sin decimales); `formatMoney` de `config/plans.ts:8` ya es la implementación correcta. (A, C10, D10, E21, F3)
- **Voseo y tuteo mezclados**, a veces en el mismo modal. Mercado colombiano → fijar tuteo y anotarlo en AGENTS.md. (B3, E13, F23)
- **Contraste roto en ambos temas**: hover primario en claro 1.69:1, texto de error 1.56:1, foco en oscuro 2.65:1, botones de peligro en oscuro 2.68:1. (A3-A6, A12, A13)
- **Colores hex fuera de tokens**: `#6063ee`/`#c0c1ff` (paleta vieja, 33 usos), `#10b981` (~51 usos) sin token `--success`. (A11, C23, D23, F20)
- **Sin componentes base compartidos**: ~59 modales a mano sin foco atrapado, interruptores sin `role="switch"`, 4 diálogos de confirmación distintos, sin `Button` con variantes. (A8, A10, D22, D23)
- **Sin `error.tsx` ni `not-found.tsx`**. (A2)
- **`animate-in` no hace nada**: falta `tw-animate-css`. (A19)
- **Datos de México** (`+52`, RFC) en una app para Colombia. (D19)
- **Errores que quedan detrás del modal** en borrados, anulaciones y cobros. (C3, C20, D12)
- **Locales de fecha mezclados** (`es-ES`, `es-CO`, ISO crudo) y cálculo de mes en UTC. (E22, F23, F25)
- **Sin exportar ni importar** CSV/Excel salvo Pedidos. (D-impacto, F11)

## 3. Quick wins

1. `--primary-dim: #5817c8` en `:root`; `text-error-dim` → `text-error`; `text-on-error` en `ConfirmDialog`. (A3, A4, A6)
2. Borrar `components/DataTable.tsx:392` (detalle duplicado en móvil). (A7)
3. Corregir textos de "Anular compra" y de renovación automática. (D6, B4)
4. `sortValue` en la columna "Debe" y excluir anuladas de la ficha del cliente. (D11, D4)
5. POS: Enter con buscador vacío abre el cobro, foco vuelve al buscador, cambio grande en el modal de éxito, `notifyError` si el cobro falla. (C1-C4)
6. `whatsappUrl()` en el botón Ayuda; `"school-agenda": IconCalendar`. (A1, A16)
7. `htmlFor`/`id`, `autoComplete` y `role="alert"` en auth; quitar "Recordarme"; email controlado en el login. (B1, B9, B10, B12, B18)
8. `searchable` en el selector de cliente de la cita y buscador en Clientes. (E7, D3)
9. Sacar `<Pagination>` del bloque de escritorio en reseller. (F5)
10. Renombrar "Marcar todos" / "Asignar automáticamente" / "GMV de inquilinos" / "Gasto promedio". (E5, E17, F16, F21)

## 4. Mejoras de mayor impacto

1. **Sistema de diseño real**: tokens con roles (`--primary-ink`, `--success`/`--on-success`) y primitivas en `components/ui/` (`Modal` sobre `<dialog>`, `Switch`, `Button`, `IconButton`, `PageHeader`). Migrar los hex fijos.
2. **POS sin mouse y apto para tablet**: escanear → Enter → Enter, billetes sugeridos, objetivos táctiles de 44 px, ventas en espera persistidas en IndexedDB, reimpresión de comprobantes, cierre de turno por denominación e imprimible.
3. **Home que responda "¿cómo voy hoy?"**: RPC de agregación, selector de período con comparativa, bloque "Pendientes de hoy", gráfico agrupado legible. Más un módulo de Reportes con exportación.
4. **Onboarding guiado**: checklist de primeros pasos por rubro y hero de landing con los diferenciales reales (agenda, reservas, comisiones, WhatsApp). Registro más corto y coherente.
5. **Agenda y permisos entendibles**: arrastrar citas, horario del negocio en la grilla, vista Día en móvil, "Mis citas" para trabajadores; permisos precargados por cargo y filtrados por tipo de negocio.
6. **Importar/exportar CSV o Excel** de catálogo, clientes, proveedores, ventas y gastos (`exceljs` ya es dependencia).
7. **Admin y reseller como herramientas de seguimiento**: tabla densa ordenable, KPIs que filtran, licencias por vencer y "Por renovar".

---

# A. Shell y sistema de diseño

Contrastes calculados con la fórmula WCAG sobre los tokens de `app/globals.css`.

### Alta

**A1. El botón "Ayuda" del header abre WhatsApp a un número de relleno.** `components/DashboardShell.tsx:173` usa `phone=573000000000`, mientras el botón flotante usa `whatsappUrl()` de `config/contact.ts`.
→ Usar `window.open(whatsappUrl(msg), "_blank")`, o quitar el ícono porque `SupportFab` ya cubre el soporte.

**A2. No hay `error.tsx` ni `not-found.tsx` en ninguna ruta.** Cualquier excepción o URL mal escrita muestra la página por defecto de Next, en inglés, sin tema ni shell.
→ Crear `app/dashboard/error.tsx` (`"use client"`, `reset()`, botón "Reintentar" con el estilo de `CollectionError`), `app/dashboard/not-found.tsx` y `app/not-found.tsx`.

**A3. En tema claro, el hover del botón primario deja texto blanco sobre lavanda (1.69:1).** `globals.css:49` `--primary-dim: #d6bbff`; en oscuro vale `#5817c8`. 112 usos de `hover:bg-primary-dim` con `text-on-primary`/`text-white` (`ConfirmDialog.tsx:32`, `CollectionState.tsx:174`, `DashboardShell.tsx:908`…).
→ `--primary-dim: #5817c8` en `:root`.

**A4. Los mensajes de error no se leen en tema claro (1.56:1).** `--error-dim: #ffb4ab` (`globals.css:52`) se usa como texto en 75 lugares (`CollectionState.tsx:244,250`, `login/page.tsx:57`…).
→ `text-error` (6.46:1 en claro), o `text-on-error-container` sobre `bg-error-container`, o redefinir `--error-dim` en claro a `#93000a`.

**A5. En oscuro, `primary` no sirve como texto ni foco.** `globals.css:83` `--primary: #6d21ef`; el parche de `globals.css:132-133` solo cubre `.text-primary`. Quedan rotos `hover:text-primary`, `group-hover:text-primary` (`ShellUserMenu.tsx:314`), `text-primary/70`, `border-primary` y todos los `ring-primary` (`COLLAPSED_FOCUS_RING` en `DashboardShell.tsx:65-68`, `focus:ring-primary` de inputs). `#6d21ef` sobre `#17171c` = 2.65:1 (< 3:1).
→ Separar roles:
```css
:root{--primary-ink:#6d21ef}
:root[data-theme="dark"],.dark{--primary-ink:#bd91ff}
@theme inline{--color-primary-ink:var(--primary-ink)}
```
y usar `text-primary-ink` / `ring-primary-ink`, borrando el override.

**A6. Botones de peligro en oscuro: blanco sobre `#f97386` (2.68:1).** `components/ui/ConfirmDialog.tsx:33` (`bg-error text-white`) y otros 10 usos.
→ `danger: "bg-error text-on-error hover:bg-error/90"` (`--on-error: #490013` = 6.05:1).

**A7. `DataTable` en móvil muestra siempre el detalle y lo duplica al abrirlo.** `components/DataTable.tsx:392` hace `{renderExpanded?.(row)}` sin condición además del bloque de la línea 381. Afecta `/dashboard/credits`.
→ Borrar la línea 392.

**A8. No existe un Modal compartido.** 59 archivos con `fixed inset-0` propio, solo 10 con `role="dialog"`; ninguno atrapa el foco, no bloquean scroll, varios no cierran con Escape (calculadora `DashboardShell.tsx:864-878`, notificaciones `NotificationsBell.tsx:393-399`).
→ `components/ui/Modal.tsx` sobre `<dialog>` con `showModal()` (foco atrapado, Escape, `inert`, `::backdrop`), con `title`, `onClose`, `size`; migrar al tocar cada modal.

**A9. El menú de usuario no tiene foco visible ni es accesible por teclado.** `components/ShellUserMenu.tsx:307` `focus:outline-none` sin reemplazo, sin Escape, sin `role="menu"`/`menuitem`, el foco no entra. "Ajustes de Perfil" (línea 336) lleva a la configuración del negocio.
→ `focus-visible:ring-2 focus-visible:ring-primary-ink rounded-full`, Escape devolviendo el foco, renombrar a "Configuración".

### Media

**A10. Interruptores inaccesibles y distintos en cada pantalla.** `customers/page.tsx:415-425`, `inventory/product/page.tsx:975`, `staff/page.tsx:830,946`, `settings/page.tsx:212`, `CashDrawerCard.tsx:178`, `SaleConfigModal.tsx:123`. Sin foco, solo 3 con `role="switch"`, sin nombre accesible, varios con `bg-[#6063ee]`.
→ `components/ui/Switch.tsx` con `role="switch" aria-checked aria-labelledby`, `focus-visible:ring-2`, `bg-primary`.

**A11. Conviven dos violetas "primarios".** `#6063ee`/`#4f52d1`/`#c0c1ff` 33 veces (`pos/page.tsx:961,1025`, `PosCatalog.tsx:295`, `SuccessModal.tsx:92`, todo `/admin`); la marca es `#6d21ef`. `bg-[#10b981] text-white` (2.54:1) en `pos/page.tsx:1066` y `deliveries/page.tsx:121`.
→ `bg-primary text-on-primary hover:bg-primary-dim`; token `--success` con `--on-success` oscuro (criterio de `WhatsappFab.tsx:55-58`).

**A12. Bordes invisibles en tema claro.** `border-outline-variant/10` (`DashboardShell.tsx:278,289,397,520`) = 1.03:1; `surface-container-lowest` (#fff) vs `background` (#fafafa) casi igual.
→ Divisores estructurales con `border-outline-variant` (o `/60`); `/10` solo en oscuro.

**A13. Etiquetas pequeñas atenuadas no llegan a AA.** `text-[10px] uppercase text-on-surface-variant/70` = 3.18:1 (`DashboardShell.tsx:399`, `DataTable.tsx:310`, `Pagination.tsx:81`); placeholders `/50` = 2.07:1 (`DashboardShell.tsx:547`). 39 usos de `text-[10px]`, 10 de `text-[9px]`, 118 de `text-[11px]`.
→ Mínimo `text-[11px]` sin opacidad; `placeholder:text-on-surface-variant/80`.

**A14. Tablas no ordenables con teclado ni indican columnas ordenables.** `DataTable.tsx:224-233` `onClick` en `<th>`, sin `aria-sort` ni ícono. Filas con `role="button"` (193, 289) contienen botones.
→ `<button>` dentro del `th` con ↕ y `aria-sort`; botón "Ver" o `<a>` en la celda título.

**A15. "Buscar en Ventex…" no busca.** `DashboardShell.tsx:150-165` redirige por palabra clave; lo demás va a `/dashboard/inventory`. Solo en escritorio.
→ Corto plazo: placeholder "Ir a…" con sugerencias de secciones navegables con flechas. Mediano: paleta ⌘K con clientes y productos.

**A16. Ícono vacío y repetidos en el riel colapsado.** `NAV_ICONS` (`DashboardShell.tsx:106-112`) no tiene `school-agenda`; `pos` y `subscription` usan `IconCreditCard` (83, 104); `customers` y `school-estudiantes` usan `IconUsers`.
→ `"school-agenda": IconCalendar`, otro ícono para `subscription`, ícono genérico de reserva.

**A17. Shell en móvil.** `h-screen` (`DashboardShell.tsx:275`) en iOS Safari; header de 80px (520) y `p-6` en `<main>` (625); Registrar gasto (579), calculadora y búsqueda no existen en móvil.
→ `h-dvh`, header `h-[calc(4rem+env(safe-area-inset-top))] lg:h-20`, main `p-4 sm:p-6 lg:p-10`, acciones rápidas en el cajón.

**A18. Íconos del header de 20px sin foco.** `DashboardShell.tsx:577-614`; campana `p-1` (~28px, `NotificationsBell.tsx:377`).
→ `HEADER_ICON_BTN = "inline-flex h-10 w-10 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ink"`; también `ThemeToggle` con `aria-label`.

**A19. Las animaciones `animate-in` no hacen nada.** 73 archivos usan `animate-in fade-in zoom-in-95 slide-in-from-*`, pero `tw-animate-css` no está instalado.
→ `npm i -D tw-animate-css` + `@import "tw-animate-css";`, o quitar las clases.

**A20. Toasts no siguen el tema.** `app/layout.tsx:113` `<Toaster position="top-right" />` sin `theme`; en móvil tapa el header.
→ `ThemedToaster` con `useTheme()`: `<Toaster theme={theme} position="top-center" richColors closeButton />`.

### Baja

**A21. El tema por defecto ignora el SO y `themeColor` no sigue el tema elegido.** `app/layout.tsx:107` fuerza `'dark'`; `themeColor` (74-77) depende del SO.
→ `matchMedia('(prefers-color-scheme: light)')` sin preferencia guardada; `toggleTheme` actualiza `<meta name="theme-color">`.

**A22. La escala tipográfica no se usa.** `globals.css:191-205` define `text-headline-lg/md`, `text-body-md`, `text-label-md` con cero usos; `<h1>` variados; 571 `rounded-xl`, 122 `rounded-2xl`, 85 `rounded-3xl`. `--font-sans` es la fuente del sistema, aunque CLAUDE.md dice Plus Jakarta.
→ `components/ui/PageHeader.tsx`; regla de radios: controles `rounded-xl`, tarjetas `rounded-2xl`, modales `rounded-3xl`; corregir CLAUDE.md.

**A23. Selector de negocio innecesario con un solo negocio.** `WorkspaceSwitcher.tsx:36-48`, sin cierre por clic afuera ni Escape.
→ Si `available.length <= 1` y sin invitaciones, solo el nombre.

**A24. Un usuario nuevo arranca con el sidebar colapsado.** `lib/sidebar.ts:22`.
→ Sin cookie, `return false` (expandido).

**Bien hecho:** `Select.tsx` (combobox ARIA completo), `SidebarTooltip`, trampa de foco del cajón móvil, `CollectionState`, `loading.tsx`, persistencia del sidebar sin errores de hidratación.

---

# B. Primer contacto: landing, auth, onboarding, suscripción

### Alta

**B1. El login borra el correo con contraseña incorrecta.** `app/(auth)/login/page.tsx:54-109`: inputs no controlados dentro de `<form action={formAction}>`; React 19 resetea el form al terminar la action. Igual el checkbox de términos de `register/page.tsx:470-475`.
→ Email controlado (`useState`) o devolverlo en `LoginState` como `defaultValue`; checkbox controlado.

**B2. Tras registrarse, el usuario cae en un POS vacío sin guía.** `utils/supabase/actions.ts:637` y `components/onboarding/actions.ts:55` redirigen a `/dashboard/pos`; `PosCatalog.tsx:316` solo muestra texto.
→ Checklist "Primeros pasos" por rubro (patrón en `app/dashboard/school/page.tsx:149`); mínimo, CTA a `/dashboard/inventory/product` (o `?type=servicio`).

**B3. Voseo y tuteo mezclados en todo el embudo.** Landing tutea; `register/page.tsx:111-114` vosea; `reset-password/page.tsx:9,69,88` mezcla; `subscription/page.tsx:162,267-272,380-385,491-492`, `PaymentModal`, `BookingWidget` (597-599), `lib/errors.ts`, `onboarding/actions.ts:31` vosean.
→ Fijar tuteo, documentarlo en AGENTS.md y hacer una pasada.

**B4. Se promete renovación automática que no existe.** `PricingSection.tsx:295-297` "Cancela cuando quieras"; `subscription/page.tsx:492` "la renovación automática queda disponible"; `BillingCard` (~420-515) siempre "Desactivado".
→ Copy: "Pago por periodo, sin renovación automática: te avisamos antes del vencimiento"; ocultar `BillingCard`.

### Media

**B5. El registro con Google descarta rubro y módulos.** `register/page.tsx:285`; `GoogleButton.tsx:246` no los transporta; el `OnboardingModal` los pide otra vez.
→ Guardarlos en `sessionStorage`/`next` y precargar el modal, u ofrecer Google en el paso 1.

**B6. Propuesta de valor genérica en el hero.** `app/page.tsx:326-349`.
→ Titular concreto ("Cobra, agenda y controla tu inventario en un solo lugar: para barberías, tiendas y academias") y sección del sitio de reservas (usar `public/site-templates/*-hero.svg`).

**B7. Verticales: falta un rubro abierto y se destacan dos cerrados.** `app/page.tsx:172-210, 420-472`: no hay tarjeta de `escuela`; Lavaautos y Servicios ocupan media grilla con "Próximamente".
→ Agregar Académico, ordenar registrables primero, compactar "Próximamente".

**B8. Registro de cuatro pasos.** Rubro → módulos → 7 campos → confirmar correo y volver a entrar.
→ Mover teléfono y nombre al onboarding, quitar "Confirmar contraseña", módulos con valores por defecto.

**B9. Labels sin `htmlFor`/`id`.** `login/page.tsx:63,91`; `register/page.tsx:303,324,345,364,385,440`; `reset-password/page.tsx:99`; `update-password/page.tsx:184`.
→ Patrón de `OnboardingModal.tsx:168-176`.

**B10. Faltan `autoComplete`.** `register`: `organization`, `name`, `tel`, `email`; `update-password/page.tsx:188` `new-password`; `reset-password/page.tsx:103` `email`.

**B11. La invitación de trabajador usa el copy de "restablecer contraseña".** `update-password/page.tsx:150-173, 237`; además hace `signOut`.
→ Copy "Crea tu contraseña para entrar a {negocio}" y redirigir a `/dashboard` sin cerrar sesión.

**B12. "Recordarme en este dispositivo" no hace nada.** `login/page.tsx:156-180`.
→ Quitarlo.

**B13. "Revisa tu correo" no permite reenviar ni corregir.** `register/page.tsx:71-101`; ícono de pulso (`:76`).
→ "Reenviar correo" (`supabase.auth.resend({type:'signup'})`) con cooldown, "¿Escribiste mal tu correo? Volver", ícono de sobre.

**B14. Pagar como invitado es el CTA principal de los planes pagos.** `PricingSection.tsx:321-331`; si se registra con otro correo, el pago no se reclama.
→ "Empezar con {plan}" → `/register?plan=oro` y cobrar después; invitado como opción secundaria.

**B15. "Ventas al mes: $X" no se entiende.** `PricingSection.tsx:305`, `PlanCard` de subscription.
→ "Hasta $X en ventas por mes" con tooltip; listar diferenciales (citas, reservas, comisiones).

**B16. `PaymentModal` no es un diálogo accesible y se cierra en pleno redirect.** `PaymentModal.tsx:216-224`; `:234` "1 meses".
→ `role="dialog"`, `aria-modal`, Escape/foco; bloquear cierre por fondo en `redirecting`/`waiting`; pluralizar.

### Baja

**B17.** Enlace "Ayuda" muerto en `register/page.tsx:201` (`href="#"`) → `whatsappUrl` o quitar.
**B18.** Falta `role="alert"` en `login:56`, `register:296`, `reset:93`, `update:178`, `OnboardingModal:101`, `subscription:118`; botones de mostrar contraseña sin `aria-label` (`login:121`, `register:404`, `update:207`).
**B19.** El botón "Finalizar Registro" se deshabilita sin explicación (`register/page.tsx:494`) → "Mínimo 6 caracteres" bajo el campo.
**B20.** Rubros sin descripción y con nombres distintos entre pantallas (`config/business.ts:150-156`, `register/page.tsx:161-180`) → descripción, nombres unificados, `aria-pressed`.
**B21.** Placeholder "Mi Tienda" fijo (`register/page.tsx:310`) → reusar el de `OnboardingModal.tsx:178`.
**B22.** Error crudo de Postgres en `components/onboarding/actions.ts:52` → `toMessage()`.
**B23.** `LicenseBlocked.tsx:4-17, 47-54` no ofrece contacto → botón de WhatsApp con el nombre del negocio.
**B24.** `app/[slug]/BookingWidget.tsx:541-566`: placeholder como label y celular sin `type="tel"` ni validación → labels visibles y validación de 10 dígitos.
**B25.** `update-password/page.tsx:145` `emerald-*` y `subscription/page.tsx` `#10b981`/`amber-*` hardcodeados.

---

# C. Punto de venta, ventas y turnos

### Alta

**C1. No se puede cobrar solo con teclado.** `app/dashboard/pos/page.tsx:320-328` ignora atajos con foco en INPUT; el Enter del buscador solo resuelve códigos (`PosCatalog.tsx:174-183`).
→ Enter con buscador vacío y carrito con ítems abre el cobro. Atajos visibles: F2 buscar, F4 cliente, F8 descuento, F12 cobrar.

**C2. El foco no vuelve al buscador y se pierden lecturas del escáner.** Foco solo al montar (`PosCatalog.tsx:125`). Con foco en una tarjeta, el Enter del escáner agrega el producto de nuevo y abre el cobro (`page.tsx:344-356` no excluye BUTTON).
→ Devolver el foco a `searchRef` tras `addToCart`, al cerrar modales y SuccessModal; excluir `BUTTON` del atajo global.

**C3. El error de cobro aparece en el lugar equivocado.** `stores/pos.store.ts:1109` (y 930, 948, 1046, 1103) solo `set({ error })`; `page.tsx:625` no maneja `"failed"`; el modal se cerró antes (`page.tsx:1245-1247`); el error sale en `PosCatalog.tsx:305-309`, tapado en móvil.
→ `notifyError` en `"failed"` y banner junto a Vender; o mantener abierto el CheckoutModal con spinner y mostrar el error adentro.

**C4. El cambio desaparece.** Solo en `CheckoutModal.tsx:416-437`; `SuccessModal.tsx:62-69` no muestra total, recibido ni cambio y se autocierra a los 5 s (`page.tsx:280-283`).
→ Pasar `tendered` y `change`; "Entregar cambio: $X" grande; sin autocierre si hay cambio.

**C5. "Limpiar venta" borra todo sin confirmar.** `PosCartPanel.tsx:722-738` junto a Vender; `clearCart()` (`pos.store.ts:911`) resetea cliente, pagos y domicilio.
→ Toast "Venta vaciada · Deshacer" de 5 s con snapshot; alejarlo de Vender.

**C6. Controles de línea inservibles en táctil.** −/+ de 20×20 (`PosCartPanel.tsx:437-466`); quitar línea `opacity-0 group-hover:opacity-100` de 16px (541-547); nombres a 12px, descuentos a 9px.
→ 40-44px, papelera siempre visible o swipe, líneas a 14px.

**C7. No se puede reimprimir.** El ícono de impresora de `RecentSalesModal.tsx` es un Link; el detalle de `sales/page.tsx:548-714` no imprime; "Imprimir" del header (`PosCartPanel.tsx:233`) imprime la venta anterior.
→ "Reimprimir" desde la venta guardada; renombrar o quitar el del header.

### Media

**C8.** Efectivo exige escribir el monto aunque sea exacto (`CheckoutModal.tsx:130-133`) → vacío + Enter = exacto.
**C9.** Billetes rápidos fijos que suman sin avisar (`CheckoutModal.tsx:12, 150-151`) → sugerir según el total y etiquetar "+$2.000".
**C10.** Moneda `en-US` con decimales en `CheckoutModal.tsx:9-10`, `PosCartPanel.tsx:22-23`, `PosCatalog.tsx:22-23`, `PosReceipt.tsx:54`, `CloseShiftModal.tsx:9-10`, `sales/page.tsx:24-25`; `es-CO` en `DiscountModal` y `RecentSalesModal`; botón flotante móvil (`page.tsx:949`) con decimales → `formatCOP()`.
**C11.** El total no es lo más visible (`PosCartPanel.tsx:683-686` `text-lg`, `CheckoutModal.tsx:186`) → 32-40px fijo sobre Vender con número de ítems.
**C12.** Descuentos sin origen (`PosCartPanel.tsx:677-682`, `PosReceipt.tsx:212-216`, `sales/page.tsx:630-635`) → desglose Ofertas / Manual / Premio / Puntos; nombre de la oferta en el recibo.
**C13.** Recibo incompleto: se arma antes de la venta (`page.tsx:599-620`); sin N.º de venta, cajero, recibido/cambio, medios del split, puntos; total por ítem sin descuento (`page.tsx:607`) → poblarlo tras `sold` con `sale_number`.
**C14.** Errores tras registrar la venta mal reportados (`pos.store.ts:996-1031`): si falla `fetchCatalog` se muestra "cobrada sin conexión"; si falla `createDelivery` queda `failed` con la venta hecha; los `await` de `redeemPromo`/`fetchCustomerPromoTarget` (`page.tsx:691-788`) atrasan el éxito → devolver `sold` al responder `createSale` y refrescar en segundo plano.
**C15.** Sin indicador offline mientras se vende (`OfflineQueueBadge.tsx:24`) → chip "Sin conexión: las ventas se guardan en este equipo" con `useOnlineStatus()`.
**C16.** Ventas aparcadas solo en memoria y sin total (`pos.store.ts` sin `persist`, `PosTabsBar.tsx:72-88`) → IndexedDB y "3 · $45.000".
**C17.** Cualquiera da 100 % de descuento (`components/DiscountModal.tsx:17-52`), solo porcentaje, sin motivo; ícono sin etiqueta (`PosCartPanel.tsx:227`) → permiso `pos_discount` con tope, motivo guardado, monto en pesos, descuento por línea.
**C18.** Búsqueda sin elegir con teclado (`PosCatalog.tsx:180`) → Enter con un único resultado lo agrega y limpia; ↑/↓.
**C19.** Tablet mal aprovechada: grilla desde 1024px (`PosCatalog.tsx:321, 408`), una columna entre 1024-1079 (54-57), categorías de 32px → breakpoint tablet, carrito de 360px o colapsable, 3 columnas, categorías ≥40px.
**C20.** Anulación (`sales/page.tsx:653-708`): sin motivo, sin aviso sobre efectivo/puntos/premio, error detrás del modal (`stores/sales.store.ts:151-163`), sin toast, modal sin `max-h` ni scroll (550), sin Esc → motivo obligatorio, "Devolver $X en efectivo", toast, `max-h-[90vh] overflow-y-auto`.
**C21.** Cierre de turno (`CloseShiftModal.tsx:341-358`) pide un solo número; sin imprimir (141-191); `METHOD_LABEL` (12-16) sin `credito` → contador por denominación COP, "Imprimir cierre" 80mm, "Crédito / Fiado".

### Baja

**C22.** `sales/page.tsx:36-40, 62-67` sin `credito`; en `RecentSalesModal` una anulada sale como "Pendiente".
**C23.** "SKU: null" (`PosCatalog.tsx:458`); hora de apertura del turno solo en `title` (214-221); hex sueltos (`page.tsx:961, 1035`; `PosCatalog.tsx:295`).
**C24.** Un toast por cada lectura del escáner (`page.tsx:417`) y toast + modal al vender (658-662) → resaltar la línea y beep; quitar el toast de éxito.

---

# D. Catálogo, compras, clientes, proveedores, vehículos

### Alta

**D1. Archivados se ven como activos e inflan KPIs.** `inventory/page.tsx:117, 541-613, 640-658`; `inventory.service.ts:387-396`; `services.service.ts:76`; KPIs en 280 y 310.
→ Filtro Estado (Activos por defecto), chip "Archivado", excluir de KPIs.

**D2. Fallo al subir foto de servicio deja "Guardando…" para siempre.** `inventory/product/page.tsx:417-419`.
→ try/catch, error junto a la foto, `setSaving(false)`.

**D3. Clientes sin buscador.** `customers/page.tsx:316-322`.
→ Buscador (nombre, teléfono, documento, email) y filtro "Con deuda"; idealmente prop `searchable` en `DataTable`.

**D4. Ficha del cliente suma anuladas.** `customers.service.ts:71-77`, `customers/page.tsx:174-175`.
→ Traer `status`, excluir de totales, mostrarlas tachadas con chip "Anulada".

**D5. Formulario de compra deshabilita "Guardar" sin explicar y descarta líneas.** `PurchaseForm.tsx:314-321, 935-940`.
→ Botón habilitado, errores por campo y por línea, foco en el primero.

**D6. "Anular compra" dice lo contrario.** `purchases/page.tsx:200` (title) y `:320-323` (diálogo); `cancel_purchase_invoice` resta stock.
→ "Se descontarán del inventario las unidades que entraron con esta compra", idealmente con lista.

### Media

**D7.** `inventory/movements/page.tsx` inaccesible desde la UI → botón "Movimientos" y "Ver movimientos" por producto (`?product_id=`).
**D8.** Catálogo sin orden y pierde búsqueda/página al volver (`lib/catalog.ts:87`, `inventory/page.tsx:107-152`, `product/page.tsx:438, 485`) → estado en query string y `backTo` que la preserve.
**D9.** Archivar incompleto: sin acción en móvil, "Activar" sin feedback, confirmación sin loading ni errores (`inventory/page.tsx:470-501, 644-645, 713-717`) → archivar en el formulario, loading, toast con Deshacer.
**D10.** Montos en 4 formatos (`inventory/page.tsx:442,600`; `purchases/page.tsx:18`; `customers/page.tsx:33`; `pedidos/SavedOrders.tsx:29`) → `formatMoney` único.
**D11.** Orden por "Debe" textual (`customers/page.tsx:209-219`) → `sortValue: (c) => c.credit_balance`.
**D12.** Error de borrado detrás del modal en Clientes (`customers/page.tsx:163-166, 453-486`); en Proveedores el modal se cierra siempre → error dentro del diálogo y "Archivar" como alternativa.
**D13.** Borrar proveedor no avisa el impacto (`ON DELETE SET NULL`) → conteos como en `categories/page.tsx:431`.
**D14.** "Última compra" reemplaza líneas sin preguntar y `catch {}` vacío (`PurchaseForm.tsx:286-311`) → "¿Reemplazar o agregar?" y error visible.
**D15.** Compras sin orden, filtros ni vencimiento resaltado (`purchases/page.tsx:80-140`) → Pendientes/Vencidas/Pagadas, total "Por pagar", vencidas en rojo.
**D16.** "Completar" pedido confundible con "Recibir", sin confirmación; cancelar tampoco confirma (`pedidos/SavedOrders.tsx:190-219, 359`) → "Recibir" primario, "Completar" secundario con confirmación.
**D17.** Vehículos sin búsqueda por placa; selector de dueño sin búsqueda ni "nuevo" (`vehicles/page.tsx:118-143, 207-215`).
**D18.** Formularios largos sin protección de cambios; "Guardar" al fondo en móvil; comisión >100 % aceptada por `noValidate` (`product/page.tsx:1024-1033, 1058-1084`; `PurchaseForm.tsx:925-941`) → confirmar al salir, barra fija, validación inline.
**D19.** Placeholders de México (`+52`, RFC) y `credit_limit` no editable (`customers/page.tsx:20,372`; `distributors/page.tsx:23,195,208`; `pedidos/PedidosClient.tsx:672`) → `+57 300 123 4567`, NIT/CC, "Cupo de crédito", validar teléfono para WhatsApp.

### Baja

**D20.** Nombres forzados a MAYÚSCULAS (`product/page.tsx:422,444,638`) → respetar lo escrito.
**D21.** Categoría no se puede quitar (`product/page.tsx:663`, opción `disabled`) → "Sin categoría".
**D22.** Switches sin `role="switch"` (`product/page.tsx:972, 993`; `customers/page.tsx:416`), botones de ícono solo con `title` (`customers/page.tsx:242-286`, `product/page.tsx:701`), labels sin `htmlFor` → `<Switch>` compartido y `aria-label`.
**D23.** `bg-[#6063ee] hover:bg-[#c0c1ff]` (`customers/page.tsx:301`, `vehicles/page.tsx:104`) y 4 confirmaciones a mano pese a `components/ui/ConfirmDialog` → `Button` con variantes y `ConfirmDialog`.

### Mayor impacto del área
1. Importación masiva CSV/Excel (plantilla → vista previa con errores → confirmar) de catálogo, clientes y proveedores, más exportación.
2. Un solo patrón de lista (`DataTable` con búsqueda, orden por valor y filtros en URL) en Catálogo, Clientes, Proveedores, Compras y Vehículos.
3. Borrado consistente con conteo de impacto, error en el diálogo, "Archivar" y toast con Deshacer; escaneo de código de barras en líneas de compra.

---

# E. Calendario, personal, comisiones, escuela y ajustes

### Alta

**E1. Todo premio de cortes se guarda como `gratis`.** `settings/promociones/page.tsx:87` (`const rewardKind = "gratis"`). AGENTS.md dice que el default debe ser `texto`.
→ Selector "¿Cómo se entrega el premio?": Solo aviso (texto, por defecto) / Servicio gratis / % / Monto, pidiendo valor cuando aplique.

**E2. "Marcar completada" quita el botón Cobrar.** `AppointmentModal.tsx:647-650, 313-318` (`canCharge` exige `liveStatus !== "completed"`).
→ Ocultar esa acción si hay servicio y no hay venta, o confirmar "¿Completar sin cobrar?", y mantener "Cobrar" mientras `sale_id` sea nulo.

**E3. Comisiones solo del mes en curso.** `staff/comisiones/page.tsx:59-60, 114-115, 138`; `services/staff.service.ts:236`.
→ "Por pagar" con todo lo pendiente acumulado; chips de período como `staff/servicios/page.tsx:80-91`.

**E4. Un trabajador invitado nace sin permisos.** `GrantAccessModal.tsx:39`.
→ Plantillas por cargo (Barbero: POS, Calendario, Clientes; Cajero: POS, Ventas) y aviso si no hay ninguno.

**E5. Dos "Administrador" distintos.** `PermissionToggles.tsx:72-78` (rol) vs `PermissionsPanel.tsx:59-75` y `GrantAccessModal.tsx:135-152` (atajo).
→ Atajo "Marcar todos / Desmarcar todos".

**E6. Permisos poco claros.** `PermissionToggles.tsx:33` muestra todos; un salón ve Vehículos, Académico, Facturación; "Servicios", "Catálogo" e "Inventario" se pisan; solo 4 de 15 con ayuda (`config/business.ts:51-67, 99-104`).
→ Filtrar con `visibleNavItems`, ayuda por permiso, resumen "Ve: POS · Calendario · Clientes" en la tarjeta.

**E7. Cliente en la cita: `<select>` sin buscador ni alta.** `AppointmentModal.tsx:454-471`.
→ `searchable` (como `OffersManager.tsx:397`) y "+ Nuevo cliente".

**E8. En móvil el calendario abre en semana (792px).** `calendar/page.tsx:147`; `TimeGrid.tsx:69`.
→ Día o 3 días por defecto en pantallas angostas, swipe entre días.

**E9. Mover una cita lleva muchos pasos.** `TimeGrid.tsx:121-141`; `DateTimeField.tsx:131, 184, 218`.
→ Arrastrar y estirar con `conflictsFor`; mínimo "Mover a…".

**E10. Dos formas de guardar en Ajustes Generales.** `settings/page.tsx:337-352` vs `550-560`; feedback en hex y en toast; se pierden cambios al salir.
→ Barra fija "Tienes cambios sin guardar · Descartar / Guardar", confirmación al salir, etiqueta "Se guarda al instante" donde aplique.

**E11. Promociones mezcla inmediato y diferido.** `promociones/page.tsx:150, 313, 371-378` vs `381-390`; "Recalcular" con config vieja deja contadores mal; eliminar hito sin confirmación.
→ Deshabilitar "Recalcular" con cambios sin guardar, confirmar recalcular y eliminar, atenuar secciones si el contador está apagado.

**E12. Cambiar tipo de negocio sin confirmación.** `settings/page.tsx:97-100, 115-128`.
→ Diálogo con secciones que aparecen y desaparecen.

### Media

**E13.** Voseo/tuteo (`AppointmentModal.tsx:259` vs `268`; `promociones/page.tsx:210`; `comisiones/page.tsx:130`; `OffersManager.tsx:131`).
**E14.** "Cortes" en lavaautos/escuela/servicios (`promociones/page.tsx:182, 208, 328, 366`) → sustantivo por rubro desde `config/business.ts`.
**E15.** `settings/business/page.tsx`: Sector, Precisión y Separador decimal sin uso (280-310); "Cancelar" sin `onClick` (322); pie con `lg:left-64` vs sidebar `w-60`/`w-20` (317); "basica" (270).
**E16.** Modal de cita se cierra perdiendo cambios (`AppointmentModal.tsx:394-399, 428`); lo mismo en `GrantAccessModal.tsx:84`, `PermissionsPanel.tsx:43` → "¿Descartar los cambios?".
**E17.** "Sin asignar" asigna automáticamente (`AppointmentModal.tsx:518` vs `252, 266`) → "Asignar automáticamente (quien esté libre)".
**E18.** Grilla fija 7-21 h y horarios 06:00-22:00 cada 30 min (`TimeGrid.tsx:45-48`, `lib/calendar-layout.ts:77`, `DateTimeField.tsx:31`); horarios de reserva en "Página web" (`calendar/page.tsx:305`) → usar el horario del negocio, sombrear cerrado, "Otra hora…" cada 15 min.
**E19.** Trabajador ve a todo el equipo al abrir (`calendar/page.tsx:153`) → "Mis citas" por defecto.
**E20.** Tarjetas de Personal sobrecargadas (`staff/page.tsx:360, 383-386, 526-605, 827`) → foto, nombre, por pagar y acceso; acciones en menú "⋯"; tarjeta como `<button>`.
**E21.** Moneda `en-US` (`staff/page.tsx:46-47`, `comisiones/page.tsx:13-14`) vs `es-CO` (`AppointmentModal.tsx:92`, `staff/servicios/page.tsx:13`).
**E22.** Ofertas y puntos sin ayuda: "Editar" fuera de vista en móvil (`OffersManager.tsx:262`), fechas ISO (`:247`, `450-468`), sin cálculo de retorno en `LoyaltyManager.tsx:113-165` → scroll/foco al formulario, "1 oct → 31 oct", "El cliente recupera X %…".

### Baja

**E23.** `components/school/PlanForm.tsx:219` "Precio" vs `:195` → "Precio del plan completo (N clases)".
**E24.** `calendar/page.tsx:424, 521` estado vacío + grilla; `:410` rango de semana con un solo mes; `:467-471` tocar un día en Mes abre "Nueva cita" en vez de la vista Día.
**E25.** `app/dashboard/promociones/page.tsx:195` dice "Configuración" en lugar de "Ajustes".

---

# F. Home, finanzas, facturación, admin y reseller

**Diagnóstico:** el home responde "¿cómo le fue al negocio desde que existe?", no "¿cómo va hoy?", y casi no dice qué hacer (solo stock bajo). "Finanzas" es solo Gastos: no hay estado de resultados, reportes ni exportación.

### Alta

**F1. Totales del home cortados a ~1.000 filas.** `services/finance.service.ts:129-151`: `fetchOverview` trae todas las filas sin `range()`; los meses viejos se vacían.
→ RPC de agregación en SQL con `get_effective_user_id()`.

**F2. KPIs sin período y con horizontes mezclados.** `DashboardHome.tsx:183-218`; "Gastos totales" (histórico) no coincide con Gastos ("Este mes", `stores/expenses.store.ts:32`).
→ Selector de período (reusar `SALES_PERIODS`, "Este mes" por defecto) con comparativa.

**F3. Moneda en inglés e inconsistente.** `DashboardHome.tsx:15-16`, `ExpensesByCategory.tsx:5-6`, `sales/page.tsx:24-25`, `billing/page.tsx:21-22`, ~40 usos de `"en-US"`.
→ `formatCOP()` en `lib/` (mover `formatMoney` de `config/plans.ts:8`).

**F4. Gráfico "Ingresos vs Gastos" engañoso.** `DashboardHome.tsx:229-252`: barras apiladas en `flex-col` al 100 % cada una, sin eje ni valores, detalle solo en `title`, piso de 1 %.
→ Barras agrupadas (o neto como línea), monto visible, detalle al tocar.

**F5. Reseller en móvil sin paginación.** `app/reseller/clients/page.tsx:94` vs `:163` y `:251`.
→ Sacar `<Pagination>` fuera de ambos contenedores.

**F6. El home no dice qué hacer hoy.** `DashboardHome.tsx:335-365`.
→ "Pendientes de hoy": citas, fiados, facturas vencidas, comisiones sin liquidar, turno abierto, licencia por vencer; filtrado por `config/business.ts`.

### Media

**F7.** "Beneficio neto" suma compras de mercadería sin costo de lo vendido (`DashboardHome.tsx:211-217`, `finance.service.ts:172-174`) → "Flujo de caja" o margen real con costo congelado.
**F8.** "Ventas hoy" muestra cantidad como valor principal (`DashboardHome.tsx:184-191`) → monto principal; "7 ventas · ticket promedio $X".
**F9.** Stock bajo en negocios sin inventario (`DashboardHome.tsx:117, 336`) → condicionar al módulo `inventory`.
**F10.** No hay estado de resultados (`config/business.ts:583`) → pantalla "Reportes" con período, tabla mensual, medio de pago y exportación.
**F11.** Sin exportación en ventas, gastos y facturación → "Exportar CSV" respetando filtros.
**F12.** Facturación sin filtros, búsqueda, KPIs ni columna de vencimiento (`billing/page.tsx:50-94, 258-272`) → reusar `ExpiryCell` (`app/admin/companies/page.tsx:77`), chips, resumen de cartera.
**F13.** Estado de factura con un clic sin confirmar; cotización "Pagada" cuenta como ingreso (`billing/page.tsx:540-553`) → confirmar "Cancelada"; "Convertir en factura".
**F14.** "Gastos por categoría" implementado dos veces (`expenses/page.tsx:281` vs `components/ExpensesByCategory.tsx:65`) → usar el componente en ambos.
**F15.** `ExpensesByCategory` se rompe en móvil (`:68`, `:86-90`) → nombre y monto en una fila, barra debajo.
**F16.** Admin muestra GMV de inquilinos como "Ventas" (`app/admin/page.tsx:41-42`) → "GMV de inquilinos" + cobrado este mes, licencias por vencer en 7 días, altas 30 días (ya calculados en `companies/page.tsx:160-176`).
**F17.** Empresas (admin) no escala (`app/admin/companies/page.tsx:234-246`) → tabla densa ordenable, KPIs como filtros, `Pagination`.

### Baja

**F18.** Distribución por plan deja a Diamante solo (`app/admin/page.tsx:52`) → `sm:grid-cols-2 lg:grid-cols-4`.
**F19.** Reseller sin "Por vencer" (`app/reseller/page.tsx:49-61`; `clients/page.tsx:137-147, 226-235`) → `ExpiryCell` y lista "Por renovar".
**F20.** Hex fijos (`billing/page.tsx:249`; `reseller/clients/page.tsx:84,153,417,550,623`; `#10b981` ~51 usos) → `bg-primary`/`hover:bg-primary-dim`, token `--success`.
**F21.** "Ticket promedio" en Gastos (`expenses/page.tsx:261, 354`) y todos los íconos rojos → "Gasto promedio", íconos neutros.
**F22.** Gastos sin rango personalizado ni `MoneyInput` (`expenses/page.tsx:14, 346`; `billing/page.tsx:383-447`) → `custom` y `components/ui/MoneyInput.tsx`.
**F23.** `es-ES` en `sales/page.tsx:28`, `billing/page.tsx:25`, `finance.service.ts:96`; "Controlá" en `expenses/page.tsx:259` → `es-CO` vía `lib/date.ts` y tuteo.
**F24.** Acciones rápidas que solo navegan (`config/business.ts:412-423`) → deep-link `?new=1`; íconos del set y un acento único en lugar de emojis y 9 colores.
**F25.** Mes del gráfico en UTC (`finance.service.ts:103, 179`) → `toISODate(new Date(s.created_at)).slice(0,7)`.
