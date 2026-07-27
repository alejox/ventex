"use client";

import { useEffect, useState } from "react";
import { useDeliveryStore } from "@/stores/delivery.store";
import { STATUS_LABELS, STATUS_COLORS, type DeliveryStatus } from "@/services/delivery.service";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const STATUS_OPTIONS: DeliveryStatus[] = ["pending", "in_transit", "delivered"];

export default function DeliveriesPage() {
  const deliveries = useDeliveryStore((s) => s.deliveries);
  const loading = useDeliveryStore((s) => s.loading);
  const error = useDeliveryStore((s) => s.error);
  const fetchDeliveries = useDeliveryStore((s) => s.fetchDeliveries);
  const changeStatus = useDeliveryStore((s) => s.changeStatus);

  const [filter, setFilter] = useState<DeliveryStatus | "">("");

  useEffect(() => {
    fetchDeliveries(filter || undefined);
  }, [fetchDeliveries, filter]);

  const countByStatus = (status: DeliveryStatus) =>
    deliveries.filter((d) => d.status === status).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
          Domicilios
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Gestiona los pedidos a domicilio y su estado
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {STATUS_OPTIONS.map((status) => (
          <button
            key={status}
            onClick={() => setFilter(filter === status ? "" : status)}
            className={`p-4 rounded-2xl border text-left transition-colors ${
              filter === status
                ? "border-primary bg-primary/5"
                : "border-outline-variant/10 bg-surface-container hover:bg-surface-container-high"
            }`}
          >
            <p className="text-2xl font-black text-on-surface">{countByStatus(status)}</p>
            <p className="text-xs text-on-surface-variant mt-1">{STATUS_LABELS[status]}</p>
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-error bg-error-container/10 rounded-xl px-4 py-3 border border-error-container/20">
          {error}
        </p>
      )}

      {/* Lista */}
      <div className="bg-surface-container rounded-2xl sm:rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-on-surface-variant">Cargando domicilios…</div>
        ) : deliveries.length === 0 ? (
          <div className="p-12 text-center text-sm text-on-surface-variant">
            {filter ? `No hay domicilios ${STATUS_LABELS[filter].toLowerCase()}` : "No hay domicilios aún"}
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/10">
            {deliveries.map((d) => (
              <div key={d.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-on-surface">
                      Venta #{d.sale_number ?? "—"}
                    </span>
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold border ${STATUS_COLORS[d.status]}`}>
                      {STATUS_LABELS[d.status]}
                    </span>
                    {d.fee > 0 && (
                      <span className="text-xs text-on-surface-variant">
                        Envío: ${money(d.fee)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-on-surface-variant truncate">{d.address}</p>
                  <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                    <span>{d.person_name ?? "Sin repartidor"}</span>
                    {d.person_phone && <span>{d.person_phone}</span>}
                    <span>{formatDate(d.created_at)}</span>
                  </div>
                  {d.notes && (
                    <p className="text-xs text-on-surface-variant/70 italic">{d.notes}</p>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  {d.status === "pending" && (
                    <button
                      onClick={() => changeStatus(d.id, "in_transit")}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#3b82f6]/10 text-[#3b82f6] hover:bg-[#3b82f6] hover:text-white transition-colors"
                    >
                      En camino
                    </button>
                  )}
                  {d.status === "in_transit" && (
                    <button
                      onClick={() => changeStatus(d.id, "delivered")}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#10b981]/10 text-[#10b981] hover:bg-[#10b981] hover:text-white transition-colors"
                    >
                      Entregado
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
