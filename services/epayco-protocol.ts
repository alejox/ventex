import { createHash, timingSafeEqual } from "crypto";

/**
 * Protocolo de ePayco: las partes PURAS, sin red y sin `server-only`.
 *
 * Están acá y no dentro de `epayco.service.ts` para que se puedan testear sin
 * base ni HTTP (`tests/epayco-protocol.test.ts`). Lo que vive acá es lo que se
 * rompe en silencio si se toca mal: la firma de la confirmación, el mapeo de
 * códigos de respuesta y el armado del payload de la sesión de checkout.
 *
 * Contrato verificado contra la colección real de la API
 * (`https://api.epayco.co/api/collections/5378697/T1DtfG34`), no contra la
 * documentación narrativa: las dos se contradicen en varios puntos.
 */

export const EPAYCO_CURRENCY = "COP";
export const EPAYCO_COUNTRY = "CO";
export const EPAYCO_MERCHANT_NAME = "Ventex";
export const EPAYCO_CALLING_CODE = "+57";

/** ePayco corta `description` en 255; recortamos nosotros para no depender. */
const DESCRIPTION_MAX = 255;
const DEFAULT_DESCRIPTION = "Suscripción Ventex";

// ---------------------------------------------------------------------------
// Confirmación (webhook)
// ---------------------------------------------------------------------------

/**
 * Las dos credenciales de la CONFIRMACIÓN. Ojo: no son las mismas con las que
 * se pide el JWT en `/login`. ePayco usa cuatro secretos en total —
 * PUBLIC_KEY/PRIVATE_KEY para el API, y estas dos para firmar el webhook.
 */
export interface EpaycoSecrets {
  custIdCliente: string;
  pKey: string;
}

/**
 * Lo que ePayco POSTea a la URL de confirmación. TODOS los valores llegan como
 * texto y así se firman: ver `verifyConfirmation`.
 */
export interface ConfirmationFields {
  x_ref_payco: string;
  x_transaction_id: string;
  x_amount: string;
  x_currency_code: string;
  x_signature: string;
  /**
   * El código de estado llega con UNO DE ESTOS DOS NOMBRES. No es una variante
   * histórica: la misma página de la documentación oficial los usa
   * indistintamente. Leer siempre por `confirmationCode`, nunca directo.
   */
  x_cod_response?: string;
  x_cod_transaction_state?: string;
  x_id_invoice?: string;
  x_id_factura?: string;
  x_test_request?: string;
  x_response?: string;
  x_response_reason_text?: string;
  x_franchise?: string;
  x_extra1?: string;
  [key: string]: string | undefined;
}

const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * `sha256(p_cust_id_cliente ^ p_key ^ x_ref_payco ^ x_transaction_id ^ x_amount ^ x_currency_code)`
 * con `^` literal como separador.
 *
 * Los seis valores entran TAL CUAL llegaron: `x_amount` llega como "20000.00" y
 * normalizarlo a "20000" rompe el hash aunque el monto sea idéntico.
 */
export function signConfirmation(
  fields: ConfirmationFields,
  secrets: EpaycoSecrets,
): string {
  return createHash("sha256")
    .update(
      [
        secrets.custIdCliente,
        secrets.pKey,
        fields.x_ref_payco,
        fields.x_transaction_id,
        fields.x_amount,
        fields.x_currency_code,
      ].join("^"),
      "utf8",
    )
    .digest("hex");
}

/**
 * Verifica que la confirmación venga de ePayco y no haya sido manipulada.
 *
 * Lo que NO prueba: que el pago esté aprobado. La firma cubre referencia,
 * transacción, monto y moneda — no el estado. Quien llame tiene que mirar
 * `confirmationOutcome` aparte, y contrastar el monto contra la orden.
 */
