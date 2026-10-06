import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceRole, overviewFromRpc } from "@/services/finance.service";

test("una cotización nunca es ingreso ni gasto, aunque diga 'Pagada'", () => {
  assert.equal(invoiceRole("factura"), "income");
  assert.equal(invoiceRole("compra"), "expense");
  assert.equal(invoiceRole("cotizacion"), null);
  assert.equal(invoiceRole("otra-cosa"), null);
});

const MONTHS = [
  { key: "2026-09", label: "Sep" },
  { key: "2026-10", label: "Oct" },
];

test("overviewFromRpc rellena en cero los meses que la base no manda", () => {
  const o = overviewFromRpc(
    {
      revenue: "150000",
      expenses: 40000,
      sales_count: 3,
      monthly: [{ key: "2026-10", income: "150000", expense: "40000" }],
      by_category: [],
      recent: [],
    },
    MONTHS,
  );
  assert.equal(o.revenue, 150000);
  assert.equal(o.net, 110000);
  assert.equal(o.salesCount, 3);
  assert.deepEqual(
    o.monthly.map((m) => [m.key, m.income, m.expense]),
    [
      ["2026-09", 0, 0],
      ["2026-10", 150000, 40000],
    ],
  );
});

test("overviewFromRpc ordena el desglose de mayor a menor y descarta porciones en cero", () => {
  const o = overviewFromRpc(
    {
      by_category: [
        { id: "a", label: "Arriendo", color: "#000", amount: 1000 },
        { id: "compras", label: "Compras a proveedores", color: "#111", amount: "5000" },
        { id: "z", label: "Vacía", color: "#222", amount: 0 },
      ],
    },
    MONTHS,
  );
  assert.deepEqual(
    o.expensesByCategory.map((c) => c.id),
    ["compras", "a"],
  );
});

test("overviewFromRpc tolera una respuesta vacía", () => {
  const o = overviewFromRpc({}, MONTHS);
  assert.equal(o.revenue, 0);
  assert.equal(o.net, 0);
  assert.deepEqual(o.recent, []);
  assert.equal(o.monthly.length, 2);
});

test("los movimientos recientes conservan el signo (gasto negativo)", () => {
  const o = overviewFromRpc(
    {
      recent: [
        { id: "1", kind: "expense", label: "Arriendo", amount: "-800000", date: "2026-10-01T05:00:00Z", day: "2026-10-01" },
      ],
    },
    MONTHS,
  );
  assert.equal(o.recent[0].amount, -800000);
  assert.equal(o.recent[0].day, "2026-10-01");
});
