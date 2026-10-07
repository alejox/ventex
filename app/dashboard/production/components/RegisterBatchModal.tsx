"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FlaskConical, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useProductionStore } from "@/stores/production.store";
import { useFormatMoney } from "@/lib/useMoney";
import { notifySuccess } from "@/lib/notifications";
import { batchPlan, productionUnitCost, recipeCost, type IngredientInfo } from "@/lib/recipes";
import { formatQty, parseQty, unitLabel } from "@/lib/recipe-editor";
import { convertQty, roundStock } from "@/lib/units";
import { toRecipeLines, type Recipe } from "@/services/recipes.service";

export interface PreparedOption {
  recipe: Recipe;
  productId: string;
  name: string;
  unit: string;
  stock: number;
}

interface RegisterBatchModalProps {
  options: PreparedOption[];
  ingredients: ReadonlyMap<string, IngredientInfo>;
  /** `settings.allow_oversell`: sin sobreventa, un insumo que no alcanza bloquea el lote. */
  allowOversell: boolean;
  canSeeCosts: boolean;
  /** Preparado elegido al abrir (p. ej. desde la tabla de recetas). */
  initialProductId?: string;
  onClose: () => void;
}

type Mode = "batches" | "output";

const BATCH_CHIPS = ["0,5", "1", "2", "3"];

/**
 * Registrar un lote: "hice 2 tandas de líquido de granizado".
 *
 * Todo lo que va a pasar se ve ANTES de confirmar, calculado igual que la base
 * (`batchPlan`): cuánto entra del preparado, cuánto sale de cada insumo y con
 * cuánto queda cada uno. Un insumo que queda en negativo se marca en rojo; si
 * el negocio no permite vender sin stock, el botón se apaga y se explica por
 * qué (la base lo rechazaría igual).
 */
