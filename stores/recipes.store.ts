import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as service from "@/services/recipes.service";
import type { Recipe, SaveRecipeInput } from "@/services/recipes.service";

/**
 * Recetas del negocio (módulo "Recetas y producción"). Las pantallas leen
 * `recipes` y buscan la de un producto/servicio con `recipeForProduct` /
 * `recipeForService`; el costo y el margen se calculan con `lib/recipes.ts`
 * sobre los productos del store de inventario (que ya traen el costo si hay
 * permiso).
 */

export type SaveRecipeOutcome =
  | { ok: true; id: string | null }
  /**
   * `needsStockClear`: el producto tiene stock y pasar a receta lo deja en 0.
   * La pantalla pregunta y reintenta con `clearStock: true`. `error` ya trae el
   * mensaje traducido (incluye nombre y cantidad).
   */
  | { ok: false; needsStockClear: boolean; error: string };

interface RecipesState {
  recipes: Recipe[];
  loading: boolean;
  /** Ya se cargaron al menos una vez (evita parpadeo de "sin recetas"). */
  loaded: boolean;
  saving: boolean;
  error: string | null;

  fetchRecipes: () => Promise<void>;
  /** Crea, reemplaza o —con `items` vacío— borra; refresca la lista. */
  saveRecipe: (input: SaveRecipeInput) => Promise<SaveRecipeOutcome>;
  removeRecipe: (target: { productId?: string | null; serviceId?: string | null }) => Promise<boolean>;
  recipeForProduct: (productId: string) => Recipe | null;
  recipeForService: (serviceId: string) => Recipe | null;
  clearError: () => void;
}

export const useRecipesStore = create<RecipesState>((set, get) => ({
  recipes: [],
  loading: false,
  loaded: false,
  saving: false,
  error: null,

  fetchRecipes: async () => {
    set({ loading: true, error: null });
    try {
      const recipes = await service.fetchRecipes();
      set({ recipes, loading: false, loaded: true });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  saveRecipe: async (input) => {
    if (get().saving) return { ok: false, needsStockClear: false, error: "Ya se está guardando la receta." };
    set({ saving: true, error: null });
    try {
      const id = await service.saveRecipe(input);
      const recipes = await service.fetchRecipes();
      set({ recipes, saving: false, loaded: true });
      return { ok: true, id };
    } catch (e) {
      const error = toMessage(e);
      const needsStockClear = service.isRecipeWithStockError(e);
      // Pedir confirmación no es un error que haya que mostrar en rojo.
      set({ saving: false, error: needsStockClear ? null : error });
      return { ok: false, needsStockClear, error };
    }
  },

  removeRecipe: async (target) => {
    const kind = target.productId
      ? (get().recipeForProduct(target.productId)?.kind ?? "sale")
      : "sale";
    const outcome = await get().saveRecipe({ ...target, kind, items: [] });
    return outcome.ok;
  },

  recipeForProduct: (productId) => get().recipes.find((r) => r.product_id === productId) ?? null,
  recipeForService: (serviceId) => get().recipes.find((r) => r.service_id === serviceId) ?? null,

  clearError: () => set({ error: null }),
}));
