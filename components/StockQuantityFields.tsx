"use client";

import { stockUnitsOf, formatQty } from "@/lib/stock";

interface StockQuantityFieldsProps {
  /** Unidades que trae una caja. En 1 no hay caja: solo se piden unidades. */
  packSize: number;
  packages: string;
  onPackagesChange: (v: string) => void;
  loose: string;
  onLooseChange: (v: string) => void;
  /** Prefijo de los `id`, para que dos controles en la misma pantalla no choquen. */
  idPrefix: string;
  /** Cómo se llaman las unidades sueltas en este contexto. */
  looseLabel?: string;
  autoFocus?: boolean;
  /**
   * Si el producto admite media unidad. Lo decide su unidad de medida.
   *
   * Por defecto `true` —permisivo— porque en el ALTA el producto todavía no
   * existe y la unidad la resuelve la base: la venta la valida el servidor
   * (CANTIDAD_ENTERA), así que acá no hace falta repetir esa lista.
   */
  allowsFractions?: boolean;
}

const FIELD_CLASS =
  "w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50";

/**
 * Cantidad de mercadería: cajas MÁS unidades sueltas.
 *
 * Las dos mitades juntas porque así es como llega: "me entraron 2 cajas y 20
 * unidades". Obligar a elegir una sola —o a convertir a mano— es pedirle al
 * comerciante que haga la multiplicación que la computadora tiene que hacer.
 *
 * Es el MISMO control en las tres pantallas donde entra stock (alta del
 * producto, entrada desde la ficha, ajuste manual): tres cuentas distintas para
 * la misma pregunta es como se llega a que dos pantallas informen números que no
 * cierran entre sí.
 *
 * La línea del total no es decorativa: es la única forma de ver, ANTES de
 * guardar, que "unidades por caja" define el empaque y no suma stock por sí
 * sola.
 */
export function StockQuantityFields({
  packSize,
  packages,
  onPackagesChange,
  loose,
  onLooseChange,
  idPrefix,
  looseLabel = "Unidades sueltas",
  autoFocus = false,
  allowsFractions = true,
}: StockQuantityFieldsProps) {
  const packed = packSize > 1;
  // Las cajas no se fraccionan: media caja no es una presentación.
  const looseStep = allowsFractions ? "any" : "1";
  const total = stockUnitsOf(packed ? packages : "", loose, String(packSize));
  const packagesCount = parseInt(packages || "0", 10) || 0;
  // `parseFloat`: con `parseInt` el desglose decía "20 sueltas" mientras el
  // total contaba 20,5 — dos números distintos para el mismo campo, uno al lado
  // del otro.
  const looseCount = parseFloat(loose || "0") || 0;

  if (!packed) {
    return (
      <div className="space-y-1.5 max-w-[220px]">
        <label htmlFor={`${idPrefix}-loose`} className="text-[13px] font-semibold text-on-surface block">
          Unidades
        </label>
        <input
          id={`${idPrefix}-loose`}
          type="number"
          min="0"
          step={looseStep}
          value={loose}
          onChange={(e) => onLooseChange(e.target.value)}
          autoFocus={autoFocus}
          className={FIELD_CLASS}
          placeholder="Ej. 25"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-packages`} className="text-[13px] font-semibold text-on-surface block">
            Cajas <span className="text-on-surface-variant font-normal">(× {packSize})</span>
          </label>
          <input
            id={`${idPrefix}-packages`}
            type="number"
            min="0"
            step="1"
            value={packages}
            onChange={(e) => onPackagesChange(e.target.value)}
            autoFocus={autoFocus}
            className={FIELD_CLASS}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-loose`} className="text-[13px] font-semibold text-on-surface block">
            {looseLabel}
          </label>
          <input
            id={`${idPrefix}-loose`}
            type="number"
            min="0"
            step={looseStep}
            value={loose}
            onChange={(e) => onLooseChange(e.target.value)}
            className={FIELD_CLASS}
            placeholder="0"
          />
        </div>
      </div>

      {total > 0 && (
        <p className="text-sm text-on-surface">
          <span className="text-xs text-on-surface-variant font-normal">
            {packagesCount > 0 && `${packagesCount} × ${packSize}`}
            {packagesCount > 0 && looseCount > 0 && " + "}
            {looseCount > 0 && `${formatQty(looseCount)} ${packagesCount > 0 ? "sueltas" : "unidades"}`}
            {" = "}
          </span>
          <strong className="font-mono text-primary">{formatQty(total)}</strong> unidades
        </p>
      )}
    </div>
  );
}
