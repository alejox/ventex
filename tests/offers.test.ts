import test from "node:test";
import assert from "node:assert/strict";
import { offerDiscountsFor, applyOfferDiscounts } from "../services/offers.service";
import type { ProductOffer } from "../services/offers.service";
import type { CartLine, CatalogItem } from "../services/pos.service";

const product = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: "p1",
  kind: "product",
  name: "GASEOSA",
  sku: "PRD-1",
  barcode: null,
  price: 2000,
  package_price: null,
  units_per_package: 1,
  stock_level: 100,
  open_price: false,
  allows_fractions: false,
  category_name: "Bebidas",
  category_id: "cat-1",
  image_url: null,
  has_commission: false,
  commission_type: null,
  commission_value: null,
  ...over,
});

const offer = (over: Partial<ProductOffer> = {}): ProductOffer => ({
  id: "o1",
  name: "10% en gaseosas",
  kind: "percent",
  value: 10,
  buyQty: null,
  payQty: null,
  productId: "p1",
  categoryId: null,
  startsOn: null,
  endsOn: null,
  active: true,
  ...over,
});

const TODAY = "2026-09-27";

test("1. Porcentaje: descuenta sobre precio x cantidad", () => {
  const line: CartLine = { item: product(), quantity: 3 };
  const result = offerDiscountsFor([line], [offer({ value: 10 })], TODAY);
  assert.equal(result.length, 1);
  assert.equal(result[0].discountAmount, 600); // 2000*3*0.10
  assert.equal(result[0].offerId, "o1");
  assert.equal(result[0].offerName, "10% en gaseosas");
});

test("2. Monto fijo: es POR UNIDAD y nunca supera el valor de la línea", () => {
  const line: CartLine = { item: product({ price: 1000 }), quantity: 2 };
  // $800 por unidad, 2 unidades -> $1600, que es menor al total ($2000): pasa.
  const normal = offerDiscountsFor([line], [offer({ kind: "amount", value: 800 })], TODAY);
  assert.equal(normal[0].discountAmount, 1600);

  // $800 por unidad pero el precio es $500: el tope es el valor de la línea.
  const capped = offerDiscountsFor(
    [{ item: product({ price: 500 }), quantity: 2 }],
    [offer({ kind: "amount", value: 800 })],
    TODAY,
  );
  assert.equal(capped[0].discountAmount, 1000); // 500*2, no 800*2=1600
});

test("3. Lleva N paga M: unidades gratis = floor(qty/buy)*(buy-pay)", () => {
  const buy3pay2 = offer({ kind: "buy_n_pay_m", value: null, buyQty: 3, payQty: 2 });
  // 6 unidades: 2 grupos completos de 3, 1 gratis por grupo = 2 gratis.
  const seis = offerDiscountsFor([{ item: product(), quantity: 6 }], [buy3pay2], TODAY);
  assert.equal(seis[0].discountAmount, 4000); // 2 gratis * 2000

  // 4 unidades: 1 grupo completo (sobran 1 que no alcanza otro grupo).
  const cuatro = offerDiscountsFor([{ item: product(), quantity: 4 }], [buy3pay2], TODAY);
  assert.equal(cuatro[0].discountAmount, 2000);

  // 2 unidades: no completa ni un grupo, no hay descuento -> ni aparece.
  const dos = offerDiscountsFor([{ item: product(), quantity: 2 }], [buy3pay2], TODAY);
  assert.equal(dos.length, 0);
});

test("4. Lleva N paga M se salta cantidades fraccionarias", () => {
  const buy3pay2 = offer({ kind: "buy_n_pay_m", value: null, buyQty: 3, payQty: 2 });
  const fraccion = offerDiscountsFor(
    [{ item: product({ allows_fractions: true }), quantity: 4.5 }],
    [buy3pay2],
    TODAY,
  );
  assert.equal(fraccion.length, 0);
});

test("5. Ventana de fechas: fuera de rango no aplica", () => {
  const line: CartLine = { item: product(), quantity: 1 };
  const vencida = offerDiscountsFor([line], [offer({ startsOn: "2026-01-01", endsOn: "2026-01-31" })], TODAY);
  assert.equal(vencida.length, 0);

  const futura = offerDiscountsFor([line], [offer({ startsOn: "2027-01-01" })], TODAY);
  assert.equal(futura.length, 0);

  const vigente = offerDiscountsFor([line], [offer({ startsOn: "2026-09-01", endsOn: "2026-09-30" })], TODAY);
  assert.equal(vigente.length, 1);
});

