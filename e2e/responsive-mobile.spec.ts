import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/auth";

const MOBILE = { width: 375, height: 812 };

/** Cifra deliberadamente larga para forzar el peor caso de contenido. */
const STRESS_MONEY = "$99,999,999.00";

type Offender = {
  tag: string;
  cls: string;
  text: string;
  right: number;
};

type Probe = {
  docScrollWidth: number;
  docClientWidth: number;
  offenders: Offender[];
};

/**
 * Mide desborde horizontal real: compara el ancho de scroll del documento
 * contra su ancho visible y lista los elementos que cruzan el borde derecho.
 * Ignora lo que vive dentro de un ancestro con scroll horizontal propio
 * (tablas, carruseles): ahí el desborde es intencional.
 */
async function probeOverflow(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;

    const insideScrollable = (el: Element): boolean => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (s.overflowX === "auto" || s.overflowX === "scroll") return true;
        p = p.parentElement;
      }
      return false;
    };

    const offenders: Offender[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") continue;
      // Elementos fuera de flujo desplazados a propósito (drawers cerrados).
      if (s.position === "fixed" && s.transform !== "none") continue;

      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= vw + 1) continue;
      if (insideScrollable(el)) continue;

      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: typeof el.className === "string" ? el.className.slice(0, 100) : "",
        text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50),
        right: Math.round(r.right),
      });
    }

    return {
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      offenders: offenders.slice(0, 12),
    };
  }) as Promise<Probe>;
}

function report(label: string, probe: Probe): string {
  const lines = probe.offenders.map(
    (o) => `    <${o.tag} class="${o.cls}"> right=${o.right} texto="${o.text}"`,
  );
  return [
    `${label}: scrollWidth=${probe.docScrollWidth} clientWidth=${probe.docClientWidth}`,
    ...lines,
  ].join("\n");
}

const ROUTES: Array<[string, string]> = [
  ["Dashboard", "/dashboard"],
  ["Ventas", "/dashboard/sales"],
  ["Clientes", "/dashboard/customers"],
  ["Pedidos", "/dashboard/pedidos"],
  ["Compras", "/dashboard/purchases"],
  ["POS", "/dashboard/pos"],
  ["Inventario", "/dashboard/inventory"],
  ["Servicios", "/dashboard/services"],
  ["Proveedores", "/dashboard/distributors"],
  ["Personal", "/dashboard/staff"],
  ["Calendario", "/dashboard/calendar"],
];

