"use client";

import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui/Select";
import { SchoolModal } from "@/components/school/SchoolModal";
import Link from "next/link";
import { formatMoney, formatShortDate } from "@/components/school/format";
import { fetchCustomers, fetchCustomerSales } from "@/services/customers.service";
import type { Customer, CustomerSale } from "@/services/customers.service";
import { fetchStudents, fetchTeacherProfiles } from "@/services/school-people.service";
import type { SchoolStudent, TeacherProfile } from "@/services/school-people.service";
import { fetchLessonPlans, fetchSellableServices, schoolEnroll } from "@/services/school-enrollments.service";
import type { LessonPlan } from "@/services/school-enrollments.service";
import { notifySuccess, notifyError } from "@/lib/notifications";

interface EnrollmentFormProps {
  studentId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Matrícula de un alumno en un plan.
 *
 * La entrada es DUPLICADA a propósito: se paga en el POS (venta del servicio
 * de la clase) y se matricula acá (consumo del plan). Cuando la venta ya
 * existe, se pasa `sale_id` para que el RPC la valide y la vincule; sin venta
 * la matrícula es igualmente válida —es la libertad de negocio que pide el
 * diseño, no un atajo para evadir el cobro.
 */
export function EnrollmentForm({ studentId, onClose, onSaved }: EnrollmentFormProps) {
  const [students, setStudents] = useState<SchoolStudent[]>([]);
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [services, setServices] = useState<{ id: string; price: number }[]>([]);
  const [sales, setSales] = useState<CustomerSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);

