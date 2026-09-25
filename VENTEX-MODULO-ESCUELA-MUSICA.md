# Ventex — Plan de implementación del módulo Escuela de música

Fecha: 24 de septiembre de 2026.
Estado: propuesta funcional y técnica para ejecutar desde VS Code. No se ha inspeccionado el repositorio de Ventex; los nombres de entidades son orientativos y deben adaptarse a su arquitectura real.

## 1. Objetivo y alcance

Agregar a Ventex un módulo opcional por empresa para administrar estudiantes, acudientes, profesores, horarios, clases, asistencia, material y saldo de clases. Reutilizar usuarios, empresas, permisos, clientes, ventas, pagos, archivos y componentes existentes cuando estén disponibles. No crear un POS ni una aplicación independiente.

MVP: operación administrativa y del profesor, clases individuales y grupos sencillos, enlaces de acceso limitado para familias y envío manual por WhatsApp. Los perfiles de estudiantes y acudientes son registros desde el inicio; no requieren cuentas con contraseña en el MVP.

Fuera del MVP: nómina docente, videoconferencias propias, calificaciones complejas, reservas públicas autónomas, aplicación móvil nativa, firma certificada y automatización de WhatsApp.

## 2. Menú propuesto

- Resumen: clases de hoy, confirmaciones pendientes y paquetes próximos a agotarse.
- Agenda: vista semanal y listado diario, filtros por profesor/instrumento.
- Estudiantes: ficha, acudientes, matrícula, clases, asistencia y material.
- Profesores: ficha, instrumentos, disponibilidad y clases impartidas.
- Planes y matrículas: paquetes, duración, vigencia y saldo.
- Configuración: instrumentos, salones opcionales, política de aplazamientos y mensajes.

El material y la asistencia se administran desde la clase; evitar pantallas independientes innecesarias.

## 3. Roles y permisos

| Rol | Acceso |
| --- | --- |
| Administrador/coordinador | Configurar el módulo, matricular, agendar, reprogramar, consultar reportes y corregir con motivo registrado. |
| Profesor | Consultar sus clases y estudiantes asignados, confirmar clase impartida, tomar asistencia y publicar material. No consultar finanzas generales. |
| Acudiente | Consultar información de sus estudiantes mediante acceso autorizado; recibir material y avisos, solicitar aplazamientos. |
| Estudiante | Consultar exclusivamente su horario y material con acceso autorizado. |

Adaptar estos permisos a los roles existentes. Verificar permisos y empresa en el servidor, no únicamente ocultar botones.

## 4. Datos mínimos

- Estudiante: nombre, estado activo/inactivo, instrumento, nivel opcional, contacto opcional y condición de menor/adulto según el proceso de la escuela. No exigir documento de identidad sin una necesidad concreta.
- Acudiente: nombre, teléfono con código de país, correo opcional, vínculo y preferencias de comunicación. Un acudiente puede representar a varios estudiantes y un estudiante puede tener varios acudientes. Definir quién recibe avisos.
- Profesor: usuario vinculado, nombre, instrumentos, disponibilidad semanal y bloqueos por fecha.
- Plan: nombre, número de clases, duración, vigencia y vínculo con producto/servicio del POS. Recomendación inicial: paquetes de N clases, incluso si comercialmente se venden como mensualidad.
- Matrícula: estudiante, instrumento, plan contratado, fecha de inicio, vencimiento, profesor habitual opcional y referencia a venta del POS. Conservar las condiciones contratadas aunque luego cambie el catálogo.
- Clase: inicio y fin, zona horaria de empresa, profesor, instrumento, salón opcional, cupo, participantes y estado.
- Asistencia por estudiante: pendiente, asistió, ausente o ausencia justificada; observación y autor del registro.
- Material: título, instrucciones breves, archivo privado o enlace, autor y clase/estudiantes destinatarios.

