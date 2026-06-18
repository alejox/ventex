import {
  IconCreditCard,
  IconDollar,
  IconCalendar,
  IconBox,
  IconTrendingUp,
  IconPlus,
  IconShoppingCart,
  IconUsers,
} from "@/app/assets/icons/DashboardIcons";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-on-surface">
          Bienvenido de nuevo, Admin
        </h1>
        <p className="text-on-surface-variant text-sm mt-1">
          Miércoles, 17 de Junio, 2026 • 6:58 PM
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-50 group-hover:opacity-100 transition-opacity"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant group-hover:text-primary transition-colors">
              <IconCreditCard className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
              <IconTrendingUp className="w-3 h-3" />
              <span>12.5%</span>
            </div>
          </div>
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1">
              Ventas Totales
            </p>
            <h3 className="text-2xl font-bold text-on-surface">$24,500.00</h3>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#10b981] opacity-50 group-hover:opacity-100 transition-opacity"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant group-hover:text-[#10b981] transition-colors">
              <IconDollar className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1 text-xs font-medium text-[#10b981] bg-[#10b981]/10 px-2 py-1 rounded-full">
              <IconTrendingUp className="w-3 h-3" />
              <span>4.2%</span>
            </div>
          </div>
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1">
              Flujo de Caja
            </p>
            <h3 className="text-2xl font-bold text-on-surface">+$840.00</h3>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#8b5cf6] opacity-50 group-hover:opacity-100 transition-opacity"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant group-hover:text-[#8b5cf6] transition-colors">
              <IconCalendar className="w-5 h-5" />
            </div>
          </div>
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1">
              Citas de Hoy
            </p>
            <h3 className="text-2xl font-bold text-on-surface">8</h3>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#f59e0b] opacity-50 group-hover:opacity-100 transition-opacity"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant group-hover:text-[#f59e0b] transition-colors">
              <IconBox className="w-5 h-5" />
            </div>
          </div>
          <div>
            <p className="text-on-surface-variant text-sm font-medium mb-1">
              Tareas Pendientes
            </p>
            <h3 className="text-2xl font-bold text-on-surface">12</h3>
          </div>
        </div>
      </div>

      {/* Middle Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Area */}
        <div className="lg:col-span-2 bg-surface-container rounded-3xl p-6 border border-outline-variant/10 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-on-surface">
              Ingresos vs. Gastos
            </h3>
            <select className="bg-surface-container-high border border-outline-variant/20 rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary">
              <option>Últimos 30 Días</option>
              <option>Este Año</option>
            </select>
          </div>
          <div className="flex-1 min-h-[240px] flex items-end justify-between relative pt-8 pb-4">
            {/* Horizontal Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
              <div className="border-t border-outline-variant/5 w-full"></div>
              <div className="border-t border-outline-variant/5 w-full"></div>
              <div className="border-t border-outline-variant/5 w-full"></div>
              <div className="border-t border-outline-variant/5 w-full"></div>
            </div>

            {/* Simulated Chart Bars */}
            <div className="relative z-10 w-8 sm:w-12 h-[60%] flex gap-1">
              <div className="w-full bg-primary rounded-t-sm hover:opacity-80 transition-opacity cursor-pointer"></div>
              <div className="w-full bg-surface-variant rounded-t-sm h-[40%] mt-auto hover:opacity-80 transition-opacity cursor-pointer"></div>
            </div>
            <div className="relative z-10 w-8 sm:w-12 h-[80%] flex gap-1">
              <div className="w-full bg-primary rounded-t-sm hover:opacity-80 transition-opacity cursor-pointer"></div>
              <div className="w-full bg-surface-variant rounded-t-sm h-[30%] mt-auto hover:opacity-80 transition-opacity cursor-pointer"></div>
            </div>
            <div className="relative z-10 w-8 sm:w-12 h-[40%] flex gap-1">
              <div className="w-full bg-primary rounded-t-sm hover:opacity-80 transition-opacity cursor-pointer"></div>
              <div className="w-full bg-surface-variant rounded-t-sm h-[70%] mt-auto hover:opacity-80 transition-opacity cursor-pointer"></div>
            </div>
            <div className="relative z-10 w-8 sm:w-12 h-[90%] flex gap-1">
              <div className="w-full bg-primary rounded-t-sm hover:opacity-80 transition-opacity cursor-pointer"></div>
              <div className="w-full bg-surface-variant rounded-t-sm h-[50%] mt-auto hover:opacity-80 transition-opacity cursor-pointer"></div>
            </div>
            <div className="relative z-10 w-8 sm:w-12 h-[70%] flex gap-1">
              <div className="w-full bg-primary rounded-t-sm hover:opacity-80 transition-opacity cursor-pointer"></div>
              <div className="w-full bg-surface-variant rounded-t-sm h-[20%] mt-auto hover:opacity-80 transition-opacity cursor-pointer"></div>
            </div>
          </div>
          {/* X Axis Labels */}
          <div className="flex justify-between text-xs text-on-surface-variant font-medium mt-2 px-2">
            <span>Sem 1</span>
            <span>Sem 2</span>
            <span>Sem 3</span>
            <span>Sem 4</span>
            <span>Sem 5</span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/10 shadow-sm flex flex-col">
          <h3 className="font-semibold text-on-surface mb-6">Acciones Rápidas</h3>
          <div className="grid grid-cols-2 gap-4 flex-1">
            <button className="flex flex-col items-center justify-center gap-3 bg-surface-container-lowest hover:bg-surface-container-high border border-outline-variant/10 hover:border-primary/30 rounded-2xl p-4 transition-all group shadow-sm hover:shadow-md hover:shadow-primary/5">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <IconShoppingCart className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface text-center">
                Nueva Venta
              </span>
            </button>
            <button className="flex flex-col items-center justify-center gap-3 bg-surface-container-lowest hover:bg-surface-container-high border border-outline-variant/10 hover:border-primary/30 rounded-2xl p-4 transition-all group shadow-sm hover:shadow-md hover:shadow-primary/5">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <IconPlus className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface text-center">
                Añadir Producto
              </span>
            </button>
            <button className="flex flex-col items-center justify-center gap-3 bg-surface-container-lowest hover:bg-surface-container-high border border-outline-variant/10 hover:border-primary/30 rounded-2xl p-4 transition-all group shadow-sm hover:shadow-md hover:shadow-primary/5">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <IconUsers className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface text-center">
                Registrar Cliente
              </span>
            </button>
            <button className="flex flex-col items-center justify-center gap-3 bg-surface-container-lowest hover:bg-surface-container-high border border-outline-variant/10 hover:border-primary/30 rounded-2xl p-4 transition-all group shadow-sm hover:shadow-md hover:shadow-primary/5">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <IconCalendar className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface text-center">
                Agendar Cita
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/10 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-semibold text-on-surface">Actividad Reciente</h3>
          <button className="text-xs font-medium text-primary hover:text-primary-dim transition-colors">
            Ver Todo
          </button>
        </div>

        <div className="space-y-3">
          {/* Item 1 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/5 hover:border-outline-variant/20 transition-colors gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <IconShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-on-surface">
                  Venta POS - #INV-2023
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Cliente: John Doe • hace 2 mins
                </p>
              </div>
            </div>
            <div className="sm:text-right flex sm:flex-col justify-between items-center sm:items-end">
              <p className="text-sm font-bold text-[#10b981]">+$124.50</p>
              <p className="text-[11px] font-medium text-on-surface-variant mt-0.5 bg-surface-variant px-2 py-0.5 rounded-md">
                Completado
              </p>
            </div>
          </div>

          {/* Item 2 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/5 hover:border-outline-variant/20 transition-colors gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[#f59e0b]/10 text-[#f59e0b] flex items-center justify-center shrink-0">
                <IconBox className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-on-surface">
                  Stock Recibido
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Proveedor: TechSupply Inc • hace 45 mins
                </p>
              </div>
            </div>
            <div className="sm:text-right flex sm:flex-col justify-between items-center sm:items-end">
              <p className="text-sm font-bold text-on-surface">50 Unidades</p>
              <p className="text-[11px] font-medium text-on-surface-variant mt-0.5 bg-surface-variant px-2 py-0.5 rounded-md">
                Procesado
              </p>
            </div>
          </div>

          {/* Item 3 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/5 hover:border-outline-variant/20 transition-colors gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <IconShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-on-surface">
                  Venta POS - #INV-2022
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Cliente de Paso • hace 1 hora
                </p>
              </div>
            </div>
            <div className="sm:text-right flex sm:flex-col justify-between items-center sm:items-end">
              <p className="text-sm font-bold text-[#10b981]">+$45.00</p>
              <p className="text-[11px] font-medium text-on-surface-variant mt-0.5 bg-surface-variant px-2 py-0.5 rounded-md">
                Completado
              </p>
            </div>
          </div>

          {/* Item 4 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/5 hover:border-outline-variant/20 transition-colors gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-error/10 text-error flex items-center justify-center shrink-0">
                <IconCreditCard className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-on-surface">
                  Pago Fallido
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Cliente: Sarah Smith • hace 2 horas
                </p>
              </div>
            </div>
            <div className="sm:text-right flex sm:flex-col justify-between items-center sm:items-end">
              <p className="text-sm font-bold text-error">-$210.00</p>
              <p className="text-[11px] font-medium text-on-surface-variant mt-0.5 bg-error-container/20 text-error-dim border border-error-container/30 px-2 py-0.5 rounded-md">
                Rechazado
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
