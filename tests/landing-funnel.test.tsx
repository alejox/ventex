import test from "node:test";
import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RegisterPage from "../app/(auth)/register/page";
import { PricingSection } from "../components/PricingSection";
import { BUSINESS_COPY } from "../components/LandingBusinessCopy";
import { REGISTRABLE_BUSINESS_TYPES } from "../config/business";
import type { Plan, PlanPeriod } from "../services/subscription.service";

// tsx runs the repository's preserved JSX using React's classic runtime.
Object.assign(globalThis, { React });

function plan(id: string, name: string, price: number, maxSales: number | null): Plan {
  return {
    id,
    name,
    max_collaborators: 3,
    max_monthly_sales: maxSales,
    price,
    annual_charged_months: 0,
    sort_order: 0,
    is_active: true,
  };
}

function period(planId: string, price: number): PlanPeriod {
  return {
    id: `${planId}-1`,
    plan_id: planId,
    months: 1,
    name: "Mensual",
    price,
    credits: 1,
    is_active: true,
    sort_order: 0,
  };
}

test("Registro: los rubros registrables tienen nombre, descripción y aria-pressed", () => {
  const html = renderToStaticMarkup(createElement(RegisterPage));
  for (const id of REGISTRABLE_BUSINESS_TYPES) {
    assert.ok(html.includes(BUSINESS_COPY[id].label), `falta ${id}`);
    assert.ok(html.includes(BUSINESS_COPY[id].description), `falta la descripción de ${id}`);
  }
  assert.match(html, /aria-pressed="false"/);
  assert.ok(!html.includes("Confirmar contraseña"));
  assert.match(html, /Paso 1 de 2/);
});

test("Precios: tope explicado, sin 'Ventas al mes' y CTA de registro con el plan", () => {
  const html = renderToStaticMarkup(
    createElement(PricingSection, {
      plans: [plan("gratis", "Gratis", 0, 2_000_000), plan("oro", "Oro", 60_000, null)],
      periods: [period("oro", 60_000)],
    }),
  );
  assert.ok(!html.includes("Ventas al mes"));
  assert.match(html, /Hasta/);
  assert.match(html, /en ventas por mes/);
  assert.match(html, /Al llegar al tope/);
  assert.match(html, /Ventas ilimitadas/);
  // Sin sesión: el principal es registrarse con el plan; invitado, secundario.
  assert.match(html, /href="\/register\?plan=oro&amp;meses=1&amp;nombre=Oro"[^>]*>Empezar con Oro/);
  assert.match(html, /O paga sin cuenta y regístrate después/);
  assert.ok(!/renovación automática[^:]/i.test(html.replace(/sin renovación automática/gi, "")));
});
