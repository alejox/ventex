"use client";

import { useEffect } from "react";
import Link from "next/link";
import { IconUsers, IconPlus } from "@/app/assets/icons/DashboardIcons";
import { useCustomersStore } from "@/stores/customers.store";

export default function CustomersPage() {
  const customers = useCustomersStore((s) => s.customers);
  const loading = useCustomersStore((s) => s.loading);
  const error = useCustomersStore((s) => s.error);
  const fetchCustomers = useCustomersStore((s) => s.fetchCustomers);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Clientes</h1>
          <p className="text-sm text-on-surface-variant mt-1">Gestiona el directorio de tus clientes y su historial.</p>
        </div>
        <Link
          href="/dashboard/customers/new"
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
        >
          <IconPlus className="w-4 h-4" />
          <span>Añadir Cliente</span>
        </Link>
      </div>

      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-on-surface-variant py-12">Cargando clientes…</p>
      ) : customers.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-8">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
            <IconUsers className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-on-surface mb-2">Aún no hay clientes</h2>
          <p className="text-sm text-on-surface-variant max-w-sm mb-6">
            Comienza añadiendo a tu primer cliente para hacer seguimiento de sus compras y ofrecer un mejor servicio.
          </p>
          <Link
            href="/dashboard/customers/new"
            className="px-6 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
          >
            Añadir tu primer cliente
          </Link>
        </div>
      ) : (
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/10 text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
                  <th className="p-4 pl-6">Nombre</th>
                  <th className="p-4">Contacto</th>
                  <th className="p-4">RFC / RUT</th>
                  <th className="p-4 text-center">Impuestos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5 text-sm">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="p-4 pl-6 font-medium text-on-surface">{c.full_name}</td>
                    <td className="p-4 text-on-surface-variant">
                      <div>{c.email ?? "—"}</div>
                      <div className="text-xs text-on-surface-variant/70">{c.phone ?? ""}</div>
                    </td>
                    <td className="p-4 text-on-surface-variant font-mono text-xs">{c.identification ?? "—"}</td>
                    <td className="p-4 text-center">
                      {c.tax_exempt ? (
                        <span className="inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20">
                          Exento
                        </span>
                      ) : (
                        <span className="inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold bg-surface-variant text-on-surface-variant">
                          Aplica IVA
                        </span>
                      )}
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
