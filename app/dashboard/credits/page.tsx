"use client";

import { useEffect, useMemo, useState } from "react";
import { IconClock, IconSearch } from "@/app/assets/icons/DashboardIcons";
import { useCreditsStore } from "@/stores/credits.store";
import { CustomerPaymentModal } from "@/components/CustomerPaymentModal";
import { DataTable, type DataColumn } from "@/components/DataTable";
import {
  CollectionEmpty,
  CollectionError,
  CollectionFilteredEmpty,
  CollectionLoading,
} from "@/components/CollectionState";
import {
  CREDIT_CHIP,
  creditAlertText,
  creditAvailable,
  creditLabelOf,
  creditStatusOf,
  creditSummary,
  renderStatementMessage,
} from "@/lib/credits";
import { businessDisplayName, whatsappLink } from "@/services/promos.service";
import { useProfile } from "@/components/ProfileProvider";
import { useSettingsStore } from "@/stores/settings.store";
import { CreditAlertEditor } from "./components/CreditAlertEditor";
import type { CreditRow } from "@/services/credits.service";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Las dos preguntas de la cartera, separadas.
 *
 * "Con deuda" es la operación de todos los días: a quién hay que cobrarle.
 * "Ya pagaron" es el ANTECEDENTE: quién fió y cumplió, que es con lo que se
 * decide si se le vuelve a fiar. Mezclarlas en una sola lista hace que la
 * primera deje de contestarse de un vistazo — y borrar al que pagó, que era lo
 * que pasaba antes, tira el antecedente a la basura.
 */
type Tab = "deuda" | "pagaron";

const TABS: { id: Tab; label: string }[] = [
  { id: "deuda", label: "Con deuda" },
  { id: "pagaron", label: "Ya pagaron" },
];

/**
 * Créditos: quién debe, cuánto, y el botón para cobrarlo.
 *
 * Es una pantalla de LECTURA más un cobro. La deuda no se edita a mano acá —ni
 * en ningún lado—: sube al vender fiado, baja al abonar y vuelve al anular la
 * venta, siempre desde la base. Un saldo que se puede escribir a dedo es un
 * saldo que puede dejar de coincidir con las ventas que lo formaron.
 */
