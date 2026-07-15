import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Reseller", () => {
  test("redirige al dashboard si no es reseller", async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/reseller");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
