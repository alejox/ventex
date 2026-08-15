"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePromosStore } from "@/stores/promos.store";
import { useProfile } from "@/components/ProfileProvider";
import { useSettingsStore } from "@/stores/settings.store";
import { fetchPromoCustomers, toPromoRows } from "@/services/promo-customers.service";
import type { PromoCustomer, PromoCustomerRow } from "@/services/promo-customers.service";
import { redeemPromo } from "@/services/promos.service";
import { renderPromoMessage, whatsappLink, availableReward, businessDisplayName } from "@/services/promos.service";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { CollectionEmpty, CollectionError, CollectionLoading } from "@/components/CollectionState";
import { IconSearch, IconUsers } from "@/app/assets/icons/DashboardIcons";
import { notifySuccess, notifyError } from "@/lib/notifications";

/**
 * Promociones: quién está cerca del premio y a quién escribirle.
 *
 * Es la vista que el mostrador mira antes de abrir, no la configuración. Lo que
 * cuenta como corte y qué se le dice al cliente se define en
 * Configuración → Promociones; acá solo se lee y se manda.
 */
export default function PromocionesClientesPage() {
  const config = usePromosStore((s) => s.config);
  const milestones = usePromosStore((s) => s.milestones);
  const configLoading = usePromosStore((s) => s.loading);
  const fetchAll = usePromosStore((s) => s.fetchAll);
  const profile = useProfile();
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  const [raw, setRaw] = useState<PromoCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** Cliente sobre el que se está confirmando el canje. */
  const [confirmar, setConfirmar] = useState<PromoCustomer | null>(null);
  const [canjeando, setCanjeando] = useState(false);

  /**
   * Carga sin tocar estado de forma síncrona: `loading` arranca en true y solo
   * se apaga en el callback. Poner `setLoading(true)` acá haría que el efecto
   * dispare un render en cascada, que es lo que el compilador de React rechaza.
   */
  const cargar = useMemo(
    () => () =>
      fetchPromoCustomers()
        .then((rows) => {
          setRaw(rows);
          setError(null);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "No se pudo cargar."))
        .finally(() => setLoading(false)),
    [],
  );

  /** Reintento desde el botón: ahí sí se puede volver a mostrar el spinner. */
  const reintentar = () => {
    setLoading(true);
    cargar();
  };

  useEffect(() => {
    fetchSettings();
    fetchAll();
    cargar();
  }, [fetchAll, cargar, fetchSettings]);

  const rows = useMemo(() => {
    const conHitos = toPromoRows(raw, milestones);
    const q = query.trim().toLowerCase();
    return q ? conHitos.filter((c) => c.full_name.toLowerCase().includes(q)) : conHitos;
  }, [raw, milestones, query]);

  const conPremio = rows.filter((c) => c.reward).length;
  const totalCortes = rows.reduce((sum, c) => sum + c.haircut_count, 0);

  const linkFor = (c: PromoCustomer): string | null => {
    const hito = availableReward(c.progress, milestones);
    const texto = renderPromoMessage(config.message, {
      cliente: c.full_name.split(" ")[0],
      cortes: c.progress,
      total: c.haircut_count,
      negocio: businessDisplayName(settings?.business_profile?.businessName, profile?.businessName),
      premio: hito?.reward ?? null,
    });
    return whatsappLink(c.phone, texto);
  };

  const columns: DataColumn<PromoCustomer>[] = [
    {
      header: "Cliente",
      mobile: "title",
      className: "pl-6 font-medium text-on-surface",
      headerClassName: "pl-6",
      cell: (c) => c.full_name,
    },
    {
      header: "Cortes",
      align: "right",
      mobile: "trailing",
      className: "font-bold text-on-surface tabular-nums",
      // El progreso, que es el número que decide el premio. El histórico va
      // abajo en gris: son dos cosas distintas y confundirlas hace que un
      // cliente que canjeó ayer parezca que nunca vino.
      cell: (c) => (
        <span>
          {c.progress}
          {c.haircut_count !== c.progress && (
            <span className="block text-[10px] font-normal text-on-surface-variant">
              {c.haircut_count} en total
            </span>
          )}
        </span>
      ),
    },
    {
      header: "Estado",
      mobile: "detail",
      cell: (c) =>
        c.reward ? (
          <span className="inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20">
            🎉 {c.reward}
          </span>
        ) : c.missing !== null ? (
          <span className="text-xs text-on-surface-variant">
            Le faltan <strong className="text-on-surface">{c.missing}</strong> para {c.nextThreshold}
          </span>
        ) : (
          <span className="text-xs text-on-surface-variant/60">Sin hitos configurados</span>
        ),
    },
    {
      header: "",
      align: "right",
      mobile: "actions",
      className: "pr-6",
      headerClassName: "pr-6",
      cell: (c) => {
        const link = linkFor(c);
        const puedeCanjear = Boolean(c.reward);
        // Sin teléfono no hay a dónde escribir: se dice por qué en vez de
        // ofrecer un botón que no puede hacer nada.
        return (
          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366]/10 text-[#16a34a] text-[11px] font-bold hover:bg-[#25D366] hover:text-white transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
                </svg>
                Escribir
              </a>
            ) : (
              <span className="text-[11px] text-on-surface-variant/60">Sin teléfono</span>
            )}
            {/* Solo aparece cuando el premio está ganado: un botón de canjear
                siempre visible invita a entregar lo que todavía no corresponde. */}
            {puedeCanjear && (
              <button
                onClick={() => setConfirmar(c)}
                className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary hover:text-on-primary transition-colors"
              >
                Canjear
              </button>
            )}
          </div>
        );
      },
    },
  ];

  if (configLoading || loading) return <CollectionLoading label="Cargando promociones…" />;

  // Sin el contador encendido esta pantalla no tiene nada que decir, y mostrar
  // una tabla vacía haría pensar que ningún cliente acumuló nada.
  if (!config.enabled || config.serviceIds.length === 0) {
    return (
      <div className="flex flex-col gap-6 w-full">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Promociones</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Cuántos cortes lleva cada cliente y a quién le toca premio.
          </p>
        </div>
        <CollectionEmpty
          icon={<IconUsers className="w-8 h-8" />}
          title="El contador de cortes está apagado"
          description="Encendelo y elegí qué servicios cuentan para empezar a acumular. Los cortes ya vendidos se pueden recuperar con el botón de recalcular."
          action={{ label: "Ir a Configuración → Promociones", href: "/dashboard/settings/promociones" }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Promociones</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Cuántos cortes lleva cada cliente y a quién le toca premio.
          </p>
        </div>
        <Link
          href="/dashboard/settings/promociones"
          className="text-sm font-semibold text-primary hover:text-primary-dim transition-colors whitespace-nowrap"
        >
          Configurar promociones →
        </Link>
      </div>

      {error && <CollectionError message={error} onRetry={reintentar} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-on-surface-variant text-sm font-medium mb-1">Clientes acumulando</p>
          <h3 className="text-3xl font-bold text-on-surface tabular-nums">{rows.length}</h3>
        </div>
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-on-surface-variant text-sm font-medium mb-1">Les toca premio</p>
          <h3 className="text-3xl font-bold text-[#10b981] tabular-nums">{conPremio}</h3>
        </div>
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-on-surface-variant text-sm font-medium mb-1">Cortes acumulados</p>
          <h3 className="text-3xl font-bold text-on-surface tabular-nums">{totalCortes}</h3>
        </div>
      </div>

      <div className="bg-surface-container rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
        <div className="px-4 lg:px-6 py-4 border-b border-outline-variant/10 bg-surface-container-lowest">
          <div className="relative w-full sm:max-w-xs">
            <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full h-11 bg-surface-container border border-outline-variant/20 rounded-xl pl-11 pr-4 text-base lg:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <CollectionEmpty
            icon={<IconUsers className="w-8 h-8" />}
            title={query ? "Ningún cliente coincide" : "Todavía nadie acumuló cortes"}
            description={
              query
                ? "Probá con otro nombre."
                : "Los clientes aparecen acá en cuanto les cobres un servicio de los que cuentan, con el cliente elegido en la venta."
            }
          />
        ) : (
          <DataTable rows={rows} rowKey={(c) => c.id} minWidth={640} caption="Clientes por cortes acumulados" columns={columns} />
        )}
      </div>

      {confirmar && (
        <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#10b981]/10 flex items-center justify-center text-2xl">
                🎁
              </div>
              <h3 className="text-lg font-bold text-on-surface mb-2">Canjear premio</h3>
              <p className="text-sm text-on-surface-variant mb-2">
                <strong className="text-on-surface">{confirmar.full_name}</strong> llegó a{" "}
                {confirmar.progress} cortes y gana: <strong className="text-on-surface">{confirmar.reward}</strong>.
              </p>
              {/* Que el contador vuelva a cero es la consecuencia que hay que
                  entender ANTES de confirmar, no descubrir después. */}
              <p className="text-xs text-on-surface-variant mb-6 rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-3 py-2">
                Este corte <strong>no se cobra</strong>: no lo pases por el punto de venta. Al
                confirmar, su contador vuelve a <strong>0</strong> y empieza a acumular de nuevo.
                Los {confirmar.haircut_count} cortes de su historial no se tocan.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmar(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  disabled={canjeando}
                  onClick={async () => {
                    setCanjeando(true);
                    try {
                      const r = await redeemPromo(confirmar.id);
                      notifySuccess(
                        "Premio canjeado",
                        `${confirmar.full_name}: ${r.reward}. Su contador arranca de cero.`,
                      );
                      setConfirmar(null);
                      reintentar();
                    } catch (e) {
                      notifyError(
                        "No se pudo canjear",
                        e instanceof Error ? e.message : "Intentá de nuevo.",
                      );
                    } finally {
                      setCanjeando(false);
                    }
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary transition-colors disabled:opacity-50"
                >
                  {canjeando ? "Canjeando…" : "Confirmar canje"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
