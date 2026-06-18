import React from "react";
import { 
  IconWallet, 
  IconCreditCard, 
  IconDollar, 
  IconBank, 
  IconTrendingUp, 
  IconTrendingDown,
  IconDownload,
  IconSearch,
  IconMenu
} from "@/app/assets/icons/DashboardIcons";

export default function FinancePage() {
  const chartData = [
    { month: "Ene", income: 60, expense: 30 },
    { month: "Feb", income: 75, expense: 35 },
    { month: "Mar", income: 100, expense: 45 },
    { month: "Abr", income: 125, expense: 65 },
    { month: "May", income: 110, expense: 55 },
    { month: "Jun", income: 140, expense: 60 },
  ];

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Resumen Financiero</h1>
          <p className="text-sm text-on-surface-variant mt-1">Revisa tus métricas de rendimiento financiero más recientes.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2.5 rounded-xl border border-outline-variant/20 bg-surface-container text-sm font-semibold text-on-surface hover:bg-surface-container-high transition-colors">
            Últimos 30 Días
          </button>
          <button className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2">
            <IconDownload className="w-4 h-4" />
            <span>Exportar Reporte</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Revenue */}
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <IconWallet className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-lg">
              <IconTrendingUp className="w-3 h-3" />
              +12.5%
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-on-surface-variant mb-1">Ingresos Totales</p>
            <h3 className="text-2xl font-black text-on-surface">$124,500.00</h3>
          </div>
        </div>

        {/* Expenses */}
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center text-error">
              <IconCreditCard className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-error bg-error/10 px-2 py-1 rounded-lg">
              <IconTrendingDown className="w-3 h-3" />
              -2.4%
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-on-surface-variant mb-1">Gastos Totales</p>
            <h3 className="text-2xl font-black text-on-surface">$48,230.50</h3>
          </div>
        </div>

        {/* Net Profit */}
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <IconDollar className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-lg">
              <IconTrendingUp className="w-3 h-3" />
              +8.1%
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-on-surface-variant mb-1">Beneficio Neto</p>
            <h3 className="text-2xl font-black text-on-surface">$76,269.50</h3>
          </div>
        </div>

        {/* Cash Balance */}
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <IconBank className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-on-surface-variant bg-surface-container-high px-2 py-1 rounded-lg">
              — 0.0%
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-on-surface-variant mb-1">Saldo de Efectivo</p>
            <h3 className="text-2xl font-black text-on-surface">$215,000.00</h3>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Chart Area */}
        <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-on-surface">Ingresos vs. Gastos</h2>
            <div className="flex items-center gap-4 text-xs font-semibold text-on-surface-variant">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
                Ingresos
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-error/30"></span>
                Gastos
              </div>
            </div>
          </div>

          <div className="flex-1 relative min-h-[300px] flex items-end justify-between pt-6 pb-8 border-b border-outline-variant/10 px-2 sm:px-6">
            {/* Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pb-8 z-0 pointer-events-none">
              {[150, 100, 50, 0].map((val, i) => (
                <div key={i} className="flex items-center w-full">
                  <span className="w-10 text-[10px] font-semibold text-on-surface-variant/60">{val === 0 ? "$0" : `$${val}k`}</span>
                  <div className="flex-1 border-b border-outline-variant/5"></div>
                </div>
              ))}
            </div>

            {/* Bars */}
            {chartData.map((data, index) => (
              <div key={index} className="relative z-10 flex flex-col items-center gap-2 group w-10 sm:w-16">
                <div className="flex items-end justify-center gap-1 sm:gap-2 w-full h-[220px]">
                  <div 
                    className="w-3 sm:w-5 bg-primary rounded-t-sm transition-all duration-500 hover:opacity-80"
                    style={{ height: `${(data.income / 150) * 100}%` }}
                  ></div>
                  <div 
                    className="w-3 sm:w-5 bg-error/30 rounded-t-sm transition-all duration-500 hover:opacity-80"
                    style={{ height: `${(data.expense / 150) * 100}%` }}
                  ></div>
                </div>
                <span className="text-xs font-bold text-on-surface-variant mt-2">{data.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cash Flow Summary */}
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-sm flex flex-col">
          <h2 className="text-lg font-bold text-on-surface mb-6">Resumen de Flujo</h2>
          
          <div className="flex-1 space-y-6">
            {/* Bank Accounts */}
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Cuentas Bancarias</p>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <IconBank className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-on-surface">Chase Empresa</p>
                      <p className="text-xs text-on-surface-variant">**** 4321</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-on-surface">$150,200.00</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <IconBank className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-on-surface">Wells Fargo</p>
                      <p className="text-xs text-on-surface-variant">**** 8892</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-on-surface">$64,800.00</span>
                </div>
              </div>
            </div>

            <div className="h-px bg-outline-variant/10 w-full my-4"></div>

            {/* Pending */}
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Pendientes</p>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-sm font-bold text-on-surface">Cuentas por Cobrar</span>
                    <span className="text-sm font-bold text-emerald-500">$34,500</span>
                  </div>
                  <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                    <div className="w-[70%] h-full bg-emerald-500 rounded-full"></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-sm font-bold text-on-surface">Cuentas por Pagar</span>
                    <span className="text-sm font-bold text-error">$12,400</span>
                  </div>
                  <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                    <div className="w-[30%] h-full bg-error rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Recent Transactions Skeleton/Footer */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 shadow-sm flex items-center justify-between">
        <h2 className="text-lg font-bold text-on-surface">Transacciones Recientes</h2>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-xl border border-outline-variant/20 bg-surface-container text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors flex items-center gap-2">
            <IconMenu className="w-4 h-4" /> Filtros
          </button>
          <button className="px-4 py-2 rounded-xl border border-outline-variant/20 bg-surface-container text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors">
            Ver Todas
          </button>
        </div>
      </div>
    </div>
  );
}
