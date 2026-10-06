import assert from "node:assert/strict";
import test from "node:test";
import { defaultLandingConfig, normalizeLandingConfig } from "../services/public-site.types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("a page without catalog filters shows everything", () => {
  assert.deepEqual(defaultLandingConfig().catalog, { serviceCategoryIds: [], productCategoryIds: [], staffIds: [] });
  assert.deepEqual(normalizeLandingConfig({}).catalog, { serviceCategoryIds: [], productCategoryIds: [], staffIds: [] });
});

test("catalog filters keep valid uuids, drop junk and duplicates", () => {
  const { catalog } = normalizeLandingConfig({
    catalog: { serviceCategoryIds: [A, A, "no-es-uuid", 5, B], productCategoryIds: "x", staffIds: [B] },
  });
  assert.deepEqual(catalog.serviceCategoryIds, [A, B]);
  assert.deepEqual(catalog.productCategoryIds, []);
  assert.deepEqual(catalog.staffIds, [B]);
});
