import test from "node:test";
import assert from "node:assert/strict";

// El helper lee el env en la primera llamada, no al importar, así que alcanza
// con dejarlo puesto antes de que corra el primer test.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://omnnucpkdxbqzekzyopt.supabase.co";
import { esImagenAjena } from "../lib/remoteImage";

/**
 * El micrositio de un negocio devolvió HTTP 500 a todos sus visitantes porque
 * UN producto tenía la foto en un host que `next/image` no tenía declarado: el
 * componente no degrada la imagen, lanza y tumba el render. Estas pruebas
 * marcan qué se saca del optimizador para que eso no pueda repetirse.
 */

test("una foto de otro dominio se saca del optimizador", () => {
  assert.equal(
    esImagenAjena("https://images.openfoodfacts.org/images/products/770/front.400.jpg"),
    true,
  );
});

test("lo que está en nuestro Storage sigue optimizándose", () => {
  assert.equal(
    esImagenAjena("https://omnnucpkdxbqzekzyopt.supabase.co/storage/v1/object/public/p/a.webp"),
    false,
  );
});

test("las rutas relativas son nuestras", () => {
  assert.equal(esImagenAjena("/sites/moderno/barber-hero.webp"), false);
  assert.equal(esImagenAjena("/landing/og.jpg"), false);
});

test("sin imagen no hay nada que decidir", () => {
  for (const vacio of [null, undefined, ""]) assert.equal(esImagenAjena(vacio), false);
});

test("una URL rota se trata como ajena: que falle una imagen, no la página", () => {
  // `next/image` también lanza con una src que no parsea. Sacarla del
  // optimizador deja, como mucho, un hueco en la grilla.
  for (const rota of ["http://", "no-es-una-url", "https://"]) {
    assert.equal(esImagenAjena(rota), true, rota);
  }
});

test("un host que solo TERMINA igual que el nuestro es ajeno", () => {
  // `evil-omnnucpkdxbqzekzyopt.supabase.co` y `supabase.co.atacante.com` no son
  // nuestro Storage: la comparación es por host exacto, no por sufijo.
  assert.equal(esImagenAjena("https://evil-omnnucpkdxbqzekzyopt.supabase.co/x.jpg"), true);
  assert.equal(esImagenAjena("https://omnnucpkdxbqzekzyopt.supabase.co.atacante.com/x.jpg"), true);
});
