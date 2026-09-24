import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

/**
 * Escuela de música es un módulo opt-in (`profiles.modules->>'school'`): el
 * tenant de prueba puede o no tenerlo activado en este entorno. Las pruebas
 * autenticadas se saltan (no fallan) cuando el módulo está apagado — igual que
 * `public-calendar-privacy.spec.ts` se salta si el sitio público no está
 * publicado. Lo que SÍ se prueba siempre, sin depender de datos de un tenant
 * activado, son los invariantes de autorización de las rutas anon/token: son
 * la superficie de seguridad nueva de este cambio (`school_confirm_lesson_by_token`
 * y `school_family_payload`, las dos únicas RPC ejecutables por `anon`).
 */

const INVALID_TOKEN = "token-invalido-e2e-00000000";
const RANDOM_MATERIAL_ID = "00000000-0000-0000-0000-000000000000";

test.describe("Escuela de música — pantallas del dashboard", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
  });

  test("el resumen de la escuela es alcanzable, o el módulo está apagado para este tenant", async ({
    page,
  }) => {
    await page.goto("/dashboard/school");
    await page.waitForLoadState("networkidle");
    test.skip(
      !/\/dashboard\/school$/.test(page.url()),
      "El tenant de prueba no tiene el módulo 'school' activado (redirige a /dashboard)",
    );
    await expect(page.getByRole("heading", { name: "Escuela de música" })).toBeVisible({
      timeout: 15000,
    });
  });

  test("las pantallas de estudiantes, profesores, planes, config y agenda son alcanzables", async ({
    page,
  }) => {
    await page.goto("/dashboard/school");
    await page.waitForLoadState("networkidle");
    test.skip(
      !/\/dashboard\/school$/.test(page.url()),
      "El tenant de prueba no tiene el módulo 'school' activado",
    );

    const paths = [
      "/dashboard/school/estudiantes",
      "/dashboard/school/profesores",
      "/dashboard/school/planes",
      "/dashboard/school/config",
      "/dashboard/school/agenda",
    ];
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // Si el módulo estuviera apagado, el layout de la escuela redirige a
      // /dashboard — llegar a la URL pedida es la prueba de que el gate de
      // servidor (`fetchSchoolAccess`) dejó pasar la request.
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
  });
});

test.describe("Escuela de música — enlaces por token (fuera de /dashboard)", () => {
  test("un token familiar inválido muestra el estado de error, nunca una excepción sin manejar", async ({
    page,
  }) => {
    const response = await page.goto(`/school/f/${INVALID_TOKEN}`);
    expect(response?.status()).toBeLessThan(500);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Escuela de música" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/no es válido|venció|revocado/i)).toBeVisible({ timeout: 10000 });
  });

  test("un token de confirmación inválido muestra el estado de error, nunca una excepción sin manejar", async ({
    page,
  }) => {
    const response = await page.goto(`/school/c/${INVALID_TOKEN}`);
    expect(response?.status()).toBeLessThan(500);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Confirmación de clase" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/no es válido|venció|usó/i)).toBeVisible({ timeout: 10000 });
  });

  test("cargar la página de confirmación con GET nunca dispara la confirmación (POST) por sí sola", async ({
    page,
  }) => {
    // El preview de WhatsApp, y cualquier bot que precargue el link, hace GET.
    // Confirmar es un POST explícito de `ConfirmLessonAction`
    // (`/api/school/confirm`) — la sola carga de la página no debe dispararlo.
    const postToConfirm: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/school/confirm")) {
        postToConfirm.push(req.url());
      }
    });
    await page.goto(`/school/c/${INVALID_TOKEN}`);
    await page.waitForLoadState("networkidle");
    expect(postToConfirm).toHaveLength(0);
  });
});

test.describe("Escuela de música — rutas de API sin sesión", () => {
  test("GET /api/school/confirm no existe: 405, nunca confirma por lectura", async ({ request }) => {
    const response = await request.get("/api/school/confirm");
    expect(response.status()).toBe(405);
  });

  test("POST /api/school/confirm con token inválido responde 409 sin efecto", async ({ request }) => {
    const response = await request.post("/api/school/confirm", {
      data: { token: INVALID_TOKEN },
    });
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test("POST /api/school/confirm sin token responde 400", async ({ request }) => {
    const response = await request.post("/api/school/confirm", { data: {} });
    expect(response.status()).toBe(400);
  });

  test("POST /api/school/upload sin sesión responde 401/403, nunca sube nada", async ({ request }) => {
    const response = await request.post("/api/school/upload");
    expect([401, 403]).toContain(response.status());
  });

  test("GET /api/school/material/download sin sesión ni token responde 401/403", async ({ request }) => {
    const response = await request.get(
      `/api/school/material/download?materialId=${RANDOM_MATERIAL_ID}`,
    );
    expect([401, 403]).toContain(response.status());
  });

  test("GET /api/school/material/download con un token inválido responde 401/403, nunca la URL firmada", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/school/material/download?materialId=${RANDOM_MATERIAL_ID}&token=${INVALID_TOKEN}`,
    );
    expect([401, 403]).toContain(response.status());
  });
});
