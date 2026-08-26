import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

/**
 * El campo de cantidad del carrito arranca en 1, y editarlo es lo que hace
 * quien vende dos de algo. Antes de este guardia, hacer clic y escribir "2"
 * dejaba 12: el cursor quedaba al lado del 1 que ya estaba y el dígito nuevo
 * se sumaba en vez de reemplazar. Borrar tampoco servía — el input controlado
 * reponía el valor viejo apenas el campo quedaba vacío.
 */
test.describe("POS · editar la cantidad de una línea", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/pos");
    await page.waitForLoadState("networkidle");
  });

  test("escribir sobre la cantidad la REEMPLAZA, no la concatena", async ({ page }) => {
    await expect(page.getByText("Factura de venta")).toBeVisible({ timeout: 15000 });

    const agregar = page.locator("button[aria-label='Agregar']").first();
    await expect(agregar).toBeVisible({ timeout: 15000 });
    await agregar.click();

    const cantidad = page.locator('input[aria-label^="Cantidad de"]').first();
    await expect(cantidad).toBeVisible();
    await expect(cantidad).toHaveValue("1");

    // Primer clic: el que hace todo el mundo.
    await cantidad.click();
    await page.keyboard.type("2");
    await expect(cantidad).toHaveValue("2");

    // Segundo clic sobre el campo YA enfocado: acá no hay evento de foco, y es
    // donde se colaba el "23".
    await cantidad.click();
    await page.keyboard.type("3");
    await expect(cantidad).toHaveValue("3");
  });

  test("se puede vaciar el campo para escribir otra cantidad", async ({ page }) => {
    await expect(page.getByText("Factura de venta")).toBeVisible({ timeout: 15000 });

    const agregar = page.locator("button[aria-label='Agregar']").first();
    await expect(agregar).toBeVisible({ timeout: 15000 });
    await agregar.click();

    const cantidad = page.locator('input[aria-label^="Cantidad de"]').first();
    await cantidad.click();
    await page.keyboard.press("Backspace");
    await expect(cantidad).toHaveValue("");

    await page.keyboard.type("5");
    await expect(cantidad).toHaveValue("5");

    // Salir con el campo a medio escribir no deja el carrito en un número que
    // nadie eligió: vuelve el que está cobrando.
    await cantidad.click();
    await page.keyboard.press("Backspace");
    await cantidad.blur();
    await expect(cantidad).toHaveValue("5");
  });
});
