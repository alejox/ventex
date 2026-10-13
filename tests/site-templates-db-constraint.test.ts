import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { SITE_TEMPLATES } from "../services/public-site.types";

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

/**
 * `business_sites_draft_config_valid` / `_published_config_valid` whitelist the
 * template ids in SQL. A template that exists in code but not there saves with
 * "violates check constraint" — that is how `mercado`/`organico` shipped broken.
 * The newest migration redefining the constraint is the one that holds.
 */
test("every site template is allowed by the latest business_sites config constraint", () => {
  const latest = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS, file), "utf8"))
    .filter((sql) => /add constraint business_sites_draft_config_valid/i.test(sql))
    .at(-1);
  assert.ok(latest, "no migration defines business_sites_draft_config_valid");
  for (const template of SITE_TEMPLATES) {
    assert.ok(latest.includes(`'${template}'`), `template "${template}" is missing from the constraint`);
  }
});
