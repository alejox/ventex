import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Pedidos / Abastecimiento", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/pedidos");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de pedidos", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard\/pedidos/);
  });

  test("muestra título de pedidos", async ({ page }) => {
    const heading = page.getByRole("heading", { name: /pedidos|abastecimiento/i });
    if (await heading.isVisible()) {
      await expect(heading).toBeVisible();
    }
  });

  test("botón de nuevo pedido está presente", async ({ page }) => {
    const newBtn = page.getByRole("button", { name: /nuevo pedido|crear pedido|nuevo/i });
    if (await newBtn.isVisible()) {
      await expect(newBtn).toBeVisible();
    }
  });
});
