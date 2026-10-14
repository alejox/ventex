"use client";

import { useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useInventoryStore } from "@/stores/inventory.store";
import { useFormatMoney } from "@/lib/useMoney";
import { useBusinessTax } from "@/lib/useBusinessTax";
import { findSameNameProduct, formatQty, parseQty, unitLabel } from "@/lib/recipe-editor";
import { MEASURE_UNITS, contentLabel, convertQty, isMeasureUnit } from "@/lib/units";
import type { Product } from "@/services/inventory.service";

/**
 * Unidades en que se compra un insumo. `Unidad` va primero y es la que se
 * propone: casi todo lo que se compra empacado se cuenta de a uno (bolsas,
 * botellas, bultos), y arrancar en `kg` es lo que llevó a crear dos "leche"
 * —una en ml con "10" de stock, otra en L— para decir "tengo 10 bolsas".
 */
const INGREDIENT_UNITS = ["Unidad", "kg", "g", "L", "ml", "lb", "Caja", "Pack", "Docena", "Par", "m", "cm"];

const UNIT_HINT: Record<string, string> = {
  Unidad: "Bolsas, botellas, bultos, vasos: lo que cuentas de a uno.",
  kg: "A granel por peso: café, harina, azúcar.",
  g: "A granel por peso: café, harina, azúcar.",
  L: "A granel por volumen: aceite, esencias.",
  ml: "A granel por volumen: aceite, esencias.",
};

/** Unidad de medida que se propone para el contenido ("bolsa de 900 ml"). */
const DEFAULT_CONTENT_UNIT = "ml";

/** Género de las unidades que se cuentan, para "una de 900 ml" y "¿Cuántas tienes?". */
const FEMININE_UNITS = new Set(["Unidad", "Caja", "Docena"]);

/** "unidad", "caja", "kg": la palabra que sigue a "Costo por" y a "Cada … trae". */
function singularOf(unit: string): string {
  const label = unitLabel(unit, 1);
  return label === "u." ? "unidad" : label;
}

/** Lo que devuelve el modal: alcanza para agregar el insumo a una receta (`defaultLineUnit(created)`). */
export interface CreatedIngredient {
  id: string;
  name: string;
  unit: string;
  content_qty: number | null;
  content_unit: string | null;
}

interface IngredientQuickModalProps {
  /** Nombre sugerido (lo que la persona ya escribió en el buscador, si algo). */
  initialName?: string;
  /** Si la persona puede cargar costos (sin el permiso, el campo no se muestra). */
  canSetCost: boolean;
  onClose: () => void;
  /**
   * Recibe el insumo creado — o el EXISTENTE, si la persona eligió "Usar ese
   * insumo" ante un nombre repetido; en ese caso no se creó nada.
   */
  onCreated: (created: CreatedIngredient) => void;
}

/** "10 u. · 900 ml c/u", "sin inventario", "2,5 kg": cómo se describe el insumo que ya existe. */
function existingSummary(p: Product): string {
  const stock = p.tracks_stock === false ? "sin inventario" : formatQty(p.stock_level, p.unit);
  const content = contentLabel(p);
  return content ? `${stock} · ${content}` : stock;
}

/** Mismo redondeo que guarda la base (`numeric(12,3)`), ver `contentPatch`. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * LA pantalla de alta de insumos: lo mínimo para poder usarlo en una receta
 * (nombre, en qué se compra, qué trae cada unidad, costo y cuánto hay). El
 * resto —proveedor, código, mínimo— se completa después en su ficha.
 *
 * Se abre desde la receta (dentro del formulario del producto), desde
 * Inventario y desde Producción. Sin `<form>` a propósito: dentro de la ficha
 * el `<dialog>` no se portalea y un formulario anidado es HTML inválido. Enter
 * en un campo crea igual.
 *
 * No notifica: quien lo abre sabe qué pasó con el insumo (si fue a la receta
 * o a la lista) y es quien avisa.
 */
