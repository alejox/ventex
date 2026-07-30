import { toMessage } from "@/lib/errors";
import type { CheckoutInput } from "./pos.service";

/**
 * Cola de ventas sin conexión.
 *
 * Guarda en IndexedDB los cobros que no llegaron al servidor para reenviarlos
 * cuando vuelva la red. Es SOLO la capa de almacenamiento: no decide qué se
 * encola ni cuándo se drena — eso vive en el store del POS.
 *
 * Por qué IndexedDB y no localStorage: localStorage es síncrono (bloquea el
 * hilo justo cuando el cajero está cobrando), tiene un techo de ~5 MB y guarda
 * solo strings. Acá se persisten objetos y no se puede perder ninguno.
 *
 * TENENCIA — la regla que manda sobre todas las demás. IndexedDB es por ORIGEN,
 * no por usuario: la misma base la comparten todas las cuentas que entren desde
 * esa tablet. Y `create_sale` no toma el dueño de la venta del payload, lo
 * resuelve de la SESIÓN del momento en que se drena (`get_effective_user_id()`,
 * y el turno abierto de `auth.uid()`). O sea: drenar a ciegas una venta que
 * encoló otra persona la registra bajo la sesión equivocada y le carga la plata
 * al turno equivocado, que es exactamente lo que el arqueo existe para detectar.
 *
 * Por eso cada entrada guarda su `authUserId` y las lecturas piden a quién
 * pertenecen. Nunca agregues una función que devuelva todo junto para drenarlo.
 */

const DB_NAME = "ventex-offline";
const DB_VERSION = 1;
const STORE = "pending_sales";
const BY_USER = "by_auth_user";

/**
 * Envío a domicilio de una venta encolada.
 *
 * Va acá y no en el `CheckoutInput` porque `createDelivery` necesita el
 * `sale_id`, que recién existe cuando el servidor acepta la venta. Guardarlo
 * junto es lo que evita que un pedido a domicilio cobrado sin conexión llegue
 * al sistema como una venta de mostrador, sin dirección ni repartidor.
 */
export interface PendingDelivery {
  personId: string;
  address: string;
  fee: number;
  notes?: string;
}

export interface PendingSale {
  /**
   * Clave de idempotencia de la venta y clave primaria del store. Que sea la
   * misma hace que encolar dos veces el mismo carrito pise la entrada en vez
   * de duplicarla, igual que en el servidor.
   */
  clientSaleId: string;
  /** El `CheckoutInput` tal cual salió del POS, sin recalcular nada. */
  input: CheckoutInput;
  /**
   * `auth.uid()` de quien cobró. OJO: no es el id del negocio — para un
   * empleado es su propio id, y el servidor lo resuelve a `workspace_id`.
   */
  authUserId: string;
  /** Turno abierto al momento de cobrar. null cuando cobra el dueño. */
  shiftId: string | null;
  /** Se crea al drenar, después de que el servidor devuelva el id de la venta. */
  delivery: PendingDelivery | null;
  /**
   * Lo que se le cobró al cliente, congelado al momento del cobro.
   *
   * Se guarda en vez de recalcularse después porque el precio del catálogo pudo
   * cambiar mientras la venta esperaba. Sin esto, la bandeja de rechazadas
   * mostraría un importe que no es el que hay en el cajón, que es justo el
   * número contra el que hay que cuadrar.
   */
  total: number;
  /** ISO. Sirve para drenar en orden: el stock se descuenta en secuencia. */
  queuedAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  /**
   * `rejected` = el servidor la rechazó de forma definitiva o se agotaron los
   * reintentos. Deja de drenarse y pasa a ser un problema para resolver a mano:
   * la plata entró y la venta no está registrada. Nunca se borra sola.
   */
  status: PendingStatus;
  rejectedReason: string | null;
}

export type PendingStatus = "pending" | "rejected";

/**
 * Después de esto, una venta que sigue fallando con errores que no son ni de
 * red ni rechazos claros (un 5xx que no cede, algo raro del proxy) deja de
 * reintentarse. Sin tope, una sola venta rota mantiene el contador arriba para
 * siempre y el cajero deja de mirarlo.
 */
export const MAX_SYNC_ATTEMPTS = 5;

/** Lo que hace falta para encolar; el resto de los campos los pone la cola. */
export interface EnqueueSaleParams {
  clientSaleId: string;
  input: CheckoutInput;
  authUserId: string;
  shiftId: string | null;
  delivery?: PendingDelivery | null;
  /** Lo cobrado, tal cual se lo dijo al cliente. */
  total: number;
}

/**
 * Si este navegador puede encolar. En el servidor (SSR) y en los pocos casos
 * donde IndexedDB está deshabilitado —modo privado de algunos navegadores,
 * políticas de empresa— devuelve false y el POS tiene que seguir cobrando
 * online contra la red, no romperse.
 */
