import type { ReactNode } from "react";

/**
 * El documento legal: encabezado, fecha y el cuerpo ya tipografiado.
 *
 * La tipografía se declara UNA vez con variantes de descendiente
 * (`[&_h2]:...`) en vez de repetir las clases en cada uno de los ~20 títulos y
 * párrafos de cada documento. El proyecto no tiene el plugin `typography` de
 * Tailwind, y agregarlo por dos páginas sería traer una dependencia para algo
 * que se resuelve acá. Consecuencia buscada: las páginas quedan como HTML
 * semántico plano y el estilo no se puede desincronizar entre una y otra.
 *
 * Los colores salen de los tokens del tema (`text-on-surface`, `text-primary`,
 * `border-outline-variant`), así que estas páginas siguen el modo claro/oscuro
 * como el resto de la app — los HTML originales traían su propia paleta y su
 * propio `prefers-color-scheme`, que ignoraba el tema elegido por el usuario.
 */
export function LegalDoc({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <article
      className={[
        "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-on-surface [&_h2]:mt-10 [&_h2]:mb-3",
        "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-on-surface [&_h3]:mt-6 [&_h3]:mb-2",
        "[&_p]:text-[0.975rem] [&_p]:leading-relaxed [&_p]:text-on-surface-variant [&_p]:mb-3.5",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3.5 [&_ul]:space-y-1.5",
        "[&_li]:text-[0.975rem] [&_li]:leading-relaxed [&_li]:text-on-surface-variant",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary-dim",
        "[&_strong]:text-on-surface [&_strong]:font-semibold",
      ].join(" ")}
    >
      <p className="text-sm font-bold text-primary mb-1.5">Ventex</p>
      <h1 className="text-3xl font-bold tracking-tight text-on-surface mb-2">{title}</h1>
      <p className="text-sm text-on-surface-variant mb-10">Última actualización: {updatedAt}</p>
      {children}
    </article>
  );
}

/**
 * El aviso de que el texto es una plantilla y falta revisión legal.
 *
 * Se mantiene VISIBLE en la página publicada, tal como venía en los documentos
 * originales. Esconderlo mientras el texto siga sin revisar sería aparentar una
 * revisión que no ocurrió — y quien lo lea es el dueño de Ventex, que es
 * justamente quien tiene que acordarse de mandarlo a revisar.
 */
export function LegalNotice({ children }: { children: ReactNode }) {
  return (
    <aside className="rounded-xl border border-outline-variant/20 bg-surface-container px-5 py-4 my-6 [&_p]:mb-0">
      <p className="text-[0.975rem] leading-relaxed text-on-surface-variant">
        <strong className="text-on-surface font-semibold">Aviso:</strong> {children}
      </p>
    </aside>
  );
}
