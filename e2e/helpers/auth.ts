import { Page } from "@playwright/test";

// Las credenciales del fixture se pueden pisar por entorno: el usuario de
// prueba no es el mismo en cada máquina, y sin esto los specs no fallan —
// se SALTAN, que es la forma más silenciosa de no probar nada.
export const TEST_EMAIL = process.env.E2E_EMAIL ?? "test@ventex.com";
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? "Test123!";

export async function login(page: Page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  // El login actual es de un solo modo (correo + contraseña) y enruta por la
  // server action `login` (utils/supabase/actions.ts). No hay toggle Dueño/Empleado.
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

export async function tryLogin(page: Page): Promise<boolean> {
  return login(page);
}
