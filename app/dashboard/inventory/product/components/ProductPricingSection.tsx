import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";
import type { Ref } from "react";
import { useFormatMoney } from "@/lib/useMoney";
import { calculateMargin } from "@/services/inventory.service";

interface PricePair {
  base: string;
  total: string;
  fromBase: (v: string) => void;
  fromTotal: (v: string) => void;
}

export interface ProductMargin {
  /** Margen sobre el PRECIO de venta, en % (misma convención que `recipeMargin`). */
  pct: number;
  costPerUnit: number;
  /** Lo que queda por unidad: precio − costo. */
  profit: number;
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
  margin: ProductMargin | null;
  presentation: "unit" | "package";
  unitsPerPackage: string;
  sellingPriceError?: string;
  sellingPriceRef?: Ref<HTMLInputElement>;
  /**
   * "Solo insumo": no se vende, así que no hay precio de venta ni margen que
   * mostrar. Queda solo lo que se paga por él (su costo), con su IVA.
   */
  ingredientMode?: boolean;
  /**
   * El producto tiene receta de VENTA: su costo no es un precio de compra (no
   * se compra, se prepara) sino la suma de sus insumos. Reemplaza los campos
   * de compra por una tarjeta de solo lectura y el margen se calcula con él.
   * `incomplete` = algún insumo sin costo, así que el real es mayor.
   */
  recipeCost?: RecipeCostInfo | null;
}

/**
 * Costo que sale de la receta. `basis` dice de qué es: `sale` = lo que gastan
 * los insumos de UNA unidad vendida; `production` = costo del lote ÷ lo que
 * rinde. `pending` = todavía no se puede calcular (receta sin insumos o sin
 * rendimiento): se explica qué falta en vez de mostrar un $0 que parece real.
 */
