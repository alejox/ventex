import assert from "node:assert/strict";
import test from "node:test";
import { publicSiteFromRpc } from "../services/public-site.types";

const about = { title: "Nuestra esencia", description: "Somos un negocio familiar.", imageUrl: "https://x.supabase.co/a.webp" };

test("the saved about section survives the RPC's top-level about string", () => {
  // public_site_by_slug merges published_config with a top-level `about` STRING,
  // which overwrites config.about; the untouched snapshot travels in `config`.
  const site = publicSiteFromRpc({
    version: 1,
    template: "mercado",
    about: about.description,
    config: { version: 1, template: "mercado", about },
  });
  assert.deepEqual(site.config.about, about);
  assert.equal(site.about, about.description);
});

test("older RPC payloads without `config` still normalize", () => {
  const site = publicSiteFromRpc({ version: 1, template: "rasm", about: "Texto" });
  assert.equal(site.config.template, "rasm");
  assert.equal(site.about, "Texto");
});

test("missing categories become an empty list and timeFormat is coerced", () => {
  const site = publicSiteFromRpc({ version: 1, template: "rasm", timeFormat: "nope" });
  assert.deepEqual(site.categories, []);
  assert.equal(site.timeFormat, "12");
});
