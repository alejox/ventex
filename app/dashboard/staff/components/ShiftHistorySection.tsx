"use client";

import { useEffect, useState } from "react";
import { useShiftsStore } from "@/stores/shifts.store";
import type { WorkerMember } from "@/services/worker.service";
import { CloseShiftModal } from "@/components/shift/CloseShiftModal";
import { DataTable, type DataColumn } from "@/components/DataTable";
import type { Shift } from "@/services/shifts.service";

const shiftMoney = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const shiftDate = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function ShiftStatusBadge({ difference, notes }: { difference: number | null; notes: string | null }) {
  if (difference == null) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant">
        Cerrado
      </span>
    );
  }

  if (difference === 0) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#10b981]/10 text-[#10b981]">
        Cuadrado
      </span>
    );
  }

  const faltante = difference < 0;
  return (
    <span
      title={notes ?? undefined}
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${
        faltante ? "bg-error/10 text-error" : "bg-amber-500/10 text-amber-500"
      }`}
    >
      {faltante ? "Faltante" : "Sobrante"} {shiftMoney(Math.abs(difference))}
    </span>
  );
}

export function ShiftHistorySection({ workers }: { workers: WorkerMember[] }) {
  const shifts = useShiftsStore((s) => s.shifts);
  const loading = useShiftsStore((s) => s.loading);
  const fetchShifts = useShiftsStore((s) => s.fetchShifts);

  const [closingShiftId, setClosingShiftId] = useState<string | null>(null);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const workerName = (workerId: string) =>
    workers.find((w) => w.id === workerId)?.full_name ?? "Empleado";

  const shiftColumns: DataColumn<Shift>[] = [
    {
      header: "Empleado",
      mobile: "title",
      className: "font-semibold text-on-surface",
      cell: (s) => (
        <>
          {workerName(s.worker_id)}
          {s.notes && (
            <span
              className="block text-xs font-normal text-on-surface-variant mt-0.5 lg:max-w-[220px] lg:truncate"
              title={s.notes}
            >
              {s.notes}
            </span>
          )}
        </>
      ),
    },
    {
      header: "Diferencia",
      align: "right",
      mobile: "trailing",
      className: "font-bold tabular-nums",
      cell: (s) => (
        <span
          className={`font-bold tabular-nums ${
            s.difference == null
              ? "text-on-surface-variant"
              : s.difference === 0
                ? "text-[#10b981]"
                : s.difference < 0
                  ? "text-error"
                  : "text-amber-500"
          }`}
        >
          {s.difference != null ? `${s.difference > 0 ? "+" : ""}${shiftMoney(s.difference)}` : "—"}
        </span>
      ),
    },
    {
      header: "Estado",
      align: "right",
      mobile: "badge",
      cell: (s) =>
        s.status === "open" ? (
          <div className="flex items-center justify-end gap-2">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#10b981]/10 text-[#10b981]">
              Abierto
            </span>
            <button
              onClick={() => setClosingShiftId(s.id)}
              className="px-3 py-1.5 rounded-lg border border-outline-variant/20 text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <ShiftStatusBadge difference={s.difference} notes={s.notes} />
        ),
    },
    {
      header: "Apertura",
      className: "text-on-surface-variant whitespace-nowrap",
      cell: (s) => shiftDate(s.opened_at),
    },
    {
      header: "Cierre",
      className: "text-on-surface-variant whitespace-nowrap",
      cell: (s) => (s.closed_at ? shiftDate(s.closed_at) : "—"),
    },
    {
      header: "Ventas",
      align: "right",
      className: "text-on-surface tabular-nums",
      cell: (s) =>
        s.status === "open" ? "—" : `${s.sales_count ?? 0} · ${shiftMoney(s.sales_total ?? 0)}`,
    },
    {
      header: "Base",
      align: "right",
      className: "text-on-surface tabular-nums",
      cell: (s) => shiftMoney(s.opening_cash),
    },
    {
      header: "Retiros",
      align: "right",
      className: "text-on-surface-variant tabular-nums",
      cell: (s) => (s.withdrawals_total ? `-${shiftMoney(s.withdrawals_total)}` : "—"),
    },
    {
      header: "Esperado",
      align: "right",
      className: "text-on-surface tabular-nums",
      cell: (s) => (s.expected_cash != null ? shiftMoney(s.expected_cash) : "—"),
    },
    {
      header: "Contado",
      align: "right",
      className: "text-on-surface tabular-nums",
      cell: (s) => (s.closing_cash != null ? shiftMoney(s.closing_cash) : "—"),
    },
  ];

  return (
    <div className="mt-10">
      <div className="mb-4">
        <h3 className="text-base font-bold text-on-surface">Historial de turnos</h3>
        <p className="text-sm text-on-surface-variant mt-1">
          Aperturas y cierres de caja de tus empleados, con el arqueo de cada turno.
        </p>
      </div>

      {loading && shifts.length === 0 ? (
        <div className="text-sm text-on-surface-variant py-8 text-center">Cargando turnos…</div>
      ) : shifts.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 p-8 text-center text-sm text-on-surface-variant">
          Aún no hay turnos registrados. Cuando un empleado abra su primer turno aparecerá aquí.
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
          <DataTable
            rows={shifts}
            rowKey={(s) => s.id}
            minWidth={980}
            caption="Historial de turnos de caja"
            columns={shiftColumns}
          />
        </div>
      )}

      {closingShiftId && (
        <CloseShiftModal shiftId={closingShiftId} onClose={() => setClosingShiftId(null)} />
      )}
    </div>
  );
}
