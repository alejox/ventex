import "server-only";
import {
  buildSessionPayload,
  pickRelevantTransaction,
  type EpaycoSecrets,
  type EpaycoSessionParams,
  type TransactionRow,
} from "@/services/epayco-protocol";

/**
 * Cliente de ePayco (ApiFy + Smart Checkout).
 *
 * Sólo el I/O: todo lo puro —firma de la confirmación, códigos de respuesta,
 * armado del payload— vive en `epayco-protocol.ts` y está testeado sin red.
 *
 * Tres cosas que definen el flujo:
 *  - **Autenticación en dos pasos.** `POST /login` con Basic
 *    `PUBLIC_KEY:PRIVATE_KEY` devuelve un JWT de vida corta que hay que mandar
 *    como Bearer en todo lo demás; por eso hay cache de token acá abajo.
 *  - **El checkout NO devuelve una URL.** `POST /payment/session/create` da un
 *    `sessionId` que sólo consume `checkout-v2.js` en el navegador. Donde antes
 *    hacíamos `window.location = redirect_url`, ahora el cliente monta el
 *    script. Por eso `/api/billing/subscribe` devuelve sessionId, no URL.
 *  - **Cuatro secretos, no dos.** PUBLIC/PRIVATE_KEY son del API; la
 *    confirmación se firma con P_CUST_ID_CLIENTE y P_KEY, que son otros.
 *
 * Contrato verificado contra la colección real de la API
 * (`https://api.epayco.co/api/collections/5378697/T1DtfG34`). La documentación
 * narrativa y el `epayco-sdk-node` describen una generación anterior.
 */

const API_BASE = "https://apify.epayco.co";

const PUBLIC_KEY = process.env.EPAYCO_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.EPAYCO_PRIVATE_KEY ?? "";
const P_CUST_ID_CLIENTE = process.env.EPAYCO_P_CUST_ID_CLIENTE ?? "";
const P_KEY = process.env.EPAYCO_P_KEY ?? "";

/**
 * Modo de prueba. El default es `test` a propósito: un deploy sin configurar no
 * puede cobrarle plata real a nadie.
 *
 * ePayco NO tiene host de sandbox: el mismo `apify.epayco.co` atiende prueba y
 * producción, y el modo lo determinan las llaves más el flag `test` que se le
 * pasa al checkout EN EL NAVEGADOR. Por eso este valor viaja al cliente.
 */
export const EPAYCO_TEST_MODE = process.env.EPAYCO_MODE !== "production";

export const EPAYCO_CONFIGURED = Boolean(
  PUBLIC_KEY && PRIVATE_KEY && P_CUST_ID_CLIENTE && P_KEY,
);

