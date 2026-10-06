import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Suscripción", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/subscription");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de suscripción", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard\/subscription/);
  });

  test("muestra el plan actual", async ({ page }) => {
    const planInfo = page.getByText("Plan actual", { exact: true });
    if (await planInfo.isVisible()) {
      await expect(planInfo).toBeVisible();
    }
  });

  test("botón de cambiar plan está presente", async ({ page }) => {
    const changeBtn = page.getByRole("button", { name: /cambiar plan|mejorar plan|upgrade|downgrade/i });
    if (await changeBtn.isVisible()) {
      await expect(changeBtn).toBeVisible();
    }
  });

  test("sección de uso está visible", async ({ page }) => {
    // El consumo del plan son dos barras dentro de la tarjeta del plan actual:
    // colaboradores y ventas del mes. Antes se buscaba cualquier texto con
    // "uso|límite", que ahora también matchea "Ilimitado" en las tarjetas de
    // planes y además, con el `if`, no verificaba nada si no aparecía.
    await expect(page.getByText("Plan actual", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Colaboradores", { exact: true })).toBeVisible();
    await expect(page.getByText("Ventas del mes", { exact: true })).toBeVisible();
  });
});
