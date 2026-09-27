import type { MetadataRoute } from "next";

/**
 * Manifiesto de la PWA. Next lo sirve en /manifest.webmanifest y lo enlaza solo
 * desde el <head>, así que no hay que declarar el <link rel="manifest">.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ventex — Gestión especializada",
    short_name: "Ventex",
    description:
      "Herramientas de gestión para la operación de tu negocio. Disponible en escritorio y celular.",
    // start_url apunta al POS: es la pantalla con la que se abre el turno.
    start_url: "/dashboard/pos",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#17171c",
    theme_color: "#17171c",
    lang: "es",
    dir: "ltr",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android recorta el 20% exterior: el maskable lleva el logo más chico.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Nueva venta",
        short_name: "Vender",
        url: "/dashboard/pos",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Productos y servicios",
        short_name: "Catálogo",
        url: "/dashboard/inventory",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Ventas",
        short_name: "Ventas",
        url: "/dashboard/sales",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
