import { MoneyInput } from "@/components/ui/MoneyInput";
import { StockQuantityFields } from "@/components/StockQuantityFields";

interface ProductPresentationSectionProps {
  presentation: "unit" | "package";
  setPresentation: (v: "unit" | "package") => void;
  editId: string | null;
  unitsPerPackage: string;
  onUnitsPerPackageChange: (v: string) => void;
  /** Cajas y unidades sueltas del alta. Se suman. */
  initialPackages: string;
  setInitialPackages: (v: string) => void;
  initialLoose: string;
  setInitialLoose: (v: string) => void;
  packagePrice: string;
  onPackagePriceChange: (v: string) => void;
  packageHint: string;
  /** Stock guardado, en unidades sueltas. Solo se muestra en edición. */
  currentStock: number;
  canMoveStock: boolean;
  entryPackages: string;
  setEntryPackages: (v: string) => void;
  entryLoose: string;
  setEntryLoose: (v: string) => void;
  /** Unidades que sumaría la entrada, cajas ya convertidas. */
  entryUnits: number;
}

export function ProductPresentationSection({
  presentation,
  setPresentation,
  editId,
  unitsPerPackage,
  onUnitsPerPackageChange,
  initialPackages,
  setInitialPackages,
  initialLoose,
  setInitialLoose,
  packagePrice,
  onPackagePriceChange,
  packageHint,
  currentStock,
  canMoveStock,
  entryPackages,
  setEntryPackages,
  entryLoose,
  setEntryLoose,
  entryUnits,
}: ProductPresentationSectionProps) {
  // En presentación suelta no hay caja que ofrecer, por más que el producto
  // arrastre un `units_per_package` de una edición anterior.
  const packSize = presentation === "package"
    ? Math.max(parseInt(unitsPerPackage || "1", 10) || 1, 1)
    : 1;

  return (
    <div className="border-t border-outline-variant/10 pt-6 space-y-5">
      <div>
        <h3 className="text-base font-bold text-on-surface">Presentación y stock</h3>
        <p className="text-xs text-on-surface-variant mt-1">
          ¿Este producto se maneja suelto o por caja?
        </p>
      </div>

      <div className="flex gap-2 sm:gap-3 max-w-sm">
        {(["unit", "package"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setPresentation(mode)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
              presentation === mode
                ? "border-primary text-primary bg-primary/5"
                : "border-outline-variant/30 text-on-surface hover:bg-surface-container-low"
            }`}
          >
            {mode === "unit" ? "Unidad" : "Caja"}
          </button>
        ))}
      </div>

      {presentation === "package" && (
        <div className="space-y-4">
          <div className="space-y-1.5 max-w-sm">
            <label htmlFor="units-per-package" className="text-[13px] font-semibold text-on-surface block">
              Unidades por caja
            </label>
            <input
              id="units-per-package"
              type="number"
              min="1"
              value={unitsPerPackage}
              onChange={(e) => onUnitsPerPackageChange(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
              placeholder="Ej. 60"
            />
            {/* Define el EMPAQUE —cuánto trae una caja, para venderla y para
                prorratear el costo—, no cuánta mercadería hay. Cuando sumaba al
                stock, un producto con caja de 24 al que se le cargaban 23
                unidades nacía con 47. */}
            <p className="text-xs text-on-surface-variant">
              Cuántas unidades trae una caja. Es la definición del empaque: no suma stock.
            </p>
          </div>

          <div className="space-y-1.5 max-w-sm">
            <label className="text-[13px] font-semibold text-on-surface block">
              Precio de venta por caja <span className="text-on-surface-variant font-normal">(opcional)</span>
            </label>
            <MoneyInput
              aria-label="Precio de venta por caja"
              value={packagePrice}
              onChange={onPackagePriceChange}
              placeholder="Vacío = no se vende por caja"
            />
            {packageHint && <p className="text-xs text-on-surface-variant">{packageHint}</p>}
          </div>
        </div>
      )}

      {/* Cajas y unidades sueltas juntas, porque así llega la mercadería: "me
          entraron 2 cajas y 20 unidades". La línea del total es la que deja ver
          que «unidades por caja» define el empaque y no suma stock por sí sola. */}
      {!editId && (
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-on-surface">Stock inicial</p>
          <StockQuantityFields
            packSize={packSize}
            packages={initialPackages}
            onPackagesChange={setInitialPackages}
            loose={initialLoose}
            onLooseChange={setInitialLoose}
            idPrefix="initial"
          />
          <p className="text-xs text-on-surface-variant">
            {packSize > 1
              ? "Cuánta mercadería tienes hoy. Una caja incompleta va en unidades sueltas."
              : "Cuántas unidades tienes hoy."}
          </p>
        </div>
      )}

      {editId && (
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-4">
          <div className="text-sm text-on-surface-variant">
            Stock actual: <strong className="text-on-surface font-mono">{currentStock}</strong> unidades
          </div>

          {canMoveStock ? (
            <>
              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-on-surface">
                  Agregar stock <span className="text-on-surface-variant font-normal">(opcional)</span>
                </p>
                <StockQuantityFields
                  packSize={packSize}
                  packages={entryPackages}
                  onPackagesChange={setEntryPackages}
                  loose={entryLoose}
                  onLooseChange={setEntryLoose}
                  idPrefix="entry"
                />
              </div>

              {entryUnits > 0 ? (
                <p className="text-sm text-on-surface">
                  Queda en{" "}
                  <strong className="font-mono text-primary">{currentStock + entryUnits}</strong> unidades
                  <span className="text-xs text-on-surface-variant font-normal">
                    {" "}({currentStock} + {entryUnits})
                  </span>
                </p>
              ) : (
                /* El stock NO se edita a mano: se registra la entrada y queda en
                   Movimientos con fecha y responsable. Escribir el conteo desde
                   acá pisaría lo que el POS vendió mientras la ficha estaba
                   abierta. Para descontar o corregir el conteo está «Ajustar
                   stock», que registra salida o ajuste. */
                <p className="text-xs text-on-surface-variant">
                  Se registra como entrada en Movimientos al guardar. Para descontar o corregir
                  el conteo, usa «Ajustar stock» desde el inventario.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-on-surface-variant">
              No tienes permiso para mover stock.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
