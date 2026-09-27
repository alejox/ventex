import { expect, test } from "@playwright/test";

test("landing keeps its video optional and usable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Tu negocio, a tu manera." })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  const play = page.getByRole("button", { name: "Reproducir video de fondo" });
  await expect(play).toBeVisible();
  await play.click();
  const video = page.locator("video");
  await expect(video.locator('source[src="/landing/hero.mp4"]')).toHaveCount(1);
  await expect(video).toHaveJSProperty("paused", false);
  await page.getByRole("button", { name: "Pausar video de fondo" }).click();
  await expect(video).toHaveJSProperty("paused", true);
  await expect(page.getByRole("button", { name: "Reproducir video de fondo" })).toBeVisible();
});

test("landing falls back to the poster when video loading fails", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let failVideo = true;
  await page.route("**/landing/hero.mp4", async (route) => {
    if (failVideo) await route.abort();
    else await route.continue();
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Reproducir video de fondo" }).click();
  await expect(page.getByRole("status")).toContainText("Video no disponible");
  await expect(page.locator("video")).toHaveCount(0);
  failVideo = false;
  await page.getByRole("button", { name: "Reintentar video de fondo" }).click();
  await expect(page.locator('video source[src="/landing/hero.mp4"]')).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Tu negocio, a tu manera." })).toBeVisible();
});

test("mobile landing navigation and availability labels remain reachable", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Iniciar sesión" }).first()).toBeVisible();
  const menu = page.getByRole("button", { name: "Menú" });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await menu.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  await menu.click();
  await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Precios" }).click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#precios")).toBeVisible();
  await expect(page.getByText("Próximamente").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
