import { test } from "node:test";
import assert from "node:assert/strict";
import { createCatalogSave } from "../lib/product-form-save";

for (const kind of ["product", "service"]) {
  test(`${kind} retry updates the created identity with current fields and does not repeat initial stock`, async () => {
    const save = createCatalogSave<{ name: string; stock: number }>();
    const calls: unknown[] = [];
    const create = async (input: { name: string; stock: number }) => { calls.push(["create", input]); return "created-id"; };
    const update = async (id: string, input: { name: string; stock: number }) => { calls.push(["update", id, input]); return true; };
    assert.equal(await save.run(null, { name: "Original", stock: 24 }, create, update), "created-id");
    // A dependent recipe failure leaves the coordinator available for retry.
    assert.equal(await save.run(null, { name: "Changed", stock: 24 }, create, update), "created-id");
    assert.deepEqual(calls.map((call) => (call as unknown[])[0]), ["create", "update"]);
    assert.deepEqual(calls[1], ["update", "created-id", { name: "Changed", stock: 24 }]);
    assert.equal(save.createdId, "created-id");
  });
}
test("failed creation and failed updates keep a safe retry target", async () => {
  const save = createCatalogSave<string>();
  assert.equal(await save.run(null, "first", async () => false, async () => true), false);
  assert.equal(save.createdId, null);
  assert.equal(await save.run(null, "second", async () => "id", async () => true), "id");
  assert.equal(await save.run(null, "third", async () => { throw Error("must not create"); }, async () => false), false);
  assert.equal(save.createdId, "id");
});

test("uncertain recipe persistence is removed when retry turns the recipe off", async () => {
  const { recipeKindToRemove } = await import("../lib/product-form-save");
  let databaseRecipe: string | null = null;
  const attemptedKind = "sale";
  // The mutation committed, but refreshing recipes failed before the store cached it.
  databaseRecipe = attemptedKind;
  const cachedKind = null;
  const removal = recipeKindToRemove(cachedKind, attemptedKind, null);
  if (removal) databaseRecipe = null;
  assert.equal(removal, "sale");
  assert.equal(databaseRecipe, null);
  assert.equal(recipeKindToRemove(null, "production", "sale"), "production");
  assert.equal(recipeKindToRemove("sale", null, "sale"), null);
});
