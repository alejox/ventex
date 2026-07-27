import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";

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
}: ProductPricingSectionProps) {
  return (
    <>
      <div className="border-t border-outline-variant/10 pt-6 space-y-6">
        <div>
          <h3 className="text-base font-bold text-on-surface">Precio de Compra (Paquete)</h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Escribe en cualquiera de los dos: el otro se calcula solo.
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
              aria-label="Precio final de venta con IVA"
              value={selling.total}
              onChange={selling.fromTotal}
              required
            />
          </div>
        </div>

        {margin && (
          <p className={`text-xs font-medium ${margin.pct < 0 ? "text-error" : "text-on-surface-variant"}`}>
            Margen: <strong className="font-mono">{margin.pct.toFixed(1)}%</strong> sobre un costo de{" "}
            <span className="font-mono">${margin.costPerUnit.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span> por unidad
            {margin.pct < 0 ? " — estás vendiendo a pérdida." : ""}
          </p>
        )}
      </div>
    </>
  );
}
