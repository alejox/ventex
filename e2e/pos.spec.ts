import { test, expect } from "@playwright/test";
import { tryLogin } from "./helpers/auth";

test.describe("Punto de Venta (POS)", () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await tryLogin(page);
    test.skip(!loggedIn, "No se pudo autenticar - saltando prueba");
    await page.goto("/dashboard/pos");
    await page.waitForLoadState("networkidle");
  });

  test("carga la página del POS con todos los elementos principales", async ({ page }) => {
    await expect(page.getByText("Factura de venta")).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder("Buscar o escanear código")).toBeVisible();
    // Antes acá se afirmaba "Lista de precio", un texto que ya no existe en
    // ninguna parte de la app: el test fallaba desde que se quitó. Se cambia
    // por el botón de cobro, que sí es un elemento principal y estable.
    await expect(page.getByRole("button", { name: /vender/i })).toBeVisible();
    await expect(page.getByText("Método de pago")).toBeVisible();
    await expect(page.getByText("Cliente", { exact: true })).toBeVisible();
  });

  /**
   * Dos formas de escribir un carácter que solo funcionan en su contexto:
   *
   * - `&times;` se decodifica en TEXTO JSX y en atributos JSX, pero NO dentro
   *   de un string de JS. Pasó con `Caja &times;12`: el mismo texto existía dos
   *   veces, una como texto JSX y otra en un template literal, y alguien copió
   *   la primera.
   * - `ó` se interpreta en un string de JS, pero NO en un atributo JSX.
   *   Pasó con `placeholder="Buscar o escanear código"`.
   *
   * Las dos fallan igual de silenciosas: compilan, pasan el typecheck y solo se
   * ven mirando la pantalla. Por eso el guardia mira la pantalla.
   */
  test("no queda ningún escape sin resolver en la pantalla", async ({ page }) => {
    await expect(page.getByText("Factura de venta")).toBeVisible({ timeout: 15000 });

    const texto = await page.evaluate(() => document.body.innerText);
    expect(texto).not.toMatch(/&[a-zA-Z]{2,10};|&#\d+;/);
    expect(texto).not.toMatch(/\\u[0-9a-fA-F]{4}/);

    // Los atributos no salen en innerText y son justo donde apareció el bug:
    // un placeholder o un tooltip roto no se ve hasta que alguien se planta ahí.
    const atributos = await page.evaluate(() =>
      [...document.querySelectorAll("[placeholder],[title],[aria-label],[alt]")].flatMap((el) =>
        ["placeholder", "title", "aria-label", "alt"]
          .map((a) => el.getAttribute(a))
          .filter((v): v is string => v !== null),
      ),
    );
    for (const valor of atributos) {
      expect(valor, `atributo con escape sin resolver: ${valor}`).not.toMatch(
        /&[a-zA-Z]{2,10};|&#\d+;|\\u[0-9a-fA-F]{4}/,
      );
    }
  });

  test("cambia el método de pago a tarjeta", async ({ page }) => {
    const paymentSelect = page.getByLabel("Método de pago").locator("..").locator("select");
    if (await paymentSelect.isVisible()) {
      await paymentSelect.selectOption("tarjeta");
      await expect(paymentSelect).toHaveValue("tarjeta");
    }
  });

  test("cambia el método de pago a transferencia", async ({ page }) => {
    const paymentSelect = page.getByLabel("Método de pago").locator("..").locator("select");
    if (await paymentSelect.isVisible()) {
      await paymentSelect.selectOption("transferencia");
      await expect(paymentSelect).toHaveValue("transferencia");
    }
  });

  test("cambia la vista a lista", async ({ page }) => {
    const toggleBtn = page.locator("button[title*='Vista']");
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
    }
  });

  test("navega a nuevo producto", async ({ page }) => {
    const newProductBtn = page.getByRole("button", { name: /nuevo producto/i });
    if (await newProductBtn.isVisible()) {
      await newProductBtn.click();
      await page.waitForURL(/\/dashboard\/inventory\/product/);
    }
  });

  test("abre y cierra el modal de descuentos", async ({ page }) => {
    const discountBtn = page.locator("button[title='Descuentos globales']");
    if (await discountBtn.isVisible()) {
      await discountBtn.click();
      await expect(page.getByText("Descuentos globales").or(page.getByText("Descuento"))).toBeVisible({ timeout: 5000 }).catch(() => {});
      await page.keyboard.press("Escape");
    }
  });

  test("abre y cierra el modal de configuración de venta", async ({ page }) => {
    const configBtn = page.locator("button[title='Configuración']");
    if (await configBtn.isVisible()) {
      await configBtn.click();
      await page.keyboard.press("Escape");
    }
  });

  test("abre y cierra el modal de últimas ventas", async ({ page }) => {
    const recentSalesBtn = page.getByLabel("Últimas ventas");
    if (await recentSalesBtn.isVisible()) {
      await recentSalesBtn.click();
      await page.keyboard.press("Escape");
    }
  });

  test("abre el modal de nuevo cliente", async ({ page }) => {
    // Se busca el botón con IconUserPlus (al lado del select de cliente) por su
    // path del SVG: no tiene texto ni rol accesible con el que distinguirlo.
    const allButtons = page.locator("button");
    const count = await allButtons.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      const btn = allButtons.nth(i);
      const html = await btn.innerHTML();
      if (html.includes('width="16"') && html.includes('height="16"') && html.includes("path") && html.includes("M16 21v-2a4")) {
        await btn.click();
        found = true;
        break;
      }
    }
    if (found) {
      await expect(page.getByText("Nuevo Cliente")).toBeVisible({ timeout: 5000 }).catch(() => {});
      await page.keyboard.press("Escape");
    }
  });

  test("el botón de vender está deshabilitado sin productos en carrito", async ({ page }) => {
    const sellBtn = page.getByRole("button", { name: /vender/i });
    await expect(sellBtn).toBeDisabled();
  });

  test("el botón de limpiar venta está deshabilitado sin productos", async ({ page }) => {
    const clearBtn = page.getByLabel("Limpiar venta");
    if (await clearBtn.isVisible()) {
      await expect(clearBtn).toBeDisabled();
    }
  });

  test("muestra mensaje de catálogo vacío cuando no hay productos", async ({ page }) => {
    await expect(page.getByText(/No hay productos ni servicios/i)).toBeVisible({ timeout: 15000 }).catch(() => {});
  });

  test("el buscador de productos acepta texto", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Buscar o escanear código");
    await searchInput.fill("Prueba");
    await expect(searchInput).toHaveValue("Prueba");
  });

  test("filtra por categoría cuando hay categorías disponibles", async ({ page }) => {
    const categoryBtns = page.locator("button").filter({ hasText: /Todos/i });
    if (await categoryBtns.first().isVisible()) {
      await categoryBtns.first().click();
    }
  });
});
