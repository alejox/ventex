import test from "node:test";
import assert from "node:assert/strict";
import { TAX_REGIME_LABEL, taxRegimeOf, taxSettingsForRegime } from "../services/settings.service";

test("el régimen inicial sale de include_tax, no del perfil guardado", () => {
  assert.equal(taxRegimeOf(true), "responsable");
  assert.equal(taxRegimeOf(false), "no_responsable");
});

test("Responsable de IVA guarda include_tax=true, la tasa escrita y el texto del perfil", () => {
  assert.deepEqual(taxSettingsForRegime("responsable", "5", 0.19), {
    include_tax: true,
    tax_rate: 0.05,
    taxResponsibility: TAX_REGIME_LABEL.responsable,
  });
  // Se acota a 0–100 % y a 4 decimales, igual que la columna.
  assert.equal(taxSettingsForRegime("responsable", "150", 0.19).tax_rate, 1);
  assert.equal(taxSettingsForRegime("responsable", "19.005", 0.19).tax_rate, 0.1901);
  // Una tasa ilegible no borra la que ya había.
  assert.equal(taxSettingsForRegime("responsable", "", 0.19).tax_rate, 0.19);
});

test("No responsable apaga el IVA y conserva la tasa guardada para cuando vuelva", () => {
  assert.deepEqual(taxSettingsForRegime("no_responsable", "5", 0.19), {
    include_tax: false,
    tax_rate: 0.19,
    taxResponsibility: TAX_REGIME_LABEL.no_responsable,
  });
});
