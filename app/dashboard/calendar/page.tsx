"use client";

import { useEffect, useState, useMemo } from "react";
import { useAppointmentsStore } from "@/stores/appointments.store";
import AppointmentModal from "@/components/appointments/AppointmentModal";
import type { Appointment } from "@/services/appointments.service";
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
} from "@/app/assets/icons/DashboardIcons";

// ---- HELPERS ----
const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells: { day: number; date: string; isCurrentMonth: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    cells.push({
      day: d,
      date: formatDate(new Date(year, month - 1, d)),
      isCurrentMonth: false,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      date: formatDate(new Date(year, month, d)),
      isCurrentMonth: true,
    });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({
      day: d,
      date: formatDate(new Date(year, month + 1, d)),
      isCurrentMonth: false,
    });
  }
  return cells;
}

function getWeekDays(date: Date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  const days: { day: number; date: string; dayName: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push({
      day: d.getDate(),
      date: formatDate(d),
      dayName: DAYS_SHORT[d.getDay()],
    });
  }
  return days;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00 - 20:00

function getStatusColor(status: string) {
  switch (status) {
    case "confirmed":
      return "bg-[#6063ee]/15 text-[#6063ee] border-l-[#6063ee]";
    case "completed":
      return "bg-emerald-500/15 text-emerald-600 border-l-emerald-500";
    case "cancelled":
      return "bg-error-container/20 text-error-dim border-l-error-container";
    default:
      return "bg-amber-500/15 text-amber-600 border-l-amber-500";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "pending": return "Pendiente";
    case "confirmed": return "Confirmada";
    case "completed": return "Completada";
    case "cancelled": return "Cancelada";
    default: return status;
  }
}

// ---- COMPONENT ----
export default function CalendarPage() {
  const { appointments, loading, error, fetchAppointments, setSelectedDate } =
    useAppointmentsStore();

  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [defaultStartTime, setDefaultStartTime] = useState<string>("09:00");

  const today = useMemo(() => formatDate(new Date()), []);
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Fetch appointments based on view
  useEffect(() => {
    let start: string;
    let end: string;

    if (view === "month") {
      const firstDay = formatDate(new Date(currentYear, currentMonth, 1));
      const lastDay = formatDate(new Date(currentYear, currentMonth + 1, 0));
      start = firstDay;
      end = lastDay;
    } else if (view === "week") {
      const weekDays = getWeekDays(currentDate);
      start = weekDays[0].date;
      end = weekDays[6].date;
    } else {
      start = formatDate(currentDate);
      end = formatDate(currentDate);
    }

    fetchAppointments(start, end);
  }, [view, currentDate, currentMonth, currentYear, fetchAppointments]);

  // Group appointments by date
  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    appointments.forEach((a) => {
      if (!map[a.appointment_date]) map[a.appointment_date] = [];
      map[a.appointment_date].push(a);
    });
    return map;
  }, [appointments]);

  // Navigate
  const navigatePrev = () => {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else if (view === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const navigateNext = () => {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else if (view === "week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  // Open modal for new appointment
  const handleNewAppointment = (date?: string, time?: string) => {
    setSelectedAppointment(null);
    setDefaultStartTime(time || "09:00");
    if (date) {
      setSelectedDate(new Date(date + "T12:00:00"));
    }
    setModalOpen(true);
  };

  // Open modal for existing appointment
  const handleEditAppointment = (appt: Appointment) => {
    setSelectedAppointment(appt);
    setModalOpen(true);
  };

  // Get month grid
  const monthGrid = useMemo(
    () => getMonthGrid(currentYear, currentMonth),
    [currentYear, currentMonth],
  );

  // Get week days
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  // Get appointments for a specific hour (day view)
  const getAppointmentsForHour = (date: string, hour: number) => {
    const dayAppts = appointmentsByDate[date] || [];
    return dayAppts.filter((a) => {
      const startH = parseInt(a.start_time.split(":")[0]);
      return startH === hour;
    });
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Calendario</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Gestiona tus citas, eventos y agenda.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center bg-surface-container border border-outline-variant/10 rounded-xl p-1 shadow-sm">
            {(["month", "week", "day"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  view === v
                    ? "bg-surface-container-lowest text-on-surface shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {v === "month" ? "Mes" : v === "week" ? "Semana" : "Día"}
              </button>
            ))}
          </div>
          <button
            onClick={goToday}
            className="px-3 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-xl transition-colors border border-outline-variant/10"
          >
            Hoy
          </button>
          <button
            onClick={() => handleNewAppointment()}
            className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
          >
            <IconPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Nueva Cita</span>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={navigatePrev}
            className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-xl transition-colors"
          >
            <IconChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold text-on-surface min-w-[200px] text-center">
            {view === "month"
              ? `${MONTHS_ES[currentMonth]} ${currentYear}`
              : view === "week"
                ? `${weekDays[0].dayName} ${weekDays[0].day} - ${weekDays[6].dayName} ${weekDays[6].day} ${MONTHS_ES[currentMonth]}`
                : `${DAYS_SHORT[currentDate.getDay()]} ${currentDate.getDate()} ${MONTHS_ES[currentMonth]}`}
          </h2>
          <button
            onClick={navigateNext}
            className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-xl transition-colors"
          >
            <IconChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-center text-sm text-on-surface-variant py-12">
          Cargando citas...
        </p>
      )}

      {/* ---- MONTH VIEW ---- */}
      {!loading && view === "month" && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-sm overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-outline-variant/10 bg-surface-container/50">
            {DAYS_SHORT.map((day, i) => (
              <div
                key={day}
                className={`p-3 text-center text-xs font-bold tracking-wider uppercase ${
                  i === 0 || i === 6
                    ? "text-on-surface-variant/50"
                    : "text-on-surface-variant"
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 grid-rows-6">
            {monthGrid.map((cell) => {
              const isToday = cell.date === today;
              const dayAppts = appointmentsByDate[cell.date] || [];

              return (
                <div
                  key={cell.date}
                  className={`min-h-[100px] p-2 border-b border-r border-outline-variant/5 hover:bg-surface-container/20 transition-colors ${
                    !cell.isCurrentMonth ? "opacity-40" : ""
                  }`}
                  onClick={() => {
                    if (cell.isCurrentMonth) {
                      setSelectedDate(new Date(cell.date + "T12:00:00"));
                      handleNewAppointment(cell.date);
                    }
                  }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span
                      className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold ${
                        isToday
                          ? "bg-[#6063ee] text-white shadow-md shadow-[#6063ee]/30"
                          : "text-on-surface-variant"
                      }`}
                    >
                      {cell.day}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {dayAppts.slice(0, 3).map((appt) => (
                      <button
                        key={appt.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditAppointment(appt);
                        }}
                        className={`w-full text-left px-2 py-1 text-[10px] font-bold rounded-md truncate border-l-2 ${getStatusColor(
                          appt.status,
                        )}`}
                      >
                        {appt.start_time.slice(0, 5)} {appt.title}
                      </button>
                    ))}
                    {dayAppts.length > 3 && (
                      <span className="text-[10px] text-on-surface-variant font-medium px-2">
                        +{dayAppts.length - 3} más
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- WEEK VIEW ---- */}
      {!loading && view === "week" && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-sm overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-8 border-b border-outline-variant/10 bg-surface-container/50">
            <div className="p-3" />
            {weekDays.map((d) => {
              const isToday = d.date === today;
              return (
                <div key={d.date} className="p-3 text-center">
                  <div className="text-xs font-bold text-on-surface-variant">
                    {d.dayName}
                  </div>
                  <div
                    className={`text-lg font-bold ${
                      isToday
                        ? "text-[#6063ee]"
                        : "text-on-surface"
                    }`}
                  >
                    {d.day}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="grid grid-cols-8 max-h-[600px] overflow-y-auto">
            {/* Hour labels */}
            <div className="border-r border-outline-variant/5">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="h-16 border-b border-outline-variant/5 flex items-start justify-end pr-2 pt-1"
                >
                  <span className="text-[10px] font-medium text-on-surface-variant">
                    {String(h).padStart(2, "0")}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((d) => (
              <div
                key={d.date}
                className="border-r border-outline-variant/5"
              >
                {HOURS.map((h) => {
                  const hourAppts = getAppointmentsForHour(d.date, h);
                  return (
                    <div
                      key={h}
                      className="h-16 border-b border-outline-variant/5 relative hover:bg-surface-container/20 transition-colors cursor-pointer"
                      onClick={() => handleNewAppointment(d.date, `${String(h).padStart(2, "0")}:00`)}
                    >
                      {hourAppts.map((appt) => (
                        <button
                          key={appt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditAppointment(appt);
                          }}
                          className={`absolute inset-x-1 top-0 px-1.5 py-0.5 text-[10px] font-bold rounded border-l-2 ${getStatusColor(
                            appt.status,
                          )} truncate z-10`}
                          style={{
                            height: `${Math.max(
                              ((parseInt(appt.end_time.split(":")[0]) * 60 +
                                parseInt(appt.end_time.split(":")[1])) -
                                (parseInt(appt.start_time.split(":")[0]) * 60 +
                                  parseInt(appt.start_time.split(":")[1]))) /
                                60 *
                                64,
                              20,
                            )}px`,
                          }}
                        >
                          {appt.start_time.slice(0, 5)} {appt.title}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- DAY VIEW ---- */}
      {!loading && view === "day" && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-sm overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            {HOURS.map((h) => {
              const dateStr = formatDate(currentDate);
              const hourAppts = getAppointmentsForHour(dateStr, h);

              return (
                <div key={h} className="flex border-b border-outline-variant/5">
                  <div className="w-20 shrink-0 p-3 text-right border-r border-outline-variant/5">
                    <span className="text-xs font-medium text-on-surface-variant">
                      {String(h).padStart(2, "0")}:00
                    </span>
                  </div>
                  <div
                    className="flex-1 min-h-[64px] p-2 hover:bg-surface-container/20 transition-colors cursor-pointer"
                    onClick={() =>
                      handleNewAppointment(
                        dateStr,
                        `${String(h).padStart(2, "0")}:00`,
                      )
                    }
                  >
                    {hourAppts.map((appt) => (
                      <button
                        key={appt.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditAppointment(appt);
                        }}
                        className={`w-full text-left p-3 rounded-xl mb-1 border-l-4 ${getStatusColor(
                          appt.status,
                        )}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-on-surface">
                            {appt.title}
                          </span>
                          <span className="text-xs text-on-surface-variant">
                            {appt.start_time.slice(0, 5)} -{" "}
                            {appt.end_time.slice(0, 5)}
                          </span>
                        </div>
                        {appt.customers?.full_name && (
                          <span className="text-xs text-on-surface-variant">
                            {appt.customers.full_name}
                          </span>
                        )}
                        {appt.service_type && (
                          <span className="text-xs text-on-surface-variant ml-2">
                            - {appt.service_type}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming list (month view sidebar) */}
      {!loading && view === "month" && appointments.length > 0 && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-6 shadow-sm">
          <h3 className="font-bold text-on-surface mb-4">
            Próximas Citas ({appointments.length})
          </h3>
          <div className="space-y-2">
            {appointments.slice(0, 5).map((appt) => (
              <button
                key={appt.id}
                onClick={() => handleEditAppointment(appt)}
                className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-surface-container transition-colors text-left"
              >
                <div
                  className={`w-2 h-10 rounded-full ${
                    appt.status === "confirmed"
                      ? "bg-[#6063ee]"
                      : appt.status === "completed"
                        ? "bg-emerald-500"
                        : appt.status === "cancelled"
                          ? "bg-error-container"
                          : "bg-amber-500"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-on-surface truncate">
                    {appt.title}
                  </div>
                  <div className="text-xs text-on-surface-variant">
                    {appt.appointment_date} {appt.start_time.slice(0, 5)} -{" "}
                    {appt.end_time.slice(0, 5)}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-md border ${getStatusColor(
                    appt.status,
                  )}`}
                >
                  {getStatusLabel(appt.status)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && appointments.length === 0 && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl p-12 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-on-surface mb-2">
            No hay citas este mes
          </h2>
          <p className="text-sm text-on-surface-variant max-w-sm mb-6">
            Crea tu primera cita haciendo clic en el botón de arriba o en
            cualquier celda del calendario.
          </p>
          <button
            onClick={() => handleNewAppointment()}
            className="px-6 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-high transition-colors"
          >
            Nueva Cita
          </button>
        </div>
      )}

      {/* Modal */}
      <AppointmentModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedAppointment(null);
        }}
        selectedDate={currentDate}
        appointment={selectedAppointment}
        defaultStartTime={defaultStartTime}
      />
    </div>
  );
}
