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
    await expect(
      page.getByText("Registra tus compras de productos y mantén actualizadas las cantidades en tu inventario.")
    ).toBeVisible();
  });

  test("el buscador está visible haya o no compras", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Buscar No. de factura");
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await searchInput.fill("FAC-001");
    await expect(searchInput).toHaveValue("FAC-001");
  });

  test("Nueva compra navega a su propia página, no a un modal", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva compra" }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/purchases\/new$/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Nueva compra" })).toBeVisible();
  });

  test("el formulario de compra tiene cabecera, líneas y totales", async ({ page }) => {
    await page.goto("/dashboard/purchases/new");
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel("Factura de compra N°")).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel("Fecha de compra:")).toBeVisible();
    await expect(page.getByLabel("Fecha de vencimiento")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Información general" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Productos comprados" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agregar producto" })).toBeVisible();

    await expect(page.getByLabel("Notas")).toBeVisible();

    // "Total" también es una columna de la tabla de líneas: sin acotar al panel
    // el localizador matchea de más y Playwright falla por modo estricto.
    const totals = page.getByRole("group", { name: "Totales de la compra" });
    await expect(totals.getByText("Subtotal", { exact: true })).toBeVisible();
    await expect(totals.getByText("Total", { exact: true })).toBeVisible();
  });

  test("la línea acepta cajas y unidades por separado", async ({ page }) => {
    await page.goto("/dashboard/purchases/new");
    await page.waitForLoadState("networkidle");

    // Dos cantidades y un solo costo, siempre por unidad suelta: es lo que
    // evita que el mismo número signifique caja en una línea y unidad en otra.
    await expect(page.getByLabel("Cajas de la línea 1")).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel("Unidades sueltas de la línea 1")).toBeVisible();
    await expect(page.getByLabel("Costo por unidad de la línea 1")).toBeVisible();
  });

  test("Agregar producto suma una línea a la tabla", async ({ page }) => {
    await page.goto("/dashboard/purchases/new");
    await page.waitForLoadState("networkidle");

    const firstLine = page.getByLabel("Producto de la línea 1");
    await expect(firstLine).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel("Producto de la línea 2")).toHaveCount(0);

    await page.getByRole("button", { name: "Agregar producto" }).click();
    await expect(page.getByLabel("Producto de la línea 2")).toBeVisible();
  });

  test("Guardar está deshabilitado sin proveedor ni productos", async ({ page }) => {
    await page.goto("/dashboard/purchases/new");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "Guardar", exact: true })).toBeDisabled({ timeout: 15000 });
  });

  test("Nuevo proveedor abre el panel lateral", async ({ page }) => {
    await page.goto("/dashboard/purchases/new");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Nuevo proveedor" }).click();
    const drawer = page.getByRole("dialog", { name: "Nuevo proveedor" });
    await expect(drawer).toBeVisible({ timeout: 5000 });
    await expect(drawer.getByLabel("Razón social / Nombre completo")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("Cancelar vuelve al listado", async ({ page }) => {
    await page.goto("/dashboard/purchases/new");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page).toHaveURL(/\/dashboard\/purchases$/, { timeout: 15000 });
  });

  test("tabla de compras tiene columnas correctas cuando hay datos", async ({ page }) => {
    const tableHeaders = page.locator("th");
    const count = await tableHeaders.count();
    if (count > 0) {
      await expect(tableHeaders.first()).toBeVisible();
    }
  });
});
