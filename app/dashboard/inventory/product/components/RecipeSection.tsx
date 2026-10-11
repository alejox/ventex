"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, FlaskConical, Plus, Sparkles, Trash2, TriangleAlert, UtensilsCrossed } from "lucide-react";
import { Switch } from "@/components/ui/Switch";
import { Select } from "@/components/ui/Select";
import { IconButton } from "@/components/ui/Button";
import { useFormatMoney } from "@/lib/useMoney";
import {
  compatibleUnits,
  consumedQty,
  contentLabel,
  losesPrecision,
  productUnitFactor,
  type UnitHolder,
} from "@/lib/units";
import { productionUnitCost, recipeCost, recipeMargin, type IngredientInfo, type RecipeKind } from "@/lib/recipes";
import {
  candidateLabel,
  costShares,
  defaultLineUnit,
  editorLineIssues,
  editorToLines,
  formatQty,
  ingredientCandidates,
  marginTone,
  parseQty,
  unitLabel,
  type CandidateProduct,
  type EditorLine,
} from "@/lib/recipe-editor";
import { toIngredientInfo } from "@/services/recipes.service";
import { IngredientQuickModal, type CreatedIngredient } from "./IngredientQuickModal";

type RecipeProduct = CandidateProduct & {
  purchase_price?: number | null;
  units_per_package?: number | null;
  allows_fractions?: boolean | null;
  stock_level: number;
};

export interface RecipeDraft {
  enabled: boolean;
  kind: RecipeKind;
  lines: EditorLine[];
  yieldQty: string;
  yieldUnit: string;
}

/**
 * Los productos del catálogo como insumos para costear (`recipeCost`) y
 * planificar. Lo usan el editor y la ficha (para el "Costo según receta"), así
 * que vive acá una sola vez: si cambia cómo se lee un insumo, cambia para los dos.
 */
export function buildIngredientsMap(products: readonly RecipeProduct[]): Map<string, IngredientInfo> {
  const map = new Map<string, IngredientInfo>();
  for (const p of products) {
    map.set(p.id, toIngredientInfo({ ...p, unit: p.unit, tracks_stock: p.tracks_stock ?? true }));
  }
  return map;
}

interface RecipeSectionProps {
  /** De qué es la receta: un servicio solo puede tener receta de venta. */
  target: "product" | "service";
  /** El producto que se edita (se excluye de sus propios insumos). */
  selfId: string | null;
  /**
   * El producto que se edita como destino de conversión: su unidad y, si la
   * declara, su presentación ("cada unidad trae 1 L"). Decide en qué unidades
   * puede rendir un lote: una botella de jarabe de 1 L puede rendir "12 L".
   */
  product: UnitHolder;
  /** Precio de venta final, para el margen. */
  price: number;
  draft: RecipeDraft;
  onChange: (next: RecipeDraft) => void;
  products: readonly RecipeProduct[];
  /** Productos con receta de VENTA (no sirven de insumo: no llevan stock propio). */
  saleRecipeProductIds: ReadonlySet<string>;
  canSeeCosts: boolean;
  /** La receta ya guardada tiene stock propio que se llevará a 0 (aviso previo). */
  ownStockToClear: number | null;
  /** Errores al guardar (ya traducidos). */
  error?: string | null;
  /**
   * "Solo insumo": no se vende, así que solo puede FABRICARSE por lotes (el
   * líquido de granizado, la masa). La opción "al venderlo" no aplica.
   */
  onlyProduction?: boolean;
}

const SEGMENT_TONES = ["bg-primary", "bg-primary/70", "bg-primary/50", "bg-primary/35", "bg-primary/20"];

let lineSeq = 0;
export function newEditorLine(partial: Partial<EditorLine> = {}): EditorLine {
  lineSeq += 1;
  return { key: `l${Date.now()}-${lineSeq}`, ingredientId: "", qty: "", unit: "", ...partial };
}

/** "unidad" / "caja" / "kg": la unidad de stock como palabra, en singular. */
function stockUnitWord(unit: string): string {
  return unit === "Unidad" ? "unidad" : unitLabel(unit, 1);
}

