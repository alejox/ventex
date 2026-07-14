import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
await p.goto("http://localhost:3000/login");
await p.fill('input[type="email"]', "alejoxdrums@gmail.com");
await p.fill('input[type="password"]', "Admin1234$");
await p.click('button[type="submit"]');
await p.waitForURL(/\/dashboard/, { timeout: 20000 });
await p.goto("http://localhost:3000/admin/plans", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);

await p.locator('button:has-text("+ Nueva modalidad")').first().click();
await p.waitForTimeout(600);
const title = p.getByRole("heading", { name: /Nuevo tiempo|Nueva modalidad/ });
console.log("Modal abierto:", await title.isVisible());

// Clic en cada input, incluidos los numéricos (donde se cerraba).
for (const sel of ['input[placeholder="Ej. Trimestral"]', 'form input[type="number"] >> nth=0', 'form input[type="number"] >> nth=1', 'form input[type="number"] >> nth=2']) {
  await p.locator(sel).click();
  await p.waitForTimeout(250);
  console.log(`tras clic en ${sel} → modal visible:`, await title.isVisible());
}
// Escribir y arrastrar un poco dentro del input (el caso que lo cerraba).
const price = p.locator('form input[type="number"]').nth(1);
const box = await price.boundingBox();
await p.mouse.move(box.x + 20, box.y + box.height / 2);
await p.mouse.down();
await p.mouse.move(box.x + 60, box.y + box.height / 2 + 3);
await p.mouse.up();
console.log("tras arrastrar dentro del input → modal visible:", await title.isVisible());

// El fondo sigue cerrando.
await p.mouse.click(5, 5);
await p.waitForTimeout(500);
console.log("tras clic en el fondo → modal visible:", await title.isVisible());
await b.close();
