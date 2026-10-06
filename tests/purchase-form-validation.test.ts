import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLastPurchase,
  hasErrors,
  hasFilledLines,
  lineFieldId,
  validatePurchaseForm,
  type PurchaseFormDraft,
} from "../app/dashboard/purchases/purchase-form-validation";

const line = (over: Partial<PurchaseFormDraft["lines"][number]> = {}) => ({
  product_id: "p1",
  package_quantity: 0,
  loose_quantity: 2,
  unit_price: 1000,
  package_price: 0,
  units_per_package: 1,
  ...over,
});

const draft = (over: Partial<PurchaseFormDraft> = {}): PurchaseFormDraft => ({
  supplierNumber: "FV-1",
  distributorId: "d1",
  issueDate: "2026-10-06",
  dueDate: "",
  discount: "0",
  grossTotal: 2000,
  lines: [line()],
  ...over,
});

test("un formulario completo no tiene errores", () => {
  const e = validatePurchaseForm(draft());
  assert.equal(hasErrors(e), false);
  assert.deepEqual(e.messages, []);
});

test("errores por campo, en el orden de la pantalla, con foco en el primero", () => {
  const e = validatePurchaseForm(draft({ supplierNumber: "  ", distributorId: "" }));
  assert.ok(e.supplierNumber);
  assert.ok(e.distributor);
  assert.equal(e.firstFieldId, "supplier-number");
  assert.equal(e.messages.length, 2);
});

test("errores por línea con su número: falta cantidad, falta producto", () => {
  const e = validatePurchaseForm(
    draft({ lines: [line(), line({ product_id: "" }), line({ loose_quantity: 0 })] }),
  );
  assert.equal(e.lines[1]?.product, "Línea 2: elige un producto o quita la línea.");
  assert.equal(e.lines[2]?.quantity, "Línea 3: falta cantidad.");
  assert.equal(e.firstFieldId, lineFieldId(1, "product"));
  // Ninguna línea se descarta en silencio: la primera, válida, no tiene error.
  assert.equal(e.lines[0], undefined);
});

test("con una sola línea vacía pide agregar un producto", () => {
  const e = validatePurchaseForm(draft({ lines: [line({ product_id: "" })] }));
  assert.equal(e.lines[0]?.product, "Agrega al menos un producto.");
});

test("costo inválido solo cuenta para la cantidad que se usa", () => {
  const bad = validatePurchaseForm(draft({ lines: [line({ unit_price: Number.NaN })] }));
  assert.equal(bad.lines[0]?.cost, "Línea 1: el costo no es válido.");
  assert.equal(bad.firstFieldId, lineFieldId(0, "cost"));
  // Caja con costo negativo y sin sueltas: el foco va al costo de la caja.
  const box = validatePurchaseForm(
    draft({ lines: [line({ loose_quantity: 0, package_quantity: 2, units_per_package: 12, package_price: -1 })] }),
  );
  assert.equal(box.firstFieldId, lineFieldId(0, "boxcost"));
  // Costo de caja raro pero sin cajas: no importa.
  const ok = validatePurchaseForm(draft({ lines: [line({ package_price: -5 })] }));
  assert.equal(hasErrors(ok), false);
});

test("vencimiento antes de la compra y descuento mayor que el total", () => {
  const e = validatePurchaseForm(draft({ dueDate: "2026-10-01", discount: "5000" }));
  assert.ok(e.dueDate);
  assert.equal(e.discount, "El descuento no puede superar el total de la compra.");
  const neg = validatePurchaseForm(draft({ discount: "-1" }));
  assert.ok(neg.discount);
  assert.equal(hasErrors(validatePurchaseForm(draft({ discount: "" }))), false);
});

test("applyLastPurchase: reemplazar o agregar sin perder lo cargado", () => {
  const current = [{ product_id: "a" }, { product_id: "" }];
  const incoming = [{ product_id: "x" }, { product_id: "y" }];
  assert.deepEqual(applyLastPurchase(current, incoming, "replace"), incoming);
  assert.deepEqual(applyLastPurchase(current, incoming, "append"), [{ product_id: "a" }, ...incoming]);
  // Sin nada que traer, no se borra lo que había.
  assert.deepEqual(applyLastPurchase(current, [], "replace"), current);
  assert.equal(hasFilledLines([{ product_id: "" }]), false);
  assert.equal(hasFilledLines(current), true);
});
