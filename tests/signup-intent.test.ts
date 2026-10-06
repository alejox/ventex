import test from "node:test";
import assert from "node:assert/strict";
import {
  afterOnboardingPath,
  onboardingPath,
  parseSignupIntent,
  sanitizeMonths,
  sanitizePlanId,
} from "../lib/signup-intent";
import { normalizeColombianMobile } from "../lib/co-mobile";

test("onboardingPath lleva rubro, módulos y plan en la query de /dashboard", () => {
  const path = onboardingPath({
    businessType: "salon",
    modules: { appointments: true, services: true, staff: false },
    plan: "oro",
    months: 3,
  });
  const url = new URL(path, "https://x.invalid");
  assert.equal(url.pathname, "/dashboard");
  assert.equal(url.searchParams.get("rubro"), "salon");
  assert.equal(url.searchParams.get("modulos"), "appointments,services");
  assert.equal(url.searchParams.get("plan"), "oro");
  assert.equal(url.searchParams.get("meses"), "3");
});

test("onboardingPath sin elecciones vuelve al panel pelado", () => {
  assert.equal(onboardingPath({}), "/dashboard");
});

test("parseSignupIntent descarta rubros cerrados y módulos que el rubro no ofrece", () => {
  const closed = parseSignupIntent(new URLSearchParams("rubro=lavaautos&modulos=vehicles"));
  assert.equal(closed.businessType, null);
  assert.equal(closed.modules, null);

  const forged = parseSignupIntent(new URLSearchParams("rubro=salon&modulos=appointments,vehicles,billing"));
  assert.deepEqual(forged.modules, { appointments: true });
});

test("parseSignupIntent distingue 'ningún módulo' de 'no vino el parámetro'", () => {
  assert.deepEqual(parseSignupIntent(new URLSearchParams("rubro=salon&modulos=")).modules, {});
  assert.equal(parseSignupIntent(new URLSearchParams("rubro=salon")).modules, null);
});

test("el round-trip conserva lo elegido", () => {
  const path = onboardingPath({ businessType: "escuela", modules: { school: true }, plan: "basica", months: 1 });
  const parsed = parseSignupIntent(new URL(path, "https://x.invalid").searchParams);
  assert.deepEqual(parsed, { businessType: "escuela", modules: { school: true }, plan: "basica", months: 1 });
});

test("plan y meses solo aceptan valores inofensivos", () => {
  assert.equal(sanitizePlanId("Oro"), "oro");
  assert.equal(sanitizePlanId("../admin"), null);
  assert.equal(sanitizePlanId("<b>x</b>"), null);
  assert.equal(sanitizeMonths("12"), 12);
  assert.equal(sanitizeMonths("0"), null);
  assert.equal(sanitizeMonths("abc"), null);
});

test("afterOnboardingPath: con plan va al checkout de la landing; sin plan, al POS", () => {
  assert.equal(afterOnboardingPath(null, null), "/dashboard/pos");
  assert.equal(afterOnboardingPath("oro", 3), "/?plan=oro&meses=3#precios");
  assert.equal(afterOnboardingPath("//evil.com", 1), "/dashboard/pos");
});

test("celular colombiano: 10 dígitos empezando en 3, con o sin +57", () => {
  assert.equal(normalizeColombianMobile("300 123 4567"), "3001234567");
  assert.equal(normalizeColombianMobile("+57 300-123-4567"), "3001234567");
  assert.equal(normalizeColombianMobile("6011234567"), null);
  assert.equal(normalizeColombianMobile("30012345"), null);
  assert.equal(normalizeColombianMobile("30012345678"), null);
});
