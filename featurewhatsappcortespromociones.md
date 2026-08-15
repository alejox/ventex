# Feature: Notificación WhatsApp por corte + Configuración de Promociones

**Producto:** Ventex App
**Solicitado por:** Cliente (negocio de barbería)
**Fecha:** 15 de agosto de 2026
**Preparado por:** Validación UX/Producto — listo para implementación (Claude Code / VS Code)

## Resumen del requerimiento (tal como lo pidió el cliente)

Cuando se le haga un corte a un cliente, se le debe enviar una notificación por WhatsApp indicando el número de cortes que lleva. Objetivo: que la barbería pueda promocionar sus servicios y mantener control de cortes por barbero; al ver el conteo, el cliente tiene un incentivo para escribir al WhatsApp de soporte a preguntar por los servicios que lleva. Adicionalmente, debe existir en Configuración una opción para ajustar las promociones.

---

## ⚠️ Validación previa (leer antes de estimar)

Se revisó la app en ejecución para confirmar qué existe hoy y qué falta. Esto **cambia el alcance real** del pedido:

- ✅ **Sí existe:** teléfono de contacto por cliente (`Clientes`), atribución de cada venta a un colaborador vía el campo **"Atendido por"** en el Punto de Venta, y un conteo agregado de ventas/última visita por cliente (modal de detalle de cliente).
- ✅ **Sí existe:** distinción entre ítems tipo "Servicio" (Corte, Corte + barba) e ítems tipo "Producto" dentro de una venta — necesario para poder contar específicamente "cortes" y no cualquier ítem vendido.
- ❌ **No existe:** integración con WhatsApp Business API / Cloud API. Hoy el único uso de WhatsApp en la app es un botón fijo de **"Soporte"** que abre un chat estático (wa.me) hacia el negocio — **no hay capacidad de enviar mensajes salientes automáticos** a clientes. Esto es lo que se debe construir desde cero, no es un ajuste menor de UI.
- ❌ **No existe:** ningún tab, tabla ni entidad de "Promociones" en `Configuración` (hoy solo hay General / Datos de tu negocio / Sitio web).
- ❌ **No existe:** ningún mecanismo de consentimiento/opt-in del cliente para recibir mensajes de marketing por WhatsApp.

**Implicación:** este feature no es solo "agregar un mensaje" — requiere contratar/integrar un proveedor de WhatsApp Business (Meta Cloud API directo, o un BSP como Twilio, 360dialog o Gupshup), gestionar plantillas de mensaje pre-aprobadas por Meta (obligatorio para mensajes iniciados por el negocio fuera de una conversación de 24h), y resolver consentimiento legal (habeas data / mensajes de marketing). Ver Fase 0 y Fase 4 antes de estimar tiempos.

---

## Fase 0 — Decisiones bloqueantes (definir con el cliente antes de codear)

- [ ] ¿El conteo de "cortes" es **global por cliente** (todas las sedes/barberos) o **segmentado por barbero**? El pedido menciona ambos ("cuántos cortes lleva" + "control de cortes por barbero") — probablemente se necesiten **las dos métricas**: un contador total para el mensaje al cliente y un reporte interno por barbero.
- [ ] ¿Qué servicios cuentan para el contador? ¿Solo "Corte", o también "Corte + barba" y futuros servicios? Debe ser configurable, no hardcodeado.
- [ ] ¿El contador es acumulado para siempre, o cíclico (ej. se reinicia cada 10 cortes al canjear un premio tipo "el corte #10 es gratis")?
- [ ] ¿Qué proveedor de WhatsApp se va a usar? (Meta Cloud API directo vs. un BSP como Twilio/360dialog/Gupshup). Afecta costo, tiempo de aprobación de plantillas y complejidad de integración.
- [ ] ¿Quién paga el costo por mensaje/conversación de WhatsApp — el negocio (Ventex cobra un addon) o queda incluido en el plan? Cada mensaje de plantilla tiene costo en la API de Meta.
- [ ] ¿En qué momento exacto se dispara el mensaje? Opciones: (a) al completar/cerrar la venta en el Punto de Venta si contiene un ítem de tipo servicio "corte", o (b) al marcar una cita del Calendario como completada. Hoy el POS no tiene un estado "completado" explícito distinto de "venta registrada" — confirmar con cuál evento se engancha.
- [ ] ¿Cómo se obtiene el consentimiento del cliente para recibir estos mensajes? (checkbox al crear el cliente, aceptación en el primer mensaje, etc. — ver Fase 4).

