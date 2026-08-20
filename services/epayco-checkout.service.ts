/**
 * Apertura del Smart Checkout de ePayco en el navegador.
 *
 * Es la mitad de cliente de un flujo que empieza en el servidor: `/api/billing/
 * subscribe` crea la sesión y devuelve un `sessionId`; acá se carga el script de
 * ePayco y se le entrega ese id.
 *
 * Por qué existe este archivo y no un `window.location`: ePayco NO devuelve una
 * URL de checkout — el `sessionId` sólo lo sabe abrir `checkout-v2.js`. Ir al
 * checkout no es una asignación, es una dependencia de terceros que hay que
 * cargar, esperar y poder fallar.
 *
 * El script se carga BAJO DEMANDA, recién cuando alguien va a pagar. Montarlo en
 * el layout costaría una request a un tercero en cada visita para una pantalla
 * que la enorme mayoría no abre nunca.
 */

const CHECKOUT_SCRIPT = "https://checkout.epayco.co/checkout-v2.js";

/**
 * `onpage` abre el checkout en un modal sobre Ventex; `standard` redirige al
 * sitio de ePayco y vuelve a la `response` URL.
 *
 * Se usa `standard` a propósito: es el que conserva el flujo que ya está
 * probado —el pagador vuelve a `?pay=<orden>` y el modal retoma en modo
 * polling—, incluido el caso del invitado que paga desde la landing. `onpage`
 * es mejor experiencia, pero no está verificado cómo termina (si redirige a la
 * `response` URL o se queda en la página), y cambiarlo a ciegas rompería el
 * retorno. Es un cambio de una línea cuando se compruebe en sandbox.
 */
export type EpaycoCheckoutType = "onpage" | "standard";

interface EpaycoCheckoutHandler {
  open: () => void;
}

interface EpaycoGlobal {
  checkout: {
    configure: (config: {
      sessionId: string;
      type: EpaycoCheckoutType;
      test?: boolean;
    }) => EpaycoCheckoutHandler;
  };
}

declare global {
  interface Window {
    ePayco?: EpaycoGlobal;
  }
}

let loading: Promise<EpaycoGlobal> | null = null;

/**
 * Carga `checkout-v2.js` una sola vez.
 *
 * La promesa se cachea para que dos clics seguidos no inyecten dos scripts,
 * pero se DESCARTA si falla: si no, un fallo de red momentáneo dejaría la
 * promesa rechazada en memoria y el botón de pagar no volvería a funcionar
 * hasta recargar la página.
 */
function loadCheckoutScript(): Promise<EpaycoGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("El checkout sólo puede abrirse en el navegador."));
  }
  if (window.ePayco) return Promise.resolve(window.ePayco);

  loading ??= new Promise<EpaycoGlobal>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_SCRIPT}"]`,
    );

    const onReady = () => {
      if (window.ePayco) resolve(window.ePayco);
      else reject(new Error("El checkout de ePayco no se inicializó."));
    };
    const onFail = () => reject(new Error("No pudimos cargar el checkout de ePayco."));

    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", onFail, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.addEventListener("load", onReady, { once: true });
    script.addEventListener("error", onFail, { once: true });
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });

  return loading;
}

/**
 * Abre el checkout para una sesión ya creada en el servidor.
 *
 * Con `type: "standard"` esto NAVEGA fuera de Ventex, así que el código que
 * venga después puede no ejecutarse nunca. Lo que sí corre siempre es el
 * `throw` cuando el script no carga: ese caso tiene que volver al formulario con
 * un mensaje, no dejar al usuario mirando un spinner eterno.
 */
export async function openEpaycoCheckout(params: {
  sessionId: string;
  test: boolean;
  type?: EpaycoCheckoutType;
}): Promise<void> {
  const epayco = await loadCheckoutScript();

  epayco.checkout
    .configure({
      sessionId: params.sessionId,
      type: params.type ?? "standard",
      test: params.test,
    })
    .open();
}
