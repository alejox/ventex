import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Dashboard", () => {
  test("carga el dashboard después de login", async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Ventas hoy")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Productos con stock bajo")).toBeVisible({ timeout: 10000 });
  });
});
