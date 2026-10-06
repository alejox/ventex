import test from "node:test";
import assert from "node:assert/strict";
import {
  checkoutDiscounts,
  createSaleArgs,
  createSaleWithFallback,
  nextManualDiscount,
  roundPreservingSum,
  savedLineDiscounts,
  tenderedForSale,
  usesNewCreateSaleParams,
  type CreateSaleArgsInput,
} from "../lib/sale-discounts";
import { toMessage } from "../lib/errors";

const base: CreateSaleArgsInput = {
  workspaceId: "ws",
  membershipId: "m",
  shiftId: null,
  customerId: null,
  staffId: null,
  paymentMethod: "efectivo",
  discount: 0,
  items: [{ product_id: "p1", quantity: 1 }],
  clientSaleId: "cid",
};

// ---- Redondeo por línea ----

test("redondear por línea conserva la suma (15 % sobre tres líneas de $3.333)", () => {
  const raw = [499.95, 499.95, 499.95].map((x) => x + 0.0049);
  const lines = roundPreservingSum(raw);
  const sum = Math.round(lines.reduce((s, x) => s + x, 0) * 100);
  assert.equal(sum, Math.round(raw.reduce((s, x) => s + x, 0) * 100));
  for (const l of lines) assert.equal(Math.round(l * 100), l * 100);
});

test("redondear por línea ignora negativos y no-números", () => {
  assert.deepEqual(roundPreservingSum([-5, Number.NaN, 0, 10.004]), [0, 0, 0, 10]);
});

// ---- Manual vs. automático ----

test("solo lo del DiscountModal cuenta como manual; ofertas y puntos no", () => {
  const d = checkoutDiscounts([
    { discountAmount: 1000, manualDiscount: 1000 }, // manual
    { discountAmount: 500 }, // oferta / premio / puntos
    { discountAmount: 0 },
  ]);
  assert.equal(d.total, 1500);
  assert.equal(d.manual, 1000);
  assert.deepEqual(d.lines, [1000, 500, 0]);
});

test("una venta solo con ofertas declara manual = 0 (no pide pos_discount)", () => {
  const d = checkoutDiscounts([{ discountAmount: 2380, offerId: "o1" } as { discountAmount: number }]);
  assert.equal(d.manual, 0);
  assert.equal(d.total, 2380);
});

test("el manual nunca supera el descuento real de la línea", () => {
  const d = checkoutDiscounts([{ discountAmount: 300, manualDiscount: 900 }]);
  assert.equal(d.manual, 300);
});

test("una línea con más descuento que lo que vale no manda desglose (la base vieja la aceptaba)", () => {
  const cart = [
    { discountAmount: 20000, manualDiscount: 20000, gross: 10000 },
    { discountAmount: 0, gross: 30000 },
  ];
  const d = checkoutDiscounts(cart, (l) => l.gross);
  assert.equal(d.lines, null);
  assert.equal(d.total, 20000);
  assert.equal(d.manual, 20000);
  const ok = checkoutDiscounts([{ discountAmount: 10000, gross: 10000 }], (l) => l.gross);
  assert.deepEqual(ok.lines, [10000]);
});

test("nextManualDiscount: manual reemplaza, auto borra, layer conserva topado", () => {
  assert.equal(nextManualDiscount(undefined, 700, "manual"), 700);
  assert.equal(nextManualDiscount(700, 0, "manual"), undefined);
  assert.equal(nextManualDiscount(700, 1200, "auto"), undefined);
  // Puntos sumados sobre un descuento manual: el manual sigue siendo 700.
  assert.equal(nextManualDiscount(700, 1500, "layer"), 700);
  // "Quitar" los puntos restaura un total menor: el manual se topa.
  assert.equal(nextManualDiscount(700, 400, "layer"), 400);
  assert.equal(nextManualDiscount(undefined, 400, "layer"), undefined);
});

// ---- Payload ----

test("el payload solo lleva los parámetros nuevos cuando tienen algo que decir", () => {
  const plain = createSaleArgs(base);
  assert.equal("p_manual_discount" in plain, false);
  assert.equal("p_amount_tendered" in plain, false);
  assert.equal(usesNewCreateSaleParams(base), false);

  const full = createSaleArgs({ ...base, discount: 1000, manualDiscount: 1000, amountTendered: 50000 });
  assert.equal(full.p_manual_discount, 1000);
  assert.equal(full.p_amount_tendered, 50000);
  assert.equal(full.p_discount_amount, 1000);
});

test("la firma vieja nunca lleva p_manual_discount ni p_amount_tendered", () => {
  const legacy = createSaleArgs({ ...base, manualDiscount: 1000, amountTendered: 50000 }, true);
  assert.equal("p_manual_discount" in legacy, false);
  assert.equal("p_amount_tendered" in legacy, false);
  assert.equal(legacy.p_client_sale_id, "cid");
  assert.equal(legacy.p_expected_workspace_id, "ws");
});

