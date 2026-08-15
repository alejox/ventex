"use client";

import { useEffect, useState } from "react";
import { useStaffStore } from "@/stores/staff.store";
import type { CommissionRow, CommissionSettlement, StaffMember } from "@/services/staff.service";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { SettleCommissionModal } from "@/components/SettleCommissionModal";
import { CommissionReceiptModal } from "@/components/CommissionReceiptModal";
import { CollectionEmpty, CollectionError, CollectionLoading } from "@/components/CollectionState";
import { IconDollar } from "@/app/assets/icons/DashboardIcons";
import { notifySuccess, notifyError } from "@/lib/notifications";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Datáfono",
};

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Comisiones: cuánto se le debe a cada quien y el acto de pagarle.
 *
 * Vivía al final de la pantalla de Personal, debajo del roster y del control de
 * accesos. Eran tres trabajos distintos en una sola página larga —administrar
 * gente, dar acceso, conciliar plata— y el tercero, que es el que mueve dinero,
 * era el que había que scrollear para encontrar.
 *
 * El gate de dueño lo pone `app/dashboard/staff/layout.tsx`, que cubre esta
 * ruta por ser hija suya; los RPC lo revalidan igual en la base.
 */
export default function CommissionsPage() {
  const staff = useStaffStore((s) => s.staff);
  const fetchStaff = useStaffStore((s) => s.fetchStaff);
  const commissions = useStaffStore((s) => s.commissions);
  const commissionsLoading = useStaffStore((s) => s.commissionsLoading);
  const fetchCommissions = useStaffStore((s) => s.fetchCommissions);
  const settlements = useStaffStore((s) => s.settlements);
  const settlementsLoading = useStaffStore((s) => s.settlementsLoading);
  const fetchSettlements = useStaffStore((s) => s.fetchSettlements);
  const voidSettlement = useStaffStore((s) => s.voidSettlement);
  const submitting = useStaffStore((s) => s.submitting);
  const error = useStaffStore((s) => s.error);

  const [settleFor, setSettleFor] = useState<StaffMember | null>(null);
  const [receiptFor, setReceiptFor] = useState<CommissionSettlement | null>(null);
  const [confirmVoid, setConfirmVoid] = useState<CommissionSettlement | null>(null);

  useEffect(() => {
    fetchStaff();
    fetchCommissions();
    fetchSettlements();
  }, [fetchStaff, fetchCommissions, fetchSettlements]);

  const totalPendiente = commissions.reduce((sum, c) => sum + c.pending, 0);
  const totalLiquidado = commissions.reduce((sum, c) => sum + c.settled, 0);

  /**
   * La columna que manda es POR PAGAR, no lo devengado: "¿cuánto le debo?" es
   * la pregunta que trae a alguien a esta pantalla. Lo devengado es contexto.
   */
  const columns: DataColumn<CommissionRow>[] = [
    {
      header: "Miembro",
      mobile: "title",
      className: "pl-6 font-medium text-on-surface",
      headerClassName: "pl-6",
      cell: (c) => c.full_name,
    },
    {
      header: "Por pagar",
      align: "right",
      mobile: "trailing",
      className: "font-bold tabular-nums",
      cell: (c) => (
        <span className={c.pending > 0 ? "text-on-surface" : "text-on-surface-variant"}>
          ${money(c.pending)}
        </span>
      ),
    },
    {
      header: "Liquidado",
      align: "right",
      className: "text-on-surface-variant tabular-nums",
      cell: (c) => `$${money(c.settled)}`,
    },
    {
      header: "Devengado",
      align: "right",
      className: "text-on-surface-variant tabular-nums",
      cell: (c) => `$${money(c.commission)}`,
    },
    {
      header: "Ventas",
      align: "center",
      className: "text-on-surface-variant",
      cell: (c) => c.salesCount,
    },
    {
      header: "",
      align: "right",
      mobile: "actions",
      className: "pr-6",
      headerClassName: "pr-6",
      cell: (c) => {
        const member = staff.find((m) => m.id === c.staff_id);
        return (
          <button
            onClick={() => member && setSettleFor(member)}
            disabled={c.pending <= 0 || !member}
            title={c.pending > 0 ? undefined : "No hay comisión pendiente en el mes en curso"}
            className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary hover:text-on-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary/10 disabled:hover:text-primary"
          >
            Liquidar
          </button>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Comisiones</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Cuánto le debés a cada quien, y el comprobante de lo que ya pagaste.
        </p>
      </div>

      {error && <CollectionError message={error} onRetry={fetchCommissions} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-on-surface-variant text-sm font-medium mb-1">Por pagar este mes</p>
          <h3 className="text-3xl font-bold text-on-surface tracking-tight tabular-nums">
            ${money(totalPendiente)}
          </h3>
        </div>
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-on-surface-variant text-sm font-medium mb-1">Ya liquidado este mes</p>
          <h3 className="text-3xl font-bold text-emerald-600 tracking-tight tabular-nums">
            ${money(totalLiquidado)}
          </h3>
        </div>
      </div>

      <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10 bg-surface-container-low">
          <h2 className="text-sm font-bold text-on-surface">Comisiones del mes</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Suma de lo que dejó cada producto y servicio con comisión, al valor que tenía el día de
            la venta.
          </p>
        </div>
        {commissionsLoading ? (
          <CollectionLoading label="Calculando…" />
        ) : commissions.length === 0 ? (
          <CollectionEmpty
            icon={<IconDollar className="w-8 h-8" />}
            title="Todavía no hay comisiones"
            description="Aparecen acá cuando vendas productos o servicios que generen comisión y la venta quede atribuida a alguien del equipo."
          />
        ) : (
          <DataTable rows={commissions} rowKey={(c) => c.staff_id} minWidth={640} caption="Comisiones por miembro" columns={columns} />
        )}
      </div>

      {/* Historial: es lo que hace que "ya le pagué" sea verificable y no una
          memoria. Cada fila tiene su comprobante imprimible. */}
      {(settlementsLoading || settlements.length > 0) && (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant/10 bg-surface-container-low">
            <h2 className="text-sm font-bold text-on-surface">Liquidaciones</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Cada una generó su gasto en la categoría Comisiones. Tocá una para ver el comprobante.
            </p>
          </div>
          {settlementsLoading ? (
            <CollectionLoading label="Cargando…" />
          ) : (
            <ul className="divide-y divide-outline-variant/10">
              {settlements.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 sm:px-6 py-3.5 hover:bg-surface-container-lowest transition-colors">
                  <button onClick={() => setReceiptFor(s)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${s.status === "void" ? "text-on-surface-variant line-through" : "text-on-surface"}`}>
                        {s.staff_name}
                      </span>
                      {s.status === "void" && (
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-surface-variant text-on-surface-variant">
                          Anulada
                        </span>
                      )}
                      {s.voidedSalesCount > 0 && s.status !== "void" && (
                        <span
                          className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#f59e0b]/15 text-[#b45309] border border-[#f59e0b]/30"
                          title={`${s.voidedSalesCount} venta(s) de esta liquidación se anularon después de pagarla`}
                        >
                          {s.voidedSalesCount} venta{s.voidedSalesCount !== 1 ? "s" : ""} anulada{s.voidedSalesCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                      {shortDate(s.period_from)} al {shortDate(s.period_to)} · {s.items_count} línea
                      {s.items_count !== 1 ? "s" : ""} · {PAYMENT_LABELS[s.payment_method] ?? s.payment_method} ·
                      pagada el {shortDate(s.paid_on)}
                    </p>
                  </button>
                  <span className={`shrink-0 text-sm font-bold tabular-nums ${s.status === "void" ? "text-on-surface-variant/50 line-through" : "text-on-surface"}`}>
                    ${money(s.total_amount)}
                  </span>
                  {s.status !== "void" && (
                    <button
                      onClick={() => setConfirmVoid(s)}
                      title="Anular liquidación"
                      aria-label={`Anular la liquidación de ${s.staff_name}`}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                    >
                      <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" className="w-4 h-4">
                        <path d="M3 12a9 9 0 1 0 9-9" />
                        <polyline points="3 4 3 12 11 12" />
                      </svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {settleFor && (
        <SettleCommissionModal
          member={settleFor}
          onClose={() => setSettleFor(null)}
          onSettled={(id) => {
            setSettleFor(null);
            // El comprobante se abre solo: liquidar sin poder mostrar el papel
            // deja al dueño con el pago hecho y sin nada que entregar.
            const created = useStaffStore.getState().settlements.find((s) => s.id === id);
            if (created) setReceiptFor(created);
          }}
        />
      )}

      {receiptFor && <CommissionReceiptModal settlement={receiptFor} onClose={() => setReceiptFor(null)} />}

      {confirmVoid && (
        <div className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <h3 className="text-lg font-bold text-on-surface mb-2">Anular liquidación</h3>
              <p className="text-sm text-on-surface-variant mb-4">
                Las comisiones de {confirmVoid.staff_name} (${money(confirmVoid.total_amount)}) vuelven a
                quedar pendientes y el gasto asociado se elimina.
              </p>
              {confirmVoid.cash_movement_id && (
                <p className="text-xs text-on-surface-variant mb-6 rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-left">
                  Se pagó en efectivo. Si el turno del que salió sigue <strong>abierto</strong>, la plata
                  vuelve al arqueo. Si ya se <strong>cerró y se contó</strong>, ese arqueo no se reescribe
                  y el desfase queda para resolver a mano.
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmVoid(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    const result = await voidSettlement(confirmVoid.id);
                    if (result?.cash_returned) {
                      notifySuccess("Liquidación anulada", "El efectivo volvió al arqueo del turno abierto.");
                    } else if (result?.cash_locked_in_closed_shift) {
                      // No es un fallo: es una consecuencia que hay que conocer.
                      notifyError(
                        "Anulada, pero el efectivo ya se contó",
                        "Salió de un turno que ya se cerró: ese arqueo no se reescribe. Ajustalo a mano.",
                      );
                    } else if (result) {
                      notifySuccess("Liquidación anulada", "Las comisiones vuelven a quedar pendientes.");
                    }
                    setConfirmVoid(null);
                  }}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-error-dim hover:bg-error text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Anulando…" : "Anular"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
