"use client";

import { useEffect } from "react";
import Link from "next/link";
import { IconPlus } from "@/app/assets/icons/DashboardIcons";
import { useDistributorsStore } from "@/stores/distributors.store";

function IconTruck(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="1" y="3" width="15" height="13" rx="2" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

export default function DistributorsPage() {
  const distributors = useDistributorsStore((s) => s.distributors);
  const loading = useDistributorsStore((s) => s.loading);
  const error = useDistributorsStore((s) => s.error);
  const fetchDistributors = useDistributorsStore((s) => s.fetchDistributors);

  useEffect(() => {
    fetchDistributors();
  }, [fetchDistributors]);

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Distribuidores</h1>
          <p className="text-sm text-on-surface-variant mt-1">Gestiona tus proveedores y distribuidores.</p>
        </div>
        <Link
          href="/dashboard/distributors/new"
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
        >
          <IconPlus className="w-4 h-4" />
          <span>Añadir Distribuidor</span>
        </Link>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-on-surface-variant py-12">Cargando distribuidores…</p>
      ) : distributors.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-8">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
            <IconTruck />
          </div>
          <h2 className="text-lg font-bold text-on-surface mb-2">Aún no hay distribuidores</h2>
          <p className="text-sm text-on-surface-variant max-w-sm mb-6">
            Registra a tus distribuidores para gestionar pedidos, pagos y stock de forma centralizada.
          </p>
          <Link
            href="/dashboard/distributors/new"
            className="px-6 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
          >
            Añadir tu primer distribuidor
          </Link>
        </div>
      ) : (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/10 text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
                  <th className="p-4 pl-6">Negocio</th>
                  <th className="p-4">Contacto</th>
                  <th className="p-4">Teléfono</th>
                  <th className="p-4">RFC / RUT</th>
                  <th className="p-4 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5 text-sm">
                {distributors.map((d) => (
                  <tr key={d.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="p-4 pl-6 font-medium text-on-surface">{d.business_name}</td>
                    <td className="p-4 text-on-surface-variant">
                      <div>{d.contact_name ?? "—"}</div>
                      <div className="text-xs text-on-surface-variant/70">{d.email ?? ""}</div>
                    </td>
                    <td className="p-4 text-on-surface-variant">{d.phone ?? "—"}</td>
                    <td className="p-4 text-on-surface-variant font-mono text-xs">{d.rfc_rut ?? "—"}</td>
                    <td className="p-4 text-center">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                          d.status === "active"
                            ? "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20"
                            : "bg-surface-variant text-on-surface-variant border-transparent"
                        }`}
                      >
                        {d.status === "active" ? "Activo" : d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
