import test from "node:test";
import assert from "node:assert/strict";
import { customerImpactLines, filterCustomersByDebt } from "../app/dashboard/customers/customer-list";
import {
  distributorImpact,
  filterDistributorsByStatus,
  parseDistributorStatusFilter,
} from "../app/dashboard/distributors/distributor-list";

test("customerImpactLines solo nombra lo que existe, en singular o plural", () => {
  assert.deepEqual(customerImpactLines({ sales: 0, payments: 0, appointments: 0, vehicles: 0 }), []);
  const lines = customerImpactLines({ sales: 1, payments: 3, appointments: 0, vehicles: 2 });
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^1 venta quedará sin cliente/);
  assert.match(lines[1], /^3 abonos se borrarán/);
  assert.match(lines[2], /^2 vehículos quedarán sin dueño/);
});

test("filterCustomersByDebt deja solo saldos positivos", () => {
  const rows = [{ credit_balance: 0 }, { credit_balance: 5000 }, { credit_balance: null }];
  assert.equal(filterCustomersByDebt(rows, false).length, 3);
  assert.deepEqual(filterCustomersByDebt(rows, true), [{ credit_balance: 5000 }]);
});

test("distributorImpact: con productos asociados no se puede borrar", () => {
  const blocked = distributorImpact({ purchases: 12, products: 2 });
  assert.equal(blocked.canDelete, false);
  assert.match(blocked.lines[0], /^12 compras quedarán sin proveedor/);
  assert.match(blocked.lines[1], /^2 productos lo tienen/);

  const free = distributorImpact({ purchases: 1, products: 0 });
  assert.equal(free.canDelete, true);
  assert.deepEqual(free.lines, ["1 compra quedará sin proveedor."]);
});

test("filtro de estado de proveedores: activos por defecto", () => {
  const rows = [{ status: "active" }, { status: "inactive" }, { status: null }];
  assert.equal(parseDistributorStatusFilter(""), "active");
  assert.equal(parseDistributorStatusFilter("basura"), "active");
  assert.equal(filterDistributorsByStatus(rows, "active").length, 2);
  assert.deepEqual(filterDistributorsByStatus(rows, "archived"), [{ status: "inactive" }]);
  assert.equal(filterDistributorsByStatus(rows, "all").length, 3);
});
