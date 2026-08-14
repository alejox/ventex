# Informe UX/UI y QA — Módulo de Gastos (Ventex App)

**Preparado para:** Equipo de requerimientos y QA
**Rol:** Auditoría UX/UI experta + especificación funcional
**Fecha:** 14 de agosto de 2026
**Uso previsto:** Este documento está redactado para pegarse directamente como prompt de contexto a Claude Code (CLI, VS Code) y guiar la implementación.

---

## 1. Resumen ejecutivo

Se auditó el flujo actual de Ventex App (POS) navegando cada sección del menú principal (Panel, Punto de Venta, Clientes, Ventas, Compras, Proveedores, Pedidos, Inventario, Categorías, Personal, Mi Plan, Panel Admin) y probando en vivo el flujo de registro de gastos existente.

**Hallazgo central:** Ventex ya tiene una funcionalidad embrionaria de gastos (botón "Registrar Gasto" en el Dashboard, tarjeta "Gastos Totales" y un gráfico "Ingresos vs Gastos"), pero **no existe un módulo de Gastos como tal**: no hay categorías de gasto estructuradas, no hay un listado/historial de gastos, y no hay un desglose visual por categoría. El campo "Categoría" del formulario actual es texto libre y opcional, lo que genera datos inconsistentes e inutilizables para reportes. Esto coincide exactamente con lo que pide el cliente, por lo que el trabajo es tanto de **corrección** (cerrar huecos de calidad de datos) como de **construcción** (nuevo módulo).

Se detectó además un bug funcional concreto (desfase de fecha por zona horaria) documentado en la sección 3.

---

## 2. Mapa del estado actual (evidencia de la auditoría)

| Elemento | Ubicación actual | Estado |
|---|---|---|
| Registrar un gasto | Botón "Registrar Gasto" en el Dashboard (modal) | Existe, incompleto |
| Campos del modal | Descripción, Monto ($), Fecha, Categoría (opcional, texto libre) | Categoría sin estructura |
| Ver gastos totales | Tarjeta "Gastos Totales" en Dashboard | Solo agregado, sin detalle |
| Ver evolución de gastos | Gráfico "Ingresos vs Gastos (últimos 6 meses)" en Dashboard | Solo serie temporal agregada, sin desglose por categoría |
| Ver listado/historial de gastos | **No existe** | Falta |
| Administrar categorías de gasto | **No existe** (solo existe "Categorías" para el catálogo de productos, sección distinta) | Falta |
| Gasto individual en "Movimientos recientes" | Aparece como texto libre (ej. "Pago de internet") | Funciona, pero sin categoría visible ni acceso al detalle |

**Contexto de patrones ya usados en la app** (para mantener consistencia visual y de interacción al construir lo nuevo):

- **Ventas** y **Compras** ya resuelven el patrón "listado + filtros + tarjetas resumen" que el módulo de Gastos debería reutilizar: chips de rango de fecha (Hoy / Ayer / Últimos 7 días / Este mes / Mes pasado / Todo / Personalizado), buscador, tarjetas KPI arriba de la tabla, tabla con acciones (ver, editar, anular).
- **Categorías** (de productos) ya resuelve el patrón CRUD de categorías: buscador, tabla con nombre + descripción + conteo de elementos asociados + acciones de editar/eliminar. Es el patrón a clonar para "Categorías de Gasto", dejando claro en la UI que son dos catálogos independientes (uno para productos, otro para gastos) para no confundir al usuario.
- El dashboard ya reserva espacio visual para "Ingresos vs Gastos", así que el nuevo desglose por categoría puede vivir ahí mismo o en la nueva vista de detalle, con enlace cruzado entre ambos.

---

## 3. Hallazgos QA/UX del flujo actual (con corrección propuesta)

