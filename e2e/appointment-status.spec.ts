import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

/**
 * Regresión: cambiar el estado de una cita no se reflejaba en el modal.
 *
 * El PATCH salía bien (204) y el store se actualizaba, pero la barra de estados
 * comparaba contra el prop `appointment` — la foto del momento en que se abrió
 * el modal, que nunca cambia. La píldora quedaba clavada en el estado viejo y
 * el dueño creía que el clic no hacía nada, así que clickeaba de nuevo.
 *
 * Se apoya en `aria-pressed`, que es también lo que le dice a un lector de
 * pantalla cuál de los cuatro estados está activo.
 */

const TITLE = `E2E estado ${Date.now()}`;

test.describe("Estado de una cita", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/calendar");
    await page.waitForLoadState("networkidle");
  });

  test("la píldora seleccionada sigue al estado guardado", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva Cita" }).first().click();
    await expect(page.getByRole("heading", { name: "Nueva Cita" })).toBeVisible({
      timeout: 10000,
    });

    await page.getByPlaceholder("Ej. Corte de cabello").fill(TITLE);
    await page.getByRole("button", { name: "Crear Cita" }).click();

    // Reabrir la cita recién creada para ver la barra de estados (solo aparece
    // en modo edición).
    await expect(page.getByRole("heading", { name: "Nueva Cita" })).toBeHidden({
      timeout: 15000,
    });
    await page.getByText(TITLE).first().click();
    await expect(page.getByRole("heading", { name: "Editar Cita" })).toBeVisible({
      timeout: 10000,
    });

    const pendiente = page.getByRole("button", { name: "Pendiente" });
    const confirmada = page.getByRole("button", { name: "Confirmada" });

    await expect(pendiente).toHaveAttribute("aria-pressed", "true");
    await expect(confirmada).toHaveAttribute("aria-pressed", "false");

    await confirmada.click();

    // Esto es lo que fallaba: sin releer del store, quedaba en "pending".
    await expect(confirmada).toHaveAttribute("aria-pressed", "true", { timeout: 10000 });
    await expect(pendiente).toHaveAttribute("aria-pressed", "false");
  });

  test.afterEach(async ({ page }) => {
    // Deja el calendario como estaba: la cita de prueba no debe acumularse.
    // El modal queda abierto al terminar la prueba y su backdrop intercepta los
    // clics, así que hay que borrar DESDE el modal, no reabrirlo.
    const modalOpen = await page
      .getByRole("heading", { name: "Editar Cita" })
      .isVisible()
      .catch(() => false);

    if (!modalOpen) {
      const created = page.getByText(TITLE).first();
      if (!(await created.isVisible().catch(() => false))) return;
      await created.click();
      await page.getByRole("heading", { name: "Editar Cita" }).waitFor({ timeout: 10000 });
    }

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Eliminar" }).click();
    await page
      .getByRole("heading", { name: "Editar Cita" })
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
  });
});
