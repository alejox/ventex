import test from "node:test";
import assert from "node:assert/strict";
import { editingSiteIdFrom, landingSearchFor, siteLinksView } from "../lib/site-links";

const site = (id: string, slug: string, published: boolean, site_name: string | null = null) => ({
  id,
  slug,
  site_name,
  published,
});

const base = { businessName: "Mi Salón", siteUrl: "https://www.ventex.app" };

test("no sites or no published site renders nothing (today's behavior)", () => {
  assert.deepEqual(siteLinksView([], base), { kind: "none" });
  assert.deepEqual(
    siteLinksView([site("a", "uno", false), site("b", "dos", false)], base),
    { kind: "none" },
  );
});

test("a single published site is a direct link", () => {
  const view = siteLinksView([site("a", "uno", true)], base);
  assert.equal(view.kind, "single");
  assert.equal(view.kind === "single" && view.link.href, "/uno");
});

test("two or more sites with at least one published open a menu listing all of them", () => {
  const view = siteLinksView(
    [site("a", "uno", false, "Eventos"), site("b", "dos", true), site("c", "tres", true, "  ")],
    base,
  );
  assert.equal(view.kind, "menu");
  if (view.kind !== "menu") return;
  // Published first (in stored order), drafts after.
  assert.deepEqual(view.links.map((link) => link.id), ["b", "c", "a"]);
  // Blank site names fall back to the business name.
  assert.deepEqual(view.links.map((link) => link.name), ["Mi Salón", "Mi Salón", "Eventos"]);
  assert.equal(view.links[0].displayUrl, "www.ventex.app/dos");
  assert.equal(view.links[2].published, false);
  assert.ok(view.links.every((link) => !link.editing));
});

test("the site open in the editor is listed first and marked as editing", () => {
  const view = siteLinksView(
    [site("a", "uno", true), site("b", "dos", true), site("c", "tres", false)],
    { ...base, editingSiteId: "c" },
  );
  assert.equal(view.kind, "menu");
  if (view.kind !== "menu") return;
  assert.deepEqual(view.links.map((link) => link.id), ["c", "a", "b"]);
  assert.deepEqual(view.links.map((link) => link.editing), [true, false, false]);
});

test("an unknown editing id does not reorder anything", () => {
  const view = siteLinksView([site("a", "uno", true), site("b", "dos", true)], {
    ...base,
    editingSiteId: "zzz",
  });
  assert.equal(view.kind === "menu" && view.links.map((link) => link.id).join(), "a,b");
});

test("editingSiteIdFrom only reads ?site= on the landing editor route", () => {
  assert.equal(editingSiteIdFrom("/dashboard/landing", "?site=abc"), "abc");
  assert.equal(editingSiteIdFrom("/dashboard/landing", "?new=1"), null);
  assert.equal(editingSiteIdFrom("/dashboard/sales", "?site=abc"), null);
  assert.equal(editingSiteIdFrom("/dashboard/landing", ""), null);
});

test("landingSearchFor writes the edited site so the header can find it", () => {
  assert.equal(landingSearchFor({ kind: "edit", id: "abc" }, ""), "?site=abc");
  // `tab` and the one-shot `instagram` result belong to the editor: kept.
  assert.equal(landingSearchFor({ kind: "edit", id: "abc" }, "?tab=sections&instagram=connected"), "?tab=sections&instagram=connected&site=abc");
  assert.equal(landingSearchFor({ kind: "list" }, "?site=abc"), "");
  assert.equal(landingSearchFor({ kind: "list" }, "?site=abc&tab=sections"), "");
  assert.equal(landingSearchFor({ kind: "new" }, "?site=abc"), "?new=1");
  // Unrelated params are kept.
  assert.equal(landingSearchFor({ kind: "edit", id: "b" }, "?site=a&utm=x"), "?utm=x&site=b");
  // Round trip with the header reader.
  assert.equal(editingSiteIdFrom("/dashboard/landing", landingSearchFor({ kind: "edit", id: "b" }, "")), "b");
});
