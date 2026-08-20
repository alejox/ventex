/**
 * Cliente del ciclo de pago de la suscripción (ePayco).
 * Solo habla con las rutas `/api/billing/*`: todo el I/O con ePayco ocurre
 * server-side y ningún dato de tarjeta pasa por acá — el checkout es hosteado.
 *
 * Abrir el checkout NO es cosa de este archivo: la sesión se crea acá pero
 * quien la abre es `epayco-checkout.service.ts`, que carga el script de ePayco.
 */

export interface SubscribePayer {
  name: string;
  document: string;
  phone?: string;
}

/**
 * Lo que devuelve crear la sesión de checkout.
 *
 * No hay `redirectUrl`: ePayco entrega un `sessionId` que sólo sabe abrir su
 * propio script en el navegador. `testMode` viene del servidor porque ePayco no
 * tiene host de sandbox — el modo se le pasa al checkout como flag.
 */
export interface SubscribeResult {
  action: "checkout";
  sessionId: string;
  testMode: boolean;
  orderId: string;
}

export type BillingOrderStatus = "pending" | "paid" | "failed" | "cancelled";

export interface BillingOrder {
  id: string;
  order_id: string;
  status: BillingOrderStatus;
  amount: number;
  currency: string;
  method: string;
  payment_method_type: string | null;
  period_name: string;
  period_months: number;
  plan_id: string;
  error: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface BillingStatus {
  provider: string | null;
  recurring: boolean;
  hasSavedMethod: boolean;
  nextChargeAt: string | null;
  lastChargeAt: string | null;
  currentPeriodEnd: string | null;
  error: string | null;
  lastPayment: {
    methodType: string | null;
    paidAt: string | null;
    amount: number;
    currency: string;
    periodName: string;
  } | null;
}

async function readJson<T>(response: Response): Promise<Partial<T> & { error?: string }> {
  return (await response.json().catch(() => ({}))) as Partial<T> & { error?: string };
}

export async function subscribeToPlan(params: {
  planPeriodId: string;
  payer: SubscribePayer;
  /** Correo del invitado de la landing (sin sesión). */
  email?: string;
}): Promise<SubscribeResult> {
  const response = await fetch("/api/billing/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await readJson<SubscribeResult>(response);
  if (!response.ok || !data.sessionId) {
    throw new Error(data.error ?? "No se pudo iniciar el pago. Intentá de nuevo.");
  }
  return data as SubscribeResult;
}

export async function fetchBillingOrder(
  orderId: string,
  email?: string,
): Promise<BillingOrder> {
  const query = email ? `?email=${encodeURIComponent(email)}` : "";
  const response = await fetch(`/api/billing/orders/${orderId}${query}`, {
    cache: "no-store",
  });
  const data = await readJson<{ order: BillingOrder }>(response);
  if (!response.ok || !data.order) {
    throw new Error(data.error ?? "No se pudo consultar el pago.");
  }
  return data.order;
}

/** ¿Hay sesión iniciada? (decide si el botón del landing cobra o registra) */
export async function fetchCheckoutAuthStatus(): Promise<boolean> {
  const response = await fetch("/api/auth/status", { cache: "no-store" });
  const data = await readJson<{ authenticated: boolean }>(response);
  return Boolean(data.authenticated);
}

export async function fetchBillingStatus(): Promise<BillingStatus | null> {
  const response = await fetch("/api/billing/status", { cache: "no-store" });
  const data = await readJson<{ billing: BillingStatus | null }>(response);
  if (!response.ok) throw new Error(data.error ?? "No se pudo leer el estado de cobro.");
  return data.billing ?? null;
}

export async function setRecurring(enabled: boolean): Promise<void> {
  const response = await fetch("/api/billing/recurring-toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recurring: enabled }),
  });
  const data = await readJson<{ recurring: boolean }>(response);
  if (!response.ok) {
    throw new Error(data.error ?? "No se pudo guardar el cambio.");
  }
}

/**
 * Reclama los pagos hechos como invitado. Idempotente: se puede llamar en cada
 * carga sin efecto si no hay nada pendiente.
 */
export async function claimGuestOrders(): Promise<{ claimed: number; activated: number }> {
  const response = await fetch("/api/billing/claim", { method: "POST" });
  const data = await readJson<{ claimed: number; activated: number }>(response);
  if (!response.ok) {
    throw new Error(data.error ?? "No se pudo reclamar el pago.");
  }
  return { claimed: data.claimed ?? 0, activated: data.activated ?? 0 };
}