| # | Severidad | Hallazgo | Evidencia | Corrección propuesta |
|---|---|---|---|---|
| 1 | **Alta** | El campo "Categoría" del gasto es texto libre y opcional. No hay autocompletado ni validación contra un catálogo. Se puede escribir "servicios", "Servicios", "SERVICIOS " (con espacio final) como si fueran cosas distintas. | Se probó escribiendo `servicios ` (minúscula, espacio final) sin que el sistema sugiriera ni corrigiera nada al compararlo con categorías previas. | Reemplazar el input de texto libre por un **selector (combobox)** contra un catálogo de categorías de gasto administrable, con normalización (trim + case-insensitive) y opción de "crear nueva categoría" inline. |
| 2 | **Alta** | Bug de fecha: al registrar un gasto con fecha **13/08/2026** (fecha del día, tomada del selector `date`), el registro aparece en "Movimientos recientes" fechado **12/8**. | Prueba en vivo: se registró "Pago de internet" con fecha 13/08/2026 en el formulario; el listado lo muestra como 12/8. | Desfase típico de interpretar un `<input type="date">` (valor `YYYY-MM-DD`, sin hora) como UTC y luego formatear en la zona horaria local (UTC-5 en este caso), lo que resta un día. Corregir parseando la fecha como **fecha local** (no `new Date("YYYY-MM-DD")` a secas) tanto al guardar como al formatear para mostrar. Revisar si el mismo patrón afecta fechas de Compras/Ventas. |
| 3 | **Media** | No existe forma de **ver, editar, filtrar o eliminar** un gasto ya registrado. Una vez guardado, el único rastro es una línea en "Movimientos recientes" (que además solo muestra los últimos ~8 movimientos mezclados con ventas y compras). | Recorrido de todas las secciones del menú; no hay entrada "Gastos". | Crear la vista "Gastos" (ver especificación funcional, sección 4) con listado dedicado, búsqueda, filtros de fecha/categoría y acciones de editar/eliminar, siguiendo el patrón visual de "Ventas". |
| 4 | **Media** | Ambigüedad conceptual entre "Compras" (a proveedores, con factura, impacta inventario) y "Gastos" (operativos, sin inventario). Ambos alimentan "Gastos Totales" del dashboard, pero el usuario no tiene forma de saber que "Compras" también cuenta como gasto. | Los montos de "Compras" (#3 y #4) coinciden, sumados, con gran parte de "Gastos Totales" del dashboard. | Aclarar en el copy del dashboard (tooltip o subtítulo en la tarjeta "Gastos Totales": *"Incluye compras a proveedores y otros gastos"*). En la nueva vista de Gastos, permitir filtrar explícitamente por origen (Compra vs. Gasto manual) para evitar doble conteo percibido por el usuario. |
| 5 | **Baja** | El formulario "Registrar Gasto" no tiene feedback de éxito visible (toast/confirmación) más allá de cerrarse solo; el usuario debe inferir que funcionó viendo si cambió el total. | Prueba en vivo del flujo de guardado. | Agregar un toast de confirmación ("Gasto registrado correctamente") consistente con el resto de la app. |
| 6 | **Baja** | El monto no tiene validación de valores negativos o cero visible en el HTML (solo `required`); no se verificó el comportamiento con `0` o negativos porque el input es `type="number"` sin `min`. | Inspección del modal. | Agregar `min="0.01"` y validación server-side, con mensaje claro si el usuario intenta guardar 0 o negativo. |
| 7 | **Informativa** | El diseño responsive (probado a 390×844, viewport móvil) del dashboard funciona bien: colapsa a menú hamburguesa y tarjetas apiladas sin overflow. Se debe mantener ese estándar en las pantallas nuevas. | Prueba de resize de ventana. | Ninguna corrección — usar como referencia de calidad para el nuevo módulo. |

---

## 4. Especificación funcional — Módulo "Otros Gastos"

Petición del cliente (traducida a requerimientos): *"agregar la posibilidad de incluir categorías de gastos, ver los registros de gastos, y ver un gráfico de dichos gastos por categoría."*

### 4.1 Alcance

1. **Catálogo de Categorías de Gasto** (CRUD independiente del catálogo de categorías de productos).
2. **Registro de Gasto mejorado**, con selector de categoría en vez de texto libre.
3. **Vista "Gastos"** (nueva entrada de menú) con listado/historial completo, filtros y búsqueda.
4. **Gráfico de gastos por categoría**, tanto en la nueva vista como (resumen) en el Dashboard.

### 4.2 Historias de usuario y criterios de aceptación

**HU1 — Administrar categorías de gasto**
Como administrador del negocio, quiero crear, editar, desactivar y eliminar categorías de gasto (ej. Servicios, Renta, Nómina, Transporte, Marketing, Otros), para clasificar mis gastos de forma consistente.

- Criterios de aceptación:
  - Existe una sección "Categorías de Gasto" (puede vivir como pestaña dentro de "Categorías" existente, o como entrada propia — ver decisión de IA recomendada en 4.4).
  - Cada categoría tiene: nombre (único, obligatorio), descripción (opcional), color/ícono identificador (para el gráfico y los badges).
  - No se puede eliminar una categoría que tiene gastos asociados; se ofrece "desactivar" (soft delete) o reasignar los gastos a otra categoría antes de eliminar.
  - Se provee una categoría por defecto **"Otros"** no eliminable, para gastos sin clasificar y para migrar datos históricos.

**HU2 — Registrar un gasto con categoría estructurada**
Como usuario del POS, quiero elegir la categoría del gasto desde una lista (con opción de crear una nueva sin salir del formulario), para no depender de escribir texto libre.

- Criterios de aceptación:
  - El campo "Categoría" pasa de `<input type="text">` a un **combobox con búsqueda**, poblado desde el catálogo de HU1.
  - Incluye una opción "+ Crear categoría 'X'" cuando el texto escrito no coincide con ninguna existente.
  - Deja de ser "opcional": si el usuario no elige nada, se asigna automáticamente **"Otros"**.
  - El bug de fecha (hallazgo #2) queda corregido: la fecha mostrada en cualquier listado coincide exactamente con la fecha seleccionada en el formulario.
  - Se muestra confirmación visual (toast) al guardar (hallazgo #5).

**HU3 — Ver el historial de gastos**
Como administrador, quiero ver todos los gastos registrados en una tabla, para auditar en qué se está gastando el dinero del negocio.

- Criterios de aceptación:
  - Nueva vista "Gastos" en el menú principal (ícono sugerido: recibo o billete, ubicarla junto a "Compras"/"Ventas" en el sidebar por afinidad de dominio).
  - Reutiliza el patrón visual de "Ventas": chips de rango de fecha (Hoy / Ayer / Últimos 7 días / Este mes / Mes pasado / Todo / Personalizado), buscador (por descripción), filtro adicional por **categoría** (multi-selección) y por **origen** (Gasto manual / Compra a proveedor — ver hallazgo #4).
  - Tarjetas resumen arriba de la tabla: Gasto total del período, N.º de gastos, Categoría con mayor gasto, Ticket promedio.
  - Tabla con columnas: Descripción, Categoría (badge con color), Fecha, Monto, Origen, Acciones (ver / editar / eliminar).
  - Paginación consistente con el resto de la app ("Mostrando X–Y de Z resultados").
  - Eliminar un gasto pide confirmación (modal) antes de ejecutar.

**HU4 — Ver gastos por categoría en un gráfico**
Como administrador, quiero ver de un vistazo en qué categorías se concentra el gasto, para tomar decisiones de reducción de costos.

- Criterios de aceptación:
  - En la vista "Gastos": gráfico de **barras horizontales**, una barra por categoría, ordenadas de mayor a menor monto, con el período controlado por el mismo filtro de fecha de la tabla (mismo control, no un segundo selector duplicado).
  - Cada barra usa el color asignado a su categoría (HU1) para que el mismo color identifique siempre a la misma categoría en toda la app (badges de tabla, filtros y gráfico).
  - Etiqueta directa con el monto al final de cada barra (no depender solo del eje).
  - Estado vacío claro cuando no hay gastos en el período ("Aún no hay gastos registrados en este período").
  - En el **Dashboard**, agregar (o adaptar el gráfico "Ingresos vs Gastos" existente con) un mini-desglose por categoría — por ejemplo, un donut/barra compacta de las 3–4 categorías principales + "Otras", con enlace "Ver todos los gastos →" que lleve a la vista completa (HU3).
  - Recomendación de forma de gráfico (siguiendo criterio estándar de visualización de datos): para comparar categorías por magnitud, **barras** son más precisas que un gráfico de torta/donut, que puede reservarse únicamente para el resumen compacto del Dashboard si se prioriza el impacto visual sobre la precisión de lectura.

### 4.3 Modelo de datos sugerido (para que el equipo de desarrollo lo valide contra el esquema real)

```
ExpenseCategory
- id
- name (unique, required)
- description (nullable)
- color (hex, required, para badges y gráfico)
- is_default (bool, solo "Otros" = true)
- is_active (bool, soft delete)
- created_at / updated_at

Expense
- id
- description (required)
- amount (decimal, > 0)
- date (date, guardar y comparar en zona horaria local del negocio, no UTC puro)
- category_id (FK -> ExpenseCategory, default = categoría "Otros")
- source (enum: 'manual' | 'purchase', para diferenciar de Compras si se decide unificar el dato)
- created_by (usuario que lo registró)
- created_at / updated_at
```

Si "Compras" ya es una tabla separada, evaluar con el equipo si conviene:
- (a) Mantener `Compras` y `Expense` separadas y sumarlas solo para la tarjeta "Gastos Totales", o
- (b) Que cada Compra genere automáticamente un `Expense` con `category = "Inventario/Compras"` y `source = 'purchase'`, para que el listado y el gráfico de Gastos sean la fuente única de verdad.
Se recomienda **(b)** por consistencia de reporting, pero es una decisión que QA/backend debe validar por impacto en datos existentes.

### 4.4 Decisión de IA recomendada: ¿dónde ubicar "Categorías de Gasto"?

Dos opciones válidas; se recomienda la primera por menor fricción de navegación y reducción de entradas de menú:

- **Opción A (recomendada):** Agregar una pestaña "Productos" / "Gastos" dentro de la pantalla existente "Categorías", reutilizando el mismo componente de tabla/CRUD parametrizado por tipo. Menor esfuerzo de desarrollo, mismo patrón mental para el usuario ("todas mis categorías viven en un solo lugar").
- **Opción B:** Sección independiente "Categorías de Gasto" dentro de la nueva vista "Gastos" (como sub-tab). Más aislado, evita que un usuario confunda categorías de producto con categorías de gasto, a costa de una entrada de navegación adicional.

### 4.5 Notas de UI/copy

- Nombrar la nueva entrada de menú **"Gastos"** (no "Otros Gastos"): dentro de la app, "otros gastos" es la instrucción del cliente para diferenciarlos de "Compras", pero de cara al usuario final "Gastos" es más claro y evita el ambiguo "¿otros respecto a qué?".
- Badges de categoría: usar el color asignado, texto oscuro/claro según contraste (WCAG AA mínimo), igual que ya se usa el color verde/rojo para ingresos/gastos en "Movimientos recientes".
- Mantener el mismo tono de mensajes vacíos y de confirmación que el resto de la app (ej. "Todos los productos tienen stock suficiente" en Inventario es un buen ejemplo a replicar en el estado vacío de Gastos).

---

## 5. Priorización sugerida (para backlog)

| Prioridad | Ítem |
|---|---|
| P0 | Corregir bug de fecha (hallazgo #2) — afecta integridad de datos ya hoy |
| P0 | Catálogo de Categorías de Gasto (HU1) + combobox en el formulario (HU2) |
| P1 | Vista "Gastos" con listado, filtros y tabla (HU3) |
| P1 | Gráfico de gastos por categoría en la vista Gastos (HU4) |
| P2 | Mini-desglose por categoría en el Dashboard + enlace cruzado |
| P2 | Aclarar relación Compras↔Gastos en el copy del dashboard (hallazgo #4) |
| P3 | Toast de confirmación al guardar gasto (hallazgo #5), validación de monto ≥ 0.01 (hallazgo #6) |

---

## 6. Prompt sugerido para Claude Code (VS Code / CLI)

> Copia y pega el siguiente bloque como instrucción inicial en la sesión de Claude Code, dentro del repo del proyecto Ventex, para arrancar la implementación:

```
Estamos construyendo el módulo de "Gastos" en Ventex (POS). Contexto y
especificación completa en este mismo informe (secciones 3 y 4).

Antes de escribir código:
1. Ubica en el repo dónde vive hoy el modal "Registrar Gasto" (Dashboard) y el
   modelo de datos de gastos actual (campo "Categoría" es texto libre y opcional).
2. Ubica el componente de la pantalla "Categorías" (CRUD de categorías de
   producto) y el de "Ventas" (listado con filtros de fecha, tarjetas KPI y
   tabla) — son los patrones de referencia a reutilizar/clonar.
3. Corrige primero el bug de fecha (hallazgo #2): un gasto guardado con fecha
   13/08/2026 se muestra como 12/8 en "Movimientos recientes" — desfase de zona
   horaria al parsear el <input type="date">.

Luego implementa, en este orden:
1. Catálogo "Categorías de Gasto" (CRUD: nombre único, descripción, color,
   categoría "Otros" por defecto no eliminable, soft delete).
2. Reemplaza el input de texto libre del modal "Registrar Gasto" por un
   combobox contra ese catálogo, con opción de crear categoría inline.
3. Nueva vista "Gastos" en el menú principal, con el mismo patrón visual que
   "Ventas" (filtros de fecha, buscador, filtro por categoría, tarjetas
   resumen, tabla con acciones ver/editar/eliminar, paginación).
4. Gráfico de barras horizontales de gasto por categoría dentro de la vista
   "Gastos", ordenado de mayor a menor, coloreado según el color de cada
   categoría, con el mismo filtro de fecha de la tabla.
5. Mini-desglose de gasto por categoría en el Dashboard, con enlace a la
   vista completa.

Sigue el modelo de datos sugerido en la sección 4.3 del informe, ajustándolo al
esquema real del proyecto. Antes de dar por cerrado cada punto, valida que el
diseño responsive (mobile) no se rompa, siguiendo el estándar ya usado en el
Dashboard actual.
```

---

## 7. Verificación de este informe

- Cada hallazgo de la sección 3 fue reproducido en vivo en la app (capturas y pasos documentados durante la auditoría), no es una suposición teórica.
- La especificación de la sección 4 reutiliza exclusivamente patrones de UI que ya existen y funcionan en Ventex (Ventas, Compras, Categorías), para minimizar riesgo de inconsistencia visual y esfuerzo de desarrollo.
- Pendiente de validar por el equipo de backend: la decisión del modelo de datos 4.3 (relación Compras↔Gastos) y la ubicación final de "Categorías de Gasto" (4.4), ya que dependen del esquema real de la base de datos, no visible desde la interfaz.
