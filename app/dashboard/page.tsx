import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
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

type ColorConfig = {
  bgLine: string;
  textHover: string;
  badgeText: string;
  badgeBg: string;
  iconText: string;
  iconBg: string;
};

const colors: Record<string, ColorConfig> = {
  primary: {
    bgLine: "bg-primary",
    textHover: "group-hover:text-primary",
    badgeText: "text-primary",
    badgeBg: "bg-primary/10",
    iconText: "text-primary",
    iconBg: "bg-primary/10",
  },
  emerald: {
    bgLine: "bg-[#10b981]",
    textHover: "group-hover:text-[#10b981]",
    badgeText: "text-[#10b981]",
    badgeBg: "bg-[#10b981]/10",
    iconText: "text-[#10b981]",
    iconBg: "bg-[#10b981]/10",
  },
  violet: {
    bgLine: "bg-[#8b5cf6]",
    textHover: "group-hover:text-[#8b5cf6]",
    badgeText: "text-[#8b5cf6]",
    badgeBg: "bg-[#8b5cf6]/10",
    iconText: "text-[#8b5cf6]",
    iconBg: "bg-[#8b5cf6]/10",
  },
  amber: {
    bgLine: "bg-[#f59e0b]",
    textHover: "group-hover:text-[#f59e0b]",
    badgeText: "text-[#f59e0b]",
    badgeBg: "bg-[#f59e0b]/10",
    iconText: "text-[#f59e0b]",
    iconBg: "bg-[#f59e0b]/10",
  },
  error: {
    bgLine: "bg-error",
    textHover: "group-hover:text-error",
    badgeText: "text-error",
    badgeBg: "bg-error-container/20 border border-error-container/30",
    iconText: "text-error",
    iconBg: "bg-error/10",
  }
};

