import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompanyRows,
  countCompanies,
  matchesCompanyFilter,
  platformKpis,
  sortCompanyRows,
} from "../app/admin/company-metrics";
import type { AdminCompany, AdminCompanyActivity } from "../services/admin.service";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

function company(id: string, over: Partial<AdminCompany> = {}): AdminCompany {
  return {
    user_id: id,
    business_name: `Negocio ${id}`,
    full_name: null,
    email: `${id}@x.co`,
    plan_id: "basica",
    plan_name: "Básica",
    status: "active",
    is_super_admin: false,
    is_reseller: false,
    license_status: null,
    reseller_name: null,
    period_end: null,
    staff_count: 1,
    monthly_sales: 0,
    total_sales: 0,
    created_at: daysAgo(100),
    ...over,
  };
}

function activity(id: string, over: Partial<AdminCompanyActivity> = {}): AdminCompanyActivity {
  return {
    user_id: id,
    business_type: "tienda",
    registered_at: daysAgo(100),
    last_sign_in_at: null,
    last_operational_activity_at: null,
    activation_stage: "registered",
    monthly_sales_count: 0,
    monthly_gmv: 0,
    customers_count: 0,
    products_count: 0,
    services_count: 0,
    staff_count: 1,
    ...over,
  };
}

test("platformKpis: vencen en 7 días (sin contar las ya vencidas) y altas de 30 días", () => {
  const kpis = platformKpis(
    [
      company("a", { period_end: inDays(3), created_at: daysAgo(5) }),
      company("b", { period_end: inDays(-2) }),
      company("c", { period_end: inDays(40), created_at: daysAgo(29) }),
      company("d"),
    ],
    NOW,
  );
  assert.deepEqual(kpis, { expiringSoon: 1, registrations30: 2 });
});

test("cada KPI filtra las filas", () => {
  const rows = buildCompanyRows(
    [company("a"), company("b"), company("c", { period_end: inDays(2) })],
    new Map([
      [
        "a",
        activity("a", {
          registered_at: daysAgo(3),
          activation_stage: "activated",
          last_operational_activity_at: daysAgo(1),
        }),
      ],
      ["b", activity("b")],
    ]),
  );
  assert.equal(countCompanies(rows, "new7", NOW), 1);
  assert.equal(countCompanies(rows, "activatedNew", NOW), 1);
  assert.equal(countCompanies(rows, "active7", NOW), 1);
  // "c" no tiene actividad cargada: no se la marca como inactiva.
  assert.equal(countCompanies(rows, "noActivity", NOW), 1);
  assert.equal(countCompanies(rows, "expiring", NOW), 1);
  assert.ok(rows.every((row) => matchesCompanyFilter(row, "all", NOW)));
});

test("orden: los vacíos van al final en ambas direcciones", () => {
  const rows = buildCompanyRows(
    [
      company("sin", { period_end: null }),
      company("tarde", { period_end: inDays(30) }),
      company("pronto", { period_end: inDays(1) }),
    ],
    new Map(),
  );
  assert.deepEqual(
    sortCompanyRows(rows, "expiry", "asc").map((r) => r.company.user_id),
    ["pronto", "tarde", "sin"],
  );
  assert.deepEqual(
    sortCompanyRows(rows, "expiry", "desc").map((r) => r.company.user_id),
    ["tarde", "pronto", "sin"],
  );
});

test("orden por GMV y por nombre", () => {
  const rows = buildCompanyRows(
    [company("b", { monthly_sales: 10 }), company("a", { monthly_sales: 50 })],
    new Map(),
  );
  assert.deepEqual(sortCompanyRows(rows, "gmv", "desc").map((r) => r.company.user_id), ["a", "b"]);
  assert.deepEqual(sortCompanyRows(rows, "name", "asc").map((r) => r.company.user_id), ["a", "b"]);
});
