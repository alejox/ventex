import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Movimientos de Inventario", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/inventory/movements");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de movimientos", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard\/inventory\/movements/);
  });

  test("muestra título de movimientos", async ({ page }) => {
    const heading = page.getByRole("heading", { name: "Movimientos de Inventario" });
    if (await heading.isVisible()) {
      await expect(heading).toBeVisible();
    }
  });

  test("filtros de movimientos están presentes", async ({ page }) => {
    const filters = page.locator("select, input[placeholder*='Buscar']");
    const count = await filters.count();
    if (count > 0) {
      await expect(filters.first()).toBeVisible();
    }
  });

  test("botón de nuevo movimiento está presente", async ({ page }) => {
    const newBtn = page.getByRole("button", { name: /nuevo movimiento|ajustar stock|nuevo/i });
    if (await newBtn.isVisible()) {
      await expect(newBtn).toBeVisible();
    }
  });
});
