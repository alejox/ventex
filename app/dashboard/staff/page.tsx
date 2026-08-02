"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { IconUserBadge, IconPlus, IconLogOut } from "@/app/assets/icons/DashboardIcons";
import { useStaffStore } from "@/stores/staff.store";
import { useSubscriptionStore } from "@/stores/subscription.store";
import { fetchStaffSales } from "@/services/staff.service";
import type { CommissionRow, NewStaffInput, StaffMember, StaffSaleItem } from "@/services/staff.service";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { Select } from "@/components/ui/Select";
import { useProfile } from "@/components/ProfileProvider";
import { staffRolesForType } from "@/config/business";
import { mergeTeam, hasStaffRecord } from "@/lib/team";
import { GrantAccessModal } from "./components/GrantAccessModal";
import { EditAccessModal } from "./components/EditAccessModal";
import { PermissionsPanel } from "./components/PermissionsPanel";
import { ShiftHistorySection } from "./components/ShiftHistorySection";

// Los cargos NO se escriben acá: salen de STAFF_ROLES_BY_TYPE según el rubro
// (config/business.ts). Una barbería ofrece Barbero y Estilista; una tienda,
// Cajero y Bodeguero. Tener la lista a mano en esta pantalla era lo que hacía
// que a un tendero le apareciera "Detailer" en el selector.
const EMPTY_STAFF: NewStaffInput = {
  full_name: "",
  role: "",
  phone: "",
  email: "",
  status: "active",
};

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COMMISSION_COLUMNS: DataColumn<CommissionRow>[] = [
  {
    header: "Miembro",
    mobile: "title",
    className: "pl-6 font-medium text-on-surface",
    headerClassName: "pl-6",
    cell: (c) => c.full_name,
  },
  {
    header: "Comisión",
    align: "right",
    mobile: "trailing",
    className: "pr-6 font-bold text-on-surface tabular-nums",
    headerClassName: "pr-6",
    cell: (c) => `$${money(c.commission)}`,
  },
  {
    header: "Ventas",
    align: "center",
    className: "text-on-surface-variant",
    cell: (c) => c.salesCount,
  },
  {
    header: "Vendido",
    align: "right",
    className: "text-on-surface-variant tabular-nums",
    cell: (c) => `$${money(c.soldTotal)}`,
  },
];

