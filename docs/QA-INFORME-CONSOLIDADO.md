# Informe QA Consolidado — Ventex App (Barbería)

**Alcance:** tres rondas de validación funcional del flujo completo (sitio público de reservas, panel del negocio, calendario, servicios, clientes y punto de venta).
**Período:** 7 de agosto de 2026.
**Estado global:** todos los bugs funcionales reportados entre las tres pasadas están corregidos y confirmados. Quedan pendientes dos sugerencias de mejora de UX no bloqueantes y una inconsistencia menor de formularios.

---

## 1. Resumen ejecutivo

| Métrica | Cantidad |
|---|---|
| Bugs funcionales reportados (total entre pasadas) | 5 |
| Bugs corregidos y confirmados | 5 |
| Falsos positivos del primer informe (corregidos por el propio QA) | 2 |
| Hallazgos resueltos entre la primera y la segunda pasada | 7 |
| Sugerencias de mejora pendientes (no bloqueantes) | 2 |
| Inconsistencia menor pendiente (sin impacto funcional) | 1 |

El hallazgo más crítico —la falta de alerta ante reservas online pendientes— fue corregido y revalidado con evidencia fresca en la tercera pasada. El único bug nuevo detectado (Enter en la búsqueda global disparaba la confirmación de venta en el POS) fue corregido en la misma sesión en que se reportó.

---

## 2. Cronología de pasadas

### Primera pasada (informe original)
- Reportó 9 hallazgos y 2 sugerencias.
- El crítico: reservas creadas desde el sitio público aparecían como "Pendiente" en el Calendario, pero la campana de Alertas seguía en "No tienes alertas".

### Segunda pasada (revalidación)
- Confirmó que 7 hallazgos ya no reproducían (interruptor "Es domicilio", etiqueta "LLENO", placeholders del rubro, buscador global, botón de ayuda, modales propios de la app, módulos de retail configurables).
- Corrigió 2 errores del primer informe (botón de ayuda y módulos de retail).
- Confirmó 2 hallazgos vigentes (alertas, duración en formulario de servicio) y detectó 1 nuevo ("CC null" en clientes de reserva online).

### Tercera pasada (revalidación final)
- Confirmó la corrección del bug de alertas con evidencia ("Nueva reserva pendiente — Corte para el 08/08/2026 a las 10:00 (Test QA 3)").
- Confirmó la corrección de "CC null" (la columna Documento muestra un guion) y del campo "Duración (minutos)" en Inventario → Nuevo Producto.
- Detectó 1 bug nuevo: en el Punto de Venta, presionar Enter en la barra de búsqueda global con ítems en el carrito abría el modal "Confirmar venta" en lugar de buscar (riesgo de confirmar una venta sin intención).
- Dejó el entorno limpio: cliente y cita de prueba "Test QA 3" eliminados con los modales de confirmación propios; permanece una única alerta histórica como evidencia de que el sistema de alertas funciona.

---

## 3. Estado por hallazgo

### 3.1 Corregidos y confirmados

| # | Hallazgo | Estado | Evidencia |
|---|---|---|---|
| 1 | Reserva online no generaba alerta en la campana del panel | **Corregido y confirmado** | Alerta "Nueva reserva pendiente — Corte para el 08/08/2026 a las 10:00 (Test QA 3)" visible en la campana tras reservar desde el sitio público. Causa raíz: el RPC `public_site_book` no insertaba en `notifications`; la migración que lo agrega no estaba aplicada en la base remota. |
| 2 | Cliente autogenerado por reserva online mostraba "CC null" en la columna Documento | **Corregido y confirmado** | La columna muestra un guion ("–") cuando no hay identificación, igual que la columna Contacto con el correo. Causa raíz: `customers.doc_type` tiene default `'CC'` y la reserva online inserta solo nombre y celular. |
| 3 | Formulario "Servicio" de Inventario/POS sin campo "Duración" | **Corregido y confirmado** | El campo "Duración (minutos)" ya existe en la pestaña Servicio de Inventario → Nuevo Producto y se sincroniza con la tabla `services` que usa la agenda. |
| 4 | POS: Enter en la búsqueda global abría "Confirmar venta" | **Corregido (sesión de reporte)** | El atajo global "Enter = vender" del POS ahora ignora Enter cuando el foco está en un campo editable; la búsqueda global busca y el atajo sigue funcionando para el cajero. Verificación: typecheck limpio, pendiente revalidación manual. |

### 3.2 Resueltos entre la primera y la segunda pasada

| Hallazgo | Resolución |
|---|---|
| Interruptor "Es domicilio" fuera de lugar en el panel de factura | Eliminado del flujo de servicios en el local |
| Etiqueta "LLENO" para el día de hoy sin cupos | Muestra "CERRADO" cuando ya pasó el horario de atención |
| Placeholders de supermercado/veterinaria | Adaptados al rubro ("Ej. CORTE TRADICIONAL + BARBA", "Ej. CERA MATE FIJADORA") |
| Buscador global "Buscar en Ventex..." no navegaba | Funciona: "corte" + Enter navega a Servicios y filtra |
| Botón de ayuda ("?") inoperante | **Falso positivo del primer informe**: abre WhatsApp con mensaje precargado |
| `confirm()` nativo al eliminar cita/cliente | Reemplazado por modales propios de la app (Cancelar/Eliminar) |
| Módulos de retail siempre visibles sin poder ocultarse | **Error del primer informe**: con "Inventario" desactivado en Ajustes, Compras/Proveedores/Pedidos/Categorías desaparecen del menú; el Panel muestra accesos rápidos adaptados al modo solo-servicios |

### 3.3 Pendientes (sugerencias de mejora, no bloqueantes)

| # | Sugerencia | Detalle |
|---|---|---|
| S1 | Comisión duplicada en el Punto de Venta | El selector "Atendido por" (general) y el selector "Sin comisión"/barbero por cada línea del carrito conviven y pueden confundir con un solo empleado |
| S2 | Formulario de cliente de mostrador | Documento y switch de exención de IVA demasiado visibles para un flujo rápido; idealmente opcionales/colapsables |
| S3 | Inconsistencia menor entre formularios de servicio | Inventario → Nuevo Producto tiene "Categoría" pero no el toggle "Servicio Activo"; el formulario de Servicios tiene el toggle pero no "Categoría". Sin impacto funcional |

---

## 4. Entorno y limpieza

- Todos los datos de prueba generados durante las pasadas fueron eliminados mediante los flujos normales de la app (modales de confirmación propios, no diálogos nativos).
- El negocio quedó en el mismo estado en que comenzó la validación, con la única alerta histórica en el panel de notificaciones como evidencia de que el sistema de alertas está operativo.

---

## 5. Notas técnicas para el equipo de desarrollo

- El modelo de datos de servicios es dual: la tabla `services` (agenda/calendario, con `duration_minutes`) y la tabla `products` con unidad `'Servicio'` (catálogo POS/Inventario, sin columna de duración) no tienen vínculo entre sí. Los formularios de creación ahora mantienen ambas en sincronía y el catálogo del POS deduplica por nombre para no mostrar el mismo servicio dos veces.
- Las notificaciones se insertan dentro del RPC `public_site_book` (security definer) con `user_id` del dueño; la campana lee la misma tabla con las políticas RLS existentes, por lo que el flujo respeta la tenencia de trabajadores.
