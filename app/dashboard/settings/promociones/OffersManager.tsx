"use client";

import { useEffect, useMemo, useState } from "react";
import { useOffersStore } from "@/stores/offers.store";
import { useInventoryStore } from "@/stores/inventory.store";
import { useProfile } from "@/components/ProfileProvider";
import type { OfferInput, OfferKind, ProductOffer } from "@/services/offers.service";
import { CollectionError, CollectionLoading } from "@/components/CollectionState";
import { notifySuccess, notifyError } from "@/lib/notifications";
import { Select } from "@/components/ui/Select";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { MoneyFormatter } from "@/lib/money";
import { useFormatMoney } from "@/lib/useMoney";

type TargetType = "product" | "category";

interface FormState {
  name: string;
  kind: OfferKind;
  percentValue: string;
  amountValue: string;
  buyQty: string;
  payQty: string;
  targetType: TargetType;
  targetId: string;
  startsOn: string;
  endsOn: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  kind: "percent",
  percentValue: "",
  amountValue: "",
  buyQty: "",
  payQty: "",
  targetType: "product",
  targetId: "",
  startsOn: "",
  endsOn: "",
  active: true,
};

/** El texto que resume qué hace la oferta, para la lista. */
function describeOffer(offer: ProductOffer, formatMoney: MoneyFormatter): string {
  if (offer.kind === "percent") return `${offer.value ?? 0}% de descuento`;
  if (offer.kind === "amount") return `${formatMoney(offer.value ?? 0)} de descuento por unidad`;
  return `Lleva ${offer.buyQty ?? 0}, paga ${offer.payQty ?? 0}`;
}

/**
 * Configuración → Promociones → Ofertas (tienda).
 *
 * Reemplaza al contador de cortes para negocios de tipo `tienda`: acá el
 * dueño da de alta descuentos automáticos por producto o categoría, que el
 * POS aplica solo (T5). Sigue el mismo layout de tarjetas que la página de
 * salón para que Ajustes se sienta como una sola pantalla, no dos.
 */
