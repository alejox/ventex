import { test, expect } from "@playwright/test";

const USER = "camilo456garcia@gmail.com";
const PASS = "Camilo123";

test("desktop - panel con items", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Dueño" }).click();
  await page.fill('input[type="email"]', USER);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  await page.goto("/dashboard/pos", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Agregar un producto al carrito
  const addBtn = page.locator("button[aria-label='Agregar']").first();
  if (await addBtn.isVisible()) {
    await addBtn.click();
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: "panel-with-items.png", fullPage: false });

  // Verificar bounding box del panel
  const panel = page.locator("div").filter({ hasText: "Factura de venta" }).first();
  const panelBox = await panel.boundingBox();
  console.log("Panel box:", panelBox);

  // Verificar si el footer está dentro del panel
  const footer = page.locator("button").filter({ hasText: "Vender" }).first();
  const footerBox = await footer.boundingBox();
  console.log("Footer (botón vender) box:", footerBox);

  if (panelBox && footerBox) {
    const outsidePanel = footerBox.y + footerBox.height > panelBox.y + panelBox.height;
    console.log("Footer fuera del panel:", outsidePanel);
  }
});
