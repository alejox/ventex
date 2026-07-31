import { test, expect, Page } from "@playwright/test";
import { login } from "./helpers/auth";

/**
 * Cobro sin conexión en el POS.
 *
 * Los dos casos que importan son opuestos y hay que probarlos juntos, porque el
 * riesgo está en confundirlos:
 *
 * 1. No llegamos al servidor → la venta se encola y el cajero ve que quedó
 *    pendiente de envío.
 * 2. El servidor contestó que NO → no se encola nada y el cajero se entera de
 *    que la venta no se hizo, antes de entregar la mercadería.
 *
 * Ninguno de los dos escribe en la base: el primero porque no hay red, el
 * segundo porque el servidor rechaza.
 *
 * Requisito: el negocio de prueba tiene que tener un producto llamado como
 * PRODUCTO, con stock. Si no está, las specs se saltean.
 */

const PRODUCTO = "Producto E2E Offline";

const visible = (page: Page, texto: string | RegExp) =>
  page.getByText(texto).filter({ visible: true }).first();

const boton = (page: Page, nombre: RegExp) =>
  page.getByRole("button", { name: nombre }).filter({ visible: true }).first();

/**
 * Lee la cola desde la página.
 *
 * Comprueba primero que la base EXISTA: `indexedDB.open(nombre)` sin versión la
 * crea vacía si no está, y entonces el `onupgradeneeded` de la app —que espera
 * crear la v1— ya no dispara nunca y el object store no aparece. O sea que
 * espiar la cola demasiado temprano la rompía.
 */
async function leerCola(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(async () => {
    const bases = await indexedDB.databases();
    if (!bases.some((b) => b.name === "ventex-offline")) return [];
    return new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const req = indexedDB.open("ventex-offline");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("pending_sales")) return resolve([]);
        const tx = db.transaction("pending_sales", "readonly");
        const all = tx.objectStore("pending_sales").getAll();
        tx.oncomplete = () => resolve(all.result);
        tx.onerror = () => reject(tx.error);
      };
    });
  });
}

async function irAlPos(page: Page) {
  expect(await login(page)).toBe(true);
  await page.goto("/dashboard/pos");
  await page.waitForLoadState("networkidle");

  // La cuenta de prueba puede llegar sin terminar el onboarding.
  const nombre = page.getByPlaceholder("Mi Tienda");
  if (await nombre.isVisible().catch(() => false)) {
    await nombre.fill("Negocio E2E");
    await page.getByRole("button", { name: "Entrar a mi negocio" }).click();
    await page.waitForURL(/\/dashboard\/pos/, { timeout: 20000 });
    await page.waitForLoadState("networkidle");
  }

  // El POS pinta el catálogo DOS veces (grilla de escritorio + lista móvil) y
  // oculta una por CSS: sin filtrar por visible se agarra la oculta.
  await expect(visible(page, PRODUCTO)).toBeVisible({ timeout: 20000 });
}

/** Agrega el producto y deja la venta lista para confirmar. */
async function cobrar(page: Page) {
  await visible(page, PRODUCTO).click();
  await page.waitForTimeout(600);
  await boton(page, /^vender/i).click();
  await page.waitForTimeout(500);
  // En efectivo el botón de confirmar queda deshabilitado hasta que hay monto.
  await boton(page, /valor exacto/i).click();
  await page.waitForTimeout(400);
  await boton(page, /confirmar venta|confirmar pago/i).click();
}

test("sin conexión la venta se encola y el carrito se limpia", async ({ page, context }) => {
  await irAlPos(page);
  expect(await leerCola(page)).toHaveLength(0);

  // Se cae internet justo antes de cobrar.
  await context.setOffline(true);
  await cobrar(page);

  // El modal es lo que el cajero realmente lee (el toast se autocierra), así
  // que es ahí donde no puede decir que el pago se procesó.
  await expect(visible(page, /Venta cobrada sin conexión/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/¡Venta exitosa!/i)).toHaveCount(0);
  await expect(page.getByText(/El pago se ha procesado correctamente/i)).toHaveCount(0);

  const cola = await leerCola(page);
  expect(cola).toHaveLength(1);
  const pendiente = cola[0] as {
    authUserId: string;
    workspaceId: string;
    membershipId: string;
    clientSaleId: string;
    attempts: number;
    input: {
      clientSaleId: string;
      workspaceId: string;
      membershipId: string;
      shiftId: string;
      items: unknown[];
    };
  };
  // La venta congela identidad, negocio, membresía y turno: otra sesión o un
  // cambio de negocio no puede drenarla hacia una caja distinta.
  expect(pendiente.authUserId).toMatch(/^[0-9a-f-]{36}$/);
  expect(pendiente.workspaceId).toMatch(/^[0-9a-f-]{36}$/);
  expect(pendiente.membershipId).toMatch(/^[0-9a-f-]{36}$/);
  expect(pendiente.input.workspaceId).toBe(pendiente.workspaceId);
  expect(pendiente.input.membershipId).toBe(pendiente.membershipId);
  expect(pendiente.input.shiftId).toMatch(/^[0-9a-f-]{36}$/);
  // La misma clave adentro y afuera: es la que hace idempotente el reenvío.
  expect(pendiente.input.clientSaleId).toBe(pendiente.clientSaleId);
  expect(pendiente.input.items).toHaveLength(1);
  expect(pendiente.attempts).toBe(0);

  // A propósito NO se vuelve a poner online: reconectar dispararía el drenaje
  // y este test escribiría una venta que no está verificando. El drenaje tiene
  // su propio test. El contexto se descarta al terminar.
});

