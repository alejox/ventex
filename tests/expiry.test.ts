import test from "node:test";
import assert from "node:assert/strict";
import { daysUntil, expiryLabel, expiryTone, needsRenewal } from "../components/ui/ExpiryCell";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

test("daysUntil redondea hacia arriba y es negativo si ya venció", () => {
  assert.equal(daysUntil(inDays(3), NOW), 3);
  assert.equal(daysUntil(inDays(-2), NOW), -2);
  assert.equal(daysUntil(new Date(NOW + 3_600_000).toISOString(), NOW), 1);
});

test("expiryTone: sin fecha, vencida, por vencer (hasta 7 días) y al día", () => {
  assert.equal(expiryTone(null, NOW), "none");
  assert.equal(expiryTone(inDays(-1), NOW), "expired");
  assert.equal(expiryTone(inDays(0), NOW), "soon");
  assert.equal(expiryTone(inDays(7), NOW), "soon");
  assert.equal(expiryTone(inDays(8), NOW), "ok");
});

test("needsRenewal: vencidas y por vencer; no las al día ni las sin fecha", () => {
  assert.equal(needsRenewal(inDays(-30), NOW), true);
  assert.equal(needsRenewal(inDays(5), NOW), true);
  assert.equal(needsRenewal(inDays(20), NOW), false);
  assert.equal(needsRenewal(null, NOW), false);
});

test("expiryLabel: singular y plural", () => {
  assert.equal(expiryLabel(-1), "Vencido hace 1 día");
  assert.equal(expiryLabel(-3), "Vencido hace 3 días");
  assert.equal(expiryLabel(0), "Vence hoy");
  assert.equal(expiryLabel(1), "Faltan 1 día");
  assert.equal(expiryLabel(10), "Faltan 10 días");
});
