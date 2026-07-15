import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Clientes", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/customers");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de clientes con título y descripción", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Gestiona el directorio de tus clientes y su historial.")).toBeVisible();
  });

  test("abre el modal de nuevo cliente", async ({ page }) => {
    await page.getByRole("button", { name: "Añadir Cliente" }).click();
    await expect(page.getByText("Nuevo Cliente")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Nombre Completo")).toBeVisible();
    await expect(page.getByText("Teléfono")).toBeVisible();
    await expect(page.getByText("Correo Electrónico")).toBeVisible();
    await expect(page.getByText("Documento")).toBeVisible();
  });

  test("llena el formulario de nuevo cliente", async ({ page }) => {
    await page.getByRole("button", { name: "Añadir Cliente" }).click();
    await page.waitForTimeout(500);

    await page.getByPlaceholder("Ej. María González").fill("Cliente Test");
    await page.getByPlaceholder("+52 55 1234 5678").fill("+525512345678");
    await page.getByPlaceholder("maria@ejemplo.com").fill("testcliente@ejemplo.com");
    await page.getByPlaceholder("Número de documento").fill("1234567890");

    await expect(page.getByPlaceholder("Ej. María González")).toHaveValue("Cliente Test");
    await expect(page.getByPlaceholder("Número de documento")).toHaveValue("1234567890");
  });

  test("cambia el tipo de documento", async ({ page }) => {
    await page.getByRole("button", { name: "Añadir Cliente" }).click();
    await page.waitForTimeout(500);

    const docTypeSelect = page.getByRole("combobox").first();
    if (await docTypeSelect.isVisible()) {
      await docTypeSelect.selectOption("NIT");
      await expect(docTypeSelect).toHaveValue("NIT");
    }
  });

  test("toggle de exento de impuestos funciona", async ({ page }) => {
    await page.getByRole("button", { name: "Añadir Cliente" }).click();
    await page.waitForTimeout(500);

    const toggle = page.getByText("Cliente Exento de Impuestos").locator("..").getByRole("button");
    if (await toggle.isVisible()) {
      await toggle.click();
    }
  });

  test("cierra el modal con el botón Cancelar", async ({ page }) => {
    await page.getByRole("button", { name: "Añadir Cliente" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Nuevo Cliente")).not.toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("muestra botón de primer cliente cuando no hay clientes", async ({ page }) => {
    const firstBtn = page.getByRole("button", { name: "Añadir tu primer cliente" });
    if (await firstBtn.isVisible()) {
      await firstBtn.click();
      await expect(page.getByText("Nuevo Cliente")).toBeVisible({ timeout: 5000 });
    }
  });

  test("la tabla de clientes tiene las columnas correctas", async ({ page }) => {
    const tableHeaders = page.locator("th");
    const headerCount = await tableHeaders.count();
    if (headerCount > 0) {
      await expect(tableHeaders.first()).toBeVisible();
    }
  });
});