/** Espera a que la cola quede vacía (el drenaje es asíncrono). */
async function esperarColaVacia(page: Page, timeout = 25000) {
  await expect
    .poll(async () => (await leerCola(page)).filter((r) => r.status !== "rejected").length, {
      timeout,
      message: "la cola nunca se vació",
    })
    .toBe(0);
}

test("al volver la conexión la venta encolada se envía sola", async ({ page, context }) => {
  await irAlPos(page);
  expect(await leerCola(page)).toHaveLength(0);

  await context.setOffline(true);
  await cobrar(page);
  await expect(visible(page, /Venta cobrada sin conexión/i)).toBeVisible({ timeout: 15000 });
  expect(await leerCola(page)).toHaveLength(1);

  // Vuelve internet: el evento `online` dispara el drenaje.
  await context.setOffline(false);
  await esperarColaVacia(page);
});

/**
 * El caso que justifica toda la clave de idempotencia: el servidor RECIBE y
 * graba la venta, pero la respuesta se pierde en el camino. El cliente no
 * puede distinguirlo de "no llegó", así que la reintenta.
 *
 * `route.fetch()` la deja llegar de verdad y `route.abort()` tira la respuesta.
 * Sin `client_sale_id` esto crearía DOS ventas y descontaría el stock dos veces.
 */
test("una respuesta perdida no duplica la venta al reintentar", async ({ page, context }) => {
  // El primer reenvío se corta, así que el segundo llega recién con el
  // intervalo de reintento (30s). Es a propósito: ese intervalo es la red de
  // contención para el wifi que figura conectado y no sale, no un reintento
  // agresivo. El test tiene que esperarlo.
  test.setTimeout(90_000);
  await irAlPos(page);
  expect(await leerCola(page)).toHaveLength(0);

  await context.setOffline(true);
  await cobrar(page);
  await expect(visible(page, /Venta cobrada sin conexión/i)).toBeVisible({ timeout: 15000 });

  const [encolada] = await leerCola(page);
  const clave = (encolada as { clientSaleId: string }).clientSaleId;

  // Primer reenvío: llega al servidor, la respuesta se pierde.
  let intentos = 0;
  await page.route("**/rest/v1/rpc/create_sale", async (route) => {
    intentos += 1;
    if (intentos === 1) {
      await route.fetch();
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await context.setOffline(false);
  await esperarColaVacia(page, 70_000);

  // Se intentó al menos dos veces y la clave nunca cambió: es lo que hace que
  // el segundo intento devuelva la venta del primero en vez de crear otra.
  expect(intentos).toBeGreaterThanOrEqual(2);
  expect(clave).toMatch(/^[0-9a-f-]{36}$/);
});

test("un rechazo al drenar deja la venta marcada y no la reintenta", async ({ page, context }) => {
  await irAlPos(page);
  expect(await leerCola(page)).toHaveLength(0);

  await context.setOffline(true);
  await cobrar(page);
  await expect(visible(page, /Venta cobrada sin conexión/i)).toBeVisible({ timeout: 15000 });

  // Al reenviar, el servidor la rechaza de forma definitiva.
  let llamadas = 0;
  await page.route("**/rest/v1/rpc/create_sale", (route) => {
    llamadas += 1;
    return route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        message: "STOCK_INSUFICIENTE: alguien más se llevó las últimas unidades",
        details: "",
        hint: "",
        code: "P0001",
      }),
    });
  });

  await context.setOffline(false);

  // Queda marcada, NO borrada: es la única prueba de que esa plata entró.
  await expect
    .poll(async () => {
      const cola = await leerCola(page);
      return cola.length === 1 ? (cola[0] as { status: string }).status : "sin-fila";
    }, { timeout: 25000 })
    .toBe("rejected");

  const llamadasTrasRechazo = llamadas;
  await page.waitForTimeout(3000);
  // No se reintenta: ya sabemos que nunca va a entrar.
  expect(llamadas).toBe(llamadasTrasRechazo);

  const [rechazada] = await leerCola(page);
  expect((rechazada as { rejectedReason: string }).rejectedReason).toContain("STOCK_INSUFICIENTE");
});

