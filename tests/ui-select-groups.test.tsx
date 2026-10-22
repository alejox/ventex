import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Select, groupHeaderBefore, readOptions } from "../components/ui/Select";
Object.assign(globalThis, { React });

const noop = () => {};

// Markup de un Select plano capturado ANTES de agregar grupos y estilos: los
// llamadores que ya existen tienen que verse idénticos.
const FLAT_BASELINE = "<div class=\"space-y-1.5 \"><label for=\"_R_0_\" class=\"block text-[13px] font-semibold text-on-surface\">Método</label><button id=\"_R_0_\" type=\"button\" role=\"combobox\" aria-haspopup=\"listbox\" aria-expanded=\"false\" aria-describedby=\"_R_0_-desc\" class=\"relative w-full flex items-center bg-surface-container-lowest text-left text-on-surface\n          border transition-colors focus:outline-none focus:ring-2\n          disabled:opacity-50 disabled:cursor-not-allowed\n          h-11 pl-4 pr-10 text-base lg:text-sm rounded-xl\n          border-outline-variant/30 focus:border-primary-ink focus:ring-primary-ink/25 \n          \"><span class=\"truncate \">Tarjeta</span><svg aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" viewBox=\"0 0 24 24\" class=\"pointer-events-none absolute top-1/2 -translate-y-1/2 text-on-surface-variant transition-transform\n            right-3.5 w-4 h-4\n            \"><polyline points=\"6 9 12 15 18 9\"></polyline></svg></button><p id=\"_R_0_-desc\" class=\"text-xs text-on-surface-variant\">Elige uno</p></div>";

test("un Select plano se renderiza exactamente como antes", () => {
  const html = renderToStaticMarkup(
    <Select label="Método" hint="Elige uno" value="b" onChange={noop}>
      <option value="a">Efectivo</option>
      <option value="b">Tarjeta</option>
    </Select>,
  );
  assert.equal(html, FLAT_BASELINE);
});

test("readOptions de opciones planas no agrega grupo ni estilo", () => {
  const options = readOptions([<option key="a" value="a">Efectivo</option>, <option key="b" value="b" disabled>Tarjeta</option>]);
  assert.deepEqual(options, [
    { value: "a", label: "Efectivo", disabled: false },
    { value: "b", label: "Tarjeta", disabled: true },
  ]);
});

test("readOptions aplana los optgroup y marca el grupo de cada opción", () => {
  const options = readOptions([
    <option key="n" value="">Ninguna</option>,
    <optgroup key="g1" label="Elegantes"><option value="p">Playfair</option><option value="c">Cormorant</option></optgroup>,
    <optgroup key="g2" label="Manuscritas"><option value="d" style={{ fontFamily: "Dancing" }}>Dancing</option></optgroup>,
  ]);
  assert.deepEqual(options.map((o) => [o.value, o.group]), [["", undefined], ["p", "Elegantes"], ["c", "Elegantes"], ["d", "Manuscritas"]]);
  assert.deepEqual(options[3].style, { fontFamily: "Dancing" });
});

test("el encabezado de grupo va antes de la primera opción visible de cada grupo", () => {
  const options = readOptions([
    <option key="n" value="">Ninguna</option>,
    <optgroup key="g1" label="Elegantes"><option value="p">Playfair</option><option value="c">Cormorant</option></optgroup>,
    <optgroup key="g2" label="Manuscritas"><option value="d">Dancing</option></optgroup>,
  ]);
  assert.deepEqual(options.map((_, i) => groupHeaderBefore(options, i)), [null, "Elegantes", null, "Manuscritas"]);
  // Filtrado por búsqueda: solo queda un grupo, y solo ese lleva encabezado.
  const filtered = options.filter((o) => o.label.includes("Dan"));
  assert.deepEqual(filtered.map((_, i) => groupHeaderBefore(filtered, i)), ["Manuscritas"]);
});

test("el estilo de la opción elegida pasa a la etiqueta del botón", () => {
  const html = renderToStaticMarkup(
    <Select value="d" onChange={noop} aria-label="Fuente">
      <optgroup label="Manuscritas"><option value="d" style={{ fontFamily: "Dancing" }}>Dancing</option></optgroup>
    </Select>,
  );
  assert.match(html, /<span class="truncate " style="font-family:Dancing">Dancing<\/span>/);
});

test("aria-describedby externo se suma al del texto de ayuda", () => {
  const html = renderToStaticMarkup(
    <Select value="a" onChange={noop} hint="Ayuda" aria-describedby="externo"><option value="a">A</option></Select>,
  );
  const ids = html.match(/aria-describedby="([^"]+)"/)?.[1].split(" ");
  assert.equal(ids?.length, 2);
  assert.ok(ids?.includes("externo"));
});
