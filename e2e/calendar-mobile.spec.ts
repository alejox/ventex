import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

/**
 * E8 / E24: en el teléfono el calendario abre en Día (la semana no entra), la
 * vista elegida a mano se respeta, y tocar un día en Mes abre ese día.
 */
test.describe("Calendario en pantalla angosta", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/calendar");
    // Sin una vista guardada de otra corrida: se prueba el valor por defecto.
    await page.evaluate(() => {
      try { window.localStorage.removeItem("ventex.calendar.view"); } catch { /* sin storage */ }
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
  });

  test("abre en vista Día con botones grandes para cambiar de día", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Día", exact: true })).toHaveAttribute("aria-pressed", "true");
    const next = page.getByRole("button", { name: "Día siguiente" });
    await expect(next).toBeVisible();
    const box = await next.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("la vista elegida a mano se recuerda", async ({ page }) => {
    await page.getByRole("button", { name: "Semana", exact: true }).click();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "Semana", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("tocar un día en Mes abre la vista Día de esa fecha", async ({ page }) => {
    await page.getByRole("button", { name: "Mes", exact: true }).click();
    await page.getByRole("button", { name: /^Ver el .* 15 de / }).first().click();
    await expect(page.getByRole("button", { name: "Día", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { level: 2, name: /15/ })).toBeVisible();
  });
});
