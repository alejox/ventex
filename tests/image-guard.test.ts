import test from "node:test";
import assert from "node:assert/strict";
import { verificarPeso, toWebp } from "../lib/image";

const archivo = (bytes: number, type = "image/jpeg", name = "foto.jpg") =>
  new File([new Uint8Array(bytes)], name, { type });

/**
 * `toWebp` necesita un lienzo, así que la conversión en sí solo se puede probar
 * en el navegador. Lo que SÍ se puede fijar acá es todo lo que decide sin
 * lienzo: qué formatos no se tocan, y cuándo se rechaza por peso.
 */

test("un SVG no se convierte: rasterizarlo lo deja fijo y borroso", async () => {
  const svg = archivo(50_000, "image/svg+xml", "logo.svg");
  assert.equal(await toWebp(svg), svg, "devuelve el MISMO archivo, sin tocar");
});

test("un GIF no se convierte: el lienzo se queda con el primer cuadro", async () => {
  const gif = archivo(400_000, "image/gif", "promo.gif");
  assert.equal(await toWebp(gif), gif);
});

test("un WebP chico ya está listo y se deja pasar", async () => {
  const webp = archivo(120_000, "image/webp", "ya-optimizada.webp");
  assert.equal(await toWebp(webp), webp);
});

test("fuera del navegador devuelve el original en vez de romper la subida", async () => {
  // En Node no hay `document`. Subir una foto pesada es peor que no subirla,
  // pero mucho mejor que perder la carga con un error.
  const jpg = archivo(3_000_000);
  assert.equal(await toWebp(jpg), jpg);
});

test("dentro del límite no dice nada", () => {
  assert.doesNotThrow(() => verificarPeso(archivo(1_000_000), 2 * 1024 * 1024));
});

test("justo en el límite pasa: el tope es inclusivo, como el del bucket", () => {
  const tope = 2 * 1024 * 1024;
  assert.doesNotThrow(() => verificarPeso(archivo(tope), tope));
});

test("pasado de peso avisa en castellano, con los dos números", () => {
  assert.throws(
    () => verificarPeso(archivo(5 * 1024 * 1024), 2 * 1024 * 1024),
    (e: Error) => {
      // El mensaje de Storage dice "The object exceeded the maximum allowed
      // size": quien sube la foto de su barbero desde el celular necesita saber
      // cuánto pesa y cuánto se permite.
      assert.match(e.message, /5\.0 MB/);
      assert.match(e.message, /2\.0 MB/);
      assert.match(e.message, /pesa|máximo/i);
      assert.doesNotMatch(e.message, /object|bytes|exceeded/i);
      return true;
    },
  );
});
