"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useBusinessSiteStore } from "@/stores/business-site.store";
import { useSettingsStore } from "@/stores/settings.store";
import {
  isSlugAvailable,
  slugify,
  defaultHours,
  toSiteInput,
} from "@/services/business-site.service";
import type { BusinessHour, SiteInput } from "@/services/business-site.service";
import {
  SITE_TEMPLATES,
  TEMPLATE_LABELS,
  TEMPLATE_DESCRIPTIONS,
  WEEKDAY_LABELS,
} from "@/services/public-site.types";
import type { SiteTemplate } from "@/services/public-site.types";

/**
 * "Sitio web" tab: the owner picks a URL, a design, opening hours and whether
 * the site is live.
 *
 * Publishing is a deliberate, separate switch. Configuring a site must never
 * put a business on the public internet as a side effect of saving a draft.
 */

const EMPTY_SITE: SiteInput = {
  slug: "",
  template: "clasico",
  published: false,
  booking_enabled: true,
  headline: null,
  about: null,
  hero_image_url: null,
  whatsapp: null,
  address: null,
  instagram: null,
  timezone: "America/Bogota",
  slot_interval_minutes: 30,
};

/**
 * Loader only. The form lives in a child so its `useState` initialisers can
 * read the already-loaded config — no effect copies store state into local
 * state, which is what `react-hooks/set-state-in-effect` is there to prevent.
 */
export default function SitioPage() {
  const site = useBusinessSiteStore((s) => s.site);
  const storedHours = useBusinessSiteStore((s) => s.hours);
  const loaded = useBusinessSiteStore((s) => s.loaded);
  const fetchConfig = useBusinessSiteStore((s) => s.fetchConfig);

  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  useEffect(() => {
    void fetchConfig();
    void fetchSettings();
  }, [fetchConfig, fetchSettings]);

  if (!loaded) {
    return <p className="text-sm text-on-surface-variant">Cargando…</p>;
  }

  return (
    <SiteForm
      // Remount when the stored row is replaced, so the fields re-initialise.
      key={site?.id ?? "nuevo"}
      initialSite={site ? toSiteInput(site) : EMPTY_SITE}
      initialHours={storedHours}
      currentSlug={site?.slug}
    />
  );
}

