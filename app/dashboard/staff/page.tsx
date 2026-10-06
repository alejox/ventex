"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconUserBadge, IconPlus } from "@/app/assets/icons/DashboardIcons";
import { useStaffStore } from "@/stores/staff.store";
import { useSubscriptionStore } from "@/stores/subscription.store";
import { useSchoolPeopleStore } from "@/stores/school-people.store";
import { useSchoolStore } from "@/stores/school.store";
import { fetchStaffSales } from "@/services/staff.service";
import type { NewStaffInput, StaffMember, StaffSaleItem } from "@/services/staff.service";
import type { TeacherProfile } from "@/services/school-people.service";
import { catalogOptions, catalogLabel } from "@/services/school-settings.service";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog, useConfirm } from "@/components/ui/ConfirmDialog";
import { useProfile } from "@/components/ProfileProvider";
import { staffRolesForType, effectiveModules, permissionSummary } from "@/config/business";
import { useApplicablePermissions } from "./components/PermissionToggles";
import { mergeTeam, hasStaffRecord } from "@/lib/team";
import { AvailabilityEditor } from "@/components/school/AvailabilityEditor";
import { notifySuccess } from "@/lib/notifications";
import { GrantAccessModal } from "./components/GrantAccessModal";
import { EditAccessModal } from "./components/EditAccessModal";
import { PermissionsPanel } from "./components/PermissionsPanel";
import { ShiftHistorySection } from "./components/ShiftHistorySection";
import { StaffCardMenu, type StaffMenuAction } from "./components/StaffCardMenu";
import { Switch } from "@/components/ui/Switch";
import { CollectionEmpty, CollectionError, CollectionLoading } from "@/components/CollectionState";
import { StaffPhotoField } from "@/components/StaffPhotoField";
import Image from "next/image";
import { isUnlimitedCollaborators } from "@/config/plans";
import { useFormatMoney } from "@/lib/useMoney";

// Los cargos NO se escriben acá: salen de STAFF_ROLES_BY_TYPE según el rubro
// (config/business.ts). Una barbería ofrece Barbero y Estilista; una tienda,
// Cajero y Bodeguero. Tener la lista a mano en esta pantalla era lo que hacía
// que a un tendero le apareciera "Detailer" en el selector.
const EMPTY_STAFF: NewStaffInput = {
  full_name: "",
  role: "",
  phone: "",
  email: "",
  status: "active",
  photo_url: null,
  // Arranca visible: en una barbería casi todo el que se suma al equipo
  // atiende. Al cajero se lo apaga a mano, y el selector lo dice.
  show_on_website: true,
};

/** Lo que se compara para saber si la ficha tiene cambios sin guardar. */
function formSnapshot(form: NewStaffInput, teacherEnabled: boolean, specialties: string[], teacherBio: string): string {
  return JSON.stringify({ form, teacherEnabled, specialties: [...specialties].sort(), teacherBio: teacherBio.trim() });
}