export function IngredientQuickModal({ initialName = "", canSetCost, onClose, onCreated }: IngredientQuickModalProps) {
  const products = useInventoryStore((s) => s.products);
  const fmtMoney = useFormatMoney();
  // Sin IVA en el negocio la ayuda no lo menciona.
  const { includeTax } = useBusinessTax();
  const addProduct = useInventoryStore((s) => s.addProduct);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState("Unidad");
  const [contentQty, setContentQty] = useState("");
  const [contentUnit, setContentUnit] = useState(DEFAULT_CONTENT_UNIT);
  const [cost, setCost] = useState("");
  const [stock, setStock] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const countable = !isMeasureUnit(unit);
  const singular = singularOf(unit);
  const one = FEMININE_UNITS.has(unit) ? "una" : "uno";

  const stockValue = stock.trim() === "" ? 0 : parseQty(stock);
  const contentValue = contentQty.trim() === "" ? null : parseQty(contentQty);
  /** Contenido válido: solo cuenta en una unidad que NO mide (la base lo exige igual). */
  const hasContent = countable && contentValue !== null;
  const contentText = hasContent
    ? `${contentValue.toLocaleString("es-CO", { maximumFractionDigits: 3 })} ${contentUnit}`
    : null;

  /**
   * Cómo queda la presentación, en palabras, antes de crear: "10 u. = 9 L en
   * total · 100 ml te cuestan $422". Es lo que hace entender que se siguen
   * contando bolsas y que la receta las gasta en ml.
   */
  const summary = (() => {
    if (!hasContent || contentValue === null) return null;
    const parts: string[] = [];
    const stockQty = stockValue ?? 0;
    if (stockQty > 0) {
      const bigUnit = contentUnit === "ml" ? "L" : contentUnit === "g" ? "kg" : contentUnit === "cm" ? "m" : contentUnit;
      const total = convertQty(stockQty * contentValue, contentUnit, bigUnit) ?? stockQty * contentValue;
      parts.push(`${formatQty(stockQty, unit)} = ${formatQty(total, bigUnit)} en total`);
    }
    const costValue = parseFloat(cost);
    if (canSetCost && costValue > 0) {
      const step = contentUnit === "ml" || contentUnit === "g" ? 100 : 1;
      parts.push(`${step.toLocaleString("es-CO")} ${contentUnit} te ${step === 1 ? "cuesta" : "cuestan"} ${fmtMoney((costValue / contentValue) * step)}`);
    }
    return `Sigues contando ${unitLabel(unit, 2) === "u." ? "unidades" : unitLabel(unit, 2)} en stock y compras; la receta lo gasta en ${contentUnit}.${parts.length ? ` ${parts.join(" · ")}.` : ""}`;
  })();

  /**
   * Nombre repetido: se avisa MIENTRAS se escribe, antes de crear. Dos
   * insumos con el mismo nombre terminan con el stock partido en dos y
   * ninguno de los dos dice la verdad.
   */
  const existing = useMemo(() => findSameNameProduct(name, products), [name, products]);

  const changeUnit = (next: string) => {
    setUnit(next);
    // Una unidad que ya mide no tiene contenido: se limpia para no mandar
    // basura que la base rechazaría.
    if (isMeasureUnit(next)) {
      setContentQty("");
      setContentUnit(DEFAULT_CONTENT_UNIT);
    }
    setError(null);
  };

  const useExisting = () => {
    if (!existing || saving) return;
    onCreated({
      id: existing.id,
      name: existing.name,
      unit: existing.unit,
      content_qty: existing.content_qty ?? null,
      content_unit: existing.content_unit ?? null,
    });
  };

  const create = async () => {
    if (saving) return;
    if (!name.trim()) {
      setError("Escribe el nombre del insumo.");
      nameRef.current?.focus();
      return;
    }
    if (countable && contentQty.trim() !== "" && contentValue === null) {
      setError(`Lo que trae cada ${singular} tiene que ser un número mayor que cero.`);
      return;
    }
    if (stock.trim() !== "" && stockValue === null) {
      setError("La cantidad que tienes tiene que ser un número mayor que cero.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const id = await addProduct({
        name: name.trim(),
        category_id: "",
        distributor_id: "",
        sku: "",
        unit,
        // Ya parseado (acepta coma): el servicio recibe un número canónico.
        content_qty: hasContent ? String(contentValue) : "",
        content_unit: hasContent ? contentUnit : "",
        purchase_price: canSetCost ? cost : "",
        price: "0",
        stock_level: String(stockValue ?? 0),
        image_url: "",
        has_commission: false,
        commission_type: "percentage",
        commission_value: "",
        units_per_package: "1",
        tracks_stock: true,
        open_price: false,
        is_ingredient: true,
      });
      if (!id) {
        setError(useInventoryStore.getState().error ?? "No se pudo crear el insumo.");
        return;
      }
      // Recarga para traer el costo (se lee aparte, con su permiso).
      await fetchInventory();
      onCreated({
        id,
        name: name.trim(),
        unit,
        content_qty: hasContent ? round3(contentValue) : null,
        content_unit: hasContent ? contentUnit : null,
      });
    } finally {
      setSaving(false);
    }
  };

  const onEnter = (e: React.KeyboardEvent) => {
    // Solo en los campos de texto: Enter en el selector de unidad elige la opción.
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
      void create();
    }
  };

  const inputClass =
    "w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/50";

  return (
    <Modal
      open
      onClose={() => { if (!saving) onClose(); }}
      title="Nuevo insumo"
      description="Lo que compras para preparar: no aparece en el punto de venta."
      size="sm"
      placement="sheet"
      initialFocusRef={nameRef}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void create()} loading={saving} loadingLabel="Creando…">
            {existing ? "Crear otro igual" : "Crear insumo"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4" onKeyDown={onEnter}>
        <div className="space-y-1.5">
          <label htmlFor="ingredient-name" className="text-[13px] font-semibold text-on-surface block">Nombre</label>
          <input
            id="ingredient-name"
            ref={nameRef}
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            placeholder="Ej. Leche, café en grano, vasos"
            className={inputClass}
          />
          {/* La región viva existe siempre: una que aparece ya con texto no se anuncia. */}
          <div aria-live="polite">
            {existing && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-on-surface">
                <p>
                  Ya tienes «{existing.name}» ({existingSummary(existing)}
                  {existing.status === "inactive" && ", archivado"}
                  {existing.is_ingredient !== true && ", producto de venta"}). ¿Es el mismo?
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Si es el mismo, úsalo: con dos insumos del mismo nombre el stock queda partido en dos.
                </p>
                <Button variant="secondary" size="sm" className="mt-2" onClick={useExisting} disabled={saving}>
                  Usar ese insumo
                </Button>
              </div>
            )}
          </div>
        </div>

        <Select
          label="¿En qué lo compras?"
          value={unit}
          onChange={(e) => changeUnit(e.target.value)}
          hint={UNIT_HINT[unit] ?? "La receta podrá usarlo en esta unidad o en una equivalente."}
        >
          {INGREDIENT_UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </Select>

        {countable && (
          <div className="space-y-1.5">
            <label htmlFor="ingredient-content-qty" className="text-[13px] font-semibold text-on-surface block">
              Cada {singular} trae <span className="font-normal text-on-surface-variant">(opcional)</span>
            </label>
            <div className="flex gap-2">
              <input
                id="ingredient-content-qty"
                inputMode="decimal"
                value={contentQty}
                onChange={(e) => { setContentQty(e.target.value); setError(null); }}
                placeholder="Ej. 900"
                className={`${inputClass} flex-1 min-w-0 tabular-nums`}
              />
              <Select
                aria-label="Unidad de lo que trae"
                containerClassName="w-28 shrink-0"
                value={contentUnit}
                onChange={(e) => setContentUnit(e.target.value)}
              >
                {MEASURE_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </Select>
            </div>
            <p className="text-xs text-on-surface-variant">
              Ej.: bolsa de leche 900 ml, bulto de harina 50 kg. Déjalo vacío si se usa de a uno (vasos, tapas).
            </p>
          </div>
        )}

        <div className={`grid gap-3 ${canSetCost ? "grid-cols-2" : "grid-cols-1"}`}>
          {canSetCost && (
            <div className="space-y-1.5">
              <label htmlFor="ingredient-cost" className="text-[13px] font-semibold text-on-surface block">
                Costo por {singular}
                {contentText && <span className="font-normal text-on-surface-variant"> ({one} de {contentText})</span>}
              </label>
              <MoneyInput id="ingredient-cost" value={cost} onChange={setCost} placeholder="0" aria-describedby="ingredient-cost-hint" />
              <p id="ingredient-cost-hint" className="text-xs text-on-surface-variant">Lo que pagas por cada {singular}{includeTax ? ", con IVA" : ""}.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="ingredient-stock" className="text-[13px] font-semibold text-on-surface block">
              {countable ? (FEMININE_UNITS.has(unit) ? "¿Cuántas tienes?" : "¿Cuántos tienes?") : "¿Cuánto tienes?"}{" "}
              <span className="font-normal text-on-surface-variant">(opcional)</span>
            </label>
            <div className="relative">
              <input
                id="ingredient-stock"
                inputMode="decimal"
                value={stock}
                onChange={(e) => { setStock(e.target.value); setError(null); }}
                placeholder="0"
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 pl-4 pr-14 text-base sm:text-sm text-on-surface tabular-nums focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/50"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">
                {unitLabel(unit, 2)}
              </span>
            </div>
          </div>
        </div>

        {summary && (
          <p className="rounded-xl bg-primary/5 border border-primary/15 px-4 py-3 text-xs text-on-surface">{summary}</p>
        )}

        {error && (
          <p role="alert" className="text-sm text-error bg-error-container/10 rounded-xl px-4 py-3 border border-error-container/20">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
