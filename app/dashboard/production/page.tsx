"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Plus } from "lucide-react";
import { useProfile } from "@/components/ProfileProvider";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { CollectionEmpty, CollectionLoading } from "@/components/CollectionState";
import { useInventoryStore } from "@/stores/inventory.store";
import { useServicesStore } from "@/stores/services.store";
import { useRecipesStore } from "@/stores/recipes.store";
import { useProductionStore } from "@/stores/production.store";
import { useSettingsStore } from "@/stores/settings.store";
import { can } from "@/lib/permissions";
import { useFormatMoney } from "@/lib/useMoney";
import { formatQty } from "@/lib/recipe-editor";
import type { IngredientInfo } from "@/lib/recipes";
import type { RecipeRowInput } from "@/lib/recipe-editor";
import { toIngredientInfo, toRecipeLines } from "@/services/recipes.service";
import type { ProductionBatch } from "@/services/production.service";
import { RegisterBatchModal, type PreparedOption } from "./components/RegisterBatchModal";
import { VoidBatchModal } from "./components/VoidBatchModal";
import { RecipeCostsTab } from "./components/RecipeCostsTab";
import { ProductionOnboarding } from "./components/ProductionOnboarding";

type Tab = "lotes" | "recetas";

const batchDate = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Producción: lo que se prepara por tandas (lotes) y el costo de cada receta.
 *
 * Dos preguntas, dos pestañas: "¿qué preparé y qué gasté?" (Lotes) y "¿cuánto
 * me cuesta hacer cada cosa y cuánto me queda?" (Recetas y costos). Las
 * recetas se ARMAN en la ficha de cada producto —donde ya está el precio—;
 * acá se miran todas juntas.
 */