test("una venta encolada con el formato viejo sale con el payload de siempre", () => {
  // Lo que había en IndexedDB antes del cambio: sin manualDiscount, sin
  // amountTendered y sin discount_amount en los items.
  const queued: CreateSaleArgsInput = { ...base, discount: 500, shiftId: "s1" };
  const args = createSaleArgs(queued);
  assert.deepEqual(Object.keys(args).sort(), [
    "p_client_sale_id",
    "p_customer_id",
    "p_discount_amount",
    "p_expected_membership_id",
    "p_expected_shift_id",
    "p_expected_workspace_id",
    "p_items",
    "p_payment_method",
    "p_staff_id",
  ]);
});

// ---- Fallback ----

type Call = Record<string, unknown>;
const pgrst202 = { code: "PGRST202", message: "Could not find the function" };

test("base sin migrar: PGRST202 reintenta con la firma vieja y lo recuerda", async () => {
  const calls: Call[] = [];
  const result = await createSaleWithFallback(
    async (args) => {
      calls.push(args);
      return "p_manual_discount" in args || "p_amount_tendered" in args
        ? { data: null, error: pgrst202 }
        : { data: "sale-1", error: null };
    },
    { ...base, amountTendered: 20000 },
    false,
  );
  assert.deepEqual(result, { saleId: "sale-1", legacy: true });
  assert.equal(calls.length, 2);
  assert.equal("p_amount_tendered" in calls[1], false);
  // Misma clave de idempotencia en los dos intentos.
  assert.equal(calls[0].p_client_sale_id, calls[1].p_client_sale_id);
});

test("sabiendo que la base es vieja va directo a la firma vieja (una sola llamada)", async () => {
  const calls: Call[] = [];
  const result = await createSaleWithFallback(
    async (args) => {
      calls.push(args);
      return { data: "sale-2", error: null };
    },
    { ...base, manualDiscount: 100, discount: 100 },
    true,
  );
  assert.equal(result.saleId, "sale-2");
  assert.equal(calls.length, 1);
  assert.equal("p_manual_discount" in calls[0], false);
});

test("un rechazo de negocio NO se reintenta con la firma vieja", async () => {
  let n = 0;
  const denied = { code: "42501", message: "SIN_PERMISO_DESCUENTO" };
  await assert.rejects(
    createSaleWithFallback(
      async () => {
        n += 1;
        return { data: null, error: denied };
      },
      { ...base, manualDiscount: 100, discount: 100 },
      false,
    ),
    (e) => e === denied,
  );
  // Reintentar sin p_manual_discount sería saltarse el permiso.
  assert.equal(n, 1);
});

test("sin parámetros nuevos un PGRST202 no se reintenta (no hay firma más vieja)", async () => {
  let n = 0;
  await assert.rejects(
    createSaleWithFallback(
      async () => {
        n += 1;
        return { data: null, error: pgrst202 };
      },
      base,
      false,
    ),
  );
  assert.equal(n, 1);
});

test("base migrada: una sola llamada con los parámetros nuevos", async () => {
  const calls: Call[] = [];
  const result = await createSaleWithFallback(
    async (args) => {
      calls.push(args);
      return { data: "sale-3", error: null };
    },
    { ...base, manualDiscount: 100, discount: 100, amountTendered: 5000 },
    false,
  );
  assert.deepEqual(result, { saleId: "sale-3", legacy: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].p_manual_discount, 100);
});

// ---- Recibido y reimpresión ----

test("recibido: solo efectivo sin split, positivo y en centavos", () => {
  assert.equal(tenderedForSale(50000, "efectivo", 0), 50000);
  assert.equal(tenderedForSale(50000, "tarjeta", 0), null);
  assert.equal(tenderedForSale(50000, "efectivo", 2), null);
  assert.equal(tenderedForSale(0, "efectivo", 0), null);
  assert.equal(tenderedForSale(null, "efectivo", 0), null);
  assert.equal(tenderedForSale(Number.NaN, "efectivo", 0), null);
  assert.equal(tenderedForSale(1234.567, "efectivo", 0), 1234.57);
});

test("desglose guardado: se usa solo si cuadra con el descuento de la venta", () => {
  assert.deepEqual(savedLineDiscounts([2000, 500], 2500), [2000, 500]);
  assert.deepEqual(savedLineDiscounts([2000, 499.99], 2500), [2000, 499.99]);
  // Venta vieja: líneas en 0 y descuento en la venta.
  assert.equal(savedLineDiscounts([0, 0], 2500), null);
  assert.equal(savedLineDiscounts([100], 2500), null);
  assert.equal(savedLineDiscounts([undefined, null], 0), null);
});

// ---- Mensaje ----

test("SIN_PERMISO_DESCUENTO llega al cajero en español, con tuteo", () => {
  const msg = toMessage({ code: "42501", message: "SIN_PERMISO_DESCUENTO" });
  assert.match(msg, /No tienes permiso para aplicar descuentos/);
  assert.doesNotMatch(msg, /SIN_PERMISO/);
});