const getDashboardConfig = (businessType: string) => {
  switch(businessType) {
    case 'salon':
      return {
        stats: [
          { title: "Ingresos del Día", value: "$1,250.00", trend: "12.5%", icon: IconDollar, color: colors.primary },
          { title: "Citas Completadas", value: "14", trend: "8.2%", icon: IconCalendar, color: colors.emerald },
          { title: "Citas Pendientes", value: "6", trend: "", icon: IconCalendar, color: colors.violet },
          { title: "Nuevos Clientes", value: "3", trend: "", icon: IconUsers, color: colors.amber },
        ],
        actions: [
          { title: "Nueva Cita", icon: IconCalendar },
          { title: "Registrar Cliente", icon: IconUsers },
          { title: "Añadir Servicio", icon: IconPlus },
          { title: "Venta de Producto", icon: IconShoppingCart },
        ],
        recentActivity: [
          { title: "Corte de Cabello - Ana Gómez", desc: "Hace 15 mins", value: "+$45.00", status: "Completado", icon: IconCalendar, color: colors.primary },
          { title: "Reserva Confirmada", desc: "Cliente: Carlos Ruiz", value: "Mañana 10:00", status: "Agendado", icon: IconUsers, color: colors.emerald },
          { title: "Venta Producto - Champú", desc: "Hace 2 horas", value: "+$25.00", status: "Completado", icon: IconShoppingCart, color: colors.primary },
          { title: "Cita Cancelada", desc: "Cliente: María López", value: "-$30.00", status: "Cancelado", icon: IconCalendar, color: colors.error },
        ]
      };
    case 'lavaautos':
      return {
        stats: [
          { title: "Lavados Hoy", value: "28", trend: "15%", icon: IconBox, color: colors.primary },
          { title: "Ingresos", value: "$420.00", trend: "5%", icon: IconDollar, color: colors.emerald },
          { title: "En Espera", value: "4", trend: "", icon: IconCalendar, color: colors.violet },
          { title: "Servicios Extra", value: "12", trend: "", icon: IconPlus, color: colors.amber },
        ],
        actions: [
          { title: "Registrar Ingreso", icon: IconPlus },
          { title: "Terminar Lavado", icon: IconBox },
          { title: "Añadir Extra", icon: IconShoppingCart },
          { title: "Ver Historial", icon: IconCalendar },
        ],
        recentActivity: [
          { title: "Lavado Completo - ABC-123", desc: "Hace 5 mins", value: "+$25.00", status: "Completado", icon: IconBox, color: colors.primary },
          { title: "Lavado Básico - XYZ-987", desc: "Hace 30 mins", value: "+$15.00", status: "Completado", icon: IconBox, color: colors.primary },
          { title: "Ingreso Vehículo - DEF-456", desc: "Hace 45 mins", value: "En proceso", status: "Lavando", icon: IconPlus, color: colors.amber },
        ]
      };
    case 'servicios':
      return {
        stats: [
          { title: "Proyectos Activos", value: "12", trend: "15%", icon: IconBox, color: colors.primary },
          { title: "Horas Facturadas", value: "145h", trend: "12%", icon: IconCalendar, color: colors.emerald },
          { title: "Facturas Pendientes", value: "4", trend: "", icon: IconCreditCard, color: colors.violet },
          { title: "Reuniones Hoy", value: "3", trend: "", icon: IconUsers, color: colors.amber },
        ],
        actions: [
          { title: "Nueva Factura", icon: IconCreditCard },
          { title: "Registrar Proyecto", icon: IconPlus },
          { title: "Agendar Reunión", icon: IconCalendar },
          { title: "Añadir Cliente", icon: IconUsers },
        ],
        recentActivity: [
          { title: "Factura Pagada - INV-001", desc: "Hace 1 hora", value: "+$1,200.00", status: "Pagado", icon: IconDollar, color: colors.emerald },
          { title: "Reunión de Avance", desc: "Cliente: Empresa X", value: "Hoy 14:00", status: "Agendado", icon: IconUsers, color: colors.primary },
          { title: "Propuesta Enviada", desc: "Hace 3 horas", value: "$4,500.00", status: "En revisión", icon: IconBox, color: colors.amber },
        ]
      };
    case 'tienda':
    default:
      return {
        stats: [
          { title: "Ventas Totales", value: "$24,500.00", trend: "12.5%", icon: IconCreditCard, color: colors.primary },
          { title: "Flujo de Caja", value: "+$840.00", trend: "4.2%", icon: IconDollar, color: colors.emerald },
          { title: "Inventario Bajo", value: "8", trend: "", icon: IconBox, color: colors.violet },
          { title: "Nuevos Clientes", value: "12", trend: "", icon: IconUsers, color: colors.amber },
        ],
        actions: [
          { title: "Nueva Venta", icon: IconShoppingCart },
          { title: "Añadir Producto", icon: IconPlus },
          { title: "Registrar Cliente", icon: IconUsers },
          { title: "Ver Reportes", icon: IconTrendingUp },
        ],
        recentActivity: [
          { title: "Venta POS - #INV-2023", desc: "Hace 2 mins", value: "+$124.50", status: "Completado", icon: IconShoppingCart, color: colors.emerald },
          { title: "Stock Recibido", desc: "Proveedor: TechSupply", value: "50 Unids", status: "Procesado", icon: IconBox, color: colors.amber },
          { title: "Venta POS - #INV-2022", desc: "Hace 1 hora", value: "+$45.00", status: "Completado", icon: IconShoppingCart, color: colors.emerald },
          { title: "Pago Fallido", desc: "Cliente: Sarah Smith", value: "-$210.00", status: "Rechazado", icon: IconCreditCard, color: colors.error },
        ]
      };
  }
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const businessType = user.user_metadata?.business_type || 'tienda';
  const fullName = user.user_metadata?.full_name || 'Admin';
  
  const config = getDashboardConfig(businessType);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-on-surface">
          Bienvenido de nuevo, {fullName.split(' ')[0]}
        </h1>
        <p className="text-on-surface-variant text-sm mt-1">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {config.stats.map((stat, i) => (
          <div key={i} className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 shadow-sm relative overflow-hidden group">
            <div className={`absolute top-0 left-0 w-1 h-full ${stat.color.bgLine} opacity-50 group-hover:opacity-100 transition-opacity`}></div>
            <div className="flex justify-between items-start mb-4">
              <div className={`w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant ${stat.color.textHover} transition-colors`}>
                <stat.icon className="w-5 h-5" />
              </div>
              {stat.trend && (
                <div className={`flex items-center gap-1 text-xs font-medium ${stat.color.badgeText} ${stat.color.badgeBg} px-2 py-1 rounded-full`}>
                  <IconTrendingUp className="w-3 h-3" />
                  <span>{stat.trend}</span>
                </div>
              )}
            </div>
            <div>
              <p className="text-on-surface-variant text-sm font-medium mb-1">
                {stat.title}
              </p>
              <h3 className="text-2xl font-bold text-on-surface">{stat.value}</h3>
            </div>
          </div>
        ))}
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
            {config.actions.map((action, i) => (
              <button key={i} className="flex flex-col items-center justify-center gap-3 bg-surface-container-lowest hover:bg-surface-container-high border border-outline-variant/10 hover:border-primary/30 rounded-2xl p-4 transition-all group shadow-sm hover:shadow-md hover:shadow-primary/5">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface text-center">
                  {action.title}
                </span>
              </button>
            ))}
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
          {config.recentActivity.map((activity, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/5 hover:border-outline-variant/20 transition-colors gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full ${activity.color.iconBg} ${activity.color.iconText} flex items-center justify-center shrink-0`}>
                  <activity.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-on-surface">
                    {activity.title}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {activity.desc}
                  </p>
                </div>
              </div>
              <div className="sm:text-right flex sm:flex-col justify-between items-center sm:items-end">
                <p className={`text-sm font-bold ${activity.color.textHover.replace('group-hover:', '')}`}>
                  {activity.value}
                </p>
                <p className={`text-[11px] font-medium text-on-surface-variant mt-0.5 px-2 py-0.5 rounded-md ${activity.color === colors.error ? colors.error.badgeBg : 'bg-surface-variant'}`}>
                  {activity.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
