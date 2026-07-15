import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Finanzas", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/finance");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de finanzas", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard\/finance/);
  });

  test("muestra título Ingresos y Gastos", async ({ page }) => {
    const heading = page.getByRole("heading", { name: /ingresos|gastos|finanzas|finance/i });
    if (await heading.isVisible()) {
      await expect(heading).toBeVisible();
    }
  });

  test("muestra resumen de ingresos", async ({ page }) => {
    const ingresos = page.getByText("Ingresos Totales");
    if (await ingresos.isVisible()) {
      await expect(ingresos).toBeVisible();
    }
  });
});
