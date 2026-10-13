export function initialMobileGroup(groups: readonly { id: string; items: readonly { id: string }[] }[], activeNavId: string | null): string | null {
  return groups.find((group) => group.items.some((item) => item.id === activeNavId))?.id ?? null;
}

export function toggleMobileGroup(openGroup: string | null, groupId: string): string | null {
  return openGroup === groupId ? null : groupId;
}