test.describe("responsive movil 375px", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const ok = await login(page);
    expect(ok, "el login de la fixture debe funcionar").toBe(true);
  });

  for (const [label, route] of ROUTES) {
    test(`sin desborde horizontal: ${label}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(800);

      const probe = await probeOverflow(page);
      console.log(report(label, probe));

      expect(
        probe.docScrollWidth,
        `${label} desborda horizontalmente:\n${report(label, probe)}`,
      ).toBeLessThanOrEqual(probe.docClientWidth + 1);
    });
  }

  /**
   * El tenant de pruebas puede tener cifras cortas, en cuyo caso el barrido de
   * arriba pasa sin ejercitar nada. Acá inyectamos la cifra más larga posible
   * en cada nodo monetario y volvemos a medir: eso es lo que reproduce el bug
   * original ($4,128,300.00 saliéndose de la tarjeta KPI).
   */
  for (const [label, route] of [
    ["Dashboard", "/dashboard"],
    ["Ventas", "/dashboard/sales"],
    ["Inventario", "/dashboard/inventory"],
  ] as Array<[string, string]>) {
    test(`cifras largas no desbordan: ${label}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(800);

      const injected = await page.evaluate((money) => {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>('[class*="tabular-nums"]'),
        ).filter((el) => el.children.length === 0);
        nodes.forEach((el) => {
          el.textContent = money;
        });
        return nodes.length;
      }, STRESS_MONEY);

      console.log(`${label}: ${injected} nodos monetarios forzados a ${STRESS_MONEY}`);
      await page.waitForTimeout(300);

      const probe = await probeOverflow(page);
      console.log(report(`${label} (estres)`, probe));

      expect(
        probe.docScrollWidth,
        `${label} desborda con cifras largas:\n${report(label, probe)}`,
      ).toBeLessThanOrEqual(probe.docClientWidth + 1);
    });
  }

  /**
   * Los footers de modal son lo que se unificó (primaria ultima en el DOM, sin
   * inversion visual). Abrimos el modal de alta y verificamos que la fila de
   * botones no desborde y que el orden visual coincida con el del DOM.
   */
  const MODALS: Array<[string, string, RegExp]> = [
    ["Clientes", "/dashboard/customers", /a[ñn]adir cliente|nuevo cliente/i],
    ["Servicios", "/dashboard/services", /a[ñn]adir servicio|nuevo servicio/i],
    ["Proveedores", "/dashboard/distributors", /a[ñn]adir proveedor|nuevo proveedor/i],
  ];

  for (const [label, route, opener] of MODALS) {
    test(`footer de modal sin desborde: ${label}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(800);

      const btn = page.getByRole("button", { name: opener }).first();
      await expect(
        btn,
        `${label}: no se encontro el boton de alta (${opener}); el test no puede validar el footer`,
      ).toBeVisible();
      await btn.click();
      await page.waitForTimeout(700);

      const cancelar = page.getByRole("button", { name: /^cancelar$/i }).first();
      await expect(cancelar, "el modal debe estar abierto").toBeVisible();

      // Orden visual == orden del DOM: Cancelar va ARRIBA de la primaria en movil.
      const cancelBox = await cancelar.boundingBox();
      const primary = page
        .locator("form button[type='submit'], [role='dialog'] button[type='submit']")
        .first();
      const primaryBox =
        (await primary.count()) > 0 ? await primary.boundingBox() : null;

      if (cancelBox && primaryBox) {
        console.log(
          `${label}: Cancelar (y=${Math.round(cancelBox.y)}, x=${Math.round(cancelBox.x)}) · ` +
            `primaria (y=${Math.round(primaryBox.y)}, x=${Math.round(primaryBox.x)})`,
        );
        // Criterio unificado: la primaria va DESPUES de Cancelar en orden de
        // lectura. Algunos footers (services, AppointmentModal) anidan
        // [Cancelar + primaria] en una fila propia que sigue siendo fila en
        // movil: ahi "despues" significa a la derecha, no abajo.
        const sameRow = Math.abs(cancelBox.y - primaryBox.y) < 4;
        if (sameRow) {
          expect(
            cancelBox.x,
            `${label}: en la misma fila, la primaria debe ir a la DERECHA de Cancelar`,
          ).toBeLessThan(primaryBox.x);
        } else {
          expect(
            cancelBox.y,
            `${label}: apilados, la primaria debe quedar DEBAJO de Cancelar (sin flex-col-reverse)`,
          ).toBeLessThan(primaryBox.y);
        }
      }

      const probe = await probeOverflow(page);
      console.log(report(`${label} (modal)`, probe));
      expect(
        probe.docScrollWidth,
        `${label} modal desborda:\n${report(label, probe)}`,
      ).toBeLessThanOrEqual(probe.docClientWidth + 1);
    });
  }

  /**
   * La barra del calendario se salía de la pantalla en móvil: sus cuatro grupos
   * sumaban ~480px contra 390 de viewport y "Nueva Cita" —la acción principal—
   * quedaba fuera, alcanzable sólo con scroll horizontal.
   *
   * El chequeo genérico de `docScrollWidth` NO lo detectaba: el documento medía
   * exactamente el ancho del viewport porque el desborde ocurría dentro de un
   * contenedor con scroll propio. Por eso este test mide el botón en sí.
   */
  for (const view of ["Mes", "Semana", "Día"] as const) {
    test(`el boton de nueva cita entra en pantalla: vista ${view}`, async ({ page }) => {
      await page.goto("/dashboard/calendar", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(800);

      await page.getByRole("button", { name: view, exact: true }).first().click();
      await page.waitForTimeout(500);

      const cta = page.getByRole("button", { name: /Nueva Cita/i }).first();
      await expect(cta).toBeVisible();

      const box = await cta.boundingBox();
      expect(box, "el boton de nueva cita debe existir").not.toBeNull();
      expect(
        Math.round((box?.x ?? 0) + (box?.width ?? 0)),
        `vista ${view}: "Nueva Cita" se sale del viewport de ${MOBILE.width}px`,
      ).toBeLessThanOrEqual(MOBILE.width + 1);
    });
  }
});
