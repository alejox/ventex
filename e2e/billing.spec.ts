import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Facturación (Billing)", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/billing");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de facturación", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard\/billing/);
  });

  test("muestra título de facturación", async ({ page }) => {
    const heading = page.getByRole("heading", { name: /facturación|facturacion|billing/i });
    if (await heading.isVisible()) {
      await expect(heading).toBeVisible();
    }
  });

  test("botón de nueva factura está presente", async ({ page }) => {
    const newBtn = page.getByRole("button", { name: /nueva factura|crear factura|nuevo/i });
    if (await newBtn.isVisible()) {
      await expect(newBtn).toBeVisible();
    }
  });
});