export default function StaffPage() {
  const staff = useStaffStore((s) => s.staff);
  const loading = useStaffStore((s) => s.loading);
  const error = useStaffStore((s) => s.error);
  const submitting = useStaffStore((s) => s.submitting);
  const fetchStaff = useStaffStore((s) => s.fetchStaff);
  const addStaff = useStaffStore((s) => s.addStaff);
  const updateStaff = useStaffStore((s) => s.updateStaff);
  const commissions = useStaffStore((s) => s.commissions);
  const commissionsLoading = useStaffStore((s) => s.commissionsLoading);
  const fetchCommissions = useStaffStore((s) => s.fetchCommissions);

  const subscription = useSubscriptionStore((s) => s.subscription);
  const fetchSubscription = useSubscriptionStore((s) => s.fetchAll);
  const refreshUsage = useSubscriptionStore((s) => s.refreshUsage);

  const deleteStaff = useStaffStore((s) => s.deleteStaff);

  const accounts = useStaffStore((s) => s.accounts);
  const fetchAccounts = useStaffStore((s) => s.fetchAccounts);
  const revokeAccess = useStaffStore((s) => s.revokeAccess);
  const reactivateAccess = useStaffStore((s) => s.reactivateAccess);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NewStaffInput>(EMPTY_STAFF);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  /** Ids de la persona sobre la que está abierto cada modal de acceso. */
  const [grantFor, setGrantFor] = useState<string | null>(null);
  const [editAccessFor, setEditAccessFor] = useState<string | null>(null);
  const [permsFor, setPermsFor] = useState<string | null>(null);

  const profile = useProfile();
  const roleOptions = staffRolesForType(profile?.businessType ?? null);
  /** Un cargo viejo que ya no está en el catálogo del rubro no se pierde. */
  const roleChoices =
    form.role && !roleOptions.includes(form.role) ? [form.role, ...roleOptions] : roleOptions;

  // Una fila por PERSONA: la ficha manda y el acceso cuelga de ella.
  const team = useMemo(() => mergeTeam(staff, accounts), [staff, accounts]);

  const commissionByStaff = useMemo(
    () => new Map(commissions.map((c) => [c.staff_id, c.commission])),
    [commissions],
  );

  const grantMember = grantFor ? team.find((m) => m.id === grantFor) ?? null : null;
  const accountToEdit = editAccessFor ? accounts.find((a) => a.id === editAccessFor) ?? null : null;
  const accountForPerms = permsFor ? accounts.find((a) => a.id === permsFor) ?? null : null;

  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [salesStaff, setSalesStaff] = useState<StaffMember | null>(null);
  const [sales, setSales] = useState<StaffSaleItem[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);

  const openSales = useCallback(async (m: StaffMember) => {
    setSalesStaff(m);
    setSales([]);
    setSalesLoading(true);
    setSalesModalOpen(true);
    try {
      const data = await fetchStaffSales(m.id);
      setSales(data);
    } catch {
      setSales([]);
    } finally {
      setSalesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
    fetchAccounts();
    fetchCommissions();
    fetchSubscription();
  }, [fetchStaff, fetchAccounts, fetchCommissions, fetchSubscription]);

  const handleRevoke = useCallback(
    async (accountId: string, name: string) => {
      if (confirm(`¿Suspender el acceso de "${name}"? Dejará de entrar inmediatamente, pero su ficha, permisos e historial se conservan.`)) {
        await revokeAccess(accountId);
      }
    },
    [revokeAccess],
  );

  const activeCount = staff.filter((m) => m.status === "active").length;
  const maxCollaborators = subscription?.max_collaborators ?? Infinity;
  const atCollaboratorLimit = activeCount >= maxCollaborators;

  const openCreate = () => {
    if (atCollaboratorLimit) return;
    setEditingId(null);
    setForm(EMPTY_STAFF);
    setModalOpen(true);
  };

  const openEdit = (m: StaffMember) => {
    setEditingId(m.id);
    setForm({
      full_name: m.full_name,
      role: m.role ?? "",
      phone: m.phone ?? "",
      email: m.email ?? "",
      status: m.status,
    });
    setModalOpen(true);
  };

  const handleClose = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_STAFF);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = editingId
      ? await updateStaff(editingId, form)
      : await addStaff(form);
    if (ok) {
      handleClose();
      refreshUsage();
    }
  };

  const initials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Personal</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Tu equipo en un solo lugar: cargo, comisión y quién entra al sistema.
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={atCollaboratorLimit}
          title={atCollaboratorLimit ? "Alcanzaste el límite de colaboradores de tu plan" : undefined}
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#6063ee] disabled:hover:text-white"
        >
          <IconPlus className="w-4 h-4" />
          <span>Añadir Personal</span>
        </button>
      </div>

      {subscription && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-on-surface-variant">
            Colaboradores:{" "}
            <strong className="text-on-surface tabular-nums">
              {activeCount}
              {Number.isFinite(maxCollaborators) ? ` / ${maxCollaborators}` : ""}
            </strong>{" "}
            <span className="text-on-surface-variant/70">· Plan {subscription.plan_name}</span>
          </span>
        </div>
      )}

      {atCollaboratorLimit && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-600 dark:text-amber-400 flex flex-wrap items-center justify-between gap-2">
          <span>
            Alcanzaste el máximo de colaboradores del plan <strong>{subscription?.plan_name}</strong>.
          </span>
          <Link href="/dashboard/subscription" className="font-semibold underline whitespace-nowrap">
            Ver planes
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-on-surface-variant py-12">Cargando equipo…</p>
      ) : staff.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-8">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
            <IconUserBadge className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-on-surface mb-2">Aún no hay nadie en tu equipo</h2>
          <p className="text-sm text-on-surface-variant max-w-sm mb-6">
            Añade a tu personal para llevar sus comisiones y, si lo necesitas, darle
            su propio usuario para entrar al sistema.
          </p>
          <button
            onClick={openCreate}
            className="px-6 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
          >
            Añadir tu primer miembro
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {team.map((m) => (
            <div
              key={m.id}
              onClick={() => hasStaffRecord(m) && openEdit(m)}
              className="text-left bg-surface-container rounded-2xl border border-outline-variant/10 shadow-sm p-5 hover:border-primary/30 hover:shadow-md transition-all group relative cursor-pointer"
            >
              <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-surface-container-lowest/80 border border-outline-variant/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3.5 h-3.5 text-on-surface-variant">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">{initials(m.full_name)}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-on-surface truncate group-hover:text-primary transition-colors">{m.full_name}</h3>
                  <p className="text-xs text-on-surface-variant">{m.role ?? "—"}</p>
                </div>
                {m.status !== "active" && (
                  <span className="ml-auto inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-surface-variant text-on-surface-variant shrink-0">
                    Inactivo
                  </span>
                )}
              </div>
              <div className="space-y-1 text-sm text-on-surface-variant">
                {m.phone && <div className="truncate">{m.phone}</div>}
                {m.email && <div className="truncate text-xs">{m.email}</div>}
              </div>
              {/* La comisión se configura por producto/servicio, no por
                  persona: acá se muestra lo DEVENGADO en el mes, que es la
                  pregunta real ("¿cuánto le debo?"). La tasa de la ficha no se
                  muestra porque no la usa nadie para calcular. */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-outline-variant/10">
                <span className="text-xs font-medium text-on-surface-variant">Comisión del mes</span>
                <span className="text-base font-bold text-on-surface tabular-nums">
                  ${money(commissionByStaff.get(m.id) ?? 0)}
                </span>
              </div>

              {/* Acceso al sistema: la mitad que antes vivía en Ajustes. */}
              <div className="mt-3 pt-3 border-t border-outline-variant/10">
                {m.account ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        m.account.access_status === "active"
                          ? "bg-emerald-500"
                          : m.account.access_status === "pending"
                            ? "bg-amber-500"
                            : "bg-error"
                      }`} />
                      <span className="text-xs font-semibold text-on-surface truncate">
                        {m.account.email}
                      </span>
                      <span className="ml-auto text-[10px] font-bold text-on-surface-variant shrink-0">
                        {m.account.access_status === "active"
                          ? "Activo"
                          : m.account.access_status === "pending"
                            ? "Pendiente"
                            : "Suspendido"}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditAccessFor(m.account!.id); }}
                        className="flex-1 py-1.5 rounded-lg border border-outline-variant/20 text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
                      >
                        Cuenta
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPermsFor(m.account!.id); }}
                        className="flex-1 py-1.5 rounded-lg border border-outline-variant/20 text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
                      >
                        Permisos
                      </button>
                      {m.account.access_status === "suspended" ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); reactivateAccess(m.account!.id); }}
                          className="flex-1 py-1.5 rounded-lg border border-emerald-500/30 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-500/10"
                        >
                          Reactivar
                        </button>
                      ) : m.account.access_status === "active" ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRevoke(m.account!.id, m.full_name); }}
                          className="shrink-0 px-2 py-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                          title="Suspender acceso"
                        >
                          <IconLogOut className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-outline-variant shrink-0" />
                      <span className="text-xs text-on-surface-variant">No entra al sistema</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setGrantFor(m.id); }}
                      className="w-full py-1.5 rounded-lg border border-primary/30 text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                    >
                      Dar acceso
                    </button>
                  </>
                )}
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); openSales(m); }}
                className="mt-3 w-full py-1.5 rounded-lg border border-outline-variant/20 text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
              >
                Ver Ventas
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Comisiones del mes */}
      {(commissionsLoading || commissions.length > 0) && (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant/10 bg-surface-container-low">
            <h2 className="text-sm font-bold text-on-surface">Comisiones del mes</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Suma de lo que dejó cada producto y servicio con comisión, al valor
              que tenía el día de la venta.
            </p>
          </div>
          {commissionsLoading ? (
            <p className="text-center text-sm text-on-surface-variant py-8">Calculando…</p>
          ) : (
            <DataTable
              rows={commissions}
              rowKey={(c) => c.staff_id}
              minWidth={520}
              caption="Comisiones por miembro"
              columns={COMMISSION_COLUMNS}
            />
          )}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-error-container/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-error-dim" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-on-surface mb-2">Eliminar Miembro</h3>
              <p className="text-sm text-on-surface-variant mb-6">
                ¿Estás seguro de eliminar este miembro del equipo? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    await deleteStaff(confirmDelete);
                    setConfirmDelete(null);
                  }}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-error-dim hover:bg-error text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Eliminando…" : "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ventas del Personal */}
      {salesModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-on-surface">
                  {salesStaff?.full_name}
                </h2>
                <p className="text-xs text-on-surface-variant mt-0.5">Ventas realizadas</p>
              </div>
              <button
                onClick={() => setSalesModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                aria-label="Cerrar"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {salesLoading ? (
                <p className="text-center text-sm text-on-surface-variant py-12">Cargando ventas…</p>
              ) : sales.length === 0 ? (
                <p className="text-center text-sm text-on-surface-variant py-12">Sin ventas registradas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold border-b border-outline-variant/10">
                        <th className="p-3 pl-0">Venta N.°</th>
                        <th className="p-3">Fecha</th>
                        <th className="p-3">Cliente</th>
                        <th className="p-3">Producto</th>
                        <th className="p-3 text-center">Cant</th>
                        <th className="p-3 text-right">Total</th>
                        <th className="p-3 pr-0 text-right">Comisión</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/5 text-sm">
                      {sales.map((s) => (
                        <tr key={s.id} className="hover:bg-surface-container-lowest transition-colors">
                          <td className="p-3 pl-0 font-mono text-xs text-on-surface-variant">#{s.sale_number}</td>
                          <td className="p-3 text-xs text-on-surface-variant whitespace-nowrap">
                            {new Date(s.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" })}
                          </td>
                          <td className="p-3 text-xs text-on-surface max-w-[120px] truncate">
                            {s.customer_name ?? "De Paso"}
                          </td>
                          <td className="p-3 text-xs text-on-surface max-w-[160px] truncate">{s.product_name}</td>
                          <td className="p-3 text-center text-xs text-on-surface-variant">{s.quantity}</td>
                          <td className="p-3 text-right text-xs font-bold text-on-surface tabular-nums">
                            ${money(s.line_total)}
                          </td>
                          <td className="p-3 pr-0 text-right text-xs font-semibold text-emerald-600 tabular-nums">
                            ${money(s.commissionAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-outline-variant/10">
                        <td colSpan={6} className="p-3 pl-0 text-right text-xs font-bold text-on-surface">
                          Total comisiones
                        </td>
                        <td className="p-3 pr-0 text-right text-sm font-bold text-emerald-600 tabular-nums">
                          ${money(sales.reduce((s, i) => s + i.commissionAmount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-on-surface">
                {editingId ? "Editar Personal" : "Nuevo Personal"}
              </h2>
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                aria-label="Cerrar"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
              {error && (
                <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  placeholder="Ej. Carlos Pérez"
                />
              </div>

              <Select
                label="Rol / Cargo"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="">Seleccionar cargo</option>
                {roleChoices.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </Select>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Teléfono</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                    placeholder="+57 300 123 4567"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Correo Electrónico</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                    placeholder="carlos@ejemplo.com"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 sm:p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                <div>
                  <p className="text-sm font-bold text-on-surface">Activo</p>
                  {/* Hablar de citas acá era falso para tienda, que no las tiene.
                      El cupo del plan sí es cierto en los cuatro rubros: el
                      trigger enforce_staff_limit solo cuenta los activos. */}
                  <p className="text-xs text-on-surface-variant mt-1">
                    Trabaja hoy. Los inactivos no ocupan cupo de tu plan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, status: form.status === "active" ? "inactive" : "active" })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 ml-4 ${
                    form.status === "active" ? "bg-[#6063ee]" : "bg-outline-variant/30"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.status === "active" ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-outline-variant/10">
                {editingId && (
                  <button
                    type="button"
                    onClick={() => { setConfirmDelete(editingId); handleClose(); }}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-error-dim hover:text-error hover:bg-error-container/10 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Eliminar
                  </button>
                )}
                <div className="flex-1 flex gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Guardando…" : editingId ? "Guardar Cambios" : "Añadir al Equipo"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Turnos de caja: solo tiene sentido para quien sí entra al sistema. */}
      {accounts.length > 0 && <ShiftHistorySection workers={accounts} />}

      {grantMember && (
        <GrantAccessModal member={grantMember} onClose={() => setGrantFor(null)} />
      )}

      {accountToEdit && (
        <EditAccessModal worker={accountToEdit} onClose={() => setEditAccessFor(null)} />
      )}

      {accountForPerms && (
        <PermissionsPanel
          workerId={accountForPerms.id}
          current={accountForPerms.worker_permissions ?? {}}
          onClose={() => setPermsFor(null)}
        />
      )}
    </div>
  );
}
