import type {
  Appointment,
  BillingDashboardSummary,
  Patient,
  Department,
  DoctorDirectoryEntry,
  Schedule,
  ScheduleException,
} from "@elite/contracts";
import type { SessionSummary } from "../preload/index.cjs";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import {
  getDoctorsScheduledToday,
  getTodayAppointmentMetrics,
  sortAppointmentsByStart,
  type WorkspaceLocale,
} from "./workspace-model.js";

export interface TodayWorkspaceLabels {
  todayEyebrow: string;
  todayWorkspace: string;
  greeting: string;
  findPatient: string;
  refreshToday: string;
  refreshing: string;
  appointments: string;
  waiting: string;
  completed: string;
  nextPatient: string;
  scheduledToday: string;
  arrivedNotCompleted: string;
  closedVisits: string;
  noUpcomingVisit: string;
  clinicQueue: string;
  todaysAppointments: string;
  localData: string;
  loadingAppointments: string;
  noAppointments: string;
  queueDescription: string;
  yourFocus: string;
  calmNextAction: string;
  patientIdentityFirst: string;
  patientIdentityFirstDetail: string;
  offlineValid: string;
  offlineValidDetail: string;
  minuteShort: string;
  quickActions: string;
  quickFindPatient: string;
  quickFindPatientDetail: string;
  quickAppointments: string;
  quickAppointmentsDetail: string;
  quickPayment: string;
  quickPaymentDetail: string;
  frontDeskView: string;
  allView: string;
  departmentFilter: string;
  allDepartments: string;
  waitingRoom: string;
  waitingColumn: string;
  inConsultationColumn: string;
  completedColumn: string;
  noPatientsInColumn: string;
  openPatients: string;
  openAppointments: string;
  openDoctors: string;
  openBilling: string;
  scheduledDoctors: string;
  loadingDoctors: string;
  noDoctorsScheduled: string;
  billingTitle: string;
  invoicedThisMonth: string;
  collectedThisMonth: string;
  outstanding: string;
  openInvoices: string;
  recentInvoices: string;
  noRecentInvoices: string;
  invoiceNumber: string;
  unableToLoadAppointments: string;
}

