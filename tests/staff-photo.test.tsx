import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaffPhotoField } from "../components/StaffPhotoField";
import { validateStaffPhotoFile } from "../lib/staff-photo";

test("staff photos accept PNG, JPEG and WebP without a pre-compression size cap", () => {
  for (const type of ["image/png", "image/jpeg", "image/webp"]) {
    assert.equal(validateStaffPhotoFile({ type, size: 12 * 1024 * 1024 }), null);
  }
});

test("staff photo field exposes a keyboard picker, upload hints and initials", () => {
  const html = renderToStaticMarkup(<StaffPhotoField value={null} nombre="Jane Doe" onChange={() => {}} />);
  assert.match(html, /type="button"/);
  assert.match(html, /aria-label="Subir foto"/);
  assert.match(html, /aria-describedby=/);
  assert.match(html, />JD<\/span>/);
  assert.match(html, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(html, /Arrastra una imagen/);
  assert.doesNotMatch(html, /capture=/);
});

test("disabled staff photos retain the saved image and disable every action", () => {
  const html = renderToStaticMarkup(<StaffPhotoField value="https://example.com/saved.webp" nombre="Jane" disabled onChange={() => {}} />);
  assert.match(html, /src="https:\/\/example.com\/saved.webp"/);
  assert.match(html, /aria-label="Cambiar foto"/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
  assert.match(html, /Quitar/);
});

test("staff photos reject empty and unsupported files", () => {
  assert.equal(validateStaffPhotoFile({ type: "image/png", size: 0 }), "empty");
  for (const type of ["application/pdf", "image/svg+xml", "image/gif", ""]) {
    assert.equal(validateStaffPhotoFile({ type, size: 100 }), "unsupported");
  }
});
