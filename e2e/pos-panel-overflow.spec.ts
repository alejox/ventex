import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";
import { ensureProduct } from "./helpers/catalog";

/**
 * El panel de factura del POS (escritorio) tiene el botón de cobrar al pie.
 * Con ítems en el carrito ese pie no puede quedar fuera del panel ni fuera de
 * la pantalla: si se desborda, el cajero no ve dónde cobrar.
 *
 * Antes este archivo era un script de diagnóstico con credenciales personales
 * fijas, un login por el toggle "Dueño" (ya no existe) y sin ninguna aserción.
 */
const PRODUCTO = "Producto E2E Offline";

test("desktop - con ítems, el botón Vender queda dentro del panel y de la pantalla", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const loggedIn = await tryLogin(page);
  test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");

  await ensureProduct(page, PRODUCTO, 10000);
  await page.goto("/dashboard/pos");
  await page.waitForLoadState("networkidle");

  const tarjeta = page
    .getByRole("button", { name: new RegExp(PRODUCTO, "i") })
    .filter({ visible: true })
    .first();
  await expect(tarjeta).toBeVisible({ timeout: 15000 });
  await tarjeta.click();

  const vender = page.getByRole("button", { name: /^vender/i }).filter({ visible: true }).first();
  await expect(vender).toBeVisible({ timeout: 10000 });
  await expect(vender).toBeInViewport();

  // El panel es el contenedor más chico que tiene a la vez el título
  // "Factura de venta" y el botón de cobrar.
  const panel = page
    .locator("div")
    .filter({ has: page.getByText("Factura de venta", { exact: true }) })
    .filter({ has: vender })
    .last();
  const panelBox = await panel.boundingBox();
  const venderBox = await vender.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(venderBox).not.toBeNull();
  // 1px de tolerancia por redondeo subpíxel.
  expect(venderBox!.y + venderBox!.height).toBeLessThanOrEqual(panelBox!.y + panelBox!.height + 1);
  expect(venderBox!.y).toBeGreaterThanOrEqual(panelBox!.y - 1);
});
