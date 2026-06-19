"use client";

import Link from "next/link";
import { LogoHorizontal, LogoVertical } from "@/components/Logo";
import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  IconHome,
  IconCreditCard,
  IconBox,
  IconDollar,
  IconUsers,
  IconCalendar,
  IconSettings,
  IconSearch,
  IconBell,
  IconHelpCircle,
  IconMenu,
  IconLogOut,
  IconShoppingCart,
} from "@/app/assets/icons/DashboardIcons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { signout } from "@/utils/supabase/actions";
import { useSessionStore } from "@/stores/session.store";

// ---- Navigation config: which modules need which nav items ----
const ALL_NAV = [
  { name: "Panel", href: "/dashboard", icon: IconHome, modules: [] as string[] },
  { name: "Punto de Venta", href: "/dashboard/pos", icon: IconCreditCard, modules: ["ecommerce"] },
  { name: "Ventas", href: "/dashboard/sales", icon: IconShoppingCart, modules: ["ecommerce"] },
  { name: "Inventario", href: "/dashboard/inventory", icon: IconBox, modules: ["inventory"] },
  { name: "Finanzas", href: "/dashboard/finance", icon: IconDollar, modules: [] as string[] },
  { name: "Clientes", href: "/dashboard/customers", icon: IconUsers, modules: [] as string[] },
  { name: "Distribuidores", href: "/dashboard/distributors", icon: IconBox, modules: ["inventory"] },
  { name: "Calendario", href: "/dashboard/calendar", icon: IconCalendar, modules: ["appointments"] },
];

// Business types that always get POS (physical sales)
const POS_TYPES = ["tienda", "lavaautos"];

function filterNavigation(businessType: string | null, modules: Record<string, boolean> | null) {
  return ALL_NAV.filter((item) => {
    // Items with no module requirement are always shown
    if (item.modules.length === 0) return true;
    // Check if any of the item's required modules are enabled
    return item.modules.some((m) => {
      // Special case: POS/Ventas shown for physical sales types OR if ecommerce module enabled
      if (m === "ecommerce") {
        return modules?.ecommerce || POS_TYPES.includes(businessType || "");
      }
      return modules?.[m] || false;
    });
  });
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const user = useSessionStore((s) => s.user);
  const loadSession = useSessionStore((s) => s.loadSession);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const userName = user?.name ?? "Admin";
  const userEmail = user?.email ?? "";

  const navigation = useMemo(
    () => filterNavigation(user?.businessType ?? null, user?.modules ?? null),
    [user?.businessType, user?.modules],
  );

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-background text-on-background font-sans">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-64 flex-col justify-between border-r border-outline-variant/10 bg-surface-container-lowest transition-all">
        <div>
          <div className="h-20 flex items-center px-8 border-b border-outline-variant/10">
            <LogoHorizontal className="w-[110px] h-[30px]" />
          </div>
          <nav className="p-4 space-y-1">
            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-4 px-4 mt-4">
              Menú Principal
            </div>
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-outline-variant/10">
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
          >
            <IconSettings className="w-5 h-5" />
            Configuración
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-20 flex items-center justify-between px-6 lg:px-10 border-b border-outline-variant/10 bg-surface-container-lowest sticky top-0 z-20">
          <div className="flex items-center gap-4 lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-on-surface-variant hover:text-on-surface"
            >
              <IconMenu className="w-6 h-6" />
            </button>
            <LogoVertical className="w-[50px] h-[24px]" />
          </div>

          <div className="hidden lg:flex flex-1 max-w-xl">
            <div className="relative w-full">
              <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Buscar en Ventex..."
                className="w-full bg-surface-container border border-outline-variant/20 rounded-full py-2.5 pl-11 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 ml-auto">
            <ThemeToggle />
            <button className="text-on-surface-variant hover:text-on-surface transition-colors relative">
              <IconBell className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-error border-2 border-surface-container-lowest"></span>
            </button>
            <button className="hidden sm:block text-on-surface-variant hover:text-on-surface transition-colors">
              <IconHelpCircle className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-outline-variant/20 hidden sm:block"></div>
            <div className="relative">
              <button
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="flex items-center gap-3 group focus:outline-none"
              >
                <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center overflow-hidden transition-colors group-hover:border-primary/60">
                  <span className="text-xs font-bold text-primary">{initials}</span>
                </div>
                <span className="hidden sm:block text-sm font-medium text-on-surface group-hover:text-primary transition-colors">
                  {userName.split(" ")[0]}
                </span>
              </button>

              {/* Profile Dropdown Menu */}
              {profileMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setProfileMenuOpen(false)}
                  ></div>
                  <div className="absolute right-0 mt-3 w-56 rounded-xl bg-surface-container-high border border-outline-variant/10 shadow-2xl overflow-hidden z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-3 border-b border-outline-variant/10 mb-1">
                      <p className="text-sm font-bold text-on-surface">{userName}</p>
                      <p className="text-xs text-on-surface-variant truncate">{userEmail}</p>
                    </div>

                    <Link
                      href="/dashboard/settings"
                      className="flex items-center gap-3 px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors w-full text-left"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      <IconSettings className="w-4 h-4" />
                      Ajustes de Perfil
                    </Link>

                    <form action={signout}>
                      <button
                        type="submit"
                        className="flex items-center gap-3 px-4 py-2 mt-1 text-sm font-medium text-error hover:text-error-dim hover:bg-error/10 transition-colors w-full text-left"
                      >
                        <IconLogOut className="w-4 h-4" />
                        Cerrar Sesión
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-background p-6 lg:p-10">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>

      {/* Mobile Menu (Overlay) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          ></div>
          <aside className="relative w-64 bg-surface-container-lowest flex flex-col justify-between h-full shadow-2xl">
            <div>
              <div className="h-20 flex items-center px-8 border-b border-outline-variant/10">
                <LogoHorizontal className="w-[100px] h-[28px]" />
              </div>
              <nav className="p-4 space-y-1">
                <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-4 px-4 mt-4">
                  Menú Principal
                </div>
                {navigation.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="p-4 border-t border-outline-variant/10">
              <Link
                href="/dashboard/settings"
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
              >
                <IconSettings className="w-5 h-5" />
                Configuración
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