---

## Fase 1 — Integración base de WhatsApp Business (infraestructura)

- [ ] Definir y contratar el proveedor elegido en Fase 0 (Meta Cloud API o BSP).
- [ ] Registrar el número de WhatsApp Business del negocio y verificarlo ante Meta.
- [ ] Guardar credenciales de la API de forma segura (variables de entorno / secret manager), nunca en el repo.
- [ ] Crear un servicio backend (`whatsapp-service` o similar) que encapsule el envío de mensajes por plantilla, con reintentos y manejo de errores (número inválido, mensaje rechazado, límite de envío alcanzado, etc.).
- [ ] Crear y enviar a aprobación en Meta la(s) plantilla(s) de mensaje necesarias (los mensajes que inicia el negocio fuera de una sesión de 24h **deben** ser plantillas pre-aprobadas; no se puede mandar texto libre).
  - [ ] Plantilla 1: notificación de corte completado + conteo (ej. "¡Gracias por tu visita, {{nombre}}! Llevas {{n}} cortes con nosotros 💈").
  - [ ] Plantilla 2 (si aplica): notificación de promoción alcanzada (ej. "¡Felicidades! Tu próximo corte tiene {{descuento}} de descuento 🎉").
- [ ] Registrar un log de mensajes enviados (tabla `whatsapp_notifications` o similar: cliente, tipo, fecha, estado de entrega, id externo del proveedor) para poder auditar envíos y evitar duplicados.

---

## Fase 2 — Modelo de datos: conteo de cortes

- [ ] Definir si el conteo se calcula "al vuelo" (query sobre el historial de ventas filtrando ítems tipo servicio = corte) o se mantiene como contador persistente en el cliente (`clientes.cortes_totales`) que se incrementa en cada venta — recomendado: contador persistente + trigger de recálculo, para no golpear la base de datos en cada mensaje y para poder soportar reinicios cíclicos (Fase 0).
- [ ] Agregar campo(s) al modelo de cliente: `cortes_totales`, y si aplica, `cortes_desde_ultimo_premio`.
- [ ] Agregar/confirmar atribución por barbero: usar el campo ya existente "Atendido por" de la venta para poblar un reporte de cortes por barbero (no requiere cambio de modelo, solo una vista/reporte agregando por `atendido_por` + filtro de ítems tipo servicio = corte).
- [ ] Migración de datos: decidir si se recalculan los cortes históricos ya registrados (ventas pasadas) para inicializar el contador de clientes existentes, o si el conteo arranca en cero desde el día de lanzamiento del feature (aclarar con el cliente — afecta expectativas de los clientes existentes).

---

## Fase 3 — Trigger de notificación al completar un corte

- [ ] Enganchar el evento definido en Fase 0 (venta completada con ítem tipo "corte", o cita marcada como completada).
- [ ] Al dispararse: incrementar el contador del cliente, verificar si el cliente dio consentimiento (Fase 4) y si tiene un número de WhatsApp válido.
- [ ] Enviar el mensaje de plantilla "corte completado + conteo" vía el servicio de Fase 1.
- [ ] Evaluar reglas de promoción activas (Fase 5): si el nuevo conteo cumple una regla (ej. múltiplo de 10), disparar además la plantilla de promoción.
- [ ] Manejar casos borde: cliente sin número registrado (no enviar, marcar en log), número inválido/no es WhatsApp, venta anulada o corregida después de enviada la notificación (¿se debe decrementar el contador y notificar la corrección?).
- [ ] Evitar doble notificación si una venta se edita o se re-guarda sin cambios en los ítems de servicio.

---

## Fase 4 — Consentimiento y cumplimiento legal (no opcional)

