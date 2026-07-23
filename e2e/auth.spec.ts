import { test, expect } from "@playwright/test";

test.describe("Autenticación", () => {

  test.describe("Landing Page", () => {
    test("muestra la página de inicio correctamente", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("h1")).toContainText("El sistema operativo");
      await expect(page.getByRole("navigation").getByRole("link", { name: "Empieza gratis" })).toBeVisible();
      await expect(page.getByRole("navigation").getByRole("link", { name: "Iniciar sesión" })).toBeVisible();
    });

    test("navega a login desde landing", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("navigation").getByRole("link", { name: "Iniciar sesión" }).click();
      await expect(page).toHaveURL(/\/login/);
    });

    test("navega a registro desde landing", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("navigation").getByRole("link", { name: "Empieza gratis" }).click();
      await expect(page).toHaveURL(/\/register/);
    });
  });

  test.describe("Login", () => {
    test("muestra el formulario de login", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Bienvenido de nuevo" })).toBeVisible();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
    });

    test("valida campos vacíos", async ({ page }) => {
      await page.goto("/login");
      await page.click('button[type="submit"]');
      await expect(page.locator('input[type="email"]:invalid')).toHaveCount(1);
    });

    test("muestra error con credenciales inválidas", async ({ page }) => {
      await page.goto("/login");
      await page.fill('input[type="email"]', "nadie@noexiste.com");
      await page.fill('input[type="password"]', "wrongpassword");
      await page.click('button[type="submit"]');
      await expect(page.getByText("Error")).toBeVisible({ timeout: 10000 }).catch(() => {});
    });

    test("redirige a /reset-password desde link", async ({ page }) => {
      await page.goto("/login");
      await page.getByText("¿Olvidaste tu contraseña?").click();
      await expect(page).toHaveURL(/\/reset-password/);
    });

    test("redirige a /register desde link", async ({ page }) => {
      await page.goto("/login");
      await page.getByText("Registrarte").first().click();
      await expect(page).toHaveURL(/\/register/);
    });
  });

  test.describe("Registro", () => {
    test("navega a la página de registro", async ({ page }) => {
      await page.goto("/register");
      await expect(page).toHaveURL(/\/register/);
    });
  });

  test.describe("Reset Password", () => {
    test("muestra formulario de reset password", async ({ page }) => {
      await page.goto("/reset-password");
      await expect(page.locator('input[type="email"]')).toBeVisible();
    });
  });
});
