import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";

const require = createRequire(import.meta.url);
const noop = () => {};
const staff = ["No Account", "Active", "Pending", "Suspended"].map((full_name, index) => ({
  id: `staff-${index}`, full_name, status: "active", role: "Barbero", photo_url: null,
}));

// Evaluate the actual page with explicit boundary mocks, never a copied card.
function renderPage(membershipKind = "owner", submitting = false) {
  const accounts = ["active", "pending", "suspended"].map((access_status, index) => ({
    id: `account-${index}`, staff_id: `staff-${index + 1}`, full_name: staff[index + 1].full_name,
    access_status, worker_permissions: {}, is_admin: false,
  }));
  const storeSelector = (state: object) => (selector: (value: object) => unknown) => selector(state);
  const staffState = { staff, accounts, commissions: [], loading: false, submitting,
    fetchStaff: noop, fetchAccounts: noop, fetchCommissions: noop };
  const Empty = () => null;
  const mocks: Record<string, unknown> = {
    "next/navigation": { useRouter: () => ({ push: noop }) },
    "next/link": { default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> },
    "next/image": { default: Empty },
    "@/stores/staff.store": { useStaffStore: storeSelector(staffState) },
    "@/stores/subscription.store": { useSubscriptionStore: storeSelector({ subscription: null }) },
    "@/stores/school-people.store": { useSchoolPeopleStore: storeSelector({ teachers: [] }) },
    "@/stores/school.store": { useSchoolStore: storeSelector({ settings: { instruments: [] } }) },
    "@/stores/settings.store": { useSettingsStore: storeSelector({ settings: null }) },
    "@/services/staff.service": {},
    "@/services/school-settings.service": { catalogOptions: () => [], catalogLabel: noop },
    "@/components/ProfileProvider": { useProfile: () => ({ businessType: "salon", membershipKind, isWorker: membershipKind === "worker", modules: { school: false } }) },
    "@/components/ui/ConfirmDialog": { ConfirmDialog: Empty, useConfirm: () => ({ confirm: noop, dialog: null }) },
    "./components/PermissionToggles": { useApplicablePermissions: () => [] },
    "@/lib/notifications": { notifySuccess: noop, notifyError: noop },
    "@/lib/useMoney": { useFormatMoney: () => (value: number) => `$${value}` },
    "./components/StaffCardMenu": { CARD_ICON_BUTTON: "card-icon", StaffCardMenu: ({ actions }: { actions: { label: string }[] }) => <div role="menu">{actions.map((action) => <button key={action.label} role="menuitem" data-menu-action={action.label}>{action.label}</button>)}</div> },
  };
  for (const [path, name] of [
    ["@/components/ui/Select", "Select"], ["@/components/ui/Switch", "Switch"],
    ["@/components/ui/Modal", "Modal"], ["@/components/StaffPhotoField", "StaffPhotoField"],
    ["@/components/school/AvailabilityEditor", "AvailabilityEditor"],
    ["./components/GrantAccessModal", "GrantAccessModal"], ["./components/EditAccessModal", "EditAccessModal"],
    ["./components/PermissionsPanel", "PermissionsPanel"], ["./components/ShiftHistorySection", "ShiftHistorySection"],
  ]) mocks[path] = { [name]: Empty };
  const source = readFileSync(new URL("../app/dashboard/staff/page.tsx", import.meta.url), "utf8");
  const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports: { default?: React.ComponentType } = {};
  runInNewContext(compiled, { exports, require: (path: string) => {
    if (path in mocks) return mocks[path];
    if (["react", "react/jsx-runtime", "@/config/business", "@/config/plans", "@/lib/team", "@/components/CollectionState", "@/app/assets/icons/DashboardIcons", "lucide-react"].includes(path)) return require(path);
    throw new Error(`Unexpected page dependency: ${path}`);
  } });
  assert.ok(exports.default);
  return renderToStaticMarkup(React.createElement(exports.default));
}

test("owners see first-time access outside overflow only for staff without accounts", () => {
  const html = renderPage();
  assert.equal((html.match(/>Dar acceso al sistema<\/button>/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-menu-action="Dar acceso al sistema"/);
  assert.match(html, /aria-label="Dar acceso al sistema a No Account"/);
  assert.equal((html.match(/data-menu-action="Permisos"/g) ?? []).length, 3);
  for (const label of ["Suspender acceso", "Reenviar invitación", "Reactivar acceso"]) {
    assert.ok(html.includes(`data-menu-action="${label}"`));
  }
});

test("administrators and workers cannot grant access or manage other accounts", () => {
  for (const membership of ["admin", "worker"]) {
    const html = renderPage(membership);
    for (const label of ["Dar acceso al sistema", "Cuenta de acceso", "Permisos", "Suspender acceso", "Reenviar invitación", "Reactivar acceso"]) assert.ok(!html.includes(label), label);
  }
});

test("the visible grant action is disabled while a shared staff submission is pending", () => {
  const html = renderPage("owner", true);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Dar acceso al sistema<\/button>/);
});

test("editar y eliminar están a la vista en la tarjeta, fuera del menú", () => {
  for (const membership of ["owner", "admin"]) {
    const html = renderPage(membership);
    assert.match(html, /aria-label="Editar a No Account"/);
    assert.match(html, /aria-label="Eliminar a No Account"/);
    assert.doesNotMatch(html, /data-menu-action="Editar ficha"/);
  }
});

test("un trabajador no ve el botón de eliminar", () => {
  const html = renderPage("worker");
  assert.doesNotMatch(html, /aria-label="Eliminar a /);
});
