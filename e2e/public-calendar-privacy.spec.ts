import { test, expect } from "@playwright/test";

/**
 * El calendario público muestra los turnos ocupados para que el visitante vea
 * qué queda libre. Esa es la parte útil. La parte delicada es la otra: un turno
 * ocupado sólo puede decir "Reservado".
 *
 * Nadie de afuera tiene por qué saber QUIÉN reservó, ni con qué profesional, ni
 * cuánto pagó. La garantía vive en `public_site_day_slots()`, que devuelve
 * únicamente `(slot_time, slot_state)` — pero una garantía de SQL no impide que
 * alguien, más adelante, agregue el nombre del cliente al payload "para que se
 * vea mejor". Este test es el que lo va a frenar.
 *
 * Se salta solo si el sitio de prueba no está publicado: el estado de
 * publicación es del dueño, y un test no debe romperse porque alguien ejerza su
 * derecho a despublicar.
 */

const SLUG = "lebarb";

test.describe("Privacidad del calendario público", () => {
  test("un turno ocupado dice Reservado y nada más", async ({ page }) => {
    const response = await page.goto(`/${SLUG}`);
    test.skip(response?.status() === 404, `El sitio /${SLUG} no está publicado`);

    await page.waitForLoadState("networkidle");

    // La grilla se llena en cliente; esperamos a que aparezca algún turno.
    const anySlot = page.locator("li, button").filter({ hasText: /^\d{2}:\d{2}/ }).first();
    await expect(anySlot).toBeVisible({ timeout: 20000 });

    const dom = await page.content();

    // Ni el vocabulario del modelo de datos debería asomar en el DOM público.
    for (const forbidden of ["customer_id", "staff_id", "appointment_id", "customers("]) {
      expect(dom, `"${forbidden}" no puede aparecer en el sitio público`).not.toContain(forbidden);
    }

    // Un turno ocupado se marca, pero sin decir de quién es. Se busca en los
    // <li> de la grilla y no por texto suelto: "Reservado" también está en la
    // leyenda, y esa no es la que interesa auditar.
    const reservedSlots = page.locator("li").filter({ hasText: "Reservado" });

    // El día que se abre por defecto es el primero con cupo, que justamente
    // suele NO tener reservas. Hay que recorrer la tira hasta encontrar un día
    // ocupado; si no, este test pasaría sin haber mirado nada.
    const dayButtons = page.locator("button[aria-pressed]").filter({ hasText: /libres/ });
    const dayCount = await dayButtons.count();
    let found = 0;

    for (let d = 0; d < dayCount && found === 0; d++) {
      await dayButtons.nth(d).click();
      await expect(page.getByText("Buscando horarios…")).toHaveCount(0, { timeout: 15000 });
      found = await reservedSlots.count();
    }

    test.skip(found === 0, "Ningún día del período tiene turnos reservados para auditar");

    for (let i = 0; i < found; i++) {
      const label = (await reservedSlots.nth(i).innerText()).replace(/\s+/g, " ").trim();
      // Sólo la hora y la palabra: nada que identifique a una persona.
      expect(label, "un turno ocupado sólo puede mostrar la hora y 'Reservado'").toMatch(
        /^\d{2}:\d{2} RESERVADO$/i,
      );
    }
  });

  test("la tira de días informa disponibilidad sin exponer la agenda", async ({ page }) => {
    const response = await page.goto(`/${SLUG}`);
    test.skip(response?.status() === 404, `El sitio /${SLUG} no está publicado`);

    await page.waitForLoadState("networkidle");

    const days = page.locator("button[aria-pressed]").filter({
      hasText: /libres|Cerrado|Lleno/,
    });
    await expect(days.first()).toBeVisible({ timeout: 20000 });

    // Un día cerrado no se puede elegir: el negocio no atiende y punto.
    const closed = days.filter({ hasText: "Cerrado" }).first();
    if ((await closed.count()) > 0) {
      await expect(closed).toBeDisabled();
    }
  });
});
