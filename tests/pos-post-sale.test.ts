import test from "node:test";
import assert from "node:assert/strict";
import {
  usePosStore,
  runPostSaleFollowUps,
  restoreClearedTab,
  resetTabForNextSale,
} from "../stores/pos.store";
import type { CatalogItem } from "../services/pos.service";

const item: CatalogItem = {
  id: "p1",
  kind: "product",
  name: "Gaseosa",
  sku: null,
  barcode: null,
  price: 3000,
  package_price: null,
  units_per_package: 1,
  stock_level: 5,
  open_price: false,
  allows_fractions: false,
  category_name: null,
  category_id: null,
  image_url: null,
  has_commission: false,
  commission_type: null,
  commission_value: null,
};

const delivery = { personId: "dp1", address: "Calle 1", fee: 5000 };

test("C14: si el domicilio falla, la venta sigue vendida y el aviso lo dice", async () => {
  const r = await runPostSaleFollowUps({
    saleId: "s1",
    delivery,
    createDelivery: async () => {
      throw new Error("permiso denegado");
    },
    fetchCatalog: async () => [item],
    fetchSaleNumber: async () => 12,
  });
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /La venta quedó registrada, pero no se pudo crear el domicilio: permiso denegado/);
  assert.deepEqual(r.catalog, [item]);
  assert.equal(r.saleNumber, 12);
});

test("C14: si falla el refresco del catálogo tampoco se pierde nada", async () => {
  let deliveryInput: unknown = null;
  const r = await runPostSaleFollowUps({
    saleId: "s1",
    delivery,
    createDelivery: async (input) => {
      deliveryInput = input;
    },
    fetchCatalog: async () => {
      throw new Error("Failed to fetch");
    },
    fetchSaleNumber: async () => {
      throw new Error("Failed to fetch");
    },
  });
  assert.deepEqual(deliveryInput, {
    sale_id: "s1",
    delivery_person_id: "dp1",
    address: "Calle 1",
    fee: 5000,
    notes: undefined,
  });
  assert.equal(r.catalog, null);
  assert.equal(r.saleNumber, null);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /no se pudo actualizar el stock/);
});

test("C14: sin domicilio no se intenta crearlo y no hay avisos", async () => {
  let called = false;
  const r = await runPostSaleFollowUps({
    saleId: "s1",
    delivery: null,
    createDelivery: async () => {
      called = true;
    },
    fetchCatalog: async () => [],
    fetchSaleNumber: async () => 1,
  });
  assert.equal(called, false);
  assert.deepEqual(r.warnings, []);
});

test("C5: vaciar la venta guarda la pestaña y Deshacer la restaura entera", () => {
  const store = usePosStore.getState();
  store.addTab();
  const tabId = usePosStore.getState().activeTabId;
  usePosStore.setState((s) => ({
    tabs: s.tabs.map((t) =>
      t.id === tabId
        ? { ...t, cart: [{ item, quantity: 2 }], customerId: "c1", paymentMethod: "tarjeta" as const }
        : t,
    ),
  }));

  usePosStore.getState().clearCart();
  const vaciada = usePosStore.getState().tabs.find((t) => t.id === tabId)!;
  assert.equal(vaciada.cart.length, 0);

  assert.equal(usePosStore.getState().undoClearCart(), true);
  const restaurada = usePosStore.getState().tabs.find((t) => t.id === tabId)!;
  assert.equal(restaurada.cart.length, 1);
  assert.equal(restaurada.cart[0].quantity, 2);
  assert.equal(restaurada.customerId, "c1");
  assert.equal(restaurada.paymentMethod, "tarjeta");
  // Un segundo Deshacer no hace nada: el snapshot ya se consumió.
  assert.equal(usePosStore.getState().undoClearCart(), false);
});

test("C5: Deshacer no pisa una venta nueva que ya empezó en la pestaña", () => {
  const tab = resetTabForNextSale(
    {
      id: "t1",
      name: "Venta 1",
      cart: [{ item, quantity: 1 }],
      customerId: null,
      staffId: null,
      paymentMethod: "efectivo",
      splits: [],
      isDelivery: false,
      deliveryData: { personId: null, address: "", fee: 0, notes: "" },
      checkoutId: "abc",
      removedOfferKeys: [],
      loyaltyApplied: null,
    },
    { paymentMethod: "efectivo", staffId: null, customerId: null },
  );
  assert.equal(tab.cart.length, 0);
  assert.equal(tab.checkoutId, null);

  const snapshot = { ...tab, cart: [{ item, quantity: 3 }] };
  const conNueva = [{ ...tab, cart: [{ item, quantity: 1 }] }];
  assert.equal(restoreClearedTab(conNueva, { tabId: "t1", snapshot }), null);
  // Pestaña cerrada: tampoco.
  assert.equal(restoreClearedTab([], { tabId: "t1", snapshot }), null);
  // Vacía: se restaura, conservando el nombre actual de la pestaña.
  const renombrada = [{ ...tab, name: "Mesa 4" }];
  const ok = restoreClearedTab(renombrada, { tabId: "t1", snapshot });
  assert.equal(ok?.[0].cart[0].quantity, 3);
  assert.equal(ok?.[0].name, "Mesa 4");
});
