"use client";

import { useEffect, useState } from "react";
import { useStaffStore } from "@/stores/staff.store";
import type {
  CommissionPeriod,
  CommissionRow,
  CommissionScope,
  CommissionSettlement,
  StaffMember,
} from "@/services/staff.service";
import {
  currentMonthPeriod,
  pendingSettlePeriod,
  previousMonthPeriod,
} from "@/services/staff.service";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { SettleCommissionModal } from "@/components/SettleCommissionModal";
import { CommissionReceiptModal } from "@/components/CommissionReceiptModal";
import { CollectionEmpty, CollectionError, CollectionLoading } from "@/components/CollectionState";
import { IconDollar } from "@/app/assets/icons/DashboardIcons";
import { notifySuccess, notifyError } from "@/lib/notifications";
import { useFormatMoney } from "@/lib/useMoney";
import { Modal } from "@/components/ui/Modal";

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Datáfono",
};

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

/** Fecha corta de un instante (`created_at`), en la zona del navegador. */
const shortInstant = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Qué mira la pantalla. Arranca en "Todo lo pendiente" porque la pregunta que
 * trae a alguien acá es "¿cuánto le debo?", y esa respuesta no tiene mes: el
 * día 1 lo que se debía del mes anterior se sigue debiendo.
 */
type ScopeChip = "pending" | "month" | "previous";

const SCOPE_CHIPS: { value: ScopeChip; label: string }[] = [
  { value: "pending", label: "Todo lo pendiente" },
  { value: "month", label: "Este mes" },
  { value: "previous", label: "Mes anterior" },
];

