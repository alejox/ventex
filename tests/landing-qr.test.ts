import assert from "node:assert/strict";
import test from "node:test";
import { BitMatrix, DecodeHintType, QRCodeReader } from "@zxing/library";
import type { BinaryBitmap } from "@zxing/library";
import { landingQr } from "../services/landing-qr.service";
import { absoluteUrl } from "../lib/site";

test("the downloadable SVG decodes to the absolute landing address", () => {
  for (const slug of ["mi-barberia", "tienda-la-esquina", "salon-ana-123"]) {
    const qr = landingQr(slug, "Barbería Ana & Hijos");
    const svg = decodeURIComponent(qr.dataUrl.split(",")[1]);
    const size = Number(svg.match(/viewBox="0 0 (\d+)/)?.[1]);
    const matrix = new BitMatrix(size, size);
    for (const cell of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
      matrix.set(Number(cell[1]), Number(cell[2]));
    }
    const decoded = new QRCodeReader().decode(
      { getBlackMatrix: () => matrix } as BinaryBitmap,
      new Map([[DecodeHintType.PURE_BARCODE, true]]),
    );
    assert.equal(decoded.getText(), absoluteUrl(`/${slug}`));
    assert.equal(decoded.getText(), qr.url);
    assert.ok(svg.includes("BARBERÍA ANA &amp; HIJOS</text>"));
    assert.ok(qr.height > qr.width);
    // Quiet zone must stay white on all four sides for reliable scanning.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (x < 4 || y < 4 || x >= size - 4 || y >= size - 4) {
          assert.equal(matrix.get(x, y), false);
        }
      }
    }
  }
});

test("business names are escaped and long names fit on multiple lines", () => {
  const qr = landingQr("mi-negocio", '<script>alert("hola")</script> & un negocio con nombre largo');
  const svg = decodeURIComponent(qr.dataUrl.split(",")[1]);
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&lt;SCRIPT&gt;"));
  assert.ok(svg.includes("&quot;HOLA&quot;"));
  assert.ok([...svg.matchAll(/<text /g)].length > 1);
});

test("the selected color is included in the downloadable QR", () => {
  const svg = decodeURIComponent(landingQr("test", "test", "#6b21a8").dataUrl.split(",")[1]);
  assert.ok(svg.includes('fill="#6b21a8" shape-rendering="crispEdges"'));
  assert.ok(svg.includes('fill="#6b21a8">TEST</text>'));
  const invalid = decodeURIComponent(landingQr("test", "test", '\"/><script/>').dataUrl.split(",")[1]);
  assert.ok(!invalid.includes("<script/>"));
  assert.ok(invalid.includes('fill="#000000"'));
});
