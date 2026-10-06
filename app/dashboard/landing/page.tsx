"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useBusinessSiteStore } from "@/stores/business-site.store";
import { useSettingsStore } from "@/stores/settings.store";
import { emptySiteInput, slugify, toSiteInput } from "@/services/business-site.service";
import { LandingEditor } from "@/components/landing/LandingEditor";
import { useProfile } from "@/components/ProfileProvider";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { SITE_URL } from "@/lib/site";

const MAX_SITES = 10;

export default function LandingPage() {
  return <Suspense fallback={<div className="text-sm text-on-surface-variant">Cargando…</div>}><LandingContent /></Suspense>;
}

/**
 * Página web: la lista de las páginas del negocio y, al elegir una (o crear
 * una nueva), su editor. La sede en edición viaja en la URL (`?site=<id>` o
 * `?new=1`) para que recargar o compartir el enlace no te saque del editor.
 *
 * Un negocio sin ninguna página entra directo al editor: es el mismo primer
 * paso de siempre, no una lista vacía que hay que entender.
 */
function LandingContent() {
  const loaded = useBusinessSiteStore((state) => state.loaded);
  const fetchConfig = useBusinessSiteStore((state) => state.fetchConfig);
  const fetchSettings = useSettingsStore((state) => state.fetchSettings);

  useEffect(() => {
    void fetchConfig();
    void fetchSettings();
  }, [fetchConfig, fetchSettings]);

  if (!loaded) return <div className="grid min-h-64 place-items-center text-sm text-on-surface-variant">Cargando…</div>;
  return <LandingScreen />;
}

/** Qué se muestra: la lista, una sede existente o una sede nueva. */
type Mode = { kind: "list" } | { kind: "edit"; id: string } | { kind: "new" };

/**
 * El modo vive en estado y no se deriva de la URL ni de `sites.length`: al
 * guardar la PRIMERA sede la lista pasa de vacía a una fila, y un modo derivado
 * sacaría al dueño del editor justo después de guardar. Se decide una vez, al
 * montar (ya con las sedes cargadas), y desde ahí solo cambia por acciones.
 */
function LandingScreen() {
  const searchParams = useSearchParams();
  const sites = useBusinessSiteStore((state) => state.sites);
  const hours = useBusinessSiteStore((state) => state.hours);
  const saving = useBusinessSiteStore((state) => state.saving);
  const deleteSite = useBusinessSiteStore((state) => state.deleteSite);
  const settings = useSettingsStore((state) => state.settings);
  const businessType = useProfile()?.businessType ?? null;
  const { confirm, dialog } = useConfirm();
  const [mode, setMode] = useState<Mode>(() => {
    if (sites.length === 0) return { kind: "new" };
    const wanted = searchParams.get("site");
    if (wanted && sites.some((site) => site.id === wanted)) return { kind: "edit", id: wanted };
    // Los enlaces viejos (`?tab=business`) apuntaban a LA página: abren la primera.
    if (searchParams.has("tab")) return { kind: "edit", id: sites[0].id };
    return { kind: "list" };
  });

  const businessName = settings?.business_profile?.businessName?.trim() || "Tu negocio";
  const current = mode.kind === "edit" ? sites.find((site) => site.id === mode.id) ?? null : null;

  if (mode.kind === "new" || current) {
    const initial = current
      ? toSiteInput(current)
      : { ...emptySiteInput(), slug: sites.length === 0 ? slugify(businessName) : "" };
    return (
      <LandingEditor
        // Misma `key` antes y después del primer guardado: es la misma edición.
        key="site-editor"
        siteId={current?.id}
        onSaved={(id) => setMode({ kind: "edit", id })}
        onBack={() => setMode({ kind: "list" })}
        initial={initial}
        initialHours={hours}
        initialPublished={current?.published ?? false}
        currentSlug={current?.slug}
        businessName={businessName}
        businessType={businessType}
        logoUrl={settings?.business_profile?.logoUrl ?? null}
      />
    );
  }

  async function remove(id: string, name: string) {
    const ok = await confirm({
      title: `¿Eliminar "${name}"?`,
      description: "La dirección dejará de funcionar y se pierde el diseño. Tus servicios, equipo y citas no se tocan.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    if (await deleteSite(id)) toast.success("Página eliminada.");
    else toast.error(useBusinessSiteStore.getState().error ?? "No se pudo eliminar.");
  }

  const canAdd = sites.length < MAX_SITES;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Página web</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Cada sede tiene su propio nombre, dirección y diseño. Comparten tu equipo, servicios y agenda.
          </p>
        </div>
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => setMode({ kind: "new" })}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-dim disabled:opacity-50"
        >
          Nueva sede
        </button>
      </header>

      <ul className="space-y-3">
        {sites.map((site) => {
          const name = site.site_name?.trim() || businessName;
          return (
            <li key={site.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/20 bg-surface-container p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-bold text-on-surface">{name}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${site.published ? "bg-emerald-500/15 text-emerald-600" : "bg-surface-container-high text-on-surface-variant"}`}>
                    {site.published ? "Publicada" : "Borrador"}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-on-surface-variant">{SITE_URL}/{site.slug}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {site.published ? (
                  <a href={`/${site.slug}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-outline-variant/30 px-3 py-2 text-sm font-semibold text-on-surface">Ver</a>
                ) : null}
                <button type="button" onClick={() => setMode({ kind: "edit", id: site.id })} className="rounded-lg bg-primary/10 px-3 py-2 text-sm font-bold text-primary hover:bg-primary/20">Editar</button>
                <button type="button" disabled={saving} onClick={() => void remove(site.id, name)} className="rounded-lg px-3 py-2 text-sm font-semibold text-error hover:bg-error/10 disabled:opacity-50">Eliminar</button>
              </div>
            </li>
          );
        })}
      </ul>

      {!canAdd ? <p className="text-xs text-on-surface-variant">Llegaste al máximo de {MAX_SITES} páginas por negocio.</p> : null}
      {dialog}
    </div>
  );
}
