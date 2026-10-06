"use client";

import { useState } from "react";
import { usePosStore } from "@/stores/pos.store";
import {
  cartLineKey as keyOf,
  lineDiscountFor,
  linePrice,
  parseDiscountPercent,
  MAX_DISCOUNT_PERCENT,
} from "@/services/pos.service";
import { backdropProps } from "@/components/modal";
import { useFormatMoney } from "@/lib/useMoney";
import { useProfile } from "@/components/ProfileProvider";
import { can } from "@/lib/permissions";
import { distributeFixedDiscount, parseDiscountAmount } from "@/lib/pos-discount";

interface DiscountModalProps {
  onClose: () => void;
}

type DiscountMode = "percent" | "amount";

/**
 * Descuento manual sobre las líneas del carrito, en porcentaje o en pesos.
 *
 * El permiso `pos_discount` se revisa ACÁ y no en el POS: cualquiera con `pos`
 * podía regalar el 100 % de una venta. Un trabajador sin el permiso ve el
 * modal bloqueado con la explicación — esconder el botón sin decir por qué
 * deja al cajero buscándolo. El dueño y el administrador del negocio
 * (`isWorker === false`) siempre pueden. Es UX: el gate real está en
 * `create_sale`, que recibe esta parte como `p_manual_discount` y rechaza con
 * SIN_PERMISO_DESCUENTO (migración 20261006224422).
 */