function SiteForm({
  initialSite,
  initialHours,
  currentSlug,
}: {
  initialSite: SiteInput;
  initialHours: BusinessHour[];
  currentSlug?: string;
}) {
  const saving = useBusinessSiteStore((s) => s.saving);
  const saveConfig = useBusinessSiteStore((s) => s.saveConfig);
  const settings = useSettingsStore((s) => s.settings);

  const [form, setForm] = useState<SiteInput>(initialSite);
  const [hours, setHours] = useState<BusinessHour[]>(
    initialHours.length ? initialHours : defaultHours(),
  );
  const [slugState, setSlugState] = useState<"idle" | "checking" | "free" | "taken">("idle");

  const suggestedSlug = slugify(settings?.business_profile?.businessName ?? "");
  const publicUrl =
    typeof window !== "undefined" && form.slug ? `${window.location.origin}/${form.slug}` : "";

  function update<K extends keyof SiteInput>(key: K, value: SiteInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateHour(weekday: number, patch: Partial<BusinessHour>) {
    setHours((current) =>
      current.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)),
    );
  }

  async function handleSlugBlur() {
    const clean = slugify(form.slug);
    if (clean !== form.slug) update("slug", clean);
    if (clean.length < 3) {
      setSlugState("idle");
      return;
    }

    setSlugState("checking");
    try {
      const free = await isSlugAvailable(clean, currentSlug);
      setSlugState(free ? "free" : "taken");
    } catch {
      setSlugState("idle");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const clean = slugify(form.slug);
    if (clean.length < 3) {
      toast.error("La dirección necesita al menos 3 caracteres.");
      return;
    }
    if (slugState === "taken") {
      toast.error("Esa dirección ya está tomada. Elegí otra.");
      return;
    }

    const invalid = hours.find((h) => h.is_open && h.closes_at <= h.opens_at);
    if (invalid) {
      toast.error(`El ${WEEKDAY_LABELS[invalid.weekday]} cierra antes de abrir.`);
      return;
    }

    const ok = await saveConfig({ ...form, slug: clean }, hours);
    toast[ok ? "success" : "error"](
      ok ? "Sitio guardado." : useBusinessSiteStore.getState().error ?? "No se pudo guardar.",
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-8">
      {/* ---- Dirección pública ---- */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Dirección de tu sitio</h2>
          <p className="text-sm text-on-surface-variant">
            Es el enlace que vas a compartir con tus clientes.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-sm text-on-surface-variant">ventex.app/</span>
          <input
            value={form.slug}
            onChange={(e) => {
              update("slug", e.target.value);
              setSlugState("idle");
            }}
            onBlur={handleSlugBlur}
            placeholder={suggestedSlug || "mi-negocio"}
            className="min-w-0 flex-1 rounded-xl border border-outline-variant bg-surface-container px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary"
          />
        </div>

        {suggestedSlug && !form.slug ? (
          <button
            type="button"
            onClick={() => update("slug", suggestedSlug)}
            className="text-xs font-medium text-primary underline"
          >
            Usar “{suggestedSlug}”
          </button>
        ) : null}

        {slugState === "checking" ? (
          <p className="text-xs text-on-surface-variant">Verificando…</p>
        ) : slugState === "free" ? (
          <p className="text-xs text-emerald-600">Está libre.</p>
        ) : slugState === "taken" ? (
          <p className="text-xs text-error">Ya está tomada. Elegí otra.</p>
        ) : null}
      </section>

      {/* ---- Diseño ---- */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Diseño</h2>
          <p className="text-sm text-on-surface-variant">
            Los tres muestran la misma información. Cambian el look, no el contenido.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {SITE_TEMPLATES.map((template) => (
            <TemplateCard
              key={template}
              template={template}
              selected={form.template === template}
              onSelect={() => update("template", template)}
            />
          ))}
        </div>
      </section>

      {/* ---- Contenido ---- */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-on-surface">Contenido</h2>

        <Field label="Frase principal">
          <input
            value={form.headline ?? ""}
            onChange={(e) => update("headline", e.target.value || null)}
            placeholder="Tu mejor corte, sin esperas"
            className={FIELD}
          />
        </Field>

        <Field label="Sobre el negocio">
          <textarea
            value={form.about ?? ""}
            onChange={(e) => update("about", e.target.value || null)}
            rows={3}
            className={FIELD}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp">
            <input
              value={form.whatsapp ?? ""}
              onChange={(e) => update("whatsapp", e.target.value || null)}
              placeholder="573001234567"
              className={FIELD}
            />
          </Field>
          <Field label="Instagram">
            <input
              value={form.instagram ?? ""}
              onChange={(e) => update("instagram", e.target.value || null)}
              placeholder="@minegocio"
              className={FIELD}
            />
          </Field>
        </div>

        <Field label="Dirección">
          <input
            value={form.address ?? ""}
            onChange={(e) => update("address", e.target.value || null)}
            className={FIELD}
          />
        </Field>
      </section>

      {/* ---- Horarios ---- */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Horario de atención</h2>
          <p className="text-sm text-on-surface-variant">
            De acá salen los turnos que puede elegir un cliente. Fuera de este horario, nadie
            puede reservar.
          </p>
        </div>

        <ul className="space-y-2">
          {hours.map((hour) => (
            <li
              key={hour.weekday}
              className="flex flex-col gap-2 rounded-xl border border-outline-variant p-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <label className="flex flex-1 items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={hour.is_open}
                  onChange={(e) => updateHour(hour.weekday, { is_open: e.target.checked })}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <span className="text-sm font-medium text-on-surface">
                  {WEEKDAY_LABELS[hour.weekday]}
                </span>
              </label>

              {hour.is_open ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={hour.opens_at}
                    onChange={(e) => updateHour(hour.weekday, { opens_at: e.target.value })}
                    className="rounded-lg border border-outline-variant bg-surface-container px-2 py-1.5 text-sm text-on-surface"
                  />
                  <span className="text-on-surface-variant">–</span>
                  <input
                    type="time"
                    value={hour.closes_at}
                    onChange={(e) => updateHour(hour.weekday, { closes_at: e.target.value })}
                    className="rounded-lg border border-outline-variant bg-surface-container px-2 py-1.5 text-sm text-on-surface"
                  />
                </div>
              ) : (
                <span className="text-sm text-on-surface-variant">Cerrado</span>
              )}
            </li>
          ))}
        </ul>

        <Field label="Cada cuánto empieza un turno">
          <select
            value={form.slot_interval_minutes}
            onChange={(e) => update("slot_interval_minutes", Number(e.target.value))}
            className={FIELD}
          >
            {[10, 15, 20, 30, 60].map((minutes) => (
              <option key={minutes} value={minutes}>
                Cada {minutes} minutos
              </option>
            ))}
          </select>
        </Field>
      </section>

      {/* ---- Publicación ---- */}
      <section className="space-y-3 rounded-xl border border-outline-variant p-4">
        <h2 className="text-lg font-semibold text-on-surface">Publicación</h2>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.booking_enabled}
            onChange={(e) => update("booking_enabled", e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
          />
          <span className="text-sm text-on-surface">
            Aceptar reservas en línea
            <span className="block text-xs text-on-surface-variant">
              Si lo apagás, el sitio sigue visible pero sin formulario de reserva.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) => update("published", e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
          />
          <span className="text-sm text-on-surface">
            Sitio publicado
            <span className="block text-xs text-on-surface-variant">
              Mientras esté apagado, el enlace devuelve “no encontrado” a cualquiera.
            </span>
          </span>
        </label>

        {form.published && publicUrl ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm font-medium text-primary underline"
          >
            Ver mi sitio →
          </a>
        ) : null}
      </section>

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary disabled:opacity-50 sm:w-auto sm:px-8"
      >
        {saving ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}

const FIELD =
  "w-full rounded-xl border border-outline-variant bg-surface-container px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

/** Miniature of each design so the choice is visual, not a word in a dropdown. */
function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: SiteTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  const preview: Record<SiteTemplate, { bg: string; accent: string; text: string }> = {
    clasico: { bg: "#f5efe6", accent: "#8a5a2b", text: "#2b2118" },
    moderno: { bg: "#0c0d12", accent: "#c8f450", text: "#f2f3f7" },
    minimal: { bg: "#ffffff", accent: "#141414", text: "#141414" },
  };
  const colors = preview[template];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-xl border-2 p-3 text-left transition-colors ${
        selected ? "border-primary" : "border-outline-variant hover:border-outline-variant/60"
      }`}
    >
      <span
        className="mb-3 flex h-20 flex-col justify-center gap-1.5 rounded-lg px-3"
        style={{ backgroundColor: colors.bg }}
      >
        <span
          className="block h-2 w-3/5 rounded-full"
          style={{ backgroundColor: colors.text, opacity: 0.85 }}
        />
        <span
          className="block h-1.5 w-4/5 rounded-full"
          style={{ backgroundColor: colors.text, opacity: 0.35 }}
        />
        <span
          className="mt-1 block h-4 w-1/2 rounded"
          style={{ backgroundColor: colors.accent }}
        />
      </span>
      <span className="block text-sm font-semibold text-on-surface">
        {TEMPLATE_LABELS[template]}
      </span>
      <span className="mt-0.5 block text-xs text-on-surface-variant">
        {TEMPLATE_DESCRIPTIONS[template]}
      </span>
    </button>
  );
}
