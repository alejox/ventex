import type { CatalogItem } from "@/services/pos.service";

/** Exact codes take precedence over a coincidentally identical SKU. */
export function resolveCatalogCode(catalog: CatalogItem[], code: string): CatalogItem | undefined {
  const value = code.trim().toLowerCase();
  if (!value) return undefined;
  return catalog.find((item) => item.barcode?.toLowerCase() === value) ??
    catalog.find((item) => item.sku?.toLowerCase() === value);
}

/** The idle gap (or Enter) marks completion, even when another barcode shares this prefix. */
export function resolveAutomaticBarcode(catalog: CatalogItem[], code: string): CatalogItem | undefined {
  const value = code.trim().toLowerCase();
  if (!value) return undefined;
  return catalog.find((item) => item.barcode?.toLowerCase() === value);
}

/** Avoid treating ordinary name searches as failed hardware scans. */
export function looksLikeScannerCode(value: string): boolean {
  const trimmed = value.trim();
  return /^[a-z0-9_-]{6,}$/i.test(trimmed) && (trimmed.match(/\d/g) ?? []).length >= 2;
}

export function shouldSubmitIdleCode(catalog: CatalogItem[], value: string, rapidKeys: number): boolean {
  if (resolveAutomaticBarcode(catalog, value)) return true;
  if (rapidKeys < 3 || !looksLikeScannerCode(value) || resolveCatalogCode(catalog, value)) return false;
  return !catalog.some((item) => item.name.toLowerCase().includes(value.toLowerCase()));
}