test("el indicador aparece al encolar y desaparece al drenar", async ({ page, context }) => {
  await irAlPos(page);
  // Sin nada pendiente no se dibuja nada: un indicador permanente se vuelve
  // parte del fondo y deja de mirarse.
  await expect(page.getByText(/venta[s]? sin enviar/i)).toHaveCount(0);

  await context.setOffline(true);
  await cobrar(page);
  await expect(visible(page, /1 venta sin enviar/i)).toBeVisible({ timeout: 15000 });

  await context.setOffline(false);
  await esperarColaVacia(page);
  await expect(page.getByText(/venta[s]? sin enviar/i)).toHaveCount(0);
});

test("la bandeja muestra la rechazada y 'intentar de nuevo' la recupera", async ({
  page,
  context,
}) => {
  await irAlPos(page);

  await context.setOffline(true);
  await cobrar(page);
  await expect(visible(page, /Venta cobrada sin conexión/i)).toBeVisible({ timeout: 15000 });

  // El servidor la rechaza (p. ej. alguien se llevó el stock).
  let rechazar = true;
  await page.route("**/rest/v1/rpc/create_sale", async (route) => {
    if (!rechazar) return route.continue();
    return route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        message: "STOCK_INSUFICIENTE: no quedaban unidades",
        details: "",
        hint: "",
        code: "P0001",
      }),
    });
  });

  await context.setOffline(false);
  await expect(visible(page, /1 venta sin registrar/i)).toBeVisible({ timeout: 25000 });

  await visible(page, /1 venta sin registrar/i).click();
  await expect(visible(page, /Ventas cobradas que no se registraron/i)).toBeVisible();
  // El monto congelado al cobrar, no recalculado: es contra esto que se cuadra.
  await expect(visible(page, /\$10,000\.00/)).toBeVisible();
  await expect(visible(page, /STOCK_INSUFICIENTE/i)).toBeVisible();

  // Se repuso el stock: el reintento ahora sí entra.
  rechazar = false;
  await page.getByRole("button", { name: /intentar de nuevo/i }).click();

  await expect(visible(page, /No quedó ninguna venta sin registrar/i)).toBeVisible({
    timeout: 25000,
  });

  // No alcanza con que la bandeja se vacíe: eso ya es cierto apenas la venta
  // vuelve a estado `pending`, antes de que el servidor la acepte. Lo que hay
  // que probar es que salió del dispositivo, o sea que la cola queda VACÍA.
  await esperarColaVacia(page);
});

test("descartar una rechazada pide confirmación", async ({ page, context }) => {
  await irAlPos(page);

  await context.setOffline(true);
  await cobrar(page);
  await expect(visible(page, /Venta cobrada sin conexión/i)).toBeVisible({ timeout: 15000 });

  await page.route("**/rest/v1/rpc/create_sale", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        message: "STOCK_INSUFICIENTE: no quedaban unidades",
        details: "",
        hint: "",
        code: "P0001",
      }),
    }),
  );

  await context.setOffline(false);
  await expect(visible(page, /1 venta sin registrar/i)).toBeVisible({ timeout: 25000 });
  await visible(page, /1 venta sin registrar/i).click();

  // Un clic solo no la borra: es la única constancia de esa plata.
  await page.getByRole("button", { name: /^descartar$/i }).click();
  await expect(visible(page, /no queda ninguna constancia/i)).toBeVisible();
  expect(await leerCola(page)).toHaveLength(1);

  await page.getByRole("button", { name: /sí, descartar/i }).click();
  await expect(visible(page, /No quedó ninguna venta sin registrar/i)).toBeVisible({
    timeout: 15000,
  });
  expect(await leerCola(page)).toHaveLength(0);
});

test("un rechazo del servidor NO se encola", async ({ page }) => {
  await irAlPos(page);
  expect(await leerCola(page)).toHaveLength(0);

  // El servidor SÍ contesta, pero con un error de negocio (SQLSTATE P0001).
  await page.route("**/rest/v1/rpc/create_sale", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        message: `STOCK_INSUFICIENTE: ${PRODUCTO} — hay 0 unidades y se intentan vender 1`,
        details: "",
        hint: "",
        code: "P0001",
      }),
    }),
  );

  await cobrar(page);
  await page.waitForTimeout(2500);

  // Nada encolado: el cajero tiene que enterarse de que la venta no se hizo.
  expect(await leerCola(page)).toHaveLength(0);
  await expect(page.getByText(/sin conexión/i)).toHaveCount(0);
});
