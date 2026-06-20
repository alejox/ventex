import React, { useEffect, useState } from "react";
import { fetchSales, SaleListItem } from "@/services/sales.service";
import Link from "next/link";

function IconReceipt(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function IconPrinter(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.728 6.75H17.27m-10.543 0L5.43 3.656A1.125 1.125 0 016.425 3h11.15a1.125 1.125 0 01.995.656l-1.298 3.094m-10.543 0h10.543m-10.543 0v4.5m10.543-4.5v4.5m-10.543 4.5h10.543M6.728 15.75v4.125A1.125 1.125 0 007.853 21h8.294a1.125 1.125 0 001.125-1.125V15.75m-10.543 0L5.43 12.656A1.125 1.125 0 016.425 12h11.15a1.125 1.125 0 01.995.656l-1.298 3.094" />
    </svg>
  );
}

interface RecentSalesModalProps {
  onClose: () => void;
}

export function RecentSalesModal({ onClose }: RecentSalesModalProps) {
  const [sales, setSales] = useState<SaleListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSales().then((data) => {
      setSales(data.slice(0, 5)); // Fetch only recent 5
      setLoading(false);
    }).catch((e) => {
      console.error(e);
      setLoading(false);
    });
  }, []);

  const money = (val: number) => val.toLocaleString("es-CO");

  return (
    <div className="fixed inset-0 z-[200] flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface-container-lowest h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <IconReceipt className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-on-surface">Ventas recientes</h2>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest p-2 rounded-full transition-colors"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center p-8">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : sales.length === 0 ? (
            <p className="text-center text-on-surface-variant">No hay ventas recientes.</p>
          ) : (
            <div className="overflow-hidden border border-outline-variant/20 rounded-xl">
              <table className="w-full text-left text-sm text-on-surface">
                <thead className="bg-surface-container-lowest border-b border-outline-variant/20">
                  <tr>
                    <th className="p-3 font-medium text-on-surface-variant">Venta</th>
                    <th className="p-3 font-medium text-on-surface-variant">Total</th>
                    <th className="p-3 font-medium text-on-surface-variant">Estado</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="p-3">Factura {sale.sale_number}</td>
                      <td className="p-3 font-medium">${money(sale.total)}</td>
                      <td className="p-3 text-on-surface-variant text-xs italic">
                        {sale.status === "completed" ? "No electrónica" : "Pendiente"}
                      </td>
                      <td className="p-3 text-right">
                        <Link href={`/dashboard/sales`} className="text-on-surface-variant hover:text-primary transition-colors">
                          <IconPrinter className="w-5 h-5 inline-block" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-outline-variant/10 text-right">
          <Link
            href="/dashboard/sales"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-6 py-3 border border-outline-variant/30 rounded-xl text-on-surface hover:bg-surface-container-highest transition-colors font-medium"
          >
            Ir al historial de ventas
            <span>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
