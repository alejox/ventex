/**
 * Mensaje legible para el usuario a partir de lo que sea que se haya lanzado.
 *
 * Existe porque la versión que había duplicada en cada store —`e instanceof
 * Error ? e.message : "Ocurrió un error inesperado"`— tapaba justo los errores
 * que más importan: los de Supabase (`PostgrestError`) son objetos planos
 * `{ message, details, hint, code }`, NO instancias de `Error`. Resultado: cada
 * fallo de la base aparecía como "Ocurrió un error inesperado" y había que
 * abrir la consola para saber qué pasó.
 *
 * También traduce los errores que levantan los guards de permisos, que llegan
 * con el prefijo `SIN_PERMISO:` desde las policies y funciones de Postgres.
 */
/**
 * Mensaje legible para los errores de Supabase Auth.
 *
 * Existe aparte de `toMessage` porque GoTrue devuelve texto en inglés y códigos
 * propios (`over_email_send_rate_limit`, `otp_expired`, …) que el usuario final
 * no puede interpretar. El caso más frecuente es el límite de envío: sin
 * traducirlo, la pantalla de "restablecer contraseña" muestra un mensaje en
 * inglés que parece un error del sistema cuando en realidad solo hay que
 * esperar unos segundos.
 */
export function authMessage(e: unknown): string {
  const code =
    e && typeof e === "object" ? (e as { code?: unknown }).code : undefined;
  const raw =
    typeof e === "string"
      ? e
      : e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string"
        ? ((e as { message: string }).message)
        : "";

  // "For security purposes, you can only request this after 43 seconds."
  const cooldown = /after (\d+) seconds?/i.exec(raw);
  if (code === "over_email_send_rate_limit" || cooldown) {
    return cooldown
      ? `Por seguridad, espera ${cooldown[1]} segundos antes de pedir otro enlace.`
      : "Se alcanzó el límite de correos. Espera unos minutos e intenta de nuevo.";
  }

  if (code === "otp_expired" || /expired|invalid.*(token|link)|token not found/i.test(raw)) {
    return "El enlace ya se usó o venció. Pide uno nuevo.";
  }

  if (code === "same_password" || /should be different from the old/i.test(raw)) {
    return "La contraseña nueva tiene que ser distinta de la anterior.";
  }

  if (code === "weak_password" || /password should be at least/i.test(raw)) {
    return "La contraseña es muy corta. Usa al menos 6 caracteres.";
  }

  if (/auth session missing|session_not_found/i.test(raw)) {
    return "La sesión de recuperación no es válida. Pide un enlace nuevo.";
  }

  if (/failed to fetch|network/i.test(raw)) {
    return "No pudimos conectar con el servidor. Revisa tu conexión.";
  }

  return toMessage(e);
}

/**
 * Firmas de "no llegué al servidor" en los tres motores. Cada navegador
 * redacta el fallo de `fetch` a su manera y hay que cubrir los tres: Chrome
 * dice "Failed to fetch", Firefox "NetworkError when attempting to fetch
 * resource" y Safari —el de las tablets del salón— simplemente "Load failed".
 */
const NETWORK_FAILURE =
  /failed to fetch|networkerror|network request failed|load failed|fetch failed|internet connection appears to be offline|err_internet_disconnected/i;

/**
 * Si el error es "no llegué al servidor" y no "el servidor me dijo que no".
 *
 * La distinción decide si una venta se puede encolar para reenviarla. Y la
 * asimetría del riesgo es fuerte, así que ante la duda esta función devuelve
 * FALSE:
 *
 * - Tratar un rechazo del servidor como fallo de red encola una venta que no
 *   va a entrar nunca. El cajero cree que cobró, entrega la mercadería y el
 *   descuadre aparece horas después. Es el error caro.
 * - Tratar un fallo de red como rechazo solo muestra un error y el cajero
 *   reintenta. Desde que `create_sale` es idempotente, ese reintento es gratis
 *   incluso si la venta sí había entrado: devuelve la misma. Es el error barato.
 *
 * Por eso el criterio es "confirmá que fue la red", no "descartá que fue el
 * servidor". Un timeout o un error raro caen del lado del reintento.
 */