export default function StaffPage() {
  const fmtMoney = useFormatMoney();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const staff = useStaffStore((s) => s.staff);
  const loading = useStaffStore((s) => s.loading);
  const error = useStaffStore((s) => s.error);
  const submitting = useStaffStore((s) => s.submitting);
  const fetchStaff = useStaffStore((s) => s.fetchStaff);
  const addStaff = useStaffStore((s) => s.addStaff);
  const updateStaff = useStaffStore((s) => s.updateStaff);
  const commissions = useStaffStore((s) => s.commissions);
  const fetchCommissions = useStaffStore((s) => s.fetchCommissions);

  const subscription = useSubscriptionStore((s) => s.subscription);
  const fetchSubscription = useSubscriptionStore((s) => s.fetchAll);
  const refreshUsage = useSubscriptionStore((s) => s.refreshUsage);

  const deleteStaff = useStaffStore((s) => s.deleteStaff);

  const accounts = useStaffStore((s) => s.accounts);
  const fetchAccounts = useStaffStore((s) => s.fetchAccounts);
  const revokeAccess = useStaffStore((s) => s.revokeAccess);
  const reactivateAccess = useStaffStore((s) => s.reactivateAccess);
  const resendInvitation = useStaffStore((s) => s.resendInvitation);

  // Perfil docente (Académico): una sección opcional de esta misma ficha, no
  // una pantalla aparte — ver la baja de /dashboard/school/profesores.
  const teachers = useSchoolPeopleStore((s) => s.teachers);
  const fetchTeachers = useSchoolPeopleStore((s) => s.fetchTeachers);
  const saveTeacher = useSchoolPeopleStore((s) => s.saveTeacher);
  const teacherError = useSchoolPeopleStore((s) => s.error);
  const clearTeacherError = useSchoolPeopleStore((s) => s.clearError);
  const schoolSettings = useSchoolStore((s) => s.settings);
  const fetchSchoolSettings = useSchoolStore((s) => s.fetchSettings);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NewStaffInput>(EMPTY_STAFF);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /** Foto del formulario al abrirlo: contra ella se decide si hay cambios sin guardar. */
  const [openedSnapshot, setOpenedSnapshot] = useState("");

  const [teacherEnabled, setTeacherEnabled] = useState(false);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [teacherBio, setTeacherBio] = useState("");
  const [specialtiesRequired, setSpecialtiesRequired] = useState(false);
  const [availabilityFor, setAvailabilityFor] = useState<TeacherProfile | null>(null);

  /** Ids de la persona sobre la que está abierto cada modal de acceso. */
  const [grantFor, setGrantFor] = useState<string | null>(null);
  const [editAccessFor, setEditAccessFor] = useState<string | null>(null);
  const [permsFor, setPermsFor] = useState<string | null>(null);

  const profile = useProfile();
  /** Solo los rubros con agenda tienen reserva online donde mostrar a alguien. */
  const hasBooking = Boolean(profile?.modules?.appointments);
  const roleOptions = staffRolesForType(profile?.businessType ?? null);
  /** Un cargo viejo que ya no está en el catálogo del rubro no se pierde. */
  const roleChoices =
    form.role && !roleOptions.includes(form.role) ? [form.role, ...roleOptions] : roleOptions;

  // `effectiveModules` y no `profile?.modules.school` a secas: es el mismo
  // cálculo que ya usa el sidebar (DashboardShell) para decidir si Académico
  // está prendido, así que esta sección no puede quedar desincronizada de él.
  const schoolModuleActive = Boolean(
    effectiveModules(profile?.businessType ?? null, profile?.modules ?? null).school,
  );

  /** Permisos que existen en este negocio: el resumen "Ve: …" no nombra los que no aplican. */
  const applicablePerms = useApplicablePermissions();

  // Una fila por PERSONA: la ficha manda y el acceso cuelga de ella.
  const team = useMemo(() => mergeTeam(staff, accounts), [staff, accounts]);

  const teacherByStaffId = useMemo(
    () => new Map(teachers.map((t) => [t.staff_id, t])),
    [teachers],
  );

  // Catálogo + cualquier especialidad ya elegida que haya quedado fuera de
  // él (dato legado): nunca desaparece de las chips, solo se marca.
  const specialtyChoices = useMemo(
    () => catalogOptions(schoolSettings.instruments, specialties),
    [schoolSettings.instruments, specialties],
  );
  const toggleSpecialty = (name: string) => {
    setSpecialties((prev) =>
      prev.includes(name) ? prev.filter((i) => i !== name) : [...prev, name],
    );
  };

  const commissionByStaff = useMemo(
    () => new Map(commissions.map((c) => [c.staff_id, c])),
    [commissions],
  );


  // Liquidar CREA UN GASTO, y escribir gastos es del dueño (así lo exige la
  // policy de `expenses`, y el RPC lo revalida). Un empleado ve la pantalla,
  // pero el botón que siempre le fallaría no se le dibuja.
  const canSettle = !profile?.isWorker;
  // Crear, editar y quitar accesos es solo del dueño real: un administrador
  // tiene poderes de dueño pero no puede ascender a nadie (ni a sí mismo).
  const canManageAccess = profile?.membershipKind === "owner";

  const grantMember = grantFor ? team.find((m) => m.id === grantFor) ?? null : null;
  const accountToEdit = editAccessFor ? accounts.find((a) => a.id === editAccessFor) ?? null : null;
  const accountForPerms = permsFor ? accounts.find((a) => a.id === permsFor) ?? null : null;

  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [salesStaff, setSalesStaff] = useState<StaffMember | null>(null);
  const [sales, setSales] = useState<StaffSaleItem[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);

  const openSales = useCallback(async (m: StaffMember) => {
    setSalesStaff(m);
    setSales([]);
    setSalesLoading(true);
    setSalesModalOpen(true);
    try {
      const data = await fetchStaffSales(m.id);
      setSales(data);
    } catch {
      setSales([]);
    } finally {
      setSalesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
    if (canManageAccess) fetchAccounts();
    fetchCommissions();
    fetchSubscription();
  }, [fetchStaff, fetchAccounts, fetchCommissions, fetchSubscription, canManageAccess]);

  // Perfiles docentes y catálogo de especialidades: solo tiene sentido pedirlos
  // si el negocio tiene Académico activo (si no, la sección ni se dibuja).
  useEffect(() => {
    if (!schoolModuleActive) return;
    void fetchTeachers();
    void fetchSchoolSettings();
  }, [schoolModuleActive, fetchTeachers, fetchSchoolSettings]);

  const handleRevoke = useCallback(
    async (accountId: string, name: string) => {
      const ok = await confirm({
        title: `¿Suspender el acceso de "${name}"?`,
        description: "Dejará de entrar inmediatamente, pero su ficha, permisos e historial se conservan.",
        confirmLabel: "Suspender",
        tone: "danger",
      });
      if (ok) await revokeAccess(accountId);
    },
    [revokeAccess, confirm],
  );

  const activeCount = staff.filter((m) => m.status === "active").length;
  const maxCollaborators =
    subscription && !isUnlimitedCollaborators(subscription.max_collaborators) ? subscription.max_collaborators : Infinity;
  const atCollaboratorLimit = activeCount >= maxCollaborators;

  const openCreate = () => {
    if (atCollaboratorLimit) return;
    setEditingId(null);
    setForm(EMPTY_STAFF);
    // Una persona nueva en un negocio con Académico activo es profesor salvo
    // que se destilde: es el caso más común (T7), y quien no enseña solo
    // desmarca el checkbox.
    setTeacherEnabled(schoolModuleActive);
    setSpecialties([]);
    setTeacherBio("");
    setSpecialtiesRequired(false);
    clearTeacherError();
    setOpenedSnapshot(formSnapshot(EMPTY_STAFF, schoolModuleActive, [], ""));
    setModalOpen(true);
  };

  const openEdit = (m: StaffMember) => {
    setEditingId(m.id);
    setForm({
      full_name: m.full_name,
      role: m.role ?? "",
      phone: m.phone ?? "",
      email: m.email ?? "",
      status: m.status,
      photo_url: m.photo_url,
      show_on_website: m.show_on_website ?? false,
    });
    const existingTeacher = teacherByStaffId.get(m.id) ?? null;
    setTeacherEnabled(Boolean(existingTeacher));
    setSpecialties(existingTeacher?.instruments ?? []);
    setTeacherBio(existingTeacher?.bio ?? "");
    setSpecialtiesRequired(false);
    clearTeacherError();
    setOpenedSnapshot(formSnapshot(
      {
        full_name: m.full_name,
        role: m.role ?? "",
        phone: m.phone ?? "",
        email: m.email ?? "",
        status: m.status,
        photo_url: m.photo_url,
        show_on_website: m.show_on_website ?? false,
      },
      Boolean(existingTeacher),
      existingTeacher?.instruments ?? [],
      existingTeacher?.bio ?? "",
    ));
    setModalOpen(true);
  };

  const handleClose = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_STAFF);
    setTeacherEnabled(false);
    setSpecialties([]);
    setTeacherBio("");
    setSpecialtiesRequired(false);
    clearTeacherError();
  };

  const staffFormDirty = modalOpen && formSnapshot(form, teacherEnabled, specialties, teacherBio) !== openedSnapshot;

  /** Escape, la X, el fondo o "Cancelar": con cambios sin guardar, se pregunta. */
  const requestCloseStaff = async () => {
    if (submitting) return;
    if (staffFormDirty) {
      const discard = await confirm({
        title: "¿Descartar los cambios?",
        description: "Tienes cambios sin guardar en esta ficha. Si cierras ahora, se pierden.",
        confirmLabel: "Descartar",
        cancelLabel: "Seguir editando",
        tone: "danger",
      });
      if (!discard) return;
    }
    handleClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (teacherEnabled && specialties.length === 0) {
      setSpecialtiesRequired(true);
      return;
    }
    setSpecialtiesRequired(false);

    // La ficha manda: primero se crea/actualiza `staff`, y solo si eso salió
    // bien se toca el perfil docente — nunca al revés.
    const wasCreating = !editingId;
    const staffId = editingId
      ? (await updateStaff(editingId, form))
        ? editingId
        : null
      : (await addStaff(form))?.id ?? null;
    if (!staffId) return;

    // La persona ya quedó creada aunque el perfil docente falle más abajo:
    // pasar a modo edición sobre ese id evita que un reintento vuelva a
    // llamar `addStaff` y duplique la ficha, y refrescar la lista la muestra
    // aunque el usuario cierre el modal sin reintentar.
    if (wasCreating) {
      setEditingId(staffId);
      void fetchStaff();
    }

    // Marcado ON: crea o actualiza el perfil docente con las especialidades y
    // la bio del formulario. Marcado OFF sobre alguien que YA tenía perfil: no
    // se toca nada — nunca se borra desde acá (ver decisión en el doc de la
    // feature). El perfil sigue existiendo, solo queda oculto en este form.
    if (schoolModuleActive && teacherEnabled) {
      const existingTeacher = teacherByStaffId.get(staffId) ?? null;
      const ok = await saveTeacher(existingTeacher?.id ?? null, {
        staff_id: staffId,
        instruments: specialties,
        bio: teacherBio.trim() || null,
      });
      if (!ok) return;
      void fetchTeachers();
    }

    handleClose();
    refreshUsage();
  };

  const initials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Personal</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Tu equipo en un solo lugar: cargo, comisión y quién entra al sistema.
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={atCollaboratorLimit}
          title={atCollaboratorLimit ? "Alcanzaste el límite de colaboradores de tu plan" : undefined}
          className="bg-[#6063ee] hover:bg-[#c0c1ff] text-white hover:text-[#0b0664] text-sm font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6063ee]/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#6063ee] disabled:hover:text-white"
        >
          <IconPlus className="w-4 h-4" />
          <span>Añadir Personal</span>
        </button>
      </div>

      {subscription && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-on-surface-variant">
            Colaboradores:{" "}
            <strong className="text-on-surface tabular-nums">
              {activeCount}
              {Number.isFinite(maxCollaborators) ? ` / ${maxCollaborators}` : ""}
            </strong>{" "}
            <span className="text-on-surface-variant/70">· Plan {subscription.plan_name}</span>
          </span>
        </div>
      )}

      {atCollaboratorLimit && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-600 dark:text-amber-400 flex flex-wrap items-center justify-between gap-2">
          <span>
            Alcanzaste el máximo de colaboradores del plan <strong>{subscription?.plan_name}</strong>.
          </span>
          <Link href="/dashboard/subscription" className="font-semibold underline whitespace-nowrap">
            Ver planes
          </Link>
        </div>
      )}

      {error && <CollectionError message={error} onRetry={fetchStaff} />}

      {loading ? (
        <CollectionLoading label="Cargando equipo…" />
      ) : staff.length === 0 ? (
        <CollectionEmpty icon={<IconUserBadge className="w-8 h-8" />} title="Aún no hay nadie en tu equipo" description="Añade a tu personal para llevar sus comisiones y, si lo necesitas, darle su propio usuario para entrar al sistema." action={{ label: "Añadir tu primer miembro", onClick: openCreate }} />
      ) : (
        // Grilla densa desde que la tarjeta lleva retrato: a tres columnas cada
        // una pasaba los 500px, y una foto de ese tamaño convierte la lista del
        // equipo en una galería.
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {team.map((m) => {
            /*
             * La comisión se configura por producto/servicio, no por persona.
             * Lo que se muestra es lo PENDIENTE, que es la pregunta real
             * ("¿cuánto le debo?"); el devengado del mes queda como contexto.
             * Antes solo existía el devengado, y después de pagarle al barbero
             * seguía mostrando el mismo número.
             */
            const c = commissionByStaff.get(m.id);
            const pending = c?.pending ?? 0;
            const acceso = m.account?.access_status ?? null;
            const puntoAcceso =
              acceso === "active"
                ? "bg-emerald-500"
                : acceso === "pending"
                  ? "bg-amber-500"
                  : acceso === "suspended"
                    ? "bg-error"
                    : "bg-outline-variant";
            const editable = hasStaffRecord(m);
            const teacher = teacherByStaffId.get(m.id) ?? null;
            const summaryId = `staff-card-${m.id}-summary`;

            // Qué VE esta persona, no solo si entra: "Activo" no dice si es la
            // cajera o la que lleva el inventario.
            const ve = m.account && !m.account.is_admin
              ? permissionSummary(m.account.worker_permissions ?? {}, applicablePerms)
              : null;
            const sinPermisos = Boolean(m.account && !m.account.is_admin && (!ve || ve.length === 0));
            const permisos = !m.account
              ? "Sin acceso al sistema"
              : m.account.is_admin
                ? "Ve: todo (administrador)"
                : ve && ve.length > 0
                  ? `Ve: ${ve.join(" · ")}`
                  : "Sin permisos: no ve ninguna sección";
            const acceso_texto =
              acceso === "pending" ? "Invitación pendiente" : acceso === "suspended" ? "Acceso suspendido" : null;

            // Lo secundario va al menú "⋯": antes eran hasta seis botones
            // apilados por tarjeta y la foto, el nombre y lo que se le debe
            // quedaban perdidos entre ellos.
            const actions: StaffMenuAction[] = [];
            if (editable) actions.push({ label: "Editar ficha", onSelect: () => openEdit(m) });
            actions.push({ label: "Ver ventas", onSelect: () => void openSales(m) });
            if (canSettle && editable && pending > 0) {
              actions.push({ label: "Ver comisiones", onSelect: () => router.push("/dashboard/staff/comisiones") });
            }
            if (teacher) actions.push({ label: "Disponibilidad", onSelect: () => setAvailabilityFor(teacher) });
            if (canManageAccess) {
              const account = m.account;
              if (!account) {
                actions.push({ label: "Dar acceso al sistema", tone: "primary", onSelect: () => setGrantFor(m.id) });
              } else {
                actions.push({ label: "Permisos", onSelect: () => setPermsFor(account.id) });
                actions.push({ label: "Cuenta de acceso", onSelect: () => setEditAccessFor(account.id) });
                if (account.access_status === "suspended") {
                  actions.push({ label: "Reactivar acceso", onSelect: () => void reactivateAccess(account.id) });
                } else if (account.access_status === "active") {
                  actions.push({ label: "Suspender acceso", tone: "danger", onSelect: () => void handleRevoke(account.id, m.full_name) });
                } else if (account.access_status === "pending") {
                  actions.push({
                    label: "Reenviar invitación",
                    disabled: submitting,
                    onSelect: async () => {
                      if (await resendInvitation(account.id)) {
                        notifySuccess("Invitación reenviada", `Le enviamos un correo nuevo a ${account.email ?? "la persona"}.`);
                      }
                    },
                  });
                }
              }
            }

            return (
              <div
                key={m.id}
                className="group relative flex flex-col rounded-2xl border border-outline-variant/10 bg-surface-container shadow-sm transition-all hover:border-primary/30 hover:shadow-md focus-within:border-primary/40"
              >
                {/*
                 * La tarjeta ES el botón de abrir la ficha (antes era un <div>
                 * con onClick: con teclado no se llegaba). El menú "⋯" va
                 * afuera del botón, encima: un botón dentro de otro no es válido.
                 */}
                <button
                  type="button"
                  onClick={() => editable && openEdit(m)}
                  aria-disabled={!editable}
                  aria-label={editable ? `Abrir la ficha de ${m.full_name}` : m.full_name}
                  aria-describedby={summaryId}
                  className="flex flex-1 flex-col rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-disabled:cursor-default"
                >
                  {/*
                   * El retrato manda en la tarjeta: es lo que hace reconocible a
                   * la persona de un vistazo. Sin foto quedan las iniciales en
                   * el MISMO lugar, para que la grilla no quede escalonada.
                   */}
                  <span className="relative block aspect-[4/5] w-full overflow-hidden rounded-t-2xl bg-primary/10">
                    {m.photo_url ? (
                      <Image
                        src={m.photo_url}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
                        unoptimized
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span aria-hidden="true" className="flex h-full items-center justify-center text-3xl font-bold text-primary/70">
                        {initials(m.full_name)}
                      </span>
                    )}

                    {/* Punto de estado sobre el retrato: si entra al sistema. */}
                    <span aria-hidden="true" className={`absolute bottom-2 right-2 h-3.5 w-3.5 rounded-full border-2 border-surface-container ${puntoAcceso}`} />

                    {m.status !== "active" && (
                      <span className="absolute left-2 top-2 rounded-md bg-scrim/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        Inactivo
                      </span>
                    )}

                    {hasBooking && m.status === "active" && editable && !m.show_on_website && (
                      <span className="absolute left-2 bottom-2 rounded-md bg-scrim/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        Oculto en la web
                      </span>
                    )}
                  </span>

                  <span className="flex flex-1 flex-col p-3">
                    <span className="block truncate text-sm font-bold text-on-surface transition-colors group-hover:text-primary">
                      {m.full_name}
                    </span>
                    <span className="block truncate text-[11px] text-on-surface-variant">
                      {[m.role, teacher ? teacher.instruments.join(" · ") || "Profesor" : null].filter(Boolean).join(" · ") || "—"}
                    </span>

                    <span id={summaryId} className="mt-3 block space-y-1.5">
                      {/* Lo pendiente es la pregunta real ("¿cuánto le debo?"). */}
                      <span className="flex items-baseline justify-between gap-2 rounded-lg bg-surface-container-lowest/60 px-2.5 py-2">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-on-surface-variant">Por pagar</span>
                        <span className={`truncate text-sm font-bold tabular-nums ${pending > 0 ? "text-on-surface" : "text-on-surface-variant"}`}>
                          {fmtMoney(pending)}
                        </span>
                      </span>
                      <span
                        title={permisos}
                        className={`block truncate text-[11px] ${sinPermisos || acceso === "suspended" ? "font-semibold text-warning" : "text-on-surface-variant"}`}
                      >
                        {acceso_texto ? `${acceso_texto} · ` : ""}{permisos}
                      </span>
                    </span>
                  </span>
                </button>

                <div className="absolute right-2 top-2 z-10">
                  <StaffCardMenu label={`Más acciones para ${m.full_name}`} actions={actions} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Eliminar miembro"
        description="¿Estás seguro de eliminar este miembro del equipo? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loadingLabel="Eliminando…"
        tone="danger"
        loading={submitting}
        icon={
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        }
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await deleteStaff(confirmDelete);
          setConfirmDelete(null);
        }}
      />

      {/* Modal Ventas del Personal */}
      {salesModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-on-surface">
                  {salesStaff?.full_name}
                </h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Ventas del mes en curso
                </p>
              </div>
              <button
                onClick={() => setSalesModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                aria-label="Cerrar"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {salesLoading ? (
                <p className="text-center text-sm text-on-surface-variant py-12">Cargando ventas…</p>
              ) : sales.length === 0 ? (
                <p className="text-center text-sm text-on-surface-variant py-12">Sin ventas registradas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold border-b border-outline-variant/10">
                        <th className="p-3 pl-0">Venta N.°</th>
                        <th className="p-3">Fecha</th>
                        <th className="p-3">Cliente</th>
                        <th className="p-3">Producto</th>
                        <th className="p-3 text-center">Cant</th>
                        <th className="p-3 text-right">Total</th>
                        <th className="p-3 text-right">Comisión</th>
                        <th className="p-3 pr-0 text-right">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/5 text-sm">
                      {sales.map((s) => (
                        <tr key={s.id} className="hover:bg-surface-container-lowest transition-colors">
                          <td className="p-3 pl-0 font-mono text-xs text-on-surface-variant">#{s.sale_number}</td>
                          <td className="p-3 text-xs text-on-surface-variant whitespace-nowrap">
                            {new Date(s.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" })}
                          </td>
                          <td className="p-3 text-xs text-on-surface max-w-[120px] truncate">
                            {s.customer_name ?? "De Paso"}
                          </td>
                          <td className="p-3 text-xs text-on-surface max-w-[160px] truncate">{s.product_name}</td>
                          <td className="p-3 text-center text-xs text-on-surface-variant">{s.quantity}</td>
                          <td className="p-3 text-right text-xs font-bold text-on-surface tabular-nums">
                            {fmtMoney(s.line_total)}
                          </td>
                          <td className="p-3 text-right text-xs font-semibold text-emerald-600 tabular-nums">
                            {fmtMoney(s.commissionAmount)}
                          </td>
                          <td className="p-3 pr-0 text-right">
                            {s.commissionAmount <= 0 ? (
                              <span className="text-[10px] text-on-surface-variant/60">Sin comisión</span>
                            ) : s.settlementId ? (
                              <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                Pagada
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#f59e0b]/10 text-[#b45309] border border-[#f59e0b]/20">
                                Pendiente
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-outline-variant/10">
                        <td colSpan={5} className="p-3 pl-0 text-right text-xs font-bold text-on-surface">
                          Pendiente por liquidar
                        </td>
                        <td className="p-3 text-right text-sm font-bold text-[#b45309] tabular-nums">
                          {fmtMoney(sales.filter((i) => !i.settlementId).reduce((s, i) => s + i.commissionAmount, 0))}
                        </td>
                        <td className="p-3 pr-0" />
                      </tr>
                      <tr>
                        <td colSpan={5} className="p-3 pl-0 text-right text-xs text-on-surface-variant">
                          Devengado en el mes
                        </td>
                        <td className="p-3 text-right text-xs font-semibold text-on-surface-variant tabular-nums">
                          {fmtMoney(sales.reduce((s, i) => s + i.commissionAmount, 0))}
                        </td>
                        <td className="p-3 pr-0" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onMouseDown={(event) => { if (event.target === event.currentTarget) void requestCloseStaff(); }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
              event.preventDefault();
              void requestCloseStaff();
            }
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="staff-form-title" className="bg-surface-container rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] border border-outline-variant/10 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low shrink-0">
              <h2 id="staff-form-title" className="text-lg sm:text-xl font-bold text-on-surface">
                {editingId ? "Editar Personal" : "Nuevo Personal"}
              </h2>
              <button
                onClick={() => void requestCloseStaff()}
                className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                aria-label="Cerrar"
              >
                <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
              {(error || teacherError) && (
                <div className="rounded-xl bg-error-container/20 border border-error-container/30 px-4 py-3 text-sm text-error-dim">
                  {error || teacherError}
                </div>
              )}

              <StaffPhotoField
                value={form.photo_url}
                nombre={form.full_name}
                onChange={(url) => setForm((f) => ({ ...f, photo_url: url }))}
              />

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-on-surface block">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  placeholder="Ej. Carlos Pérez"
                />
              </div>

              <Select
                label="Rol / Cargo"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="">Seleccionar cargo</option>
                {roleChoices.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </Select>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Teléfono</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                    placeholder="+57 300 123 4567"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-on-surface block">Correo Electrónico</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                    placeholder="carlos@ejemplo.com"
                  />
                </div>
              </div>

              {/* Hablar de citas acá era falso para tienda, que no las tiene.
                  El cupo del plan sí es cierto en los cuatro rubros: el
                  trigger enforce_staff_limit solo cuenta los activos. */}
              <Switch
                label="Activo"
                description="Trabaja hoy. Los inactivos no ocupan cupo de tu plan."
                checked={form.status === "active"}
                onCheckedChange={(checked) => setForm({ ...form, status: checked ? "active" : "inactive" })}
                className="p-3 sm:p-4 bg-surface-container-low rounded-xl border border-outline-variant/10"
              />

              {/* Perfil docente: opcional y solo si el negocio tiene Académico
                  activo. Es la misma persona, no otra pantalla — ver la baja de
                  /dashboard/school/profesores. */}
              {schoolModuleActive && (
                <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-3 sm:p-4 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-bold text-on-surface cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={teacherEnabled}
                      onChange={(e) => setTeacherEnabled(e.target.checked)}
                      className="w-4 h-4 accent-primary"
                    />
                    Es profesor
                  </label>
                  <p className="-mt-2 text-xs text-on-surface-variant">
                    Especialidades, bio y disponibilidad para Académico.
                  </p>

                  {teacherEnabled ? (
                    <div className="space-y-3">
                      {specialtiesRequired && (
                        <p className="text-xs font-semibold text-error">
                          Elige al menos una especialidad
                        </p>
                      )}
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1 text-[13px] font-semibold text-on-surface">
                          Especialidades <span className="text-primary">*</span>
                        </label>
                        {specialtyChoices.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {specialtyChoices.map((name) => (
                              <button
                                key={name}
                                type="button"
                                aria-pressed={specialties.includes(name)}
                                onClick={() => toggleSpecialty(name)}
                                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                                  specialties.includes(name)
                                    ? "bg-primary text-white"
                                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                                }`}
                              >
                                {catalogLabel(name, schoolSettings.instruments)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-on-surface-variant">
                            Agrega especialidades en{" "}
                            <Link href="/dashboard/school/config" className="font-semibold text-primary hover:underline">
                              Configuración de Académico
                            </Link>
                            .
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[13px] font-semibold text-on-surface">Bio / reseña</label>
                        <textarea
                          value={teacherBio}
                          onChange={(e) => setTeacherBio(e.target.value)}
                          rows={3}
                          placeholder="Formación, experiencia, enfoque pedagógico…"
                          className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl py-2.5 px-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                        />
                      </div>
                      {editingId && teacherByStaffId.has(editingId) && (
                        <button
                          type="button"
                          onClick={() => setAvailabilityFor(teacherByStaffId.get(editingId) ?? null)}
                          className="rounded-lg bg-surface-container-high px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-highest"
                        >
                          Disponibilidad
                        </button>
                      )}
                    </div>
                  ) : (
                    editingId &&
                    teacherByStaffId.has(editingId) && (
                      <p className="text-xs text-on-surface-variant">
                        Este perfil docente no se borra: los datos quedan guardados y solo se
                        ocultan estos campos.
                      </p>
                    )
                  )}
                </div>
              )}

              {hasBooking && (
                <Switch
                  label="Mostrar en la página web"
                  description="Los clientes lo ven en tu sitio y pueden reservar con esta persona. Apágalo para cajeros, recepción o quien no atiende."
                  checked={form.show_on_website}
                  onCheckedChange={(checked) => setForm({ ...form, show_on_website: checked })}
                  className="p-3 sm:p-4 bg-surface-container-low rounded-xl border border-outline-variant/10"
                />
              )}

              <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-outline-variant/10">
                {editingId && (
                  <button
                    type="button"
                    onClick={() => { setConfirmDelete(editingId); handleClose(); }}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-error-dim hover:text-error hover:bg-error-container/10 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Eliminar
                  </button>
                )}
                <div className="flex-1 flex gap-3">
                  <button
                    type="button"
                    onClick={() => void requestCloseStaff()}
                    className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary-dim text-on-primary shadow-[0_0_15px_rgba(96,99,238,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Guardando…" : editingId ? "Guardar Cambios" : "Añadir al Equipo"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Turnos de caja: solo tiene sentido para quien sí entra al sistema. */}
      {accounts.length > 0 && <ShiftHistorySection workers={accounts} />}

      {grantMember && (
        <GrantAccessModal member={grantMember} onClose={() => setGrantFor(null)} />
      )}

      {accountToEdit && (
        <EditAccessModal worker={accountToEdit} onClose={() => setEditAccessFor(null)} />
      )}

      {accountForPerms && (
        <PermissionsPanel
          workerId={accountForPerms.id}
          current={accountForPerms.worker_permissions ?? {}}
          isAdmin={accountForPerms.is_admin}
          onClose={() => setPermsFor(null)}
        />
      )}

      {availabilityFor && (
        <AvailabilityEditor teacher={availabilityFor} onClose={() => setAvailabilityFor(null)} />
      )}

      {dialog}
    </div>
  );
}
