import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Switch } from "../components/ui/Switch";
import { Modal } from "../components/ui/Modal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Button, IconButton } from "../components/ui/Button";
Object.assign(globalThis, { React });

const noop = () => {};

test("Switch: role=switch y aria-checked refleja el estado", () => {
  const on = renderToStaticMarkup(<Switch checked onCheckedChange={noop} label="Desglosar IVA" />);
  assert.match(on, /role="switch"/);
  assert.match(on, /aria-checked="true"/);
  const off = renderToStaticMarkup(<Switch checked={false} onCheckedChange={noop} label="Desglosar IVA" />);
  assert.match(off, /aria-checked="false"/);
  assert.match(off, /bg-surface-container-highest/);
  assert.match(on, /bg-primary/);
});

test("Switch: el label visible es el nombre accesible", () => {
  const html = renderToStaticMarkup(<Switch id="iva" checked onCheckedChange={noop} label="Desglosar IVA" />);
  assert.match(html, /aria-labelledby="iva-label"/);
  assert.match(html, /<label[^>]*id="iva-label"[^>]*for="iva"[^>]*>Desglosar IVA<\/label>/);
});

test("Switch: acepta aria-labelledby o aria-label sin label visible", () => {
  const byRef = renderToStaticMarkup(<Switch checked={false} onCheckedChange={noop} aria-labelledby="titulo" />);
  assert.match(byRef, /aria-labelledby="titulo"/);
  const byLabel = renderToStaticMarkup(<Switch checked={false} onCheckedChange={noop} aria-label="Activo" />);
  assert.match(byLabel, /aria-label="Activo"/);
  assert.doesNotMatch(byLabel, /aria-labelledby/);
});

test("Switch: deshabilitado y con descripción", () => {
  const html = renderToStaticMarkup(
    <Switch id="s" checked onCheckedChange={noop} label="X" description="Ayuda" disabled />,
  );
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-describedby="s-desc"/);
});

test("Modal cerrado no renderiza nada", () => {
  assert.equal(renderToStaticMarkup(<Modal open={false} onClose={noop} title="Hola" />), "");
});

test("Modal: <dialog> con aria-labelledby apuntando al título", () => {
  const html = renderToStaticMarkup(
    <Modal open onClose={noop} title="Nuevo cliente" description="Completa los datos" footer={<button>Guardar</button>}>
      <p>cuerpo</p>
    </Modal>,
  );
  assert.match(html, /^<dialog/);
  assert.match(html, /aria-modal="true"/);
  const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1];
  assert.ok(labelledBy, "falta aria-labelledby");
  assert.match(html, new RegExp(`<h2 id="${labelledBy}"[^>]*>Nuevo cliente</h2>`));
  const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(describedBy, "falta aria-describedby");
  assert.match(html, new RegExp(`id="${describedBy}"[^>]*>Completa los datos`));
  assert.match(html, /aria-label="Cerrar"/);
  assert.match(html, /max-h-\[90vh\]/);
  assert.match(html, /overflow-y-auto/);
  assert.match(html, /Guardar/);
});

test("Modal: sin X ni describedby cuando no corresponde", () => {
  const html = renderToStaticMarkup(<Modal open onClose={noop} title="T" showCloseButton={false} />);
  assert.doesNotMatch(html, /aria-label="Cerrar"/);
  assert.doesNotMatch(html, /aria-describedby/);
});

test("ConfirmDialog conserva su API y se dibuja como alertdialog", () => {
  const html = renderToStaticMarkup(
    <ConfirmDialog
      open
      title="¿Eliminar producto?"
      description="No se puede deshacer."
      tone="danger"
      confirmLabel="Eliminar"
      onConfirm={noop}
      onCancel={noop}
    />,
  );
  assert.match(html, /role="alertdialog"/);
  assert.match(html, /¿Eliminar producto\?/);
  assert.match(html, /No se puede deshacer\./);
  assert.match(html, /Cancelar/);
  assert.match(html, /Eliminar<\/button>/);
  assert.match(html, /bg-error/);
  assert.equal(
    renderToStaticMarkup(<ConfirmDialog open={false} title="x" onConfirm={noop} onCancel={noop} />),
    "",
  );
});

test("ConfirmDialog en loading deshabilita ambos botones y muestra el texto de carga", () => {
  const html = renderToStaticMarkup(
    <ConfirmDialog open loading title="x" loadingLabel="Borrando…" onConfirm={noop} onCancel={noop} />,
  );
  assert.equal(html.match(/disabled=""/g)?.length, 2);
  assert.match(html, /Borrando…/);
  assert.match(html, /aria-busy="true"/);
});

test("Button: type=button por defecto y variantes", () => {
  const html = renderToStaticMarkup(<Button variant="danger">Borrar</Button>);
  assert.match(html, /type="button"/);
  assert.match(html, /bg-error/);
  assert.match(html, /focus-visible:ring-2/);
});

test("IconButton: aria-label obligatorio, 40px", () => {
  const html = renderToStaticMarkup(<IconButton aria-label="Editar" icon={<svg />} />);
  assert.match(html, /aria-label="Editar"/);
  assert.match(html, /title="Editar"/);
  assert.match(html, /h-10 w-10/);
});
