import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Admin", () => {
  test("redirige al dashboard si no es super admin", async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
