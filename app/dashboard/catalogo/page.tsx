"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { IconPlus } from "@/app/assets/icons/DashboardIcons";
import { useInventoryStore } from "@/stores/inventory.store";
import { useServicesStore } from "@/stores/services.store";
import type { Product } from "@/services/inventory.service";
import type { Service } from "@/services/services.service";

type FilterType = "all" | "products" | "services";

interface CatalogItem {
  id: string;
  kind: "product" | "service";
  name: string;
  description: string | undefined;
  price: number;
  status: string;
  stockLevel?: number;
  minimumStock?: number;
  durationMinutes?: number;
  categoryName?: string;
  imageUrl?: string | null;
  sku?: string;
}

export default function CatalogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const products = useInventoryStore((s) => s.products);
  const invLoading = useInventoryStore((s) => s.loading);
  const invError = useInventoryStore((s) => s.error);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  const services = useServicesStore((s) => s.services);
  const svcLoading = useServicesStore((s) => s.loading);
  const svcError = useServicesStore((s) => s.error);
  const fetchServices = useServicesStore((s) => s.fetchServices);

  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  const loading = invLoading || svcLoading;
  const error = invError || svcError;

  useEffect(() => {
    fetchInventory();
    fetchServices();
  }, [fetchInventory, fetchServices]);

  // Handle ?action=new-product or ?action=new-service from quick actions
  useEffect(() => {
    const action = searchParams.get("action");
    if (action === "new-product") {
      router.replace("/dashboard/catalogo");
      window.location.href = "/dashboard/inventory/product";
    } else if (action === "new-service") {
      router.replace("/dashboard/catalogo");
      window.location.href = "/dashboard/services";
    }
  }, [searchParams, router]);

  const items: CatalogItem[] = useMemo(() => {
    const result: CatalogItem[] = [];

    for (const p of products) {
      if (p.parent_product_id) continue;
      result.push({
        id: p.id,
        kind: "product",
        name: p.name,
        description: p.categories?.name ?? undefined,
        price: p.price,
        status: p.stock_level > 0 ? "active" : "inactive",
        stockLevel: p.stock_level,
        minimumStock: p.minimum_stock,
        categoryName: p.categories?.name ?? undefined,
        imageUrl: p.image_url,
        sku: p.sku,
      });
    }

    for (const s of services) {
      result.push({
        id: s.id,
        kind: "service",
        name: s.name,
        description: s.description ?? undefined,
        price: s.price,
        status: s.status,
        durationMinutes: s.duration_minutes,
      });
    }

    result.sort((a, b) => a.name.localeCompare(b.name, "es"));
    return result;
  }, [products, services]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "products" && item.kind !== "product") return false;
      if (filter === "services" && item.kind !== "service") return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q);
    });
  }, [items, filter, search]);

  const getStockBadge = (item: CatalogItem) => {
    if (item.kind !== "product" || item.stockLevel == null) return null;
    if (item.stockLevel <= 0)
      return <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-error-container/20 text-error-dim">Agotado</span>;
    if (item.minimumStock && item.stockLevel <= item.minimumStock)
      return <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600">Stock bajo</span>;
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600">{item.stockLevel} uds.</span>;
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Catálogo</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Productos y servicios de tu negocio.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/inventory/product"
            className="bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold py-2.5 px-4 rounded-xl hover:bg-surface-container-high transition-colors flex items-center gap-2"
          >
            <IconPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Producto</span>
          </Link>
          <Link
            href="/dashboard/services"
            className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center gap-2"
          >
            <IconPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Servicio</span>
          </Link>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/70"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Buscar en el catálogo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 pl-10 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
          />
        </div>
        <div className="flex items-center bg-surface-container border border-outline-variant/10 rounded-xl p-1 shadow-sm self-start">
          {[
            { id: "all" as const, label: "Todo" },
            { id: "products" as const, label: "Productos" },
            { id: "services" as const, label: "Servicios" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                filter === f.id
                  ? "bg-surface-container-lowest text-on-surface shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center text-sm text-on-surface-variant py-12">
          Cargando catálogo...
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-on-surface mb-2">
            {search
              ? "Sin resultados"
              : filter === "products"
                ? "No hay productos"
                : filter === "services"
                  ? "No hay servicios"
                  : "El catálogo está vacío"}
          </h2>
          <p className="text-sm text-on-surface-variant max-w-sm">
            {search
              ? "Probá con otro término de búsqueda."
              : "Agregá productos o servicios para empezar."}
          </p>
        </div>
      )}

      {/* Catalog Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item) => (
            <Link
              key={`${item.kind}-${item.id}`}
              href={item.kind === "product" ? `/dashboard/inventory/product?id=${item.id}` : "#"}
              onClick={(e) => {
                if (item.kind === "service") {
                  e.preventDefault();
                  window.location.href = `/dashboard/services`;
                }
              }}
              className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl shadow-sm hover:shadow-md hover:border-outline-variant/30 transition-all overflow-hidden group"
            >
              {/* Image placeholder for products */}
              <div className="h-32 bg-surface-container/50 flex items-center justify-center overflow-hidden">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <svg
                    className="w-10 h-10 text-on-surface-variant/30"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    viewBox="0 0 24 24"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                )}
              </div>

              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                      {item.name}
                    </h3>
                    {item.description && (
                      <p className="text-[11px] text-on-surface-variant/70 truncate mt-0.5">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    item.kind === "product"
                      ? "bg-[#6063ee]/10 text-[#6063ee]"
                      : "bg-emerald-500/10 text-emerald-600"
                  }`}>
                    {item.kind === "product" ? "Producto" : "Servicio"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-on-surface tabular-nums">
                    ${item.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {item.kind === "product" ? (
                    getStockBadge(item)
                  ) : item.durationMinutes ? (
                    <span className="text-[10px] font-medium text-on-surface-variant/70">
                      {item.durationMinutes} min
                    </span>
                  ) : null}
                </div>

                {item.kind === "product" && item.sku && (
                  <p className="text-[10px] text-on-surface-variant/50 font-mono truncate">
                    SKU: {item.sku}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
