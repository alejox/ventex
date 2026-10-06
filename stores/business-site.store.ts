import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as siteService from "@/services/business-site.service";
import type {
  BusinessSite,
  BusinessHour,
  SiteInput,
} from "@/services/business-site.service";

/**
 * La página "principal": la primera publicada, o la más antigua. La usan los
 * atajos que apuntan a UNA sola (enlace del menú), no el editor.
 */
/** Reemplaza la sede con el mismo id, o la agrega si es nueva. */
function replaceSite(sites: BusinessSite[], saved: BusinessSite): BusinessSite[] {
  return sites.some((s) => s.id === saved.id)
    ? sites.map((s) => (s.id === saved.id ? saved : s))
    : [...sites, saved];
}

function primarySite(sites: BusinessSite[]): BusinessSite | null {
  return sites.find((s) => s.published) ?? sites[0] ?? null;
}

interface BusinessSiteState {
  sites: BusinessSite[];
  /** Derivada de `sites`: ver `primarySite`. */
  site: BusinessSite | null;
  hours: BusinessHour[];
  loading: boolean;
  /**
   * False until the first fetch settles. Lives here and not in the component so
   * the config screen can tell "no site configured yet" from "not asked yet"
   * without copying store state into local state inside an effect.
   */
  loaded: boolean;
  saving: boolean;
  uploading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  /** Devuelve la sede guardada (con su id si era nueva) o null si falló. */
  saveConfig: (
    siteId: string | null,
    input: SiteInput,
    hours: BusinessHour[],
  ) => Promise<BusinessSite | null>;
  setPublished: (siteId: string, published: boolean) => Promise<boolean>;
  deleteSite: (siteId: string) => Promise<boolean>;
  checkSlug: (slug: string, currentSlug?: string) => Promise<boolean>;
  uploadImage: (file: File) => Promise<string | null>;
}

export const useBusinessSiteStore = create<BusinessSiteState>((set, get) => ({
  sites: [],
  site: null,
  hours: siteService.defaultHours(),
  loading: false,
  loaded: false,
  saving: false,
  uploading: false,
  error: null,

  fetchConfig: async () => {
    set({ loading: true, error: null });
    try {
      const { sites, hours } = await siteService.fetchSiteConfig();
      set({ sites, site: primarySite(sites), hours, loading: false, loaded: true });
    } catch (e) {
      set({ error: toMessage(e), loading: false, loaded: true });
    }
  },

  /**
   * Site row and opening hours are saved together because that is how the owner
   * edits them — one screen, one "Guardar". Hours go second: if they fail, the
   * site row is already stored and a retry is not destructive.
   */
  saveConfig: async (siteId, input, hours) => {
    set({ saving: true, error: null });
    try {
      const saved = await siteService.saveSite(input, siteId);
      await siteService.saveHours(hours);
      const sites = replaceSite(get().sites, saved);
      set({ sites, site: primarySite(sites), hours, saving: false });
      return saved;
    } catch (e) {
      set({ error: toMessage(e), saving: false });
      return null;
    }
  },

  setPublished: async (siteId, published) => {
    set({ saving: true, error: null });
    try {
      const saved = await siteService.setSitePublished(siteId, published);
      const sites = replaceSite(get().sites, saved);
      set({ sites, site: primarySite(sites), saving: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), saving: false });
      return false;
    }
  },

  deleteSite: async (siteId) => {
    set({ saving: true, error: null });
    try {
      await siteService.deleteSite(siteId);
      const sites = get().sites.filter((s) => s.id !== siteId);
      set({ sites, site: primarySite(sites), saving: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), saving: false });
      return false;
    }
  },

  checkSlug: async (slug, currentSlug) => {
    try {
      return await siteService.isSlugAvailable(slug, currentSlug);
    } catch (e) {
      set({ error: toMessage(e) });
      return false;
    }
  },

  uploadImage: async (file) => {
    set({ uploading: true, error: null });
    try {
      const url = await siteService.uploadSiteImage(file);
      set({ uploading: false });
      return url;
    } catch (e) {
      set({ uploading: false, error: toMessage(e) });
      return null;
    }
  },
}));