function scopeOf(chip: ScopeChip): CommissionScope {
  if (chip === "month") return { kind: "period", period: currentMonthPeriod() };
  if (chip === "previous") return { kind: "period", period: previousMonthPeriod() };
  return { kind: "pending" };
}

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
  const fmtMoney = useFormatMoney();
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

  const [chip, setChip] = useState<ScopeChip>("pending");
  const [scope, setScope] = useState<CommissionScope>(() => scopeOf("pending"));
  const isPendingView = scope.kind === "pending";
  const [settleFor, setSettleFor] = useState<{ member: StaffMember; period: CommissionPeriod } | null>(null);
  const [receiptFor, setReceiptFor] = useState<CommissionSettlement | null>(null);
  const [confirmVoid, setConfirmVoid] = useState<CommissionSettlement | null>(null);

  useEffect(() => {
    fetchStaff();
    fetchSettlements();
  }, [fetchStaff, fetchSettlements]);

  useEffect(() => {
    fetchCommissions(scope);
  }, [fetchCommissions, scope]);

  const selectChip = (next: ScopeChip) => {
    setChip(next);
    setScope(scopeOf(next));
  };

  /**
   * Con qué período abre "Liquidar": el elegido, o —viendo todo lo pendiente—
   * desde la venta pendiente más vieja de esa persona hasta hoy, así no queda
   * afuera nada de lo que la tabla dice que se le debe.
   */
  const settlePeriodFor = (c: CommissionRow): CommissionPeriod =>
    scope.kind === "period" ? scope.period : pendingSettlePeriod(c.oldestPendingAt);

  const totalPendiente = commissions.reduce((sum, c) => sum + c.pending, 0);
  const totalLiquidado = commissions.reduce((sum, c) => sum + c.settled, 0);
  const oldestPending = commissions
    .map((c) => c.oldestPendingAt)
    .filter((d): d is string => !!d)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;

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
          {fmtMoney(c.pending)}
        </span>
      ),
    },
    // Viendo todo lo pendiente, liquidado y devengado no tienen período al que
    // referirse (serían el histórico entero): se muestra desde cuándo se debe.
    ...(isPendingView
      ? [
          {
            header: "Pendiente desde",
            align: "right",
            className: "text-on-surface-variant tabular-nums",
            cell: (c) => (c.oldestPendingAt ? shortInstant(c.oldestPendingAt) : "—"),
          } satisfies DataColumn<CommissionRow>,
        ]
      : [
          {
            header: "Liquidado",
            align: "right",
            className: "text-on-surface-variant tabular-nums",
            cell: (c) => fmtMoney(c.settled),
          } satisfies DataColumn<CommissionRow>,
          {
            header: "Devengado",
            align: "right",
            className: "text-on-surface-variant tabular-nums",
            cell: (c) => fmtMoney(c.commission),
          } satisfies DataColumn<CommissionRow>,
        ]),
    {
      header: isPendingView ? "Ventas pendientes" : "Ventas",
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
            onClick={() => member && setSettleFor({ member, period: settlePeriodFor(c) })}
            disabled={c.pending <= 0 || !member}
            title={c.pending > 0 ? undefined : "No hay comisión pendiente en el período elegido"}
            className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary/10 disabled:hover:text-primary"
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
          Cuánto le debes a cada quien, y el comprobante de lo que ya pagaste.
        </p>
      </div>

      {error && <CollectionError message={error} onRetry={() => fetchCommissions(scope)} />}

      <div role="group" aria-label="Período de las comisiones" className="flex flex-wrap gap-2">
        {SCOPE_CHIPS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => selectChip(o.value)}
            aria-pressed={chip === o.value}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              chip === o.value
                ? "bg-primary/10 text-primary"
                : "border border-outline-variant/20 text-on-surface hover:bg-surface-container-high"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-on-surface-variant text-sm font-medium mb-1">
            {isPendingView ? "Por pagar (todo lo pendiente)" : chip === "previous" ? "Por pagar del mes anterior" : "Por pagar este mes"}
          </p>
          <h3 className="text-3xl font-bold text-on-surface tracking-tight tabular-nums">
            {fmtMoney(totalPendiente)}
          </h3>
        </div>
        {isPendingView ? (
          <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm">
            <p className="text-on-surface-variant text-sm font-medium mb-1">Pendiente desde</p>
            <h3 className="text-3xl font-bold text-on-surface tracking-tight tabular-nums">
              {oldestPending ? shortInstant(oldestPending) : "—"}
            </h3>
          </div>
        ) : (
          <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm">
            <p className="text-on-surface-variant text-sm font-medium mb-1">
              {chip === "previous" ? "Ya liquidado del mes anterior" : "Ya liquidado este mes"}
            </p>
            <h3 className="text-3xl font-bold text-emerald-600 tracking-tight tabular-nums">
              {fmtMoney(totalLiquidado)}
            </h3>
          </div>
        )}
      </div>

      <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10 bg-surface-container-low">
          <h2 className="text-sm font-bold text-on-surface">
            {isPendingView ? "Comisiones pendientes" : chip === "previous" ? "Comisiones del mes anterior" : "Comisiones del mes"}
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {isPendingView
              ? "Todo lo que todavía no se liquidó, sin importar el mes de la venta, al valor que tenía el día que se vendió."
              : "Suma de lo que dejó cada producto y servicio con comisión, al valor que tenía el día de la venta."}
          </p>
        </div>
        {commissionsLoading ? (
          <CollectionLoading label="Calculando…" />
        ) : commissions.length === 0 ? (
          <CollectionEmpty
            icon={<IconDollar className="w-8 h-8" />}
            title={isPendingView ? "No hay comisiones pendientes" : "No hay comisiones en este período"}
            description={
              isPendingView
                ? "Todo lo vendido con comisión ya está liquidado. Lo nuevo aparece aquí cuando vendas productos o servicios con comisión atribuidos a alguien del equipo."
                : "Aparecen aquí cuando vendas productos o servicios que generen comisión y la venta quede atribuida a alguien del equipo."
            }
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
              Cada una generó su gasto en la categoría Comisiones. Toca una para ver el comprobante.
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
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-surface-variant text-on-surface-variant">
                          Anulada
                        </span>
                      )}
                      {s.voidedSalesCount > 0 && s.status !== "void" && (
                        <span
                          className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-warning/15 text-warning border border-warning/30"
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
                    {fmtMoney(s.total_amount)}
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
          member={settleFor.member}
          initialPeriod={settleFor.period}
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
        <Modal
          open
          onClose={() => {
            if (!submitting) setConfirmVoid(null);
          }}
          title="Anular liquidación"
          description={
            <>
              Las comisiones de {confirmVoid.staff_name} ({fmtMoney(confirmVoid.total_amount)}) vuelven a
              quedar pendientes y el gasto asociado se elimina.
            </>
          }
          role="alertdialog"
          size="sm"
          placement="sheet"
          dismissible={false}
          showCloseButton={false}
        >
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
                        "Salió de un turno que ya se cerró: ese arqueo no se reescribe. Ajústalo a mano.",
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
        </Modal>
      )}
    </div>
  );
}
