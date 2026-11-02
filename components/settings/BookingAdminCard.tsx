"use client";

import { useEffect, useId, useMemo } from "react";
import { useSettingsStore } from "@/stores/settings.store";
import { useStaffStore } from "@/stores/staff.store";
import { bookingAdminOptions, bookingAdminSettingsInput } from "@/lib/booking-admin";
import { notifyError, notifySuccess } from "@/lib/notifications";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";

const NONE = "";

/**
 * Ajustes → Negocio → "Reservas en línea". Owner only (the caller hides it from
 * workers; the SQL guard `settings_guard_booking_admin` enforces it). Saves on
 * change, independent from the business form's "Guardar".
 */
export function BookingAdminCard() {
  const titleId = useId();
  const settings = useSettingsStore((s) => s.settings);
  const submitting = useSettingsStore((s) => s.submitting);
  const saveBookingAdmin = useSettingsStore((s) => s.saveBookingAdmin);
  const staff = useStaffStore((s) => s.staff);
  const fetchStaff = useStaffStore((s) => s.fetchStaff);

  useEffect(() => {
    void fetchStaff();
  }, [fetchStaff]);

  const adminStaffId = settings?.booking_admin_staff_id ?? null;
  const assignAdmin = settings?.booking_assign_admin ?? false;
  const options = useMemo(() => bookingAdminOptions(staff, adminStaffId), [staff, adminStaffId]);

  const save = async (nextStaffId: string, nextAssign: boolean) => {
    const ok = await saveBookingAdmin(bookingAdminSettingsInput(nextStaffId, nextAssign));
    if (ok) {
      notifySuccess("Reservas en línea", "La asignación de reservas se actualizó.");
    } else {
      notifyError(
        "No se pudo guardar",
        useSettingsStore.getState().error ?? "Inténtalo de nuevo.",
      );
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-3xl overflow-hidden shadow-sm border border-outline-variant/10">
      <div className="p-6 md:p-8">
        <h2 id={titleId} className="text-lg font-bold text-on-surface">Reservas en línea</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Decide si las reservas de tu sitio web pueden asignarse a ti cuando el cliente elige &quot;Cualquiera disponible&quot;.
        </p>
      </div>

      <hr className="border-outline-variant/10" />

      <div className="p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="¿Cuál es tu ficha en el equipo?"
          value={adminStaffId ?? NONE}
          disabled={submitting}
          searchable={options.length > 8}
          hint="Elige la persona del equipo que eres tú."
          onChange={(e) => void save(e.target.value, assignAdmin)}
        >
          <option value={NONE}>Ninguna</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </Select>

        <div className="sm:col-span-2">
          <Switch
            label="Asignar reservas automáticas al administrador"
            description="Si está apagado, las reservas de 'Cualquiera disponible' solo se asignan a los barberos, y el horario se bloquea cuando todos están ocupados."
            checked={Boolean(adminStaffId) && assignAdmin}
            disabled={submitting || !adminStaffId}
            onCheckedChange={(checked) => void save(adminStaffId ?? NONE, checked)}
          />
        </div>
      </div>
    </div>
  );
}
