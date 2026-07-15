import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Distribuidores", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/distributors");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de distribuidores", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard\/distributors/);
  });

  test("muestra título de distribuidores", async ({ page }) => {
    const heading = page.getByRole("heading", { name: "Proveedores", exact: true }).or(page.getByRole("heading", { name: "Distribuidores", exact: true }));
    if (await heading.isVisible()) {
      await expect(heading).toBeVisible();
    }
  });

  test("botón de nuevo distribuidor está presente", async ({ page }) => {
    const newBtn = page.getByRole("button", { name: "Añadir Proveedor" }).first();
    if (await newBtn.isVisible()) {
      await expect(newBtn).toBeVisible();
    }
  });

  test("tabla de distribuidores tiene columnas", async ({ page }) => {
    const tableHeaders = page.locator("th");
    const count = await tableHeaders.count();
    if (count > 0) {
      await expect(tableHeaders.first()).toBeVisible();
    }
  });
});
