/**
 * Redes sociales del micrositio: de lo que el dueño escribe a un enlace usable.
 *
 * El dueño escribe cualquier cosa — `@minegocio`, `minegocio`,
 * `instagram.com/minegocio` o la URL completa — y todas tienen que terminar en
 * un enlace que abra. Por eso se guarda el texto crudo y la URL se arma acá:
 * el formulario le devuelve lo mismo que escribió y no hay que migrar datos si
 * mañana cambia la forma del enlace.
 *
 * SEGURIDAD: este valor lo escribe el dueño y termina en un `href` de una página
 * PÚBLICA. `socialHref` sólo devuelve URLs `http`/`https`; cualquier otro
 * esquema (`javascript:`, `data:`) devuelve null y el enlace no se pinta.
 */

export const SOCIAL_NETWORKS = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "twitter",
  "linkedin",
  "telegram",
  "website",
] as const;

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

interface SocialMeta {
  /** Nombre que ve el usuario, en el formulario y en el sitio público. */
  label: string;
  /** Ejemplo en el input: enseña el formato sin obligarlo. */
  placeholder: string;
  /** Dominio propio de la red: si el texto ya lo trae, es una URL pegada. */
  domain: string;
  /**
   * Prefijo al que se le pega el usuario suelto. En TikTok y YouTube el `@` es
   * parte de la URL, así que va acá: al texto del usuario siempre se le saca.
   */
  handleBase: string;
}

export const SOCIAL_META: Record<SocialNetwork, SocialMeta> = {
  instagram: {
    label: "Instagram",
    placeholder: "@minegocio",
    domain: "instagram.com",
    handleBase: "https://instagram.com/",
  },
  facebook: {
    label: "Facebook",
    placeholder: "facebook.com/minegocio",
    domain: "facebook.com",
    handleBase: "https://facebook.com/",
  },
  tiktok: {
    label: "TikTok",
    placeholder: "@minegocio",
    domain: "tiktok.com",
    handleBase: "https://tiktok.com/@",
  },
  youtube: {
    label: "YouTube",
    placeholder: "@minegocio",
    domain: "youtube.com",
    handleBase: "https://youtube.com/@",
  },
  twitter: {
    label: "X (Twitter)",
    placeholder: "@minegocio",
    domain: "x.com",
    handleBase: "https://x.com/",
  },
  linkedin: {
    label: "LinkedIn",
    placeholder: "linkedin.com/company/minegocio",
    domain: "linkedin.com",
    // Un nombre suelto se asume empresa: es lo que tiene un negocio, no un
    // perfil personal.
    handleBase: "https://linkedin.com/company/",
  },
  telegram: {
    label: "Telegram",
    placeholder: "@minegocio",
    domain: "t.me",
    handleBase: "https://t.me/",
  },
  website: {
    label: "Sitio web",
    placeholder: "minegocio.com",
    domain: "",
    handleBase: "https://",
  },
};

/** Sólo `http` y `https` llegan a un `href`. Todo lo demás es null. */
function safeUrl(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** ¿El texto ya es una dirección y no un usuario suelto? */
function looksLikeUrl(value: string, domain: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return true;
  if (value.startsWith("www.")) return true;
  if (domain && value.toLowerCase().includes(domain)) return true;
  return value.includes("/") && value.includes(".");
}

/**
 * @returns la URL a abrir, o null si el campo está vacío o el texto no puede
 *   convertirse en un enlace seguro.
 */
export function socialHref(network: SocialNetwork, value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const meta = SOCIAL_META[network];

  if (looksLikeUrl(raw, meta.domain)) {
    // Sin esquema no se puede parsear: se asume https, que es lo que quiso
    // decir quien pegó "instagram.com/minegocio".
    return safeUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`);
  }

  const handle = raw.replace(/^@+/, "");
  if (!handle) return null;
  // "Sitio web" no tiene usuarios: sin un punto no es un dominio y armar
  // "https://mi sitio" sólo produce un enlace roto.
  if (network === "website" && !handle.includes(".")) return null;
  // El usuario va codificado: un espacio o un acento no pueden romper la URL.
  return safeUrl(`${meta.handleBase}${encodeURIComponent(handle)}`);
}

/** Los valores cargados, en orden fijo y ya convertidos a enlace. */
export function socialLinksOf(
  source: Partial<Record<SocialNetwork, string | null>>,
): { network: SocialNetwork; label: string; href: string }[] {
  return SOCIAL_NETWORKS.flatMap((network) => {
    const href = socialHref(network, source[network]);
    if (!href) return [];
    return [{ network, label: SOCIAL_META[network].label, href }];
  });
}
