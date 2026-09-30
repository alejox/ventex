import assert from "node:assert/strict";
import { test } from "node:test";
import { looksLikeScannerCode, resolveAutomaticBarcode, resolveCatalogCode, shouldSubmitIdleCode } from "../app/dashboard/pos/components/catalog-code";
import type { CatalogItem } from "../services/pos.service";
import { usePosStore } from "../stores/pos.store";

const item: CatalogItem = {
  id: "product-1",
  kind: "product",
  name: "Sample product",
  sku: "SHOP-1",
  barcode: "X004JJ80HT",
  price: 1000,
  package_price: null,
  units_per_package: 1,
  stock_level: 2,
  open_price: false,
  allows_fractions: false,
  category_name: null,
  category_id: null,
  image_url: null,
  has_commission: false,
  commission_type: null,
  commission_value: null,
};

test("barcode wins over SKU, while SKU remains a fallback", () => {
  const skuCollision = { ...item, id: "product-2", barcode: null, sku: item.barcode };
  assert.equal(resolveCatalogCode([skuCollision, item], " x004jj80ht "), item);
  assert.equal(resolveCatalogCode([item], "shop-1"), item);
  assert.equal(resolveCatalogCode([item], "missing"), undefined);
});

test("an idle no-Enter scan can complete a barcode even when another shares its prefix", () => {
  const longer = { ...item, id: "product-longer", barcode: `${item.barcode}9` };
  assert.equal(resolveAutomaticBarcode([item], "X004JJ80HT"), item);
  assert.equal(resolveAutomaticBarcode([item, longer], "X004JJ80HT"), item);
  assert.equal(resolveAutomaticBarcode([item, longer], "X004JJ80HT9"), longer);
  assert.equal(resolveAutomaticBarcode([item], "SHOP-1"), undefined);
  assert.equal(resolveAutomaticBarcode([item], "Sample product"), undefined);
  assert.equal(shouldSubmitIdleCode([item], "X004JJ80HT", 0), true);
  assert.equal(shouldSubmitIdleCode([item, longer], "X004JJ80HT", 10), true);
  assert.equal(shouldSubmitIdleCode([item, longer], "X004JJ80HT9", 10), true);
  assert.equal(shouldSubmitIdleCode([item], "unknowncode123", 0), false);
  assert.equal(shouldSubmitIdleCode([item], "unknowncode123", 10), true);
  assert.equal(shouldSubmitIdleCode([item], "Sample product", 10), false);
  assert.equal(shouldSubmitIdleCode([item], "Sandwich", 10), false);
});

test("repeated hardware codes add one unit per scan and respect the stock limit", () => {
  const previous = usePosStore.getState();
  const tab = previous.tabs[0];
  usePosStore.setState({ tabs: [{ ...tab, cart: [] }], activeTabId: tab.id, allowOversell: false, offers: [] });
  try {
    for (let scan = 0; scan < 3; scan += 1) {
      const match = resolveCatalogCode([item], "X004JJ80HT");
      assert.ok(match);
      usePosStore.getState().addToCart(match);
    }
    const state = usePosStore.getState();
    assert.equal(state.tabs[0].cart.length, 1);
    assert.equal(state.tabs[0].cart[0].quantity, 2);
    assert.ok(state.stockAlert);
  } finally {
    usePosStore.setState({ tabs: previous.tabs, activeTabId: previous.activeTabId, allowOversell: previous.allowOversell, offers: previous.offers, stockAlert: previous.stockAlert });
  }
});

test("fractional stock rejects a second whole-unit scan", () => {
  const previous = usePosStore.getState();
  const tab = previous.tabs[0];
  const fractionalStock = { ...item, stock_level: 1.5 };
  usePosStore.setState({ tabs: [{ ...tab, cart: [] }], activeTabId: tab.id, allowOversell: false, offers: [] });
  try {
    const match = resolveCatalogCode([fractionalStock], fractionalStock.barcode ?? "");
    assert.ok(match);
    usePosStore.getState().addToCart(match);
    usePosStore.getState().addToCart(match);
    assert.equal(usePosStore.getState().tabs[0].cart[0].quantity, 1);
    assert.ok(usePosStore.getState().stockAlert);
  } finally {
    usePosStore.setState({ tabs: previous.tabs, activeTabId: previous.activeTabId, allowOversell: previous.allowOversell, offers: previous.offers, stockAlert: previous.stockAlert });
  }
});

test("scanner-shaped misses can be cleared without clearing ordinary name searches", () => {
  assert.equal(looksLikeScannerCode("X004JJ80HT"), true);
  assert.equal(looksLikeScannerCode("Sample product"), false);
  assert.equal(looksLikeScannerCode("Sandwich"), false);
});