export function verifyConfirmation(
  fields: ConfirmationFields,
  secrets: EpaycoSecrets,
): boolean {
  // Sin secretos no se valida nada: un deploy a medio configurar no puede
  // aceptar confirmaciones "porque sí".
  if (!secrets.custIdCliente || !secrets.pKey) return false;

  const received = (fields.x_signature ?? "").trim();
  if (!SIGNATURE_PATTERN.test(received)) return false;

  const expected = signConfirmation(fields, secrets);
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

/** `x_test_request` viene como "TRUE"/"FALSE" en texto. */
export function isTestTransaction(fields: ConfirmationFields): boolean {
  return (fields.x_test_request ?? "").trim().toUpperCase() === "TRUE";
}

// ---------------------------------------------------------------------------
// Códigos de respuesta
// ---------------------------------------------------------------------------

export type EpaycoOutcome = "paid" | "failed" | "pending" | "reversed";

/**
 * Extrae el código de estado sin importar con cuál de los dos nombres llegó.
 *
 * `x_cod_response` gana cuando están los dos. Devuelve "" si no vino ninguno,
 * que `confirmationOutcome` traduce a "pending" — nunca a acreditado.
 */
export function confirmationCode(fields: ConfirmationFields): string {
  const primary = (fields.x_cod_response ?? "").trim();
  if (primary) return primary;
  return (fields.x_cod_transaction_state ?? "").trim();
}

/**
 * Mapea `x_cod_response` a lo que Ventex tiene que hacer con la orden.
 *
 * Tres decisiones que no son obvias:
 *  - **7 (Retenido)** queda PENDIENTE. Es validación antifraude, fácil de
 *    confundir con un pago: acreditarlo entrega la licencia antes de que la
 *    plata esté firme.
 *  - **6 (Reversada)** tiene su propio valor. Es una devolución sobre algo YA
 *    acreditado: no es "failed" (eso diría que el cobro nunca entró) ni "paid".
 *  - **Lo desconocido queda pendiente.** Falla cerrado: si ePayco agrega un
 *    código, el default no puede ser regalar la licencia.
 */
export function confirmationOutcome(code: string | number | null | undefined): EpaycoOutcome {
  switch (String(code ?? "").trim()) {
    case "1": // Aceptada
      return "paid";
    case "2": // Rechazada
    case "4": // Fallida
    case "9": // Caducada (efectivo / SafetyPay)
    case "10": // Abandonada
    case "11": // Cancelada
      return "failed";
    case "6": // Reversada
      return "reversed";
    case "3": // Pendiente (PSE puede tardar 20 min)
    case "7": // Retenido (validación antifraude)
    case "8": // Iniciada
      return "pending";
    default:
      return "pending";
  }
}

/**
 * Traduce el estado que devuelve el LISTADO de transacciones
 * (`POST /transaction`), que habla en texto —"Aceptada", "Cancelada"— y no en
 * los códigos numéricos de la confirmación.
 *
 * Son dos vocabularios para lo mismo y por eso hay dos funciones: pasarle
 * `"Aceptada"` a `confirmationOutcome` devolvería "pending" para siempre, y el
 * polling nunca cerraría un pago aprobado. Un solo mapa con las dos entradas
 * mezcladas sería peor: escondería que son dos contratos distintos que ePayco
 * puede mover por separado.
 *
 * Se normalizan mayúsculas y acentos porque el valor es texto para humanos:
 * atarlo a la grafía exacta es apostar a que nunca le agreguen una tilde.
 */
export function outcomeFromStatusText(text: string | null | undefined): EpaycoOutcome {
  const normalized = String(text ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  switch (normalized) {
    case "aceptada":
      return "paid";
    case "rechazada":
    case "fallida":
    case "caducada":
    case "abandonada":
    case "cancelada":
      return "failed";
    case "reversada":
      return "reversed";
    case "pendiente":
    case "retenido":
    case "retenida":
    case "iniciada":
    // Observado en sandbox y NO documentado en la lista de estados: Daviplata
    // deja la transacción en "pre-procesada / Esperando generación de OTP"
    // mientras el pagador no confirma. Cayó igual en el default —que es el
    // punto de fallar cerrado—, pero queda explícito para que se lea como
    // conocido y no como un agujero.
    case "pre-procesada":
    case "preprocesada":
      return "pending";
    default:
      return "pending";
  }
}

// ---------------------------------------------------------------------------
// Cruce del monto
// ---------------------------------------------------------------------------

/**
 * ¿El monto que informa ePayco es el que esta orden tenía que cobrar?
 *
 * Es una pregunta DISTINTA de la firma. La firma prueba que nadie tocó el
 * monto en tránsito; esto prueba que el monto es el correcto PARA ESTA ORDEN.
 * Sin este cruce, una confirmación legítima de un pago de $5.000 podría activar
 * un plan de $200.000 si alguien logra asociarla a otra orden.
 *
 * Se compara en centavos enteros: `Number("49900.00") === 49900` es cierto,
 * pero con decimales de por medio la igualdad flotante deja de ser confiable.
 */
export function amountMatches(
  received: string | number | null | undefined,
  expected: number,
): boolean {
  const raw = String(received ?? "").trim();
  if (!raw) return false;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return false;
  if (!Number.isFinite(expected)) return false;

  return Math.round(parsed * 100) === Math.round(expected * 100);
}

// ---------------------------------------------------------------------------
// URLs públicas
// ---------------------------------------------------------------------------

/**
 * Normaliza la base pública del sitio para las URLs que se le mandan a ePayco.
 *
 * **ePayco rechaza el hostname literal `localhost`.** Verificado contra la API
 * real: `session/create` devuelve `property Response is not a valid URL` y no
 * crea nada. No es una exigencia de HTTPS —`http://` a un dominio público pasa
 * sin problema— ni de puerto: es el nombre `localhost` puntualmente. Con
 * `127.0.0.1` funciona.
 *
 * Sin esta reescritura el checkout es IMPOSIBLE de levantar en desarrollo, y el
 * error que se ve no menciona a `localhost` por ningún lado.
 *
 * Se reescribe el host EXACTO, no por reemplazo de texto: `localhost.ventex.app`
 * es un dominio real y distinto que no hay que tocar.
 */
export function publicUrlBase(raw: string): string {
  const trimmed = raw.replace(/\/$/, "");
  if (!trimmed) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "localhost") return trimmed;
    url.hostname = "127.0.0.1";
    return url.toString().replace(/\/$/, "");
  } catch {
    // Una base ilegible se devuelve tal cual: mejor que ePayco la rechace con
    // su mensaje a que esto tire una excepción dentro de la ruta de cobro.
    return trimmed;
  }
}

