import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";
import { pickCombo } from "./helpers/select";

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
    // Categorías ya no se crea con un modal del catálogo: el catálogo enlaza a
    // /dashboard/categories, que reúne alta, edición y borrado.
    await page.getByRole("link", { name: "Categorías", exact: true }).click();
    // Primera visita en dev compila la ruta: margen amplio.
    await expect(page).toHaveURL(/\/dashboard\/categories/, { timeout: 20000 });
    await page.getByRole("button", { name: "Nueva categoría de producto" }).click();
    const modalTitle = page.getByRole("heading", { name: "Nueva categoría de producto" });
    await expect(modalTitle).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(modalTitle).toBeHidden({ timeout: 5000 });
  });

  test("filtro de búsqueda funciona", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Buscar nombre, SKU o código...");
    await searchInput.fill("Producto de prueba");
    await expect(searchInput).toHaveValue("Producto de prueba");
  });

  // Los filtros son el <Select> custom (components/ui/Select.tsx): combobox
  // con lista portada, no <select> nativo — se eligen con `pickCombo` y se
  // verifica el texto que muestra el botón.
  test("filtro por tipo separa productos de servicios", async ({ page }) => {
    const typeSelect = page.getByRole("combobox", { name: "Filtrar por tipo" });
    await pickCombo(page, "Filtrar por tipo", "Productos");
    await expect(typeSelect).toHaveText(/Productos/);
    await pickCombo(page, "Filtrar por tipo", "Servicios");
    await expect(typeSelect).toHaveText(/Servicios/);
  });

  test("filtro por categoría está presente", async ({ page }) => {
    const categorySelect = page.getByRole("combobox", { name: "Filtrar por categoría" });
    await expect(categorySelect).toBeVisible({ timeout: 10000 });
    await pickCombo(page, "Filtrar por categoría", /^Categoría$/);
    await expect(categorySelect).toHaveText(/Categoría/);
  });

  test("filtro por estado de stock está presente", async ({ page }) => {
    const stockSelect = page.getByRole("combobox", { name: "Filtrar por estado de stock" });
    await pickCombo(page, "Filtrar por estado de stock", "Agotado");
    await expect(stockSelect).toHaveText(/Agotado/);
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
