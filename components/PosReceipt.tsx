import React from "react";

// Este componente solo se mostrará en pantalla cuando se envíe a imprimir (gracias a CSS).
export function PosReceipt() {
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
        {/* Header */}
        <div className="text-center space-y-1 mb-4">
          <h1 className="font-bold text-xl">Alejox</h1>
          <p>Bogotá</p>
          <p>
            <span className="font-bold">Teléfono:</span> 3148956814
          </p>
          <p>
            <span className="font-bold">Régimen:</span> Responsable de IVA
          </p>
        </div>

        <div className="text-center space-y-1 mb-4">
          <p className="font-bold">Pre-factura</p>
          <p className="font-bold">Sin valor fiscal</p>
        </div>

        <div className="text-center space-y-1 mb-4">
          <h2 className="font-bold text-lg">Consumidor final</h2>
          <p>CC 222222222222</p>
        </div>

        <hr className="border-t border-black mb-4 border-dashed" />

        {/* Totals */}
        <div className="flex flex-col items-end space-y-1 mb-4">
          <p>
            <span className="font-bold">Subtotal:</span> $0
          </p>
          <p>
            <span className="font-bold text-base">Total:</span>{" "}
            <span className="font-bold text-base">$0</span>
          </p>
        </div>

        {/* Taxes */}
        <div className="mb-4">
          <h3 className="font-bold text-center mb-2">Resumen de impuestos</h3>
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-black border-dashed">
                <th className="font-bold pb-1 text-left">Tarifa</th>
                <th className="font-bold pb-1">Base</th>
                <th className="font-bold pb-1">Impuesto</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="pt-2 text-left"></td>
                <td className="pt-2 font-bold">$0</td>
                <td className="pt-2 font-bold">$0</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="space-y-1 mb-6">
          <p>
            <span className="font-bold">Total de líneas:</span> 0
          </p>
          <p>
            <span className="font-bold">Total de productos:</span> 0
          </p>
        </div>

        <hr className="border-t border-black mb-4" />

        <div className="text-center text-xs space-y-1">
          <p>Devtecia - ventex.app</p>
        </div>
      </div>
    </>
  );
}
