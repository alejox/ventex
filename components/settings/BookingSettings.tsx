"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useBusinessSiteStore } from "@/stores/business-site.store";
import { SLOT_INTERVAL_OPTIONS, type BusinessSite, type SiteBookingPatch } from "@/services/business-site.service";
import { notifyError, notifySuccess } from "@/lib/notifications";
import { CollectionError, CollectionLoading } from "@/components/CollectionState";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { BookingAdminCard } from "@/components/settings/BookingAdminCard";

const CARD = "bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10";

/**
 * Ajustes → Reservas: todo lo de la reserva en línea en un solo lugar. Antes
 * estaba repartido entre el editor de la página (interruptor y horarios),
 * Ajustes → Negocio (a quién se asignan) y ningún lado (el intervalo).
 *
 * El interruptor y el intervalo son columnas de `business_sites`, las mismas que
 * guarda el editor de la página: los dos leen lo mismo. Los horarios se siguen
 * editando en el editor, que es donde también se ven publicados.
 */
export function BookingSettings() {
  const sites = useBusinessSiteStore((s) => s.sites);
  const loaded = useBusinessSiteStore((s) => s.loaded);
  const error = useBusinessSiteStore((s) => s.error);
  const fetchConfig = useBusinessSiteStore((s) => s.fetchConfig);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  if (!loaded) return <CollectionLoading label="Cargando reservas…" />;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      {error && sites.length === 0 ? <CollectionError message={error} onRetry={() => void fetchConfig()} /> : null}

      {sites.length === 0 ? (
        <div className={`${CARD} p-6 md:p-8`}>
          <h2 className="text-lg font-bold text-on-surface">Reservas en línea</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Tus clientes reservan desde tu página web. Todavía no tienes una: créala y vuelve aquí para activar las reservas.
          </p>
          <Link href="/dashboard/landing" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">
            Crear mi página
          </Link>
        </div>
      ) : (
        sites.map((site) => <SiteBookingCard key={site.id} site={site} showName={sites.length > 1} />)
      )}

      <div className={`${CARD} p-6 md:p-8`}>
        <h2 className="text-lg font-bold text-on-surface">Horarios de atención</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Los días y horas en que atiendes se editan en el editor de tu página: ahí se publican y de ahí salen los horarios que tus clientes pueden reservar. También sombrean lo cerrado en el calendario.
        </p>
        <Link href="/dashboard/landing?tab=business" className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-2">
          Editar horarios de atención
        </Link>
      </div>

      <BookingAdminCard />
    </div>
  );
}

function SiteBookingCard({ site, showName }: { site: BusinessSite; showName: boolean }) {
  const saving = useBusinessSiteStore((s) => s.saving);
  const saveBooking = useBusinessSiteStore((s) => s.saveBooking);
  const name = site.site_name?.trim() || site.slug;
  // Un valor guardado fuera de la lista (p. ej. 10) se muestra tal cual, no se pisa.
  const intervals: number[] = SLOT_INTERVAL_OPTIONS.includes(site.slot_interval_minutes as (typeof SLOT_INTERVAL_OPTIONS)[number])
    ? [...SLOT_INTERVAL_OPTIONS]
    : [...SLOT_INTERVAL_OPTIONS, site.slot_interval_minutes].sort((a, b) => a - b);

  const save = async (patch: SiteBookingPatch, done: string) => {
    if (await saveBooking(site.id, patch)) notifySuccess("Reservas en línea", done);
    else notifyError("No se pudo guardar", useBusinessSiteStore.getState().error ?? "Inténtalo de nuevo.");
  };

  return (
    <div className={CARD}>
      <div className="p-6 md:p-8">
        <h2 className="text-lg font-bold text-on-surface">{showName ? `Reservas en línea · ${name}` : "Reservas en línea"}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {site.published
            ? "Tus clientes eligen servicio, persona y horario desde tu página. Cada reserva llega como pendiente para que la confirmes."
            : "Tu página todavía no está publicada: lo que elijas aquí se aplica cuando la publiques."}
        </p>
      </div>
      <hr className="border-outline-variant/10" />
      <div className="grid grid-cols-1 gap-4 p-6 md:p-8 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Switch
            label="Aceptar reservas en línea"
            description="Si lo apagas, tu página sigue visible pero sin el botón de reservar."
            checked={site.booking_enabled}
            disabled={saving}
            onCheckedChange={(checked) => void save({ booking_enabled: checked }, checked ? "Tu página ya recibe reservas." : "Tu página dejó de recibir reservas.")}
          />
        </div>
        <Select
          label="Intervalo entre horarios"
          value={String(site.slot_interval_minutes)}
          disabled={saving || !site.booking_enabled}
          hint="Cada cuánto se ofrece un horario: con 30 min, 9:00, 9:30, 10:00…"
          onChange={(event) => {
            const minutes = Number(event.target.value);
            if (minutes && minutes !== site.slot_interval_minutes) void save({ slot_interval_minutes: minutes }, `Los horarios se ofrecen cada ${minutes} minutos.`);
          }}
        >
          {intervals.map((minutes) => (
            <option key={minutes} value={String(minutes)}>{minutes === 60 ? "Cada hora" : `Cada ${minutes} minutos`}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}
