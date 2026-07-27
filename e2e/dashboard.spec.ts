import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("carga el dashboard después de login", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Ventas hoy")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Productos con stock bajo")).toBeVisible({ timeout: 10000 });
  });

  // El resumen financiero vivía en /dashboard/finance; ahora el Panel es su
  // único lugar, así que la cobertura de esos KPIs se valida aquí.
  test("muestra el resumen financiero", async ({ page }) => {
    await expect(page.getByText("Ingresos totales")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Gastos totales")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Beneficio neto")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Ingresos vs Gastos (últimos 6 meses)")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Movimientos recientes")).toBeVisible({ timeout: 10000 });
  });

  test("el dueño puede abrir el formulario de gasto", async ({ page }) => {
    await page.getByRole("button", { name: /registrar gasto/i }).click();
    const modal = page.getByRole("heading", { name: "Registrar Gasto" });
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder("Ej. Pago a proveedor")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(modal).toBeHidden();
  });

  // La sección Finanzas se eliminó: su contenido está en el Panel y no debe
  // quedar ningún enlace huérfano en la navegación.
  test("no queda enlace a Finanzas en el sidebar", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Finanzas" })).toHaveCount(0);
  });
});
