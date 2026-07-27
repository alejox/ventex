import { MoneyInput } from "@/components/ui/MoneyInput";

interface ProductPresentationSectionProps {
  presentation: "unit" | "package";
  setPresentation: (v: "unit" | "package") => void;
  editId: string | null;
  unitsPerPackage: string;
  onUnitsPerPackageChange: (v: string) => void;
  initialUnits: string;
  setInitialUnits: (v: string) => void;
  initialPackages: string;
  setInitialPackages: (v: string) => void;
  initialStock: number;
  packagePrice: string;
  onPackagePriceChange: (v: string) => void;
  packageHint: string;
  stockLevel: string;
}

export function ProductPresentationSection({
  presentation,
  setPresentation,
  editId,
  unitsPerPackage,
  onUnitsPerPackageChange,
  initialUnits,
  setInitialUnits,
  initialPackages,
  setInitialPackages,
  initialStock,
  packagePrice,
  onPackagePriceChange,
  packageHint,
  stockLevel,
}: ProductPresentationSectionProps) {
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

      {presentation === "package" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-1.5">
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
            </div>

            {!editId && (
              <div className="space-y-1.5">
                <label htmlFor="initial-packages" className="text-[13px] font-semibold text-on-surface block">
                  Cajas que estás cargando
                </label>
                <input
                  id="initial-packages"
                  type="number"
                  min="0"
                  value={initialPackages}
                  onChange={(e) => setInitialPackages(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
                  placeholder="Ej. 4"
                />
              </div>
            )}
          </div>

          {!editId && (
            <p className="text-sm text-on-surface">
              Stock inicial:{" "}
              <strong className="font-mono text-primary">{initialStock}</strong> unidades
              <span className="text-xs text-on-surface-variant font-normal">
                {" "}({initialPackages || "0"} × {unitsPerPackage || "1"})
              </span>
            </p>
          )}

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
      ) : (
        !editId && (
          <div className="space-y-1.5 max-w-sm">
            <label htmlFor="initial-units" className="text-[13px] font-semibold text-on-surface block">
              Stock inicial <span className="text-on-surface-variant font-normal">(unidades)</span>
            </label>
            <input
              id="initial-units"
              type="number"
              min="0"
              value={initialUnits}
              onChange={(e) => setInitialUnits(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
              placeholder="Ej. 25"
            />
          </div>
        )
      )}

      {editId && (
        <div className="flex flex-wrap items-center gap-4 px-1">
          <div className="text-sm text-on-surface-variant">
            Stock actual: <strong className="text-on-surface">{stockLevel || "0"}</strong> unidades
          </div>
          <a
            href={`/dashboard/inventory/movements?product_id=${editId}`}
            className="text-xs font-semibold text-primary hover:text-primary-dim transition-colors"
          >
            Ajustar por movimientos →
          </a>
        </div>
      )}
    </div>
  );
}
