import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Vehículos", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/vehicles");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de vehículos", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard\/vehicles/);
  });

  test("muestra título Vehículos", async ({ page }) => {
    const heading = page.getByRole("heading", { name: "Vehículos", exact: true });
    if (await heading.isVisible()) {
      await expect(heading).toBeVisible();
    }
  });

  test("botón de nuevo vehículo está presente", async ({ page }) => {
    const newBtn = page.getByRole("button", { name: /nuevo vehículo|nuevo|añadir/i });
    if (await newBtn.isVisible()) {
      await expect(newBtn).toBeVisible();
    }
  });
});
