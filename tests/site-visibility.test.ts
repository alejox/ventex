import test from "node:test";
import assert from "node:assert/strict";
import { flagsPatch, showOnSiteOf } from "../services/inventory.service";
import type { NewProductInput } from "../services/inventory.service";
import { servicePayload } from "../services/services.service";
import type { NewServiceInput } from "../services/services.service";

test("1. Sin la columna (fila vieja o null) el ítem se muestra en el sitio", () => {
  // La columna nace con default true: un catálogo existente no puede
  // desaparecer del sitio público por leer un valor ausente como apagado.
  assert.equal(showOnSiteOf({}), true);
  assert.equal(showOnSiteOf({ show_on_site: undefined }), true);
  assert.equal(showOnSiteOf({ show_on_site: null }), true);
  assert.equal(showOnSiteOf({ show_on_site: true }), true);
});

test("2. Apagado se respeta", () => {
  assert.equal(showOnSiteOf({ show_on_site: false }), false);
});

test("3. El apagado viaja al guardar producto y servicio; ausente no toca la columna", () => {
  const product = { tracks_stock: true } as unknown as NewProductInput;
  assert.equal(flagsPatch({ ...product, show_on_site: false }).show_on_site, false);
  assert.equal(flagsPatch({ ...product, show_on_site: true }).show_on_site, true);
  assert.equal("show_on_site" in flagsPatch(product), false);

  const service: NewServiceInput = {
    name: "Corte",
    description: "",
    price: "20000",
    duration_minutes: "30",
    status: "active",
    has_commission: false,
    commission_type: "percentage",
    commission_value: "",
    image_url: null,
  };
  assert.equal(servicePayload({ ...service, show_on_site: false }).show_on_site, false);
  assert.equal("show_on_site" in servicePayload(service), false);
});
