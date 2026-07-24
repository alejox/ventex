"use client";

import { useState } from "react";
import { usePosStore } from "@/stores/pos.store";
import { cartLineKey as keyOf, linePrice } from "@/services/pos.service";
import { backdropProps } from "@/components/modal";

interface DiscountModalProps {
  onClose: () => void;
}

export function DiscountModal({ onClose }: DiscountModalProps) {
  const tabs = usePosStore((s) => s.tabs);
  const activeTabId = usePosStore((s) => s.activeTabId);
  const setLineDiscounts = usePosStore((s) => s.setLineDiscounts);
  const activeTab = tabs.find(t => t.id === activeTabId);
  
  const numItems = activeTab ? activeTab.cart.reduce((s, l) => s + l.quantity, 0) : 0;
  
  const [percentage, setPercentage] = useState("0");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(() => {
    if (!activeTab) return new Set();
    const withDiscount = activeTab.cart.filter(l => (l.discountAmount || 0) > 0);
    if (withDiscount.length > 0) {
      return new Set(withDiscount.map(keyOf));
    }
    return new Set(activeTab.cart.map(keyOf));
  });

  const handleApply = () => {
    const p = parseFloat(percentage);
    if (!Number.isNaN(p) && p >= 0 && activeTab) {
      const discounts = activeTab.cart.map(line => {
        if (selectedItems.has(keyOf(line))) {
          const discountAmount = (linePrice(line) * line.quantity * p) / 100;
          return { key: keyOf(line), discountAmount };
        }
        return { key: keyOf(line), discountAmount: line.discountAmount || 0 };
      });
      setLineDiscounts(discounts);
    }
    onClose();
  };

  const allSelected = (activeTab?.cart?.length ?? 0) > 0 && selectedItems.size === (activeTab?.cart?.length ?? 0);

  const toggleAll = () => {
    if (allSelected) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(activeTab?.cart.map(keyOf) || []));
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

  return (
    <div className="fixed inset-0 z-[200] flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in duration-200" {...backdropProps(onClose)}>
      <div
        className="bg-surface-container-lowest h-full w-[400px] max-w-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-outline-variant/10">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-xl font-bold text-on-surface">Descuentos globales</h2>
            <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <p className="text-sm text-on-surface-variant mb-2">
            Añade descuentos a todos los ítems de una venta de forma fácil y rápida.
          </p>
          <a href="#" className="text-sm text-primary hover:underline">Saber más</a>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <div className="space-y-1.5 mb-6">
            <label className="text-sm font-semibold text-on-surface">Porcentaje</label>
            <input
              type="number"
              min="0"
              max="100"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              className="w-full bg-transparent border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="bg-surface-container rounded-xl p-4 mb-4">
            <p className="text-sm text-on-surface">
              Los ítems marcados con ⚠️ ya tienen descuentos aplicados. Al añadir un descuento global, estos se reemplazarán.
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
            {activeTab?.cart.map(line => {
              const hasExistingDiscount = (line.discountAmount || 0) > 0;
              const isSelected = selectedItems.has(keyOf(line));
              const p = parseFloat(percentage);
              const newDiscountAmount = (!Number.isNaN(p) && p >= 0) ? (linePrice(line) * line.quantity * p) / 100 : 0;
              
              return (
                <label key={keyOf(line)} className="flex items-center justify-between p-3 hover:bg-surface-container-lowest cursor-pointer transition-colors rounded-lg">
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleItem(keyOf(line))}
                      className="w-5 h-5 accent-primary rounded border-outline-variant/30"
                    />
                    <div>
                      <p className="text-sm font-medium text-on-surface">{line.item.name}</p>
                      <p className="text-xs text-on-surface-variant">${(line.item.price * line.quantity).toLocaleString('es-CO')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    {hasExistingDiscount && !isSelected && (
                      <span title="Este ítem ya tiene descuento">⚠️</span>
                    )}
                    <div>
                      <p className="text-sm font-bold text-on-surface">${(line.item.price * line.quantity).toLocaleString('es-CO')}</p>
                      {isSelected && newDiscountAmount > 0 && (
                        <p className="text-xs font-medium text-error">-${newDiscountAmount.toLocaleString('es-CO')}</p>
                      )}
                      {!isSelected && hasExistingDiscount && (
                        <p className="text-xs font-medium text-error">-${(line.discountAmount!).toLocaleString('es-CO')}</p>
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
            className="w-full py-3 rounded-xl bg-primary text-white font-bold transition-colors hover:bg-primary-dim shadow-sm hover:shadow-[0_0_20px_rgba(96,99,238,0.35)]"
          >
            Aplicar descuento
          </button>
        </div>
      </div>
    </div>
  );
}