test("6. Una oferta inactiva nunca aplica, aunque esté en fecha", () => {
  const line: CartLine = { item: product(), quantity: 1 };
  const result = offerDiscountsFor([line], [offer({ active: false })], TODAY);
  assert.equal(result.length, 0);
});

test("7. Oferta por categoría alcanza cualquier producto de esa categoría", () => {
  const otroProducto = product({ id: "p2", category_id: "cat-1" });
  const porCategoria = offer({ productId: null, categoryId: "cat-1", value: 20 });
  const result = offerDiscountsFor([{ item: otroProducto, quantity: 1 }], [porCategoria], TODAY);
  assert.equal(result.length, 1);
  assert.equal(result[0].discountAmount, 400); // 2000*0.20

  // Otra categoría: no alcanza.
  const otraCategoria = offerDiscountsFor(
    [{ item: product({ category_id: "cat-2" }), quantity: 1 }],
    [porCategoria],
    TODAY,
  );
  assert.equal(otraCategoria.length, 0);
});

test("8. Un servicio nunca recibe una oferta de producto", () => {
  const servicio: CatalogItem = { ...product({ category_id: null }), kind: "service" };
  const result = offerDiscountsFor(
    [{ item: servicio, quantity: 1 }],
    [offer({ productId: null, categoryId: "cat-1" })],
    TODAY,
  );
  assert.equal(result.length, 0);
});

test("9. Una línea con descuento MANUAL no se toca", () => {
  const line: CartLine = { item: product(), quantity: 1, discountAmount: 500 };
  const result = offerDiscountsFor([line], [offer()], TODAY);
  assert.equal(result.length, 0, "el manual gana, sin stacking");
});

test("10. Una línea con oferta previa SÍ se recalcula (no es 'manual')", () => {
  const line: CartLine = { item: product(), quantity: 1, discountAmount: 200, offerId: "o1", offerName: "vieja" };
  const result = offerDiscountsFor([line], [offer({ id: "o1", value: 10 })], TODAY);
  assert.equal(result.length, 1);
  assert.equal(result[0].discountAmount, 200); // 2000*1*0.10
});

test("11. Entre varias ofertas que alcanzan la línea, gana la de mayor descuento", () => {
  const line: CartLine = { item: product(), quantity: 1 };
  const chica = offer({ id: "chica", value: 5 });
  const grande = offer({ id: "grande", value: 30 });
  const result = offerDiscountsFor([line], [chica, grande], TODAY);
  assert.equal(result.length, 1);
  assert.equal(result[0].offerId, "grande");
  assert.equal(result[0].discountAmount, 600); // 2000*0.30
});

test("12. applyOfferDiscounts respeta las líneas removidas para esta venta", () => {
  const line: CartLine = { item: product(), quantity: 1, discountAmount: 200, offerId: "o1", offerName: "10%" };
  const key = "p1:unit";
  const result = applyOfferDiscounts([line], [offer({ id: "o1", value: 10 })], [key], TODAY);
  assert.equal(result[0].discountAmount, 0);
  assert.equal(result[0].offerId, undefined);
  assert.equal(result[0].offerName, undefined);
});

test("13. applyOfferDiscounts apaga una oferta que dejó de calificar", () => {
  // La línea tenía una oferta aplicada, pero esa oferta ya no está en la lista
  // vigente (se desactivó/borró): tiene que limpiarse, no quedar pegada.
  const line: CartLine = { item: product(), quantity: 1, discountAmount: 200, offerId: "o1", offerName: "10%" };
  const result = applyOfferDiscounts([line], [], [], TODAY);
  assert.equal(result[0].discountAmount, 0);
  assert.equal(result[0].offerId, undefined);
});

test("14. applyOfferDiscounts no toca una línea sin oferta y sin descuento", () => {
  const line: CartLine = { item: product({ id: "p9", category_id: null }), quantity: 1 };
  const result = applyOfferDiscounts([line], [], [], TODAY);
  assert.equal(result[0], line);
});
