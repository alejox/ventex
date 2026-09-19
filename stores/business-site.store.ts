import { create } from "zustand";
import { toMessage } from "@/lib/errors";
import * as siteService from "@/services/business-site.service";
import type {
  BusinessSite,
  BusinessHour,
  SiteInput,
} from "@/services/business-site.service";

interface BusinessSiteState {
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
  saveConfig: (input: SiteInput, hours: BusinessHour[]) => Promise<boolean>;
  setPublished: (published: boolean) => Promise<boolean>;
  checkSlug: (slug: string, currentSlug?: string) => Promise<boolean>;
  uploadImage: (file: File) => Promise<string | null>;
}

export const useBusinessSiteStore = create<BusinessSiteState>((set) => ({
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
      const { site, hours } = await siteService.fetchSiteConfig();
      set({ site, hours, loading: false, loaded: true });
    } catch (e) {
      set({ error: toMessage(e), loading: false, loaded: true });
    }
  },

  /**
   * Site row and opening hours are saved together because that is how the owner
   * edits them — one screen, one "Guardar". Hours go second: if they fail, the
   * site row is already stored and a retry is not destructive.
   */
  saveConfig: async (input, hours) => {
    set({ saving: true, error: null });
    try {
      const site = await siteService.saveSite(input);
      await siteService.saveHours(hours);
      set({ site, hours, saving: false });
      return true;
    } catch (e) {
      set({ error: toMessage(e), saving: false });
      return false;
    }
  },

  setPublished: async (published) => {
    set({ saving: true, error: null });
    try {
      const site = await siteService.setSitePublished(published);
      set({ site, saving: false });
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