export interface RecipeCostInfo {
  total: number;
  incomplete: boolean;
  basis: "sale" | "production";
  pending?: string | null;
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
  ingredientMode = false,
  recipeCost = null,
}: ProductPricingSectionProps) {
  const fmtMoney = useFormatMoney();
  const isPackage = presentation === "package";
  const unitsCount = Math.max(parseInt(unitsPerPackage || "1") || 1, 1);
  const purchaseTotal = parseFloat(purchase.total || "0");
  const derivedUnitCost = purchaseTotal > 0 ? purchaseTotal / (isPackage ? unitsCount : 1) : 0;

  // Con receta de venta el costo sale de los insumos, por unidad vendida: el
  // margen se calcula contra ese costo y no contra un precio de compra en 0.
  const effectiveMargin = recipeCost
    ? recipeCost.pending ? null : calculateMargin(recipeCost.total, selling.total, "unit", "1")
    : margin;

  // Con receta: el costo es la tarjeta de la receta, sin IVA que pagar ni mostrar.
  const recipeCostCard = recipeCost && (
    <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/60 px-5 py-4">
      {recipeCost.pending ? (
        <p className="text-sm text-on-surface-variant">{recipeCost.pending}</p>
      ) : (
        <>
          <p className="text-xs text-on-surface-variant">Costo por unidad</p>
          <p className="text-2xl font-bold text-on-surface tabular-nums">
            {fmtMoney(recipeCost.total)}
            {recipeCost.incomplete && <span className="text-on-surface-variant text-base font-semibold"> +</span>}
          </p>
          {recipeCost.incomplete && (
            <p className="mt-1 text-xs text-on-surface-variant">
              Algún insumo no tiene costo: el real es mayor.
            </p>
          )}
        </>
      )}
    </div>
  );

  const marginHint = effectiveMargin && (
    <p className={`text-xs font-medium ${effectiveMargin.pct < 0 ? "text-error" : "text-on-surface-variant"}`}>
      Margen: <strong className="font-mono">{effectiveMargin.pct.toFixed(1)}%</strong> · te quedan{" "}
      <span className="font-mono">{fmtMoney(effectiveMargin.profit)}</span> por unidad (costo{" "}
      <span className="font-mono">{fmtMoney(effectiveMargin.costPerUnit)}</span>)
      {effectiveMargin.pct < 0 ? " — estás vendiendo a pérdida." : ""}
    </p>
  );

  const derivedCostHint = purchaseTotal > 0 && (
    <p className="text-xs font-medium text-on-surface-variant/90 pt-0.5">
      💡 Costo unitario derivado:{" "}
      <strong className="font-mono text-on-surface">{fmtMoney(derivedUnitCost)}</strong> por unidad
      {isPackage && unitsCount > 1 && (
        <span className="text-on-surface-variant/70 font-normal">
          {" "}({fmtMoney(purchaseTotal)} ÷ {unitsCount} u.)
        </span>
      )}
    </p>
  );

  // Negocio sin IVA: sin base, sin selector y sin total que emparejar. Compra y
  // venta son UN campo cada uno, lado a lado desde `sm` en una sola sección.
  if (!includeTax) {
    return (
      <div className="border-t border-outline-variant/10 pt-6">
        <div className={`grid grid-cols-1 gap-x-6 gap-y-5 ${ingredientMode ? "" : "sm:grid-cols-2"}`}>
          {recipeCost ? (
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-on-surface">Costo según receta</h3>
              {recipeCostCard}
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="product-purchase-price" className="text-sm font-bold text-on-surface block">
                {ingredientMode
                  ? `Costo por ${isPackage ? "caja" : "unidad"}`
                  : isPackage
                    ? `Precio de compra por caja${unitsCount > 1 ? ` (${unitsCount} u.)` : ""}`
                    : "Precio de compra por unidad"}
              </label>
              <MoneyInput
                id="product-purchase-price"
                value={purchase.total}
                onChange={purchase.fromTotal}
              />
              {derivedCostHint}
            </div>
          )}

          {!ingredientMode && (
            <div className="space-y-1.5">
              <label htmlFor="product-selling-price" className="text-sm font-bold text-on-surface block">
                Precio de venta por unidad
              </label>
              <MoneyInput
                id="product-selling-price"
                ref={sellingPriceRef}
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
              {marginHint}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {recipeCost ? (
        <div className="border-t border-outline-variant/10 pt-6 space-y-3">
          <div>
            <h3 className="text-base font-bold text-on-surface">Costo según receta</h3>
            <p className="text-xs text-on-surface-variant mt-1">
              {recipeCost.basis === "production"
                ? "Costo de un lote ÷ lo que rinde. Se vuelve a fijar solo cada vez que registras un lote en Producción."
                : "Lo que cuestan los insumos de una unidad vendida. Cambia la receta y cambia el costo."}
            </p>
          </div>
          {recipeCostCard}
        </div>
      ) : (
        <div className="border-t border-outline-variant/10 pt-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-on-surface">
              {ingredientMode
                ? "Costo"
                : isPackage
                  ? `Precio de Compra por Caja${unitsCount > 1 ? ` (contiene ${unitsCount} unidades)` : ""}`
                  : "Precio de Compra por Unidad"}
            </h3>
            <p className="text-xs text-on-surface-variant mt-1">
              {ingredientMode
                ? `Lo que pagas por ${isPackage ? "caja" : "unidad"}, con IVA.`
                : isPackage
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
      )}

      {!ingredientMode && (
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

          {/* UN solo margen en toda la ficha, sobre el precio (lo que queda de
              cada peso cobrado), igual que el de la receta. */}
          {effectiveMargin && (
            <p className={`text-xs font-medium ${effectiveMargin.pct < 0 ? "text-error" : "text-on-surface-variant"}`}>
              Margen: <strong className="font-mono">{effectiveMargin.pct.toFixed(1)}%</strong> · te quedan{" "}
              <span className="font-mono">{fmtMoney(effectiveMargin.profit)}</span> por unidad (costo{" "}
              <span className="font-mono">{fmtMoney(effectiveMargin.costPerUnit)}</span>)
              {effectiveMargin.pct < 0 ? " — estás vendiendo a pérdida." : ""}
            </p>
          )}
        </div>
      )}
    </>
  );
}
