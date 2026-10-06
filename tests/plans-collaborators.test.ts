import assert from "node:assert/strict";
import test from "node:test";
import { collaboratorsLabel, isUnlimitedCollaborators, UNLIMITED_COLLABORATORS } from "../config/plans";

test("collaborator limits read like a person would say them", () => {
  assert.equal(collaboratorsLabel(0), "Solo tú");
  assert.equal(collaboratorsLabel(1), "Hasta 1 colaborador");
  assert.equal(collaboratorsLabel(8), "Hasta 8 colaboradores");
});

test("the unlimited sentinel is never shown as a number", () => {
  assert.equal(collaboratorsLabel(UNLIMITED_COLLABORATORS), "Colaboradores ilimitados");
  assert.equal(isUnlimitedCollaborators(UNLIMITED_COLLABORATORS), true);
  assert.equal(isUnlimitedCollaborators(8), false);
});
