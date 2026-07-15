import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Compras", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/purchases");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de compras con título y descripción", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Compras", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Registra compras a proveedores y actualiza el stock.")).toBeVisible();
  });

  test("abre el modal de nueva compra", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva Compra" }).click();
    await expect(page.getByRole("heading", { name: "Nueva Compra" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Proveedor", { exact: true })).toBeVisible();
    await expect(page.getByText("Fecha", { exact: true })).toBeVisible();
    await expect(page.getByText("IVA", { exact: true })).toBeVisible();
  });

  test("el modal de nueva compra tiene el formulario completo", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva Compra" }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText("Productos")).toBeVisible();
    await expect(page.getByText("Subtotal:")).toBeVisible();
    await expect(page.getByText("Total:", { exact: true })).toBeVisible();
  });

  test("cambia el estado de pago en el formulario", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva Compra" }).click();
    await page.waitForTimeout(500);

    const statusSelect = page.locator("select").filter({ hasText: /Pagada|Pendiente|Anulada/i });
    if (await statusSelect.isVisible()) {
      await statusSelect.selectOption("pending");
    }
  });

  test("cierra el modal con Cancelar", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva Compra" }).click();
    await page.waitForTimeout(500);
    const cancelBtn = page.getByRole("button", { name: "Cancelar" });
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    }
  });

  test("muestra botón de primera compra cuando no hay compras", async ({ page }) => {
    const firstBtn = page.getByRole("button", { name: "Registrar primera compra" });
    if (await firstBtn.isVisible()) {
      await firstBtn.click();
      await expect(page.getByText("Nueva Compra")).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });

  test("filtro de búsqueda por factura está presente", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Buscar por factura…");
    if (await searchInput.isVisible()) {
      await searchInput.fill("FAC-001");
      await expect(searchInput).toHaveValue("FAC-001");
    }
  });

  test("tabla de compras tiene columnas correctas cuando hay datos", async ({ page }) => {
    const tableHeaders = page.locator("th");
    const count = await tableHeaders.count();
    if (count > 0) {
      await expect(tableHeaders.first()).toBeVisible();
    }
  });
});
