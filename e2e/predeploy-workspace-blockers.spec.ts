import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260730233000_multi_workspace_memberships.sql",
  ),
  "utf8",
);
const workspaceChooser = readFileSync(
  resolve(process.cwd(), "components/WorkspaceChooser.tsx"),
  "utf8",
);
const workspaceStore = readFileSync(
  resolve(process.cwd(), "stores/workspace.store.ts"),
  "utf8",
);
const workspaceService = readFileSync(
  resolve(process.cwd(), "services/workspace.service.ts"),
  "utf8",
);
const proxy = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");
const dashboardLayout = readFileSync(
  resolve(process.cwd(), "app/dashboard/layout.tsx"),
  "utf8",
);

test.describe("Workspace pre-deployment blockers", () => {
  test("counts the cash component of split sales exactly once in shift totals", () => {
    expect(migration).toContain(
      "when sale_row.payment_method = 'split' then",
    );
    expect(migration).toContain(
      "payment.payment_method = 'efectivo'",
    );
    expect(migration).toContain("sum(payment.amount)");
    expect(migration).toContain("cash_refund");
    expect(migration).toContain("cash_refund > 0");
    expect(
      migration.match(/sale_row\.status in \('completed', 'void'\)/g) ?? [],
    ).toHaveLength(2);
  });

  test("removes direct cash and sale ledger mutation surfaces", () => {
    expect(migration).toContain(
      "revoke insert, update, delete on public.cash_movements from authenticated",
    );
    expect(migration).toContain(
      "revoke insert, update, delete on public.shifts from authenticated",
    );
    expect(migration).toContain(
      "revoke insert, update, delete on public.sales from authenticated",
    );
    expect(migration).toContain(
      "revoke insert, update, delete on public.sale_items from authenticated",
    );
    expect(migration).toContain(
      "revoke insert, update, delete on public.sale_payments from authenticated",
    );
  });

  test("drops every legacy tenant policy before installing permission policies", () => {
    for (const table of [
      "appointments",
      "cash_movements",
      "categories",
      "customer_payments",
      "customers",
      "deliveries",
      "delivery_persons",
      "distributors",
      "expenses",
      "inventory_movements",
      "invoice_items",
      "invoices",
      "notifications",
      "products",
      "purchase_order_items",
      "purchase_orders",
      "sale_items",
      "sale_payments",
      "sales",
      "services",
      "settings",
      "shifts",
      "staff",
      "vehicles",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }

    expect(migration).toContain("from pg_catalog.pg_policies");
    expect(migration).toContain("workspace_products_write");
    expect(migration).toContain("public.worker_can('inventory_edit')");
    expect(migration).toContain("workspace_appointments_write");
    expect(migration).toContain("public.worker_can('calendar')");
    expect(migration).toContain("workspace_sales_read");
    expect(migration).toContain("public.worker_can('sales')");
  });

  test("scopes notification reads and acknowledgements to the selected owner workspace", () => {
    const service = readFileSync(
      resolve(process.cwd(), "services/notifications.service.ts"),
      "utf8",
    );

    expect(migration).toContain("workspace_notifications_read");
    expect(migration).toContain("workspace_notifications_acknowledge");
    expect(migration).toContain("public.is_tenant_owner()");
    expect(migration).toContain(
      "grant update (read_at) on public.notifications to authenticated",
    );
    expect(service).toContain("getSelectedWorkspaceId");
    expect(service).toContain('.eq("user_id", workspaceId)');
  });

  test("posts cash refunds to the caller's current active shift", () => {
    expect(migration).toContain("if cash_refund > 0 then");
    expect(migration).toContain("shift_id,\n      workspace,\n      caller,\n      membership_id");
    expect(migration).toContain(
      "raise exception 'Debes abrir turno antes de devolver efectivo'",
    );
    expect(migration).not.toContain("original_shift_membership_id");
    expect(migration).not.toContain("original_shift_worker_id");
    expect(migration).not.toContain(
      "cash_refund > 0 and sale_row.shift_id is not null",
    );
  });

  test("reconciles customer payment and stock RPC execution authority", () => {
    expect(migration).toContain(
      "create or replace function public.register_customer_payment(",
    );
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("p_amount is null or p_amount <= 0");
    expect(migration).toContain("public.worker_can('customers')");
    expect(migration).toContain("customer.user_id = workspace");
    expect(migration).toContain(
      "revoke execute on function public.register_customer_payment(uuid, numeric) from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.register_customer_payment(uuid, numeric) to authenticated",
    );
    expect(migration).toContain(
      "revoke execute on function public.increment_stock(uuid, integer) from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.increment_stock(uuid, integer) to authenticated",
    );
    expect(migration).toContain(
      "has_function_privilege('anon', 'public.increment_stock(uuid,integer)', 'EXECUTE')",
    );
    expect(migration).toContain(
      "'public.register_customer_payment(uuid,numeric)'",
    );
    expect(migration).toContain(
      "has_function_privilege('anon', function_def.oid, 'EXECUTE')",
    );
  });

  test("removes anonymous access to workspace ledgers", () => {
    for (const table of [
      "cash_movements",
      "shifts",
      "sales",
      "sale_items",
      "sale_payments",
      "notifications",
    ]) {
      expect(migration).toContain(`public.${table}`);
      expect(migration).toContain(
        `has_table_privilege('anon', 'public.${table}', 'SELECT')`,
      );
    }

    expect(migration).toContain(
      "revoke all on table public.cash_movements, public.shifts, public.sales,",
    );
    expect(migration).toContain(
      "public.sale_items, public.sale_payments, public.notifications from anon",
    );
  });

  test("keeps migrated owners recognized and gives an empty workspace session a safe exit", () => {
    expect(migration).toContain("insert into public.workspaces (id, owner_user_id)");
    expect(migration).toContain("p.business_type is not null");
    expect(migration).toContain("'owner'");

    expect(proxy).toContain(
      'user && request.nextUrl.pathname === "/login"',
    );
    expect(proxy).toContain('url.pathname = "/dashboard"');
    expect(dashboardLayout).toContain('redirect("/workspace")');

    expect(workspaceService).toContain(
      "export async function signOut(): Promise<void>",
    );
    expect(workspaceService).toContain("client.auth.signOut()");
    expect(workspaceStore).toContain("signOut: () => Promise<boolean>");
    expect(workspaceStore).toContain("workspaceService.signOut()");
    expect(workspaceChooser).toContain("Cerrar sesión");
    expect(workspaceChooser).toContain('window.location.assign("/login")');
  });
});