export function OffersManager() {
  const money = useFormatMoney();
  const offers = useOffersStore((s) => s.offers);
  const loading = useOffersStore((s) => s.loading);
  const submitting = useOffersStore((s) => s.submitting);
  const error = useOffersStore((s) => s.error);
  const fetchOffers = useOffersStore((s) => s.fetchOffers);
  const addOffer = useOffersStore((s) => s.addOffer);
  const updateOffer = useOffersStore((s) => s.updateOffer);
  const setOfferActive = useOffersStore((s) => s.setOfferActive);
  const deleteOffer = useOffersStore((s) => s.deleteOffer);

  const products = useInventoryStore((s) => s.products);
  const categories = useInventoryStore((s) => s.categories);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);

  const profile = useProfile();
  // Mismo split que el resto de Ajustes y que promo_milestones en la base:
  // configurar es del dueño. Sin RLS de por medio del lado del cliente, un
  // worker que igual llegara a mandar el form se lo rechaza la base — esto
  // solo evita ofrecerle un formulario que va a fallar.
  const canEdit = !profile?.isWorker;

  useEffect(() => {
    fetchOffers();
    fetchInventory();
  }, [fetchOffers, fetchInventory]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const productOptions = useMemo(
    () => products.filter((p) => p.status === "active").sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );
  const categoryOptions = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const targetLabel = (offer: ProductOffer): string => {
    if (offer.productId) {
      return products.find((p) => p.id === offer.productId)?.name ?? "Producto eliminado";
    }
    return categories.find((c) => c.id === offer.categoryId)?.name ?? "Categoría eliminada";
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (offer: ProductOffer) => {
    setEditingId(offer.id);
    setForm({
      name: offer.name,
      kind: offer.kind,
      percentValue: offer.kind === "percent" ? String(offer.value ?? "") : "",
      amountValue: offer.kind === "amount" ? String(offer.value ?? "") : "",
      buyQty: offer.buyQty != null ? String(offer.buyQty) : "",
      payQty: offer.payQty != null ? String(offer.payQty) : "",
      targetType: offer.productId ? "product" : "category",
      targetId: offer.productId ?? offer.categoryId ?? "",
      startsOn: offer.startsOn ?? "",
      endsOn: offer.endsOn ?? "",
      active: offer.active,
    });
  };

  const buildInput = (): OfferInput | null => {
    const name = form.name.trim();
    if (!name) {
      notifyError("Falta el nombre", "Ponle un nombre a la oferta (es lo que ve el cajero).");
      return null;
    }
    if (!form.targetId) {
      notifyError("Falta el objetivo", "Elige a qué producto o categoría aplica.");
      return null;
    }
    if (form.startsOn && form.endsOn && form.endsOn < form.startsOn) {
      notifyError("Fechas inválidas", "La fecha de fin no puede ser anterior a la de inicio.");
      return null;
    }

    let value: number | null = null;
    let buyQty: number | null = null;
    let payQty: number | null = null;

    if (form.kind === "percent") {
      value = parseFloat(form.percentValue);
      if (!Number.isFinite(value) || value <= 0 || value > 100) {
        notifyError("Porcentaje inválido", "Tiene que ser un número mayor que 0 y hasta 100.");
        return null;
      }
    } else if (form.kind === "amount") {
      value = parseFloat(form.amountValue);
      if (!Number.isFinite(value) || value <= 0) {
        notifyError("Monto inválido", "Tiene que ser un número mayor que 0.");
        return null;
      }
    } else {
      buyQty = parseInt(form.buyQty, 10);
      payQty = parseInt(form.payQty, 10);
      if (!Number.isFinite(buyQty) || buyQty <= 0) {
        notifyError("Cantidad inválida", "\"Lleva\" tiene que ser un número entero mayor que 0.");
        return null;
      }
      if (!Number.isFinite(payQty) || payQty < 1 || payQty >= buyQty) {
        notifyError("Cantidad inválida", "\"Paga\" tiene que ser al menos 1 y menor que \"Lleva\".");
        return null;
      }
    }

    return {
      name,
      kind: form.kind,
      value,
      buyQty,
      payQty,
      productId: form.targetType === "product" ? form.targetId : null,
      categoryId: form.targetType === "category" ? form.targetId : null,
      startsOn: form.startsOn || null,
      endsOn: form.endsOn || null,
      active: form.active,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = buildInput();
    if (!input) return;

    const ok = editingId ? await updateOffer(editingId, input) : await addOffer(input);
    if (ok) {
      notifySuccess(editingId ? "Oferta actualizada" : "Oferta creada", input.name);
      resetForm();
    } else {
      notifyError("No se pudo guardar", useOffersStore.getState().error ?? "Intenta de nuevo.");
    }
  };

  const handleToggleActive = async (offer: ProductOffer) => {
    const ok = await setOfferActive(offer.id, !offer.active);
    if (!ok) {
      notifyError("No se pudo actualizar", useOffersStore.getState().error ?? "Intenta de nuevo.");
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const ok = await deleteOffer(deletingId);
    setDeletingId(null);
    if (ok) notifySuccess("Oferta eliminada");
    else notifyError("No se pudo eliminar", useOffersStore.getState().error ?? "Intenta de nuevo.");
  };

  if (loading) return <CollectionLoading label="Cargando ofertas…" />;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {error && <CollectionError message={error} onRetry={fetchOffers} />}

      {/* 1. La lista */}
      <section className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
        <h2 className="text-base font-bold text-on-surface">Ofertas de tienda</h2>
        <p className="text-sm text-on-surface-variant mt-1 mb-4">
          Se aplican solas en el Punto de Venta cuando el producto o la categoría coinciden.
          El cajero puede quitarlas para una venta puntual.
        </p>

        {offers.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Todavía no creaste ninguna oferta.</p>
        ) : (
          <ul className="divide-y divide-outline-variant/10 rounded-xl border border-outline-variant/15 overflow-hidden">
            {offers.map((offer) => (
              <li key={offer.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-on-surface truncate">{offer.name}</p>
                    {!offer.active && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide bg-outline-variant/20 text-on-surface-variant">
                        Pausada
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant truncate">
                    {describeOffer(offer, money)} · {targetLabel(offer)}
                    {(offer.startsOn || offer.endsOn) && (
                      <> · {offer.startsOn ?? "…"} → {offer.endsOn ?? "…"}</>
                    )}
                  </p>
                </div>
                {canEdit && (
                  <div className="shrink-0 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(offer)}
                      className="text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      {offer.active ? "Pausar" : "Activar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(offer)}
                      className="text-xs font-semibold text-primary hover:text-primary-dim transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(offer.id)}
                      className="text-xs font-semibold text-error-dim hover:text-error transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2. El formulario: solo el dueño lo ve */}
      {canEdit && (
        <section className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
          <h2 className="text-base font-bold text-on-surface">
            {editingId ? "Editar oferta" : "Nueva oferta"}
          </h2>
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div>
              <label htmlFor="offer-name" className="text-[13px] font-semibold text-on-surface block mb-1.5">
                Nombre
              </label>
              <input
                id="offer-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej. 10% en bebidas"
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/50"
              />
            </div>

            <Select
              label="Tipo de descuento"
              value={form.kind}
              onChange={(e) =>
                setForm((f) => ({ ...f, kind: e.target.value as OfferKind }))
              }
            >
              <option value="percent">Porcentaje</option>
              <option value="amount">Monto fijo</option>
              <option value="buy_n_pay_m">Lleva N, paga M</option>
            </Select>

            {form.kind === "percent" && (
              <div className="sm:w-40">
                <label htmlFor="offer-percent" className="text-[13px] font-semibold text-on-surface block mb-1.5">
                  Porcentaje
                </label>
                <input
                  id="offer-percent"
                  type="number"
                  min="1"
                  max="100"
                  step="0.1"
                  value={form.percentValue}
                  onChange={(e) => setForm((f) => ({ ...f, percentValue: e.target.value }))}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}

            {form.kind === "amount" && (
              <div className="sm:w-48">
                <label htmlFor="offer-amount" className="text-[13px] font-semibold text-on-surface block mb-1.5">
                  Monto por unidad
                </label>
                <MoneyInput
                  id="offer-amount"
                  value={form.amountValue}
                  onChange={(raw) => setForm((f) => ({ ...f, amountValue: raw }))}
                />
              </div>
            )}

            {form.kind === "buy_n_pay_m" && (
              <div className="flex gap-3">
                <div className="w-28">
                  <label htmlFor="offer-buy" className="text-[13px] font-semibold text-on-surface block mb-1.5">
                    Lleva
                  </label>
                  <input
                    id="offer-buy"
                    type="number"
                    min="2"
                    value={form.buyQty}
                    onChange={(e) => setForm((f) => ({ ...f, buyQty: e.target.value }))}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="w-28">
                  <label htmlFor="offer-pay" className="text-[13px] font-semibold text-on-surface block mb-1.5">
                    Paga
                  </label>
                  <input
                    id="offer-pay"
                    type="number"
                    min="1"
                    value={form.payQty}
                    onChange={(e) => setForm((f) => ({ ...f, payQty: e.target.value }))}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            )}

            <div>
              <p className="text-[13px] font-semibold text-on-surface mb-1.5">Aplica a</p>
              <div className="flex gap-2 mb-3">
                {(["product", "category"] as TargetType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, targetType: t, targetId: "" }))}
                    aria-pressed={form.targetType === t}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      form.targetType === t
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low"
                    }`}
                  >
                    {t === "product" ? "Un producto" : "Una categoría"}
                  </button>
                ))}
              </div>
              <Select
                searchable={form.targetType === "product"}
                value={form.targetId}
                onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}
                aria-label={form.targetType === "product" ? "Producto" : "Categoría"}
              >
                <option value="" disabled>
                  {form.targetType === "product" ? "Elige un producto…" : "Elige una categoría…"}
                </option>
                {(form.targetType === "product" ? productOptions : categoryOptions).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor="offer-starts" className="text-[13px] font-semibold text-on-surface block mb-1.5">
                  Desde (opcional)
                </label>
                <input
                  id="offer-starts"
                  type="date"
                  value={form.startsOn}
                  onChange={(e) => setForm((f) => ({ ...f, startsOn: e.target.value }))}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="offer-ends" className="text-[13px] font-semibold text-on-surface block mb-1.5">
                  Hasta (opcional)
                </label>
                <input
                  id="offer-ends"
                  type="date"
                  value={form.endsOn}
                  onChange={(e) => setForm((f) => ({ ...f, endsOn: e.target.value }))}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-on-surface-variant">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="rounded border-outline-variant/40"
              />
              Activa (se aplica en el POS de inmediato)
            </label>

            <div className="flex justify-end gap-3">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="px-8 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_20px_rgba(96,99,238,0.25)] transition-all disabled:opacity-50"
              >
                {submitting ? "Guardando…" : editingId ? "Guardar cambios" : "Crear oferta"}
              </button>
            </div>
          </form>
        </section>
      )}

      <ConfirmDialog
        open={deletingId !== null}
        title="¿Eliminar esta oferta?"
        description="Deja de aplicarse de inmediato en el Punto de Venta. No afecta ventas ya cobradas."
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
