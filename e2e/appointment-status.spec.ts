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
 * El modal ya no tiene una barra de cuatro píldoras: el estado se muestra como
 * chip junto al título ("Pendiente"/"Confirmada"), y la acción de una cita
 * pendiente es "Confirmar reserva". Lo que se custodia es lo mismo: que el
 * modal abierto lea el estado VIVO del store (`liveStatus`) y no la foto del
 * prop — si no, tras confirmar seguiría diciendo "Pendiente".
 */

const TITLE = `E2E estado ${Date.now()}`;

test.describe("Estado de una cita", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/calendar");
    await page.waitForLoadState("networkidle");
  });

  test("el estado mostrado sigue al estado guardado", async ({ page }) => {
    await page.getByRole("button", { name: "Nueva Cita" }).first().click();
    const nueva = page.getByRole("dialog", { name: "Nueva cita" });
    await expect(nueva).toBeVisible({ timeout: 10000 });

    // El título se autogenera; para poder reencontrar la cita se personaliza.
    await nueva.getByText("Personalizar título").click();
    await nueva.getByPlaceholder("Ej. Corte de cabello").fill(TITLE);
    await nueva.getByRole("button", { name: "Crear cita" }).click();

    // Reabrir la cita recién creada (la confirmación solo existe en edición).
    await expect(nueva).toBeHidden({ timeout: 15000 });
    await page.getByText(TITLE).first().click();
    const editar = page.getByRole("dialog", { name: "Editar cita" });
    await expect(editar).toBeVisible({ timeout: 10000 });

    const chip = editar.getByText(/^(Pendiente|Confirmada|Completada|Cancelada)$/);
    await expect(chip).toHaveText("Pendiente");

    await editar.getByRole("button", { name: "Confirmar reserva" }).click();

    // Esto es lo que fallaba: sin releer del store, quedaba en "Pendiente".
    await expect(chip).toHaveText("Confirmada", { timeout: 10000 });
    await expect(editar.getByRole("status")).toHaveText("Reserva confirmada");
    await expect(editar.getByRole("button", { name: "Confirmar reserva" })).toHaveCount(0);
  });

  test.afterEach(async ({ page }) => {
    // Deja el calendario como estaba: la cita de prueba no debe acumularse.
    // El modal queda abierto al terminar la prueba y su backdrop intercepta los
    // clics, así que hay que borrar DESDE el modal, no reabrirlo.
    const editar = page.getByRole("dialog", { name: "Editar cita" });
    const modalOpen = await editar.isVisible().catch(() => false);

    if (!modalOpen) {
      const created = page.getByText(TITLE).first();
      if (!(await created.isVisible().catch(() => false))) return;
      await created.click();
      await editar.waitFor({ timeout: 10000 });
    }

    // Eliminar vive en "Más acciones" y pide confirmación en un segundo diálogo.
    await editar.getByText("Más acciones").click();
    await editar.getByRole("button", { name: "Eliminar cita" }).click();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await editar.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
  });
});
