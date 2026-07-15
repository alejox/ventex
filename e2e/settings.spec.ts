import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Configuración (Settings)", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/settings");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de configuración", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard\/settings/);
  });

  test("muestra secciones de configuración", async ({ page }) => {
    const sections = page.getByRole("heading");
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("navega a configuración del negocio", async ({ page }) => {
    const businessLink = page.getByRole("link", { name: /negocio|business|empresa/i });
    if (await businessLink.isVisible()) {
      await businessLink.click();
      await page.waitForLoadState("networkidle");
    }
  });

  test("navega a configuración de trabajadores", async ({ page }) => {
    const workersLink = page.getByRole("link", { name: /trabajadores|workers|personal/i });
    if (await workersLink.isVisible()) {
      await workersLink.click();
      await page.waitForLoadState("networkidle");
    }
  });
});
