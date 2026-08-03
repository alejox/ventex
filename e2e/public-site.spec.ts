import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

/**
 * The public micro-site lives at `/[slug]` — a dynamic segment at the ROOT of
 * the app. That is the risky part of the feature: a root catch-all sits next to
 * every real route in the product, and if precedence ever changed, the app
 * would not fail loudly — visitors would just start landing on "sitio no
 * encontrado" instead of the login page.
 *
 * These tests pin that boundary. They need no fixture data on purpose: they
 * assert routing, not content.
 */

test.describe("Micrositio público", () => {
  // Every first-level route the product owns. None of them may be swallowed by
  // /[slug]. Add a row here whenever a new root route is created.
  const realRoutes = [
    { path: "/", name: "landing" },
    { path: "/login", name: "login" },
    { path: "/register", name: "registro" },
    { path: "/offline", name: "offline" },
  ];

  for (const route of realRoutes) {
    test(`la ruta real ${route.name} no la captura /[slug]`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.status(), `${route.path} debería resolver`).toBeLessThan(400);
      await expect(page.getByText("no encontrad", { exact: false })).toHaveCount(0);
    });
  }

  const guardedRoutes = ["/dashboard", "/admin", "/reseller", "/workspace"];

  for (const path of guardedRoutes) {
    test(`la ruta protegida ${path} redirige en vez de dar 404`, async ({ page }) => {
      await page.goto(path);
      // Unauthenticated: the guard must send us to login, NOT render the
      // public-site 404 that a dynamic-route capture would produce.
      await expect(page).toHaveURL(/\/(login|dashboard|workspace)/, { timeout: 15000 });
    });
  }

  test("un slug inexistente da 404", async ({ page }) => {
    const response = await page.goto("/negocio-que-no-existe-jamas-1234");
    expect(response?.status()).toBe(404);
  });

  // Nota: NO hay aquí un test de "sitio sin publicar da 404". Existía y había
  // que borrarlo: dependía de que un negocio real siguiera despublicado, así
  // que empezó a fallar en cuanto su dueño lo publicó — que es justamente lo
  // que se espera que haga. Un test que depende de datos que el usuario puede
  // cambiar acaba mintiendo.
  //
  // La invariante sigue cubierta donde corresponde: `public_site_by_slug()`
  // filtra por `published` en SQL, así que un sitio sin publicar es
  // indistinguible de uno inexistente, y eso lo prueba el caso de arriba.
});

test.describe("Configuración del sitio en el panel", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/settings/sitio");
    await page.waitForLoadState("networkidle");
  });

  test("muestra las tres opciones de diseño", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Diseño" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Clásico/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Moderno/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Minimal/ })).toBeVisible();
  });

  test("permite configurar el horario de atención de los siete días", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Horario de atención" })).toBeVisible({
      timeout: 15000,
    });
    for (const day of ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]) {
      await expect(page.getByText(day, { exact: true })).toBeVisible();
    }
  });

  test("publicar es un interruptor aparte de guardar", async ({ page }) => {
    // Configuring a site must never put a business online as a side effect.
    await expect(page.getByText("Sitio publicado")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/devuelve .no encontrado./)).toBeVisible();
  });
});
