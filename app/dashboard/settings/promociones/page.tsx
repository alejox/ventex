"use client";

import { useEffect, useMemo, useState } from "react";
import { usePromosStore } from "@/stores/promos.store";
import { useServicesStore } from "@/stores/services.store";
import { useProfile } from "@/components/ProfileProvider";
import { useSettingsStore } from "@/stores/settings.store";
import { usesHaircutPromos } from "@/config/business";
import type { RewardKind } from "@/services/promos.service";
import {
  PROMO_VARIABLES,
  renderPromoMessage,
  availableReward,
  businessDisplayName,
} from "@/services/promos.service";
import { CollectionError, CollectionLoading } from "@/components/CollectionState";
import { notifySuccess, notifyError } from "@/lib/notifications";
import { Select } from "@/components/ui/Select";
import { OffersManager } from "./OffersManager";
import { LoyaltyManager } from "./LoyaltyManager";
import type { MoneyFormatter } from "@/lib/money";
import { useFormatMoney } from "@/lib/useMoney";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  articlePlural,
  articleSingular,
  capitalize,
  defaultPromoMessageFor,
  howMany,
  promoNounFor,
  type PromoNoun,
} from "@/config/promo-nouns";
import { isPromoDraftDirty } from "./promo-draft";
import { Switch } from "@/components/ui/Switch";

/**
 * Configuración → Promociones.
 *
 * Tres decisiones y nada más: qué cuenta como corte, qué se le dice al cliente,
 * y qué premio hay en cada hito. El envío no se configura acá porque no hay
 * nada que configurar: es un enlace `wa.me` que abre WhatsApp con el mensaje
 * escrito, sin proveedor ni credenciales.
 *
 * `tienda` no tiene el motor de cortes (no agenda servicios de mostrador), así
 * que esta misma pestaña muestra en su lugar sus DOS promociones propias:
 * ofertas automáticas de producto (`OffersManager`, fase 1) y puntos
 * canjeables por compra (`LoyaltyManager`, fase 2). El resto de los rubros ve
 * exactamente lo de siempre.
 */
/**
 * Cómo se entrega cada premio. `texto` va primero y es el default a propósito:
 * "una cerveza" no se descuenta de la cuenta, y un hito guardado como `gratis`
 * sin que nadie lo eligiera regala un corte entero en la caja.
 */
const REWARD_KIND_OPTIONS: { value: RewardKind; label: string }[] = [
  { value: "texto", label: "Solo aviso" },
  { value: "gratis", label: "Servicio gratis" },
  { value: "porcentaje", label: "Porcentaje de descuento" },
  { value: "monto", label: "Monto de descuento" },
];

/**
 * La ayuda de cada variable dicha con la palabra del rubro. Solo cambia el
 * texto del tooltip: el token (`{cortes}`) es el mismo en todos los negocios.
 */
function variableHelp(token: string, help: string, noun: PromoNoun): string {
  const acumulados = noun.feminine ? "acumuladas" : "acumulados";
  if (token === "{cortes}") return `${capitalize(noun.plural)} ${acumulados} hacia el premio`;
  if (token === "{total}") return `${capitalize(noun.plural)} de por vida, sin reiniciar`;
  return help;
}

/** Cómo se lee en la lista de hitos lo que la caja va a hacer con el premio. */
function rewardKindLabel(
  m: { reward_kind: RewardKind; reward_value: number | null },
  formatMoney: MoneyFormatter,
): string {
  if (m.reward_kind === "gratis") return "Servicio gratis";
  if (m.reward_kind === "porcentaje") return `${m.reward_value ?? 0}% de descuento`;
  if (m.reward_kind === "monto") {
    return `${formatMoney(m.reward_value ?? 0)} de descuento`;
  }
  return "Solo aviso (se entrega a mano)";
}

export default function PromocionesPage() {
  const profile = useProfile();

  if (profile?.businessType === "tienda") {
    return (
      <div className="flex flex-col gap-8">
        <OffersManager />
        <LoyaltyManager />
      </div>
    );
  }

  if (!usesHaircutPromos(profile?.businessType ?? null, profile?.modules ?? null)) {
    // Rubro sin motor de cortes y sin ser tienda (p. ej. servicios con el
    // módulo `services` apagado a mano): no hay nada que configurar acá. La
    // pestaña ya está oculta en SettingsTabs; esto cubre la URL directa.
    return (
      <p className="text-sm text-on-surface-variant">
        Esta sección no aplica a tu tipo de negocio.
      </p>
    );
  }

  return <HaircutPromosSection />;
}

