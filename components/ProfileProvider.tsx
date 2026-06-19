"use client";

import { createContext, useContext } from "react";
import type { Profile } from "@/config/business";

const ProfileContext = createContext<Profile | null>(null);

/**
 * Provee el perfil obtenido en el servidor (layout del dashboard) a los
 * Client Components hijos sin que ninguno haga I/O. Datos de solo lectura;
 * las mutaciones van por profile.service vía un store.
 */
export function ProfileProvider({
  profile,
  children,
}: {
  profile: Profile | null;
  children: React.ReactNode;
}) {
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}

export function useProfile(): Profile | null {
  return useContext(ProfileContext);
}