export function RegisterBatchModal({
  options,
  ingredients,
  allowOversell,
  canSeeCosts,
  initialProductId,
  onClose,
}: RegisterBatchModalProps) {
  const fmtMoney = useFormatMoney();
  const registerBatch = useProductionStore((s) => s.registerBatch);
  const registering = useProductionStore((s) => s.registering);
  const storeError = useProductionStore((s) => s.error);
  const resetAttempt = useProductionStore((s) => s.resetAttempt);
  const clearError = useProductionStore((s) => s.clearError);

  const [productId, setProductId] = useState(initialProductId ?? (options.length === 1 ? options[0].productId : ""));
  const [mode, setMode] = useState<Mode>("batches");
  const [amount, setAmount] = useState("1");
  const [notes, setNotes] = useState("");

  const option = options.find((o) => o.productId === productId) ?? null;
  const value = parseQty(amount);

  // Cambiar QUÉ se registra es un intento nuevo: el id de reintento anterior
  // ya no corresponde (ver `resetAttempt` en el store).
  const change = (fn: () => void) => {
    fn();
    resetAttempt();
    clearError();
  };

  const plan = useMemo(() => {
    if (!option || value === null) return null;
    const recipe = {
      lines: toRecipeLines(option.recipe),
      yieldQty: option.recipe.yield_qty ?? 0,
      yieldUnit: option.recipe.yield_unit ?? option.unit,
    };
    return batchPlan(
      recipe,
      option.unit,
      mode === "batches" ? { batches: value } : { outputQty: value },
      ingredients,
    );
  }, [option, value, mode, ingredients]);

  const cost = useMemo(() => {
    if (!option || !plan || !canSeeCosts) return null;
    const perBatch = recipeCost(toRecipeLines(option.recipe), ingredients);
    const total = perBatch.total * plan.batches;
    const perUnit = productionUnitCost(
      perBatch.total,
      option.recipe.yield_qty ?? 0,
      option.recipe.yield_unit ?? option.unit,
      option.unit,
    );
    return { total, perUnit, incomplete: perBatch.incomplete };
  }, [option, plan, canSeeCosts, ingredients]);

  const blocked = !!plan?.anyNegative && !allowOversell;
  const canSubmit = !!option && !!plan && !blocked && !registering;

  const submit = async () => {
    if (!option || !plan || blocked) return;
    const result = await registerBatch({
      productId: option.productId,
      ...(mode === "batches" ? { batches: plan.batches } : { outputQty: plan.outputQty }),
      notes: notes.trim() || undefined,
    });
    if (!result) return;
    const made = `+${formatQty(result.output_qty, result.output_unit || option.unit)} de ${option.name}`;
    const negatives = result.negative_inputs.length
      ? ` Quedaron en negativo: ${result.negative_inputs.map((n) => n.name).join(", ")}.`
      : "";
    notifySuccess(
      result.already_registered ? `El lote #${result.batch_number} ya estaba registrado` : `Lote #${result.batch_number} registrado`,
      `${made}.${negatives}`,
    );
    onClose();
  };

  return (
    <Modal
      open
      onClose={() => { if (!registering) onClose(); }}
      title="Registrar lote"
      description="Lo que preparaste: se descuentan los insumos y entra el preparado al stock."
      icon={<FlaskConical className="h-5 w-5 text-primary-ink" aria-hidden="true" />}
      size="lg"
      placement="sheet"
      footer={
        options.length > 0 ? (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={registering}>Cancelar</Button>
            <Button onClick={() => void submit()} disabled={!canSubmit} loading={registering} loadingLabel="Registrando…">
              Registrar lote
            </Button>
          </div>
        ) : undefined
      }
    >
      {options.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-5">
          <p className="text-sm font-semibold text-on-surface">Todavía no tienes nada que se fabrique por lotes</p>
          <ol className="mt-3 space-y-2 text-sm text-on-surface-variant list-decimal pl-5">
            <li>Crea el preparado como producto (ej. “Líquido de granizado”, en L).</li>
            <li>En su ficha, enciende <span className="font-semibold text-on-surface">Receta</span> y elige <span className="font-semibold text-on-surface">Se fabrica por lotes</span>.</li>
            <li>Agrega sus insumos y cuánto rinde un lote (ej. 12 L).</li>
          </ol>
          <Link
            href="/dashboard/inventory/product?from=/dashboard/production"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 h-10 text-sm font-semibold text-on-primary hover:bg-primary-dim"
          >
            Crear el preparado <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          <Select
            label="¿Qué preparaste?"
            searchable={options.length > 6}
            searchPlaceholder="Busca un preparado…"
            value={productId}
            onChange={(e) => change(() => setProductId(e.target.value))}
          >
            <option value="">Elige un preparado</option>
            {options.map((o) => (
              <option key={o.productId} value={o.productId}>
                {o.name} · rinde {formatQty(o.recipe.yield_qty ?? 0, o.recipe.yield_unit ?? o.unit)} por lote
              </option>
            ))}
          </Select>

          {option && (
            <div className="space-y-3">
              <div
                role="radiogroup"
                aria-label="Cómo indicar la cantidad"
                className="inline-flex gap-1 p-1 rounded-xl bg-surface-container-lowest border border-outline-variant/15"
              >
                {([
                  { id: "batches" as const, label: "Por tandas" },
                  { id: "output" as const, label: `Por cantidad (${option.unit})` },
                ]).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.id}
                    onClick={() =>
                      change(() => {
                        setMode(m.id);
                        setAmount(
                          m.id === "batches"
                            ? "1"
                            : String(
                                roundStock(
                                  convertQty(option.recipe.yield_qty ?? 0, option.recipe.yield_unit ?? option.unit, option.unit) ?? 0,
                                ),
                              ).replace(".", ","),
                        );
                      })
                    }
                    className={`px-3 h-9 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      mode === m.id ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <label htmlFor="batch-amount" className="sr-only">
                    {mode === "batches" ? "Tandas" : `Cantidad producida en ${option.unit}`}
                  </label>
                  <input
                    id="batch-amount"
                    data-autofocus
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => change(() => setAmount(e.target.value))}
                    aria-invalid={amount.trim() !== "" && value === null}
                    className="w-40 bg-surface-container-lowest border border-outline-variant/30 rounded-xl h-12 pl-4 pr-20 text-lg font-semibold text-on-surface tabular-nums focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">
                    {mode === "batches" ? (value === 1 ? "tanda" : "tandas") : unitLabel(option.unit, value ?? 2)}
                  </span>
                </div>
                {mode === "batches" && (
                  <div className="flex gap-1.5" role="group" aria-label="Tandas frecuentes">
                    {BATCH_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        aria-pressed={amount === chip}
                        onClick={() => change(() => setAmount(chip))}
                        className={`h-9 min-w-9 px-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                          amount === chip
                            ? "border-primary bg-primary/10 text-primary-ink"
                            : "border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {option && plan && (
            <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/60 overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 sm:px-5 py-4 border-b border-outline-variant/10">
                <p className="text-sm text-on-surface-variant">
                  Vas a obtener{" "}
                  <span className="text-2xl font-extrabold text-on-surface tabular-nums align-middle">
                    {formatQty(plan.outputQty, option.unit)}
                  </span>{" "}
                  de {option.name}
                </p>
                <p className="text-xs text-on-surface-variant tabular-nums">
                  Stock: {formatQty(option.stock, option.unit)} → {formatQty(option.stock + plan.outputQty, option.unit)}
                </p>
              </div>

              <table className="w-full text-sm">
                <caption className="sr-only">Insumos que se descuentan</caption>
                <thead>
                  <tr className="text-xs text-on-surface-variant">
                    <th scope="col" className="text-left font-semibold px-4 sm:px-5 pt-3 pb-1">Insumo</th>
                    <th scope="col" className="text-right font-semibold px-2 pt-3 pb-1">Se gasta</th>
                    <th scope="col" className="text-right font-semibold px-4 sm:px-5 pt-3 pb-1">Te queda</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.lines.map((l) => (
                    <tr key={l.ingredientId} className="border-t border-outline-variant/10">
                      <td className="px-4 sm:px-5 py-2.5 font-medium text-on-surface">{l.name}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-on-surface-variant whitespace-nowrap">
                        −{formatQty(l.qty, l.unit)}
                      </td>
                      <td className={`px-4 sm:px-5 py-2.5 text-right tabular-nums whitespace-nowrap font-semibold ${l.goesNegative ? "text-error" : "text-on-surface"}`}>
                        {l.stockAfter === null ? (
                          <span className="font-normal text-on-surface-variant">sin inventario</span>
                        ) : (
                          <>
                            <span className="font-normal text-on-surface-variant">{formatQty(l.stockBefore, l.unit)} → </span>
                            {formatQty(l.stockAfter, l.unit)}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {cost && (
                <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 sm:px-5 py-3 border-t border-outline-variant/10 text-sm">
                  <span className="text-on-surface-variant">
                    Costo del lote{" "}
                    <span className="font-semibold text-on-surface tabular-nums">
                      {fmtMoney(cost.total)}{cost.incomplete ? " +" : ""}
                    </span>
                  </span>
                  {cost.perUnit !== null && (
                    <span className="text-on-surface-variant">
                      Por {unitLabel(option.unit, 1) === "u." ? "unidad" : option.unit}{" "}
                      <span className="font-semibold text-on-surface tabular-nums">{fmtMoney(cost.perUnit)}</span>
                    </span>
                  )}
                  {cost.incomplete && (
                    <span className="basis-full text-xs text-on-surface-variant">
                      Algún insumo no tiene costo: el costo del preparado no se actualizará con este lote.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {plan?.anyNegative && (
            <p
              role={blocked ? "alert" : undefined}
              className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm border ${
                blocked
                  ? "border-error/25 bg-error/10 text-error"
                  : "border-amber-500/30 bg-amber-500/10 text-on-surface"
              }`}
            >
              <TriangleAlert className={`h-4 w-4 mt-0.5 shrink-0 ${blocked ? "" : "text-amber-600 dark:text-amber-400"}`} aria-hidden="true" />
              {blocked
                ? "No alcanzan los insumos marcados en rojo y tu negocio no permite quedar en negativo. Registra la compra o ajusta su stock antes de registrar el lote."
                : "Los insumos en rojo quedarán en negativo. Puedes registrar el lote igual; repónlos cuando compres."}
            </p>
          )}

          {option && value === null && amount.trim() !== "" && (
            <p className="text-sm text-error">Escribe una cantidad mayor que cero.</p>
          )}

          {option && (
            <div className="space-y-1.5">
              <label htmlFor="batch-notes" className="text-[13px] font-semibold text-on-surface block">
                Nota <span className="font-normal text-on-surface-variant">(opcional)</span>
              </label>
              <input
                id="batch-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Turno de la mañana, sabor fresa"
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/50"
              />
            </div>
          )}

          {storeError && (
            <p role="alert" className="text-sm text-error bg-error-container/10 rounded-xl px-4 py-3 border border-error-container/20">
              {storeError}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
