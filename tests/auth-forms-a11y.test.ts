import test from "node:test";
import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LoginPage from "../app/(auth)/login/page";
import RegisterPage from "../app/(auth)/register/page";

// tsx runs the repository's preserved JSX using React's classic runtime.
Object.assign(globalThis, { React });

/** Cada `<label for="x">` tiene que apuntar a un control con `id="x"`. */
function assertLabelsAreLinked(html: string) {
  const fors = [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(fors.length > 0, "se esperaba al menos un label asociado");
  for (const id of fors) {
    assert.ok(
      new RegExp(`<input[^>]*\\bid="${id}"`).test(html),
      `el label for="${id}" no tiene un input con ese id`,
    );
  }
  const unlinked = [...html.matchAll(/<label(?![^>]*\bfor=)[^>]*>/g)];
  assert.equal(unlinked.length, 0, "hay labels sin htmlFor");
}

test("Login: labels asociados, autocomplete y botón de ojo con nombre accesible", () => {
  const html = renderToStaticMarkup(createElement(LoginPage));
  assertLabelsAreLinked(html);
  assert.match(html, /id="login-email"[^>]*autoComplete="email"|autoComplete="email"[^>]*id="login-email"/i);
  assert.match(html, /autoComplete="current-password"/i);
  assert.match(html, /aria-label="Mostrar contraseña"/);
});

test("Login: ya no ofrece el 'Recordarme' que no hacía nada", () => {
  const html = renderToStaticMarkup(createElement(LoginPage));
  assert.ok(!html.includes("Recordarme"));
  assert.ok(!html.includes('id="remember"'));
});

test("Login: el correo es controlado para sobrevivir al reset del form tras un error", () => {
  const html = renderToStaticMarkup(createElement(LoginPage));
  // Controlado → React lo renderiza con `value`; uno no controlado no lo trae.
  assert.match(html, /<input[^>]*id="login-email"[^>]*value=""/);
});

test("Registro: el enlace de Ayuda abre WhatsApp en vez de ir a '#'", () => {
  const html = renderToStaticMarkup(createElement(RegisterPage));
  assert.ok(!html.includes('href="#"'));
  const ayuda = html.match(/<a[^>]*href="([^"]+)"[^>]*>Ayuda<\/a>/);
  assert.ok(ayuda, "no se encontró el enlace de Ayuda");
  assert.match(ayuda[1], /^https:\/\/api\.whatsapp\.com\/send\?/);
  assert.match(ayuda[0], /target="_blank"/);
  assert.match(ayuda[0], /rel="noopener noreferrer"/);
});
