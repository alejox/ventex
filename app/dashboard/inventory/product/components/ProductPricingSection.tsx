import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";
import type { Ref } from "react";
import { useFormatMoney } from "@/lib/useMoney";

interface PricePair {
  base: string;
  total: string;
  fromBase: (v: string) => void;
  fromTotal: (v: string) => void;
}

interface ProductPricingSectionProps {
  purchase: PricePair;
  selling: PricePair;
  purchasePriceTax: string;
  setPurchasePriceTax: (v: string) => void;
  sellingPriceTax: string;
  setSellingPriceTax: (v: string) => void;
  rawPercentLabel: string;
  percentLabel: string;
  includeTax: boolean;
  margin: { pct: number; costPerUnit: number } | null;
  presentation: "unit" | "package";
  unitsPerPackage: string;
  sellingPriceError?: string;
  sellingPriceRef?: Ref<HTMLInputElement>;
}

export function ProductPricingSection({
  purchase,
  selling,
  purchasePriceTax,
  setPurchasePriceTax,
  sellingPriceTax,
  setSellingPriceTax,
  rawPercentLabel,
  percentLabel,
  includeTax,
  margin,
  presentation,
  unitsPerPackage,
  sellingPriceError,
  sellingPriceRef,
}: ProductPricingSectionProps) {
  const fmtMoney = useFormatMoney();
  const isPackage = presentation === "package";
  const unitsCount = Math.max(parseInt(unitsPerPackage || "1") || 1, 1);
  const purchaseTotal = parseFloat(purchase.total || "0");
  const derivedUnitCost = purchaseTotal > 0 ? purchaseTotal / (isPackage ? unitsCount : 1) : 0;

  return (
    <>
      <div className="border-t border-outline-variant/10 pt-6 space-y-6">
        <div>
          <h3 className="text-base font-bold text-on-surface">
            {isPackage
              ? `Precio de Compra por Caja${unitsCount > 1 ? ` (contiene ${unitsCount} unidades)` : ""}`
              : "Precio de Compra por Unidad"}
          </h3>
          <p className="text-xs text-on-surface-variant mt-1">
            {isPackage
              ? "Ingresa el precio de compra de la caja completa. Escribe en Base o Total y el IVA se calcula."
              : "Ingresa el precio de compra por unidad. Escribe en Base o Total y el IVA se calcula."}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="space-y-1.5 flex-1 w-full">
            <label className="text-[13px] font-semibold text-on-surface block">Precio base</label>
            <MoneyInput
              aria-label="Precio base de compra"
              value={purchase.base}
              onChange={purchase.fromBase}
            />
          </div>
          <div className="pb-3 text-primary font-bold text-lg hidden sm:block">+</div>
          <Select
            label="IVA"
            containerClassName="flex-1 w-full"
            value={purchasePriceTax}
            onChange={(e) => setPurchasePriceTax(e.target.value)}
          >
            <option value="Ninguno">Ninguno</option>
            <option value="IVA">{rawPercentLabel}</option>
          </Select>
          <div className="pb-3 text-primary font-bold text-lg hidden sm:block">=</div>
          <div className="space-y-1.5 flex-1 w-full">
            <label className="text-[13px] font-semibold text-on-surface block">Total</label>
            <MoneyInput
              aria-label="Total de compra con IVA"
              value={purchase.total}
              onChange={purchase.fromTotal}
            />
          </div>
        </div>

        {purchaseTotal > 0 && (
          <p className="text-xs font-medium text-on-surface-variant/90 pt-0.5">
            💡 Costo unitario derivado:{" "}
            <strong className="font-mono text-on-surface">{fmtMoney(derivedUnitCost)}</strong> por unidad
            {isPackage && unitsCount > 1 && (
              <span className="text-on-surface-variant/70 font-normal">
                {" "}({fmtMoney(purchaseTotal)} ÷ {unitsCount} u.)
              </span>
            )}
          </p>
        )}
      </div>

      <div className="border-t border-outline-variant/10 pt-6 space-y-6">
        <div>
          <h3 className="text-base font-bold text-on-surface">Precio de Venta (Unidad)</h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Escribe el precio de vitrina en el Total y el IVA se desglosa hacia atrás.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="space-y-1.5 flex-1 w-full">
            <label className="text-[13px] font-semibold text-on-surface block">Precio base</label>
            <MoneyInput
              aria-label="Precio base de venta"
              value={selling.base}
              onChange={selling.fromBase}
            />
          </div>
          <div className="pb-3 text-primary font-bold text-lg hidden sm:block">+</div>
          <Select
            label="IVA"
            containerClassName="flex-1 w-full"
            value={sellingPriceTax}
            onChange={(e) => setSellingPriceTax(e.target.value)}
          >
            <option value="Ninguno">Ninguno</option>
            {includeTax && <option value="IVA">{percentLabel}</option>}
          </Select>
          <div className="pb-3 text-primary font-bold text-lg hidden sm:block">=</div>
          <div className="space-y-1.5 flex-1 w-full">
            <label className="text-[13px] font-semibold text-on-surface block">
              Total <span className="text-on-surface-variant font-normal">(vitrina)</span>
            </label>
            <MoneyInput
              id="product-selling-price"
              ref={sellingPriceRef}
              aria-label="Precio final de venta con IVA"
              aria-invalid={!!sellingPriceError}
              aria-describedby={sellingPriceError ? "product-selling-price-error" : undefined}
              value={selling.total}
              onChange={selling.fromTotal}
              required
            />
            {sellingPriceError && (
              <p id="product-selling-price-error" className="text-xs font-medium text-error" role="alert">
                {sellingPriceError}
              </p>
            )}
          </div>
        </div>

        {margin && (
          <p className={`text-xs font-medium ${margin.pct < 0 ? "text-error" : "text-on-surface-variant"}`}>
            Margen: <strong className="font-mono">{margin.pct.toFixed(1)}%</strong> sobre un costo de{" "}
            <span className="font-mono">{fmtMoney(margin.costPerUnit)}</span> por unidad
            {margin.pct < 0 ? " — estás vendiendo a pérdida." : ""}
          </p>
        )}
      </div>
    </>
  );
}