El responsable del pago puede ser distinto al estudiante y a quien recibe las notificaciones. Reutilizar el cliente del POS como pagador cuando corresponda.

## 5. Flujos principales

### A. Matrícula y programación

1. Crear o seleccionar estudiante y acudiente.
2. Seleccionar un plan y vincular la venta/pago existente del POS.
3. Crear matrícula con saldo de clases y vigencia.
4. Seleccionar horario disponible y generar sesiones concretas; para repetición semanal, usar una fecha final o número de sesiones.
5. Revisar conflictos y confirmar. Si hay conflictos, informar las fechas sin generar silenciosamente una serie parcial.

Mostrar clases contratadas, consumidas, reservadas y disponibles para programar. Una reserva reduce la disponibilidad para agendar, pero no significa que la clase ya fue consumida.

### B. Confirmación del profesor y asistencia

1. Profesor abre su agenda o el enlace específico recibido por WhatsApp.
2. Consulta fecha, hora y grupo/estudiante.
3. Después del horario previsto, registra asistencia por participante y pulsa «Confirmo que impartí esta clase».
4. Registrar fecha/hora del servidor, usuario o método de acceso y versión de la clase confirmada.
5. Cerrar la clase y aplicar el consumo correspondiente por estudiante en una operación transaccional e idempotente.
6. Ofrecer «Compartir asistencia» con el acudiente o estudiante autorizado.

Un enlace acredita una confirmación realizada con ese enlace; puede ser reenviado y por sí solo no demuestra quién estuvo físicamente presente. Para mayor atribución, exigir la sesión del profesor antes de confirmar; recomendar esta opción si el registro se usa para liquidarle pagos. No llamar al mecanismo firma certificada. Una firma dibujada puede añadirse después, pero no resuelve por sí misma la identidad.

Si el profesor no confirma, la clase queda pendiente de cierre; no marcarla realizada automáticamente por el simple paso del tiempo. Una corrección del coordinador requiere motivo e historial.

### C. Material de estudio

1. Profesor añade PDF, imagen, audio o enlace de video en la clase.
2. Selecciona destinatarios y verifica título e instrucciones.
3. Publica y comparte un enlace de consulta por WhatsApp.
4. La familia ve una página móvil con material autorizado y próxima clase, sin instalar una aplicación.

Usar almacenamiento privado y descargas autorizadas. Establecer límites de tamaño, tipos permitidos y cuota por empresa; evitar alojar videos pesados inicialmente. Un enlace externo, por ejemplo a un video, conserva las condiciones de acceso del servicio externo: Ventex no puede garantizar su privacidad.

### D. Aviso a las familias

Interpretación inicial de «confirmar asistencia a los padres»: informar la asistencia registrada del estudiante después de la clase. La confirmación del profesor, la asistencia del estudiante y el estado del aviso son datos separados.

No exigir que el acudiente confirme cada clase para descontar el saldo. Si la escuela necesita además una confirmación previa de que asistirá, incorporarla después como RSVP independiente.

En el MVP, abrir WhatsApp con texto preparado no permite afirmar que fue enviado, entregado o leído. Guardar «enlace preparado» o «compartido según operador», sin inventar estados de entrega.

### E. Aplazamientos y reposiciones

1. Coordinador registra la solicitud, motivo y quién la solicita. También puede recibirse desde un enlace limitado de la familia.
2. Validar política de la matrícula: anticipación mínima, máximo de cambios y vencimiento.
3. Solicitud pendiente no libera ni modifica el horario.
4. Al aprobar, liberar la reserva original y seleccionar un horario disponible, o dejar reposición pendiente sin fecha.
5. Crear nueva sesión/participación vinculada a la original, conservando el historial.
6. Invalidar enlaces de confirmación antiguos e informar el cambio.

Una reprogramación aprobada no debe consumir dos clases. Si se aplaza una clase grupal completa, mover a todos los participantes. Si solo un estudiante solicita cambio, mantener la clase grupal y gestionar únicamente su participación/reposición, sin afectar los demás cupos.

