import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseSidebarCollapsed } from "../lib/sidebar";
import { ShellUserMenu } from "../components/ShellUserMenu";
import { HEADER_ICON_BUTTON } from "../components/ui/HeaderIconButton";
import { SUPPORT_FAB_CLEARANCE } from "../components/SupportFab";
Object.assign(globalThis, { React });

test("sidebar: sin cookie arranca expandido (A24)", () => {
  assert.equal(parseSidebarCollapsed(undefined), false);
  assert.equal(parseSidebarCollapsed("true"), true);
  assert.equal(parseSidebarCollapsed("false"), false);
});

test("menú de usuario: botón de menú con nombre y foco visible (A9)", () => {
  const html = renderToStaticMarkup(<ShellUserMenu name="Ana Pérez" email="ana@x.co" />);
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-label="Menú de usuario de Ana Pérez"/);
  assert.match(html, /focus-visible:ring-primary-ink/);
});

test("botones del header: 40px y anillo con el rol de tinta (A18)", () => {
  assert.match(HEADER_ICON_BUTTON, /\bh-10\b/);
  assert.match(HEADER_ICON_BUTTON, /\bw-10\b/);
  assert.match(HEADER_ICON_BUTTON, /focus-visible:ring-primary-ink/);
});

test("el espacio del botón de soporte sobrevive al p-4 sm:p-6 lg:p-10 del main", () => {
  assert.match(SUPPORT_FAB_CLEARANCE, /(^| )pb-/);
  assert.match(SUPPORT_FAB_CLEARANCE, /sm:pb-/);
  assert.match(SUPPORT_FAB_CLEARANCE, /lg:pb-/);
});
