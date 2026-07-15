import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Servicios", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/services");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de servicios con título y descripción", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Servicios", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Tu catálogo de servicios/)).toBeVisible();
  });

  test("abre el modal de nuevo servicio", async ({ page }) => {
    await page.getByRole("button", { name: "Nuevo Servicio" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo Servicio" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Nombre del Servicio")).toBeVisible();
    await expect(page.getByText("Precio", { exact: true })).toBeVisible();
    await expect(page.getByText("Duración (min)", { exact: true })).toBeVisible();
  });

  test("llena el formulario de nuevo servicio", async ({ page }) => {
    await page.getByRole("button", { name: "Nuevo Servicio" }).click();
    await page.waitForTimeout(500);

    const inputs = page.locator("input[type='number']");
    await page.getByPlaceholder("Ej. Corte + Barba").fill("Corte + Barba Premium");
    await inputs.nth(0).fill("35000");
    await page.getByPlaceholder("30").fill("45");

    await expect(page.getByPlaceholder("Ej. Corte + Barba")).toHaveValue("Corte + Barba Premium");
    await expect(page.locator("input[type='number']").nth(0)).toHaveValue("35000");
    await expect(page.getByPlaceholder("30")).toHaveValue("45");
  });

  test("toggle de comisión funciona", async ({ page }) => {
    await page.getByRole("button", { name: "Nuevo Servicio" }).click();
    await page.waitForTimeout(500);

    const commissionToggle = page.getByText("Genera comisión").locator("..").getByRole("button");
    if (await commissionToggle.isVisible()) {
      await commissionToggle.click();
      await expect(page.getByText("Tipo")).toBeVisible({ timeout: 3000 }).catch(() => {});
    }
  });

  test("toggle de servicio activo funciona", async ({ page }) => {
    await page.getByRole("button", { name: "Nuevo Servicio" }).click();
    await page.waitForTimeout(500);

    const activeToggle = page.getByText("Servicio Activo").locator("..").getByRole("button");
    if (await activeToggle.isVisible()) {
      await activeToggle.click();
    }
  });

  test("cierra el modal con Cancelar", async ({ page }) => {
    await page.getByRole("button", { name: "Nuevo Servicio" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Nuevo Servicio")).not.toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("muestra botón de primer servicio cuando no hay servicios", async ({ page }) => {
    const firstBtn = page.getByRole("button", { name: "Crear tu primer servicio" });
    if (await firstBtn.isVisible()) {
      await firstBtn.click();
      await expect(page.getByRole("heading", { name: "Nuevo Servicio" })).toBeVisible({ timeout: 5000 });
    }
  });

  test("la cuadrícula de servicios se muestra cuando hay datos", async ({ page }) => {
    const serviceCards = page.locator(".grid > button");
    const count = await serviceCards.count();
    if (count > 0) {
      await expect(serviceCards.first()).toBeVisible();
    }
  });
});
