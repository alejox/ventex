"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useInventoryStore } from "@/stores/inventory.store";
import { fetchProductPricesByDistributor } from "@/services/purchases.service";
import { pricesByProduct, matchesProductSearch, type DistributorPrice } from "@/lib/price-comparison";
import { useFormatMoney } from "@/lib/useMoney";
import { toMessage } from "@/lib/errors";
import { Select } from "@/components/ui/Select";

/**
 * Comparador de precios por proveedor.
 *
 * Lista, por producto, el último costo unitario pagado a cada proveedor (según
 * el historial de compras no anuladas), con una columna "Mejor precio" que
 * resalta el más barato. Búsqueda por nombre, SKU o código de barras, y filtros
 * por proveedor y categoría.
 */
export default function ComparePricesPage() {
  const fmtMoney = useFormatMoney();
  const products = useInventoryStore((s) => s.products);
  const categories = useInventoryStore((s) => s.categories);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  const [rows, setRows] = useState<DistributorPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [providerId, setProviderId] = useState("");
  const [categoryId, setCategoryId] = useState("");

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

  const productById = useMemo(() => {
    const map = new Map<string, (typeof products)[number]>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const byProduct = useMemo(() => pricesByProduct(rows), [rows]);

  /** Proveedores con historial, para el filtro. */
  const providers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.distributor_id, r.distributor_name);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const productIds = useMemo(() => {
    const ids: string[] = [];
    for (const [productId, prices] of byProduct) {
      const product = productById.get(productId);
      if (!product) continue;
      if (!matchesProductSearch(product, query)) continue;
      if (categoryId && product.category_id !== categoryId) continue;
      if (providerId && !prices.some((p) => p.distributor_id === providerId)) continue;
      ids.push(productId);
    }
    ids.sort((a, b) => (productById.get(a)?.name ?? "").localeCompare(productById.get(b)?.name ?? ""));
    return ids;
  }, [byProduct, productById, query, categoryId, providerId]);

  const hasFilters = query.trim() !== "" || providerId !== "" || categoryId !== "";

  return (
    <div className="flex flex-col gap-5 w-full animate-in fade-in duration-500">
      <div>
        <Link
          href="/dashboard/inventory"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-dim transition-colors"
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Inventario
        </Link>
        <h1 className="text-2xl font-bold text-on-surface mt-1">Comparar precios por proveedor</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          El último costo unitario pagado a cada proveedor. El más barato aparece como mejor precio.
        </p>
      </div>

      {/* Búsqueda por código de barras, SKU o nombre */}
      <div className="relative">
        <svg
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Escanea o escribe un código de barras, SKU o nombre…"
          aria-label="Buscar producto por código de barras, SKU o nombre"
          className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-2xl py-3 pl-11 pr-4 text-base text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50"
        />
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Proveedor" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Select label="Categoría" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-on-surface-variant py-12 text-center">Cargando precios…</p>
      ) : error ? (
        <div role="alert" className="rounded-xl bg-error/10 border border-error/30 px-4 py-3 text-sm text-error">
          {error}
        </div>
      ) : productIds.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-12 text-center">
          {hasFilters
            ? "Ningún producto coincide con la búsqueda o los filtros."
            : "Todavía no hay compras con productos para comparar. Registra compras a distintos proveedores y acá vas a ver quién sale más barato."}
        </p>
      ) : (
        <div className="border border-outline-variant/20 rounded-2xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,0.7fr)] gap-3 px-4 py-2.5 bg-surface-container-low border-b border-outline-variant/20 text-xs font-semibold text-on-surface-variant">
            <span>Producto</span>
            <span>Proveedores</span>
            <span className="text-right">Mejor precio</span>
          </div>

          <div className="divide-y divide-outline-variant/10">
            {productIds.map((productId) => {
              const product = productById.get(productId);
              const prices = byProduct.get(productId) ?? [];
              const best = prices[0];
              return (
                <div
                  key={productId}
                  className="grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,0.7fr)] gap-3 p-4 items-start"
                >
                  {/* Producto */}
                  <div className="min-w-0">
                    <p className="font-semibold text-on-surface truncate">{product?.name ?? "Producto"}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                      {[product?.sku, product?.barcode].filter(Boolean).join(" · ")}
                    </p>
                  </div>

                  {/* Proveedores, del más barato al más caro */}
                  <ul className="space-y-1.5">
                    {prices.map((p) => (
                      <li key={p.distributor_id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-on-surface truncate">{p.distributor_name}</span>
                        <span className={`font-mono tabular-nums shrink-0 ${p.distributor_id === best.distributor_id ? "text-success font-semibold" : "text-on-surface-variant"}`}>
                          {fmtMoney(p.unit_cost)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* Mejor precio */}
                  <div className="md:text-right">
                    <div className="inline-flex flex-col items-start md:items-end">
                      <span className="text-xs font-semibold text-success uppercase tracking-wide">Mejor precio</span>
                      <span className="font-mono tabular-nums text-lg font-bold text-success">{fmtMoney(best.unit_cost)}</span>
                      <span className="text-xs text-on-surface-variant">{best.distributor_name}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
