import { create } from "zustand";
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
  addCategory: (input: NewCategoryInput) => Promise<boolean>;
}

const toMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error inesperado";

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
      return true;
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },
}));
