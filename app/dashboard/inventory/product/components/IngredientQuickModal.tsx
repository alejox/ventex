"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useInventoryStore } from "@/stores/inventory.store";
import { notifySuccess } from "@/lib/notifications";
import { parseQty, unitLabel } from "@/lib/recipe-editor";

/** Unidades en que se compra un insumo, en el orden en que se eligen más seguido. */
const INGREDIENT_UNITS = ["kg", "g", "L", "ml", "Unidad", "lb", "m", "cm", "Caja", "Pack", "Docena", "Par"];

const UNIT_HINT: Record<string, string> = {
  kg: "Ej. café en grano, harina, queso",
  g: "Ej. especias, levadura, colorante en polvo",
  L: "Ej. leche, agua, aceite",
  ml: "Ej. esencias, colorante líquido, tinte",
  Unidad: "Ej. vasos, tapas, cajas de pizza",
};

interface IngredientQuickModalProps {
  /** Nombre sugerido (lo que la persona ya escribió en el buscador, si algo). */
  initialName?: string;
  /** Si la persona puede cargar costos (sin el permiso, el campo no se muestra). */
  canSetCost: boolean;
  onClose: () => void;
  /** Recibe el id del insumo creado para agregarlo directo a la receta. */
  onCreated: (productId: string, unit: string) => void;
}

/**
 * Alta rápida de un insumo SIN salir de la ficha del producto: lo mínimo para
 * poder usarlo en la receta (nombre, unidad en que se compra, costo y cuánto
 * hay). El resto —proveedor, código, mínimo— se completa después en su ficha.
 *
 * Sin `<form>`: este modal se abre DENTRO del formulario del producto (el
 * `<dialog>` no se portalea) y un formulario anidado es HTML inválido. Enter
 * en un campo crea igual.
 */
export function IngredientQuickModal({ initialName = "", canSetCost, onClose, onCreated }: IngredientQuickModalProps) {
  const addProduct = useInventoryStore((s) => s.addProduct);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState("kg");
  const [cost, setCost] = useState("");
  const [stock, setStock] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const stockValue = stock.trim() === "" ? 0 : parseQty(stock);

  const create = async () => {
    if (saving) return;
    if (!name.trim()) {
      setError("Escribe el nombre del insumo.");
      nameRef.current?.focus();
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
      notifySuccess("Insumo creado", `${name.trim()} ya está en la receta.`);
      onCreated(id, unit);
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
            Crear insumo
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
            placeholder="Ej. Café en grano"
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/50"
          />
        </div>

        <Select
          label="¿En qué unidad lo compras?"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          hint={UNIT_HINT[unit] ?? "La receta podrá usarlo en esta unidad o en una equivalente."}
        >
          {INGREDIENT_UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </Select>

        <div className={`grid gap-3 ${canSetCost ? "grid-cols-2" : "grid-cols-1"}`}>
          {canSetCost && (
            <div className="space-y-1.5">
              <label htmlFor="ingredient-cost" className="text-[13px] font-semibold text-on-surface block">
                Costo por {unitLabel(unit, 1) === "u." ? "unidad" : unit}{" "}
                <span className="font-normal text-on-surface-variant">(opcional)</span>
              </label>
              <MoneyInput id="ingredient-cost" value={cost} onChange={setCost} placeholder="0" />
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="ingredient-stock" className="text-[13px] font-semibold text-on-surface block">
              ¿Cuánto tienes? <span className="font-normal text-on-surface-variant">(opcional)</span>
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

        {error && (
          <p role="alert" className="text-sm text-error bg-error-container/10 rounded-xl px-4 py-3 border border-error-container/20">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
