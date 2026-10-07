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
    await expect(page.getByRole("heading", { level: 1, name: "Panel de control" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Ventas de hoy")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Productos con stock bajo")).toBeVisible({ timeout: 10000 });
  });

  // El resumen financiero vivía en /dashboard/finance; ahora el Panel es su
  // único lugar, así que la cobertura de esos KPIs se valida aquí.
  test("muestra el resumen financiero", async ({ page }) => {
    // KPIs por período (selector "Este mes" por defecto): Ingresos, Egresos y
    // Flujo de caja (antes "Beneficio neto", que no era beneficio).
    await expect(page.getByRole("button", { name: "Este mes" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/^Ingresos · /)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/^Egresos · /)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/^Flujo de caja · /)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Ingresos vs egresos (últimos 6 meses)" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Movimientos recientes")).toBeVisible({ timeout: 10000 });
  });

  test("el dueño puede abrir el formulario de gasto", async ({ page }) => {
    // Hay dos disparadores: el atajo con ícono de la barra superior
    // (aria-label "Registrar gasto") y el botón principal del Panel. Se usa el
    // del Panel, que es el que muestra el texto.
    await page.getByRole("main").getByRole("button", { name: "Registrar gasto", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Registrar gasto" });
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel("Descripción")).toBeVisible();
    await expect(page.getByLabel(/^Monto/)).toBeVisible();
    await modal.getByRole("button", { name: "Cancelar" }).click();
    await expect(modal).toBeHidden();
  });

  // La sección Finanzas se eliminó: su contenido está en el Panel y no debe
  // quedar ningún enlace huérfano en la navegación.
  test("no queda enlace a Finanzas en el sidebar", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Finanzas" })).toHaveCount(0);
  });
});