export default function CreditsPage() {
  const rows = useCreditsStore((s) => s.rows);
  const loading = useCreditsStore((s) => s.loading);
  const error = useCreditsStore((s) => s.error);
  const submitting = useCreditsStore((s) => s.submitting);
  const detail = useCreditsStore((s) => s.detail);
  const detailLoading = useCreditsStore((s) => s.detailLoading);
  const fetchRows = useCreditsStore((s) => s.fetchRows);
  const loadDetail = useCreditsStore((s) => s.loadDetail);
  const registerPayment = useCreditsStore((s) => s.registerPayment);
  const setCreditAlert = useCreditsStore((s) => s.setCreditAlert);

  const profile = useProfile();
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  // El aviso lo administra el dueño: `set_credit_alert` rechaza al trabajador
  // en la base, así que ofrecerle el switch sería ofrecerle un error.
  const puedeEditarAviso = !profile?.isWorker;
  const negocio = businessDisplayName(
    settings?.business_profile?.businessName,
    profile?.businessName,
  );

  const [tab, setTab] = useState<Tab>("deuda");
  const [query, setQuery] = useState("");
  const [paymentCustomer, setPaymentCustomer] = useState<CreditRow | null>(null);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // El nombre del negocio va en el estado de cuenta que recibe el cliente.
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // El resumen se calcula sobre TODA la cartera y no sobre lo filtrado: buscar
  // un nombre o cambiar de pestaña no cambia cuánta plata hay en la calle, y un
  // total que se mueve al tipear es un total en el que nadie vuelve a confiar.
  const summary = useMemo(() => creditSummary(rows), [rows]);

  const conDeuda = useMemo(() => rows.filter((c) => c.credit_balance > 0), [rows]);
  const pagaron = useMemo(
    () => rows.filter((c) => c.credit_balance <= 0 && c.total_paid > 0),
    [rows],
  );

  const delTab = tab === "deuda" ? conDeuda : pagaron;

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return delTab;
    return delTab.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.identification ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [delTab, query]);

  const cliente: DataColumn<CreditRow> = {
    header: "Cliente",
    mobile: "title",
    sortKey: "nombre",
    className: "font-semibold text-on-surface",
    cell: (c) => (
      <>
        <div className="flex items-center gap-2">
          <span>{c.full_name}</span>
          {/* El aviso viaja pegado al nombre y no en una columna propia: es lo
              que hay que ver ANTES de decidir, y una columna más al final se
              lee después del monto — o no se lee. */}
          {c.credit_alert && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border bg-error/10 text-error border-error/30">
              <span aria-hidden>⚠</span>
              {creditAlertText(c.credit_alert_note)}
            </span>
          )}
        </div>
        <div className="text-xs font-normal text-on-surface-variant/70">
          {c.phone ?? c.identification ?? ""}
        </div>
      </>
    ),
  };

  const columnasDeuda: DataColumn<CreditRow>[] = [
    cliente,
    {
      header: "Debe",
      align: "right",
      mobile: "trailing",
      sortKey: "deuda",
      sortValue: (c) => c.credit_balance,
      className: "font-bold text-[#f59e0b]",
      cell: (c) => `$${money(c.credit_balance)}`,
    },
    {
      header: "Estado",
      align: "center",
      mobile: "badge",
      cell: (c) => {
        const status = creditStatusOf(c.credit_balance, c.credit_limit);
        return (
          <span
            className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border ${CREDIT_CHIP[status]}`}
          >
            {creditLabelOf(c.credit_balance, c.credit_limit)}
          </span>
        );
      },
    },
    {
      header: "Puede fiar",
      align: "right",
      mobile: "field",
      sortKey: "disponible",
      sortValue: (c) => creditAvailable(c.credit_balance, c.credit_limit) ?? Number.MAX_SAFE_INTEGER,
      className: "text-on-surface-variant tabular-nums",
      cell: (c) => {
        const disponible = creditAvailable(c.credit_balance, c.credit_limit);
        // Sin cupo configurado no hay número: decir "$0" leería como "no le
        // fíes más", que es lo contrario de lo que significa un cupo vacío.
        return disponible == null ? (
          <span className="text-on-surface-variant/50">Sin cupo</span>
        ) : (
          `$${money(disponible)}`
        );
      },
    },
    {
      header: "",
      align: "right",
      mobile: "actions",
      className: "pr-4",
      cell: (c) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPaymentCustomer(c);
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary hover:text-on-primary transition-colors"
        >
          Registrar abono
        </button>
      ),
    },
  ];

  const columnasPagaron: DataColumn<CreditRow>[] = [
    cliente,
    {
      header: "Pagó en total",
      align: "right",
      mobile: "trailing",
      sortKey: "pagado",
      sortValue: (c) => c.total_paid,
      className: "font-bold text-[#10b981]",
      cell: (c) => `$${money(c.total_paid)}`,
    },
    {
      header: "Último abono",
      align: "right",
      mobile: "field",
      sortKey: "ultimo",
      sortValue: (c) => c.last_payment_at ?? "",
      className: "text-on-surface-variant",
      cell: (c) => (c.last_payment_at ? fecha(c.last_payment_at) : "—"),
    },
    {
      header: "Estado",
      align: "center",
      mobile: "badge",
      cell: () => (
        <span
          className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border ${CREDIT_CHIP.al_dia}`}
        >
          Al día
        </span>
      ),
    },
  ];

  const columns = tab === "deuda" ? columnasDeuda : columnasPagaron;

  const detalle = (c: CreditRow) => {
    const cuenta = detail[c.id];
    if (detailLoading === c.id || !cuenta) {
      return (
        <p className="px-4 py-3 text-xs text-on-surface-variant">
          {detailLoading === c.id ? "Cargando la cuenta…" : "Sin datos de la cuenta."}
        </p>
      );
    }
    // El estado de cuenta se arma con el detalle que ya está en pantalla, así
    // que el cliente recibe exactamente lo mismo que el dueño está mirando.
    const texto = renderStatementMessage({
      cliente: c.full_name.split(" ")[0],
      negocio,
      balance: c.credit_balance,
      sales: cuenta.sales,
      payments: cuenta.payments,
    });
    const link = whatsappLink(c.phone, texto);

    return (
      <div className="px-4 py-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start gap-3">
          <div className="flex-1 min-w-0">
            <CreditAlertEditor
              alert={c.credit_alert}
              note={c.credit_alert_note}
              submitting={submitting}
              editable={puedeEditarAviso}
              onSave={(alerta, nota) => setCreditAlert(c.id, alerta, nota)}
            />
          </div>
          {/* Sin teléfono no hay a dónde mandar: se dice por qué, en vez de
              ofrecer un botón que no puede hacer nada. */}
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1da851] text-white text-xs font-bold transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-1.6-.8-2.7-1.5-3.8-3.4-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.4 1.9.8 2.6.9 3.5.8.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z" />
                <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
              </svg>
              Enviar estado de cuenta
            </a>
          ) : (
            <span className="shrink-0 text-xs text-on-surface-variant self-center">
              Sin teléfono: agregalo para poder escribirle.
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-bold text-on-surface mb-2">Se llevó fiado</p>
          {cuenta.sales.length === 0 ? (
            <p className="text-xs text-on-surface-variant">Sin ventas a crédito registradas.</p>
          ) : (
            <ul className="space-y-1.5">
              {cuenta.sales.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-on-surface-variant">
                    #{s.sale_number} · {fecha(s.created_at)}
                    {/* Un split solo dejó fiada una parte: mostrar el total
                        haría que la suma no cierre con la deuda. */}
                    {s.payment_method === "split" && (
                      <span className="ml-1 text-on-surface-variant/60">
                        (parcial de ${money(s.total)})
                      </span>
                    )}
                  </span>
                  <span className="font-semibold text-[#f59e0b] tabular-nums shrink-0">
                    ${money(s.credit_amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-xs font-bold text-on-surface mb-2">Abonó</p>
          {cuenta.payments.length === 0 ? (
            <p className="text-xs text-on-surface-variant">Todavía no hizo ningún abono.</p>
          ) : (
            <ul className="space-y-1.5">
              {cuenta.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-on-surface-variant">
                    {fecha(p.created_at)}
                    {p.notes && <span className="ml-1 text-on-surface-variant/60">· {p.notes}</span>}
                  </span>
                  <span className="font-semibold text-[#10b981] tabular-nums shrink-0">
                    −${money(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>
      </div>
    );
  };

  const carteraVacia = conDeuda.length === 0 && pagaron.length === 0;

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Créditos</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Quién te debe, cuánto, y desde cuándo. Cobrá un abono y la cuenta se actualiza sola.
          </p>
        </div>
      </div>

      {error && <CollectionError message={error} onRetry={fetchRows} />}

      {!loading && !error && !carteraVacia && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4">
              <p className="text-xs font-semibold text-on-surface-variant">Total por cobrar</p>
              <p className="mt-1 text-2xl font-bold text-[#f59e0b] tabular-nums">
                ${money(summary.totalPorCobrar)}
              </p>
            </div>
            <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4">
              <p className="text-xs font-semibold text-on-surface-variant">Clientes con deuda</p>
              <p className="mt-1 text-2xl font-bold text-on-surface tabular-nums">
                {summary.deudores}
              </p>
            </div>
            <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4">
              <p className="text-xs font-semibold text-on-surface-variant">Sin cupo disponible</p>
              <p
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  summary.excedidos > 0 ? "text-error" : "text-on-surface"
                }`}
              >
                {summary.excedidos}
              </p>
              {summary.excedidos > 0 && (
                <p className="mt-1 text-[11px] text-on-surface-variant">
                  El POS les va a rechazar la próxima venta a crédito.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div
              role="tablist"
              aria-label="Estado de la cuenta"
              className="flex gap-1 p-1 rounded-xl bg-surface-container-lowest border border-outline-variant/15 w-fit"
            >
              {TABS.map((t) => {
                const activa = tab === t.id;
                const cuantos = t.id === "deuda" ? conDeuda.length : pagaron.length;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={activa}
                    onClick={() => setTab(t.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      activa
                        ? "bg-primary text-on-primary"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {t.label}
                    <span className={`ml-1.5 ${activa ? "opacity-70" : "opacity-50"}`}>
                      {cuantos}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative flex-1">
              <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, documento o teléfono"
                className="w-full sm:max-w-sm bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 pl-9 pr-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </>
      )}

      {loading ? (
        <CollectionLoading label="Cargando la cartera…" />
      ) : error ? null : carteraVacia ? (
        <CollectionEmpty
          icon={<IconClock className="w-7 h-7" />}
          title="Nadie te debe nada"
          description="Cuando cobres una venta con el método “Crédito / Fiado” en el Punto de Venta, la deuda del cliente aparece acá."
        />
      ) : delTab.length === 0 ? (
        <CollectionFilteredEmpty
          title={tab === "deuda" ? "Nadie te debe nada" : "Todavía nadie saldó su cuenta"}
          description={
            tab === "deuda"
              ? "Toda la cartera está al día. Los que ya pagaron quedan en la otra pestaña."
              : "Acá van quedando los clientes que fiaron y terminaron de pagar."
          }
        />
      ) : filtrados.length === 0 ? (
        <CollectionFilteredEmpty action={{ label: "Limpiar búsqueda", onClick: () => setQuery("") }} />
      ) : (
        <DataTable
          // La key fuerza el remonte al cambiar de pestaña: las dos listas tienen
          // columnas distintas, y sin esto el orden elegido en una se aplicaba a
          // una columna que en la otra no existe.
          key={tab}
          columns={columns}
          rows={filtrados}
          rowKey={(c) => c.id}
          caption={tab === "deuda" ? "Clientes con deuda" : "Clientes que ya pagaron"}
          minWidth={760}
          onRowClick={(c) => loadDetail(c.id)}
          renderExpanded={detalle}
        />
      )}

      {paymentCustomer && (
        <CustomerPaymentModal
          customer={paymentCustomer}
          submitting={submitting}
          onConfirm={(amount, notes) => registerPayment(paymentCustomer.id, amount, notes)}
          onClose={() => setPaymentCustomer(null)}
        />
      )}
    </div>
  );
}