export function isNetworkError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;

  // Todo error de Postgres viaja con su SQLSTATE ('P0001' para los `raise
  // exception` de create_sale, '23505' para el índice único, '42501' para la
  // RLS...). Si hay código, el servidor contestó: no fue la red, sin importar
  // lo que diga el mensaje. Va primero por eso.
  const code = (e as { code?: unknown }).code;
  if (typeof code === "string" && code.trim() !== "") return false;

  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;

  const message = (e as { message?: unknown }).message;
  return typeof message === "string" && NETWORK_FAILURE.test(message);
}

/**
 * Si el servidor rechazó la venta de forma DEFINITIVA.
 *
 * Sirve para decidir si una venta encolada se sigue reintentando o se manda a
 * la bandeja de conflictos. Solo devuelve true con códigos que no cambian por
 * reintentar:
 *
 * - `P0001`: los `raise exception` de `create_sale` (STOCK_INSUFICIENTE, tope
 *   del plan, cupo de crédito, turno cerrado).
 * - clase `23`: violaciones de restricción.
 * - clase `42`: permisos y RLS.
 *
 * Lo que queda afuera importa tanto como lo que entra. Un `PGRST301` (JWT
 * vencido) o un 5xx traen código pero SÍ pueden andar en el próximo intento, y
 * marcarlos como definitivos perdería ventas cobradas.
 */
export function isBusinessRejection(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: unknown }).code;
  if (typeof code !== "string") return false;
  return code === "P0001" || code.startsWith("23") || code.startsWith("42");
}

export function toMessage(e: unknown): string {
  if (typeof e === "string" && e.trim()) return e;

  if (e && typeof e === "object") {
    const raw = (e as { message?: unknown }).message;
    if (typeof raw === "string" && raw.trim()) {
      // `create_sale` con descuento manual de un trabajador sin `pos_discount`.
      // Va antes del `SIN_PERMISO:` genérico: no lleva los dos puntos y el
      // código crudo no le dice nada al cajero.
      if (/^SIN_PERMISO_DESCUENTO\b/.test(raw)) {
        return "No tienes permiso para aplicar descuentos manuales. Quita el descuento o pídele al dueño que active “Aplicar descuentos” en Personal → Permisos.";
      }
      // `create_sale`: un trabajador sin `pos_discount` mandó más descuento del
      // que justifican las ofertas, el premio y los puntos del cliente.
      if (/^DESCUENTO_NO_JUSTIFICADO\b/.test(raw)) {
        return "El descuento de esta venta es mayor que el de las ofertas, el premio y los puntos del cliente, y no tienes permiso para descuentos manuales. Quita el descuento o pídele al dueño que lo autorice.";
      }
      // `create_sale` con un cliente que no es de este negocio (o se borró).
      if (/^CLIENTE_NO_ENCONTRADO\b/.test(raw)) {
        return "El cliente de la venta ya no existe en este negocio. Elige otro cliente o cobra sin cliente.";
      }
      // `void_sale` (trigger de crédito): el fiado ya se abonó en parte o todo.
      if (/^CREDITO_YA_ABONADO\b/.test(raw)) {
        return "No se puede anular: el cliente ya abonó parte o todo este fiado, y anularla borraría esos pagos de su cuenta. Resuelve primero la devolución de lo que pagó y luego anula la venta.";
      }
      // `settle_commissions` con lista de inclusión: lo pendiente cambió entre
      // que se abrió el modal y se confirmó. El modal recarga el detalle.
      if (/^LIQUIDACION_CAMBIO\b/.test(raw)) {
        return "Las comisiones pendientes cambiaron mientras revisabas (una venta nueva o una línea ya pagada). Actualizamos el detalle: revísalo y vuelve a confirmar.";
      }
      // Guard de `expenses`: un gasto nacido de un retiro de caja.
      if (/^GASTO_DE_RETIRO\b/.test(raw)) {
        return "Este gasto viene de un retiro de caja: el monto y la fecha no se pueden cambiar. Solo puedes editar la descripción y la categoría.";
      }
      if (/^GASTO_VINCULADO\b/.test(raw)) {
        return "Los gastos de una liquidación o de un retiro de caja solo los crea el sistema.";
      }
      // ---- Clientes, abonos y caja (migraciones 20261007110000–20261007119999) ----
      // Guard de `customers`: cupo y exención de IVA son del dueño.
      if (/^CLIENTE_CAMPO_DE_DUENO\b/.test(raw)) {
        return "Solo el dueño del negocio puede asignar o cambiar el cupo de crédito y la exención de IVA de un cliente.";
      }
      if (/^CLIENTE_SOLO_DUENO\b/.test(raw)) {
        return "Solo el dueño del negocio puede eliminar clientes.";
      }
      if (/^CLIENTE_CON_SALDO\b/.test(raw)) {
        return "No puedes eliminar a este cliente: tiene saldo de fiado pendiente. Cobra o resuelve el saldo primero.";
      }
      // `register_customer_payment`: un trabajador cobra en efectivo sin turno.
      if (/^ABONO_SIN_TURNO\b/.test(raw)) {
        return "Para recibir un abono en efectivo tienes que abrir tu turno de caja primero. Ábrelo en el Punto de venta o elige otro medio de pago.";
      }
      if (/^ABONO_ID_REPETIDO\b/.test(raw)) {
        return "Este abono ya se había registrado con otro monto. Cierra la ventana, revisa el saldo del cliente y vuelve a registrarlo si hace falta.";
      }
      if (/^METODO_DE_PAGO_INVALIDO\b/.test(raw)) {
        return "Elige un medio de pago válido para el abono.";
      }
      // --- Compras y pedidos de compra (migraciones 20261007120000-120200) ---
      const purchaseMessage = purchaseErrorMessage(raw);
      if (purchaseMessage) return purchaseMessage;
      // `SIN_PERMISO: no tenés permiso para X` → `No tenés permiso para X`
      const withoutTag = raw.replace(/^SIN_PERMISO:\s*/i, "");
      const clean = withoutTag === raw ? raw : withoutTag.charAt(0).toUpperCase() + withoutTag.slice(1);

      // La RLS rechaza sin explicar; el mensaje crudo no le dice nada a nadie.
      if (/row-level security|permission denied/i.test(clean)) {
        return "No tienes permiso para hacer esto.";
      }
      return clean;
    }
  }

  return "Ocurrió un error inesperado";
}

