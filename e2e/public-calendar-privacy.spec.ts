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

    // La grilla del mes se llena en cliente; esperamos a que aparezca algún día.
    // Cada día dice su estado en el aria-label ("…, 5 turnos libres", "…, cerrado").
    const dayButtons = page.getByRole("button", { name: /turnos libres$/ });
    await expect(dayButtons.first()).toBeVisible({ timeout: 20000 });

    const dom = await page.content();

    // Ni el vocabulario del modelo de datos debería asomar en el DOM público.
    for (const forbidden of ["customer_id", "staff_id", "appointment_id", "customers("]) {
      expect(dom, `"${forbidden}" no puede aparecer en el sitio público`).not.toContain(forbidden);
    }

    // Un turno ocupado se marca, pero sin decir de quién es. Los horarios del
    // día elegido aparecen en línea (región "Horarios del <fecha>"): los libres
    // son botones y los ocupados o ya pasados, <li> de texto ("Reservado" / "Pasó").
    //
    // El primer día con cupo suele NO tener reservas. Hay que recorrer los días
    // hasta encontrar uno ocupado; si no, este test pasaría sin haber mirado nada.
    const dayCount = await dayButtons.count();
    let labels: string[] = [];

    for (let d = 0; d < dayCount && labels.length === 0; d++) {
      const day = dayButtons.nth(d);
      // "<fecha>, <estado>": la fecha ya trae su propia coma ("lunes, 3 de …").
      const dayLabel = ((await day.getAttribute("aria-label")) ?? "").replace(/, [^,]+$/, "");
      await day.click();
      // La región se renombra con el día elegido: esperar ESA evita leer los
      // horarios del día anterior.
      const hours = page.getByRole("region", { name: `Horarios del ${dayLabel}` });
      await expect(hours).toBeVisible();
      await expect(hours.getByText("Buscando horarios…")).toHaveCount(0, { timeout: 15000 });
      const reserved = hours.locator("li").filter({ hasText: /Reservado/i });
      labels = (await reserved.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    }

    test.skip(labels.length === 0, "Ningún día del período tiene turnos reservados para auditar");

    for (const label of labels) {
      // Sólo la hora (12 o 24 h, según el negocio) y la palabra: nada que
      // identifique a una persona.
      expect(label, "un turno ocupado sólo puede mostrar la hora y 'Reservado'").toMatch(
        /^\d{1,2}:\d{2}( [AP]M)? RESERVADO$/i,
      );
    }
  });

  test("el calendario del mes informa disponibilidad sin exponer la agenda", async ({ page }) => {
    const response = await page.goto(`/${SLUG}`);
    test.skip(response?.status() === 404, `El sitio /${SLUG} no está publicado`);

    await page.waitForLoadState("networkidle");

    // Cada día del mes es un botón cuyo aria-label es "<fecha>, <estado>".
    const allowedState = /, (\d+ turnos libres|cerrado|cerrado por hoy|sin cupos|todavía no se puede reservar)$/;
    const days = page.locator('button[aria-pressed][aria-label*=", "]');
    await expect(page.getByRole("button", { name: allowedState }).first()).toBeVisible({ timeout: 20000 });

    const labels = await days.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
    expect(labels.length, "el calendario del mes tiene que mostrar días").toBeGreaterThan(0);
    for (const label of labels) {
      // El estado de un día es un conteo o una palabra, nunca quién reservó.
      expect(label, "el aria-label de un día sólo puede decir su disponibilidad").toMatch(allowedState);
    }

    // Un día cerrado (o sin cupos) no se puede elegir.
    const closed = page.getByRole("button", { name: /, (cerrado|sin cupos)$/ }).first();
    if ((await closed.count()) > 0) {
      await expect(closed).toBeDisabled();
    }
  });
});
