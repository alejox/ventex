import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_EMAIL || "lagrajales@utp.edu.co";
const PASSWORD = process.env.TEST_PASSWORD || "admin123";

test.describe("Ventex POS", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForURL("/login");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  });

  test("Dashboard loads after login", async ({ page }) => {
    // Just verify we land on dashboard with visible content
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.locator(".flex-1").first()).toBeVisible({ timeout: 10000 });
  });

  test("Inventory — product modal opens, does NOT close on price click", async ({ page }) => {
    await page.getByRole("link", { name: /Inventario/ }).first().click();
    await page.waitForURL("/dashboard/inventory");
    await expect(page.getByRole("heading", { name: "Gestión de Inventario" })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Nuevo Producto" }).click();
    await expect(page.getByRole("heading", { name: "Crear nuevo producto" })).toBeVisible({ timeout: 5000 });

    await page.locator('input[type="text"][required]').fill("Producto E2E");
    const priceInput = page.locator('input[type="number"]').first();
    await priceInput.click();
    await priceInput.fill("15000");
    await expect(page.getByRole("heading", { name: "Crear nuevo producto" })).toBeVisible();

    // Close by clicking backdrop
    await page.locator(".fixed.inset-0").first().click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole("heading", { name: "Crear nuevo producto" })).not.toBeVisible();
  });

  test("Product modal — type switching (Producto/Servicio/Combo)", async ({ page }) => {
    await page.getByRole("link", { name: /Inventario/ }).first().click();
    await page.waitForURL("/dashboard/inventory");
    await page.getByRole("button", { name: "Nuevo Producto" }).click();
    await expect(page.getByRole("heading", { name: "Crear nuevo producto" })).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Servicio" }).click();
    await expect(page.getByText("Costo inicial por unidad")).not.toBeVisible();
    await expect(page.getByText("Cantidad")).not.toBeVisible();

    await page.getByRole("button", { name: "Combo" }).click();
    await expect(page.getByRole("button", { name: "Completar combo" })).toBeVisible();

    // Click Producto inside modal (not the header button)
    await page.locator("form button:has-text('Producto')").click();
    await expect(page.getByText("Costo inicial por unidad")).toBeVisible();

    // Close by clicking backdrop
    await page.locator(".fixed.inset-0").first().click({ position: { x: 5, y: 5 } });
  });

  test("POS page loads", async ({ page }) => {
    const link = page.locator('a[href="/dashboard/pos"]');
    if (await link.isVisible()) {
      await link.click();
      await page.waitForURL("/dashboard/pos");
      await expect(page.getByRole("heading", { name: "Factura de venta" })).toBeVisible({ timeout: 10000 });
    }
  });

  test("Customers — modal opens and can be filled", async ({ page }) => {
    await page.getByRole("link", { name: /Clientes/ }).first().click();
    await page.waitForURL("/dashboard/customers");
    await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Añadir Cliente" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo Cliente" })).toBeVisible({ timeout: 5000 });

    // Use generic input selectors since labels lack htmlFor
    await page.locator(".fixed.inset-0 input[type='text']").first().fill("Cliente E2E");
    await page.locator(".fixed.inset-0 select").first().selectOption("CC");
    await page.getByRole("button", { name: "Cancelar" }).click();
  });

  test("Distributors — modal opens and can be filled", async ({ page }) => {
    await page.getByRole("link", { name: /Proveedores/ }).first().click();
    await page.waitForURL("/dashboard/distributors");
    await expect(page.getByRole("heading", { name: "Proveedores", exact: true })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Añadir Proveedor" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo Proveedor" })).toBeVisible({ timeout: 5000 });

    await page.locator(".fixed.inset-0 input[type='text']").first().fill("Proveedor E2E");
    await page.locator(".fixed.inset-0 select").first().selectOption("NIT");
    await page.getByRole("button", { name: "Cancelar" }).click();
  });

  test("Finance page loads", async ({ page }) => {
    await page.locator('a[href="/dashboard/finance"]').first().click();
    await page.waitForURL("/dashboard/finance");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
  });

  test("Calculator — opens, computes, closes with Escape", async ({ page }) => {
    await page.locator('button[title="Calculadora"]').click();
    await expect(page.getByRole("heading", { name: "Calculadora" })).toBeVisible();

    await page.keyboard.press("7");
    await page.keyboard.press("+");
    await page.keyboard.press("3");
    await page.keyboard.press("Enter");
    await expect(page.getByText("10")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Calculadora" })).not.toBeVisible();
  });

  test("Settings page loads", async ({ page }) => {
    await page.locator('a[href="/dashboard/settings"]').first().click();
    await page.waitForURL("/dashboard/settings");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
  });

  test("Standalone product form loads", async ({ page }) => {
    await page.goto("/dashboard/inventory/product");
    await page.waitForURL("/dashboard/inventory/product");
    await expect(page.getByRole("heading", { name: "Nuevo Producto" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Información General")).toBeVisible();
    await expect(page.getByText("Imagen del Producto")).toBeVisible();
  });
});
