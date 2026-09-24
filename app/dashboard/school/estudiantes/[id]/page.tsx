"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSchoolPeopleStore } from "@/stores/school-people.store";
import { StudentCard } from "@/components/school/StudentCard";
import { GuardianForm } from "@/components/school/GuardianForm";
import { EnrollmentForm } from "@/components/school/EnrollmentForm";
import { CreditHistory } from "@/components/school/CreditHistory";
import { formatMoney, formatShortDate } from "@/components/school/format";
import { CollectionLoading, CollectionError } from "@/components/CollectionState";

/** Ficha de un alumno: datos + adultos responsables + matrículas y su detalle. */
export default function EstudianteDetailPage() {
  const params = useParams<{ id: string }>();
  const detail = useSchoolPeopleStore((s) => s.detail);
  const loading = useSchoolPeopleStore((s) => s.loading);
  const error = useSchoolPeopleStore((s) => s.error);
  const fetchStudentDetail = useSchoolPeopleStore((s) => s.fetchStudentDetail);
  const fetchStudents = useSchoolPeopleStore((s) => s.fetchStudents);

  const [showGuardianForm, setShowGuardianForm] = useState(false);
  const [editingGuardian, setEditingGuardian] = useState<string | null>(null);
  const [showEnrollForm, setShowEnrollForm] = useState(false);

  const student = detail?.student ?? null;
  const guardians = detail?.guardians ?? [];
  const enrollments = detail?.enrollments ?? [];
  const movements = detail?.movements ?? [];

  // El saldo "disponible" de la tarjeta suma SOLO matrículas activas: una
  // matrícula vencida conserva su histórico pero ya no es saldo usable, y la
  // reconstruction por matrícula vive en CreditHistory.
  const activeBalance = useMemo(() => {
    const activeIds = new Set(enrollments.filter((e) => e.status === "active").map((e) => e.id));
    return movements
      .filter((m) => activeIds.has(m.enrollment_id))
      .reduce((acc, m) => acc + m.amount, 0);
  }, [enrollments, movements]);

  const refresh = () => {
    if (params.id) void fetchStudentDetail(params.id);
    void fetchStudents();
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading && !detail) return <CollectionLoading label="Cargando alumno…" />;
  if (error && !detail) return <CollectionError message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/school/estudiantes"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary"
      >
        ← Volver a alumnos
      </Link>

      {student && (
        <StudentCard
          student={student}
          balance={activeBalance}
          guardiansCount={guardians.length}
        />
      )}

      {error && <CollectionError message={error} onRetry={refresh} />}

      {/* Adultos responsables */}
      <section className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-on-surface">Adultos responsables</h2>
          <button
            onClick={() => {
              setEditingGuardian(null);
              setShowGuardianForm(true);
            }}
            className="rounded-lg border border-outline-variant/30 px-3 py-1.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
          >
            Agregar
          </button>
        </div>
        {guardians.length === 0 ? (
          <p className="mt-3 text-sm text-on-surface-variant">
            Sin adultos registrados. Si el alumno es menor, agregá al menos uno.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {guardians.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-on-surface">
                    {g.full_name}
                    <span className="ml-2 text-sm font-normal text-on-surface-variant">{g.relationship}</span>
                  </p>
                  <p className="mt-0.5 truncate text-sm text-on-surface-variant">
                    {[g.phone, g.email].filter(Boolean).join(" · ") || "Sin contacto propio"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {g.is_notice_receiver && (
                    <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
                      Recibe avisos
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setEditingGuardian(g.id);
                      setShowGuardianForm(true);
                    }}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
                  >
                    Editar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Matrículas */}
      <section className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-on-surface">Matrículas</h2>
          <button
            onClick={() => setShowEnrollForm(true)}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-dim"
          >
            Matricular
          </button>
        </div>
        {enrollments.length === 0 ? (
          <p className="mt-3 text-sm text-on-surface-variant">
            Este alumno todavía no tiene matrículas. Matricularlo en un plan para empezar a contar clases.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {enrollments.map((e) => (
              <li key={e.id} className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-on-surface">
                      {e.plan_name}
                      <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        e.status === "active"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-surface-container text-on-surface-variant"
                      }`}>
                        {e.status === "active" ? "Activa" : e.status}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-on-surface-variant">
                      {formatMoney(e.plan_price)} · vence {formatShortDate(e.expiry_date)}
                      {e.sale_id ? " · pagada en el POS" : " · sin venta vinculada"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                      {e.contracted_lessons} {e.contracted_lessons === 1 ? "clase" : "clases"}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Libro mayor de créditos (por matrícula, con ajuste explícito) */}
      <CreditHistory
        enrollments={enrollments}
        movements={movements}
        onChanged={refresh}
      />

      {showGuardianForm && student && (
        <GuardianForm
          studentId={student.id}
          guardian={guardians.find((g) => g.id === editingGuardian) ?? null}
          onClose={() => {
            setShowGuardianForm(false);
            setEditingGuardian(null);
          }}
          onSaved={refresh}
        />
      )}
      {showEnrollForm && (
        <EnrollmentForm studentId={student?.id ?? null} onClose={() => setShowEnrollForm(false)} onSaved={refresh} />
      )}
    </div>
  );
}