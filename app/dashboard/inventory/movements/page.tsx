"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { IconBox, IconPlus } from "@/app/assets/icons/DashboardIcons";
import { useMovementsStore } from "@/stores/inventory-movements.store";
import { useInventoryStore } from "@/stores/inventory.store";
import { StockAdjustmentModal } from "@/components/StockAdjustmentModal";
import { DataTable, type DataColumn } from "@/components/DataTable";
import type { InventoryMovement } from "@/services/inventory-movements.service";

const typeLabel: Record<string, string> = {
  in: "Entrada",
  out: "Salida",
  adjust: "Ajuste",
};

const typeColor: Record<string, string> = {
  in: "bg-[#10b981]/10 text-[#10b981]",
  out: "bg-error/10 text-error",
  adjust: "bg-amber-100 text-amber-700",
};

const MOVEMENT_COLUMNS: DataColumn<InventoryMovement>[] = [
  {
    header: "Producto",
    mobile: "title",
    className: "font-medium text-on-surface",
    cell: (mov) => (
      <Link
        href={`/dashboard/inventory/movements?product_id=${mov.product_id}`}
        className="hover:text-primary transition-colors"
      >
        {mov.products?.name ?? "—"}
      </Link>
    ),
  },
  {
    header: "Fecha",
    mobile: "subtitle",
    className: "pl-6 text-on-surface-variant whitespace-nowrap",
    headerClassName: "pl-6",
    cell: (mov) =>
      new Date(mov.created_at).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
  },
  {
    header: "Cantidad",
    align: "right",
    mobile: "trailing",
    className: "font-semibold font-mono",
    cell: (mov) => (
      <span className="font-mono">
        {mov.type === "in" ? "+" : mov.type === "out" ? "-" : "→"}
        {mov.quantity}
      </span>
    ),
  },
  {
    header: "Tipo",
    align: "center",
    mobile: "badge",
    cell: (mov) => (
      <span className={`text-[11px] font-bold border rounded-md px-2.5 py-1 ${typeColor[mov.type] || ""}`}>
        {typeLabel[mov.type] || mov.type}
      </span>
    ),
  },
  {
    header: "SKU",
    className: "text-on-surface-variant font-mono text-xs",
    cell: (mov) => <span className="font-mono text-xs">{mov.products?.sku ?? "—"}</span>,
  },
  {
    header: "Referencia",
    className: "text-xs text-on-surface-variant font-mono",
    cell: (mov) =>
      mov.reference_type === "purchase"
        ? "Compra"
        : mov.reference_type === "manual"
          ? "Manual"
          : (mov.reference_type ?? "—"),
  },
  {
    header: "Notas",
    className: "text-xs text-on-surface-variant max-w-[200px] truncate",
    cell: (mov) => mov.notes ?? "—",
  },
];

function MovementsContent() {
  const searchParams = useSearchParams();
  const filterProductId = searchParams.get("product_id");

  const movements = useMovementsStore((s) => s.movements);
  const loading = useMovementsStore((s) => s.loading);
  const error = useMovementsStore((s) => s.error);
  const fetchMovements = useMovementsStore((s) => s.fetchMovements);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);
  const products = useInventoryStore((s) => s.products);

  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchMovements(filterProductId ?? undefined);
    fetchInventory();
  }, [fetchMovements, fetchInventory, filterProductId]);

  const filteredMovements = useMemo(
    () =>
      !searchQuery
        ? movements
        : movements.filter((m) =>
            m.products?.name?.toLowerCase().includes(searchQuery.toLowerCase())
          ),
    [movements, searchQuery]
  );

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Movimientos de Inventario</h1>
          <p className="text-sm text-on-surface-variant mt-1">Historial de entradas, salidas y ajustes de stock.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/inventory"
            className="text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors px-4 py-2.5"
          >
            ← Volver a inventario
          </Link>
          <button
            onClick={() => setAdjustModalOpen(true)}
            className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
          >
            <IconPlus className="w-4 h-4" />
            <span>Ajustar Stock</span>
          </button>
        </div>
      </div>

      {filterProductId && products.find((p) => p.id === filterProductId) && (
        <div className="bg-surface-container-low border border-outline-variant/10 rounded-xl px-4 py-3 text-sm text-on-surface-variant">
          Mostrando movimientos de: <strong className="text-on-surface">{products.find((p) => p.id === filterProductId)?.name}</strong>
          <Link href="/dashboard/inventory/movements" className="ml-2 text-primary hover:text-primary-dim text-xs font-semibold">
            [Limpiar filtro]
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-on-surface-variant py-12">Cargando movimientos…</p>
      ) : movements.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-8">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
            <IconBox />
          </div>
          <h2 className="text-lg font-bold text-on-surface mb-2">Aún no hay movimientos</h2>
          <p className="text-sm text-on-surface-variant max-w-sm mb-6">
            Los movimientos se registran automáticamente con cada compra o venta. También puedes hacer ajustes manuales.
          </p>
          <button
            onClick={() => setAdjustModalOpen(true)}
            className="px-6 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
          >
            Hacer ajuste manual
          </button>
        </div>
      ) : (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-outline-variant/10">
            <div className="relative max-w-xs">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por producto…"
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl py-2 pl-9 pr-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/40"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
          </div>
          <DataTable
            rows={filteredMovements}
            rowKey={(m) => m.id}
            minWidth={700}
            caption="Movimientos de inventario"
            columns={MOVEMENT_COLUMNS}
          />
        </div>
      )}

      {adjustModalOpen && (
        <StockAdjustmentModal
          preselectedProductId={filterProductId ?? undefined}
          onClose={() => setAdjustModalOpen(false)}
          onSuccess={() => fetchMovements(filterProductId ?? undefined)}
        />
      )}
    </div>
  );
}

export default function MovementsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-on-surface-variant">Cargando…</div>}>
      <MovementsContent />
    </Suspense>
  );
}