## 6. Reglas de negocio propuestas

Son valores funcionales propuestos para validar con una escuela piloto, no políticas ya existentes en Ventex.

| Situación | Tratamiento inicial |
| --- | --- |
| Clase impartida y estudiante presente | Consumir una clase al cerrar. |
| Aplazamiento aprobado dentro de política | Liberar reserva y conservar derecho a una reposición. |
| Cancelación de la escuela/profesor | No consumir; conservar reposición. Si supera la vigencia, permitir prórroga justificada. |
| Ausencia injustificada o cambio fuera de plazo | Consumir solo si la política contratada lo contempla. |
| Ausencia justificada aprobada | No consumir; habilitar reposición conforme a política. |
| Solicitud pendiente | Mantener reserva hasta resolución. |
| Paquete agotado o vencido | Impedir nueva programación; excepción administrativa explícita y auditada. |
| Venta anulada/reembolsada | Conciliar derechos y reservas según reglas del POS; nunca borrar asistencia histórica. |

Guardar la política aplicable en la matrícula. No cambiar retroactivamente las condiciones al editar la configuración general.

Estados de sesión: programada, pendiente de cierre, realizada, cancelada y reprogramada. Reposición pendiente sin fecha se representa como derecho/solicitud vinculada, no como evento sin fecha en la agenda. La asistencia de cada estudiante se mantiene separada del estado de la sesión.

## 7. Horarios disponibles

Disponibilidad = jornada del profesor menos bloqueos y sesiones que ocupan tiempo, considerando duración, salón y cupos. Para una matrícula concreta, validar también cruces del estudiante y compatibilidad de instrumento/profesor.

- Mostrar espacios a coordinación y profesores en el MVP; las familias pueden consultar una selección autorizada sin nombres de otros estudiantes.
- Un profesor no puede impartir dos sesiones distintas simultáneas; varios alumnos en una misma sesión grupal sí son válidos hasta el cupo.
- Salón opcional: si se utiliza, validar ocupación y capacidad.
- Aplicar control transaccional al reservar: dos solicitudes simultáneas no pueden tomar el mismo espacio/cupo.
- Guardar instantes en UTC y mostrar según zona horaria de la empresa; usar America/Bogota si la empresa opera allí.
- Bloquear festivos o ausencias mediante excepciones por fecha. Evitar calendarios infinitos: materializar solo las sesiones solicitadas.

## 8. Integración con Ventex

- Activar mediante permiso/feature flag por empresa. Empresas sin el módulo mantienen su experiencia actual.
- Toda entidad académica, archivo y enlace debe estar ligado a la empresa; el servidor obtiene el contexto autorizado.
- Reutilizar autenticación, permisos, clientes, catálogo, ventas, cartera, pagos, notificaciones y almacenamiento cuando existan.
- Vincular el paquete vendido con una matrícula sin duplicar cobros ni contabilidad.
- Procesar eventos de venta/abono/anulación una sola vez. Si no existe infraestructura de eventos, usar el mecanismo transaccional que ya maneje Ventex; no incorporar una plataforma nueva por defecto.
- No suponer que una factura emitida equivale a pago: respetar cartera/crédito y definir cuándo se habilita la matrícula con las reglas del POS.
- Reutilizar componentes, estilos, convenciones y librerías instaladas. Si el proyecto usa Vue 3/TypeScript/Pinia, seguir sus patrones reales, sin imponer una reescritura.

## 9. Modelo orientativo para el desarrollador

