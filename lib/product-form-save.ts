/** Retain a created catalog identity when a dependent recipe save fails. */
export function createCatalogSave<Input>() {
  let createdId: string | null = null;
  return {
    get createdId() { return createdId; },
    async run(
      editingId: string | null,
      input: Input,
      create: (input: Input) => Promise<string | false>,
      update: (id: string, input: Input) => Promise<boolean>,
    ): Promise<string | false> {
      const id = editingId ?? createdId;
      if (id) return (await update(id, input)) ? id : false;
      const result = await create(input);
      if (result) createdId = result;
      return result;
    },
  };
}

/** A failed post-mutation refresh does not prove the recipe was never saved. */
export function recipeKindToRemove(
  cachedKind: "sale" | "production" | null,
  attemptedKind: "sale" | "production" | null,
  nextKind: "sale" | "production" | null,
): "sale" | "production" | null {
  const previousKind = attemptedKind ?? cachedKind;
  return previousKind !== nextKind ? previousKind : null;
}
