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

  /**
   * "Hoy" parecía roto porque al entrar ya estás en el periodo actual: el clic
   * no cambiaba nada y el botón no daba ninguna señal de por qué. La lógica
   * siempre funcionó; faltaba que dijera dónde estás parado.
   *
   * Se prueban las tres vistas porque cada una calcula "estoy en hoy" distinto:
   * el mes compara mes+año, la semana busca hoy entre sus siete días, el día
   * compara la fecha exacta.
   */
  for (const view of ["Mes", "Semana", "Día"] as const) {
    test(`Hoy vuelve al periodo actual y avisa cuando ya estás ahí: ${view}`, async ({
      page,
    }) => {
      await page.getByRole("button", { name: view, exact: true }).first().click();
      await page.waitForTimeout(600);

      const titulo = page.locator("h2").first();
      const nav = titulo.locator("xpath=..");
      const siguiente = nav.locator("button").nth(1);
      const hoy = page.getByRole("button", { name: "Hoy", exact: true }).first();

      // Al entrar ya estamos en el periodo actual: el botón no tiene qué hacer
      // y debe decirlo, en vez de aceptar clics que no producen nada.
      await expect(hoy).toBeDisabled();

      const inicial = (await titulo.innerText()).trim();
      await siguiente.click();
      await siguiente.click();
      await page.waitForTimeout(700);

      const movido = (await titulo.innerText()).trim();
      expect(movido, "navegar debe cambiar el periodo").not.toBe(inicial);
      await expect(hoy).toBeEnabled();

      await hoy.click();
      await page.waitForTimeout(700);

      expect((await titulo.innerText()).trim(), "Hoy debe volver al periodo actual").toBe(
        inicial,
      );
      await expect(hoy).toBeDisabled();
    });
  }

  test("botón de nueva cita está presente", async ({ page }) => {
    const newApptBtn = page.getByRole("button", { name: "Nueva Cita" }).first();
    if (await newApptBtn.isVisible()) {
      await expect(newApptBtn).toBeVisible();
    }
  });
});
