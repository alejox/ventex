"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useInventoryStore } from "@/stores/inventory.store";
import { fetchProductPricesByDistributor } from "@/services/purchases.service";
import { pricesByProduct, type DistributorPrice } from "@/lib/price-comparison";
import { useFormatMoney } from "@/lib/useMoney";
import { toMessage } from "@/lib/errors";

/**
 * Comparador de precios por proveedor.
 *
 * Muestra, por producto, el ÚLTIMO costo unitario pagado a cada proveedor (según
 * el historial de compras no anuladas), con el más barato resaltado. Responde a
 * "qué proveedor es más competitivo" sin tener que abrir cada compra.
 */
export default function ComparePricesPage() {
  const fmtMoney = useFormatMoney();
  const products = useInventoryStore((s) => s.products);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  const [rows, setRows] = useState<DistributorPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInventory();
    let active = true;
    (async () => {
      try {
        const data = await fetchProductPricesByDistributor();
        if (active) setRows(data);
      } catch (e) {
        if (active) setError(toMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchInventory]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) map.set(p.id, p.name);
    return map;
  }, [products]);

  const byProduct = useMemo(() => pricesByProduct(rows), [rows]);

  // Productos con historial, ordenados por nombre.
  const productIds = useMemo(
    () => [...byProduct.keys()].sort((a, b) => (nameById.get(a) ?? "").localeCompare(nameById.get(b) ?? "")),
    [byProduct, nameById],
  );

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div>
        <Link
          href="/dashboard/purchases"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-dim transition-colors"
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Compras
        </Link>
        <h1 className="text-2xl font-bold text-on-surface mt-1">Comparar precios por proveedor</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          El último costo unitario pagado a cada proveedor. El más barato va primero.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-on-surface-variant py-12 text-center">Cargando precios…</p>
      ) : error ? (
        <div role="alert" className="rounded-xl bg-error/10 border border-error/30 px-4 py-3 text-sm text-error">
          {error}
        </div>
      ) : productIds.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-12 text-center">
          Todavía no hay compras con productos para comparar. Registra compras a distintos proveedores y acá vas a ver quién sale más barato.
        </p>
      ) : (
        <div className="space-y-4">
          {productIds.map((productId) => {
            const prices = byProduct.get(productId) ?? [];
            const cheapest = prices[0];
            return (
              <div
                key={productId}
                className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4 sm:p-5"
              >
                <h2 className="text-base font-semibold text-on-surface">{nameById.get(productId) ?? "Producto"}</h2>
                <ul className="mt-3 divide-y divide-outline-variant/10">
                  {prices.map((p) => (
                    <li key={p.distributor_id} className="flex items-center justify-between gap-4 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-on-surface truncate">{p.distributor_name}</span>
                        {p.distributor_id === cheapest.distributor_id && (
                          <span className="shrink-0 rounded-full bg-success/10 text-success text-[11px] font-semibold px-2 py-0.5">
                            Mejor precio
                          </span>
                        )}
                      </div>
                      <span className="font-mono tabular-nums text-sm text-on-surface shrink-0">
                        {fmtMoney(p.unit_cost)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