- [ ] Agregar un campo de consentimiento explícito en el formulario de "Añadir/Editar Cliente" (ej. checkbox "Acepta recibir promociones y notificaciones por WhatsApp"), requerido por la política de Meta para mensajes de marketing y por la Ley 1581 de 2012 (Habeas Data) en Colombia.
- [ ] Guardar fecha y forma en que se obtuvo el consentimiento (auditable).
- [ ] Incluir mecanismo de opt-out (ej. responder "STOP" o un link/instrucción en el mensaje) y respetar la baja inmediatamente en envíos futuros.
- [ ] Excluir de los envíos de marketing/promoción a clientes que no dieron consentimiento — la notificación transaccional del conteo podría considerarse aceptable sin opt-in explícito en algunas políticas, pero la de **promoción sí requiere opt-in**; confirmar con el cliente/legal antes de lanzar.

---

## Fase 5 — Configuración > Promociones (nueva sección de UI)

- [ ] Agregar un nuevo tab **"Promociones"** dentro de `Configuración` (junto a General / Datos de tu negocio / Sitio web).
- [ ] Diseñar UI para reglas de promoción, como mínimo:
  - [ ] Activar/desactivar el envío de notificación de conteo de cortes (on/off general).
  - [ ] Seleccionar qué servicios cuentan para el contador (multi-select del catálogo de servicios).
  - [ ] Definir umbral(es) de promoción (ej. "cada 10 cortes" o una lista de hitos: 5, 10, 20).
  - [ ] Definir el premio/beneficio asociado a cada hito (texto libre o % de descuento, ya que el pago del descuento en el POS es un tema aparte — ver nota abajo).
  - [ ] Editor del texto de la plantilla de mensaje (dentro de las variables permitidas por la plantilla aprobada en Meta — no es texto 100% libre, ver Fase 1).
  - [ ] Vista previa del mensaje antes de guardar.
- [ ] Nota importante: si la promoción implica un descuento real aplicable en el Punto de Venta (ej. "corte #10 gratis"), esto requiere además lógica en el POS para reconocer y aplicar el beneficio al cobrar — confirmar con el cliente si el alcance de este feature incluye solo la notificación o también la redención del beneficio en caja.

---

## Fase 6 — QA / Pruebas

- [ ] Probar el flujo completo en un entorno de pruebas del proveedor de WhatsApp (sandbox) antes de producción.
- [ ] Probar casos borde: cliente sin teléfono, teléfono mal formateado, cliente sin consentimiento, venta con múltiples cortes en un mismo ticket, venta anulada después de notificar.
- [ ] Probar que el reporte de "cortes por barbero" (Fase 2) sume correctamente contra el historial de ventas ya existente en `Ventas`/`Personal`.
- [ ] Probar que desactivar la promoción desde Configuración detiene los envíos inmediatamente.
- [ ] Revisar copys de los mensajes con el cliente final (tono de marca) antes de enviarlos a aprobación de Meta, ya que una plantilla rechazada o que se quiera editar después vuelve a pasar por aprobación (puede tardar días).

---

## Fase 7 — Reporte interno "cortes por barbero" (para el negocio)

- [ ] Agregar una vista (puede vivir dentro de `Equipo` o como reporte en `Finanzas`/`Ventas`) que muestre, por barbero y por rango de fechas, el número de cortes realizados — reutilizando el campo "Atendido por" ya presente en las ventas.
- [ ] Evaluar si este reporte debe cruzarse con el módulo de comisiones existente (actualmente el conteo de "Ventas" por miembro ya se usa para comisiones; confirmar si el conteo de "cortes" debe ser una métrica aparte o alimentar el mismo cálculo).

---

## Fuera de alcance (a menos que el cliente confirme lo contrario)

- Redención automática de descuentos en el Punto de Venta (Fase 5 lo señala como posible extensión, no incluido por defecto).
- Campañas de WhatsApp masivas/broadcast fuera del disparo por corte individual.
- Soporte multi-canal (SMS/email) — el pedido es específicamente WhatsApp.
