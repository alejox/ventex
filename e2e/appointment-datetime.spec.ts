import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

/**
 * Fecha y hora de la cita en un solo campo que abre un diálogo.
 *
 * No guarda nada: abre «Nueva Cita», juega con el selector y cierra, así que no
 * deja citas de prueba en la base.
 */
test.describe("Cita: selector de fecha y hora", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/calendar");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Nueva Cita" }).first().click();
    await expect(page.getByRole("heading", { name: "Nueva Cita" })).toBeVisible({ timeout: 10000 });
  });

  test("muestra el resumen en una línea y el calendario solo al abrirlo", async ({ page }) => {
    const field = page.getByRole("button", { name: /Cambiar/ });
    await expect(field).toBeVisible();
    // El calendario del mes ya no ocupa el formulario.
    await expect(page.getByRole("dialog", { name: "Elegir fecha y hora" })).toBeHidden();
    await field.click();
    const dialog = page.getByRole("dialog", { name: "Elegir fecha y hora" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Mes siguiente" })).toBeVisible();
  });

  test("elegir día y duración se aplica solo con «Listo»", async ({ page }) => {
    const field = page.getByRole("button", { name: /Cambiar/ });
    const before = await field.innerText();

    await field.click();
    const dialog = page.getByRole("dialog", { name: "Elegir fecha y hora" });
    await dialog.getByRole("button", { name: "Mes siguiente" }).click();
    await dialog.getByRole("button", { name: "20", exact: true }).click();
    await dialog.getByRole("button", { name: "1 hora", exact: true }).click();

    // Cancelar no toca la cita.
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    expect(await field.innerText()).toBe(before);

    await field.click();
    await dialog.getByRole("button", { name: "Mes siguiente" }).click();
    await dialog.getByRole("button", { name: "20", exact: true }).click();
    await dialog.getByRole("button", { name: "1 hora", exact: true }).click();
    await dialog.getByRole("button", { name: "Listo" }).click();
    await expect(dialog).toBeHidden();

    const after = await field.innerText();
    expect(after).not.toBe(before);
    expect(after).toMatch(/20 de /);
    expect(after).toMatch(/1 hora/);
  });

  test("Escape cierra solo el selector, no la cita", async ({ page }) => {
    await page.getByRole("button", { name: /Cambiar/ }).click();
    const dialog = page.getByRole("dialog", { name: "Elegir fecha y hora" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Nueva Cita" })).toBeVisible();
  });

  test("no deja confirmar si la hora de fin es anterior a la de inicio", async ({ page }) => {
    await page.getByRole("button", { name: /Cambiar/ }).click();
    const dialog = page.getByRole("dialog", { name: "Elegir fecha y hora" });
    await dialog.getByLabel("Hora de fin: hora").selectOption({ index: 0 });
    await dialog.getByLabel("Hora de fin: AM o PM").selectOption("AM");
    await dialog.getByLabel("Hora de inicio: AM o PM").selectOption("PM");
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Listo" })).toBeDisabled();
  });
});