export function DiscountModal({ onClose }: DiscountModalProps) {
  const profile = useProfile();
  const allowed = can(profile, "pos_discount");

  return (
    <div className="fixed inset-0 z-[200] flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in duration-200" {...backdropProps(onClose)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discount-modal-title"
        className="bg-surface-container-lowest h-full w-[400px] max-w-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-outline-variant/10">
          <div className="flex justify-between items-start mb-4">
            <h2 id="discount-modal-title" className="text-xl font-bold text-on-surface">Descuentos</h2>
            <button onClick={onClose} aria-label="Cerrar" className="text-on-surface-variant hover:text-on-surface">
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <p className="text-sm text-on-surface-variant">
            Rebaja el precio de los ítems que elijas, en porcentaje o en pesos.
          </p>
        </div>

        {allowed ? <DiscountForm onClose={onClose} /> : <DiscountLocked onClose={onClose} />}
      </div>
    </div>
  );
}

function DiscountLocked({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="p-6 flex-1">
        <div role="alert" className="rounded-xl border border-outline-variant/20 bg-surface-container p-4">
          <p className="text-sm font-semibold text-on-surface">
            No tienes permiso para aplicar descuentos.
          </p>
          <p className="text-sm text-on-surface-variant mt-1">
            Pídeselo al dueño: se activa en Personal → Permisos → &ldquo;Aplicar descuentos&rdquo;.
            Las ofertas y los premios automáticos siguen aplicándose solos.
          </p>
        </div>
      </div>
      <div className="p-6 border-t border-outline-variant/10">
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl border border-outline-variant/20 text-on-surface font-bold hover:bg-surface-container transition-colors"
        >
          Entendido
        </button>
      </div>
    </>
  );
}

function DiscountForm({ onClose }: { onClose: () => void }) {
  const fmtMoney = useFormatMoney();
  const tabs = usePosStore((s) => s.tabs);
  const activeTabId = usePosStore((s) => s.activeTabId);
  const setLineDiscounts = usePosStore((s) => s.setLineDiscounts);
  const activeTab = tabs.find(t => t.id === activeTabId);
  const cart = activeTab?.cart ?? [];

  const numItems = cart.reduce((s, l) => s + l.quantity, 0);

  const [mode, setMode] = useState<DiscountMode>("percent");
  const [percentage, setPercentage] = useState("0");
  const [amount, setAmount] = useState("0");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(() => {
    if (!activeTab) return new Set();
    const withDiscount = activeTab.cart.filter(l => (l.discountAmount || 0) > 0);
    if (withDiscount.length > 0) {
      return new Set(withDiscount.map(keyOf));
    }
    return new Set(activeTab.cart.map(keyOf));
  });

  const grossOf = (line: (typeof cart)[number]) => linePrice(line) * line.quantity;
  const selectedLines = cart.filter((l) => selectedItems.has(keyOf(l)));
  const selectedGross = selectedLines.reduce((s, l) => s + grossOf(l), 0);

  /** null = el valor tipeado no sirve. El botón se apaga y se explica por qué. */
  const validPercent = mode === "percent" ? parseDiscountPercent(percentage) : null;
  const validAmount = mode === "amount" ? parseDiscountAmount(amount, selectedGross) : null;
  const invalid = mode === "percent" ? validPercent === null : validAmount === null;

  /** Descuento nuevo por línea seleccionada, para la vista previa y para aplicar. */
  const newDiscountByKey = new Map<string, number>();
  if (mode === "percent" && validPercent !== null) {
    for (const l of selectedLines) newDiscountByKey.set(keyOf(l), lineDiscountFor(l, validPercent));
  } else if (mode === "amount" && validAmount !== null) {
    const shares = distributeFixedDiscount(selectedLines.map(grossOf), validAmount);
    selectedLines.forEach((l, i) => newDiscountByKey.set(keyOf(l), shares[i]));
  }

  const handleApply = () => {
    // Antes esto aceptaba cualquier número mayor a cero y, si no servía,
    // cerraba el panel igual: el cajero creía haber aplicado un descuento que
    // nunca se aplicó. Ahora un valor inválido no cierra nada.
    if (invalid || !activeTab) return;
    // Solo las líneas MARCADAS: antes se reescribían también las demás con su
    // mismo monto, y eso las convertía en "manuales" —borrándoles la oferta—
    // sin que el cajero las tocara. Con `create_sale` separando el descuento
    // manual (permiso `pos_discount`) eso además las declararía manuales.
    const discounts = activeTab.cart
      .filter((line) => selectedItems.has(keyOf(line)))
      .map((line) => {
        const key = keyOf(line);
        return { key, discountAmount: newDiscountByKey.get(key) ?? 0 };
      });
    setLineDiscounts(discounts, "manual");
    onClose();
  };

  const allSelected = cart.length > 0 && selectedItems.size === cart.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(cart.map(keyOf)));
    }
  };

  const toggleItem = (itemId: string) => {
    const next = new Set(selectedItems);
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    setSelectedItems(next);
  };

  const inputClass = `w-full bg-transparent border rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-1 ${
    invalid
      ? "border-error focus:border-error focus:ring-error"
      : "border-outline-variant/30 focus:border-primary focus:ring-primary"
  }`;

  return (
    <>
      <div className="p-6 flex-1 overflow-y-auto">
        <div role="radiogroup" aria-label="Tipo de descuento" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-surface-container p-1">
          {([
            ["percent", "Porcentaje (%)"],
            ["amount", "Monto ($)"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                mode === value ? "bg-primary text-white shadow-sm" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "percent" ? (
          <div className="space-y-1.5 mb-6">
            <label htmlFor="discount-percentage" className="text-sm font-semibold text-on-surface">
              Porcentaje
            </label>
            <input
              id="discount-percentage"
              type="number"
              min="0"
              max={MAX_DISCOUNT_PERCENT}
              step="0.01"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              aria-invalid={invalid}
              aria-describedby={invalid ? "discount-error" : undefined}
              className={inputClass}
            />
            {invalid && (
              <p id="discount-error" className="text-xs font-medium text-error">
                Ingresa un porcentaje entre 0 y {MAX_DISCOUNT_PERCENT}.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5 mb-6">
            <label htmlFor="discount-amount" className="text-sm font-semibold text-on-surface">
              Monto en pesos
            </label>
            <input
              id="discount-amount"
              type="number"
              min="0"
              max={selectedGross}
              step="1"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={invalid}
              aria-describedby={invalid ? "discount-error" : "discount-amount-help"}
              className={inputClass}
            />
            {invalid ? (
              <p id="discount-error" className="text-xs font-medium text-error">
                Ingresa un monto entre {fmtMoney(0)} y {fmtMoney(selectedGross)} (lo que suman los ítems marcados).
              </p>
            ) : (
              <p id="discount-amount-help" className="text-xs text-on-surface-variant">
                Se reparte entre los ítems marcados según lo que vale cada uno.
              </p>
            )}
          </div>
        )}

        <div className="bg-surface-container rounded-xl p-4 mb-4">
          <p className="text-sm text-on-surface">
            Los ítems marcados con ⚠️ ya tienen descuentos aplicados. Si los marcas, el descuento nuevo reemplaza al anterior.
          </p>
        </div>

        <div className="flex justify-between items-center py-4 border-t border-outline-variant/10 text-sm">
          <label className="flex items-center gap-3 cursor-pointer text-on-surface">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-5 h-5 accent-primary rounded border-outline-variant/30"
            />
            Seleccionar todo
          </label>
          <span className="text-on-surface-variant">{numItems} productos</span>
        </div>

        <div className="space-y-1">
          {cart.map(line => {
            const key = keyOf(line);
            const hasExistingDiscount = (line.discountAmount || 0) > 0;
            const isSelected = selectedItems.has(key);
            const newDiscountAmount = newDiscountByKey.get(key) ?? 0;
            const gross = grossOf(line);

            return (
              <label key={key} className="flex items-center justify-between p-3 hover:bg-surface-container-lowest cursor-pointer transition-colors rounded-lg">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleItem(key)}
                    className="w-5 h-5 accent-primary rounded border-outline-variant/30"
                  />
                  <div>
                    <p className="text-sm font-medium text-on-surface">{line.item.name}</p>
                    <p className="text-xs text-on-surface-variant">{fmtMoney(gross)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  {hasExistingDiscount && !isSelected && (
                    <span title="Este ítem ya tiene descuento">⚠️</span>
                  )}
                  <div>
                    <p className="text-sm font-bold text-on-surface">{fmtMoney(gross)}</p>
                    {isSelected && newDiscountAmount > 0 && (
                      <p className="text-xs font-medium text-error">-{fmtMoney(newDiscountAmount)}</p>
                    )}
                    {!isSelected && hasExistingDiscount && (
                      <p className="text-xs font-medium text-error">-{fmtMoney(line.discountAmount!)}</p>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="p-6 border-t border-outline-variant/10">
        <button
          onClick={handleApply}
          disabled={invalid}
          className="w-full py-3 rounded-xl bg-primary text-white font-bold transition-colors hover:bg-primary-dim shadow-sm hover:shadow-[0_0_20px_rgba(96,99,238,0.35)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary disabled:hover:shadow-sm"
        >
          Aplicar descuento
        </button>
      </div>
    </>
  );
}
