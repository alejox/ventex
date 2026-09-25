"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSchoolPeopleStore } from "@/stores/school-people.store";
import { useSchoolMaterialsStore } from "@/stores/school-materials.store";
import { StudentCard } from "@/components/school/StudentCard";
import { GuardianForm } from "@/components/school/GuardianForm";
import { EnrollmentForm } from "@/components/school/EnrollmentForm";
import { CreditHistory } from "@/components/school/CreditHistory";
import { MaterialForm } from "@/components/school/MaterialForm";
import { FamilyLinkDialog } from "@/components/school/FamilyLinkDialog";
import { ShareWhatsAppButton } from "@/components/school/ShareWhatsAppButton";
import { formatMoney, formatShortDate } from "@/components/school/format";
import { renderSchoolMessage, noticeShareGate } from "@/services/school-materials.service";
import { CollectionLoading, CollectionError } from "@/components/CollectionState";
import type { StudentGuardian } from "@/services/school-people.service";

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
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [linkingGuardians, setLinkingGuardians] = useState(false);

  const materials = useSchoolMaterialsStore((s) => s.materialsForStudent);
  const fetchMaterialsForStudent = useSchoolMaterialsStore((s) => s.fetchMaterialsForStudent);
  const deleteMaterial = useSchoolMaterialsStore((s) => s.deleteMaterial);

  const student = detail?.student ?? null;
  const guardians = detail?.guardians ?? [];
  const enrollments = detail?.enrollments ?? [];
  const movements = detail?.movements ?? [];
  // El receptor de avisos es el destinatario de "Compartir material": mandarle
  // el aviso a cualquier acudiente ignoraría la preferencia que la escuela ya
  // registró (school-academics: "exactamente un receptor de avisos").
  const noticeReceiver: StudentGuardian | null = guardians.find((g) => g.is_notice_receiver) ?? null;

  // El saldo "disponible" de la tarjeta suma SOLO matrículas activas: una
  // matrícula vencida conserva su histórico pero ya no es saldo usable, y la
  // reconstruction por matrícula vive en CreditHistory.
  const activeBalance = useMemo(() => {
    const activeIds = new Set(enrollments.filter((e) => e.status === "active").map((e) => e.id));
    return movements
      .filter((m) => activeIds.has(m.enrollment_id))
      .reduce((acc, m) => acc + m.amount, 0);
  }, [detail?.enrollments, detail?.movements]);

  const refresh = () => {
    if (params.id) {
      void fetchStudentDetail(params.id);
      void fetchMaterialsForStudent(params.id);
    }
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
                    onClick={() => setLinkingGuardians(true)}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
                  >
                    Enviar enlace
                  </button>
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

      {/* Material de estudio (fase 5: bucket privado + enlaces de familia) */}
      <section className="rounded-3xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-on-surface">Material de estudio</h2>
          <button
            onClick={() => setShowMaterialForm(true)}
            className="rounded-lg border border-outline-variant/30 px-3 py-1.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
          >
            Subir material
          </button>
        </div>
        {materials.length === 0 ? (
          <p className="mt-3 text-sm text-on-surface-variant">
            Sin material publicado para este alumno todavía.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {materials.map((m) => {
              const gate = noticeReceiver ? noticeShareGate(noticeReceiver) : { ok: false };
              const message = noticeReceiver
                ? renderSchoolMessage(null, "material", {
                    acudiente: noticeReceiver.full_name,
                    alumno: student?.full_name ?? "",
                    titulo: m.title,
                    enlace: "pedí tu enlace de la escuela si no lo tenés a mano",
                  })
                : "";
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-on-surface">{m.title}</p>
                    <p className="mt-0.5 truncate text-sm text-on-surface-variant">
                      {m.kind === "file" ? m.file_name : m.external_url} ·{" "}
                      {formatShortDate(m.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {noticeReceiver ? (
                      <ShareWhatsAppButton
                        message={message}
                        phone={noticeReceiver.phone}
                        studentId={student?.id}
                        guardianCustomerId={noticeReceiver.customer_id}
                        purpose="material"
                        disabled={!gate.ok}
                        disabledReason={gate.reason}
                      />
                    ) : (
                      <span className="text-xs text-on-surface-variant/60">
                        Sin receptor de avisos
                      </span>
                    )}
                    <button
                      onClick={() => void deleteMaterial(m.id)}
                      className="rounded-lg px-2.5 py-1 text-xs font-semibold text-error transition-colors hover:bg-error/10"
                    >
                      Borrar
                    </button>
                  </div>
                </li>
              );
            })}
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
      {showMaterialForm && student && (
        <MaterialForm
          studentId={student.id}
          onClose={() => setShowMaterialForm(false)}
          onSaved={() => {
            setShowMaterialForm(false);
            refresh();
          }}
        />
      )}
      {linkingGuardians && student && (
        <FamilyLinkDialog
          studentId={student.id}
          studentName={student.full_name}
          guardians={guardians}
          onClose={() => setLinkingGuardians(false)}
        />
      )}
    </div>
  );
}