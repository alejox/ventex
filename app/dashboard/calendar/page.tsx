import React from "react";
import { 
  IconChevronLeft, 
  IconChevronRight, 
  IconPlus, 
  IconClock,
  IconVideo,
  IconUsers
} from "@/app/assets/icons/DashboardIcons";

export default function CalendarPage() {
  const daysOfWeek = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  
  // Generating a simple mock month (35 days total for grid)
  const calendarDays = Array.from({ length: 35 }, (_, i) => {
    const dayNumber = i - 2; // Offset to start month on a Wednesday
    if (dayNumber < 1) return { day: 30 + dayNumber, isCurrentMonth: false };
    if (dayNumber > 31) return { day: dayNumber - 31, isCurrentMonth: false };
    return { day: dayNumber, isCurrentMonth: true };
  });

  const upcomingEvents = [
    {
      id: 1,
      title: "Reunión de Sincronización Q3",
      time: "10:00 AM - 11:30 AM",
      type: "video",
      color: "bg-[#6063ee]",
      textColor: "text-[#6063ee]",
      attendees: 4
    },
    {
      id: 2,
      title: "Revisión de Inventario Anual",
      time: "02:00 PM - 04:00 PM",
      type: "in-person",
      color: "bg-emerald-500",
      textColor: "text-emerald-500",
      attendees: 2
    },
    {
      id: 3,
      title: "Llamada con Proveedor Principal",
      time: "04:30 PM - 05:00 PM",
      type: "video",
      color: "bg-amber-500",
      textColor: "text-amber-500",
      attendees: 2
    }
  ];

  return (
    <div className="flex flex-col gap-6 w-full h-[calc(100vh-8rem)] animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Calendario</h1>
          <p className="text-sm text-on-surface-variant mt-1">Gestiona tus citas, eventos y recordatorios de stock.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-surface-container border border-outline-variant/10 rounded-xl p-1 shadow-sm">
            <button className="px-3 py-1.5 text-xs font-bold bg-surface-container-lowest text-on-surface rounded-lg shadow-sm">Mes</button>
            <button className="px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors">Semana</button>
            <button className="px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors">Día</button>
          </div>
          <button className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2">
            <IconPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Evento</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        
        {/* Left Sidebar - Upcoming Events */}
        <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0 overflow-y-auto pr-2 scrollbar-hide">
          {/* Mini Calendar Widget */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-on-surface">Octubre 2024</h3>
              <div className="flex gap-1">
                <button className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors">
                  <IconChevronLeft className="w-4 h-4" />
                </button>
                <button className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors">
                  <IconChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {daysOfWeek.map(day => (
                <span key={day} className="text-[10px] font-bold text-on-surface-variant">{day.charAt(0)}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-sm">
              {calendarDays.map((d, i) => (
                <button 
                  key={i} 
                  className={`w-8 h-8 mx-auto flex items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    !d.isCurrentMonth ? "text-on-surface-variant/30" :
                    d.day === 15 ? "bg-[#6063ee] text-white shadow-md shadow-[#6063ee]/30 font-bold" :
                    "text-on-surface hover:bg-surface-container"
                  }`}
                >
                  {d.day}
                </button>
              ))}
            </div>
          </div>

          {/* Upcoming Events List */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 shadow-sm flex-1">
            <h3 className="font-bold text-on-surface mb-6">Próximos Eventos</h3>
            <div className="space-y-4">
              {upcomingEvents.map(event => (
                <div key={event.id} className="group relative p-4 rounded-2xl bg-surface-container hover:bg-surface-container-high transition-colors border border-outline-variant/5">
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 ${event.color} rounded-r-full`}></div>
                  
                  <h4 className="text-sm font-bold text-on-surface line-clamp-1 mb-1 group-hover:text-primary transition-colors">{event.title}</h4>
                  
                  <div className="flex items-center gap-2 text-[11px] font-medium text-on-surface-variant mb-3">
                    <IconClock className="w-3.5 h-3.5" />
                    <span>{event.time}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex -space-x-2">
                      {[...Array(event.attendees)].map((_, i) => (
                        <div key={i} className="w-6 h-6 rounded-full bg-surface-container-high border-2 border-surface-container-lowest shadow-sm flex items-center justify-center overflow-hidden">
                           <IconUsers className="w-3 h-3 text-on-surface-variant" />
                        </div>
                      ))}
                    </div>
                    {event.type === 'video' && (
                      <div className={`p-1.5 rounded-lg ${event.color}/10 ${event.textColor}`}>
                        <IconVideo className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <button className="w-full mt-6 py-3 text-sm font-bold text-primary hover:bg-primary/5 rounded-xl transition-colors">
              Ver todos los eventos
            </button>
          </div>
        </div>

        {/* Right Area - Main Calendar Grid */}
        <div className="flex-1 bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-sm flex flex-col overflow-hidden">
          {/* Header Row */}
          <div className="grid grid-cols-7 border-b border-outline-variant/10 bg-surface-container/50">
            {daysOfWeek.map((day, i) => (
              <div key={day} className={`p-4 text-center text-xs font-bold tracking-wider uppercase ${i === 0 || i === 6 ? 'text-on-surface-variant/50' : 'text-on-surface-variant'}`}>
                {day}
              </div>
            ))}
          </div>

          {/* Grid Area */}
          <div className="flex-1 grid grid-cols-7 grid-rows-5 bg-outline-variant/5 gap-px">
            {calendarDays.map((d, i) => {
              const isToday = d.day === 15 && d.isCurrentMonth;
              const hasEvent1 = d.day === 15 && d.isCurrentMonth;
              const hasEvent2 = d.day === 18 && d.isCurrentMonth;
              const hasEvent3 = d.day === 8 && d.isCurrentMonth;

              return (
                <div 
                  key={i} 
                  className={`bg-surface-container-lowest p-2 hover:bg-surface-container/30 transition-colors flex flex-col gap-1 ${!d.isCurrentMonth ? 'opacity-40' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold ${
                      isToday ? "bg-[#6063ee] text-white shadow-md shadow-[#6063ee]/30" : "text-on-surface-variant"
                    }`}>
                      {d.day}
                    </span>
                  </div>

                  {/* Mock Events rendering inside cells */}
                  <div className="flex-1 overflow-y-auto space-y-1 mt-1 scrollbar-hide">
                    {hasEvent1 && (
                      <>
                        <div className="px-2 py-1 text-[10px] font-bold text-white bg-[#6063ee] rounded-md truncate shadow-sm">
                          10:00 Sincronización
                        </div>
                        <div className="px-2 py-1 text-[10px] font-bold text-amber-700 bg-amber-500/20 rounded-md truncate">
                          16:30 Proveedor
                        </div>
                      </>
                    )}
                    {hasEvent2 && (
                      <div className="px-2 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-500/20 rounded-md truncate">
                        Todo el día - Auditoría
                      </div>
                    )}
                    {hasEvent3 && (
                      <div className="px-2 py-1 text-[10px] font-bold text-[#6063ee] bg-[#6063ee]/10 border border-[#6063ee]/20 rounded-md truncate">
                        14:00 Diseño UX
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
