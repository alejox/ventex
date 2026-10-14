import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const templatesDirectory = join(process.cwd(), "app/[slug]/templates");
const logoRules = [
  ["MercadoTemplate.module.css", ".logo", 44],
  ["DespensaTemplate.module.css", ".logo", 44],
  ["OrganicoTemplate.module.css", ".logo", 44],
  ["templates.module.css", ".logo", 48],
  ["BarberModernTemplate.module.css", ".logo", 42],
  ["BarberArtesanalTemplate.module.css", ".brand img", 36],
  ["BarberUrbanaTemplate.module.css", ".brand img", 38],
] as const;

function declarations(file: string, selector: string): Map<string, string> {
  const css = readFileSync(join(templatesDirectory, file), "utf8");
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1];
  assert.ok(block, `${file} must define ${selector}`);

  return new Map(
    block.split(";").flatMap((declaration) => {
      const [property, ...value] = declaration.split(":");
      return property && value.length
        ? [[property.trim(), value.join(":").trim()]]
        : [];
    }),
  );
}

test("every public template keeps logo artwork proportional within its existing bounds", () => {
  for (const [file, selector, size] of logoRules) {
    const rule = declarations(file, selector);

    assert.equal(rule.get("object-fit"), "contain", `${file} must preserve the full logo`);
    assert.equal(rule.get("height"), `${size}px`, `${file} must keep its existing logo height`);
    assert.equal(rule.get("width"), `${size}px`, `${file} must keep its existing logo width`);
    assert.equal(rule.get("flex-shrink"), "0", `${file} must not shrink logos in flex rows`);
    assert.equal(rule.has("border-radius"), false, `${file} must not clip artwork corners`);
    assert.equal(rule.has("overflow"), false, `${file} must not clip artwork`);
  }
});
