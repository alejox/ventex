"use client";

import { createContext, useContext, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Tiñe la barra del sistema (móvil / app instalada) con el fondo del tema
 * ACTIVO (A21). El color se lee de `--background` ya aplicado, así que el hex
 * vive solo en globals.css. El <meta> lo crea el script `theme-init` de
 * app/layout.tsx; si faltara, se crea acá.
 */
function syncThemeColorMeta() {
  const color = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  if (!color) return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = color;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // El tema ya lo aplicó el script síncrono de app/layout.tsx antes de hidratar:
  // lo leemos del DOM (lazy init) para sincronizar el estado sin parpadeo.
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document !== "undefined") {
      return (document.documentElement.getAttribute("data-theme") as Theme) || "dark";
    }
    return "dark";
  });

  const toggleTheme = () => {
    const newTheme: Theme = theme === "light" ? "dark" : "light";
    try {
      localStorage.setItem("theme", newTheme);
    } catch {
      // Modo privado o almacenamiento bloqueado: el tema cambia igual, solo no se recuerda.
    }
    const root = document.documentElement;
    root.setAttribute("data-theme", newTheme);
    root.classList.toggle("dark", newTheme === "dark");
    syncThemeColorMeta();
    setTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
