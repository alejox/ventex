"use client";

import React from "react";

interface ReceiptItem {
  name: string;
  sku: string | null;
  quantity: number;
  price: number;
  total: number;
}

interface ReceiptCustomer {
  full_name: string;
  doc_type: string | null;
  identification: string | null;
}

interface ReceiptTotals {
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
}

interface ReceiptData {
  items: ReceiptItem[];
  customer: ReceiptCustomer | null;
  totals: ReceiptTotals;
  paymentMethod: string;
  date: Date;
  businessName?: string | null;
  logoUrl?: string | null;
}

interface Props {
  data: ReceiptData | null;
}

export function PosReceipt({ data }: Props) {
  const fmt = (n: number) =>
    "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const paymentLabel: Record<string, string> = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    transferencia: "Transferencia",
  };

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media print {
            @page {
              margin: 0;
              size: 80mm 297mm;
            }
            body {
              margin: 0;
              padding: 0;
            }
          }
        `,
        }}
      />
      <div className="hidden print:block w-[80mm] max-w-full text-black bg-white font-mono text-sm mx-auto p-4 leading-tight">
        {data && (
          <>
            {/* Header */}
            <div className="text-center space-y-1 mb-4">
              {data.logoUrl && (
                <img
                  src={data.logoUrl}
                  alt="Logo"
                  className="mx-auto mb-2 max-h-20 w-auto object-contain"
                />
              )}
              <h1 className="font-bold text-xl">{data.businessName || "Alejox"}</h1>
              <p>Bogot&aacute;</p>
              <p>
                <span className="font-bold">Tel&eacute;fono:</span> 3148956814
              </p>
              <p>
                <span className="font-bold">R&eacute;gimen:</span> Responsable de IVA
              </p>
            </div>

            <div className="text-center space-y-1 mb-4">
              <p className="font-bold">Pre-factura</p>
              <p className="font-bold">Sin valor fiscal</p>
            </div>

            {/* Cliente */}
            <div className="space-y-1 mb-4">
              <h2 className="font-bold text-lg">{data.customer?.full_name ?? "Consumidor final"}</h2>
              {data.customer?.doc_type && data.customer?.identification && (
                <p>
                  {data.customer.doc_type} {data.customer.identification}
                </p>
              )}
              <p className="text-xs text-gray-500">
                {data.date.toLocaleDateString("es-CO", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p className="text-xs text-gray-500 capitalize">
                Pago: {paymentLabel[data.paymentMethod] ?? data.paymentMethod}
              </p>
            </div>

            <hr className="border-t border-black mb-3 border-dashed" />

            {/* Items */}
            <table className="w-full text-xs border-collapse mb-3">
              <thead>
                <tr className="border-b border-black border-dashed">
                  <th className="font-bold text-left pb-1">Producto</th>
                  <th className="font-bold text-center pb-1">Cant</th>
                  <th className="font-bold text-right pb-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2">
                      <span className="font-medium">{item.name}</span>
                      {item.sku && <span className="text-gray-500 block">SKU: {item.sku}</span>}
                    </td>
                    <td className="py-1 text-center">{item.quantity}</td>
                    <td className="py-1 text-right">{fmt(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <hr className="border-t border-black mb-3 border-dashed" />

            {/* Totales */}
            <div className="space-y-1 mb-4">
              <div className="flex justify-between">
                <span className="font-bold">Subtotal:</span>
                <span>{fmt(data.totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">IVA:</span>
                <span>{fmt(data.totals.taxAmount)}</span>
              </div>
              {data.totals.discount > 0 && (
                <div className="flex justify-between">
                  <span className="font-bold">Descuento:</span>
                  <span className="text-red-600">-{fmt(data.totals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base border-t border-black pt-1 mt-1">
                <span className="font-bold">Total:</span>
                <span className="font-bold">{fmt(data.totals.total)}</span>
              </div>
            </div>

            {/* Footer info */}
            <div className="space-y-1 mb-6">
              <p>
                <span className="font-bold">Total de l&iacute;neas:</span> {data.items.length}
              </p>
              <p>
                <span className="font-bold">Total de productos:</span>{" "}
                {data.items.reduce((s, i) => s + i.quantity, 0)}
              </p>
            </div>

            <hr className="border-t border-black mb-4" />

            <div className="text-center text-xs space-y-1">
              <p>Devtecia - ventex.app</p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
