"use client";

import React from "react";
import { useFormatMoney } from "@/lib/useMoney";
import type { ReceiptData } from "@/lib/receipt";

// Los datos se arman con `buildReceiptFromCart` / `buildReceiptFromSale`
// (`lib/receipt.ts`): este componente solo dibuja.
export type { ReceiptData } from "@/lib/receipt";

interface Props {
  data: ReceiptData | null;
}

export function PosReceipt({ data }: Props) {
  // Solo el cliente exento tiene rebaja por exención.
  const fmtMoney = useFormatMoney();
  const isExempt = (data?.totals.exemptionDiscount ?? 0) > 0;

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
            [data-sonner-toaster] {
              display: none !important;
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
                // El recibo se imprime: `next/image` haría lazy loading y
                // serviría un placeholder, que en una impresión térmica sale
                // vacío. Acá se quiere el archivo tal cual y ya cargado.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.logoUrl}
                  alt="Logo"
                  className="mx-auto mb-2 max-h-20 w-auto object-contain"
                />
              )}
              <h1 className="font-bold text-xl">{data.businessName || "Mi Negocio"}</h1>
              {data.municipality && <p>{data.municipality}</p>}
              {data.phone && (
                <p>
                  <span className="font-bold">Tel&eacute;fono:</span> {data.phone}
                </p>
              )}
              <p>
                <span className="font-bold">R&eacute;gimen:</span>{" "}
                {data.taxResponsibility || (data.includeTax ? "Responsable de IVA" : "No responsable de IVA")}
              </p>
            </div>

            <div className="text-center space-y-1 mb-4">
              <p className="font-bold">Pre-factura</p>
              <p className="font-bold">Sin valor fiscal</p>
              {data.saleNumber != null ? (
                <p className="font-bold">Venta N.&ordm; {data.saleNumber}</p>
              ) : data.queued ? (
                <p>Pendiente de env&iacute;o (cobrada sin conexi&oacute;n)</p>
              ) : null}
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
              {data.cashier && (
                <p className="text-xs">
                  <span className="font-bold">Cajero:</span> {data.cashier}
                </p>
              )}
              {data.seller && (
                <p className="text-xs">
                  <span className="font-bold">Atendido por:</span> {data.seller}
                </p>
              )}
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
                  <tr key={i} className="align-top">
                    <td className="py-1 pr-2">
                      <span className="font-medium">{item.name}</span>
                      {item.packageLabel ? (
                        <span className="text-gray-500 block">{item.packageLabel}</span>
                      ) : (
                        item.sku && <span className="text-gray-500 block">SKU: {item.sku}</span>
                      )}
                      {item.discount > 0 && (
                        <span className="text-gray-500 block">
                          {fmtMoney(item.gross)} &minus; {item.discountLabel ?? "Desc."} {fmtMoney(item.discount)}
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-center">{item.quantity}</td>
                    <td className="py-1 text-right">{fmtMoney(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <hr className="border-t border-black mb-3 border-dashed" />

            {/* Totales. Los precios de los ítems son de vitrina (IVA incluido);
                el desglose depende del régimen y de si el cliente es exento. */}
            <div className="space-y-1 mb-4">
              {isExempt ? (
                <>
                  <div className="flex justify-between">
                    <span className="font-bold">Precio original:</span>
                    <span>{fmtMoney(data.totals.gross)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">Desc. exenci&oacute;n IVA:</span>
                    <span>-{fmtMoney(data.totals.exemptionDiscount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">Subtotal:</span>
                    <span>{fmtMoney(data.totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">IVA:</span>
                    <span>{fmtMoney(0)}</span>
                  </div>
                </>
              ) : data.includeTax ? (
                <>
                  <div className="flex justify-between">
                    <span className="font-bold">Subtotal:</span>
                    <span>{fmtMoney(data.totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">IVA:</span>
                    <span>{fmtMoney(data.totals.taxAmount)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="font-bold">Subtotal:</span>
                  <span>{fmtMoney(data.totals.subtotal)}</span>
                </div>
              )}
              {data.totals.discount > 0 && (
                <div className="flex justify-between">
                  <span className="font-bold">Descuentos aplicados:</span>
                  <span>-{fmtMoney(data.totals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base border-t border-black pt-1 mt-1">
                <span className="font-bold">Total:</span>
                <span className="font-bold">{fmtMoney(data.totals.total)}</span>
              </div>
            </div>

            {/* Pago: con un pago dividido se lista cada medio; en efectivo,
                lo recibido y el cambio que se entregó. */}
            <div className="space-y-1 mb-4">
              <div className="flex justify-between">
                <span className="font-bold">Pago:</span>
                <span>{data.paymentLabel}</span>
              </div>
              {data.payments.map((p, i) => (
                <div key={i} className="flex justify-between pl-2">
                  <span>{p.label}</span>
                  <span>{fmtMoney(p.amount)}</span>
                </div>
              ))}
              {data.tendered != null && (
                <div className="flex justify-between">
                  <span className="font-bold">Recibido:</span>
                  <span>{fmtMoney(data.tendered)}</span>
                </div>
              )}
              {data.tendered != null && (
                <div className="flex justify-between">
                  <span className="font-bold">Cambio:</span>
                  <span>{fmtMoney(data.change)}</span>
                </div>
              )}
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
