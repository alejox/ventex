import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260730230000_align_tenant_insert_defaults.sql",
);

test.describe("Tenant insert defaults", () => {
  test("keeps generated insert types aligned with tenant triggers", () => {
    const migration = readFileSync(migrationPath, "utf8").replace(/\s+/g, " ");

    for (const table of [
      "customer_payments",
      "delivery_persons",
      "deliveries",
      "purchase_orders",
      "purchase_order_items",
    ]) {
      expect(migration).toContain(
        `alter table public.${table} alter column user_id set default public.get_effective_user_id();`,
      );
    }

    expect(migration).toContain(
      "alter table public.purchase_orders alter column order_number set default 0;",
    );
    expect(migration).toContain("pg_get_expr");
    expect(migration).toContain("raise exception");
  });

  test("omits absent RPC notes instead of sending null", () => {
    const service = readFileSync(
      resolve(process.cwd(), "services/inventory-movements.service.ts"),
      "utf8",
    );

    expect(service).toContain("p_notes: input.notes || undefined");
    expect(service).not.toContain("p_notes: input.notes || null");
  });
});
