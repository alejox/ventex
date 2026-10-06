import { expect, type Page } from "@playwright/test";
import { findProductIdByName } from "./db";

/**
 * Garantiza que el negocio de prueba tenga un producto con ese nombre y precio
 * final. Si no existe lo crea POR LA UI (el mismo alta que usa una persona:
 * /dashboard/inventory/product), nunca escribiendo directo en la base — el
 * cliente de `db.ts` es solo de verificación.
 *
 * Se crea como "No lleva inventario" para que las corridas repetidas (que
 * venden de verdad al drenar la cola offline) no lo dejen sin stock y empiecen
 * a fallar por un motivo ajeno a lo que prueban.
 */
export async function ensureProduct(page: Page, name: string, finalPrice: number): Promise<void> {
  if (await findProductIdByName(name)) return;

  await page.goto("/dashboard/inventory/product");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Nuevo Producto" })).toBeVisible({ timeout: 20000 });

  await page.getByLabel("Nombre del producto").fill(name);
  await page.getByLabel("Precio final de venta con IVA").fill(String(finalPrice));
  await page.getByLabel(/No lleva inventario/).check();
  await page.getByRole("button", { name: "Guardar Producto" }).click();
  await page.waitForURL(/\/dashboard\/inventory(\?|$)/, { timeout: 20000 });

  await expect
    .poll(() => findProductIdByName(name), { timeout: 10000, message: `no se creó ${name}` })
    .not.toBeNull();
}
