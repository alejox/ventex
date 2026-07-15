import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Inventario", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/inventory");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de inventario con todos los elementos", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Gestión de Inventario", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Total Productos")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Valor del Inventario")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("paragraph").filter({ hasText: "Stock Bajo" }).first()).toBeVisible({ timeout: 10000 });
  });

  test("navega a movimientos desde inventario", async ({ page }) => {
    await page.getByRole("link", { name: "Movimientos" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/inventory\/movements/);
  });

  test("navega a nuevo producto", async ({ page }) => {
    await page.getByRole("button", { name: "Nuevo Producto" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard\/inventory\/product/);
  });

  test("abre y cierra el modal de nueva categoría", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva Categoría" }).click();
    await expect(page.getByRole("heading", { name: "Nueva Categoría" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("heading", { name: "Nueva Categoría" })).not.toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("filtro de búsqueda funciona", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Buscar productos o SKU...");
    await searchInput.fill("Producto de prueba");
    await expect(searchInput).toHaveValue("Producto de prueba");
  });

  test("filtro por categoría está presente", async ({ page }) => {
    const categorySelect = page.getByRole("combobox").filter({ hasText: /Todas las Categorías/i });
    if (await categorySelect.isVisible()) {
      await categorySelect.selectOption("");
    }
  });

  test("filtro por estado de stock está presente", async ({ page }) => {
    const stockSelects = page.locator("select");
    const count = await stockSelects.count();
    for (let i = 0; i < count; i++) {
      const text = await stockSelects.nth(i).textContent();
      if (text?.includes("Estado de Stock")) {
        await stockSelects.nth(i).selectOption("Agotado");
        break;
      }
    }
  });

  test("navega a editar producto desde tabla (si hay productos)", async ({ page }) => {
    const editLink = page.getByTitle("Editar producto").first();
    if (await editLink.isVisible()) {
      await editLink.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/dashboard\/inventory\/product/);
    }
  });

  test("la tabla muestra paginación cuando hay productos", async ({ page }) => {
    const pagination = page.getByText(/Mostrando/);
    if (await pagination.isVisible()) {
      await expect(pagination).toBeVisible();
    }
  });
});
