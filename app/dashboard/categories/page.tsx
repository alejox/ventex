"use client";

import { useEffect, useState, useMemo } from "react";
import { IconPlus, IconSearch, IconTag } from "@/app/assets/icons/DashboardIcons";
import { useInventoryStore } from "@/stores/inventory.store";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { CollectionEmpty, CollectionFilteredEmpty, CollectionError, CollectionLoading } from "@/components/CollectionState";
import { notifySuccess } from "@/lib/notifications";
import type { Category, NewCategoryInput } from "@/services/inventory.service";
import { findDuplicateCategory } from "@/services/inventory.service";

function IconPencil(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function IconTrash(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

const EMPTY_CATEGORY: NewCategoryInput = {
  name: "",
  description: "",
};

export default function CategoriesPage() {
  const categories = useInventoryStore((s) => s.categories);
  const products = useInventoryStore((s) => s.products);
  const loading = useInventoryStore((s) => s.loading);
  const error = useInventoryStore((s) => s.error);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);
  const addCategory = useInventoryStore((s) => s.addCategory);
  const updateCategory = useInventoryStore((s) => s.updateCategory);
  const deleteCategory = useInventoryStore((s) => s.deleteCategory);

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<NewCategoryInput>(EMPTY_CATEGORY);
  const [saving, setSaving] = useState(false);
  /** Error del formulario, no de la lista: se muestra DENTRO del modal. */
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Contar productos por categoría
  const productCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) {
      if (p.category_id) {
        map[p.category_id] = (map[p.category_id] || 0) + 1;
      }
    }
    return map;
  }, [products]);

  // Filtrado por búsqueda
  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [categories, search]);

  const openCreateModal = () => {
    setEditId(null);
    setForm(EMPTY_CATEGORY);
    setModalOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditId(cat.id);
    setForm({
      name: cat.name,
      description: cat.description ?? "",
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditId(null);
    setForm(EMPTY_CATEGORY);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    // Se comprueba acá antes de salir a la red: la respuesta es instantánea y
    // el nombre repetido ni siquiera llega al servidor. El índice único de la
    // base sigue siendo el que manda —entre que se cargó esta lista y este
    // clic, otra persona del negocio pudo crear la misma categoría—, y ese caso
    // lo atrapa el `catch` de más abajo.
    const duplicada = findDuplicateCategory(categories, form.name, editId);
    if (duplicada) {
      setFormError(`Ya existe una categoría llamada "${duplicada.name}".`);
      return;
    }

    setFormError(null);
    setSaving(true);
    let success = false;
    if (editId) {
      success = await updateCategory(editId, form);
      if (success) {
        notifySuccess("Categoría actualizada", "Los cambios han sido guardados correctamente.");
      }
    } else {
      const res = await addCategory(form);
      success = Boolean(res);
      if (success) {
        notifySuccess("Categoría creada 🎉", "La nueva categoría ya está disponible para clasificar productos.");
      }
    }
    setSaving(false);

    if (success) {
      handleCloseModal();
      return;
    }
    // El modal se queda abierto con el nombre puesto para que la persona lo
    // corrija. Antes fallaba sin decir nada: el store guardaba el error pero
    // nadie lo mostraba, y un nombre repetido parecía no hacer absolutamente
    // nada. Por eso QA lo leyó como "no hay validación de unicidad".
    setFormError(useInventoryStore.getState().error ?? "No se pudo guardar la categoría.");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await deleteCategory(deleteTarget.id);
    setDeleting(false);

    if (ok) {
      notifySuccess("Categoría eliminada", `Se eliminó la categoría ${deleteTarget.name}.`);
      setDeleteTarget(null);
    }
  };

  const columns: DataColumn<Category>[] = [
    {
      header: "Categoría",
      mobile: "title",
      cell: (cat) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
            <IconTag className="w-5 h-5" />
          </div>
          <div>
            {/* Sin `uppercase` de CSS: el nombre se muestra COMO ESTÁ GUARDADO.
                Ese maquillaje era el que hacía que esta pantalla mostrara
                "ELECTRONICA" y el Inventario "Electronica" para la misma fila,
                y escondía que el dato estaba sin normalizar. Ahora se normaliza
                al guardar, así que no hay nada que disimular. */}
            <div className="font-semibold text-on-surface text-sm tracking-wide">
              {cat.name}
            </div>
            {cat.description ? (
              <div className="text-xs text-on-surface-variant line-clamp-1">
                {cat.description}
              </div>
            ) : (
              <div className="text-xs text-on-surface-variant/50 italic">
                Sin descripción
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      header: "Productos Asociados",
      mobile: "badge",
      cell: (cat) => {
        const count = productCountMap[cat.id] || 0;
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-surface-container-high border border-outline-variant/15 text-on-surface-variant">
            <span className="w-2 h-2 rounded-full bg-primary" />
            {count} {count === 1 ? "producto" : "productos"}
          </span>
        );
      },
    },
    {
      header: "Acciones",
      align: "right",
      mobile: "actions",
      cell: (cat) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => openEditModal(cat)}
            className="p-2 rounded-xl text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
            title="Editar categoría"
          >
            <IconPencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeleteTarget(cat)}
            className="p-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
            title="Eliminar categoría"
          >
            <IconTrash className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-on-surface tracking-tight flex items-center gap-3">
            <IconTag className="w-8 h-8 text-primary" />
            Categorías
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Organiza y administra las categorías de tu catálogo de productos.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-dim text-on-primary font-semibold text-sm shadow-[0_0_20px_rgba(96,99,238,0.25)] transition-all shrink-0"
        >
          <IconPlus className="w-4 h-4" />
          Nueva Categoría
        </button>
      </div>

      {/* Tarjeta principal con buscador y tabla */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
        {/* Buscador */}
        <div className="relative max-w-md">
          <IconSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o descripción..."
            className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl pl-10 pr-4 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
          />
        </div>

        {/* Estados de Carga / Error / Tabla */}
        {loading && categories.length === 0 ? (
          <CollectionLoading />
        ) : error && categories.length === 0 ? (
          <CollectionError message={error} onRetry={fetchInventory} />
        ) : filteredCategories.length === 0 ? (
          search ? (
            <CollectionFilteredEmpty
              title="Sin resultados"
              description={`No encontramos ninguna categoría que coincida con "${search}".`}
            />
          ) : (
            <CollectionEmpty
              icon={<IconTag className="w-8 h-8 text-on-surface-variant" />}
              title="No tienes categorías aún"
              description="Crea tu primera categoría para organizar los productos de tu inventario."
              action={{
                label: "Crear categoría",
                onClick: openCreateModal,
              }}
            />
          )
        ) : (
          <DataTable
            columns={columns}
            rows={filteredCategories}
            rowKey={(c) => c.id}
          />
        )}
      </div>

      {/* Modal de Crear / Editar */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
        >
          <div
            className="bg-surface-container-lowest rounded-[24px] w-full max-w-md border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 pb-3 flex justify-between items-center border-b border-outline-variant/10">
              <h2 className="text-lg font-bold text-on-surface">
                {editId ? "Editar Categoría" : "Nueva Categoría"}
              </h2>
              <button
                onClick={handleCloseModal}
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">
                  Nombre <span className="text-primary">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setFormError(null); }}
                  aria-invalid={!!formError}
                  aria-describedby={formError ? "category-name-error" : undefined}
                  className={`w-full bg-surface-container-low border rounded-xl py-2.5 px-3 text-sm text-on-surface uppercase focus:outline-none focus:ring-1 transition-all ${
                    formError
                      ? "border-error focus:border-error focus:ring-error"
                      : "border-outline-variant/20 focus:border-primary focus:ring-primary"
                  }`}
                  placeholder="Ej. CERAS, SHAMPOOS, BEBIDAS"
                />
                {formError && (
                  <p id="category-name-error" className="text-xs font-medium text-error">
                    {formError}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">
                  Descripción
                </label>
                <textarea
                  value={form.description || ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
                  placeholder="Descripción u observaciones sobre la categoría (opcional)"
                />
              </div>

              <div className="flex gap-3 pt-3 border-t border-outline-variant/10">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.name.trim()}
                  className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Guardando..." : editId ? "Actualizar" : "Guardar Categoría"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
        >
          <div
            className="bg-surface-container-lowest rounded-[24px] w-full max-w-sm border border-outline-variant/10 shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-error/10 text-error flex items-center justify-center mx-auto">
              <IconTrash className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-bold text-on-surface">
                ¿Eliminar categoría?
              </h3>
              <p className="text-xs text-on-surface-variant">
                Estás por eliminar la categoría <strong className="text-on-surface uppercase">{deleteTarget.name}</strong>.
              </p>
              {(productCountMap[deleteTarget.id] || 0) > 0 && (
                <div className="mt-2 p-3 rounded-xl bg-error-container/20 border border-error-container/30 text-xs text-error-dim text-left">
                  ⚠️ Hay <strong>{productCountMap[deleteTarget.id]}</strong> productos asignados a esta categoría. Al eliminarla, quedarán marcados como sin categoría.
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-error text-on-error hover:bg-error-dim transition-all shadow-md disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
