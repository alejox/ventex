"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { useBusinessSiteStore } from "@/stores/business-site.store";
import { slugify } from "@/services/business-site.service";
import type { BusinessHour, SiteInput } from "@/services/business-site.service";
import {
  DEFAULT_SITE_IMAGES,
  heroHasOverlay,
  templatesFor,
  TEMPLATE_DESCRIPTIONS,
  TEMPLATE_LABELS,
  WEEKDAY_LABELS,
} from "@/services/public-site.types";
import type { LandingConfig, SiteContactConfig, SiteImage, SiteSectionId } from "@/services/public-site.types";
import { SOCIAL_NETWORKS, SOCIAL_META } from "@/lib/socialLinks";
import { BrandIcon } from "@/app/assets/icons/BrandIcons";
import { LandingPreview } from "@/components/landing/LandingPreview";

type EditorTab = "design" | "sections" | "content" | "business" | "seo";
const TABS: { id: EditorTab; label: string }[] = [
  { id: "design", label: "Diseño" },
  { id: "sections", label: "Secciones" },
  { id: "content", label: "Contenido" },
  { id: "business", label: "Negocio" },
  { id: "seo", label: "SEO" },
];
const DEFAULT_COLORS = { rasm: "#a96550", fallspa: "#a87696", qutter: "#d5a928", barberia: "#c5a572", "barberia-artesanal": "#552d25", "barberia-urbana": "#538167" };

