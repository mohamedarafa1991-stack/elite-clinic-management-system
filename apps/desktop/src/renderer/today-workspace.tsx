import type { Appointment } from "@elite/contracts";
import type { SessionSummary } from "../preload/index.js";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import {
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
}: TodayWorkspaceProps): ReactElement {
  const [appointments, setAppointments] = useState<readonly Appointment[]>([]);
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
      const nextAppointments = await window.elite.clinical.listAppointments(
        token,
        start.toISOString(),
        end.toISOString(),
      );
      setAppointments(sortAppointmentsByStart(nextAppointments));
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

  const { waitingCount, completedCount, nextAppointment } =
    getTodayAppointmentMetrics(appointments);
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
      <div className="today-metrics" aria-label="Today summary">
        <div className="today-metric">
          <span>{labels.appointments}</span>
          <strong>{isLoading ? "—" : appointments.length}</strong>
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
          className="today-card"
          aria-labelledby="today-appointments-title"
        >
          <div className="today-card-heading">
            <div>
              <p className="eyebrow">{labels.clinicQueue}</p>
              <h2 id="today-appointments-title">{labels.todaysAppointments}</h2>
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
          ) : appointments.length === 0 ? (
            <div className="today-empty-state">
              <strong>{labels.noAppointments}</strong>
              <p>{labels.queueDescription}</p>
            </div>
          ) : (
            <div className="today-appointment-list" aria-live="polite">
              {appointments.map((appointment) => (
                <article className="today-appointment-row" key={appointment.id}>
                  <time dateTime={appointment.scheduledStart}>
                    {formatTime(appointment.scheduledStart)}
                  </time>
                  <div className="today-appointment-main">
                    <strong>
                      <BidiValue direction="ltr">
                        {appointment.patientId}
                      </BidiValue>
                    </strong>
                    <span>
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
              ))}
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
      </div>
    </section>
  );
}