  const [selectedStudentId, setSelectedStudentId] = useState(studentId ?? "");
  const [planId, setPlanId] = useState("");
  const [instrument, setInstrument] = useState("");
  const [payerId, setPayerId] = useState("");
  const [saleId, setSaleId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetchStudents().then(setStudents),
      fetchLessonPlans(true).then(setPlans),
      fetchCustomers().then(setCustomers),
      fetchTeacherProfiles().then(setTeachers),
      fetchSellableServices().then((s) => setServices(s.map((x) => ({ id: x.id, price: x.price })))),
    ]).catch(() => {});
  }, []);

  // Al cambiar el alumno, precargar su instrumento (en el handler, no en un effect).
  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const handleStudentChange = (value: string) => {
    setSelectedStudentId(value);
    const next = students.find((s) => s.id === value);
    if (next?.instrument) setInstrument(next.instrument);
  };

  // Ventas cerradas del pagador: la carga vive en el effect, el reset de
  // estado (llenar vacío) en el handler del selector.
  useEffect(() => {
    if (!payerId) return;
    let cancelled = false;
    fetchCustomerSales(payerId)
      .then((rows) => {
        if (cancelled) return;
        setSales(rows.filter((s) => s.total > 0));
      })
      .catch(() => {
        if (cancelled) return;
        setSales([]);
      })
      .finally(() => {
        if (!cancelled) setSalesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payerId]);

  const handlePayerChange = (value: string) => {
    setPayerId(value);
    setSaleId("");
    setSales([]);
    setSalesLoading(value !== "");
  };

  const selectedPlan = plans.find((p) => p.id === planId);
  const selectedSale = sales.find((s) => s.id === saleId);
  const planService = services.find((s) => s.id === selectedPlan?.service_id);
  const previewPrice =
    selectedPlan && planService ? planService.price * selectedPlan.lesson_count : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !planId || !instrument.trim()) return;

    setLoading(true);
    try {
      await schoolEnroll({
        student_id: selectedStudentId,
        lesson_plan_id: planId,
        instrument: instrument.trim(),
        sale_id: saleId || null,
        payer_customer_id: payerId || null,
        default_teacher_profile_id: teacherId || null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      setLoading(false);
      notifyError("No se pudo matricular", message);
      return;
    }
    setLoading(false);
    notifySuccess(
      "Matrícula registrada",
      selectedStudent?.full_name
        ? `${selectedStudent.full_name} · ${selectedPlan?.name}`
        : selectedPlan?.name,
    );
    onSaved();
    onClose();
  };

  const studentOptions = useMemo(() => [...students].sort((a, b) => a.full_name.localeCompare(b.full_name)), [students]);

  return (
    <SchoolModal title="Matricular alumno" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Alumno"
            value={selectedStudentId}
            onChange={(e) => handleStudentChange(e.target.value)}
            searchable
            searchPlaceholder="Buscar alumno…"
          >
            <option value="">Seleccionar…</option>
            {studentOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} — {s.instrument}
              </option>
            ))}
          </Select>
          <div className="space-y-1.5">
            <Select
              label="Plan de clase"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
            >
              <option value="">Seleccionar…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.lesson_count} clases)
                </option>
              ))}
            </Select>
            {plans.length === 0 && (
              <p className="text-xs text-on-surface-variant">
                No hay planes de clase. Creá uno en{" "}
                <Link href="/dashboard/school/planes" className="font-semibold text-primary hover:underline">
                  Planes de clase
                </Link>
                .
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-sm font-semibold text-on-surface">
              Instrumento <span className="text-primary">*</span>
            </label>
            <input
              type="text"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              placeholder="Ej. Guitarra"
              required
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <Select
            label="Profesor por defecto"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            hint="Opcional: las clases se pueden asignar a otro después."
          >
            <option value="">Sin asignar</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </Select>
        </div>

        <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4 space-y-4">
          <Select
            label="¿Quién paga? (opcional)"
            value={payerId}
            onChange={(e) => handlePayerChange(e.target.value)}
            size="sm"
            hint="Si la venta se hizo a nombre de otra persona (padre, empresa), se la marcás acá."
          >
            <option value="">El alumno / su cliente</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>

          {payerId && (
            <div className="text-xs">
              <p className="mb-1.5 font-semibold text-on-surface-variant">
                Venta del plan en el POS (opcional)
                {salesLoading && " · cargando…"}
              </p>
              {sales.length > 0 ? (
                <select
                  value={saleId}
                  onChange={(e) => setSaleId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="">Sin vincular venta</option>
                  {sales.map((s) => (
                    <option key={s.id} value={s.id}>
                      #{s.sale_number} · {formatMoney(s.total)} · {formatShortDate(s.created_at)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-lg bg-surface-container/60 px-3 py-2 text-on-surface-variant">
                  Ese cliente no tiene ventas cerradas — la matrícula se registra igual y el plan se cobra después.
                </p>
              )}
            </div>
          )}
        </div>

        {selectedPlan && planService && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Vista previa del plan</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-on-surface-variant">Clases</dt>
              <dd className="text-right font-semibold text-on-surface">{selectedPlan.lesson_count} × {selectedPlan.duration_minutes} min</dd>
              <dt className="text-on-surface-variant">Precio de la clase</dt>
              <dd className="text-right font-semibold text-on-surface">{formatMoney(planService.price)}</dd>
              <dt className="text-on-surface-variant">Total a congelar</dt>
              <dd className="text-right font-bold text-primary">{formatMoney(previewPrice ?? 0)}</dd>
              <dt className="text-on-surface-variant">Vigencia</dt>
              <dd className="text-right font-semibold text-on-surface">{selectedPlan.validity_days} días desde la matrícula</dd>
            </dl>
            {selectedSale && (
              <p className="mt-2 border-t border-primary/20 pt-2 text-xs text-on-surface-variant">
                Se vincula a la venta <span className="font-semibold text-on-surface">#{selectedSale.sale_number}</span> — el plan
                queda pagado con esa factura.
              </p>
            )}
          </div>
        )}

        <div className="pt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || !selectedStudentId || !planId || !instrument.trim()}
            className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dim text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Matriculando…" : "Matricular"}
          </button>
        </div>
      </form>
    </SchoolModal>
  );
}