import { BarcodeFormat, QRCodeWriter } from "@zxing/library";
import { absoluteUrl } from "@/lib/site";

/** Generates a shareable QR locally, with a four-module quiet zone. */
export function landingQr(slug: string, businessName = "", color = "#000000") {
  const url = absoluteUrl(`/${encodeURIComponent(slug)}`);
  const matrix = new QRCodeWriter().encode(url, BarcodeFormat.QR_CODE, 0, 0, new Map());
  const size = matrix.getWidth();
  const cells: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (matrix.get(x, y)) cells.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  const ink = /^#[0-9a-f]{6}$/i.test(color) ? color : "#000000";
  const name = Array.from(businessName.trim().replace(/\s+/g, " ").toLocaleUpperCase("es"));
  const lines: string[] = [];
  for (let i = 0; i < name.length; i += 24) lines.push(name.slice(i, i + 24).join(""));
  const escapeXml = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
  const label = lines.map((line, index) => `<text x="${size / 2}" y="${size + 2 + index * 3}" text-anchor="middle" font-family="Arial, sans-serif" font-size="2.2" font-weight="700" fill="${ink}">${escapeXml(line)}</text>`).join("");
  const height = size + (lines.length ? lines.length * 3 + 3 : 0);
  // Name stays outside the quiet zone so it cannot interfere with scanning.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="${Math.ceil(1024 * height / size)}" viewBox="0 0 ${size} ${height}"><rect width="100%" height="100%" fill="white"/><path d="${cells.join("")}" fill="${ink}" shape-rendering="crispEdges"/>${label}</svg>`;
  return { url, dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: size, height };
}
