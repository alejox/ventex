"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { CollectionEmpty } from "@/components/CollectionState";
import { useFormatMoney } from "@/lib/useMoney";
import type { IngredientInfo } from "@/lib/recipes";
import {
  marginTone,
  recipeCostRows,
  sortRecipeRows,
  type RecipeRowInput,
  type RecipeSortKey,
} from "@/lib/recipe-editor";

const SORTS: { value: string; label: string; key: RecipeSortKey; dir: "asc" | "desc" }[] = [
  { value: "margin:asc", label: "Menor margen primero", key: "margin", dir: "asc" },
  { value: "margin:desc", label: "Mayor margen primero", key: "margin", dir: "desc" },
  { value: "cost:desc", label: "Más costosos primero", key: "cost", dir: "desc" },
  { value: "name:asc", label: "Nombre (A–Z)", key: "name", dir: "asc" },
];

const TONE_CLASS = {
  loss: "text-error",
  thin: "text-amber-600 dark:text-amber-400",
  healthy: "text-success",
  unknown: "text-on-surface-variant",
} as const;

/**
 * Todas las recetas con su costo y su margen, en una tabla. Arranca ordenada
 * por MENOR margen: lo primero que se ve es lo que conviene revisar (un precio
 * que quedó viejo, un insumo que subió). Sin permiso de costos, se ven las
 * recetas pero no la plata.
 */
export function RecipeCostsTab({
  rows,
  ingredients,
  canSeeCosts,
}: {
  rows: RecipeRowInput[];
  ingredients: ReadonlyMap<string, IngredientInfo>;
  canSeeCosts: boolean;
}) {
  const fmtMoney = useFormatMoney();
  const [sort, setSort] = useState(canSeeCosts ? "margin:asc" : "name:asc");
  const sortDef = SORTS.find((s) => s.value === sort) ?? SORTS[0];

  const costed = useMemo(() => recipeCostRows(rows, ingredients), [rows, ingredients]);
  const sorted = useMemo(() => sortRecipeRows(costed, sortDef.key, sortDef.dir), [costed, sortDef]);
  const incompleteCount = costed.filter((r) => r.incomplete).length;

  if (rows.length === 0) {
    return (
      <CollectionEmpty
        icon={<BookOpen className="h-8 w-8" aria-hidden="true" />}
        title="Aún no tienes recetas"
        description="Abre un producto o servicio, enciende “Receta” y agrega lo que gasta. Ej.: Latte → 20 g de café, 200 ml de leche, 1 vaso."
        action={{ label: "Ir a productos y servicios", href: "/dashboard/inventory" }}
      />
    );
  }

  const editHref = (r: RecipeRowInput) =>
    `/dashboard/inventory/product?${r.targetKind === "service" ? "serviceId" : "id"}=${r.targetId}&from=/dashboard/production`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant">
          {rows.length} {rows.length === 1 ? "receta" : "recetas"}
          {canSeeCosts && incompleteCount > 0 && (
            <> · <span className="text-amber-600 dark:text-amber-400 font-semibold">{incompleteCount} con insumos sin costo</span></>
          )}
        </p>
        <Select
          aria-label="Ordenar recetas"
          containerClassName="w-full sm:w-60"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {SORTS.filter((s) => canSeeCosts || s.key === "name").map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((r) => {
          const tone = marginTone(r.marginPct);
          return (
            <li key={r.id}>
              <Link
                href={editHref(r)}
                className="group flex h-full flex-col rounded-2xl border border-outline-variant/15 bg-surface-container p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-on-surface truncate group-hover:text-primary-ink">{r.name}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {r.kind === "production" ? "Se fabrica por lotes" : r.targetKind === "service" ? "Servicio" : "Se prepara al venderlo"}
                      {" · "}
                      {r.lines.length} {r.lines.length === 1 ? "insumo" : "insumos"}
                    </p>
                  </div>
                  {canSeeCosts && r.kind === "sale" && (
                    <p className={`text-2xl font-extrabold tabular-nums leading-none ${TONE_CLASS[tone]}`}>
                      {r.marginPct !== null ? `${r.marginPct.toLocaleString("es-CO")}%` : "—"}
                    </p>
                  )}
                </div>

                {canSeeCosts && (
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-on-surface-variant">{r.kind === "production" ? "Costo del lote" : "Costo"}</dt>
                      <dd className="font-semibold text-on-surface tabular-nums">
                        {fmtMoney(r.cost)}{r.incomplete ? " +" : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-on-surface-variant">{r.kind === "production" ? "Rinde" : "Precio"}</dt>
                      <dd className="font-semibold text-on-surface tabular-nums">
                        {r.kind === "production"
                          ? `${(r.yieldQty ?? 0).toLocaleString("es-CO")} ${r.yieldUnit ?? r.unit}`
                          : r.price > 0 ? fmtMoney(r.price) : "—"}
                      </dd>
                    </div>
                  </dl>
                )}

                {canSeeCosts && r.incomplete && (
                  <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                    Falta el costo de algún insumo: el real es mayor.
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
