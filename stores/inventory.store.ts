import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as inventoryService from "@/services/inventory.service";
import type {
  Product,
  Category,
  DistributorBrief,
  NewProductInput,
  NewCategoryInput,
} from "@/services/inventory.service";

interface InventoryState {
  products: Product[];
  categories: Category[];
  distributors: DistributorBrief[];
  loading: boolean;
  error: string | null;
  fetchInventory: () => Promise<void>;
  /**
   * Devuelve el id del producto si fue creado correctamente, o false.
   * Si se pasa `imageFile`, se sube primero a Storage y su URL pública se guarda
   * como `image_url`.
   */
  addProduct: (input: NewProductInput, imageFile?: File | null) => Promise<string | false>;
  updateProduct: (id: string, input: NewProductInput, imageFile?: File | null) => Promise<boolean>;
  /** Devuelve el id de la categoría creada para poder seleccionarla, o false. */
  addCategory: (input: NewCategoryInput) => Promise<string | false>;
  updateCategory: (id: string, input: NewCategoryInput) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<boolean>;
  archiveProduct: (id: string) => Promise<boolean>;
  activateProduct: (id: string) => Promise<boolean>;
  resetParentStock: (parentId: string) => Promise<boolean>;
}


export const useInventoryStore = create<InventoryState>((set) => ({
  products: [],
  categories: [],
  distributors: [],
  loading: false,
  error: null,

  fetchInventory: async () => {
    set({ loading: true, error: null });
    try {
      const [categories, products, distributors] = await Promise.all([
        inventoryService.fetchCategories(),
        inventoryService.fetchProducts(),
        inventoryService.fetchDistributors(),
      ]);
      set({ categories, products, distributors, loading: false });
    } catch (e) {
      set({ error: toMessage(e), loading: false });
    }
  },

  addProduct: async (input, imageFile) => {
    try {
      const image_url = imageFile
        ? await inventoryService.uploadProductImage(imageFile)
        : input.image_url;
      const product = await inventoryService.createProduct({ ...input, image_url });
      set((s) => ({ products: [product, ...s.products] }));
      return product.id;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  updateProduct: async (id, input, imageFile) => {
    try {
      const image_url = imageFile
        ? await inventoryService.uploadProductImage(imageFile)
        : input.image_url;
      const product = await inventoryService.updateProduct(id, { ...input, image_url });
      set((s) => ({ products: s.products.map((p) => (p.id === id ? product : p)) }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  addCategory: async (input) => {
    try {
      const category = await inventoryService.createCategory(input);
      set((s) => ({ categories: [...s.categories, category] }));
      return category.id;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  updateCategory: async (id, input) => {
    try {
      const category = await inventoryService.updateCategory(id, input);
      set((s) => ({
        categories: s.categories.map((c) => (c.id === id ? category : c)),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  deleteCategory: async (id) => {
    try {
      await inventoryService.deleteCategory(id);
      set((s) => ({
        categories: s.categories.filter((c) => c.id !== id),
        products: s.products.map((p) => (p.category_id === id ? { ...p, category_id: null } : p)),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  archiveProduct: async (id) => {
    try {
      await inventoryService.archiveProduct(id);
      set((s) => ({
        products: s.products.map((p) =>
          p.id === id ? { ...p, status: "inactive" } : p
        ),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  activateProduct: async (id) => {
    try {
      await inventoryService.activateProduct(id);
      set((s) => ({
        products: s.products.map((p) =>
          p.id === id ? { ...p, status: "active" } : p
        ),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  resetParentStock: async (parentId: string) => {
    try {
      await inventoryService.resetParentStock(parentId);
      set((s) => ({
        products: s.products.map((p) => (p.id === parentId ? { ...p, stock_level: 0 } : p)),
      }));
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },
}));
