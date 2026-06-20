"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { LogoHorizontal, LogoVertical } from "@/components/Logo";
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
  IconScissors,
  IconUserBadge,
} from "@/app/assets/icons/DashboardIcons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { signout } from "@/utils/supabase/actions";
import { useProfile } from "@/components/ProfileProvider";
import { visibleNavItems } from "@/config/business";

type IconType = typeof IconHome;

// Mapa id de nav -> icono (la presentación; el modelo lógico vive en config/business.ts).
const NAV_ICONS: Record<string, IconType> = {
  panel: IconHome,
  pos: IconCreditCard,
  sales: IconShoppingCart,
  services: IconScissors,
  staff: IconUserBadge,
  inventory: IconBox,
  finance: IconDollar,
  customers: IconUsers,
  distributors: IconBox,
  calendar: IconCalendar,
};

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const profile = useProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);

  const navigation = visibleNavItems(profile?.businessType ?? null, profile?.modules ?? null);
  const userName = profile?.fullName ?? "Admin";
  const userEmail = profile?.email ?? "";

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
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
              const Icon = NAV_ICONS[item.id];
              const isActive = pathname === item.href;
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
                  {Icon && <Icon className="w-5 h-5" />}
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
            <button
              onClick={() => setCalculatorOpen(true)}
              className="text-on-surface-variant hover:text-on-surface transition-colors"
              title="Calculadora"
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="w-5 h-5">
                <rect x="4" y="2" width="16" height="20" rx="2" />
                <line x1="8" y1="6" x2="16" y2="6" />
                <line x1="8" y1="10" x2="8" y2="10.01" />
                <line x1="12" y1="10" x2="12" y2="10.01" />
                <line x1="16" y1="10" x2="16" y2="10.01" />
                <line x1="8" y1="14" x2="8" y2="14.01" />
                <line x1="12" y1="14" x2="12" y2="14.01" />
                <line x1="16" y1="14" x2="16" y2="14.01" />
                <line x1="8" y1="18" x2="16" y2="18" />
              </svg>
            </button>
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
          {children}
        </main>
      </div>

      {/* Calculator Modal */}
      {calculatorOpen && (
        <CalculatorModal onClose={() => setCalculatorOpen(false)} />
      )}

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
                  const Icon = NAV_ICONS[item.id];
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                      }`}
                    >
                      {Icon && <Icon className="w-5 h-5" />}
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

function CalculatorModal({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [reset, setReset] = useState(false);
  const [expression, setExpression] = useState("");

  const inputDigit = (d: string) => {
    if (reset) {
      setDisplay(d);
      setReset(false);
    } else {
      setDisplay((s) => (s === "0" ? d : s + d));
    }
  };

  const inputDecimal = () => {
    if (reset) {
      setDisplay("0.");
      setReset(false);
    } else if (!display.includes(".")) {
      setDisplay((s) => s + ".");
    }
  };

  const backspace = () => {
    setDisplay((s) => (s.length > 1 ? s.slice(0, -1) : "0"));
  };

  const clear = () => {
    setDisplay("0");
    setPrev(null);
    setOp(null);
    setReset(false);
    setExpression("");
  };

  const displayOp = (operator: string) => {
    switch (operator) {
      case "÷": return "÷";
      case "×": return "×";
      default: return operator;
    }
  };

  const setOperation = (nextOp: string) => {
    const n = parseFloat(display);
    if (prev === null) {
      setPrev(n);
      setExpression(`${n} ${displayOp(nextOp)}`);
    } else if (op) {
      const result = calculate(prev, n, op);
      setDisplay(String(result));
      setPrev(result);
      setExpression(`${result} ${displayOp(nextOp)}`);
    } else {
      setExpression(`${prev} ${displayOp(nextOp)}`);
    }
    setOp(nextOp);
    setReset(true);
  };

  const calculate = (a: number, b: number, operation: string): number => {
    switch (operation) {
      case "+": return a + b;
      case "-": return a - b;
      case "×": return a * b;
      case "÷": return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const evaluate = () => {
    const n = parseFloat(display);
    if (prev !== null && op) {
      const result = calculate(prev, n, op);
      setExpression(`${prev} ${displayOp(op)} ${n} =`);
      setDisplay(String(result));
      setPrev(result);
      setOp(null);
      setReset(true);
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Enter" || e.key === "=") { evaluate(); return; }
      if (e.key === "Backspace") { backspace(); return; }
      if (e.key === ".") { inputDecimal(); return; }
      if (e.key === "Delete") { clear(); return; }
      if (/^[0-9]$/.test(e.key)) { inputDigit(e.key); return; }
      if (e.key === "+") { setOperation("+"); return; }
      if (e.key === "-") { setOperation("-"); return; }
      if (e.key === "*") { setOperation("×"); return; }
      if (e.key === "/") { e.preventDefault(); setOperation("÷"); return; }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const btn = (label: string, onClick: () => void, className = "") => (
    <button
      type="button"
      onClick={onClick}
      className={`h-12 rounded-xl text-sm font-bold transition-colors ${className}`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-surface-container rounded-3xl w-full max-w-xs border border-outline-variant/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
          <h2 className="text-sm font-bold text-on-surface">Calculadora</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="bg-surface-container-lowest rounded-2xl px-4 py-2 text-right min-h-[72px] flex flex-col justify-end">
            {expression && (
              <span className="text-xs text-on-surface-variant/60 tabular-nums mb-1">{expression}</span>
            )}
            <span className="text-3xl font-bold text-on-surface tabular-nums">{display}</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {btn("C", clear, "bg-error-container/20 text-error-dim hover:bg-error-container/30")}
            {btn("⌫", backspace, "bg-surface-container-high text-on-surface hover:bg-surface-container-highest")}
            {btn("÷", () => setOperation("÷"), "bg-surface-container-high text-on-surface hover:bg-surface-container-highest")}
            {btn("×", () => setOperation("×"), "bg-surface-container-high text-on-surface hover:bg-surface-container-highest")}

            {btn("7", () => inputDigit("7"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("8", () => inputDigit("8"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("9", () => inputDigit("9"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("-", () => setOperation("-"), "bg-surface-container-high text-on-surface hover:bg-surface-container-highest")}

            {btn("4", () => inputDigit("4"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("5", () => inputDigit("5"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("6", () => inputDigit("6"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("+", () => setOperation("+"), "bg-surface-container-high text-on-surface hover:bg-surface-container-highest")}

            {btn("1", () => inputDigit("1"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("2", () => inputDigit("2"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("3", () => inputDigit("3"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
            {btn("=", evaluate, "bg-primary text-on-primary hover:bg-primary-dim row-span-2")}

            {btn("0", () => inputDigit("0"), "bg-surface-container-lowest text-on-surface hover:bg-surface-container col-span-2")}
            {btn(".", inputDecimal, "bg-surface-container-lowest text-on-surface hover:bg-surface-container")}
          </div>
        </div>
      </div>
    </div>
  );
}
