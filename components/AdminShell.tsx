"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoHorizontal } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ShellUserMenu } from "@/components/ShellUserMenu";
import { IconHome, IconUsers, IconCreditCard, IconUserBadge, IconDollar } from "@/app/assets/icons/DashboardIcons";

const ADMIN_NAV = [
  { id: "overview", name: "Resumen", href: "/admin", icon: IconHome },
  { id: "companies", name: "Empresas", href: "/admin/companies", icon: IconUsers },
  { id: "resellers", name: "Revendedores", href: "/admin/resellers", icon: IconUserBadge },
  { id: "credits", name: "Créditos", href: "/admin/credits", icon: IconDollar },
  { id: "plans", name: "Planes", href: "/admin/plans", icon: IconCreditCard },
];

export function AdminShell({
  children,
  adminName,
  adminEmail,
}: {
  children: React.ReactNode;
  adminName: string;
  adminEmail: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-background text-on-background font-sans">
      <aside className="hidden lg:flex flex-col justify-between w-64 border-r border-outline-variant/10 bg-surface-container-lowest">
        <div>
          <div className="h-20 flex items-center px-6 border-b border-outline-variant/10 gap-3">
            <LogoHorizontal className="w-[100px] h-[28px]" />
          </div>
          <div className="px-4 pt-6">
            <span className="text-[11px] font-bold text-primary uppercase tracking-[0.2em] px-4">
              Super Admin
            </span>
          </div>
          <nav className="p-4 space-y-1">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        {/* Cerrar sesión vive en el menú de usuario del header, no aquí. */}
        <div className="p-4 border-t border-outline-variant/10">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
          >
            <IconHome className="w-5 h-5 shrink-0" />
            <span>Volver al panel</span>
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-20 flex items-center justify-between px-6 lg:px-10 border-b border-outline-variant/10 bg-surface-container-lowest sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <span className="lg:hidden">
              <LogoHorizontal className="w-[90px] h-[24px]" />
            </span>
            <h1 className="hidden lg:block text-lg font-bold text-on-surface">Panel de administración</h1>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="w-px h-6 bg-outline-variant/20 hidden sm:block" />
            <ShellUserMenu name={adminName} email={adminEmail} />
          </div>
        </header>

        {/* Nav móvil: el sidebar está oculto, así que aquí van también sus enlaces. */}
        <div className="lg:hidden flex items-center gap-2 px-4 py-3 border-b border-outline-variant/10 bg-surface-container-lowest overflow-x-auto">
          {ADMIN_NAV.map((item) => {
            const isActive =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`whitespace-nowrap text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-low"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
          <span className="w-px h-5 shrink-0 bg-outline-variant/20" />
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium px-3 py-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            <IconHome className="w-4 h-4 shrink-0" />
            Volver al panel
          </Link>
        </div>

        <main className="flex-1 overflow-auto bg-background p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