export function isOfflineQueueSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!isOfflineQueueSupported()) {
    return Promise.reject(new Error("Este navegador no puede guardar ventas sin conexión"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "clientSaleId" });
        store.createIndex(BY_USER, "authUserId", { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Otra pestaña pidió una versión nueva: soltamos la conexión para no
      // bloquearla y la próxima llamada reabre.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Hay otra pestaña de Ventex abierta con una versión distinta"));
  });

  // Un fallo al abrir no puede dejar la promesa rota cacheada para siempre.
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

/** Envuelve una transacción y resuelve recién cuando termina de escribirse. */
async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    // En escrituras espera al `oncomplete`, no al `onsuccess` del request: la
    // venta no está a salvo hasta que la transacción cierra.
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function requestAll(store: IDBObjectStore, authUserId: string): IDBRequest<PendingSale[]> {
  return store.index(BY_USER).getAll(IDBKeyRange.only(authUserId));
}

/** Más viejas primero: el stock se descuenta en el orden en que se cobró. */
function byQueuedAt(a: PendingSale, b: PendingSale): number {
  return a.queuedAt.localeCompare(b.queuedAt);
}

/**
 * Deja una venta en la cola. Es idempotente por `clientSaleId`: reencolar el
 * mismo cobro actualiza la entrada en vez de agregar otra.
 */
export async function enqueueSale(params: EnqueueSaleParams): Promise<PendingSale> {
  const entry: PendingSale = {
    clientSaleId: params.clientSaleId,
    input: params.input,
    authUserId: params.authUserId,
    shiftId: params.shiftId,
    delivery: params.delivery ?? null,
    total: params.total,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    status: "pending",
    rejectedReason: null,
  };

  await withStore("readwrite", (store) => store.put(entry));
  return entry;
}

/**
 * Las ventas de ESTA sesión que todavía se pueden enviar, más viejas primero.
 *
 * Pide el `authUserId` a propósito: ver las de otra sesión no sirve para nada
 * bueno y drenarlas rompe la atribución de tenencia y de turno.
 */
export async function listPendingSales(authUserId: string): Promise<PendingSale[]> {
  const rows = await withStore("readonly", (store) => requestAll(store, authUserId));
  return (rows ?? []).filter((r) => r.status !== "rejected").sort(byQueuedAt);
}

/**
 * Las que el servidor rechazó y no se van a enviar solas. Son plata que entró
 * sin quedar registrada, así que alguien las tiene que resolver a mano.
 */
export async function listRejectedSales(authUserId: string): Promise<PendingSale[]> {
  const rows = await withStore("readonly", (store) => requestAll(store, authUserId));
  return (rows ?? []).filter((r) => r.status === "rejected").sort(byQueuedAt);
}

/** Cuántas ventas tiene sin enviar esta sesión (para el indicador del POS). */
export async function countPendingSales(authUserId: string): Promise<number> {
  return (await listPendingSales(authUserId)).length;
}

/** Cuántas quedaron trabadas esperando que alguien las mire. */
export async function countRejectedSales(authUserId: string): Promise<number> {
  return (await listRejectedSales(authUserId)).length;
}

/**
 * Saca una venta de la carrera de reenvíos sin borrarla.
 *
 * Borrarla seria lo peor que se puede hacer acá: el cajero cobró, la venta no
 * quedó registrada, y la única prueba de que existió es esta fila.
 */
export async function markRejected(clientSaleId: string, reason: unknown): Promise<void> {
  await patchEntry(clientSaleId, (entry) => ({
    ...entry,
    status: "rejected",
    rejectedReason: toMessage(reason),
    lastAttemptAt: new Date().toISOString(),
    lastError: toMessage(reason),
  }));
}

/**
 * Cuántas ventas quedaron en este dispositivo a nombre de OTRA sesión.
 *
 * No se pueden enviar desde acá —irían al turno equivocado— pero tampoco se
 * pueden esconder: es plata que entró y todavía no está registrada. Quien las
 * encoló tiene que volver a entrar en esta tablet para que se drenen.
 *
 * Se cuenta por `authUserId` y no restando totales: las propias ya rechazadas
 * no son de otro y no pueden aparecer acá.
 */
export async function countOrphanPendingSales(authUserId: string): Promise<number> {
  const todas = await withStore<PendingSale[]>("readonly", (store) => store.getAll());
  return (todas ?? []).filter((r) => r.authUserId !== authUserId).length;
}

/** Saca una venta de la cola. Se llama cuando el servidor ya la confirmó. */
export async function removePendingSale(clientSaleId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(clientSaleId));
}

/**
 * Devuelve una venta rechazada a la carrera de reenvíos, con los intentos en
 * cero.
 *
 * No es un botón inútil aunque el rechazo haya sido "definitivo": el motivo más
 * común es `STOCK_INSUFICIENTE`, y eso se arregla reponiendo mercadería. Si el
 * rechazo sigue en pie, el próximo drenaje la vuelve a marcar y no se pierde
 * nada. Conserva la MISMA clave de idempotencia, así que si en el medio la
 * venta llegó a entrar, el reintento devuelve esa y no crea otra.
 */
export async function retryRejectedSale(clientSaleId: string): Promise<void> {
  await patchEntry(clientSaleId, (entry) => ({
    ...entry,
    status: "pending",
    rejectedReason: null,
    attempts: 0,
    lastError: null,
  }));
}

/**
 * Lee, transforma y reescribe una entrada en una sola transacción.
 *
 * Si la entrada no está —otra pestaña ya la envió y la borró— no hace nada.
 * Resucitarla con un `put` a ciegas duplicaría la venta.
 */
async function patchEntry(
  clientSaleId: string,
  patch: (entry: PendingSale) => PendingSale,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const read = store.get(clientSaleId);

    read.onsuccess = () => {
      const entry = read.result as PendingSale | undefined;
      if (!entry) return;
      store.put(patch(entry));
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Anota que un reenvío falló. No la saca de la cola: el error se guarda para
 * mostrarlo y para que se note cuando una venta se queda trabada reintentando.
 */
export async function recordFailedAttempt(clientSaleId: string, error: unknown): Promise<void> {
  await patchEntry(clientSaleId, (entry) => ({
    ...entry,
    attempts: entry.attempts + 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: toMessage(error),
  }));
}
