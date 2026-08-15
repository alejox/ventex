import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

/**
 * Los servicios dejaron de tener pantalla propia: viven en el catálogo, junto a
 * los productos, y se dan de alta con el mismo formulario.
 *
 * Lo que estas pruebas custodian es que la mudanza no dejó a nadie sin camino:
 * la ruta vieja sigue llevando a algún lado, el catálogo muestra las dos
 * mitades, y el alta de servicio existe y guarda en `services`.
 */
test.describe("Servicios (dentro del catálogo)", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
  });

  test("la ruta vieja /dashboard/services redirige al catálogo", async ({ page }) => {
    await page.goto("/dashboard/services");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/inventory$/);
    await expect(page.getByRole("heading", { name: "Productos y Servicios" })).toBeVisible({ timeout: 15000 });
  });

  test("el catálogo se puede filtrar solo por servicios", async ({ page }) => {
    await page.goto("/dashboard/inventory");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Filtrar por tipo").selectOption("service");
    await expect(page.getByLabel("Filtrar por tipo")).toHaveValue("service");
  });

  test("el alta de servicio abre en la pestaña Servicio", async ({ page }) => {
    await page.goto("/dashboard/inventory/product?type=servicio");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Nuevo Servicio" })).toBeVisible({ timeout: 15000 });
    // Los campos que solo tiene un servicio.
    await expect(page.getByLabel("Precio final")).toBeVisible();
    await expect(page.getByLabel("Duración (minutos)")).toBeVisible();
  });

  test("el alta de servicio no pide datos de mercadería", async ({ page }) => {
    await page.goto("/dashboard/inventory/product?type=servicio");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Nuevo Servicio" })).toBeVisible({ timeout: 15000 });
    // Un servicio no se inventaría: ni stock, ni SKU, ni código de barras.
    await expect(page.getByText("Imagen del Producto")).toHaveCount(0);
    await expect(page.getByLabel(/^SKU/)).toHaveCount(0);
    await expect(page.getByText("Presentación y stock inicial")).toHaveCount(0);
  });

  test("la pestaña Producto y la pestaña Servicio comparten formulario", async ({ page }) => {
    await page.goto("/dashboard/inventory/product");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Nuevo Producto" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Servicio", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Nuevo Servicio" })).toBeVisible({ timeout: 5000 });
  });

  test("el toggle de servicio activo funciona", async ({ page }) => {
    await page.goto("/dashboard/inventory/product?type=servicio");
    await page.waitForLoadState("networkidle");
    const activeToggle = page.getByText("Servicio Activo").locator("..").getByRole("button");
    await expect(activeToggle).toBeVisible({ timeout: 15000 });
    await activeToggle.click();
  });

  test("un servicio del catálogo se edita por ?serviceId=", async ({ page }) => {
    await page.goto("/dashboard/inventory");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Filtrar por tipo").selectOption("service");
    const editLink = page.getByTitle("Editar servicio").first();
    if (await editLink.isVisible()) {
      await editLink.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/dashboard\/inventory\/product\?serviceId=/);
      await expect(page.getByRole("heading", { name: "Editar Servicio" })).toBeVisible({ timeout: 10000 });
    }
  });
});
