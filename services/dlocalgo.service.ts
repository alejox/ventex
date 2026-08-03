import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Cliente de dLocal **Go** (no del API Payins/Direct: son productos distintos).
 *
 * Diferencias que definen todo el flujo de cobro de Ventex:
 *  - Autenticación: `Authorization: Bearer <API_KEY>:<SECRET_KEY>`, sin firmar
 *    cada request (Payins usaba HMAC sobre X-Login + X-Date + body).
 *  - El checkout es HOSTEADO: `POST /v1/payments` devuelve `redirect_url` y el
 *    pagador elige el medio allá (Nequi, PSE, tarjeta, efectivo). Por eso acá no
 *    hay tokenización de tarjeta ni datos de tarjeta tocando nuestro servidor.
 *  - La notificación trae SOLO `{ "payment_id": "DP-…" }`: hay que releer el
 *    pago con `getPayment` para conocer el estado. Ver `verifyNotification`.
 *  - Las renovaciones se cobran con el `merchant_checkout_token` del primer
 *    pago (`POST /v1/payments/recurring/{token}`), que es lo que reemplaza al
 *    enrollment de Nequi y al card_id de Payins.
 *
 * Sandbox vs producción se elige con `DLOCAL_ENV` y cada entorno usa SU par de
 * llaves. El default es sandbox a propósito: un deploy sin configurar no puede
 * cobrarle plata real a nadie.
 */

const IS_PRODUCTION = process.env.DLOCAL_ENV === "production";

const API_BASE = IS_PRODUCTION
  ? "https://api.dlocalgo.com"
  : "https://api-sbx.dlocalgo.com";

const API_KEY =
  (IS_PRODUCTION ? process.env.DLOCAL_API_KEY : process.env.DLOCAL_SBX_API_KEY) ?? "";
const SECRET_KEY =
  (IS_PRODUCTION ? process.env.DLOCAL_SECRET_KEY : process.env.DLOCAL_SBX_SECRET_KEY) ?? "";

export const DLOCAL_ENV = IS_PRODUCTION ? "production" : "sandbox";
export const DLOCAL_COUNTRY = "CO";
export const DLOCAL_CURRENCY = "COP";
export const DLOCAL_CONFIGURED = Boolean(API_KEY && SECRET_KEY);

/** Identifica al proveedor en `subscriptions.billing_provider`. */
export const DLOCAL_PROVIDER = "dlocalgo";

// ---------------------------------------------------------------------------
// Tipos (subconjunto del API que usa Ventex)
// ---------------------------------------------------------------------------

export type DlocalPaymentStatus =
  | "PENDING"
  | "PAID"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

export interface DlocalPayment {
  id: string;
  amount: number;
  currency: string;
  status: DlocalPaymentStatus | string;
  status_detail?: string;
  order_id?: string;
  description?: string;
  country?: string;
  /** URL del checkout hosteado al que hay que mandar al pagador. */
  redirect_url?: string;
  /** Token reusable para cobrar de nuevo sin pedir los datos otra vez. */
  merchant_checkout_token?: string;
  payment_method_type?: string;
  created_date?: string;
  approved_date?: string;
  card?: { bin?: string; last_four?: string; issuer?: string };
}

export interface DlocalPayer {
  name: string;
  email: string;
  document: string;
  document_type?: string;
  phone?: string;
}

/** Estados que ya no van a cambiar solos. */
const FINAL_REJECTED: ReadonlySet<string> = new Set([
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
]);

export function isRejectedStatus(status: string): boolean {
  return FINAL_REJECTED.has(status.toUpperCase());
}

export function isPaidStatus(status: string): boolean {
  return status.toUpperCase() === "PAID";
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

export class DlocalApiError extends Error {
  code: number | string | null;
  status: number;

  constructor(message: string, code: number | string | null = null, status = 502) {
    super(message);
    this.name = "DlocalApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * dLocal Go contesta los errores como `{ code, message }`, pero no siempre:
 * un 502 del borde puede venir en HTML. Por eso el cuerpo se lee como texto y
 * se intenta parsear, en vez de asumir JSON.
 */
async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  if (!DLOCAL_CONFIGURED) {
    throw new DlocalApiError(
      `Falta configurar las llaves de dLocal Go (${DLOCAL_ENV}).`,
      "not_configured",
      500,
    );
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${API_KEY}:${SECRET_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "dLocal no respondió a tiempo."
        : "No pudimos conectar con dLocal.";
    throw new DlocalApiError(reason, "network", 504);
  }

  const raw = await response.text();
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const data = (parsed ?? {}) as { message?: string; code?: number | string };
    throw new DlocalApiError(
      data.message ?? `dLocal rechazó la operación (HTTP ${response.status}).`,
      data.code ?? null,
      response.status,
    );
  }

  return parsed as T;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * Crea el pago y devuelve el checkout hosteado en `redirect_url`.
 * No se fija `payment_type`: dejar la lista completa es lo que habilita Nequi,
 * PSE, tarjeta y efectivo en un solo flujo.
 */
export function createPayment(params: {
  amount: number;
  orderId: string;
  description: string;
  payer: DlocalPayer;
  notificationUrl: string;
  successUrl: string;
  backUrl: string;
}): Promise<DlocalPayment> {
  return request<DlocalPayment>("POST", "/v1/payments", {
    amount: params.amount,
    currency: DLOCAL_CURRENCY,
    country: DLOCAL_COUNTRY,
    order_id: params.orderId,
    description: params.description.slice(0, 100),
    notification_url: params.notificationUrl,
    success_url: params.successUrl,
    back_url: params.backUrl,
    payer: params.payer,
  });
}

export function getPayment(paymentId: string): Promise<DlocalPayment> {
  return request<DlocalPayment>(
    "GET",
    `/v1/payments/${encodeURIComponent(paymentId)}`,
  );
}

/**
 * Cobro de renovación sobre un token ya autorizado por el pagador.
 * Los campos van en camelCase (`orderId`) porque así los define este endpoint;
 * no es un descuido, difiere del resto del API.
 */
export function chargeRecurring(
  checkoutToken: string,
  params: { amount: number; description: string; orderId: string },
): Promise<DlocalPayment> {
  return request<DlocalPayment>(
    "POST",
    `/v1/payments/recurring/${encodeURIComponent(checkoutToken)}`,
    {
      amount: params.amount,
      description: params.description.slice(0, 100),
      orderId: params.orderId,
    },
  );
}

// ---------------------------------------------------------------------------
// Notificaciones (IPN)
// ---------------------------------------------------------------------------

/**
 * Verifica la firma de una notificación.
 * `Authorization: V2-HMAC-SHA256, Signature: <hex>` donde
 * `hex = HMAC-SHA256(api_key + cuerpo_crudo, secret_key)`.
 *
 * El cuerpo tiene que ser el texto EXACTO recibido: si se parsea y se vuelve a
 * serializar, cualquier diferencia de espacios rompe la firma.
 */
export function verifyNotification(
  authorization: string | null,
  rawBody: string,
): boolean {
  if (!authorization || !DLOCAL_CONFIGURED) return false;

  const match = /Signature\s*:\s*([0-9a-fA-F]+)/.exec(authorization);
  if (!match) return false;

  const expected = createHmac("sha256", SECRET_KEY)
    .update(`${API_KEY}${rawBody}`, "utf8")
    .digest();

  let received: Buffer;
  try {
    received = Buffer.from(match[1], "hex");
  } catch {
    return false;
  }

  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Extrae el `payment_id` de la notificación (es lo único que trae). */
export function notificationPaymentId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as { payment_id?: unknown }).payment_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
