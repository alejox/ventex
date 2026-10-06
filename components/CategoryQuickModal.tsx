"use client";

import { useState } from "react";
import { useInventoryStore } from "@/stores/inventory.store";
import { notifySuccess } from "@/lib/notifications";
import { findDuplicateCategory } from "@/services/inventory.service";
import { Modal } from "@/components/ui/Modal";

interface CategoryQuickModalProps {
  onClose: () => void;
  /** Recibe la categoría recién creada para dejarla seleccionada en el formulario. */
  onCreated?: (categoryId: string) => void;
}

export function CategoryQuickModal({ onClose, onCreated }: CategoryQuickModalProps) {
  const addCategory = useInventoryStore((s) => s.addCategory);
  const categories = useInventoryStore((s) => s.categories);
  const storeError = useInventoryStore((s) => s.error);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  /** Duplicado detectado sin salir a la red. Tiene prioridad sobre el del store. */
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = localError ?? storeError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const duplicada = findDuplicateCategory(categories, name);
    if (duplicada) {
      setLocalError(`Ya existe una categoría llamada "${duplicada.name}".`);
      return;
    }
    setLocalError(null);

    const categoryId = await addCategory({ name, description });
    if (categoryId) {
      notifySuccess(
        "¡Categoría creada con éxito! 🎉",
        "La categoría ya está disponible para que clasifiques tus productos."
      );
      onCreated?.(categoryId);
      onClose();
    }
  };

  return (
    <Modal open onClose={onClose} title="Nueva Categoría" size="sm" bodyClassName="">
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {shownError && (
            <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
              {shownError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">Nombre *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl py-2.5 px-3 text-sm text-on-surface uppercase focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              placeholder="Ej. Pomadas, Shampoos, etc."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-on-surface block">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
              placeholder="Opcional"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Guardar Categoría
            </button>
          </div>
        </form>
    </Modal>
  );
}
