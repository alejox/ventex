"use client";

import { Suspense, useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useProfile } from "@/components/ProfileProvider";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppointmentsStore } from "@/stores/appointments.store";
import AppointmentModal from "@/components/appointments/AppointmentModal";
import type { Appointment } from "@/services/appointments.service";
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
} from "@/app/assets/icons/DashboardIcons";
import { CollectionError, CollectionFilteredEmpty, CollectionLoading } from "@/components/CollectionState";
import { toISODate } from "@/lib/date";
import { useStaffStore } from "@/stores/staff.store";
import { Select } from "@/components/ui/Select";

import { useSettingsStore } from "@/stores/settings.store";
import { formatAppointmentTime } from "@/lib/time";

// ---- HELPERS ----
const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/**
 * La clave de un día en la grilla. Va por el reloj local: la grilla se arma con
 * fechas locales, así que convertirlas a UTC para armar la clave desalineaba
 * las citas de la tarde contra el casillero del día siguiente.
 */
const formatDate = toISODate;

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
  return <Suspense fallback={<CollectionLoading label="Cargando calendario…" />}><CalendarContent /></Suspense>;
}

function CalendarContent() {
  const profile = useProfile();
  const timeFormat = useSettingsStore((s) => s.settings?.time_format ?? "12");
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  useEffect(() => { void fetchSettings(); }, [fetchSettings]);
  const appointments = useAppointmentsStore((s) => s.appointments);
  const loading = useAppointmentsStore((s) => s.loading);
  const error = useAppointmentsStore((s) => s.error);
  const fetchAppointments = useAppointmentsStore((s) => s.fetchAppointments);
  const setSelectedDate = useAppointmentsStore((s) => s.setSelectedDate);
  const fetchLinkedAppointment = useAppointmentsStore((s) => s.fetchLinkedAppointment);
  const linkLoading = useAppointmentsStore((s) => s.linkLoading);
  const linkError = useAppointmentsStore((s) => s.linkError);
  const searchParams = useSearchParams();
  const router = useRouter();
  const appointmentId = searchParams.get("appointment");

  const [displayMode, setDisplayMode] = useState<"calendar" | "list" | "pending">("calendar");
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("all");
  const staff = useStaffStore((s) => s.staff);
  const fetchStaff = useStaffStore((s) => s.fetchStaff);
  const staffList = useMemo(() => staff.filter((member) => member.status === "active"), [staff]);
  const [defaultStartTime, setDefaultStartTime] = useState<string>("09:00");

  const openLinkedAppointment = useCallback((appointment: Appointment) => {
    const date = new Date(`${appointment.appointment_date}T12:00:00`);
    setCurrentDate(date);
    setSelectedDate(date);
    setView("day");
    setDisplayMode("calendar");
    setSelectedStaffId("all");
    setSelectedStatus("all");
    setSelectedAppointment(appointment);
    setModalOpen(true);
  }, [setSelectedDate]);

  useEffect(() => {
    if (!appointmentId) return;
    let cancelled = false;
    void fetchLinkedAppointment(appointmentId).then((appointment) => {
      if (!cancelled && appointment) openLinkedAppointment(appointment);
    });
    return () => { cancelled = true; };
  }, [appointmentId, fetchLinkedAppointment, openLinkedAppointment]);

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

  useEffect(() => {
    void fetchStaff();
  }, [fetchStaff]);

  const filteredAppointments = useMemo(() => {
    if (selectedStaffId === "all") return appointments;
    return appointments.filter((a) => selectedStaffId === "unassigned" ? !a.staff_id : a.staff_id === selectedStaffId);
  }, [appointments, selectedStaffId]);

  const visibleAppointments = useMemo(() => filteredAppointments.filter((appointment) =>
    displayMode === "pending" ? appointment.status === "pending" : selectedStatus === "all" || appointment.status === selectedStatus
  ), [filteredAppointments, displayMode, selectedStatus]);
  const pendingCount = filteredAppointments.filter((appointment) => appointment.status === "pending").length;

  // Group appointments by date
  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    visibleAppointments.forEach((a) => {
      if (!map[a.appointment_date]) map[a.appointment_date] = [];
      map[a.appointment_date].push(a);
    });
    return map;
  }, [visibleAppointments]);

  // Navigate
  const navigatePrev = () => {
    const d = new Date(currentDate);
    if (view === "month") { d.setDate(1); d.setMonth(d.getMonth() - 1); }
    else if (view === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const navigateNext = () => {
    const d = new Date(currentDate);
    if (view === "month") { d.setDate(1); d.setMonth(d.getMonth() + 1); }
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

  /**
   * ¿El periodo que se está viendo ya contiene el día de hoy?
   *
   * Sin esto, "Hoy" parece roto: cuando ya estás en el periodo actual —que es
   * el caso al entrar— el clic no cambia nada y no hay ninguna señal de por
   * qué. El botón funciona; lo que faltaba era que dijera dónde estás parado.
   */
  const isOnToday = useMemo(() => {
    const now = new Date();
    if (view === "month") {
      return currentMonth === now.getMonth() && currentYear === now.getFullYear();
    }
    if (view === "week") {
      return weekDays.some((d) => d.date === today);
    }
    return formatDate(currentDate) === today;
  }, [view, currentMonth, currentYear, weekDays, currentDate, today]);

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
      <div className="flex flex-col gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Calendario</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Revisá las reservas pendientes, confirmá las citas y organizá la atención de tu equipo.
          </p>
          {!profile?.isWorker ? <Link href="/dashboard/landing?tab=business" className="mt-2 inline-block text-sm font-semibold text-primary underline underline-offset-2">Configurar reservas y horarios</Link> : null}
        </div>
        {/*
          En móvil los cuatro grupos suman ~480px contra 390 de pantalla: la
          fila no envolvía y "Nueva Cita" —la acción principal— quedaba fuera
          del viewport, alcanzable sólo con scroll horizontal. Ahora los
          controles envuelven y el botón se lleva su propia fila completa.
        */}
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-wrap items-end gap-2 sm:gap-3">
          {/* Display mode tabs */}
          <div className="flex shrink-0 items-center bg-surface-container border border-outline-variant/10 rounded-xl p-1 shadow-sm">
            {(["calendar", "list", "pending"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setDisplayMode(m)}
                aria-pressed={displayMode === m}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  displayMode === m
                    ? "bg-surface-container-lowest text-on-surface shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {m === "calendar" ? "Calendario" : m === "list" ? "Lista" : `Pendientes${loading ? "" : ` (${pendingCount})`}`}
              </button>
            ))}
          </div>

          {staffList.length > 0 && (
            <div className="w-48 shrink-0">
              <Select
                size="sm"
                label="Persona"
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
              >
                <option value="all">Todas las personas</option>
                <option value="unassigned">Sin asignar</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </Select>
            </div>
          )}

          {displayMode !== "pending" ? <div className="w-44 shrink-0"><Select size="sm" label="Estado" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}><option value="all">Todos los estados</option><option value="pending">Pendiente</option><option value="confirmed">Confirmada</option><option value="completed">Completada</option><option value="cancelled">Cancelada</option></Select></div> : null}
          <div className="flex shrink-0 items-center bg-surface-container border border-outline-variant/10 rounded-xl p-1 shadow-sm">
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
            disabled={isOnToday}
            aria-current={isOnToday ? "date" : undefined}
            title={isOnToday ? "Ya estás viendo hoy" : "Volver a hoy"}
            // Un control deshabilitado tiene que PARECER deshabilitado, y la
            // diferencia entre ambos estados tiene que verse de un vistazo: con
            // dos grises casi iguales el usuario lo sigue clickeando. `opacity`
            // sobre todo el botón es inequívoco; el estado activo, en cambio,
            // lleva borde y texto plenos para invitar al clic.
            className={`shrink-0 px-3 py-2 text-xs font-semibold rounded-xl border transition-all ${
              isOnToday
                ? "border-outline-variant/10 text-on-surface-variant opacity-40 cursor-not-allowed"
                : "border-outline-variant/40 text-on-surface hover:bg-surface-container hover:border-outline-variant"
            }`}
          >
            Hoy
          </button>
          </div>
          {/* Fila propia en móvil: el label vuelve a verse y el botón no se corta. */}
          <button
            onClick={() => handleNewAppointment()}
            className="w-full sm:w-auto shrink-0 bg-primary hover:bg-primary-dim text-on-primary text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2"
          >
            <IconPlus className="w-4 h-4" />
            <span>Nueva Cita</span>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={navigatePrev}
            aria-label="Período anterior"
            className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-xl transition-colors"
          >
            <IconChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold text-on-surface min-w-0 text-center">
            {view === "month"
              ? `${MONTHS_ES[currentMonth]} ${currentYear}`
              : view === "week"
                ? `${weekDays[0].dayName} ${weekDays[0].day} - ${weekDays[6].dayName} ${weekDays[6].day} ${MONTHS_ES[currentMonth]}`
                : `${DAYS_SHORT[currentDate.getDay()]} ${currentDate.getDate()} ${MONTHS_ES[currentMonth]}`}
          </h2>
          <button
            onClick={navigateNext}
            aria-label="Período siguiente"
            className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-xl transition-colors"
          >
            <IconChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <p className="text-sm text-on-surface-variant">{displayMode === "pending" ? "Reservas pendientes del período mostrado. Abrí una reserva para revisar sus datos y confirmarla." : "Seleccioná una cita para ver sus datos. Podés filtrar por persona y estado en cualquiera de las vistas."}</p>
      {!loading && !error && visibleAppointments.length === 0 && displayMode === "calendar" ? <CollectionFilteredEmpty title="No hay citas para esta vista" description="Probá otro período, quitá los filtros o creá una nueva cita." action={selectedStaffId !== "all" || selectedStatus !== "all" ? { label: "Quitar filtros", onClick: () => { setSelectedStaffId("all"); setSelectedStatus("all"); } } : { label: "Crear cita", onClick: () => handleNewAppointment() }} /> : null}

      {/* Error */}
      {error && <CollectionError message={error} />}
      {appointmentId && linkError && <CollectionError message={linkError} onRetry={() => void fetchLinkedAppointment(appointmentId).then((appointment) => {
        if (appointment) openLinkedAppointment(appointment);
      })} />}
      {appointmentId && linkLoading && <CollectionLoading label="Abriendo la reserva…" />}

      {/* Loading */}
      {loading && <CollectionLoading label="Cargando citas…" />}

      {/* ---- MONTH VIEW ---- */}
      {!loading && displayMode === "calendar" && view === "month" && (
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
                  className={`min-h-[72px] sm:min-h-[100px] p-1.5 sm:p-2 border-b border-r border-outline-variant/5 hover:bg-surface-container/20 transition-colors ${
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
                        className={`w-full text-center sm:text-left px-0.5 sm:px-2 py-1 text-[9px] sm:text-[10px] font-bold rounded-md truncate border-l-2 ${getStatusColor(
                          appt.status,
                        )}`}
                        title={`${formatAppointmentTime(appt.start_time, timeFormat)} ${appt.title}`}
                      >
                        {/*
                          En una celda de ~50px el texto completo se recortaba a
                          "11:…", que no dice ni la hora. En móvil se muestra
                          sólo la hora, que entera es más útil que un título
                          mutilado; el título vuelve desde `sm`.
                        */}
                        <span className="sm:hidden">{formatAppointmentTime(appt.start_time, timeFormat)}</span>
                        <span className="hidden sm:inline">
                          {formatAppointmentTime(appt.start_time, timeFormat)} {appt.title}
                        </span>
                      </button>
                    ))}
                    {dayAppts.length > 3 && <button type="button" onClick={(event) => { event.stopPropagation(); setCurrentDate(new Date(`${cell.date}T12:00:00`)); setView("day"); }} className="px-2 text-[10px] font-semibold text-primary">Ver {dayAppts.length - 3} más</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- WEEK VIEW ---- */}
      {!loading && displayMode === "calendar" && view === "week" && (
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
                    {formatAppointmentTime(`${String(h).padStart(2, "0")}:00`, timeFormat)}
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
                          {formatAppointmentTime(appt.start_time, timeFormat)} {appt.title}
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
      {!loading && displayMode === "calendar" && view === "day" && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-sm overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            {HOURS.map((h) => {
              const dateStr = formatDate(currentDate);
              const hourAppts = getAppointmentsForHour(dateStr, h);

              return (
                <div key={h} className="flex border-b border-outline-variant/5">
                  <div className="w-20 shrink-0 p-3 text-right border-r border-outline-variant/5">
                    <span className="text-xs font-medium text-on-surface-variant">
                      {formatAppointmentTime(`${String(h).padStart(2, "0")}:00`, timeFormat)}
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
                            {formatAppointmentTime(appt.start_time, timeFormat)} -{" "}
                            {formatAppointmentTime(appt.end_time, timeFormat)}
                          </span>
                        </div>
                        {appt.customers?.full_name && (
                          <span className="block text-xs text-on-surface-variant">
                            {appt.customers.full_name}
                          </span>
                        )}
                        {(appt.services?.name || appt.service_type || appt.staff?.full_name) && (
                          <span className="block text-xs text-on-surface-variant/80">
                            {[appt.services?.name ?? appt.service_type, appt.staff?.full_name]
                              .filter(Boolean)
                              .join(" · ")}
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

      {/* ---- LIST VIEW ---- */}
      {!loading && displayMode !== "calendar" && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-3xl shadow-sm">
          <div className="p-4 border-b border-outline-variant/10">
            <h3 className="font-bold text-on-surface">
              {displayMode === "pending" ? `Reservas pendientes (${visibleAppointments.length})` : `Citas (${visibleAppointments.length})`}
            </h3>
          </div>
          {visibleAppointments.length > 0 ? (
            <div className="divide-y divide-outline-variant/5">
              {visibleAppointments.map((appt) => (
                <button
                  key={appt.id}
                  onClick={() => handleEditAppointment(appt)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-surface-container/50 transition-colors text-left"
                >
                  <div
                    className={`w-2 h-10 rounded-full shrink-0 ${
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
                      {appt.appointment_date} · {formatAppointmentTime(appt.start_time, timeFormat)} -{" "}
                      {formatAppointmentTime(appt.end_time, timeFormat)}
                    </div>
                    {appt.customers?.full_name && (
                      <div className="text-xs text-on-surface-variant/80 truncate">
                        {appt.customers.full_name}
                      </div>
                    )}
                    {(appt.services?.name || appt.staff?.full_name) && (
                      <div className="text-xs text-on-surface-variant/80 truncate">
                        {[appt.services?.name, appt.staff?.full_name].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded-md shrink-0 border ${getStatusColor(
                      appt.status,
                    )}`}
                  >
                    {getStatusLabel(appt.status)}
                  </span>
                </button>
              ))}
            </div>
          ) : <CollectionFilteredEmpty title={displayMode === "pending" ? "No hay reservas pendientes en este período" : "No hay citas para estos filtros"} description={displayMode === "pending" ? "Las reservas recibidas desde tu web aparecerán aquí hasta que las confirmes o canceles. Revisá otros períodos para ver más reservas." : "Probá otro período o quitá los filtros de persona y estado."} action={{ label: "Ver calendario", onClick: () => { setDisplayMode("calendar"); setSelectedStatus("all"); } }} />}
        </div>
      )}



      {/* Modal */}
      <AppointmentModal
        key={selectedAppointment?.id ?? "new"}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedAppointment(null);
          if (appointmentId) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("appointment");
            router.replace(`/dashboard/calendar${params.size ? `?${params}` : ""}`, { scroll: false });
          }
        }}
        selectedDate={currentDate}
        appointment={selectedAppointment}
        defaultStartTime={defaultStartTime}
      />
    </div>
  );
}
