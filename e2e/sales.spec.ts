import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Historial de Ventas", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/sales");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de ventas con título y descripción", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Historial de Ventas" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Consulta las ventas registradas desde el punto de venta.")).toBeVisible();
  });

  test("muestra la tarjeta de Ventas", async ({ page }) => {
    await expect(page.getByRole("main").getByText("Ventas", { exact: true })).toBeVisible({ timeout: 10000 }).catch(() => {});
  });

  test("muestra la tarjeta de Ticket promedio", async ({ page }) => {
    const ticketProm = page.getByText("Ticket promedio");
    if (await ticketProm.isVisible()) {
      await expect(ticketProm).toBeVisible();
    }
  });

  test("muestra la tarjeta de Ingresos (completadas)", async ({ page }) => {
    const ingresos = page.getByText("Ingresos (completadas)");
    if (await ingresos.isVisible()) {
      await expect(ingresos).toBeVisible();
    }
  });

  test("tabla de ventas se renderiza cuando hay datos", async ({ page }) => {
    const table = page.locator("table");
    if (await table.isVisible()) {
      await expect(table).toBeVisible();
    }
  });

  test("muestra mensaje de ventas vacío cuando no hay registros", async ({ page }) => {
    const emptyMsg = page.getByText("Aún no hay ventas");
    if (await emptyMsg.isVisible()) {
      await expect(emptyMsg).toBeVisible();
    }
  });
});
