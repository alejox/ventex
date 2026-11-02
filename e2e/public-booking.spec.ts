import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";
import {
  appointmentStatus,
  bookingSiteOrSkipReason,
  cleanupBookings,
  seedSiteBooking,
  uniqueBookingPhone,
  type BookingSite,
} from "./helpers/booking";

/**
 * Flujo de reservas del sitio público, de punta a punta:
 *   (a) el visitante reserva y llega a la pantalla de éxito;
 *   (b) cancela con su celular;
 *   (c) el dueño confirma la reserva pendiente desde "Pendientes".
 *
 * ESCRIBE en la base compartida: solo corre con `E2E_BOOKING_SLUG` apuntando a
 * un sitio del negocio E2E (ver `e2e/helpers/booking.ts`) y limpia en
 * `afterAll` todo lo que creó (citas, cliente; notificaciones según el
 * entorno).
 */

test.describe.configure({ mode: "serial" });

test.describe("Reservas del sitio público", () => {
  let site: BookingSite | null = null;
  let skipReason = "";
  const phones: string[] = [];
  const stamp = Date.now();

  test.beforeAll(async () => {
    const result = await bookingSiteOrSkipReason();
    if (typeof result === "string") skipReason = result;
    else site = result;
  });

  test.beforeEach(() => {
    test.skip(site === null, skipReason);
  });

  test.afterAll(async () => {
    await cleanupBookings(phones);
  });

  test("(a) el visitante reserva y ve la confirmación", async ({ page }) => {
    const phone = uniqueBookingPhone();
    phones.push(phone);
    const name = `E2E Reserva ${stamp}`;

    await page.goto(`/${site!.slug}#reservar`);
    const booking = page.locator("#reservar");
    await expect(booking.getByRole("combobox", { name: "Servicio" })).toBeVisible({ timeout: 20000 });

    // El primer día con cupo del mes (o del siguiente, si este ya no tiene).
    const freeDay = booking.getByRole("button", { name: /horarios libres$/ }).first();
    if ((await freeDay.count()) === 0) {
      await booking.getByRole("button", { name: "Mes siguiente" }).click();
    }
    await expect(freeDay).toBeVisible({ timeout: 20000 });
    await freeDay.click();

    // Los horarios del día aparecen en línea, junto al calendario.
    const hours = page.getByRole("region", { name: /^Horarios del / });
    await expect(hours).toBeVisible();
    // Los horarios libres son botones; ocupados/pasados son <li> de texto.
    const slot = hours.locator("li > button").first();
    await slot.click();
    await expect(slot).toHaveAttribute("aria-pressed", "true");

    await page.locator("#booking-name").fill(name);
    await page.locator("#booking-phone").fill(phone);
    await booking.getByRole("button", { name: /^Reservar a las / }).click();

    await expect(booking.getByRole("heading", { name: /Recibimos tu reserva/ })).toBeVisible({ timeout: 20000 });
    await expect(booking.getByText("pendiente de confirmación")).toBeVisible();
  });

  test("(b) cancelar con el celular encuentra y cancela la cita", async ({ page }) => {
    const phone = uniqueBookingPhone();
    phones.push(phone);
    const seeded = await seedSiteBooking(site!.slug, `E2E Cancela ${stamp}`, phone);

    await page.goto(`/${site!.slug}#reservar`);
    await page.getByRole("button", { name: "Cancelar cita", exact: true }).click();

    const modal = page.getByRole("dialog", { name: "Cancelar mi cita" });
    await expect(modal).toBeVisible();
    await modal.locator("#cancel-phone").fill(phone);
    await modal.getByRole("button", { name: "Buscar mis citas" }).click();

    const row = modal.locator("li").filter({ hasText: seeded.service });
    await expect(row).toHaveCount(1, { timeout: 15000 });
    await row.getByRole("button", { name: "Cancelar", exact: true }).click();

    await page.getByRole("button", { name: "Sí, cancelar" }).click();
    await expect(modal.getByRole("status")).toContainText("cancelamos tu cita", { timeout: 15000 });

    await expect.poll(() => appointmentStatus(seeded.id)).toBe("cancelled");
  });

  test("(c) el dueño confirma una reserva pendiente desde Pendientes", async ({ page }) => {
    const phone = uniqueBookingPhone();
    phones.push(phone);
    const customer = `E2E Confirma ${stamp}`;
    const seeded = await seedSiteBooking(site!.slug, customer, phone);

    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar con la cuenta E2E");

    await page.goto("/dashboard/calendar");
    await page.getByRole("button", { name: /^Pendientes/ }).click();
    await expect(page.getByRole("heading", { name: /^Reservas pendientes/ })).toBeVisible({ timeout: 15000 });

    await page.getByRole("button").filter({ hasText: customer }).first().click();
    await page.getByRole("button", { name: "Confirmar reserva" }).click();
    await expect(page.getByText("Reserva confirmada.")).toBeVisible({ timeout: 15000 });

    await expect.poll(() => appointmentStatus(seeded.id)).toBe("confirmed");
  });
});
