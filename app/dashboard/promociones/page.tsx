"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePromosStore } from "@/stores/promos.store";
import { useProfile } from "@/components/ProfileProvider";
import { fetchPromoCustomers, toPromoRows } from "@/services/promo-customers.service";
import type { PromoCustomer } from "@/services/promo-customers.service";
import { renderPromoMessage, whatsappLink, milestoneFor } from "@/services/promos.service";
import { DataTable, type DataColumn } from "@/components/DataTable";
import { CollectionEmpty, CollectionError, CollectionLoading } from "@/components/CollectionState";
import { IconSearch, IconUsers } from "@/app/assets/icons/DashboardIcons";

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

  const [raw, setRaw] = useState<Pick<PromoCustomer, "id" | "full_name" | "phone" | "haircut_count">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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
    fetchAll();
    cargar();
  }, [fetchAll, cargar]);

  const rows = useMemo(() => {
    const conHitos = toPromoRows(raw, milestones);
    const q = query.trim().toLowerCase();
    return q ? conHitos.filter((c) => c.full_name.toLowerCase().includes(q)) : conHitos;
  }, [raw, milestones, query]);

  const conPremio = rows.filter((c) => c.reward).length;
  const totalCortes = rows.reduce((sum, c) => sum + c.haircut_count, 0);

  const linkFor = (c: PromoCustomer): string | null => {
    const hito = milestoneFor(c.haircut_count, milestones);
    const texto = renderPromoMessage(config.message, {
      cliente: c.full_name.split(" ")[0],
      cortes: c.haircut_count,
      negocio: profile?.businessName || "nuestro local",
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
      cell: (c) => c.haircut_count,
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
        // Sin teléfono no hay a dónde escribir: se dice por qué en vez de
        // ofrecer un botón que no puede hacer nada.
        return link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366]/10 text-[#16a34a] text-[11px] font-bold hover:bg-[#25D366] hover:text-white transition-colors whitespace-nowrap"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
            </svg>
            Escribir
          </a>
        ) : (
          <span className="text-[11px] text-on-surface-variant/60 whitespace-nowrap">Sin teléfono</span>
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
    </div>
  );
}
