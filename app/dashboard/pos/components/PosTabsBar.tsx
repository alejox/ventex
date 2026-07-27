import type { SaleTab } from "@/stores/pos.store";

interface PosTabsBarProps {
  tabs: SaleTab[];
  activeTabId: string;
  tabMenuId: string | null;
  setTabMenuId: (id: string | null) => void;
  setActiveTab: (id: string) => void;
  addTab: () => void;
  removeTab: (id: string) => void;
  onRename: (id: string) => void;
  onCloseTab: (id: string) => void;
}

export function PosTabsBar({
  tabs,
  activeTabId,
  tabMenuId,
  setTabMenuId,
  setActiveTab,
  addTab,
  removeTab,
  onRename,
  onCloseTab,
}: PosTabsBarProps) {
  return (
    <div className={`fixed bottom-0 inset-x-0 pb-[env(safe-area-inset-bottom)] lg:static lg:pb-0 bg-surface-container-low border-t border-outline-variant/20 ${
      tabMenuId ? "z-[60]" : "z-40"
    }`}>
      <div className="px-2 lg:pl-10 lg:pr-6 flex items-stretch gap-0.5 overflow-x-auto scrollbar-hide">
        {tabs.map((t) => {
          const isActive = t.id === activeTabId;
          return (
            <div key={t.id} className="shrink-0">
              <div
                className={`h-11 flex items-center gap-1.5 pl-2.5 pr-0.5 min-w-[124px] max-w-[190px] transition-all border-b-2 ${
                  isActive
                    ? "bg-surface-container-lowest border-primary text-primary font-semibold"
                    : "bg-transparent border-transparent text-on-surface-variant hover:bg-surface-container-high/50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className="flex items-center gap-1.5 min-w-0 flex-1 h-full text-left"
                >
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <span className="text-xs truncate">{t.name}</span>
                </button>

                {isActive && (
                  <button
                    type="button"
                    onClick={() => setTabMenuId(tabMenuId === t.id ? null : t.id)}
                    aria-label={`Opciones de ${t.name}`}
                    aria-haspopup="menu"
                    aria-expanded={tabMenuId === t.id}
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                  >
                    <svg fill="currentColor" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                      <circle cx="12" cy="5" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <circle cx="12" cy="19" r="1.6" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <button
          onClick={addTab}
          aria-label="Nueva venta"
          className="w-10 h-11 ml-0.5 shrink-0 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors"
        >
          <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {tabMenuId && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setTabMenuId(null)} />
          <div
            role="menu"
            className="absolute bottom-full right-4 lg:right-6 mb-1 z-50 min-w-[180px] rounded-xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-150"
          >
            <button
              role="menuitem"
              onClick={() => {
                onRename(tabMenuId);
                setTabMenuId(null);
              }}
              className="w-full text-left px-4 py-3.5 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
            >
              Renombrar
            </button>
            <button
              role="menuitem"
              disabled={tabs.length === 1}
              onClick={() => {
                const target = tabs.find((t) => t.id === tabMenuId);
                setTabMenuId(null);
                if (!target) return;
                if (target.cart.length > 0) {
                  onCloseTab(target.id);
                } else {
                  removeTab(target.id);
                }
              }}
              className="w-full text-left px-4 py-3.5 text-sm text-error hover:bg-error/10 transition-colors border-t border-outline-variant/10 disabled:opacity-40 disabled:hover:bg-transparent"
              title={tabs.length === 1 ? "Es la \u00fanica venta abierta" : undefined}
            >
              Eliminar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
