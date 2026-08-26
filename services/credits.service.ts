import { createClient } from "@/utils/supabase/client";
import type { Customer, CustomerPayment } from "@/services/customers.service";
import { fetchCustomerPayments, registerPayment } from "@/services/customers.service";

/**
 * Créditos (fiados): la plata que ya salió del mostrador y no entró a la caja.
 *
 * No hay tabla de "créditos". La deuda de un cliente es `customers.credit_balance`
 * y la escribe la base: `create_sale` la sube al fiar, `register_customer_payment`
 * la baja al cobrar y el trigger `sales_release_credit_on_void` la devuelve al
 * anular la venta. Este servicio solo LEE esa cuenta y delega el cobro al RPC.
 *
 * Deliberadamente NO existe una función que escriba `credit_balance` desde acá:
 * un saldo que la app puede tocar por su cuenta es un saldo que puede
 * contradecir a las ventas que lo formaron.
 */

/** Una venta que dejó deuda, para el detalle de la cuenta de un cliente. */
export interface CreditSale {
  id: string;
  sale_number: number;
  created_at: string;
  /** 'credito' (fiado puro) o 'split' (una parte fiada). */
  payment_method: string;
  total: number;
  /** Lo que quedó a deber en esta venta: el total, o el tramo fiado del split. */
  credit_amount: number;
}

/** La cuenta completa de un cliente: lo que se llevó fiado y lo que abonó. */
export interface CreditDetail {
  sales: CreditSale[];
  payments: CustomerPayment[];
}

const SELECT =
  "id, full_name, email, phone, identification, doc_type, tax_exempt, credit_balance, credit_limit, haircut_count, haircuts_since_reward, created_at";

/**
 * Un cliente en la cartera de fiados, deba o no deba hoy.
 *
 * `total_paid` y `last_payment_at` salen de sus abonos, y existen para el que
 * YA saldó: sin ellos, un cliente en cero es indistinguible de uno que nunca
 * fió, y ahí se pierde justo lo que hace falta para decidir si se le vuelve a
 * fiar.
 */
export interface CreditRow extends Customer {
  total_paid: number;
  last_payment_at: string | null;
}

const PAYMENTS_EMBED = "customer_payments(amount, created_at)";

function toRow(raw: unknown): CreditRow {
  const row = raw as Record<string, unknown>;
  const payments = Array.isArray(row.customer_payments)
    ? (row.customer_payments as Record<string, unknown>[])
    : [];
  const fechas = payments.map((p) => String(p.created_at)).sort();
  return {
    ...(row as unknown as Customer),
    total_paid: payments.reduce((acc, p) => acc + Number(p.amount ?? 0), 0),
    last_payment_at: fechas.length > 0 ? fechas[fechas.length - 1] : null,
  };
}

/**
 * Toda la cartera de fiados: los que deben y los que ya saldaron.
 *
 * Son DOS consultas y no una porque el criterio de cada mitad es distinto —
 * deber plata, o haber abonado alguna vez— y PostgREST no expresa ese OR sobre
 * una tabla embebida. Se piden en paralelo y se unen acá; los filtros son
 * excluyentes, así que ningún cliente puede aparecer dos veces.
 *
 * El que saldó y NUNCA abonó no entra en la segunda mitad, y está bien: llegó a
 * cero porque le anularon la venta, no porque pagara. No hay cobranza que
 * mostrar.
 */
export async function fetchCreditRows(): Promise<CreditRow[]> {
  const supabase = createClient();

  const [conDeuda, saldados] = await Promise.all([
    // El índice parcial `customers_with_debt_idx` está hecho para esta mitad.
    supabase
      .from("customers")
      .select(`${SELECT}, ${PAYMENTS_EMBED}`)
      .gt("credit_balance", 0)
      .order("credit_balance", { ascending: false }),
    // `!inner` deja solo a los que tienen al menos un abono: son los que
    // pasaron por la cartera y salieron pagando.
    supabase
      .from("customers")
      .select(`${SELECT}, customer_payments!inner(amount, created_at)`)
      .lte("credit_balance", 0),
  ]);

  if (conDeuda.error) throw conDeuda.error;
  if (saldados.error) throw saldados.error;

  const deudores = (conDeuda.data ?? []).map(toRow);
  const alDia = (saldados.data ?? [])
    .map(toRow)
    // El más reciente primero: al que acaba de pagar es al que se lo busca.
    .sort((a, b) => (b.last_payment_at ?? "").localeCompare(a.last_payment_at ?? ""));

  return [...deudores, ...alDia];
}

/**
 * El detalle de la cuenta de un cliente.
 *
 * Las dos mitades se piden juntas porque juntas son la explicación del saldo:
 * lo fiado menos lo abonado. Mostrar una sin la otra deja al que cobra
 * adivinando de dónde salió el número.
 *
 * Ojo con la venta anulada: sigue en el historial (`status = 'void'`) pero su
 * deuda ya fue devuelta por el trigger, así que NO cuenta como pendiente. Por
 * eso se filtra por `status = 'completed'` y no se listan todas las ventas.
 */
export async function fetchCreditDetail(customerId: string): Promise<CreditDetail> {
  const supabase = createClient();

  const [salesResult, payments] = await Promise.all([
    supabase
      .from("sales")
      .select("id, sale_number, created_at, payment_method, total, sale_payments(payment_method, amount)")
      .eq("customer_id", customerId)
      .eq("status", "completed")
      .in("payment_method", ["credito", "split"])
      .order("created_at", { ascending: false }),
    fetchCustomerPayments(customerId),
  ]);

  if (salesResult.error) throw salesResult.error;

  const sales: CreditSale[] = ((salesResult.data ?? []) as unknown[])
    .map((row) => {
      const sale = row as Record<string, unknown>;
      const method = sale.payment_method as string;
      const splits = Array.isArray(sale.sale_payments)
        ? (sale.sale_payments as Record<string, unknown>[])
        : [];
      // En el fiado puro la deuda es el total. En un split solo el tramo que se
      // pagó a crédito: el resto ya entró a la caja y sumarlo mostraría una
      // deuda que el cliente no tiene.
      const creditAmount =
        method === "credito"
          ? Number(sale.total ?? 0)
          : splits
              .filter((p) => p.payment_method === "credito")
              .reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
      return {
        id: sale.id as string,
        sale_number: sale.sale_number as number,
        created_at: sale.created_at as string,
        payment_method: method,
        total: Number(sale.total ?? 0),
        credit_amount: creditAmount,
      };
    })
    // Un split sin tramo a crédito no es una venta fiada: entra en la consulta
    // por su método pero no tiene nada que ver con esta cuenta.
    .filter((sale) => sale.credit_amount > 0);

  return { sales, payments };
}

export { registerPayment };