| Entidad conceptual | Responsabilidad |
| --- | --- |
| Student | Perfil académico vinculado a persona existente cuando sea posible. |
| Guardian + StudentGuardian | Acudientes, relaciones y autorizaciones por estudiante. |
| TeacherProfile | Extensión del usuario/profesor existente. |
| Availability + AvailabilityException | Jornada semanal y bloqueos por fecha. |
| LessonPlan + Enrollment | Catálogo de paquetes y condiciones de matrícula. |
| Lesson + LessonParticipant | Sesiones individuales/grupales, reservas y asistencia por alumno. |
| TeacherConfirmation | Evidencia de confirmación de una versión concreta de la sesión. |
| RescheduleRequest | Solicitud, decisión, motivo y relación entre sesiones/participaciones. |
| ClassCreditMovement | Asignación, consumo, reversión y ajustes auditables del saldo. |
| LessonMaterial + MaterialRecipient | Archivos/enlaces y alcance de acceso. |
| AccessLink | Token almacenado como hash, propósito, destinatario, alcance, expiración y revocación. |
| CommunicationLog | Preparación/compartición manual o estados reales del proveedor futuro. |

No crear una tabla por cada fila si Ventex ya resuelve esa responsabilidad. Incluir historial usando el sistema de auditoría existente. El saldo académico debe poder reconstruirse desde movimientos; no depender solo de un contador editable.

## 10. Enlaces y datos privados

- Enlace de confirmación: token aleatorio suficientemente largo, hash en base de datos, ligado a empresa, clase, versión, profesor y acción; expiración propuesta de 24 horas, regenerable y de un solo uso al confirmar.
- Abrir un GET nunca confirma ni consume un token: WhatsApp puede generar vistas previas. Confirmar únicamente mediante acción explícita POST y validaciones del servidor.
- Enlace de lectura/material: alcance limitado por destinatario y contenido, revocable, reutilizable hasta expirar; propuesta inicial de 7 días. No reutilizar el token de confirmación docente.
- Si se quiere acceso a todo el historial familiar, usar portal autenticado o verificación adicional; no ampliar indefinidamente un enlace compartible.
- Evitar tokens en registros y servicios analíticos; HTTPS, límites de intentos y respuestas sin datos innecesarios.
- Archivos privados con tipos/tamaño validados en servidor; autorización también en descarga.
- Registrar preferencias/consentimiento de comunicación, permitir desactivar avisos y limitar información personal en el texto de WhatsApp.
- No mostrar nombres de otros menores, contactos de otras familias ni listados de grupo en las páginas familiares.

## 11. WhatsApp por fases

MVP: botón «Compartir por WhatsApp» con destinatario y texto preparados. La persona revisa y pulsa enviar. Registrar únicamente lo que Ventex realmente puede observar.

Fase posterior: integración oficial con WhatsApp Business Platform mediante proveedor o Meta, plantillas, consentimiento, colas, reintentos y webhooks. La documentación consultada de Twilio indica que los mensajes libres se permiten dentro de la ventana de atención de 24 horas desde el último mensaje entrante; fuera de ella se necesitan plantillas aprobadas. Verificar condiciones y costos al implementar. En SaaS, definir qué número/cuenta corresponde a cada escuela antes de automatizar.

Una falla de notificación no debe deshacer una clase registrada. Reintentos no deben duplicar mensajes ni consumos. Entrega/lectura de un mensaje no significa conformidad del acudiente con la asistencia.

## 12. Plan de acción y criterios de aceptación

### Fase 0 — Inspeccionar Ventex

- [ ] Leer AGENTS.md/instrucciones y localizar frontend, backend, datos, autenticación, permisos y pruebas.
- [ ] Identificar empresas, clientes, productos/servicios, pagos, almacenamiento y componentes reutilizables.
- [ ] Documentar integración real, migraciones necesarias y políticas asumidas. Estimar esfuerzo después de esta revisión.

Aceptación: mapa breve de archivos y responsabilidades; ninguna arquitectura o dependencia inventada.

### Fase 1 — Base académica y aislamiento

- [ ] Feature flag, permisos y menú por empresa.
- [ ] Estudiantes, profesores, acudientes y relaciones.
- [ ] Planes, matrículas y enlace con venta/pago existente.