/** "unidades" / "cajas" / "kg": la misma palabra, en plural. */
function stockUnitWords(unit: string): string {
  return unit === "Unidad" ? "unidades" : unitLabel(unit, 2);
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return value.toLocaleString("es-CO", { maximumFractionDigits });
}

/**
 * Editor de receta de la ficha del producto o servicio.
 *
 * Una receta responde UNA pregunta: "¿qué gasto cuando hago esto?". Por eso la
 * pantalla se lee como una lista de compras ("20 g de Café · 200 ml de Leche")
 * y, al lado, la ficha de costo: cuánto sale hacerlo y cuánto queda.
 *
 * La unidad se propone sola (g para lo que se compra por kg, ml para lo que se
 * compra por litro, ml para una bolsa que declara "trae 900 ml") y solo se
 * ofrecen las que se pueden convertir: es imposible armar "1 Caja de leche"
 * contra un insumo en litros.
 *
 * Va DENTRO de la tarjeta del formulario, después del precio y antes de la
 * presentación: la receta es lo que explica el costo, así que se lee pegada a él.
 */
export function RecipeSection({
  target,
  selfId,
  product,
  price,
  draft,
  onChange,
  products,
  saleRecipeProductIds,
  canSeeCosts,
  ownStockToClear,
  error,
  onlyProduction = false,
}: RecipeSectionProps) {
  const fmtMoney = useFormatMoney();
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const ingredientsMap = useMemo(() => buildIngredientsMap(products), [products]);

  const usedIds = useMemo(() => new Set(draft.lines.map((l) => l.ingredientId).filter(Boolean)), [draft.lines]);
  const candidates = useMemo(
    () => ingredientCandidates(products, { selfId, saleRecipeProductIds, keepIds: usedIds }),
    [products, selfId, saleRecipeProductIds, usedIds],
  );
  const hasAnyIngredient = candidates.some((c) => c.is_ingredient);

  const lines = editorToLines(draft.lines);
  const issues = editorLineIssues(draft.lines);
  const cost = recipeCost(lines, ingredientsMap);
  const costByIngredient = new Map(cost.lines.map((l) => [l.ingredientId, l]));
  const isProduction = target === "product" && draft.kind === "production";

  const yieldValue = parseQty(draft.yieldQty);
  const yieldUnits = compatibleUnits(product);
  // Si la unidad guardada dejó de convertirse (cambió la unidad o el contenido
  // del producto), se cae a la del producto: es lo mismo que manda la ficha.
  const yieldUnit = yieldUnits.includes(draft.yieldUnit) ? draft.yieldUnit : product.unit;
  const unitCost = isProduction && yieldValue
    ? productionUnitCost(cost.total, yieldValue, yieldUnit, product)
    : null;
  const margin = !isProduction ? recipeMargin(price, cost.total) : null;
  const tone = marginTone(margin?.pct ?? null);
  const shares = costShares(cost.lines);

  const set = (patch: Partial<RecipeDraft>) => onChange({ ...draft, ...patch });
  const setLine = (key: string, patch: Partial<EditorLine>) =>
    set({ lines: draft.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  const removeLine = (key: string) => set({ lines: draft.lines.filter((l) => l.key !== key) });
  const moveLine = (index: number, delta: -1 | 1) => {
    const next = [...draft.lines];
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    set({ lines: next });
  };
  const addLine = () => set({ lines: [...draft.lines, newEditorLine()] });
  const pickIngredient = (key: string, ingredientId: string) => {
    const ing = productById.get(ingredientId);
    setLine(key, { ingredientId, unit: ing ? defaultLineUnit(ing) : "" });
  };

  const onCreated = (created: CreatedIngredient) => {
    // El insumo recién creado todavía no está en `products` de este render,
    // así que la unidad se propone desde lo que devolvió el modal (incluido su
    // contenido: una bolsa de 900 ml arranca en ml).
    const unit = defaultLineUnit(created);
    const targetKey = creatingFor;
    setCreatingFor(null);
    // Reemplaza la línea vacía desde la que se abrió, o agrega una nueva.
    const existing = draft.lines.find((l) => l.key === targetKey && !l.ingredientId);
    if (existing) {
      set({ lines: draft.lines.map((l) => (l.key === existing.key ? { ...l, ingredientId: created.id, unit } : l)) });
    } else {
      set({ lines: [...draft.lines, newEditorLine({ ingredientId: created.id, unit })] });
    }
  };

  const noun = target === "service" ? "servicio" : "producto";

  return (
    <section
      aria-labelledby="recipe-title"
      className="border-t border-outline-variant/10 pt-6 space-y-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-ink">
            <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id="recipe-title" className="text-base font-bold text-on-surface">
              {onlyProduction ? "¿Lo preparas tú?" : "Receta"}
            </h3>
            <p id="recipe-help" className="text-xs text-on-surface-variant mt-1">
              {target === "service"
                ? "Lo que gasta cada vez que lo haces. Ej.: un tinte usa 60 ml de tinte y 30 ml de oxidante."
                : onlyProduction
                  ? "Si lo haces por tandas (líquido de granizado, masa), anota sus insumos y cuánto rinde. Cada tanda la registras en Producción."
                  : !draft.enabled
                    ? "Enciéndela si este producto se hace con insumos: un latte gasta café y leche, un granizado gasta líquido y un vaso."
                    : draft.kind === "production"
                      ? "Lo preparas por tandas y queda en stock. Cada tanda descuenta los insumos de abajo y suma lo que rinde."
                      : "Cada venta descuenta los insumos de abajo. El producto no lleva stock propio."}
            </p>
          </div>
        </div>
        <Switch
          aria-label={onlyProduction ? "Lo preparo por tandas" : `Este ${noun} usa insumos`}
          checked={draft.enabled}
          onCheckedChange={(on) =>
            set({ enabled: on, lines: on && draft.lines.length === 0 ? [newEditorLine()] : draft.lines })
          }
        />
      </div>

      {draft.enabled && (
        <>
          {target === "product" && (
            <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <legend className="sr-only">¿Cuándo se gastan los insumos?</legend>
              {([
                {
                  kind: "sale" as const,
                  title: "Se prepara al venderlo",
                  body: "Cada venta descuenta sus insumos. Ej.: un latte gasta 20 g de café y 200 ml de leche.",
                  icon: <Sparkles className="h-4 w-4" aria-hidden="true" />,
                },
                {
                  kind: "production" as const,
                  title: "Se fabrica por lotes",
                  body: "Preparas una tanda que queda en stock. Ej.: 12 L de líquido de granizado.",
                  icon: <FlaskConical className="h-4 w-4" aria-hidden="true" />,
                },
              ]).filter((opt) => !onlyProduction || opt.kind === "production").map((opt) => {
                const active = draft.kind === opt.kind;
                return (
                  <label
                    key={opt.kind}
                    className={`relative flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-primary ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-outline-variant/25 hover:bg-surface-container-low"
                    }`}
                  >
                    <input
                      type="radio"
                      name="recipe-kind"
                      value={opt.kind}
                      checked={active}
                      onChange={() => set({ kind: opt.kind, yieldUnit: draft.yieldUnit || product.unit })}
                      className="sr-only"
                    />
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${active ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"}`}>
                      {opt.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-on-surface">{opt.title}</span>
                      <span className="block text-xs text-on-surface-variant mt-0.5">{opt.body}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}

          {isProduction && (
            <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-surface-container-low/60 border border-outline-variant/15 p-4">
              <div className="space-y-1.5">
                <label htmlFor="recipe-yield" className="text-[13px] font-semibold text-on-surface block">
                  Cada lote rinde
                </label>
                <input
                  id="recipe-yield"
                  inputMode="decimal"
                  value={draft.yieldQty}
                  onChange={(e) => set({ yieldQty: e.target.value })}
                  placeholder="Ej. 12"
                  aria-invalid={draft.yieldQty.trim() !== "" && yieldValue === null}
                  className="w-32 bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-3 px-4 text-base sm:text-sm text-on-surface tabular-nums focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {yieldUnits.length > 1 ? (
                <Select
                  aria-label="Unidad del rendimiento"
                  containerClassName="w-28"
                  value={yieldUnit}
                  onChange={(e) => set({ yieldUnit: e.target.value })}
                >
                  {yieldUnits.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </Select>
              ) : (
                <span className="pb-3 text-sm text-on-surface-variant">{unitLabel(product.unit, 2)}</span>
              )}
              <p className="text-xs text-on-surface-variant basis-full">
                Las cantidades de abajo son las de UN lote. Al registrar un lote en Producción
                eliges cuántas tandas hiciste.
              </p>
            </div>
          )}

          {!hasAnyIngredient && draft.lines.every((l) => !l.ingredientId) && (
            <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 sm:p-5">
              <p className="text-sm font-semibold text-on-surface">Primero, tus insumos</p>
              <p className="text-sm text-on-surface-variant mt-1">
                Un insumo es lo que compras para preparar: café, leche, vasos, harina. Créalo aquí
                mismo y sigue armando la receta.
              </p>
              <p className="mt-3 text-xs text-on-surface-variant">
                Ejemplo · <span className="font-semibold text-on-surface">Latte</span>: 20 g de café · 200 ml de leche · 1 vaso
              </p>
            </div>
          )}

          <ol className="space-y-2" aria-label="Insumos de la receta">
            {draft.lines.map((line, index) => {
              const ing = line.ingredientId ? productById.get(line.ingredientId) : undefined;
              const issue = issues[index];
              const qty = parseQty(line.qty);
              const lineCost = line.ingredientId ? costByIngredient.get(line.ingredientId) : undefined;
              const lineUnit = line.unit || ing?.unit || "";
              const precision = ing && qty ? losesPrecision(qty, lineUnit, ing) : false;
              const units = ing ? compatibleUnits(ing) : [];
              const qtyId = `recipe-qty-${line.key}`;
              return (
                <li
                  key={line.key}
                  className="rounded-2xl border border-outline-variant/15 bg-surface-container-lowest p-3 sm:p-3.5"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:gap-3">
                    <Select
                      aria-label={`Insumo ${index + 1}`}
                      searchable
                      searchPlaceholder="Busca un insumo…"
                      value={line.ingredientId}
                      onChange={(e) => {
                        if (e.target.value === "__new__") {
                          setCreatingFor(line.key);
                          return;
                        }
                        pickIngredient(line.key, e.target.value);
                      }}
                      error={issue === "duplicate" ? "Ya está en la receta: suma la cantidad en la otra línea." : undefined}
                    >
                      <option value="">Elige un insumo</option>
                      {candidates.map((c) => (
                        <option
                          key={c.id}
                          value={c.id}
                          disabled={usedIds.has(c.id) && c.id !== line.ingredientId}
                        >
                          {candidateLabel(c)}
                        </option>
                      ))}
                      <option value="__new__">+ Crear insumo nuevo…</option>
                    </Select>

                    <div className="flex items-center gap-1 sm:order-last">
                      <IconButton
                        aria-label="Subir"
                        size="sm"
                        icon={<ArrowUp className="h-4 w-4" />}
                        onClick={() => moveLine(index, -1)}
                        disabled={index === 0}
                        className="hidden sm:inline-flex"
                      />
                      <IconButton
                        aria-label="Bajar"
                        size="sm"
                        icon={<ArrowDown className="h-4 w-4" />}
                        onClick={() => moveLine(index, 1)}
                        disabled={index === draft.lines.length - 1}
                        className="hidden sm:inline-flex"
                      />
                      <IconButton
                        aria-label={ing ? `Quitar ${ing.name}` : "Quitar línea"}
                        icon={<Trash2 className="h-4 w-4" />}
                        onClick={() => removeLine(line.key)}
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
                      <label htmlFor={qtyId} className="sr-only">Cantidad</label>
                      <input
                        id={qtyId}
                        inputMode="decimal"
                        value={line.qty}
                        disabled={!ing}
                        onChange={(e) => setLine(line.key, { qty: e.target.value })}
                        placeholder={ing ? (lineUnit === "g" || lineUnit === "ml" ? "Ej. 20" : "Ej. 1") : "—"}
                        aria-invalid={issue === "missing-qty" && line.qty.trim() !== ""}
                        className="w-24 bg-surface-container-lowest border border-outline-variant/30 rounded-xl h-11 px-3 text-base sm:text-sm text-right text-on-surface tabular-nums focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                      />
                      {units.length > 1 ? (
                        <Select
                          aria-label="Unidad"
                          containerClassName="w-24"
                          value={lineUnit}
                          onChange={(e) => setLine(line.key, { unit: e.target.value })}
                        >
                          {units.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </Select>
                      ) : (
                        <span className="w-24 text-sm text-on-surface-variant pl-1">
                          {ing ? unitLabel(ing.unit, qty ?? 2) : ""}
                        </span>
                      )}
                      {canSeeCosts && lineCost && qty && (
                        <span className="ml-auto sm:ml-2 text-sm tabular-nums text-on-surface-variant whitespace-nowrap">
                          {lineCost.missingCost ? "sin costo" : fmtMoney(lineCost.cost)}
                        </span>
                      )}
                    </div>
                  </div>

                  {(precision || (canSeeCosts && lineCost?.missingCost && qty)) && (
                    <div className="mt-2 space-y-1 text-xs">
                      {precision && ing && qty && (
                        <p className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                          <TriangleAlert className="h-3.5 w-3.5 mt-px shrink-0" aria-hidden="true" />
                          <PrecisionNote ing={ing} qty={qty} lineUnit={lineUnit} />
                        </p>
                      )}
                      {canSeeCosts && lineCost?.missingCost && qty && ing && (
                        <p className="text-on-surface-variant">
                          {ing.name} no tiene costo.{" "}
                          <Link
                            href={`/dashboard/inventory/product?id=${ing.id}`}
                            className="font-semibold text-primary-ink underline-offset-2 hover:underline"
                          >
                            Ponle costo
                          </Link>{" "}
                          para ver cuánto te sale.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-outline-variant/50 px-4 h-10 text-sm font-semibold text-on-surface hover:border-primary hover:text-primary-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Agregar insumo
            </button>
            <button
              type="button"
              onClick={() => setCreatingFor("new")}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 h-10 text-sm font-semibold text-primary-ink hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Crear insumo nuevo
            </button>
          </div>

          {canSeeCosts && lines.length > 0 && (
            <CostSheet
              isProduction={isProduction}
              total={cost.total}
              incomplete={cost.incomplete}
              shares={shares}
              price={price}
              margin={margin}
              tone={tone}
              unitCost={unitCost}
              productUnit={product.unit}
              fmtMoney={fmtMoney}
            />
          )}

          {target === "product" && draft.kind === "sale" && ownStockToClear !== null && ownStockToClear !== 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-on-surface">
              <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              Este producto tiene {ownStockToClear} en stock. Con receta, su stock pasa a 0 y se descuenta de los
              insumos. Te lo vamos a confirmar al guardar.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-error bg-error-container/10 rounded-xl px-4 py-3 border border-error-container/20">
              {error}
            </p>
          )}
        </>
      )}

      {creatingFor && (
        <IngredientQuickModal
          canSetCost={canSeeCosts}
          onClose={() => setCreatingFor(null)}
          onCreated={onCreated}
        />
      )}
    </section>
  );
}

/**
 * Aviso de que el redondeo del stock (3 decimales) deforma la cantidad de la
 * línea. Dos lecturas distintas:
 *
 * - Insumo CON contenido (bolsa de 900 ml gastada en 5 ml): no hay unidad mejor
 *   en la que llevar bolsas, así que se muestra en qué queda y a cuánto
 *   equivale, para que la persona decida si le importa.
 * - Insumo sin contenido (0,5 g de algo guardado en kg): la salida es guardar
 *   el insumo en la unidad chica, y se dice cuál.
 */
function PrecisionNote({ ing, qty, lineUnit }: { ing: RecipeProduct; qty: number; lineUnit: string }) {
  const withContent = contentLabel(ing) !== null;
  if (withContent) {
    const consumed = consumedQty(qty, lineUnit, ing) ?? 0;
    const factor = productUnitFactor(lineUnit, ing);
    const equivalent = factor ? consumed / factor : null;
    const lineUnitText = unitLabel(lineUnit, qty);
    return (
      <span>
        Se descuenta por milésimas de {stockUnitWord(ing.unit)}: {formatNumber(qty, 3)} {lineUnitText} quedan en{" "}
        {formatQty(consumed, ing.unit)}
        {equivalent !== null && ` (≈ ${formatNumber(equivalent)} ${lineUnitText})`}. Si cambia mucho, pon la
        cantidad en {stockUnitWords(ing.unit)}.
      </span>
    );
  }
  return (
    <span>
      El stock de {ing.name} se lleva en {ing.unit} con 3 decimales y esta cantidad se redondea. Si lo
      manejas en {defaultLineUnit(ing)}, el descuento es exacto.
    </span>
  );
}

function CostSheet({
  isProduction,
  total,
  incomplete,
  shares,
  price,
  margin,
  tone,
  unitCost,
  productUnit,
  fmtMoney,
}: {
  isProduction: boolean;
  total: number;
  incomplete: boolean;
  shares: { ingredientId: string; name: string; cost: number; pct: number }[];
  price: number;
  margin: { profit: number; pct: number | null } | null;
  tone: ReturnType<typeof marginTone>;
  unitCost: number | null;
  productUnit: string;
  fmtMoney: (n: number) => string;
}) {
  const toneClass = {
    loss: "text-error",
    thin: "text-amber-600 dark:text-amber-400",
    healthy: "text-success",
    unknown: "text-on-surface-variant",
  }[tone];
  const toneNote = {
    loss: "Pierdes plata en cada venta",
    thin: "Margen fino: la receta no incluye mano de obra ni arriendo",
    healthy: "Buen margen",
    unknown: "Pon un precio de venta para ver el margen",
  }[tone];

  return (
    <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/60 p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        {isProduction ? "Costo del lote" : "Lo que te cuesta hacerlo"}
      </p>

      {shares.length > 0 && (
        <div className="mt-3">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-container-highest" aria-hidden="true">
            {shares.map((s, i) => (
              <span
                key={s.ingredientId}
                className={`${SEGMENT_TONES[Math.min(i, SEGMENT_TONES.length - 1)]} h-full first:rounded-l-full last:rounded-r-full`}
                style={{ width: `${s.pct}%` }}
              />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
            {shares.map((s, i) => (
              <li key={s.ingredientId} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${SEGMENT_TONES[Math.min(i, SEGMENT_TONES.length - 1)]}`} aria-hidden="true" />
                {s.name} · {Math.round(s.pct)}%
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <dt className="text-xs text-on-surface-variant">{isProduction ? "Costo de un lote" : "Costo"}</dt>
          <dd className="text-xl font-bold text-on-surface tabular-nums">
            {fmtMoney(total)}{incomplete && <span className="text-on-surface-variant text-sm font-semibold"> +</span>}
          </dd>
        </div>
        {isProduction ? (
          <div>
            <dt className="text-xs text-on-surface-variant">Costo por {unitLabel(productUnit, 1) === "u." ? "unidad" : productUnit}</dt>
            <dd className="text-xl font-bold text-on-surface tabular-nums">
              {unitCost !== null ? fmtMoney(unitCost) : "—"}
            </dd>
          </div>
        ) : (
          <>
            <div>
              <dt className="text-xs text-on-surface-variant">Precio</dt>
              <dd className="text-xl font-bold text-on-surface tabular-nums">{price > 0 ? fmtMoney(price) : "—"}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs text-on-surface-variant">Margen</dt>
              <dd className={`text-3xl font-extrabold tabular-nums leading-tight ${toneClass}`}>
                {margin?.pct !== null && margin?.pct !== undefined ? `${margin.pct.toLocaleString("es-CO")}%` : "—"}
              </dd>
              <dd className="text-xs text-on-surface-variant">
                {margin && margin.pct !== null ? `${fmtMoney(margin.profit)} por venta · ` : ""}{toneNote}
              </dd>
            </div>
          </>
        )}
      </dl>

      {incomplete && (
        <p className="mt-3 text-xs text-on-surface-variant">
          Algún insumo no tiene costo: el costo real es mayor que el que ves.
        </p>
      )}
    </div>
  );
}
