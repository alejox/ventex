import assert from "node:assert/strict";
import test from "node:test";
import {
  addToOrder,
  buildOrderMessage,
  MAX_LINE_QTY,
  orderCount,
  orderTotal,
  orderWhatsappLink,
  removeFromOrder,
  setOrderQty,
  type OrderLine,
} from "../lib/site-order";

const arroz = { id: "p1", name: "Arroz 500 g", price: 4500 };
const leche = { id: "p2", name: "Leche entera", price: 3800.5 };

test("adding the same product twice sums its quantity", () => {
  let order: OrderLine[] = [];
  order = addToOrder(order, arroz);
  order = addToOrder(order, arroz, 2);
  order = addToOrder(order, leche);
  assert.deepEqual(order.map((line) => [line.productId, line.qty]), [["p1", 3], ["p2", 1]]);
  assert.equal(orderCount(order), 4);
});

test("quantities stay whole and capped", () => {
  let order = addToOrder([], arroz, 2.7);
  assert.equal(order[0].qty, 2);
  order = setOrderQty(order, "p1", 1000);
  assert.equal(order[0].qty, MAX_LINE_QTY);
  order = addToOrder(order, arroz, 5);
  assert.equal(order[0].qty, MAX_LINE_QTY);
});

test("setting zero or less removes the line, as does removeFromOrder", () => {
  let order = addToOrder(addToOrder([], arroz), leche);
  order = setOrderQty(order, "p1", 0);
  assert.deepEqual(order.map((line) => line.productId), ["p2"]);
  assert.deepEqual(removeFromOrder(order, "p2"), []);
  assert.deepEqual(setOrderQty(order, "missing", 3), order);
});

test("the input order is never mutated", () => {
  const order = addToOrder([], arroz);
  const snapshot = structuredClone(order);
  addToOrder(order, arroz);
  setOrderQty(order, "p1", 5);
  removeFromOrder(order, "p1");
  assert.deepEqual(order, snapshot);
});

test("the total is summed in cents, not floats", () => {
  // 3 × 3800.5 = 11401.5; 0.1-style float drift must not leak in.
  const order = addToOrder(addToOrder([], leche, 3), { id: "p3", name: "Chicle", price: 0.1 }, 2);
  assert.equal(orderTotal(order), 11401.7);
});

test("the WhatsApp message lists every line and the total", () => {
  const order = addToOrder(addToOrder([], arroz, 2), leche);
  const message = buildOrderMessage({
    businessName: "Super Alejo",
    lines: order,
    formatMoney: (amount) => `$${amount}`,
  });
  assert.equal(
    message,
    [
      "Hola Super Alejo, quiero hacer este pedido:",
      "",
      "• 2 × Arroz 500 g — $9000",
      "• 1 × Leche entera — $3800.5",
      "",
      "Total: $12800.5",
    ].join("\n"),
  );
});

test("name and notes are added only when written", () => {
  const order = addToOrder([], arroz);
  const message = buildOrderMessage({
    businessName: "Tienda",
    lines: order,
    formatMoney: (amount) => `$${amount}`,
    customerName: "  Ana  ",
    notes: " Sin bolsa \n por favor ",
  });
  assert.ok(message.endsWith("Total: $4500\n\nNombre: Ana\nNota: Sin bolsa \n por favor"));
  const bare = buildOrderMessage({ businessName: "Tienda", lines: order, formatMoney: String, customerName: "   ", notes: "" });
  assert.ok(!bare.includes("Nombre:"));
  assert.ok(!bare.includes("Nota:"));
});

test("the WhatsApp link needs a usable number and adds the country code", () => {
  assert.equal(orderWhatsappLink("311 232 9185", "Hola"), "https://api.whatsapp.com/send?phone=573112329185&text=Hola");
  assert.equal(orderWhatsappLink("+57 311 232 9185", "a b"), "https://api.whatsapp.com/send?phone=573112329185&text=a%20b");
  assert.equal(orderWhatsappLink(null, "Hola"), null);
  assert.equal(orderWhatsappLink("123", "Hola"), null);
});