// ---------------------------------------------------------------------------
// Elección de transacción en el listado
// ---------------------------------------------------------------------------

/** Fila del listado `POST /transaction` (subconjunto que usa Ventex). */
export interface TransactionRow {
  referencePayco?: string | number;
  referenceClient?: string;
  amount?: string | number;
  currency?: string;
  status?: string;
  response?: string;
  paymentMethod?: string;
  franchise?: string;
  transactionDateTime?: string;
  test?: boolean;
  [key: string]: unknown;
}

/**
 * Elige qué transacción representa a la orden cuando el listado devuelve varias
 * para el mismo `referenceClient`.
 *
 * Pasa de verdad: si alguien abandona el checkout y vuelve a intentar sobre la
 * misma orden, quedan una "Cancelada" y una "Aceptada" con el mismo invoice.
 *
 * **Un pago aprobado gana siempre, sin importar el orden ni la fecha.** Tomar
 * "la más reciente" a secas dejaría sin acreditar a quien pagó y después abrió
 * el checkout de nuevo por curiosidad: la cancelación posterior es más nueva,
 * pero la plata ya entró. Entre no aprobadas sí manda la más reciente, que es
 * la que mejor describe en qué terminó el intento.
 */
export function pickRelevantTransaction(rows: TransactionRow[]): TransactionRow | null {
  if (!rows.length) return null;

  const paid = rows.filter((row) => outcomeFromStatusText(row.status) === "paid");
  const pool = paid.length ? paid : rows;

  return pool.reduce((best, row) => {
    const a = String(row.transactionDateTime ?? "");
    const b = String(best.transactionDateTime ?? "");
    return a > b ? row : best;
  });
}

// ---------------------------------------------------------------------------
// Sesión de checkout (`POST /payment/session/create`)
// ---------------------------------------------------------------------------

export interface EpaycoPayer {
  name: string;
  email: string;
  document: string;
  documentType: string;
  phone?: string;
}

export interface EpaycoSessionParams {
  amount: number;
  /** `billing_orders.order_id`, el legible. Viaja como `invoice`. */
  orderId: string;
  /** `billing_orders.id` (uuid). Viaja en `extras.extra1`. */
  orderUuid: string;
  description: string;
  confirmationUrl: string;
  responseUrl: string;
  payer: EpaycoPayer;
}

export interface EpaycoSessionPayload {
  checkout_version: "2";
  name: string;
  currency: string;
  amount: number;
  country: string;
  lang: "ES";
  description?: string;
  invoice: string;
  confirmation: string;
  response: string;
  method: "POST";
  extras?: Record<string, string>;
  billing?: {
    email: string;
    name: string;
    typeDoc: string;
    numberDoc: string;
    callingCode: string;
    mobilePhone?: string;
    address?: string;
  };
}

/**
 * Arma el cuerpo de la sesión de checkout.
 *
 * La orden viaja DOS veces a propósito: `invoice` lleva el `order_id` legible
 * (es lo que vuelve en `x_id_invoice` y lo que ve el pagador en el comprobante)
 * y `extras.extra1` lleva el uuid, que es por donde el webhook resuelve la fila
 * por clave primaria. Con una sola de las dos, conciliar obliga a un LIKE sobre
 * texto o a exponer el uuid en el comprobante.
 */
export function buildSessionPayload(params: EpaycoSessionParams): EpaycoSessionPayload {
  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Monto inválido para el checkout de ePayco: ${params.amount}`);
  }

  const description =
    params.description.trim().slice(0, DESCRIPTION_MAX) || DEFAULT_DESCRIPTION;
  const phone = (params.payer.phone ?? "").trim();

  return {
    checkout_version: "2",
    name: EPAYCO_MERCHANT_NAME,
    currency: EPAYCO_CURRENCY,
    amount,
    country: EPAYCO_COUNTRY,
    lang: "ES",
    description,
    invoice: params.orderId,
    confirmation: params.confirmationUrl,
    response: params.responseUrl,
    // La confirmación tiene que llegar por POST: con GET los valores viajan en
    // la query y el hash se calcula sobre lo mismo, pero se pierden los campos
    // largos que ePayco recorta en la URL.
    method: "POST",
    extras: { extra1: params.orderUuid },
    billing: {
      email: params.payer.email,
      name: params.payer.name,
      typeDoc: params.payer.documentType,
      numberDoc: params.payer.document,
      callingCode: EPAYCO_CALLING_CODE,
      ...(phone ? { mobilePhone: phone } : {}),
    },
  };
}