export function LandingEditor({ initial, initialHours, initialPublished, currentSlug, businessName, businessType, logoUrl }: {
  initial: SiteInput;
  initialHours: BusinessHour[];
  initialPublished: boolean;
  currentSlug?: string;
  businessName: string;
  businessType: string | null;
  logoUrl: string | null;
}) {
  const saveConfig = useBusinessSiteStore((state) => state.saveConfig);
  const setPublished = useBusinessSiteStore((state) => state.setPublished);
  const checkSlug = useBusinessSiteStore((state) => state.checkSlug);
  const saving = useBusinessSiteStore((state) => state.saving);
  const storedSite = useBusinessSiteStore((state) => state.site);
  const [form, setForm] = useState(initial);
  const [hours, setHours] = useState(initialHours);
  const [published, setPublishedLocal] = useState(initialPublished);
  const [activeTab, setActiveTab] = useState<EditorTab>("design");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [mobileMode, setMobileMode] = useState<"edit" | "preview">("edit");
  const [dirty, setDirty] = useState(false);
  const previewConfig = useDeferredValue(form.draft_config);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function updateForm<K extends keyof SiteInput>(key: K, value: SiteInput[K]) {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateConfig(recipe: (config: LandingConfig) => LandingConfig) {
    setDirty(true);
    setForm((current) => ({ ...current, draft_config: recipe(current.draft_config) }));
  }

  async function saveDraft(): Promise<boolean> {
    const cleanSlug = slugify(form.slug);
    if (cleanSlug.length < 3) {
      toast.error("La dirección necesita al menos 3 caracteres.");
      return false;
    }
    const invalidHour = hours.find((hour) => hour.is_open && hour.closes_at <= hour.opens_at);
    if (invalidHour) {
      toast.error(`El ${WEEKDAY_LABELS[invalidHour.weekday]} cierra antes de abrir.`);
      return false;
    }
    if (!(await checkSlug(cleanSlug, storedSite?.slug ?? currentSlug))) {
      toast.error("Esa dirección ya está ocupada.");
      return false;
    }
    const ok = await saveConfig({ ...form, slug: cleanSlug }, hours);
    if (ok) {
      setForm((current) => ({ ...current, slug: cleanSlug }));
      setDirty(false);
      toast.success("Borrador guardado.");
    } else {
      toast.error(useBusinessSiteStore.getState().error ?? "No se pudo guardar el borrador.");
    }
    return ok;
  }

  async function publish() {
    if (!(await saveDraft())) return;
    const ok = await setPublished(true);
    if (ok) {
      setPublishedLocal(true);
      toast.success("Landing publicada.");
    } else toast.error(useBusinessSiteStore.getState().error ?? "No se pudo publicar.");
  }

  async function unpublish() {
    const ok = await setPublished(false);
    if (ok) {
      setPublishedLocal(false);
      toast.success("Landing retirada de internet.");
    } else toast.error(useBusinessSiteStore.getState().error ?? "No se pudo retirar.");
  }

  return (
    /*
     * El editor es un panel de altura fija, no un documento que scrollea.
     *
     * Antes el encabezado era `sticky` y el alto se repartía con aritmética
     * (`min-h-[calc(100vh-5rem)]` afuera, `max-h-[calc(100vh-11rem)]` adentro).
     * Como la vista previa de la derecha mide lo que mide el sitio entero, la
     * página crecía, y al scrollear el encabezado pegajoso pasaba por encima de
     * la fila de pestañas: "Diseño" quedaba cortado a la mitad.
     *
     * Con el alto acotado acá y `flex` hacia abajo, cada columna scrollea sola y
     * nada se superpone. Los márgenes negativos cancelan el `p-6 lg:p-10` del
     * `<main>` del dashboard —tienen que coincidir con él, no con otro valor— y
     * el `5rem` es el `h-20` de su barra superior.
     */
    <div className="-m-6 flex h-[calc(100dvh-5rem)] flex-col overflow-hidden lg:-m-10">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 bg-surface px-4 py-3 sm:px-6">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-xl font-bold text-on-surface">Landing</h1><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${published ? "bg-emerald-500/15 text-emerald-600" : "bg-surface-container-high text-on-surface-variant"}`}>{published ? "Publicada" : "Borrador"}</span>{dirty ? <span className="text-xs text-on-surface-variant">Cambios sin guardar</span> : null}</div>
          <p className="text-xs text-on-surface-variant">Editá el sitio que ven tus clientes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {published && form.slug ? <a href={`/${form.slug}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-outline-variant/30 px-3 py-2 text-sm font-semibold text-on-surface">Ver sitio</a> : null}
          {published ? <button type="button" onClick={unpublish} disabled={saving} className="rounded-lg border border-error/30 px-3 py-2 text-sm font-semibold text-error disabled:opacity-50">Retirar</button> : null}
          <button type="button" onClick={() => void saveDraft()} disabled={saving} className="rounded-lg border border-outline-variant/30 px-3 py-2 text-sm font-semibold text-on-surface disabled:opacity-50">Guardar borrador</button>
          <button type="button" onClick={() => void publish()} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50">{saving ? "Guardando…" : published ? "Publicar cambios" : "Publicar"}</button>
        </div>
      </header>

      <div className="flex shrink-0 border-b border-outline-variant/20 bg-surface px-4 lg:hidden">
        {(["edit", "preview"] as const).map((mode) => <button key={mode} type="button" onClick={() => setMobileMode(mode)} className={`flex-1 border-b-2 px-3 py-3 text-sm font-bold ${mobileMode === mode ? "border-primary text-primary" : "border-transparent text-on-surface-variant"}`}>{mode === "edit" ? "Editar" : "Vista previa"}</button>)}
      </div>

      {/* `grid-rows-[minmax(0,1fr)]` acota la fila al alto disponible; sin eso una
          fila `auto` crece con el contenido y vuelve el desborde. */}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[430px_minmax(0,1fr)]">
        <aside className={`${mobileMode === "preview" ? "hidden" : "flex"} min-h-0 flex-col border-r border-outline-variant/20 bg-surface lg:flex`}>
          <nav className="flex shrink-0 overflow-x-auto border-b border-outline-variant/20 px-3">
            {TABS.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`shrink-0 border-b-2 px-3 py-3 text-xs font-bold ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-on-surface-variant"}`}>{tab.label}</button>)}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {activeTab === "design" ? <DesignPanel config={form.draft_config} businessType={businessType} onChange={updateConfig} /> : null}
            {activeTab === "sections" ? <SectionsPanel config={form.draft_config} onChange={updateConfig} /> : null}
            {activeTab === "content" ? <ContentPanel config={form.draft_config} onChange={updateConfig} /> : null}
            {activeTab === "business" ? <BusinessPanel form={form} hours={hours} onForm={updateForm} onHours={(next) => { setHours(next); setDirty(true); }} onConfig={updateConfig} /> : null}
            {activeTab === "seo" ? <SeoPanel config={form.draft_config} onChange={updateConfig} /> : null}
          </div>
        </aside>

        <main className={`${mobileMode === "edit" ? "hidden" : "flex"} min-h-0 min-w-0 flex-col lg:flex`}>
          <div className="flex shrink-0 items-center justify-center gap-2 border-b border-outline-variant/20 bg-surface px-4 py-2">
            <button type="button" onClick={() => setDevice("desktop")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${device === "desktop" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}>Escritorio</button>
            <button type="button" onClick={() => setDevice("mobile")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${device === "mobile" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}>Móvil</button>
          </div>
          <div className="min-h-0 flex-1">
            <LandingPreview config={previewConfig} hours={hours} businessName={businessName} logoUrl={logoUrl} bookingEnabled={form.booking_enabled} device={device} />
          </div>
        </main>
      </div>
    </div>
  );
}

function DesignPanel({ config, businessType, onChange }: PanelProps & { businessType: string | null }) {
  return <div className="space-y-6"><PanelTitle title="Elegí una identidad" text="El contenido se conserva al cambiar de diseño." /><div className="space-y-3">{templatesFor(businessType, config.template).map((template) => <button key={template} type="button" onClick={() => startTransition(() => onChange((current) => ({ ...current, template })))} className={`w-full rounded-xl border-2 p-4 text-left ${config.template === template ? "border-primary bg-primary/5" : "border-outline-variant/30"}`}><span className="font-bold text-on-surface">{TEMPLATE_LABELS[template]}</span><span className="mt-1 block text-xs text-on-surface-variant">{TEMPLATE_DESCRIPTIONS[template]}</span></button>)}</div><Field label="Color principal"><div className="flex gap-3"><input type="color" value={config.colors.primary ?? DEFAULT_COLORS[config.template]} onChange={(event) => onChange((current) => ({ ...current, colors: { primary: event.target.value } }))} className="h-11 w-14 rounded-lg border border-outline-variant/30 bg-surface-container p-1" /><button type="button" onClick={() => onChange((current) => ({ ...current, colors: { primary: null } }))} className="text-xs font-semibold text-primary">Usar original</button></div></Field></div>;
}

function SectionsPanel({ config, onChange }: PanelProps) {
  function move(index: number, direction: -1 | 1) { onChange((current) => { const sections = [...current.sections]; const target = index + direction; if (target < 0 || target >= sections.length) return current; [sections[index], sections[target]] = [sections[target], sections[index]]; return { ...current, sections }; }); }
  return <div className="space-y-4"><PanelTitle title="Orden y visibilidad" text="La portada siempre permanece al inicio." />{config.sections.map((section, index) => <div key={section.id} className="rounded-xl border border-outline-variant/30 p-3"><div className="flex items-center gap-2"><input type="checkbox" checked={section.visible} onChange={(event) => onChange((current) => ({ ...current, sections: current.sections.map((item) => item.id === section.id ? { ...item, visible: event.target.checked } : item) }))} className="h-4 w-4 accent-[var(--primary)]" /><span className="flex-1 text-sm font-bold text-on-surface">{section.title}</span><button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="rounded p-2 text-on-surface-variant disabled:opacity-20" aria-label={`Subir ${section.title}`}>↑</button><button type="button" disabled={index === config.sections.length - 1} onClick={() => move(index, 1)} className="rounded p-2 text-on-surface-variant disabled:opacity-20" aria-label={`Bajar ${section.title}`}>↓</button></div><div className="mt-3 grid gap-2"><input value={section.subtitle} onChange={(event) => updateSectionText(onChange, section.id, "subtitle", event.target.value)} className={INPUT} placeholder="Antetítulo" /><input value={section.title} onChange={(event) => updateSectionText(onChange, section.id, "title", event.target.value)} className={INPUT} placeholder="Título" /></div></div>)}</div>;
}

function ContentPanel({ config, onChange }: PanelProps) {
  return <div className="space-y-7"><PanelTitle title="Portada" text="Las imágenes de muestra se usan hasta que subas las tuyas." /><Field label="Antetítulo"><input value={config.hero.eyebrow} onChange={(event) => onChange((current) => ({ ...current, hero: { ...current.hero, eyebrow: event.target.value } }))} className={INPUT} /></Field><Field label="Título principal"><input value={config.hero.title ?? ""} onChange={(event) => onChange((current) => ({ ...current, hero: { ...current.hero, title: event.target.value || null } }))} className={INPUT} placeholder="Usa el nombre del negocio si queda vacío" /></Field><Field label="Descripción"><textarea rows={3} value={config.hero.description ?? ""} onChange={(event) => onChange((current) => ({ ...current, hero: { ...current.hero, description: event.target.value || null } }))} className={INPUT} /></Field><ImageField label="Imagen de portada" value={config.hero.imageUrl} fallback={DEFAULT_SITE_IMAGES[config.template]} onChange={(url) => onChange((current) => ({ ...current, hero: { ...current.hero, imageUrl: url } }))} />{heroHasOverlay(config.template) ? <OverlayField config={config} onChange={onChange} /> : null}<hr className="border-outline-variant/20" /><PanelTitle title="Sobre nosotros" text="Contá qué hace diferente a tu negocio." /><Field label="Texto"><textarea rows={5} value={config.about.description ?? ""} onChange={(event) => onChange((current) => ({ ...current, about: { ...current.about, description: event.target.value || null } }))} className={INPUT} /></Field><ImageField label="Imagen de la sección" value={config.about.imageUrl} fallback={null} onChange={(url) => onChange((current) => ({ ...current, about: { ...current.about, imageUrl: url } }))} /><hr className="border-outline-variant/20" /><PanelTitle title="Galería" text="Podés mostrar hasta 12 imágenes." /><GalleryEditor config={config} onChange={onChange} /></div>;
}

function BusinessPanel({ form, hours, onForm, onHours, onConfig }: { form: SiteInput; hours: BusinessHour[]; onForm: <K extends keyof SiteInput>(key: K, value: SiteInput[K]) => void; onHours: (hours: BusinessHour[]) => void; onConfig: PanelProps["onChange"] }) {
  const contact = form.draft_config.contact;
  const updateContact = (key: keyof SiteContactConfig, value: string) => onConfig((current) => ({ ...current, contact: { ...current.contact, [key]: value || null } }));
  return <div className="space-y-6"><PanelTitle title="Dirección pública" text="Este será el enlace para compartir." /><Field label="ventex.app/"><input value={form.slug} onChange={(event) => onForm("slug", event.target.value)} className={INPUT} /></Field><label className="flex gap-3 text-sm text-on-surface"><input type="checkbox" checked={form.booking_enabled} onChange={(event) => onForm("booking_enabled", event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />Aceptar reservas en línea</label><Field label="WhatsApp"><input value={contact.whatsapp ?? ""} onChange={(event) => updateContact("whatsapp", event.target.value)} className={INPUT} placeholder="573001234567" /></Field><Field label="Dirección"><input value={contact.address ?? ""} onChange={(event) => updateContact("address", event.target.value)} className={INPUT} /></Field><div className="grid gap-3">{SOCIAL_NETWORKS.map((network) => <Field key={network} label={SOCIAL_META[network].label} icon={<BrandIcon name={network} className="h-4 w-4" colored />}><input value={contact[network] ?? ""} onChange={(event) => updateContact(network, event.target.value)} className={INPUT} placeholder={SOCIAL_META[network].placeholder} /></Field>)}</div><hr className="border-outline-variant/20" /><PanelTitle title="Horarios" text="También definen la disponibilidad de reservas." />{hours.map((hour) => <div key={hour.weekday} className="rounded-xl border border-outline-variant/30 p-3"><label className="flex items-center gap-2 text-sm font-bold text-on-surface"><input type="checkbox" checked={hour.is_open} onChange={(event) => onHours(hours.map((item) => item.weekday === hour.weekday ? { ...item, is_open: event.target.checked } : item))} />{WEEKDAY_LABELS[hour.weekday]}</label>{hour.is_open ? <div className="mt-3 flex items-center gap-2"><input type="time" value={hour.opens_at} onChange={(event) => onHours(hours.map((item) => item.weekday === hour.weekday ? { ...item, opens_at: event.target.value } : item))} className={INPUT} /><span>–</span><input type="time" value={hour.closes_at} onChange={(event) => onHours(hours.map((item) => item.weekday === hour.weekday ? { ...item, closes_at: event.target.value } : item))} className={INPUT} /></div> : null}</div>)}</div>;
}

function SeoPanel({ config, onChange }: PanelProps) { return <div className="space-y-5"><PanelTitle title="Google y redes" text="Controlá cómo aparece el enlace al compartirlo." /><Field label="Título"><input value={config.seo.title ?? ""} onChange={(event) => onChange((current) => ({ ...current, seo: { ...current.seo, title: event.target.value || null } }))} className={INPUT} placeholder="Nombre del negocio" /></Field><Field label="Descripción"><textarea rows={4} value={config.seo.description ?? ""} onChange={(event) => onChange((current) => ({ ...current, seo: { ...current.seo, description: event.target.value || null } }))} className={INPUT} /></Field><ImageField label="Imagen al compartir" value={config.seo.imageUrl} fallback={null} onChange={(url) => onChange((current) => ({ ...current, seo: { ...current.seo, imageUrl: url } }))} /></div>; }

/**
 * Un campo de imagen que MUESTRA la imagen.
 *
 * Antes decía "Imagen personalizada" y nada más: para saber cuál había quedado
 * cargada había que buscarla en la vista previa. `fallback` es la imagen de
 * muestra de la plantilla, así que el recuadro nunca está vacío y se ve contra
 * qué se está comparando antes de reemplazarla.
 */
function ImageField({ label, value, fallback, onChange }: { label: string; value: string | null; fallback: string | null; onChange: (url: string | null) => void }) {
  const uploadImage = useBusinessSiteStore((state) => state.uploadImage);
  const uploading = useBusinessSiteStore((state) => state.uploading);
  const mostrada = value ?? fallback;
  return (
    <Field label={label}>
      <div className="space-y-2">
        {mostrada ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-outline-variant/30 bg-surface-container">
            {/* `unoptimized`: la miniatura del editor no justifica una variante
                más en el optimizador, y la de muestra ya viene en WebP. */}
            <Image src={mostrada} alt="" fill sizes="430px" unoptimized className="object-cover" />
            <span className="absolute bottom-0 left-0 rounded-tr-lg bg-black/65 px-2 py-1 text-[11px] font-semibold text-white">
              {value ? "Tu imagen" : "Imagen de muestra"}
            </span>
          </div>
        ) : (
          <p className="text-xs text-on-surface-variant">Todavía no subiste una imagen.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer rounded-lg border border-outline-variant/30 px-3 py-2 text-xs font-bold text-on-surface">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              disabled={uploading}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const url = await uploadImage(file);
                if (url) {
                  onChange(url);
                  toast.success("Imagen cargada.");
                } else toast.error(useBusinessSiteStore.getState().error ?? "No se pudo cargar la imagen.");
                event.target.value = "";
              }}
            />
            {uploading ? "Subiendo…" : value ? "Reemplazar imagen" : "Subir imagen"}
          </label>
          {value ? <button type="button" onClick={() => onChange(null)} className="text-xs font-bold text-primary">Usar predeterminada</button> : null}
        </div>
      </div>
    </Field>
  );
}

/**
 * Cuánto se oscurece la portada.
 *
 * No atenúa la foto: regula el velo que la plantilla ya dibuja encima, que es lo
 * que vuelve legible el título. Por eso el control solo aparece donde la portada
 * va a sangre con el texto arriba (`heroHasOverlay`) — en Rasm y Fallspa la foto
 * va al costado y apagarla no arregla nada.
 *
 * Mientras nadie lo toque el valor es `null` y la plantilla se ve como siempre;
 * el 100 del arranque es esa misma intensidad de diseño, no un valor inventado.
 */
function OverlayField({ config, onChange }: PanelProps) {
  const valor = config.hero.overlay ?? 100;
  return (
    <Field label="Oscurecer la portada">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={valor}
            aria-label="Oscurecer la portada"
            onChange={(event) => {
              const overlay = Number(event.target.value);
              onChange((current) => ({ ...current, hero: { ...current.hero, overlay } }));
            }}
            // Control nativo con `accent-color`: con `appearance: none` hay que
            // redibujar pista y tirador por navegador, y el que no se estiliza
            // se queda sin tirador visible.
            className="min-w-0 flex-1 cursor-pointer accent-primary"
          />
          <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-on-surface">{valor}%</span>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs text-on-surface-variant">
            {valor === 0 ? "Sin velo: la foto se ve entera, pero el título puede perderse." : "El velo deja leer el título encima de la foto."}
          </p>
          {config.hero.overlay !== null ? (
            <button type="button" onClick={() => onChange((current) => ({ ...current, hero: { ...current.hero, overlay: null } }))} className="text-xs font-bold text-primary">
              Usar el de la plantilla
            </button>
          ) : null}
        </div>
      </div>
    </Field>
  );
}

function GalleryEditor({ config, onChange }: PanelProps) { const uploadImage = useBusinessSiteStore((state) => state.uploadImage); const uploading = useBusinessSiteStore((state) => state.uploading); return <div className="space-y-3"><div className="grid grid-cols-3 gap-2">{config.gallery.images.map((image) => <div key={image.id} className="rounded-lg border border-outline-variant/30 p-2"><div className="aspect-square rounded bg-surface-container bg-cover bg-center" style={{ backgroundImage: `url(${image.url})` }} /><input value={image.alt} onChange={(event) => onChange((current) => ({ ...current, gallery: { ...current.gallery, images: current.gallery.images.map((item) => item.id === image.id ? { ...item, alt: event.target.value } : item) } }))} className="mt-2 w-full bg-transparent text-[11px] text-on-surface" placeholder="Descripción" /><button type="button" onClick={() => onChange((current) => ({ ...current, gallery: { ...current.gallery, images: current.gallery.images.filter((item) => item.id !== image.id) } }))} className="mt-1 text-[11px] font-bold text-error">Quitar</button></div>)}</div>{config.gallery.images.length < 12 ? <label className="inline-flex cursor-pointer rounded-lg border border-outline-variant/30 px-3 py-2 text-xs font-bold text-on-surface"><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={uploading} onChange={async (event) => { const files = Array.from(event.target.files ?? []).slice(0, 12 - config.gallery.images.length); const uploaded: SiteImage[] = []; for (const file of files) { const url = await uploadImage(file); if (url) uploaded.push({ id: crypto.randomUUID(), url, alt: "" }); } if (uploaded.length) onChange((current) => ({ ...current, gallery: { ...current.gallery, images: [...current.gallery.images, ...uploaded].slice(0, 12) } })); event.target.value = ""; }} />{uploading ? "Subiendo…" : "Agregar imágenes"}</label> : null}</div>; }

interface PanelProps { config: LandingConfig; onChange: (recipe: (config: LandingConfig) => LandingConfig) => void }
function updateSectionText(onChange: PanelProps["onChange"], id: SiteSectionId, key: "title" | "subtitle", value: string) { onChange((current) => ({ ...current, sections: current.sections.map((section) => section.id === id ? { ...section, [key]: value } : section) })); }
function PanelTitle({ title, text }: { title: string; text: string }) { return <div><h2 className="text-base font-bold text-on-surface">{title}</h2><p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{text}</p></div>; }
function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">{icon}{label}</span>{children}</label>; }
const INPUT = "w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary";
