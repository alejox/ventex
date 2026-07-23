import { test } from "@playwright/test";
test("registrarte + volver atras", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  const body = (await page.textContent("body")) ?? "";
  console.log("dice 'Registrarte':", body.includes("Registrarte"));
  console.log("ya no dice 'Regístrate gratis':", !body.includes("Regístrate gratis"));

  await page.getByRole("link", { name: "Registrarte" }).click();
  await page.waitForURL(/\/register/, { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "shots/reg-1.png" });

  // Paso 1: el volver sale al login
  const back1 = page.getByRole("link", { name: /Volver al inicio de sesión/ });
  console.log("paso 1 tiene 'Volver al inicio de sesión':", await back1.isVisible());

  // Avanzar al paso 2 y comprobar que el volver retrocede de paso
  await page.locator("button").filter({ hasText: /Tienda|Salón|Lavaautos/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Continuar|Siguiente/ }).first().click().catch(() => {});
  await page.waitForTimeout(700);
  const atPaso2 = (await page.textContent("body")) ?? "";
  console.log("avanzó de paso:", !atPaso2.includes("Personaliza tu experiencia"));
  const back2 = page.getByRole("button", { name: /^Atrás$/ });
  console.log("paso 2 tiene 'Atrás':", await back2.isVisible());
  await page.screenshot({ path: "shots/reg-2.png" });
  await back2.click();
  await page.waitForTimeout(600);
  const back1again = (await page.textContent("body")) ?? "";
  console.log("volvió al paso 1:", back1again.includes("Personaliza tu experiencia"));

  // Y desde el paso 1, volver al login
  await page.getByRole("link", { name: /Volver al inicio de sesión/ }).click();
  await page.waitForURL(/\/login/, { timeout: 20000 });
  console.log("volvió al login:", page.url().includes("/login"));
  console.log("ERRORS:", JSON.stringify(errors.slice(0, 5)));
});
