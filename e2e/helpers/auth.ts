import { Page } from "@playwright/test";

export const TEST_EMAIL = "test@ventex.com";
export const TEST_PASSWORD = "Test123!";

export async function login(page: Page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
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