function HaircutPromosSection() {
  const money = useFormatMoney();
  const config = usePromosStore((s) => s.config);
  const milestones = usePromosStore((s) => s.milestones);
  const loading = usePromosStore((s) => s.loading);
  const submitting = usePromosStore((s) => s.submitting);
  const error = usePromosStore((s) => s.error);
  const fetchAll = usePromosStore((s) => s.fetchAll);
  const saveConfig = usePromosStore((s) => s.saveConfig);
  const addMilestone = usePromosStore((s) => s.addMilestone);
  const removeMilestone = usePromosStore((s) => s.removeMilestone);
  const recalc = usePromosStore((s) => s.recalc);

  const services = useServicesStore((s) => s.services);
  const fetchServices = useServicesStore((s) => s.fetchServices);
  const profile = useProfile();
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const { confirm, dialog } = useConfirm();

  // "Cortes" es la palabra de la barbería; cada rubro ve la suya. Solo copy:
  // la variable de plantilla sigue siendo `{cortes}` (ver config/promo-nouns).
  const noun = promoNounFor(profile?.businessType);
  const defaultMessage = defaultPromoMessageFor(noun);

  const [enabled, setEnabled] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [seeded, setSeeded] = useState(false);

  const [threshold, setThreshold] = useState("10");
  const [reward, setReward] = useState("");
  const [rewardKind, setRewardKind] = useState<RewardKind>("texto");
  const [rewardValue, setRewardValue] = useState("");

  useEffect(() => {
    fetchSettings();
    fetchAll();
    fetchServices();
  }, [fetchAll, fetchServices, fetchSettings]);

  // Siembra desde lo guardado, una sola vez: si corriera en cada render, lo que
  // el usuario está escribiendo se pisaría cuando el store se refresque.
  if (!loading && !seeded) {
    setSeeded(true);
    setEnabled(config.enabled);
    setServiceIds(config.serviceIds);
    setMessage(config.message ?? defaultMessage);
  }

  const dirty = isPromoDraftDirty(config, { enabled, serviceIds, message }, defaultMessage);

  const toggleService = (id: string) => {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  /**
   * La vista previa usa el hito más bajo configurado, no un 10 inventado: si el
   * negocio premia a los 5, mostrarle un ejemplo con 10 no le dice cómo se va a
   * ver su mensaje.
   */
  const preview = useMemo(() => {
    const umbral = milestones.filter((m) => m.is_active).map((m) => m.threshold).sort((a, b) => a - b)[0] ?? 10;
    const hito = availableReward(umbral, milestones);
    return renderPromoMessage(message, {
      cliente: "Juan",
      cortes: umbral,
      negocio: businessDisplayName(settings?.business_profile?.businessName, profile?.businessName),
      premio: hito?.reward ?? null,
    });
  }, [message, milestones, profile?.businessName, settings?.business_profile?.businessName]);

  const handleSave = async () => {
    const ok = await saveConfig({ enabled, serviceIds, message });
    if (ok) notifySuccess("Promociones guardadas", "Los cambios ya están activos.");
    else notifyError("No se pudo guardar", usePromosStore.getState().error ?? "Inténtalo de nuevo.");
  };

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(threshold, 10);
    if (!Number.isFinite(n) || n <= 0) {
      notifyError("Umbral inválido", "El hito tiene que ser un número mayor que cero.");
      return;
    }
    if (!reward.trim()) {
      notifyError("Falta el premio", "Escribe qué gana el cliente al llegar a ese hito.");
      return;
    }
    // Un porcentaje o un monto sin valor deja una promo que la caja va a
    // ignorar en silencio. La base lo rechaza; acá se explica antes.
    const necesitaValor = rewardKind === "porcentaje" || rewardKind === "monto";
    const valor = necesitaValor ? parseFloat(rewardValue) : null;
    if (necesitaValor && (!Number.isFinite(valor as number) || (valor as number) <= 0)) {
      notifyError("Falta el valor", "Un descuento por porcentaje o monto necesita un número mayor que cero.");
      return;
    }
    if (rewardKind === "porcentaje" && (valor as number) > 100) {
      notifyError("Porcentaje inválido", "El porcentaje tiene que estar entre 1 y 100.");
      return;
    }
    const ok = await addMilestone({ threshold: n, reward, reward_kind: rewardKind, reward_value: valor });
    if (ok) {
      setReward("");
      setRewardValue("");
      notifySuccess("Hito agregado", `A ${articlePlural(noun)} ${n} ${noun.plural}: ${reward.trim()}`);
    } else {
      notifyError("No se pudo agregar", usePromosStore.getState().error ?? "¿Ya existe un hito con ese número?");
    }
  };

  const handleRemoveMilestone = async (m: { id: string; threshold: number; reward: string }) => {
    const ok = await confirm({
      title: `¿Eliminar el hito de ${m.threshold} ${noun.plural}?`,
      description: `Deja de ofrecerse "${m.reward}" de inmediato. Los premios ya canjeados no cambian.`,
      tone: "danger",
      confirmLabel: "Eliminar hito",
    });
    if (!ok) return;
    if (!(await removeMilestone(m.id))) {
      notifyError("No se pudo eliminar", usePromosStore.getState().error ?? "Inténtalo de nuevo.");
    }
  };

  const handleRecalc = async () => {
    // El botón deshabilitado ya lo impide; queda como red por si el estado
    // cambió entre el render y el clic.
    if (dirty) return;
    const ok = await confirm({
      title: "¿Recalcular todos los contadores?",
      description: (
        <>
          <p>
            Se reescribe el contador de TODOS tus clientes a partir del historial de ventas, con
            la configuración guardada. Lo que cada cliente lleve hoy se reemplaza por el resultado.
          </p>
          <p>Los premios ya canjeados se respetan.</p>
        </>
      ),
      confirmLabel: "Recalcular",
    });
    if (!ok) return;
    const n = await recalc();
    if (n === null) {
      notifyError("No se pudo recalcular", usePromosStore.getState().error ?? "Inténtalo de nuevo.");
      return;
    }
    notifySuccess(
      "Contadores recalculados",
      `${n} cliente${n !== 1 ? "s" : ""} actualizado${n !== 1 ? "s" : ""} desde el historial de ventas.`,
    );
  };

  if (loading) return <CollectionLoading label="Cargando promociones…" />;

  // Con el contador apagado lo que sigue no tiene efecto hasta encenderlo: se
  // atenúa para que se lea así, pero sigue editable para dejarlo listo.
  const dimmed = enabled ? "" : "opacity-60";

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {error && <CollectionError message={error} onRetry={fetchAll} />}
      {dialog}

      {/* 1. El interruptor */}
      <section className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="promo-enabled-label" className="text-base font-bold text-on-surface">
              Contador de {noun.plural}
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              Cuenta {howMany(noun)} {noun.plural} lleva cada cliente y te deja enviárselo por
              WhatsApp desde su ficha.
            </p>
            {!enabled && (
              <p className="text-xs text-on-surface-variant mt-2">
                Está apagado: lo de abajo no se aplica hasta que lo enciendas y guardes.
              </p>
            )}
          </div>
          <Switch
            aria-labelledby="promo-enabled-label"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
      </section>

      {/* 2. Qué cuenta */}
      <section className={`bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6 transition-opacity ${dimmed}`}>
        <h2 className="text-base font-bold text-on-surface">¿Qué cuenta como {noun.singular}?</h2>
        <p className="text-sm text-on-surface-variant mt-1 mb-4">
          Elige los servicios que suman al contador. Si no marcas ninguno, el contador no sube:
          preferimos que lo decidas tú a adivinarlo por el nombre.
        </p>

        {services.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            Todavía no tienes servicios en tu catálogo. Crea uno en Productos y servicios y vuelve aquí.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {services.map((s) => {
              const on = serviceIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  aria-pressed={on}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. El mensaje */}
      <section className={`bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6 transition-opacity ${dimmed}`}>
        <h2 className="text-base font-bold text-on-surface">El mensaje</h2>
        <p className="text-sm text-on-surface-variant mt-1 mb-3">
          Se abre en WhatsApp con este texto ya escrito. Lo envías tú: nada sale solo.
        </p>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
          placeholder={defaultMessage}
        />
        <div className="flex flex-wrap gap-2 mt-3">
          {PROMO_VARIABLES.map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => setMessage((m) => `${m}${m.endsWith(" ") || !m ? "" : " "}${v.token}`)}
              title={variableHelp(v.token, v.help, noun)}
              className="px-2.5 py-1 rounded-lg bg-surface-container-lowest border border-outline-variant/20 text-xs font-mono text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors"
            >
              {v.token}
            </button>
          ))}
        </div>
        {noun.plural !== "cortes" && (
          <p className="mt-2 text-xs text-on-surface-variant">
            Las variables se llaman igual en todos los negocios. En el tuyo,{" "}
            <code className="font-mono">{"{cortes}"}</code> es la cantidad de {noun.plural} que el
            cliente lleva hacia el premio y <code className="font-mono">{"{total}"}</code>{" "}
            {articlePlural(noun)} {noun.plural} de toda su historia.
          </p>
        )}

        {/* Un mensaje sin {premio} NO puede anunciar el corte gratis, por más
            hitos que haya configurados. Pasó de verdad: el editor precarga el
            texto por defecto, guardarlo lo congela, y una mejora posterior del
            default ya no lo alcanza. */}
        {milestones.length > 0 && !message.includes("{premio}") && (
          <p role="alert" className="mt-3 text-xs rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-on-surface">
            <strong>Tienes hitos configurados pero el mensaje no incluye {"{premio}"}</strong>, así que
            el cliente nunca se va a enterar de que ganó. Agrégalo con el botón {"{premio}"} de arriba.
          </p>
        )}

        <div className="mt-4 rounded-xl bg-[#075E54]/10 border border-[#25D366]/20 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant mb-1.5">
            Vista previa
          </p>
          <p className="text-sm text-on-surface whitespace-pre-wrap">{preview}</p>
        </div>
      </section>

      {/* 4. Los hitos */}
      <section className={`bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6 transition-opacity ${dimmed}`}>
        <h2 className="text-base font-bold text-on-surface">Hitos y premios</h2>
        <p className="text-sm text-on-surface-variant mt-1 mb-4">
          Qué gana el cliente al llegar a cierta cantidad de {noun.plural}. Aparece en el mensaje
          con la variable <code className="font-mono text-xs">{"{premio}"}</code>. Los hitos se
          guardan al instante, sin el botón de abajo.
        </p>

        {milestones.length > 0 && (
          <ul className="divide-y divide-outline-variant/10 mb-4 rounded-xl border border-outline-variant/15 overflow-hidden">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span className="shrink-0 w-14 text-sm font-bold text-primary tabular-nums">
                  {m.threshold}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-on-surface truncate">
                    {m.reward}
                    <span className="ml-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary align-middle">
                      {rewardKindLabel(m, money)}
                    </span>
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    Al canjearlo se descuentan {m.threshold} {noun.plural}.{" "}
                    {capitalize(articleSingular(noun))} {noun.singular} que paga el premio no
                    cuenta; lo que el cliente haya pagado de más arranca el conteo siguiente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveMilestone(m)}
                  disabled={submitting}
                  aria-label={`Eliminar el hito de ${m.threshold} ${noun.plural}`}
                  className="shrink-0 text-xs font-semibold text-error-dim hover:text-error transition-colors disabled:opacity-50"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddMilestone} className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
          <div className="sm:w-28">
            <label htmlFor="promo-threshold" className="text-[13px] font-semibold text-on-surface block mb-1.5">
              {capitalize(noun.plural)}
            </label>
            <input
              id="promo-threshold"
              type="number"
              min="1"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="promo-reward" className="text-[13px] font-semibold text-on-surface block mb-1.5">
              Premio
            </label>
            <input
              id="promo-reward"
              type="text"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder={`Ej. ${articleSingular(noun)} ${noun.singular} va por la casa`}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/50"
            />
          </div>
          <div className="sm:w-56">
            <Select
              label="¿Cómo se entrega el premio?"
              value={rewardKind}
              onChange={(e) => {
                setRewardKind(e.target.value as RewardKind);
                setRewardValue("");
              }}
            >
              {REWARD_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          {(rewardKind === "porcentaje" || rewardKind === "monto") && (
            <div className="sm:w-32">
              <label htmlFor="promo-reward-value" className="text-[13px] font-semibold text-on-surface block mb-1.5">
                {rewardKind === "porcentaje" ? "Porcentaje (%)" : "Monto ($)"}
              </label>
              <input
                id="promo-reward-value"
                type="number"
                min="1"
                max={rewardKind === "porcentaje" ? 100 : undefined}
                step="any"
                value={rewardValue}
                onChange={(e) => setRewardValue(e.target.value)}
                placeholder={rewardKind === "porcentaje" ? "Ej. 50" : "Ej. 10000"}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-base sm:text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/50"
              />
            </div>
          )}
          <div className="flex items-end gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="mb-0 px-5 py-2.5 rounded-xl text-sm font-semibold bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              Agregar
            </button>
          </div>
        </form>
      </section>

      {/* 5. El histórico */}
      <section className={`bg-surface-container rounded-2xl border border-outline-variant/10 p-5 sm:p-6 transition-opacity ${dimmed}`}>
        <h2 className="text-base font-bold text-on-surface">Clientes que ya venían</h2>
        <p className="text-sm text-on-surface-variant mt-1 mb-4">
          Recalcula el contador de {noun.plural} de todos tus clientes leyendo tu historial de
          ventas. Úsalo después de cambiar qué servicios cuentan, o para no arrancar a todos en
          cero.
        </p>
        <button
          type="button"
          onClick={handleRecalc}
          disabled={submitting || dirty}
          aria-describedby={dirty ? "promo-recalc-dirty" : undefined}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Procesando…" : "Recalcular desde el historial"}
        </button>
        {dirty && (
          <p id="promo-recalc-dirty" className="mt-2 text-xs text-on-surface-variant">
            Tienes cambios sin guardar. Guárdalos primero: el recálculo usa la configuración
            guardada y, con la anterior, dejaría mal los contadores.
          </p>
        )}
      </section>

      <div className="flex items-center justify-end gap-4">
        {dirty && <span className="text-sm text-on-surface-variant">Tienes cambios sin guardar</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting || !dirty}
          className="px-8 py-3 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_20px_rgba(96,99,238,0.25)] transition-all disabled:opacity-50"
        >
          {submitting ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