export interface TodayWorkspaceProps {
  token: string;
  session: SessionSummary;
  locale: WorkspaceLocale;
  labels: TodayWorkspaceLabels;
  formatDate: (
    value: string | Date,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  formatTime: (value: string | Date) => string;
  formatStatusLabel: (value: string) => string;
  onFindPatient: () => void;
  onOpenAppointments: () => void;
  onOpenDoctors: () => void;
  onOpenBilling: () => void;
}

function BidiValue({
  children,
  direction = "auto",
}: {
  children: ReactNode;
  direction?: "auto" | "ltr" | "rtl";
}): ReactElement {
  return <span dir={direction}>{children}</span>;
}

function formatEgp(value: number, locale: WorkspaceLocale): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function getAppointmentStatusClass(
  status: Appointment["status"],
): "ok" | "error" | "warn" | "info" {
  if (status === "completed") return "ok";
  if (status === "cancelled") return "error";
  if (status === "arrived") return "warn";
  return "info";
}

export function getTodayRoleFocus(
  role: SessionSummary["role"],
  locale: WorkspaceLocale,
): string {
  if (locale === "ar-EG") {
    return {
      admin: "راجع حالة العيادة وحوكمة الموظفين وعناصر التحكم المعلقة.",
      doctor: "حافظ على ظهور سياق المريض أثناء متابعة الرعاية اليوم.",
      nurse: "انقل المرضى من الوصول إلى تجهيز الغرفة مع إبقاء القائمة ظاهرة.",
      receptionist: "سجّل وصول المريض التالي وعالج تحذيرات الهوية مبكراً.",
    }[role];
  }
  return {
    admin:
      "Review the clinic’s status, staff governance, and pending controls.",
    doctor: "Keep today’s patient context visible while you move through care.",
    nurse: "Move patients from arrival to rooming with the queue in view.",
    receptionist:
      "Check in the next patient and resolve identity warnings early.",
  }[role];
}

export function TodayWorkspace({
  token,
  session,
  locale,
  labels,
  formatDate,
  formatTime,
  formatStatusLabel,
  onFindPatient,
  onOpenAppointments,
  onOpenDoctors,
  onOpenBilling,
}: TodayWorkspaceProps): ReactElement {
  const [appointments, setAppointments] = useState<readonly Appointment[]>([]);
  const [patients, setPatients] = useState<readonly Patient[]>([]);
  const [departments, setDepartments] = useState<readonly Department[]>([]);
  const [doctors, setDoctors] = useState<readonly DoctorDirectoryEntry[]>([]);
  const [dashboardView, setDashboardView] = useState<"front-desk" | "all">(
    "front-desk",
  );
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [schedules, setSchedules] = useState<readonly Schedule[]>([]);
  const [exceptions, setExceptions] = useState<readonly ScheduleException[]>(
    [],
  );
  const [billingSummary, setBillingSummary] =
    useState<BillingDashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    const today = new Date();
    const start = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    try {
      const canReadAppointments =
        session.capabilities.includes("appointment.read");
      const canReadPatients = session.capabilities.includes("patient.read");
      const canReadSchedules = session.capabilities.includes("clinical.read");
      const canReadBilling = session.capabilities.includes("billing.read");
      const [
        nextAppointments,
        nextPatients,
        nextDepartments,
        nextDoctors,
        nextSchedules,
        nextExceptions,
        nextBillingSummary,
      ] = await Promise.all([
        canReadAppointments
          ? window.elite.clinical.listAppointments(
              token,
              start.toISOString(),
              end.toISOString(),
            )
          : Promise.resolve([] as readonly Appointment[]),
        canReadPatients
          ? window.elite.patients.search(token, { limit: 200 })
          : Promise.resolve([] as readonly Patient[]),
        canReadAppointments
          ? window.elite.clinical.listDepartments(token)
          : Promise.resolve([] as readonly Department[]),
        canReadAppointments
          ? window.elite.clinical.listDoctors(token)
          : Promise.resolve([] as readonly DoctorDirectoryEntry[]),
        canReadSchedules
          ? window.elite.clinical.listSchedules(token)
          : Promise.resolve([] as readonly Schedule[]),
        canReadSchedules
          ? window.elite.clinical.listExceptions(token)
          : Promise.resolve([] as readonly ScheduleException[]),
        canReadBilling
          ? window.elite.billing.getDashboardSummary(token)
          : Promise.resolve(null as BillingDashboardSummary | null),
      ]);
      setAppointments(sortAppointmentsByStart(nextAppointments));
      setPatients(nextPatients);
      setDepartments(nextDepartments);
      setDoctors(nextDoctors);
      setSchedules(nextSchedules);
      setExceptions(nextExceptions);
      setBillingSummary(nextBillingSummary);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : labels.unableToLoadAppointments,
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const visibleAppointments = appointments.filter(
    (appointment) =>
      !departmentFilter || appointment.departmentId === departmentFilter,
  );
  const { waitingCount, completedCount, nextAppointment } =
    getTodayAppointmentMetrics(visibleAppointments);
  const waitingAppointments = visibleAppointments.filter(
    (appointment) =>
      appointment.status === "scheduled" || appointment.status === "arrived",
  );
  const inConsultationAppointments = visibleAppointments.filter(
    (appointment) => appointment.status === "in-consultation",
  );
  const completedAppointments = visibleAppointments.filter(
    (appointment) => appointment.status === "completed",
  );
  const scheduledDoctors = getDoctorsScheduledToday(
    doctors,
    schedules,
    exceptions,
  );
  const roleFocus = getTodayRoleFocus(session.role, locale);

  return (
    <section id="workspace-overview" className="today-workspace">
      <div className="today-hero">
        <div>
          <p className="eyebrow">{labels.todayEyebrow}</p>
          <h1>
            {locale === "ar-EG"
              ? labels.todayWorkspace
              : `${labels.greeting}, ${session.username}`}
          </h1>
          <p className="today-date">
            {formatDate(new Date(), {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="today-actions">
          <button
            className="button primary"
            type="button"
            onClick={onFindPatient}
          >
            {labels.findPatient}
          </button>
          <button
            className="button ghost"
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading}
          >
            {isLoading ? labels.refreshing : labels.refreshToday}
          </button>
        </div>
      </div>
      <div className="today-view-controls" aria-label={labels.waitingRoom}>
        <div
          className="today-view-switch"
          role="tablist"
          aria-label={labels.waitingRoom}
        >
          <button
            className={`today-view-tab${dashboardView === "front-desk" ? " is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={dashboardView === "front-desk"}
            onClick={() => setDashboardView("front-desk")}
          >
            {labels.frontDeskView}
          </button>
          <button
            className={`today-view-tab${dashboardView === "all" ? " is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={dashboardView === "all"}
            onClick={() => setDashboardView("all")}
          >
            {labels.allView}
          </button>
        </div>
        {departments.length > 0 ? (
          <label className="today-department-filter">
            <span>{labels.departmentFilter}</span>
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
            >
              <option value="">{labels.allDepartments}</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.nameEn}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <section
        className="today-task-launcher"
        aria-labelledby="today-task-launcher-title"
      >
        <div className="today-card-heading">
          <div>
            <p className="eyebrow">{labels.quickActions}</p>
            <h2 id="today-task-launcher-title">{labels.quickActions}</h2>
          </div>
        </div>
        <div className="today-task-grid">
          {session.capabilities.includes("patient.read") ? (
            <button
              className="today-task-card"
              type="button"
              onClick={onFindPatient}
            >
              <span className="today-task-icon" aria-hidden="true">
                P
              </span>
              <strong>{labels.quickFindPatient}</strong>
              <small>{labels.quickFindPatientDetail}</small>
            </button>
          ) : null}
          {session.capabilities.includes("appointment.read") ? (
            <button
              className="today-task-card"
              type="button"
              onClick={onOpenAppointments}
            >
              <span className="today-task-icon" aria-hidden="true">
                A
              </span>
              <strong>{labels.quickAppointments}</strong>
              <small>{labels.quickAppointmentsDetail}</small>
            </button>
          ) : null}
          {session.capabilities.includes("billing.read") ? (
            <button
              className="today-task-card"
              type="button"
              onClick={onOpenBilling}
            >
              <span className="today-task-icon" aria-hidden="true">
                EGP
              </span>
              <strong>{labels.quickPayment}</strong>
              <small>{labels.quickPaymentDetail}</small>
            </button>
          ) : null}
          {session.capabilities.includes("doctor.profile.read") ? (
            <button
              className="today-task-card"
              type="button"
              onClick={onOpenDoctors}
            >
              <span className="today-task-icon" aria-hidden="true">
                Dr
              </span>
              <strong>{labels.openDoctors}</strong>
              <small>{labels.scheduledDoctors}</small>
            </button>
          ) : null}
        </div>
      </section>
      <div className="today-metrics" aria-label="Today summary">
        <div className="today-metric">
          <span>{labels.appointments}</span>
          <strong>{isLoading ? "—" : visibleAppointments.length}</strong>
          <small>{labels.scheduledToday}</small>
        </div>
        <div className="today-metric">
          <span>{labels.waiting}</span>
          <strong>{isLoading ? "—" : waitingCount}</strong>
          <small>{labels.arrivedNotCompleted}</small>
        </div>
        <div className="today-metric">
          <span>{labels.completed}</span>
          <strong>{isLoading ? "—" : completedCount}</strong>
          <small>{labels.closedVisits}</small>
        </div>
        <div className="today-metric metric-accent">
          <span>{labels.nextPatient}</span>
          <strong>
            {nextAppointment ? (
              <BidiValue direction="ltr">{nextAppointment.patientId}</BidiValue>
            ) : (
              "—"
            )}
          </strong>
          <small>
            {nextAppointment
              ? formatTime(nextAppointment.scheduledStart)
              : labels.noUpcomingVisit}
          </small>
        </div>
      </div>
      <div className="today-grid">
        <section
          className="today-card today-queue-card"
          aria-labelledby="today-appointments-title"
        >
          <div className="today-card-heading">
            <div>
              <p className="eyebrow">{labels.clinicQueue}</p>
              <h2 id="today-appointments-title">
                {dashboardView === "front-desk"
                  ? labels.waitingRoom
                  : labels.todaysAppointments}
              </h2>
            </div>
            <span className="status ok">{labels.localData}</span>
          </div>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {isLoading ? (
            <p className="muted">{labels.loadingAppointments}</p>
          ) : visibleAppointments.length === 0 ? (
            <div className="today-empty-state">
              <strong>{labels.noAppointments}</strong>
              <p>{labels.queueDescription}</p>
            </div>
          ) : dashboardView === "front-desk" ? (
            <div className="today-queue-columns" aria-live="polite">
              {[
                {
                  key: "waiting",
                  title: labels.waitingColumn,
                  items: waitingAppointments,
                },
                {
                  key: "consultation",
                  title: labels.inConsultationColumn,
                  items: inConsultationAppointments,
                },
                {
                  key: "completed",
                  title: labels.completedColumn,
                  items: completedAppointments,
                },
              ].map((column) => (
                <div
                  className={`today-queue-column queue-${column.key}`}
                  key={column.key}
                >
                  <div className="today-queue-column-heading">
                    <strong>{column.title}</strong>
                    <span>{column.items.length}</span>
                  </div>
                  {column.items.length === 0 ? (
                    <p className="muted">{labels.noPatientsInColumn}</p>
                  ) : (
                    column.items.map((appointment) => {
                      const patient = patients.find(
                        (item) => item.patientId === appointment.patientId,
                      );
                      return (
                        <article
                          className="today-queue-card-item"
                          key={appointment.id}
                        >
                          <time dateTime={appointment.scheduledStart}>
                            {formatTime(appointment.scheduledStart)}
                          </time>
                          <strong>
                            {patient?.nameEn ?? appointment.patientId}
                          </strong>
                          <span>
                            <BidiValue direction="ltr">
                              {appointment.patientId}
                            </BidiValue>
                            {" · "}
                            {appointment.visitType}
                          </span>
                          <small>
                            {appointment.doctorId ?? labels.noDoctorsScheduled}
                          </small>
                        </article>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="today-appointment-list" aria-live="polite">
              {visibleAppointments.map((appointment) => {
                const patient = patients.find(
                  (item) => item.patientId === appointment.patientId,
                );
                return (
                  <article
                    className="today-appointment-row"
                    key={appointment.id}
                  >
                    <time dateTime={appointment.scheduledStart}>
                      {formatTime(appointment.scheduledStart)}
                    </time>
                    <div className="today-appointment-main">
                      <strong>
                        {patient?.nameEn ?? appointment.patientId}
                      </strong>
                      <span>
                        <BidiValue direction="ltr">
                          {appointment.patientId}
                        </BidiValue>
                        {" · "}
                        {appointment.visitType} · {appointment.durationMinutes}{" "}
                        {labels.minuteShort}
                      </span>
                    </div>
                    <span
                      className={`status ${getAppointmentStatusClass(appointment.status)}`}
                    >
                      {formatStatusLabel(appointment.status)}
                    </span>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <section
          className="today-card today-focus-card"
          aria-labelledby="today-focus-title"
        >
          <div className="today-card-heading">
            <div>
              <p className="eyebrow">{labels.yourFocus}</p>
              <h2 id="today-focus-title">{labels.calmNextAction}</h2>
            </div>
            <span className="today-focus-mark" aria-hidden="true">
              E
            </span>
          </div>
          <p>{roleFocus}</p>
          <div className="today-focus-list">
            <div>
              <strong>{labels.patientIdentityFirst}</strong>
              <span>{labels.patientIdentityFirstDetail}</span>
            </div>
            <div>
              <strong>{labels.offlineValid}</strong>
              <span>{labels.offlineValidDetail}</span>
            </div>
          </div>
        </section>
        <section
          className="today-card today-doctors-card"
          aria-labelledby="today-doctors-title"
        >
          <div className="today-card-heading">
            <div>
              <p className="eyebrow">{labels.scheduledDoctors}</p>
              <h2 id="today-doctors-title">{labels.scheduledDoctors}</h2>
            </div>
            <span className="status info">{scheduledDoctors.length}</span>
          </div>
          {isLoading ? (
            <p className="muted">{labels.loadingDoctors}</p>
          ) : scheduledDoctors.length === 0 ? (
            <p className="muted">{labels.noDoctorsScheduled}</p>
          ) : (
            <div className="today-doctor-list">
              {scheduledDoctors.map(({ doctor, windows }) => (
                <div className="today-doctor-row" key={doctor.id}>
                  <span className="doctor-avatar" aria-hidden="true">
                    {(locale === "ar-EG" && doctor.displayNameAr
                      ? doctor.displayNameAr
                      : doctor.displayNameEn
                    ).slice(0, 1)}
                  </span>
                  <div>
                    <strong>
                      {locale === "ar-EG" && doctor.displayNameAr
                        ? doctor.displayNameAr
                        : doctor.displayNameEn}
                    </strong>
                    <small dir="ltr">{windows.join(" · ")}</small>
                  </div>
                  <span className="status ok">{labels.localData}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      {session.capabilities.includes("billing.read") ? (
        <section
          className="today-billing-card"
          aria-labelledby="today-billing-title"
        >
          <div className="today-card-heading">
            <div>
              <p className="eyebrow">{labels.billingTitle}</p>
              <h2 id="today-billing-title">{labels.billingTitle}</h2>
            </div>
            <button
              className="button ghost small"
              type="button"
              onClick={onOpenBilling}
            >
              {labels.openBilling}
            </button>
          </div>
          <div className="today-billing-metrics">
            <div>
              <span>{labels.invoicedThisMonth}</span>
              <strong>
                {billingSummary
                  ? formatEgp(billingSummary.invoicedEgp, locale)
                  : "—"}
              </strong>
            </div>
            <div>
              <span>{labels.collectedThisMonth}</span>
              <strong>
                {billingSummary
                  ? formatEgp(billingSummary.collectedEgp, locale)
                  : "—"}
              </strong>
            </div>
            <div>
              <span>{labels.outstanding}</span>
              <strong>
                {billingSummary
                  ? formatEgp(billingSummary.outstandingEgp, locale)
                  : "—"}
              </strong>
            </div>
            <div>
              <span>{labels.openInvoices}</span>
              <strong>{billingSummary?.openInvoiceCount ?? "—"}</strong>
            </div>
          </div>
          <div className="today-invoice-list">
            <div className="today-invoice-heading">
              <strong>{labels.recentInvoices}</strong>
              <span>{billingSummary?.month ?? ""}</span>
            </div>
            {!billingSummary || billingSummary.recentInvoices.length === 0 ? (
              <p className="muted">{labels.noRecentInvoices}</p>
            ) : (
              billingSummary.recentInvoices.map((invoice) => (
                <div className="today-invoice-row" key={invoice.invoiceNumber}>
                  <div>
                    <strong dir="ltr">{invoice.invoiceNumber}</strong>
                    <span dir="ltr">{invoice.patientId}</span>
                  </div>
                  <div>
                    <strong>{formatEgp(invoice.totalEgp, locale)}</strong>
                    <small>
                      {invoice.balanceEgp > 0
                        ? formatEgp(invoice.balanceEgp, locale)
                        : invoice.status}
                    </small>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}
    </section>
  );
}
