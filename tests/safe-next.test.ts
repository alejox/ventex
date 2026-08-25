import test from "node:test";
import assert from "node:assert/strict";
import { isSafeNext } from "../lib/safe-next";

/**
 * `next` decide a dónde va alguien DESPUÉS de autenticarse, y el valor viaja en
 * la URL — o sea que lo puede escribir cualquiera. Sin validación es un redirect
 * abierto: el clásico es mandar `/login?next=https://falso/login`, que entrega
 * la sesión en Ventex y después deposita a la persona en una copia del login
 * pidiendo la clave otra vez, con el dominio real ya visitado dándole confianza.
 */

test("1. Una ruta interna pasa, con query y hash incluidos", () => {
  // El caso REAL que motivó todo esto: volver del checkout de ePayco.
  assert.equal(isSafeNext("/dashboard/subscription?pay=abb06132-f0c2-463d"), true);
  assert.equal(isSafeNext("/dashboard/pos"), true);
  assert.equal(isSafeNext("/"), true);
  assert.equal(isSafeNext("/dashboard/sales#top"), true);
});

test("2. Una URL absoluta a otro dominio NO pasa", () => {
  assert.equal(isSafeNext("https://sitio-falso.com/login"), false);
  assert.equal(isSafeNext("http://sitio-falso.com"), false);
});

test("3. El protocol-relative NO pasa, aunque empiece con barra", () => {
  // `//sitio` parece interna y el navegador la resuelve como OTRO dominio.
  // Es la forma en que se cuela un redirect abierto que valida "empieza con /".
  assert.equal(isSafeNext("//sitio-falso.com"), false);
  assert.equal(isSafeNext("//sitio-falso.com/login"), false);
});

test("4. La variante con barra invertida tampoco", () => {
  // Algunos navegadores normalizan `\` a `/`, así que `/\sitio` termina
  // siendo `//sitio`.
  assert.equal(isSafeNext("/" + "\\" + "sitio-falso.com"), false);
});

test("5. Un esquema peligroso no se cuela", () => {
  assert.equal(isSafeNext("javascript:alert(1)"), false);
  assert.equal(isSafeNext("data:text/html,<script>"), false);
});

test("6. Los caracteres de control quedan afuera", () => {
  // Un salto de línea puede partir la cabecera Location en dos.
  assert.equal(isSafeNext("/dashboard" + String.fromCharCode(10) + "Location: https://falso"), false);
  assert.equal(isSafeNext("/dashboard" + String.fromCharCode(13)), false);
  assert.equal(isSafeNext("/dashboard" + String.fromCharCode(0)), false);
});

test("7. Vacío o ausente cae al destino por defecto", () => {
  // No es un fallo: es que no había destino y quien llama usa su default.
  assert.equal(isSafeNext(""), false);
  assert.equal(isSafeNext(null), false);
  assert.equal(isSafeNext(undefined), false);
  assert.equal(isSafeNext("dashboard/pos"), false, "relativa sin barra inicial");
});