Aceptación: un acudiente puede tener dos estudiantes, un estudiante varios acudientes; empresa A no puede acceder a registros de B; POS existente sigue funcionando.

### Fase 2 — Agenda y disponibilidad

- [ ] Jornada semanal, bloqueos, duración y salones opcionales.
- [ ] Clases individuales/grupales, cupos y repetición semanal acotada.
- [ ] Reservas y validación de cruces en servidor.

Aceptación: impedir doble reserva incluso con peticiones simultáneas; permitir participantes dentro de una única clase grupal hasta su cupo.

### Fase 3 — Operación de clases

- [ ] Confirmación docente y asistencia individual.
- [ ] Cierre, movimientos de saldo e historial.
- [ ] Aplazamientos, aprobación y reposiciones.

Aceptación: un doble clic no descuenta dos veces; clase cancelada por escuela no consume; cambio de un estudiante no mueve todo el grupo; reposición mantiene trazabilidad y saldo correcto.

### Fase 4 — Material y comunicación

- [ ] Archivos privados/enlaces y página móvil de consulta.
- [ ] Enlaces limitados de confirmación/consulta y revocación.
- [ ] Botones manuales para compartir asistencia, material y cambios.

Aceptación: un enlace vencido/revocado falla; una vista previa no confirma; una familia no puede acceder al material privado de otra; interfaz no afirma envío/entrega automático.

### Fase 5 — Piloto y salida

- [ ] Resumen de clases impartidas, pendientes, ausencias y saldos bajos.
- [ ] Probar escenarios críticos con una escuela y datos de prueba.
- [ ] Verificar permisos, concurrencia, expiración, anulaciones POS y reversiones de saldo.
- [ ] Desplegar gradualmente con feature flag y migraciones compatibles con el POS.

Aceptación: recorrido completo matrícula → agenda → clase → asistencia → material → aviso → reposición, con datos y saldos consistentes.

### Después del piloto

Prioridad sugerida: WhatsApp automático y recordatorios → portal autenticado de familias → reporte para liquidación docente → reservas autónomas/lista de espera → seguimiento pedagógico detallado.

## 13. Instrucción para pegar en el asistente de VS Code

Adjunta este archivo al contexto y usa el siguiente mensaje:

> Implementa el módulo Escuela de música de Ventex siguiendo VENTEX-MODULO-ESCUELA-MUSICA.md. Primero inspecciona el repositorio y sus instrucciones. Identifica el stack y cómo funcionan empresas, usuarios, roles, clientes, ventas, pagos, almacenamiento y componentes. Reutiliza lo existente y adapta las entidades propuestas al esquema real. No asumas librerías, endpoints ni tablas sin verificar. Mantén el módulo opcional por empresa y valida permisos en servidor. Empieza por la fase 0 y luego implementa la fase 1 como un incremento funcional con persistencia real, migraciones y UI. Conserva el POS operativo. Registra pendientes del resto de fases y continúa en orden cuando se solicite. Usa WhatsApp manual en el MVP; no simules envíos automáticos ni estados de entrega. Protege enlaces y archivos, evita doble reserva y doble consumo, y registra el historial de cambios. Prueba los escenarios críticos relevantes para cada fase. Al terminar el incremento, indica qué cambió, cómo se verificó y qué falta. Si una decisión no bloqueante está ausente, usa el valor propuesto en este documento y deja constancia; pregunta únicamente por bloqueos reales.

## 14. Fuentes técnicas consultadas

- Twilio, conceptos de WhatsApp y ventana de atención: https://www.twilio.com/docs/whatsapp/key-concepts
- Twilio, notificaciones con plantillas: https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates
- OWASP, propiedades de tokens seguros: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html

La guía OWASP se refiere a recuperación de contraseñas; aquí se adaptan sus principios de tokens aleatorios, expiración y uso limitado a enlaces de acciones. El alcance del módulo y las políticas académicas son recomendaciones de diseño, no requisitos de esas fuentes.
