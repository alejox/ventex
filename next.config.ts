import type { NextConfig } from "next";

/**
 * Product photos and business logos live in Supabase Storage, and the public
 * micro-site renders them through `next/image`. That component refuses any host
 * not declared here, so the pattern is derived from the project URL rather than
 * hardcoded — pointing the app at a different Supabase project must not require
 * a code change. Scoped to the public storage prefix: nothing else is an image.
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  /**
   * La raíz del workspace se fija a mano porque detectarla sola falla acá.
   *
   * Turbopack la deduce buscando el lockfile más cercano hacia arriba, y en esta
   * máquina hay un `package-lock.json` huérfano en el home (vacío, sin
   * `package.json` ni `node_modules` al lado, de un `npm install` corrido por
   * error ahí). Con eso elegía `/Users/alejox` como raíz — y la doc de Turbopack
   * es explícita en que los archivos fuera de la raíz NO se resuelven.
   *
   * El síntoma era un `Cannot find module '@swc/helpers-<hash>/...'` en dev, con
   * el módulo presente en disco: la caché persistente guardaba un alias hasheado
   * resuelto contra la raíz equivocada, y ni reiniciar el server lo limpiaba
   * (esa caché sobrevive el reinicio a propósito) — había que borrar `.next`.
   *
   * Fijarla acá lo vuelve reproducible: no depende de qué archivos tenga cada
   * quien en su home.
   */
  turbopack: {
    root: __dirname,
  },
  images: {
    /**
     * AVIF first, WebP as the fallback. The default is `['image/webp']` alone,
     * which would re-encode every source to WebP and throw away the ~40% AVIF
     * saves on the landing photos. Order matters: the first entry the browser's
     * `Accept` header matches is the one served, so Safari/Firefox still get
     * WebP. Cost is a slower first encode per size and a second cached variant
     * per image — both amortised after the first request.
     */
    formats: ["image/avif", "image/webp"],
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
