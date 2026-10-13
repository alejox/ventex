"use client";

import { useState, type ReactNode } from "react";
import { SidebarNavGroup, type NavGroupModel } from "./SidebarNavGroup";
import { initialMobileGroup, toggleMobileGroup } from "../lib/mobile-navigation";

// Hide the parent, not an inline-flex button with competing display utilities.
export function DesktopHeaderActions({ children }: { children: ReactNode }) {
  return <div className="hidden lg:flex items-center gap-3 min-w-0">{children}</div>;
}

export function MobileDrawerContent({ context, search, navigation, tools }: { context: ReactNode; search: ReactNode; navigation: ReactNode; tools: ReactNode }) {
  return <>
    <div className="px-4 pt-4 space-y-3">{context}{search}</div>
    {navigation}
    <section aria-label="Herramientas" className="px-4 py-4 border-t border-divider grid grid-cols-2 gap-1">{tools}</section>
  </>;
}

// Mounted only while the drawer is open: desktop preferences never leak in.
export function MobileSidebarNavigation({ groups, activeNavId, icons, onNavigate }: {
  groups: NavGroupModel[];
  activeNavId: string | null;
  icons: React.ComponentProps<typeof SidebarNavGroup>["icons"];
  onNavigate: () => void;
}) {
  const [openGroup, setOpenGroup] = useState(() => initialMobileGroup(groups, activeNavId));
  return <nav aria-label="Navegación principal" className="p-4 space-y-1">
    {groups.map((group) => <SidebarNavGroup
      key={group.id}
      group={group}
      activeNavId={activeNavId}
      open={openGroup === group.id}
      onToggle={(id) => setOpenGroup((current) => toggleMobileGroup(current, id))}
      onNavigate={onNavigate}
      icons={icons}
      controlled
      idPrefix="mobile"
    />)}
  </nav>;
}
