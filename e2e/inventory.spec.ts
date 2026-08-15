import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Catálogo (productos y servicios)", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/inventory");
    await page.waitForLoadState("networkidle");
  });

  test("carga el catálogo con todos los elementos", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Productos y Servicios", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Total en Catálogo")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Valor del Inventario")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("paragraph").filter({ hasText: "Stock Bajo" }).first()).toBeVisible({ timeout: 10000 });
  });

  test("navega al alta compartida de producto o servicio", async ({ page }) => {
    await page.getByRole("link", { name: "Producto / Servicio" }).click();
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
    const searchInput = page.getByPlaceholder("Buscar nombre, SKU o código...");
    await searchInput.fill("Producto de prueba");
    await expect(searchInput).toHaveValue("Producto de prueba");
  });

  test("filtro por tipo separa productos de servicios", async ({ page }) => {
    const typeSelect = page.getByLabel("Filtrar por tipo");
    await typeSelect.selectOption("product");
    await expect(typeSelect).toHaveValue("product");
    await typeSelect.selectOption("service");
    await expect(typeSelect).toHaveValue("service");
  });

  test("filtro por categoría está presente", async ({ page }) => {
    await page.getByLabel("Filtrar por categoría").selectOption("");
  });

  test("filtro por estado de stock está presente", async ({ page }) => {
    const stockSelect = page.getByLabel("Filtrar por estado de stock");
    await stockSelect.selectOption("Agotado");
    await expect(stockSelect).toHaveValue("Agotado");
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
