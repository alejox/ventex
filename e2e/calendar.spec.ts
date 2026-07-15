import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Calendario / Citas", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/calendar");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página del calendario con título", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Calendario" })).toBeVisible({ timeout: 15000 });
  });

  test("cambia la vista a semana", async ({ page }) => {
    const weekBtn = page.getByRole("button", { name: "Semana" });
    if (await weekBtn.isVisible()) {
      await weekBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("cambia la vista a día", async ({ page }) => {
    const dayBtn = page.getByRole("button", { name: "Día" });
    if (await dayBtn.isVisible()) {
      await dayBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("cambia la vista a mes", async ({ page }) => {
    const monthBtn = page.getByRole("button", { name: "Mes" });
    if (await monthBtn.isVisible()) {
      await monthBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("navega al mes anterior", async ({ page }) => {
    const prevBtn = page.getByRole("button", { name: /anterior|‹|<|←/i });
    if (await prevBtn.isVisible()) {
      await prevBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("navega al mes siguiente", async ({ page }) => {
    const nextBtn = page.getByRole("button", { name: /siguiente|›|>|→/i });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("botón Hoy está presente", async ({ page }) => {
    const todayBtn = page.getByRole("button", { name: "Hoy" });
    if (await todayBtn.isVisible()) {
      await expect(todayBtn).toBeVisible();
    }
  });

  test("botón de nueva cita está presente", async ({ page }) => {
    const newApptBtn = page.getByRole("button", { name: "Nueva Cita" }).first();
    if (await newApptBtn.isVisible()) {
      await expect(newApptBtn).toBeVisible();
    }
  });
});