/** Las credenciales con las que se verifica la firma del webhook. */
export function epaycoSecrets(): EpaycoSecrets {
  return { custIdCliente: P_CUST_ID_CLIENTE, pKey: P_KEY };
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Envoltorio con el que ApiFy contesta casi todo. */
interface ApifyEnvelope<T> {
  success?: boolean;
  titleResponse?: string;
  textResponse?: string;
  lastAction?: string;
  data?: T;
  error?: string;
}

export interface EpaycoSession {
  sessionId: string;
  token: string;
}

/**
 * Transacción leída con `POST /payment/transaction`.
 *
 * La colección no trae un ejemplo de respuesta guardado, así que los campos van
 * opcionales y con passthrough: NO inventamos un mapeo que no pudimos
 * verificar. Antes de que el polling confíe en esto hay que confirmar la forma
 * real contra sandbox.
 */
export interface EpaycoTransaction {
  x_ref_payco?: string;
  x_transaction_id?: string;
  x_amount?: string | number;
  x_currency_code?: string;
  x_cod_response?: string | number;
  x_response?: string;
  x_response_reason_text?: string;
  x_id_invoice?: string;
  x_franchise?: string;
  x_test_request?: string;
  [key: string]: unknown;
}

export class EpaycoApiError extends Error {
  code: string | null;
  status: number;

  constructor(message: string, code: string | null = null, status = 502) {
    super(message);
    this.name = "EpaycoApiError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Sesión de API (JWT)
// ---------------------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null;
let loginInFlight: Promise<string> | null = null;

/** Margen contra el desfase de reloj: se renueva un minuto antes de vencer. */
const CLOCK_SKEW_MS = 60_000;
/** Si el `exp` del JWT no se puede leer, se asume esta vida corta. */
const FALLBACK_TTL_MS = 10 * 60_000;

/**
 * Lee el `exp` del JWT en vez de asumir una duración fija.
 *
 * No es paranoia: los ejemplos de la propia colección traen vidas distintas
 * (uno de 20 minutos, otro de una hora). Cachear con un TTL inventado
 * garantizaría 401 intermitentes en producción justo bajo carga.
 */
function expiryFromJwt(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return Date.now() + FALLBACK_TTL_MS;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const exp = Number(decoded?.exp);
    if (!Number.isFinite(exp) || exp <= 0) return Date.now() + FALLBACK_TTL_MS;
    return exp * 1000;
  } catch {
    return Date.now() + FALLBACK_TTL_MS;
  }
}

/**
 * Pide un JWT nuevo.
 *
 * TRAMPA: `/login` contesta **HTTP 200 aunque falle**, con `{"error": "..."}`
 * en lugar de `{"token": "..."}`. Mirar sólo `response.ok` haría que se cachee
 * `undefined` como token y que TODAS las llamadas siguientes fallaran con un
 * 401 que no explica nada. Por eso el token se exige explícitamente.
 */
async function login(): Promise<string> {
  if (!EPAYCO_CONFIGURED) {
    throw new EpaycoApiError(
      "Falta configurar las llaves de ePayco.",
      "not_configured",
      500,
    );
  }

  const basic = Buffer.from(`${PUBLIC_KEY}:${PRIVATE_KEY}`).toString("base64");

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new EpaycoApiError(
      error instanceof Error && error.name === "TimeoutError"
        ? "ePayco no respondió a tiempo."
        : "No pudimos conectar con ePayco.",
      "network",
      504,
    );
  }

  const parsed = await readJson<{ token?: string; error?: string }>(response);

  if (!response.ok || !parsed?.token) {
    throw new EpaycoApiError(
      parsed?.error ?? `ePayco rechazó la autenticación (HTTP ${response.status}).`,
      "auth",
      502,
    );
  }

  return parsed.token;
}

/** Devuelve un JWT válido, reusando el cacheado y sin permitir estampidas. */
async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - CLOCK_SKEW_MS > Date.now()) {
    return cachedToken.value;
  }

  // Sin este candado, N requests concurrentes disparan N logins y se pisan el
  // cache entre sí.
  loginInFlight ??= login()
    .then((token) => {
      cachedToken = { value: token, expiresAt: expiryFromJwt(token) };
      return token;
    })
    .finally(() => {
      loginInFlight = null;
    });

  return loginInFlight;
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