export default function ProductionPage() {
  const profile = useProfile();
  const fmtMoney = useFormatMoney();
  const canSeeCosts = can(profile, "inventory_costs");
  const canRegister = can(profile, "production");

  const products = useInventoryStore((s) => s.products);
  const productsLoading = useInventoryStore((s) => s.loading);
  const fetchInventory = useInventoryStore((s) => s.fetchInventory);
  const services = useServicesStore((s) => s.services);
  const fetchServices = useServicesStore((s) => s.fetchServices);
  const recipes = useRecipesStore((s) => s.recipes);
  const recipesLoaded = useRecipesStore((s) => s.loaded);
  const fetchRecipes = useRecipesStore((s) => s.fetchRecipes);
  const batches = useProductionStore((s) => s.batches);
  const batchesLoading = useProductionStore((s) => s.loading);
  const fetchBatches = useProductionStore((s) => s.fetchBatches);
  const productionError = useProductionStore((s) => s.error);
  const settings = useSettingsStore((s) => s.settings);
  const ensureSettings = useSettingsStore((s) => s.ensureSettings);

  const [tab, setTab] = useState<Tab>("lotes");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [voiding, setVoiding] = useState<ProductionBatch | null>(null);

  useEffect(() => {
    void fetchInventory();
    void fetchServices();
    void fetchRecipes();
    void ensureSettings();
  }, [fetchInventory, fetchServices, fetchRecipes, ensureSettings]);

  useEffect(() => {
    void fetchBatches();
  }, [fetchBatches]);

  // Al registrar o anular cambia el stock de insumos y del preparado.
  const openRegister = () => setRegisterOpen(true);
  const closeRegister = () => {
    setRegisterOpen(false);
    void fetchInventory();
  };

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const ingredients = useMemo(() => {
    const map = new Map<string, IngredientInfo>();
    for (const p of products) map.set(p.id, toIngredientInfo(p));
    return map;
  }, [products]);

  const prepared: PreparedOption[] = useMemo(
    () =>
      recipes
        .filter((r) => r.kind === "production" && r.product_id && productById.has(r.product_id))
        .map((r) => {
          const p = productById.get(r.product_id as string)!;
          return { recipe: r, productId: p.id, name: p.name, unit: p.unit, stock: Number(p.stock_level) || 0 };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [recipes, productById],
  );

  const recipeRows: RecipeRowInput[] = useMemo(() => {
    const serviceById = new Map(services.map((s) => [s.id, s]));
    const rows: RecipeRowInput[] = [];
    for (const r of recipes) {
      if (r.items.length === 0) continue;
      if (r.product_id) {
        const p = productById.get(r.product_id);
        if (!p) continue;
        rows.push({
          id: r.id, kind: r.kind, targetId: p.id, targetKind: "product", name: p.name,
          price: Number(p.price) || 0, unit: p.unit, lines: toRecipeLines(r),
          yieldQty: r.yield_qty, yieldUnit: r.yield_unit,
        });
      } else if (r.service_id) {
        const s = serviceById.get(r.service_id);
        if (!s) continue;
        rows.push({
          id: r.id, kind: "sale", targetId: s.id, targetKind: "service", name: s.name,
          price: Number(s.price) || 0, unit: "Unidad", lines: toRecipeLines(r),
          yieldQty: null, yieldUnit: null,
        });
      }
    }
    return rows;
  }, [recipes, productById, services]);

  const nameOf = (productId: string) => productById.get(productId)?.name ?? "Preparado";

  const columns: DataColumn<ProductionBatch>[] = [
    {
      header: "Preparado",
      mobile: "title",
      cell: (b) => (
        <div className={b.status === "void" ? "opacity-60" : ""}>
          <p className="font-semibold text-on-surface">
            {nameOf(b.product_id)}
            {b.status === "void" && (
              <span className="ml-2 inline-flex items-center rounded-md border border-outline-variant/30 bg-surface-container-highest px-1.5 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
                Anulado
              </span>
            )}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Lote #{b.batch_number}
            {b.notes ? ` · ${b.notes}` : ""}
          </p>
        </div>
      ),
    },
    {
      header: "Cantidad",
      align: "right",
      mobile: "trailing",
      className: "tabular-nums",
      cell: (b) => (
        <div className={`text-right ${b.status === "void" ? "line-through opacity-60" : ""}`}>
          <p className="font-bold text-on-surface">+{formatQty(b.output_qty, b.output_unit)}</p>
          {b.batches !== null && (
            <p className="text-xs text-on-surface-variant">
              {b.batches.toLocaleString("es-CO")} {b.batches === 1 ? "tanda" : "tandas"}
            </p>
          )}
        </div>
      ),
    },
    ...(canSeeCosts
      ? [{
          header: "Costo",
          align: "right" as const,
          mobile: "field" as const,
          className: "tabular-nums",
          cell: (b: ProductionBatch) =>
            b.total_cost !== null && b.total_cost !== undefined ? (
              <span className="text-on-surface">
                {fmtMoney(b.total_cost)}
                {!b.cost_complete && <span className="text-on-surface-variant"> +</span>}
              </span>
            ) : (
              <span className="text-on-surface-variant">—</span>
            ),
        }]
      : []),
    {
      header: "Fecha",
      mobile: "subtitle",
      className: "text-on-surface-variant whitespace-nowrap",
      cell: (b) => batchDate(b.created_at),
    },
    ...(canRegister
      ? [{
          header: "",
          align: "right" as const,
          mobile: "actions" as const,
          interactive: true,
          cell: (b: ProductionBatch) =>
            b.status === "completed" ? (
              <button
                type="button"
                onClick={() => setVoiding(b)}
                className="px-3 py-1.5 rounded-lg border border-outline-variant/20 text-xs font-semibold text-on-surface hover:bg-surface-container-low hover:text-error transition-colors"
              >
                Anular
              </button>
            ) : (
              <span className="text-xs text-on-surface-variant" title={b.void_reason ?? undefined}>
                {b.void_reason ? `Motivo: ${b.void_reason}` : ""}
              </span>
            ),
        }]
      : []),
  ];

  const renderExpanded = (b: ProductionBatch) => (
    <div className="px-1 py-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Insumos que gastó</p>
      <ul className="grid gap-1.5 sm:grid-cols-2 text-sm">
        {b.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-3 rounded-lg bg-surface-container-lowest px-3 py-2">
            <span className="text-on-surface">{i.ingredient_name}</span>
            <span className="tabular-nums text-on-surface-variant">
              −{formatQty(i.quantity, i.unit)}
              {canSeeCosts && i.line_cost !== null && i.line_cost !== undefined ? ` · ${fmtMoney(i.line_cost)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  const hasIngredients = products.some((p) => p.is_ingredient);
  const loadingFirst = (productsLoading && products.length === 0) || !recipesLoaded;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">Producción</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Lo que preparas por tandas y cuánto te cuesta cada receta.
          </p>
        </div>
        {canRegister && (
          <Button onClick={openRegister} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
            Registrar lote
          </Button>
        )}
      </div>

      {!loadingFirst && (
        <ProductionOnboarding
          hasIngredients={hasIngredients}
          hasRecipes={recipeRows.length > 0}
          hasBatches={batches.length > 0}
          onRegisterBatch={openRegister}
        />
      )}

      <div
        role="tablist"
        aria-label="Secciones de producción"
        className="flex gap-1 p-1 rounded-xl bg-surface-container-lowest border border-outline-variant/15 w-fit"
      >
        {([
          { id: "lotes" as const, label: "Lotes" },
          { id: "recetas" as const, label: "Recetas y costos" },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`px-4 h-9 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              tab === t.id ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "lotes" ? (
          (batchesLoading && batches.length === 0) ? (
            <CollectionLoading label="Cargando lotes…" />
          ) : productionError && batches.length === 0 && !registerOpen && !voiding ? (
            <p role="alert" className="text-sm text-error bg-error-container/10 rounded-xl px-4 py-3 border border-error-container/20">
              {productionError}
            </p>
          ) : batches.length === 0 ? (
            <CollectionEmpty
              icon={<FlaskConical className="h-8 w-8" aria-hidden="true" />}
              title="Aún no registras lotes"
              description="Un lote es una tanda que preparas y dejas en stock. Ej.: con 10 L de agua, 200 ml de colorante y 2 kg de azúcar haces 12 L de líquido de granizado."
              action={canRegister ? { label: "Registrar el primero", onClick: openRegister } : undefined}
            />
          ) : (
            <DataTable
              columns={columns}
              rows={batches}
              rowKey={(b) => b.id}
              caption="Lotes de producción"
              renderExpanded={renderExpanded}
              pagination
              pageSize={20}
              searchable
              searchPlaceholder="Busca por preparado o nota…"
              getSearchText={(b) => `${nameOf(b.product_id)} ${b.notes ?? ""} ${b.batch_number}`}
            />
          )
        ) : loadingFirst ? (
          <CollectionLoading label="Cargando recetas…" />
        ) : (
          <RecipeCostsTab rows={recipeRows} ingredients={ingredients} canSeeCosts={canSeeCosts} />
        )}
      </div>

      {registerOpen && (
        <RegisterBatchModal
          options={prepared}
          ingredients={ingredients}
          allowOversell={settings?.allow_oversell ?? true}
          canSeeCosts={canSeeCosts}
          onClose={closeRegister}
        />
      )}

      {voiding && (
        <VoidBatchModal
          batch={voiding}
          productName={nameOf(voiding.product_id)}
          onClose={() => {
            setVoiding(null);
            void fetchInventory();
          }}
        />
      )}
    </div>
  );
}
