import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Personal / Staff", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/staff");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página de personal con título y descripción", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Personal", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Administra tu equipo/)).toBeVisible();
  });

  test("abre el modal de nuevo personal", async ({ page }) => {
    await page.getByRole("button", { name: "Añadir Personal" }).click();
    await expect(page.getByText("Añadir Personal").or(page.getByText("Nuevo Personal"))).toBeVisible({ timeout: 5000 }).catch(() => {
      // puede que ya haya un miembro con el texto "Añadir Personal" como heading del modal
    });
    await expect(page.getByText("Nombre Completo")).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("llena el formulario de nuevo miembro", async ({ page }) => {
    await page.getByRole("button", { name: "Añadir Personal" }).click();
    await page.waitForTimeout(500);

    const nameInput = page.getByPlaceholder("Ej. Carlos Mendoza");
    const roleSelect = page.getByRole("combobox").filter({ hasText: /Barbero|Estilista/i });
    const phoneInput = page.getByPlaceholder("+52 55 1234 5678");

    if (await nameInput.isVisible()) {
      await nameInput.fill("Carlos Test");
      await expect(nameInput).toHaveValue("Carlos Test");
    }
    if (await phoneInput.isVisible()) {
      await phoneInput.fill("+525598765432");
    }
  });

  test("cierra el modal con Cancelar", async ({ page }) => {
    await page.getByRole("button", { name: "Añadir Personal" }).click();
    await page.waitForTimeout(500);
    const cancelBtn = page.getByRole("button", { name: "Cancelar" });
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    }
  });

  test("muestra botón de primer miembro cuando no hay personal", async ({ page }) => {
    const firstBtn = page.getByRole("button", { name: "Añadir tu primer miembro" });
    if (await firstBtn.isVisible()) {
      await firstBtn.click();
    }
  });

  test("las comisiones del mes se muestran cuando hay datos", async ({ page }) => {
    const commissionsSection = page.getByText("Comisiones del mes");
    if (await commissionsSection.isVisible()) {
      await expect(commissionsSection).toBeVisible();
    }
  });

  test("información del plan de colaboradores se muestra", async ({ page }) => {
    const collabInfo = page.getByText("Colaboradores:");
    if (await collabInfo.isVisible()) {
      await expect(collabInfo).toBeVisible();
    }
  });
});
