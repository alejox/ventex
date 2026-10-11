import { test } from "node:test";
import assert from "node:assert/strict";
import { isBusinessRejection, toMessage } from "@/lib/errors";

// INSUMO_INSUFICIENTE llega de DOS funciones con el mismo prefijo y distinto
// detalle: `register_production_batch` ("…y el lote necesita 2") y, desde
// 20261011100000, `apply_sale_recipe` dentro de `create_sale` ("…y la venta
// necesita 0.167"). Un solo mensaje tiene que servir a ambos.

test("INSUMO_INSUFICIENTE de la venta se traduce con el detalle y sin el código", () => {
  const msg = toMessage({
    code: "22023",
    message: "INSUMO_INSUFICIENTE: Leche — hay 0.100 Unidad y la venta necesita 0.167",
  });
  assert.match(msg, /^No alcanza el insumo: Leche — hay 0\.100 Unidad y la venta necesita 0\.167\./);
  assert.match(msg, /Registra la compra, ajusta su stock o activa la venta sin stock en Ajustes/);
  assert.doesNotMatch(msg, /INSUMO_INSUFICIENTE/);
});

test("INSUMO_INSUFICIENTE del lote usa el mismo remate", () => {
  const msg = toMessage({
    code: "22023",
    message: "INSUMO_INSUFICIENTE: Azúcar — hay 1.000 kg y el lote necesita 2.000",
  });
  assert.match(msg, /Azúcar — hay 1\.000 kg y el lote necesita 2\.000\. Registra la compra, ajusta su stock/);
});

test("un rechazo 22023 de create_sale es definitivo: la venta encolada va a conflictos, no se reintenta", () => {
  assert.equal(
    isBusinessRejection({ code: "22023", message: "INSUMO_INSUFICIENTE: Leche — hay 0 Unidad y la venta necesita 1" }),
    true,
  );
  assert.equal(isBusinessRejection({ code: "22023", message: "METODO_PAGO_INVALIDO" }), true);
  // Lo que puede andar en el próximo intento sigue afuera.
  assert.equal(isBusinessRejection({ code: "PGRST301", message: "JWT expired" }), false);
  assert.equal(isBusinessRejection({ message: "Failed to fetch" }), false);
});
