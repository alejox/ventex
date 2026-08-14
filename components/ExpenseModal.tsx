"use client";

import { useEffect, useState } from "react";
import { backdropProps } from "@/components/modal";
import { notifySuccess } from "@/lib/notifications";
import { useExpensesStore } from "@/stores/expenses.store";
import { todayISO } from "@/lib/date";

const inputClass =
  "w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all";

/**
 * Alta de un gasto, desde cualquier pantalla.
 *
 * Vive en `components/` y no dentro del Panel porque el gasto no pertenece a
 * una pantalla: se registra cuando ocurre, y quien lo registra puede estar
 * mirando el inventario o las ventas. El disparador está en el header del
 * dashboard (ver DashboardShell).
 *
 * NO se ofrece en el POS a propósito. La plata que sale del cajón durante un
 * turno se registra como RETIRO (`register_cash_withdrawal`), que es lo único
 * que descuenta del arqueo: `expected := opening_cash + cash_total -
 * withdrawal_total`. Un gasto no entra en esa cuenta, así que registrarlo desde
 * el mostrador dejaría el turno corto y el faltante se lo comería el cajero.
 * Además, escribir gastos es solo del dueño a nivel RLS.
 */
export function ExpenseModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  /** Se llama tras guardar, para que la pantalla de fondo refresque sus datos. */
  onSaved?: () => void;
}) {
  const categories = useExpensesStore((s) => s.categories);
  const fetchCategories = useExpensesStore((s) => s.fetchCategories);
  const create = useExpensesStore((s) => s.create);
  const saving = useExpensesStore((s) => s.saving);
  const error = useExpensesStore((s) => s.error);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayISO);
  const [categoryId, setCategoryId] = useState("");

  useEffect(() => {
    if (categories.length === 0) fetchCategories();
  }, [categories.length, fetchCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await create({
      description,
      amount: Number(amount),
      expense_date: expenseDate,
      // Vacío significa "Otros": el servicio resuelve la categoría por defecto.
      category_id: categoryId || undefined,
    });
    if (!ok) return;
    notifySuccess("Gasto registrado", "El movimiento quedó guardado correctamente.");
    onSaved?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      {...backdropProps(onClose)}
    >
      <div className="bg-surface-container rounded-3xl w-full max-w-md border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
          <h2 className="text-xl font-bold text-on-surface">Registrar gasto</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
            aria-label="Cerrar"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <p role="alert" className="rounded-xl bg-error/10 border border-error/20 px-4 py-3 text-sm text-error">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="expense-description" className="text-[13px] font-semibold text-on-surface block">
              Descripción
            </label>
            <input
              id="expense-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
              placeholder="Ej. Pago de internet"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="expense-amount" className="text-[13px] font-semibold text-on-surface block">
                Monto ($)
              </label>
              <input
                id="expense-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputClass}
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="expense-date" className="text-[13px] font-semibold text-on-surface block">
                Fecha
              </label>
              <input
                id="expense-date"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="expense-category" className="text-[13px] font-semibold text-on-surface block">
              Categoría
            </label>
            <select
              id="expense-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputClass}
            >
              <option value="">Otros</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-outline-variant/10">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Guardando…" : "Guardar gasto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
