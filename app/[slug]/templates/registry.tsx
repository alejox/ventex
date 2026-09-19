import type { PublicSite } from "@/services/public-site.types";
import { BarberArtesanalTemplate } from "./BarberArtesanalTemplate";
import { BarberModernTemplate } from "./BarberModernTemplate";
import { BarberUrbanaTemplate } from "./BarberUrbanaTemplate";
import { FallspaTemplate } from "./FallspaTemplate";
import { QutterTemplate } from "./QutterTemplate";
import { RasmTemplate } from "./RasmTemplate";

export function SiteTemplateRenderer({ site, preview = false }: { site: PublicSite; preview?: boolean }) {
  switch (site.template) {
    case "fallspa": return <FallspaTemplate site={site} preview={preview} />;
    case "qutter": return <QutterTemplate site={site} preview={preview} />;
    case "barberia": return <BarberModernTemplate site={site} preview={preview} />;
    case "barberia-artesanal": return <BarberArtesanalTemplate site={site} preview={preview} />;
    case "barberia-urbana": return <BarberUrbanaTemplate site={site} preview={preview} />;
    default: return <RasmTemplate site={site} preview={preview} />;
  }
}