/**
 * Compras (`invoices.type = 'compra'`) y pedidos de compra: códigos que
 * levantan `save_purchase_invoice`, `receive_purchase_order` y los guards de
 * `invoices` / `invoice_items`. Bloque aparte para no mezclarlo con ventas.
 */
const PURCHASE_ERRORS: [RegExp, string][] = [
  [/^DESCUENTO_COMPRA_INVALIDO\b/, "El descuento no puede ser negativo ni mayor que el subtotal de la compra."],
  [/^TASA_IVA_INVALIDA\b/, "La tasa de IVA de la compra no es válida."],
  [/^ESTADO_COMPRA_INVALIDO\b/, "Una compra solo puede quedar como Pagada o Pendiente. Para anularla usa la acción Anular."],
  [/^COMPRA_SIN_LINEAS\b/, "Agrega al menos un producto a la compra."],
  [/^LINEA_COMPRA_INVALIDA\b/, "Una línea de la compra tiene cantidades o costos inválidos. Revísala y vuelve a guardar."],
  [/^PROVEEDOR_NO_ENCONTRADO\b/, "El proveedor ya no existe en este negocio. Elige otro."],
  [/^COMPRA_ANULAR_CON_ACCION\b/, "Para anular una compra usa la acción Anular: así se devuelve el stock."],
  [/^COMPRA_ANULADA\b/, "Esta compra está anulada y no se puede reactivar. Si la necesitas, registra una compra nueva."],
  [/^COMPRA_NO_SE_BORRA\b/, "Una compra con productos no se borra. Anúlala para devolver el stock."],
  [/^COMPRA_LINEAS_POR_RPC\b/, "Los productos de una compra solo se cambian editando la compra."],
  [/^COMPRA_TIPO_FIJO\b/, "Una compra no se puede convertir en otro tipo de documento."],
  [/^PEDIDO_NO_EMITIDO\b/, "Este pedido ya no está pendiente: solo se recibe un pedido emitido. Actualiza la lista."],
  [/^PEDIDO_SIN_PROVEEDOR\b/, "Asigna un proveedor al pedido antes de recibirlo."],
  [/^PEDIDO_SIN_PRODUCTOS\b/, "El pedido no tiene productos del catálogo para ingresar al inventario."],
  [/^PEDIDO_NO_ENCONTRADO\b/, "No encontramos este pedido. Actualiza la lista."],
];

function purchaseErrorMessage(raw: string): string | null {
  for (const [pattern, message] of PURCHASE_ERRORS) {
    if (pattern.test(raw)) return message;
  }
  return null;
}
