import { Page } from "@playwright/test";

export async function navigateTo(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

export async function openModal(page: Page, buttonLabel: string) {
  await page.getByRole("button", { name: buttonLabel }).click();
}

export async function closeModal(page: Page) {
  await page.keyboard.press("Escape");
}

export async function fillFormField(page: Page, label: string, value: string) {
  await page.getByLabel(label).fill(value);
}

export async function selectOption(page: Page, label: string, option: string) {
  await page.getByLabel(label).selectOption(option);
}

export async function submitForm(page: Page) {
  await page.getByRole("button", { name: /guardar|crear|confirmar/i }).click();
}

export async function waitForTableData(page: Page) {
  await page.waitForSelector("table tbody tr", { timeout: 10000 }).catch(() => {});
}

export async function getTableRowCount(page: Page): Promise<number> {
  return await page.locator("table tbody tr").count();
}