/** ApiFy no siempre contesta JSON: un 502 del borde puede venir en HTML. */
async function readJson<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  body: unknown,
  { retryOnAuth = true }: { retryOnAuth?: boolean } = {},
): Promise<T> {
  const token = await accessToken();

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new EpaycoApiError(
      error instanceof Error && error.name === "TimeoutError"
        ? "ePayco no respondió a tiempo."
        : "No pudimos conectar con ePayco.",
      "network",
      504,
    );
  }

  // El JWT pudo vencer entre que se leyó del cache y llegó el request. Se
  // reintenta UNA vez con token nuevo; si vuelve a fallar, es credencial mala y
  // reintentar sólo esconde el problema.
  if ((response.status === 401 || response.status === 403) && retryOnAuth) {
    cachedToken = null;
    return request<T>(path, body, { retryOnAuth: false });
  }

  const parsed = await readJson<ApifyEnvelope<T>>(response);

  if (!response.ok) {
    throw new EpaycoApiError(
      parsed?.textResponse ?? parsed?.error ?? `ePayco rechazó la operación (HTTP ${response.status}).`,
      parsed?.titleResponse ?? null,
      response.status,
    );
  }

  // Igual que `/login`, ApiFy puede contestar 200 con `success: false`. Un 200
  // no alcanza para dar la operación por buena.
  if (parsed?.success === false || parsed?.error) {
    throw new EpaycoApiError(
      parsed.textResponse ?? parsed.error ?? "ePayco rechazó la operación.",
      parsed.titleResponse ?? null,
      502,
    );
  }

  if (!parsed?.data) {
    throw new EpaycoApiError("ePayco devolvió una respuesta vacía.", "empty", 502);
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * Crea la sesión de Smart Checkout.
 *
 * Devuelve un `sessionId`, NO una URL: quien lo abre es `checkout-v2.js` en el
 * navegador. No se fija `methodsDisable`, así quedan habilitados todos los
 * medios del comercio (PSE, Nequi, tarjeta, efectivo) en un solo flujo.
 */
export async function createSession(
  params: EpaycoSessionParams,
): Promise<EpaycoSession> {
  const data = await request<{ sessionId?: string; token?: string }>(
    "/payment/session/create",
    buildSessionPayload(params),
  );

  if (!data.sessionId) {
    throw new EpaycoApiError("ePayco no devolvió la sesión del checkout.", "no_session", 502);
  }

  return { sessionId: data.sessionId, token: data.token ?? "" };
}

/**
 * Relee una transacción por su `referencePayco`.
 *
 * Sostiene el principio de **no le creas a la notificación, releé el pago**.
 * Sólo sirve cuando la referencia ya se conoce — o sea, después de la primera
 * observación. Para reconciliar SIN conocerla está `findTransactionByReference`.
 */
export function getTransaction(referencePayco: string): Promise<EpaycoTransaction> {
  return request<EpaycoTransaction>("/payment/transaction", {
    referencePayco: String(referencePayco),
  });
}

/**
 * Busca la transacción de una orden por NUESTRA referencia (el `invoice` que se
 * mandó al crear la sesión, que es `billing_orders.order_id`).
 *
 * Esto es lo que salva el flujo. `x_ref_payco` nace recién cuando alguien paga,
 * así que sin este endpoint la única forma de enterarse sería el webhook: una
 * notificación perdida dejaría el pago cobrado y la licencia sin activar, para
 * siempre. Consultando por nuestra propia referencia el pago se resuelve igual.
 *
 * Dos cosas verificadas contra la API real, porque ninguna era obvia:
 *  - **Va por POST.** La colección lo declara `GET` con cuerpo, y `fetch` no
 *    permite cuerpo en GET (`Request with GET/HEAD method cannot have body`).
 *  - **El filtro `referenceClient` SÍ se aplica**: con una referencia existente
 *    devuelve su fila y con una inventada devuelve cero. No es decorativo.
 *
 * El rango de fechas es obligatorio en la práctica, así que se manda uno amplio:
 * el filtro que discrimina es la referencia.
 */
export async function findTransactionByReference(
  reference: string,
): Promise<TransactionRow | null> {
  const data = await request<{ data?: TransactionRow[] }>("/transaction", {
    filter: {
      transactionInitialDate: "2020-01-01 00:00:00",
      transactionEndDate: "2100-01-01 00:00:00",
      referenceClient: reference,
    },
    pagination: { page: 1, limit: 50 },
  });

  return pickRelevantTransaction(data.data ?? []);
}

/** Sólo para tests de integración: obliga a pedir un JWT nuevo. */
export function resetEpaycoSession(): void {
  cachedToken = null;
  loginInFlight = null;
}
