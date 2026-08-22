import {
  StrictMode,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import type {
  AuthStatus,
  EliteSecurityStatus,
  LanSyncStatus,
  SessionSummary,
} from "../preload/index.cjs";
import type {
  DuplicateCandidate,
  Patient,
  PatientMergeCase,
  PatientMergeField,
  PatientMergeFieldDecisions,
  PatientRegistrationInput,
  PatientUpdateInput,
  Appointment,
  AppointmentCreateInput,
  WaitlistEntry,
  WaitlistEntryInput,
  WaitlistStatusUpdate,
  BillingInvoice,
  BillingInvoiceCreateInput,
  BillingPackage,
  BillingPayment,
  BillingPaymentInput,
  BillingReceipt,
  BillingRefundInput,
  BillingDoctorPayoutExportResult,
  BillingDoctorPayoutScheduleStatus,
  Department,
  DoctorDirectoryEntry,
  DoctorProfile,
  DoctorProfileUpdateInput,
  DoctorDocument,
  DoctorDocumentUploadInput,
  MedicalHistoryEntry,
  MedicalHistoryInput,
  Diagnosis,
  DiagnosisInput,
  EncounterAmendmentDiff,
  ProjectionSnapshot,
  EncounterAmendment,
  EncounterAmendmentInput,
  EffectiveEncounter,
  ExportResult,
  ExportVerificationResult,
  ExportRevocation,
  ExportPackageRegistryRecord,
  ExportSigningKeyMetadata,
  ExportSigningKeyRecoveryBundle,
  ExportRecipient,
  ExportConsentEvidence,
  ExportDisclosure,
  ExportReceipt,
  FhirValidationResult,
  FhirProfileBundle,
  FhirProfileBundleRecord,
  OrgSettings,
  OrgSettingsInput,
  Encounter,
  EncounterInput,
  Icd10Code,
  Icd10CodeInput,
  Service,
  Specialty,
  Schedule,
  ScheduleException,
  ScheduleInput,
  ScheduleExceptionInput,
} from "@elite/contracts";
import type { PatientRelatedPersonLinkSummary } from "@elite/auth";
import { AppShell } from "./app-shell.js";
import type { WorkspaceTheme } from "./workspace-model.js";
import { PatientContextBanner } from "./patient-context-banner.js";
import { TodayWorkspace } from "./today-workspace.js";
import { ReportsWorkspace } from "./reports-workspace.js";
import { DoctorEarningsPanel } from "./doctor-earnings-panel.js";
import { DrugCatalogAdminPanel } from "./drug-catalog-admin-panel.js";
import {
  buildRelatedPersonInputs,
  createNewRelatedPersonForm,
  getDuplicateReviewState,
  getPatientWorkspaceCapabilities,
  getRelatedPersonFormState,
  type RelatedPersonFormState,
} from "./patient-workspace-model.js";
import "./styles.css";

interface BootstrapFormState {
  primaryUsername: string;
  primaryPassword: string;
  primaryDisplayName: string;
  backupUsername: string;
  backupPassword: string;
  backupDisplayName: string;
  hubDeviceName: string;
}

interface MedicalHistoryFormState extends MedicalHistoryInput {}
interface EncounterFormState extends EncounterInput {}
interface DiagnosisFormState extends DiagnosisInput {}
interface AmendmentFormState extends EncounterAmendmentInput {}

const emptyEncounterForm: EncounterFormState = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
  followUp: "",
};

const emptyDiagnosisForm: DiagnosisFormState = {
  icd10CodeId: "",
  diagnosisTextEn: "",
  isPrimary: false,
};

const emptyAmendmentForm: AmendmentFormState = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
  followUp: "",
  correctionReason: "",
};

const emptyMedicalHistoryForm: MedicalHistoryFormState = {
  category: "condition",
  title: "",
  details: "",
  onsetDate: "",
  status: "active",
  source: "clinician-recorded",
};

const initialBootstrap: BootstrapFormState = {
  primaryUsername: "",
  primaryPassword: "",
  primaryDisplayName: "",
  backupUsername: "",
  backupPassword: "",
  backupDisplayName: "",
  hubDeviceName: "Elite Windows Hub",
};

type InterfaceLocale = "en-EG" | "ar-EG";
type InterfaceCopyKey =
  | "appName"
  | "clinicWorkspace"
  | "localFirst"
  | "workingLocally"
  | "encryptedStore"
  | "interfaceLanguage"
  | "signOut"
  | "todayGroup"
  | "frontDeskGroup"
  | "clinicalGroup"
  | "operationsGroup"
  | "insightsGroup"
  | "systemGroup"
  | "dashboard"
  | "dashboardDetail"
  | "patients"
  | "patientsDetail"
  | "appointments"
  | "appointmentsDetail"
  | "doctors"
  | "doctorsDetail"
  | "clinicalRecords"
  | "clinicalRecordsDetail"
  | "documents"
  | "documentsDetail"
  | "billing"
  | "billingDetail"
  | "drugCatalog"
  | "drugCatalogDetail"
  | "reports"
  | "reportsDetail"
  | "syncDevices"
  | "syncDevicesDetail"
  | "adminSettings"
  | "adminSettingsDetail"
  | "patientContext"
  | "patientId"
  | "phone"
  | "age"
  | "status"
  | "clearContext"
  | "todayEyebrow"
  | "todayWorkspace"
  | "findPatient"
  | "refreshToday"
  | "refreshing"
  | "appointments"
  | "waiting"
  | "completed"
  | "nextPatient"
  | "scheduledToday"
  | "arrivedNotCompleted"
  | "closedVisits"
  | "noUpcomingVisit"
  | "clinicQueue"
  | "todaysAppointments"
  | "localData"
  | "loadingAppointments"
  | "noAppointments"
  | "queueDescription"
  | "yourFocus"
  | "calmNextAction"
  | "patientIdentityFirst"
  | "patientIdentityFirstDetail"
  | "offlineValid"
  | "offlineValidDetail";

const INTERFACE_COPY: Record<
  InterfaceLocale,
  Record<InterfaceCopyKey, string>
> = {
  "en-EG": {
    appName: "Elite Clinic Management System",
    clinicWorkspace: "Clinic workspace",
    localFirst: "Local-first",
    workingLocally: "Working locally",
    encryptedStore: "Encrypted clinic store",
    interfaceLanguage: "Interface language",
    signOut: "Sign out",
    todayGroup: "Today",
    frontDeskGroup: "Front desk",
    clinicalGroup: "Clinical care",
    operationsGroup: "Operations",
    insightsGroup: "Insights",
    systemGroup: "System",
    dashboard: "Dashboard",
    dashboardDetail: "Today, queue, and clinic status",
    patients: "Patients",
    patientsDetail: "Profiles, history, and guardians",
    appointments: "Appointments",
    appointmentsDetail: "Calendar, check-in, and visits",
    doctors: "Doctors",
    doctorsDetail: "Profiles, specialties, and documents",
    clinicalRecords: "Clinical records",
    clinicalRecordsDetail: "Encounters, diagnoses, and amendments",
    documents: "Documents",
    documentsDetail: "Secure doctor-document vault",
    billing: "Billing",
    billingDetail: "Invoices, receipts, refunds, and packages",
    drugCatalog: "Drug catalog",
    drugCatalogDetail: "Egyptian medicines and updates",
    reports: "Reports & exports",
    reportsDetail: "Monthly revenue, invoices, and patient trends",
    syncDevices: "Sync & devices",
    syncDevicesDetail: "LAN health, enrollment, and recovery",
    adminSettings: "Admin settings",
    adminSettingsDetail: "Clinic policy, schedules, and controls",
    patientContext: "Patient context",
    patientId: "Patient ID",
    phone: "Phone",
    age: "Age",
    status: "Status",
    clearContext: "Clear context",
    todayEyebrow: "Today at Elite Clinic",
    todayWorkspace: "Clinic workspace",
    findPatient: "Find a patient",
    refreshToday: "Refresh today",
    refreshing: "Refreshing…",
    waiting: "Waiting",
    completed: "Completed",
    nextPatient: "Next patient",
    scheduledToday: "Scheduled for today",
    arrivedNotCompleted: "Arrived and not completed",
    closedVisits: "Closed visits today",
    noUpcomingVisit: "No upcoming visit",
    clinicQueue: "Clinic queue",
    todaysAppointments: "Today’s appointments",
    localData: "Local data",
    loadingAppointments: "Loading today’s appointments…",
    noAppointments: "No appointments scheduled today",
    queueDescription:
      "When the day is open, the queue will appear here in time order.",
    yourFocus: "Your focus",
    calmNextAction: "A calm next action",
    patientIdentityFirst: "Patient identity first",
    patientIdentityFirstDetail:
      "Keep the patient ID and name visible before editing or documenting.",
    offlineValid: "Offline is valid",
    offlineValidDetail:
      "Local work continues while the secure LAN status is unavailable.",
  },
  "ar-EG": {
    appName: "نظام إدارة عيادة إيليت",
    clinicWorkspace: "مساحة عمل العيادة",
    localFirst: "محلي أولاً",
    workingLocally: "العمل محلياً",
    encryptedStore: "مخزن العيادة المشفر",
    interfaceLanguage: "لغة الواجهة",
    signOut: "تسجيل الخروج",
    todayGroup: "اليوم",
    frontDeskGroup: "الاستقبال",
    clinicalGroup: "الرعاية السريرية",
    operationsGroup: "التشغيل",
    insightsGroup: "التقارير والتحليل",
    systemGroup: "النظام",
    dashboard: "لوحة التحكم",
    dashboardDetail: "اليوم والقائمة وحالة العيادة",
    patients: "المرضى",
    patientsDetail: "الملفات والتاريخ وذوو الصلة",
    appointments: "المواعيد",
    appointmentsDetail: "التقويم والتسجيل والزيارات",
    doctors: "الأطباء",
    doctorsDetail: "الملفات والتخصصات والوثائق",
    clinicalRecords: "السجلات السريرية",
    clinicalRecordsDetail: "الزيارات والتشخيصات والتعديلات",
    documents: "الوثائق",
    documentsDetail: "خزنة وثائق الأطباء الآمنة",
    billing: "الفوترة",
    billingDetail: "الفواتير والإيصالات والاسترداد والباقات",
    drugCatalog: "دليل الأدوية",
    drugCatalogDetail: "الأدوية المصرية والتحديثات",
    reports: "التقارير والتصدير",
    reportsDetail: "الإيرادات الشهرية والفواتير واتجاهات المرضى",
    syncDevices: "المزامنة والأجهزة",
    syncDevicesDetail: "حالة الشبكة والتسجيل والاسترداد",
    adminSettings: "إعدادات المدير",
    adminSettingsDetail: "سياسة العيادة والجداول والتحكم",
    patientContext: "سياق المريض",
    patientId: "معرّف المريض",
    phone: "الهاتف",
    age: "العمر",
    status: "الحالة",
    clearContext: "مسح السياق",
    todayEyebrow: "اليوم في عيادة إيليت",
    todayWorkspace: "مساحة عمل العيادة",
    findPatient: "البحث عن مريض",
    refreshToday: "تحديث اليوم",
    refreshing: "جارٍ التحديث…",
    waiting: "في الانتظار",
    completed: "المكتملة",
    nextPatient: "المريض التالي",
    scheduledToday: "المجدولة اليوم",
    arrivedNotCompleted: "وصلوا ولم تكتمل زيارتهم",
    closedVisits: "الزيارات المغلقة اليوم",
    noUpcomingVisit: "لا توجد زيارة قادمة",
    clinicQueue: "قائمة العيادة",
    todaysAppointments: "مواعيد اليوم",
    localData: "بيانات محلية",
    loadingAppointments: "جارٍ تحميل مواعيد اليوم…",
    noAppointments: "لا توجد مواعيد مجدولة اليوم",
    queueDescription: "عند وجود مواعيد، ستظهر القائمة هنا مرتبة حسب الوقت.",
    yourFocus: "تركيزك",
    calmNextAction: "الخطوة التالية بهدوء",
    patientIdentityFirst: "الهوية أولاً",
    patientIdentityFirstDetail:
      "حافظ على ظهور معرّف المريض واسمه قبل التعديل أو التوثيق.",
    offlineValid: "العمل دون اتصال متاح",
    offlineValidDetail:
      "يستمر العمل محلياً أثناء عدم توفر حالة الاتصال الآمن بالشبكة المحلية.",
  },
};

function copy(locale: InterfaceLocale, key: InterfaceCopyKey): string {
  return INTERFACE_COPY[locale][key];
}

function frontDeskCopy(
  locale: InterfaceLocale,
  english: string,
  arabic: string,
): string {
  return locale === "ar-EG" ? arabic : english;
}

function localeDirection(locale: InterfaceLocale): "ltr" | "rtl" {
  return locale === "ar-EG" ? "rtl" : "ltr";
}

function useInterfaceLocale(): readonly [
  InterfaceLocale,
  (locale: InterfaceLocale) => void,
] {
  const [locale, setLocaleState] = useState<InterfaceLocale>(() => {
    if (typeof window === "undefined") return "en-EG";
    return window.localStorage.getItem("elite-clinic-locale") === "ar-EG"
      ? "ar-EG"
      : "en-EG";
  });

  const setLocale = (nextLocale: InterfaceLocale): void => {
    setLocaleState(nextLocale);
    window.localStorage.setItem("elite-clinic-locale", nextLocale);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
  }, [locale]);

  return [locale, setLocale] as const;
}

function useWorkspaceTheme(): readonly [
  WorkspaceTheme,
  (theme: WorkspaceTheme) => void,
] {
  const [theme, setThemeState] = useState<WorkspaceTheme>(() => {
    if (typeof window === "undefined") return "light";
    const saved = window.localStorage.getItem("elite-clinic-theme");
    return saved === "dark" || saved === "high-contrast" ? saved : "light";
  });

  const setTheme = (nextTheme: WorkspaceTheme): void => {
    setThemeState(nextTheme);
    window.localStorage.setItem("elite-clinic-theme", nextTheme);
  };

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
  }, [theme]);

  return [theme, setTheme] as const;
}

function formatLocalizedDate(
  value: string | Date,
  locale: InterfaceLocale,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, options).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

function formatLocalizedTime(
  value: string | Date,
  locale: InterfaceLocale,
): string {
  return formatLocalizedDate(value, locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLocalizedEgp(amount: number, locale: InterfaceLocale): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(amount);
}

function BidiValue({
  children,
  direction = "auto",
  className,
}: {
  children: ReactNode;
  direction?: "auto" | "ltr" | "rtl";
  className?: string;
}): ReactElement {
  return (
    <span dir={direction} className={className}>
      {children}
    </span>
  );
}

function formatVisitTypeLabel(
  value: string,
  locale: InterfaceLocale = "en-EG",
): string {
  const arabicLabels: Record<string, string> = {
    consultation: "استشارة",
    "follow-up": "متابعة",
    procedure: "إجراء",
    other: "أخرى",
  };
  if (locale === "ar-EG" && arabicLabels[value]) {
    return arabicLabels[value];
  }
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatStatusLabel(
  value: string,
  locale: InterfaceLocale = "en-EG",
): string {
  const arabicLabels: Record<string, string> = {
    active: "نشط",
    arrived: "وصل",
    scheduled: "مجدول",
    "in-consultation": "قيد الاستشارة",
    completed: "مكتمل",
    cancelled: "ملغى",
    pending: "معلق",
    verified: "تم التحقق",
    archived: "مؤرشف",
  };
  if (locale === "ar-EG" && arabicLabels[value]) {
    return arabicLabels[value];
  }
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ErrorMessage({
  message,
}: {
  message: string | null;
}): ReactElement | null {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}

function receptionistFriendlyError(reason: unknown, fallback: string): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.includes("ELITE_BILLING_PATIENT_NOT_ACTIVE")) {
    return "This patient is not active. Choose an active patient before creating a bill.";
  }
  if (message.includes("ELITE_PATIENT_NOT_FOUND")) {
    return "We could not find that patient. Search again by name, phone, or patient number.";
  }
  if (message.includes("ELITE_APPOINTMENT")) {
    return "This appointment could not be saved. Check the patient, doctor, and time, then try again.";
  }
  if (message.includes("ELITE_AUTH_CAPABILITY_REQUIRED")) {
    return "You cannot perform this action. Ask an Admin if you believe you should have access.";
  }
  return message.startsWith("ELITE_") ? fallback : message || fallback;
}

function PatientLookup({
  token,
  selectedPatient,
  onSelect,
  onClear,
  label = "Find patient",
  helper = "Search by name, phone, or patient number.",
}: {
  token: string;
  selectedPatient: Patient | null;
  onSelect: (patient: Patient) => void;
  onClear: () => void;
  label?: string;
  helper?: string;
}): ReactElement {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<readonly Patient[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (): Promise<void> => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setMatches([]);
      setError("Enter at least 2 characters to search.");
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const nextMatches = await window.elite.patients.search(token, {
        query: normalized,
        limit: 8,
      });
      setMatches(nextMatches);
      if (nextMatches.length === 0) {
        setError("No matching patients found. Check the spelling or number.");
      }
    } catch (reason: unknown) {
      setMatches([]);
      setError(
        receptionistFriendlyError(
          reason,
          "Unable to search patients. Check the spelling or try again.",
        ),
      );
    } finally {
      setIsSearching(false);
    }
  };

  if (selectedPatient) {
    return (
      <div className="patient-lookup selected" aria-live="polite">
        <div className="patient-lookup-label-row">
          <strong>{label}</strong>
          <span className="status ok">Selected</span>
        </div>
        <div className="patient-lookup-selected-card">
          <span className="patient-avatar" aria-hidden="true">
            {selectedPatient.nameEn.trim().slice(0, 2).toUpperCase() || "PT"}
          </span>
          <span>
            <strong>{selectedPatient.nameEn}</strong>
            <small dir="ltr">
              {selectedPatient.patientId} · {selectedPatient.phone}
            </small>
          </span>
          <button
            className="button secondary small"
            type="button"
            onClick={onClear}
          >
            Change patient
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="patient-lookup">
      <div className="patient-lookup-label-row">
        <strong>{label}</strong>
        <small>{helper}</small>
      </div>
      <div className="patient-lookup-controls">
        <input
          aria-label={label}
          placeholder="Name, phone, or EL-00001"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
        />
        <button
          className="button secondary"
          type="button"
          onClick={() => void search()}
          disabled={isSearching}
        >
          {isSearching ? "Searching…" : "Find patient"}
        </button>
      </div>
      {error ? (
        <p className="form-help error" role="alert">
          {error}
        </p>
      ) : null}
      {matches.length > 0 ? (
        <div
          className="patient-lookup-results"
          role="listbox"
          aria-label="Matching patients"
        >
          {matches.map((patient) => (
            <button
              className="patient-lookup-result"
              type="button"
              key={patient.id}
              onClick={() => {
                onSelect(patient);
                setMatches([]);
                setQuery("");
              }}
            >
              <span>
                <strong>{patient.nameEn}</strong>
                <small dir="ltr">
                  {patient.patientId} · {patient.phone}
                </small>
              </span>
              <span className="status info">Select</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BootstrapForm({
  onComplete,
}: {
  onComplete: (status: AuthStatus) => void;
}): ReactElement {
  const [form, setForm] = useState(initialBootstrap);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (key: keyof BootstrapFormState, value: string): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await window.elite.auth.bootstrap({
        admins: [
          {
            username: form.primaryUsername,
            password: form.primaryPassword,
            displayNameEn: form.primaryDisplayName,
          },
          {
            username: form.backupUsername,
            password: form.backupPassword,
            displayNameEn: form.backupDisplayName,
          },
        ],
        hubDevice: {
          friendlyName: form.hubDeviceName,
          appVersion: "0.1.0-dev",
        },
      });
      onComplete({
        configured: true,
        bootstrapRequired: false,
        hubDeviceId: result.hubDeviceId,
      });
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to complete secure Admin setup",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card auth-card" aria-labelledby="bootstrap-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">First-launch setup</p>
          <h2 id="bootstrap-title">Create the two initial Admin accounts</h2>
        </div>
        <span className="status warn">One-time action</span>
      </div>
      <p className="form-help">
        Use two different usernames and strong passwords. Passwords are hashed
        with Argon2id and are never stored in the renderer.
      </p>
      <ErrorMessage message={error} />
      <form className="form" onSubmit={submit}>
        <div className="form-section">
          <h3>Primary Admin</h3>
          <div className="form-grid">
            <label>
              Username
              <input
                required
                minLength={3}
                value={form.primaryUsername}
                onChange={(event) =>
                  update("primaryUsername", event.target.value)
                }
                autoComplete="username"
              />
            </label>
            <label>
              Display name
              <input
                required
                value={form.primaryDisplayName}
                onChange={(event) =>
                  update("primaryDisplayName", event.target.value)
                }
              />
            </label>
            <label>
              Password
              <input
                required
                minLength={12}
                type="password"
                value={form.primaryPassword}
                onChange={(event) =>
                  update("primaryPassword", event.target.value)
                }
                autoComplete="new-password"
              />
            </label>
          </div>
        </div>
        <div className="form-section">
          <h3>Backup Admin</h3>
          <div className="form-grid">
            <label>
              Username
              <input
                required
                minLength={3}
                value={form.backupUsername}
                onChange={(event) =>
                  update("backupUsername", event.target.value)
                }
                autoComplete="username"
              />
            </label>
            <label>
              Display name
              <input
                required
                value={form.backupDisplayName}
                onChange={(event) =>
                  update("backupDisplayName", event.target.value)
                }
              />
            </label>
            <label>
              Password
              <input
                required
                minLength={12}
                type="password"
                value={form.backupPassword}
                onChange={(event) =>
                  update("backupPassword", event.target.value)
                }
                autoComplete="new-password"
              />
            </label>
          </div>
        </div>
        <label>
          Hub device name
          <input
            required
            value={form.hubDeviceName}
            onChange={(event) => update("hubDeviceName", event.target.value)}
          />
        </label>
        <button
          className="button primary"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating secure accounts…" : "Create Admin accounts"}
        </button>
      </form>
    </section>
  );
}

function LoginForm({
  deviceId,
  onLogin,
}: {
  deviceId: string;
  onLogin: (token: string, session: SessionSummary) => void;
}): ReactElement {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await window.elite.auth.login({
        username,
        password,
        deviceId,
      });
      onLogin(result.token, result.session);
      setPassword("");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card auth-card" aria-labelledby="login-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Protected access</p>
          <h2 id="login-title">Sign in to Elite</h2>
        </div>
        <span className="status ok">Individual account</span>
      </div>
      <p className="form-help">
        Sessions are held in memory for this renderer and are linked to the
        approved Hub device.
      </p>
      <ErrorMessage message={error} />
      <form className="form" onSubmit={submit}>
        <label>
          Username
          <input
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button
          className="button primary"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}

function DevicePanel({ token }: { token: string }): ReactElement {
  const [devices, setDevices] = useState<
    readonly import("../preload/index.cjs").DeviceSummary[]
  >([]);
  const [requests, setRequests] = useState<
    readonly import("../preload/index.cjs").EnrollmentRequestSummary[]
  >([]);
  const [friendlyName, setFriendlyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const [nextDevices, nextRequests] = await Promise.all([
        window.elite.auth.listDevices(token),
        window.elite.auth.listEnrollmentRequests(token),
      ]);
      setDevices(nextDevices);
      setRequests(nextRequests);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load device security data",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const requestDevice = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const request = await window.elite.auth.requestDevice(token, {
        friendlyName,
        platform: "android",
        appVersion: "0.1.0-dev",
        apiLevel: 29,
      });
      setFriendlyName("");
      setNotice(
        `Enrollment request ${request.requestId} created for ${request.deviceId}.`,
      );
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create enrollment request",
      );
    }
  };

  const approve = async (requestId: string): Promise<void> => {
    setError(null);
    try {
      await window.elite.auth.approveDevice(token, requestId);
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to approve device",
      );
    }
  };

  const reject = async (requestId: string): Promise<void> => {
    const reason = window.prompt("Reason for rejecting this device:");
    if (!reason) return;
    setError(null);
    try {
      await window.elite.auth.rejectDevice(token, requestId, reason);
      await refresh();
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : "Unable to reject device",
      );
    }
  };

  const revoke = async (deviceId: string): Promise<void> => {
    const reason = window.prompt("Reason for revoking this device:");
    if (!reason) return;
    setError(null);
    try {
      await window.elite.auth.revokeDevice(token, deviceId, reason);
      await refresh();
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : "Unable to revoke device",
      );
    }
  };

  return (
    <section className="card auth-card" aria-labelledby="devices-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Admin control</p>
          <h2 id="devices-title">Devices and enrollment</h2>
        </div>
        <span className="status warn">Patient data access</span>
      </div>
      <p className="form-help">
        New Android devices remain pending until an Admin approves them.
        Revocation invalidates sessions and schedules a best-effort wipe when
        the device reconnects.
      </p>
      <ErrorMessage message={error} />
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      <form
        className="inline-form"
        onSubmit={(event) => void requestDevice(event)}
      >
        <label className="inline-label">
          New Android device name
          <input
            required
            value={friendlyName}
            onChange={(event) => setFriendlyName(event.target.value)}
            placeholder="e.g. Dr Ahmed Phone"
          />
        </label>
        <button className="button primary" type="submit">
          Create pending device
        </button>
      </form>
      <div className="device-section">
        <h3>Pending enrollment requests</h3>
        {isLoading ? (
          <p className="muted">Loading device records…</p>
        ) : requests.filter((request) => request.status === "pending")
            .length === 0 ? (
          <p className="muted">No pending requests.</p>
        ) : (
          <div className="device-list">
            {requests
              .filter((request) => request.status === "pending")
              .map((request) => (
                <div className="device-row" key={request.requestId}>
                  <div>
                    <strong>{request.device.friendlyName}</strong>
                    <span>
                      {request.device.platform} · API{" "}
                      {request.device.apiLevel ?? "unknown"} · requested{" "}
                      {new Date(request.requestedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="row-actions">
                    <button
                      className="button small primary"
                      type="button"
                      onClick={() => void approve(request.requestId)}
                    >
                      Approve
                    </button>
                    <button
                      className="button small secondary"
                      type="button"
                      onClick={() => void reject(request.requestId)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
      <div className="device-section">
        <h3>Registered devices</h3>
        {devices.length === 0 ? (
          <p className="muted">No registered devices.</p>
        ) : (
          <div className="device-list">
            {devices.map((device) => (
              <div className="device-row" key={device.id}>
                <div>
                  <strong>{device.friendlyName}</strong>
                  <span>
                    {device.platform} · {device.status} · {device.appVersion}
                    {device.securityPatchLevel
                      ? ` · patch ${device.securityPatchLevel}`
                      : ""}
                  </span>
                </div>
                {device.status === "active" ? (
                  <button
                    className="button small danger"
                    type="button"
                    onClick={() => void revoke(device.id)}
                  >
                    Revoke
                  </button>
                ) : (
                  <span
                    className={`status ${device.status === "wipe-pending" ? "warn" : "ok"}`}
                  >
                    {device.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

type PatientDetailTab =
  "overview" | "visits" | "appointments" | "billing" | "contacts";

function PatientWorkspace({
  token,
  session,
  locale,
  onOpenAppointments,
  onOpenBilling,
}: {
  token: string;
  session: SessionSummary;
  locale: InterfaceLocale;
  onOpenAppointments: () => void;
  onOpenBilling: () => void;
}): ReactElement {
  const [patients, setPatients] = useState<readonly Patient[]>([]);
  const [query, setQuery] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState<
    "female" | "male" | "intersex" | "unknown" | ""
  >("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [registrationMode, setRegistrationMode] = useState<"quick" | "full">(
    "quick",
  );
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [patientDetailTab, setPatientDetailTab] =
    useState<PatientDetailTab>("overview");
  const [relatedLinks, setRelatedLinks] = useState<
    readonly PatientRelatedPersonLinkSummary[]
  >([]);
  const [medicalHistory, setMedicalHistory] = useState<
    readonly MedicalHistoryEntry[]
  >([]);
  const [patientAppointments, setPatientAppointments] = useState<
    readonly Appointment[]
  >([]);
  const [medicalHistoryForm, setMedicalHistoryForm] =
    useState<MedicalHistoryFormState | null>(null);
  const [editingMedicalHistory, setEditingMedicalHistory] =
    useState<MedicalHistoryEntry | null>(null);
  const [medicalHistoryArchiveReason, setMedicalHistoryArchiveReason] =
    useState("");
  const [relatedPersonForm, setRelatedPersonForm] =
    useState<RelatedPersonFormState | null>(null);
  const [editingRelatedLink, setEditingRelatedLink] =
    useState<PatientRelatedPersonLinkSummary | null>(null);
  const [duplicates, setDuplicates] = useState<readonly DuplicateCandidate[]>(
    [],
  );
  const [pendingInput, setPendingInput] =
    useState<PatientRegistrationInput | null>(null);
  const [pendingEdit, setPendingEdit] = useState<{
    patientId: string;
    input: PatientUpdateInput;
    expectedVersion: number;
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const patientCapabilities = getPatientWorkspaceCapabilities(
    session.capabilities,
  );
  const t = (english: string, arabic: string): string =>
    frontDeskCopy(locale, english, arabic);
  const duplicateReview = getDuplicateReviewState({
    candidates: duplicates,
    hasPendingInput: pendingInput !== null,
    hasPendingEdit: pendingEdit !== null,
    decisionReason,
    isBusy,
  });
  const refresh = async (): Promise<void> => {
    setError(null);
    try {
      setPatients(
        await window.elite.patients.search(token, { query, limit: 50 }),
      );
    } catch (reason: unknown) {
      setError(
        receptionistFriendlyError(
          reason,
          "Patients could not be loaded. Check the search and try again.",
        ),
      );
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const buildInput = (): PatientRegistrationInput => ({
    registrationMode,
    nameEn,
    ...(nameAr.trim() ? { nameAr: nameAr.trim() } : {}),
    ...(dob ? { dob } : {}),
    ...(sex ? { sex } : {}),
    phone,
    ...(nationalId.trim() ? { nationalId: nationalId.trim() } : {}),
    relatedPersons: [],
  });

  const buildUpdateInput = (): PatientUpdateInput => ({
    registrationMode,
    nameEn,
    ...(nameAr.trim() ? { nameAr: nameAr.trim() } : {}),
    ...(dob ? { dob } : {}),
    ...(sex ? { sex } : {}),
    phone,
    ...(nationalId.trim() ? { nationalId: nationalId.trim() } : {}),
    relatedPersons: undefined,
  });

  const createPatient = async (
    input: PatientRegistrationInput,
    reason?: string,
  ): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.patients.create(token, input, reason);
      setSelectedPatient(null);
      setNameEn("");
      setNameAr("");
      setDob("");
      setSex("");
      setPhone("");
      setNationalId("");
      setRegistrationMode("quick");
      setRelatedLinks([]);
      setMedicalHistory([]);
      setMedicalHistoryForm(null);
      setEditingMedicalHistory(null);
      setMedicalHistoryArchiveReason("");
      setRelatedPersonForm(null);
      setEditingRelatedLink(null);
      setDuplicates([]);
      setPendingInput(null);
      setPendingEdit(null);
      setDecisionReason("");
      await refresh();
    } catch (reasonValue: unknown) {
      setError(
        receptionistFriendlyError(
          reasonValue,
          "The patient could not be registered. Check the name and phone number, then try again.",
        ),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const input = buildInput();
    setIsBusy(true);
    setError(null);
    try {
      const candidates = await window.elite.patients.findDuplicates(
        token,
        input,
      );
      if (candidates.length > 0) {
        setDuplicates(candidates);
        setPendingInput(input);
        return;
      }
      await createPatient(input);
    } catch (reason: unknown) {
      setError(
        receptionistFriendlyError(
          reason,
          "We could not check for an existing patient. Try again before saving.",
        ),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const selectPatient = async (patient: Patient): Promise<void> => {
    setSelectedPatient(patient);
    setShowRegistrationForm(false);
    setPatientDetailTab("overview");
    setNameEn(patient.nameEn);
    setNameAr(patient.nameAr ?? "");
    setDob(patient.dob ?? "");
    setSex(patient.sex ?? "");
    setPhone(patient.phone);
    setNationalId(patient.nationalId ?? "");
    setRegistrationMode(patient.registrationMode);
    setError(null);
    setRelatedPersonForm(null);
    setEditingRelatedLink(null);
    setMedicalHistoryForm(null);
    setEditingMedicalHistory(null);
    setMedicalHistoryArchiveReason("");
    try {
      setRelatedLinks(
        await window.elite.relatedPersons.listLinks(token, patient.patientId),
      );
      setMedicalHistory(
        patientCapabilities.canReadClinical
          ? await window.elite.medicalHistory.list(token, patient.patientId)
          : [],
      );
      setPatientAppointments(
        session.capabilities.includes("appointment.read")
          ? await window.elite.clinical.listAppointments(
              token,
              undefined,
              undefined,
              undefined,
              patient.patientId,
            )
          : [],
      );
    } catch (reason: unknown) {
      setRelatedLinks([]);
      setMedicalHistory([]);
      setRelatedPersonForm(null);
      setEditingRelatedLink(null);
      setMedicalHistoryForm(null);
      setEditingMedicalHistory(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load patient history",
      );
    }
  };

  const openNewMedicalHistory = (): void => {
    if (!selectedPatient) return;
    setEditingMedicalHistory(null);
    setMedicalHistoryForm({ ...emptyMedicalHistoryForm });
    setError(null);
  };

  const openEditMedicalHistory = (entry: MedicalHistoryEntry): void => {
    setEditingMedicalHistory(entry);
    setMedicalHistoryForm({
      category: entry.category,
      title: entry.title,
      ...(entry.details ? { details: entry.details } : { details: "" }),
      ...(entry.onsetDate ? { onsetDate: entry.onsetDate } : { onsetDate: "" }),
      status: entry.status,
      source: entry.source,
    });
    setError(null);
  };

  const saveMedicalHistory = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedPatient || !medicalHistoryForm) return;
    setIsBusy(true);
    setError(null);
    try {
      if (editingMedicalHistory) {
        await window.elite.medicalHistory.update(
          token,
          selectedPatient.patientId,
          editingMedicalHistory.id,
          medicalHistoryForm,
          editingMedicalHistory.version,
        );
      } else {
        await window.elite.medicalHistory.create(
          token,
          selectedPatient.patientId,
          medicalHistoryForm,
        );
      }
      setMedicalHistory(
        await window.elite.medicalHistory.list(
          token,
          selectedPatient.patientId,
        ),
      );
      setMedicalHistoryForm(null);
      setEditingMedicalHistory(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save medical history",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const archiveMedicalHistory = async (
    entry: MedicalHistoryEntry,
  ): Promise<void> => {
    if (!selectedPatient || medicalHistoryArchiveReason.trim().length < 3) {
      setError("Enter an audit reason before inactivating history");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.medicalHistory.archive(
        token,
        selectedPatient.patientId,
        entry.id,
        entry.version,
        medicalHistoryArchiveReason,
      );
      setMedicalHistory(
        await window.elite.medicalHistory.list(
          token,
          selectedPatient.patientId,
        ),
      );
      setMedicalHistoryArchiveReason("");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to inactivate medical history",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const openNewRelatedPerson = (): void => {
    if (!selectedPatient) return;
    setEditingRelatedLink(null);
    setRelatedPersonForm(createNewRelatedPersonForm());
    setError(null);
  };

  const openEditRelatedPerson = (
    link: PatientRelatedPersonLinkSummary,
  ): void => {
    setEditingRelatedLink(link);
    setRelatedPersonForm(getRelatedPersonFormState(link));
    setError(null);
  };

  const saveRelatedPerson = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedPatient || !relatedPersonForm) return;
    const form = relatedPersonForm;
    const { personInput, linkInput } = buildRelatedPersonInputs(form);
    setIsBusy(true);
    setError(null);
    try {
      if (editingRelatedLink) {
        await window.elite.relatedPersons.update(
          token,
          editingRelatedLink.relatedPersonId,
          personInput,
          editingRelatedLink.relatedPerson.version,
        );
        await window.elite.relatedPersons.updateLink(
          token,
          selectedPatient.patientId,
          editingRelatedLink.relatedPersonId,
          linkInput,
        );
      } else {
        const created = await window.elite.relatedPersons.create(
          token,
          personInput,
        );
        await window.elite.relatedPersons.link(
          token,
          selectedPatient.patientId,
          created.id,
          linkInput,
        );
      }
      setRelatedLinks(
        await window.elite.relatedPersons.listLinks(
          token,
          selectedPatient.patientId,
        ),
      );
      setRelatedPersonForm(null);
      setEditingRelatedLink(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save related person",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const unlinkRelatedPerson = async (
    link: PatientRelatedPersonLinkSummary,
  ): Promise<void> => {
    if (!selectedPatient) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.relatedPersons.unlink(
        token,
        selectedPatient.patientId,
        link.relatedPersonId,
        "Unlinked from patient profile",
      );
      setRelatedLinks(
        await window.elite.relatedPersons.listLinks(
          token,
          selectedPatient.patientId,
        ),
      );
      if (editingRelatedLink?.relatedPersonId === link.relatedPersonId) {
        setRelatedPersonForm(null);
        setEditingRelatedLink(null);
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to unlink related person",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const saveProfile = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedPatient) return;
    const input = buildUpdateInput();
    setIsBusy(true);
    setError(null);
    try {
      const candidates = await window.elite.patients.findDuplicates(
        token,
        input,
        selectedPatient.patientId,
      );
      if (candidates.length > 0) {
        setDuplicates(candidates);
        setPendingEdit({
          patientId: selectedPatient.patientId,
          input,
          expectedVersion: selectedPatient.version,
        });
        return;
      }
      const updated = await window.elite.patients.update(
        token,
        selectedPatient.patientId,
        input,
        selectedPatient.version,
      );
      setSelectedPatient(updated);
      setDuplicates([]);
      setPendingEdit(null);
      await refresh();
    } catch (reason: unknown) {
      setError(
        receptionistFriendlyError(
          reason,
          "The patient profile could not be saved. Check the details and try again.",
        ),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const confirmProfileDuplicate = async (): Promise<void> => {
    if (!pendingEdit) return;
    setIsBusy(true);
    setError(null);
    try {
      const updated = await window.elite.patients.update(
        token,
        pendingEdit.patientId,
        pendingEdit.input,
        pendingEdit.expectedVersion,
        decisionReason,
      );
      setSelectedPatient(updated);
      setDuplicates([]);
      setPendingEdit(null);
      setDecisionReason("");
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save duplicate-reviewed profile",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const clearSelectedPatient = (): void => {
    setSelectedPatient(null);
    setShowRegistrationForm(false);
    setPatientDetailTab("overview");
    setRelatedLinks([]);
    setMedicalHistory([]);
    setPatientAppointments([]);
    setMedicalHistoryForm(null);
    setEditingMedicalHistory(null);
    setMedicalHistoryArchiveReason("");
    setRelatedPersonForm(null);
    setEditingRelatedLink(null);
    setNameEn("");
    setNameAr("");
    setDob("");
    setSex("");
    setPhone("");
    setNationalId("");
    setRegistrationMode("quick");
    setDuplicates([]);
    setPendingInput(null);
    setPendingEdit(null);
    setDecisionReason("");
    setError(null);
  };

  const archive = async (patient: Patient): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.patients.archive(
        token,
        patient.patientId,
        "Archived from Step 4 patient workspace",
      );
      await refresh();
    } catch (reason: unknown) {
      setError(
        receptionistFriendlyError(
          reason,
          "The patient could not be archived. Ask an Admin if the problem continues.",
        ),
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section
      className="card patient-workspace"
      aria-labelledby="patients-title"
    >
      <div className="card-heading">
        <div>
          <p className="eyebrow">{t("Front desk", "الاستقبال")}</p>
          <h2 id="patients-title">{t("Patients", "المرضى")}</h2>
        </div>
        <span className="status ok">
          {t("Saved on this computer", "محفوظ على هذا الكمبيوتر")}
        </span>
      </div>
      <p className="form-help">
        {t(
          "Patient numbers are generated automatically. We will warn you about possible duplicates before saving.",
          "يتم إنشاء رقم المريض تلقائياً. سننبهك إلى أي تطابق محتمل قبل الحفظ.",
        )}
      </p>
      <ErrorMessage message={error} />
      {selectedPatient ? (
        <PatientContextBanner
          patient={selectedPatient}
          locale={locale}
          labels={{
            context: copy(locale, "patientContext"),
            patientId: copy(locale, "patientId"),
            phone: copy(locale, "phone"),
            age: copy(locale, "age"),
            status: copy(locale, "status"),
            clear: copy(locale, "clearContext"),
            notRecorded: locale === "ar-EG" ? "غير مسجل" : "Not recorded",
          }}
          statusLabel={formatStatusLabel(selectedPatient.status, locale)}
          onClear={clearSelectedPatient}
        />
      ) : null}
      <div className="patient-toolbar">
        <input
          aria-label={t("Search patients", "البحث عن المرضى")}
          placeholder={t(
            "Search by name, phone, or patient number",
            "ابحث بالاسم أو الهاتف أو رقم المريض",
          )}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void refresh();
          }}
        />
        <button
          className="button secondary"
          type="button"
          onClick={() => void refresh()}
          disabled={isBusy}
        >
          {t("Search", "بحث")}
        </button>
        {!selectedPatient && !showRegistrationForm ? (
          <button
            className="button primary"
            type="button"
            onClick={() => setShowRegistrationForm(true)}
          >
            {t("Register new patient", "تسجيل مريض جديد")}
          </button>
        ) : null}
      </div>
      {showRegistrationForm || selectedPatient ? (
        <form
          className="form patient-registration"
          onSubmit={(event) => {
            if (selectedPatient) void saveProfile(event);
            else void submit(event);
          }}
        >
          <div className="form-heading-row">
            <h3>
              {selectedPatient
                ? `${t("Edit", "تعديل")} ${selectedPatient.patientId}`
                : t("Patient registration", "تسجيل المريض")}
            </h3>
            {selectedPatient ? (
              <button
                className="button secondary"
                type="button"
                onClick={clearSelectedPatient}
              >
                {t("New patient", "مريض جديد")}
              </button>
            ) : null}
          </div>
          <div className="form-grid">
            <label>
              {t("Registration mode", "نوع التسجيل")}
              <select
                value={registrationMode}
                onChange={(event) =>
                  setRegistrationMode(event.target.value as "quick" | "full")
                }
              >
                <option value="quick">{t("Quick", "سريع")}</option>
                <option value="full">{t("Full", "كامل")}</option>
              </select>
            </label>
            <label>
              {t("Full name", "الاسم الكامل")}
              <input
                required
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
              />
            </label>
            <label>
              {t("Phone", "الهاتف")}
              <input
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
          </div>
          {registrationMode === "full" ? (
            <div className="form-grid full-registration-fields">
              <label>
                {t("Arabic name", "الاسم بالعربية")}
                <input
                  value={nameAr}
                  onChange={(event) => setNameAr(event.target.value)}
                />
              </label>
              <label>
                {t("Date of birth", "تاريخ الميلاد")}
                <input
                  type="date"
                  value={dob}
                  onChange={(event) => setDob(event.target.value)}
                />
              </label>
              <label>
                {t("Sex", "النوع")}
                <select
                  value={sex}
                  onChange={(event) => setSex(event.target.value as typeof sex)}
                >
                  <option value="">{t("Not recorded", "غير مسجل")}</option>
                  <option value="female">{t("Female", "أنثى")}</option>
                  <option value="male">{t("Male", "ذكر")}</option>
                  <option value="intersex">
                    {t("Intersex", "ثنائي الجنس")}
                  </option>
                  <option value="unknown">{t("Unknown", "غير معروف")}</option>
                </select>
              </label>
              <label>
                {t("National ID (optional)", "الرقم القومي (اختياري)")}
                <input
                  value={nationalId}
                  onChange={(event) => setNationalId(event.target.value)}
                />
              </label>
            </div>
          ) : null}
          <button className="button primary" type="submit" disabled={isBusy}>
            {selectedPatient
              ? t("Check and save profile", "مراجعة وحفظ الملف")
              : t("Check and register", "مراجعة وتسجيل")}
          </button>
        </form>
      ) : null}
      {duplicateReview.visible ? (
        <div className="duplicate-panel" role="alert">
          <h3>{t("Possible duplicate patients", "مرضى متشابهون محتملون")}</h3>
          <p>
            {t(
              `Review the matches before continuing. You may cancel or ${pendingEdit ? "save this profile" : "create another patient"} with a reason.`,
              `راجع التطابقات قبل المتابعة. يمكنك الإلغاء أو ${pendingEdit ? "حفظ هذا الملف" : "إنشاء مريض آخر"} مع ذكر السبب.`,
            )}
          </p>
          {duplicates.map((candidate) => (
            <div className="duplicate-row" key={candidate.patient.id}>
              <strong>
                {candidate.patient.patientId} — {candidate.patient.nameEn}
              </strong>
              <span>
                {t("Score", "الدرجة")} {candidate.score} · {candidate.severity}
              </span>
              <span>
                {candidate.signals.map((signal) => signal.code).join(", ")}
              </span>
            </div>
          ))}
          <label>
            {t("Reason to create another patient", "سبب إنشاء مريض آخر")}
            <input
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              minLength={3}
            />
          </label>
          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setPendingInput(null);
                setPendingEdit(null);
                setDuplicates([]);
              }}
            >
              {t("Cancel", "إلغاء")}
            </button>
            <button
              className="button primary"
              type="button"
              disabled={!duplicateReview.canConfirm}

              onClick={() => {
                if (duplicateReview.mode === "update") {
                  void confirmProfileDuplicate();
                } else if (duplicateReview.mode === "create" && pendingInput) {
                  void createPatient(pendingInput, decisionReason);
                }
              }}
            >
              {duplicateReview.mode === "update"
                ? t("Save profile after review", "حفظ الملف بعد المراجعة")
                : t("Create another patient", "إنشاء مريض آخر")}
            </button>
          </div>
        </div>
      ) : null}
      <div className="patient-profile-table" aria-live="polite">
        {patients.length === 0 ? (
          <p className="muted">
            {t(
              "No active patients match this search.",
              "لا يوجد مرضى نشطون يطابقون هذا البحث.",
            )}
          </p>
        ) : null}
        {patients.map((patient) => {
          const initials = patient.nameEn.trim().slice(0, 2).toUpperCase();
          return (
            <article className="patient-profile-row" key={patient.id}>
              <div className="patient-profile-card-heading">
                <span className="patient-avatar" aria-hidden="true">
                  {initials || "PT"}
                </span>
                <div>
                  <strong>{patient.nameEn}</strong>
                  <BidiValue direction="ltr" className="patient-profile-id">
                    {patient.patientId}
                  </BidiValue>
                  {patient.nameAr ? (
                    <small dir="rtl">{patient.nameAr}</small>
                  ) : null}
                </div>
                <span
                  className={`status ${patient.status === "active" ? "ok" : "warn"}`}
                >
                  {formatStatusLabel(patient.status, locale)}
                </span>
              </div>
              <div className="patient-profile-card-facts">
                <span>
                  <small>{t("Phone", "الهاتف")}</small>

                  <BidiValue direction="ltr">{patient.phone}</BidiValue>
                </span>
                <span>
                  <small>{t("Date of birth", "تاريخ الميلاد")}</small>

                  <span>
                    {patient.dob
                      ? formatLocalizedDate(patient.dob, locale, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : locale === "ar-EG"
                        ? "غير مسجل"
                        : "Not recorded"}
                  </span>
                </span>
                <span>
                  <small>{t("Record completeness", "اكتمال الملف")}</small>

                  <span>
                    {formatStatusLabel(patient.completenessStatus, locale)}
                  </span>
                </span>
              </div>
              <div className="patient-profile-card-actions">
                <button
                  className="button secondary"
                  type="button"
                  disabled={isBusy}
                  onClick={() => void selectPatient(patient)}
                >
                  {t("Open profile", "فتح الملف")}
                </button>
                {patientCapabilities.canArchivePatient &&
                patient.status === "active" ? (
                  <button
                    className="button danger"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void archive(patient)}
                  >
                    {t("Archive", "أرشفة")}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {selectedPatient ? (
        <div className="profile-summary">
          <div className="card-heading">
            <div>
              <p className="eyebrow">{t("Patient profile", "ملف المريض")}</p>
              <h3>
                {selectedPatient.patientId} · {selectedPatient.nameEn}
              </h3>
            </div>
            <div className="button-row">
              <button
                className="button secondary small"
                type="button"
                onClick={() => setShowRegistrationForm(true)}
              >
                {t("Edit profile", "تعديل الملف")}
              </button>
              <span
                className={`status ${selectedPatient.status === "active" ? "ok" : "warn"}`}
              >
                {selectedPatient.status}
              </span>
            </div>
          </div>
          <nav
            className="patient-detail-tabs"
            aria-label={t("Patient profile sections", "أقسام ملف المريض")}
          >
            {(
              [
                ["overview", t("Overview", "نظرة عامة")],
                ["visits", t("Visits", "الزيارات")],
                ["appointments", t("Appointments", "المواعيد")],
                ["billing", t("Payments", "المدفوعات")],
                ["contacts", t("Contacts", "جهات الاتصال")],
              ] as const
            ).map(([tab, label]) => {
              const isClinicalTab = tab === "visits";
              const isBillingTab = tab === "billing";
              const disabled =
                (isClinicalTab && !patientCapabilities.canReadClinical) ||
                (isBillingTab &&
                  !session.capabilities.includes("billing.read"));
              return (
                <button
                  className={`patient-detail-tab${patientDetailTab === tab ? " is-active" : ""}`}
                  type="button"
                  key={tab}
                  disabled={disabled}
                  aria-selected={patientDetailTab === tab}
                  onClick={() => setPatientDetailTab(tab)}
                >
                  {label}
                </button>
              );
            })}
          </nav>
          {patientDetailTab === "overview" ? (
            <dl className="status-grid profile-grid">
              <div>
                <dt>{t("English name", "الاسم بالإنجليزية")}</dt>
                <dd>{selectedPatient.nameEn}</dd>
              </div>
              <div>
                <dt>{t("Arabic name", "الاسم بالعربية")}</dt>
                <dd>
                  {selectedPatient.nameAr ?? t("Not recorded", "غير مسجل")}
                </dd>
              </div>
              <div>
                <dt>{t("Date of birth", "تاريخ الميلاد")}</dt>
                <dd>{selectedPatient.dob ?? t("Not recorded", "غير مسجل")}</dd>
              </div>
              <div>
                <dt>{t("National ID", "الرقم القومي")}</dt>
                <dd>
                  {selectedPatient.nationalId
                    ? t("Recorded", "مسجل")
                    : t("Not recorded", "غير مسجل")}
                </dd>
              </div>
            </dl>
          ) : null}
          {patientDetailTab === "visits" &&
          patientCapabilities.canReadClinical ? (
            <>
              <section
                className="visit-history-panel"
                aria-labelledby="visit-history-title"
              >
                <div className="related-person-heading">
                  <div>
                    <h4 id="visit-history-title">
                      {t("Visit history", "سجل الزيارات")}
                    </h4>
                    <p className="form-help">
                      {t(
                        "Appointments and visit status are shown from the clinic record.",
                        "تظهر المواعيد وحالة الزيارة من سجل العيادة.",
                      )}
                    </p>
                  </div>
                  <span className="status info">
                    {patientAppointments.length}
                  </span>
                </div>
                {patientAppointments.length === 0 ? (
                  <p className="muted">
                    {t(
                      "No visits recorded for this patient.",
                      "لا توجد زيارات مسجلة لهذا المريض.",
                    )}
                  </p>
                ) : (
                  <div className="visit-history-list">
                    {patientAppointments.map((appointment) => (
                      <article
                        className="visit-history-row"
                        key={appointment.id}
                      >
                        <time dateTime={appointment.scheduledStart}>
                          {formatLocalizedDate(
                            appointment.scheduledStart,
                            locale,
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </time>
                        <div>
                          <strong>
                            {formatVisitTypeLabel(
                              appointment.visitType,
                              locale,
                            )}
                          </strong>
                          <span>
                            {formatStatusLabel(appointment.status, locale)}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <section
                className="medical-history-section"
                aria-labelledby="medical-history-title"
              >
                <div className="related-person-heading">
                  <div>
                    <h4 id="medical-history-title">
                      {t("Medical history", "التاريخ الطبي")}
                    </h4>
                    <p className="form-help">
                      {t(
                        "Structured clinical history is versioned and never silently deleted.",
                        "يتم حفظ التاريخ الطبي المنظم بإصدارات ولا يُحذف بصمت.",
                      )}
                    </p>
                  </div>
                  {patientCapabilities.canWriteClinical ? (
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy}
                      onClick={openNewMedicalHistory}
                    >
                      {t("Add history entry", "إضافة سجل طبي")}
                    </button>
                  ) : null}
                </div>
                {patientCapabilities.canWriteClinical ? (
                  <label className="history-audit-reason">
                    Reason for inactivation
                    <input
                      placeholder="Required when inactivating an entry"
                      value={medicalHistoryArchiveReason}
                      onChange={(event) =>
                        setMedicalHistoryArchiveReason(event.target.value)
                      }
                    />
                  </label>
                ) : null}
                {medicalHistory.length === 0 ? (
                  <p className="muted">No medical-history entries recorded.</p>
                ) : (
                  <div className="medical-history-list">
                    {medicalHistory.map((entry) => (
                      <article className="medical-history-row" key={entry.id}>
                        <div>
                          <strong>{entry.title}</strong>
                          <span>
                            {entry.category} · {entry.status} · {entry.source}
                            {entry.onsetDate
                              ? ` · onset ${entry.onsetDate}`
                              : ""}
                          </span>
                          {entry.details ? (
                            <small>{entry.details}</small>
                          ) : null}
                        </div>
                        {patientCapabilities.canWriteClinical ? (
                          <div className="button-row">
                            <button
                              className="button secondary"
                              type="button"
                              disabled={isBusy}
                              onClick={() => openEditMedicalHistory(entry)}
                            >
                              Edit
                            </button>
                            {entry.status !== "inactive" ? (
                              <button
                                className="button danger"
                                type="button"
                                disabled={
                                  isBusy ||
                                  medicalHistoryArchiveReason.trim().length < 3
                                }
                                onClick={() =>
                                  void archiveMedicalHistory(entry)
                                }
                              >
                                Inactivate
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
                {medicalHistoryForm ? (
                  <form
                    className="medical-history-editor"
                    onSubmit={(event) => void saveMedicalHistory(event)}
                  >
                    <div className="form-heading-row">
                      <h4>
                        {editingMedicalHistory
                          ? "Edit history entry"
                          : "Add history entry"}
                      </h4>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => {
                          setMedicalHistoryForm(null);
                          setEditingMedicalHistory(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="form-grid">
                      <label>
                        Category
                        <select
                          required
                          value={medicalHistoryForm.category}
                          onChange={(event) =>
                            setMedicalHistoryForm((current) =>
                              current
                                ? {
                                    ...current,
                                    category: event.target
                                      .value as MedicalHistoryInput["category"],
                                  }
                                : current,
                            )
                          }
                        >
                          <option value="condition">Condition</option>
                          <option value="allergy">Allergy</option>
                          <option value="medication">Medication</option>
                          <option value="surgery">Surgery</option>
                          <option value="family-history">Family history</option>
                          <option value="social-history">Social history</option>
                          <option value="immunization">Immunization</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label>
                        Title
                        <input
                          required
                          value={medicalHistoryForm.title}
                          onChange={(event) =>
                            setMedicalHistoryForm((current) =>
                              current
                                ? { ...current, title: event.target.value }
                                : current,
                            )
                          }
                        />
                      </label>
                      <label>
                        Onset date
                        <input
                          type="date"
                          value={medicalHistoryForm.onsetDate ?? ""}
                          onChange={(event) =>
                            setMedicalHistoryForm((current) =>
                              current
                                ? { ...current, onsetDate: event.target.value }
                                : current,
                            )
                          }
                        />
                      </label>
                      <label>
                        Status
                        <select
                          value={medicalHistoryForm.status}
                          onChange={(event) =>
                            setMedicalHistoryForm((current) =>
                              current
                                ? {
                                    ...current,
                                    status: event.target
                                      .value as MedicalHistoryInput["status"],
                                  }
                                : current,
                            )
                          }
                        >
                          <option value="active">Active</option>
                          <option value="resolved">Resolved</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </label>
                      <label>
                        Source
                        <select
                          value={medicalHistoryForm.source}
                          onChange={(event) =>
                            setMedicalHistoryForm((current) =>
                              current
                                ? {
                                    ...current,
                                    source: event.target
                                      .value as MedicalHistoryInput["source"],
                                  }
                                : current,
                            )
                          }
                        >
                          <option value="clinician-recorded">
                            Clinician recorded
                          </option>
                          <option value="patient-reported">
                            Patient reported
                          </option>
                          <option value="external-record">
                            External record
                          </option>
                        </select>
                      </label>
                    </div>
                    <label>
                      Details
                      <textarea
                        rows={4}
                        value={medicalHistoryForm.details ?? ""}
                        onChange={(event) =>
                          setMedicalHistoryForm((current) =>
                            current
                              ? { ...current, details: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <button
                      className="button primary"
                      type="submit"
                      disabled={isBusy}
                    >
                      {editingMedicalHistory
                        ? "Save history entry"
                        : "Create history entry"}
                    </button>
                  </form>
                ) : null}
              </section>
            </>
          ) : null}
          {patientDetailTab === "contacts" ? (
            <>
              <div className="related-person-heading">
                <h4>Related persons and guardians</h4>
                {patientCapabilities.canManageRelatedPersons ? (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isBusy}
                    onClick={openNewRelatedPerson}
                  >
                    Add related person
                  </button>
                ) : null}
              </div>
              {relatedLinks.length === 0 ? (
                <p className="muted">No related persons linked.</p>
              ) : (
                <div className="related-person-list">
                  {relatedLinks.map((link) => (
                    <div
                      className="related-person-row"
                      key={link.relatedPersonId}
                    >
                      <div>
                        <strong>{link.relatedPerson.displayNameEn}</strong>
                        <span>
                          {link.relationshipRole} ·{" "}
                          {link.relatedPerson.phoneNumbers.join(", ")}
                        </span>
                        <small>
                          {link.relatedPerson.isGuardian
                            ? "Guardian"
                            : "Related person"}{" "}
                          · {link.consentAuthority} consent ·{" "}
                          {link.verificationStatus}
                        </small>
                      </div>
                      {patientCapabilities.canManageRelatedPersons ? (
                        <div className="button-row">
                          <button
                            className="button secondary"
                            type="button"
                            disabled={isBusy}
                            onClick={() => openEditRelatedPerson(link)}
                          >
                            Edit
                          </button>
                          <button
                            className="button danger"
                            type="button"
                            disabled={isBusy}
                            onClick={() => void unlinkRelatedPerson(link)}
                          >
                            Unlink
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
              {relatedPersonForm ? (
                <form
                  className="related-person-editor"
                  onSubmit={(event) => void saveRelatedPerson(event)}
                >
                  <div className="form-heading-row">
                    <h4>
                      {editingRelatedLink
                        ? "Edit related person and link"
                        : "Add related person and link"}
                    </h4>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        setRelatedPersonForm(null);
                        setEditingRelatedLink(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="form-grid">
                    <label>
                      English name
                      <input
                        required
                        value={relatedPersonForm.displayNameEn}
                        onChange={(event) =>
                          setRelatedPersonForm((current) =>
                            current
                              ? {
                                  ...current,
                                  displayNameEn: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      Arabic name
                      <input
                        value={relatedPersonForm.displayNameAr}
                        onChange={(event) =>
                          setRelatedPersonForm((current) =>
                            current
                              ? {
                                  ...current,
                                  displayNameAr: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      Phone
                      <input
                        required
                        value={relatedPersonForm.phone}
                        onChange={(event) =>
                          setRelatedPersonForm((current) =>
                            current
                              ? { ...current, phone: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      Person relationship
                      <input
                        required
                        value={relatedPersonForm.relationship}
                        onChange={(event) =>
                          setRelatedPersonForm((current) =>
                            current
                              ? { ...current, relationship: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      Patient link role
                      <input
                        required
                        value={relatedPersonForm.relationshipRole}
                        onChange={(event) =>
                          setRelatedPersonForm((current) =>
                            current
                              ? {
                                  ...current,
                                  relationshipRole: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      Consent authority
                      <select
                        value={relatedPersonForm.consentAuthority}
                        onChange={(event) =>
                          setRelatedPersonForm((current) =>
                            current
                              ? {
                                  ...current,
                                  consentAuthority: event.target
                                    .value as RelatedPersonFormState["consentAuthority"],
                                }
                              : current,
                          )
                        }
                      >
                        <option value="none">None</option>
                        <option value="inform">Inform</option>
                        <option value="consent">Consent</option>
                      </select>
                    </label>
                  </div>
                  <div className="checkbox-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={relatedPersonForm.isGuardian}
                        onChange={(event) =>
                          setRelatedPersonForm((current) =>
                            current
                              ? { ...current, isGuardian: event.target.checked }
                              : current,
                          )
                        }
                      />{" "}
                      Guardian
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={relatedPersonForm.isAuthorizedToConsent}
                        onChange={(event) =>
                          setRelatedPersonForm((current) =>
                            current
                              ? {
                                  ...current,
                                  isAuthorizedToConsent: event.target.checked,
                                }
                              : current,
                          )
                        }
                      />{" "}
                      Authorized to consent
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={relatedPersonForm.isAuthorizedToContact}
                        onChange={(event) =>
                          setRelatedPersonForm((current) =>
                            current
                              ? {
                                  ...current,
                                  isAuthorizedToContact: event.target.checked,
                                }
                              : current,
                          )
                        }
                      />{" "}
                      Authorized to contact
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={relatedPersonForm.isPrimary}
                        onChange={(event) =>
                          setRelatedPersonForm((current) =>
                            current
                              ? { ...current, isPrimary: event.target.checked }
                              : current,
                          )
                        }
                      />{" "}
                      Primary link
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={
                          relatedPersonForm.verificationStatus === "verified"
                        }
                        onChange={(event) =>
                          setRelatedPersonForm((current) =>
                            current
                              ? {
                                  ...current,
                                  verificationStatus: event.target.checked
                                    ? "verified"
                                    : "unverified",
                                }
                              : current,
                          )
                        }
                      />{" "}
                      Verified identity/link
                    </label>
                  </div>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={isBusy}
                  >
                    {editingRelatedLink
                      ? "Save related person and link"
                      : "Create and link related person"}
                  </button>
                </form>
              ) : null}
            </>
          ) : null}
          {patientDetailTab === "appointments" ? (
            <section className="patient-tab-handoff">
              <h4>Appointments for this patient</h4>
              <p>
                Open the appointment calendar to book, check in, or review this
                patient’s visits.
              </p>
              <button
                className="button primary"
                type="button"
                onClick={onOpenAppointments}
              >
                Open appointments
              </button>
            </section>
          ) : null}
          {patientDetailTab === "billing" ? (
            <section className="patient-tab-handoff">
              <h4>Payments for this patient</h4>
              <p>
                Open billing to create an invoice, record a payment, or issue a
                receipt for this patient.
              </p>
              {session.capabilities.includes("billing.read") ? (
                <button
                  className="button primary"
                  type="button"
                  onClick={onOpenBilling}
                >
                  Open billing
                </button>
              ) : (
                <p className="muted">
                  Billing is not available for this account.
                </p>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type CalendarView = "month" | "week" | "day";

const CALENDAR_DAY_NAMES = [
  "Saturday",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function addCalendarDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function startOfClinicWeek(date: Date): Date {
  const daysSinceSaturday = (date.getDay() + 1) % 7;
  return addCalendarDays(date, -daysSinceSaturday);
}

function getCalendarRange(
  view: CalendarView,
  selectedDate: string,
): { from: string; to: string } {
  const date = parseLocalDate(selectedDate);
  let fromDate: Date;
  let toDate: Date;
  if (view === "month") {
    fromDate = new Date(date.getFullYear(), date.getMonth(), 1);
    toDate = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  } else if (view === "week") {
    fromDate = startOfClinicWeek(date);
    toDate = addCalendarDays(fromDate, 7);
  } else {
    fromDate = date;
    toDate = addCalendarDays(date, 1);
  }
  return {
    from: new Date(fromDate).toISOString(),
    to: new Date(toDate).toISOString(),
  };
}

function getMonthGridDays(selectedDate: string): readonly Date[] {
  const date = parseLocalDate(selectedDate);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const gridStart = startOfClinicWeek(first);
  return Array.from({ length: 42 }, (_, index) =>
    addCalendarDays(gridStart, index),
  );
}

function formatCalendarHeading(
  view: CalendarView,
  selectedDate: string,
): string {
  const date = parseLocalDate(selectedDate);
  if (view === "day") {
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (view === "week") {
    const start = startOfClinicWeek(date);
    const end = addCalendarDays(start, 6);
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function ClinicalWorkflowWorkspace({
  token,
  locale,
  canManage,
  canWriteAppointments,
  canReadClinical,
  canWriteClinical,
  canSignClinical,
  canApproveClinical,
  canRecordDiagnosis,
  canExport,
  canSensitiveExport,
  canRevoke,
  isReceptionist,
}: {
  token: string;
  locale: InterfaceLocale;
  canManage: boolean;
  canWriteAppointments: boolean;
  canReadClinical: boolean;
  canWriteClinical: boolean;
  canSignClinical: boolean;
  canApproveClinical: boolean;
  canRecordDiagnosis: boolean;
  canExport: boolean;
  canSensitiveExport: boolean;
  canRevoke: boolean;
  isReceptionist: boolean;
}): ReactElement {
  const [specialties, setSpecialties] = useState<readonly Specialty[]>([]);
  const [departments, setDepartments] = useState<readonly Department[]>([]);
  const [services, setServices] = useState<readonly Service[]>([]);
  const [schedules, setSchedules] = useState<readonly Schedule[]>([]);
  const [exceptions, setExceptions] = useState<readonly ScheduleException[]>(
    [],
  );
  const [appointments, setAppointments] = useState<readonly Appointment[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<
    readonly WaitlistEntry[]
  >([]);
  const [waitlistDate, setWaitlistDate] = useState("");
  const [waitlistTime, setWaitlistTime] = useState("");
  const [waitlistNotes, setWaitlistNotes] = useState("");
  const [showWaitlistForm, setShowWaitlistForm] = useState(false);
  const [selectedAppointmentPatient, setSelectedAppointmentPatient] =
    useState<Patient | null>(null);
  const [icd10Codes, setIcd10Codes] = useState<readonly Icd10Code[]>([]);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [selectedEncounter, setSelectedEncounter] = useState<Encounter | null>(
    null,
  );
  const [selectedEffectiveEncounter, setSelectedEffectiveEncounter] =
    useState<EffectiveEncounter | null>(null);
  const [amendments, setAmendments] = useState<readonly EncounterAmendment[]>(
    [],
  );
  const [amendmentDiffs, setAmendmentDiffs] = useState<
    readonly EncounterAmendmentDiff[]
  >([]);
  const [projectionSnapshots, setProjectionSnapshots] = useState<
    readonly ProjectionSnapshot[]
  >([]);
  const [snapshotExportReason, setSnapshotExportReason] = useState("");
  const [exportFormat, setExportFormat] = useState<"pdf" | "fhir">("pdf");
  const [exportRedactionPolicy, setExportRedactionPolicy] = useState<
    "minimal" | "clinical" | "full"
  >("clinical");
  const [exportReason, setExportReason] = useState("");
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportVerification, setExportVerification] =
    useState<ExportVerificationResult | null>(null);
  const [zipExportResult, setZipExportResult] = useState<{
    package: {
      packageId: string;
      archivePath: string;
      manifest: {
        expiresAt?: string | null | undefined;
        fhirValidation?: FhirValidationResult | undefined;
      };
    };
    savedArchivePath: string;
    fhirValidation?: FhirValidationResult;
    verification: ExportVerificationResult;
  } | null>(null);
  const [fhirValidation, setFhirValidation] =
    useState<FhirValidationResult | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [orgSettingsForm, setOrgSettingsForm] = useState<OrgSettingsInput>({
    clinicNameEn: "Elite Clinic Management System",
    countryCode: "EG",
    oid: "1.3.6.1.4.1.99999.1",
    fhirSystemUrl: "https://fhir.elite-clinic.local",
    exportExpirationDays: 30,
    sessionTtlMinutes: 180,
    fhirProfileBundleId: "elite-clinic-r4",
  });
  const [revocations, setRevocations] = useState<readonly ExportRevocation[]>(
    [],
  );
  const [revocationReason, setRevocationReason] = useState("");
  const [exportRegistry, setExportRegistry] = useState<
    readonly ExportPackageRegistryRecord[]
  >([]);
  const [selectedRegistryPackageId, setSelectedRegistryPackageId] =
    useState("");
  const [registryTransitionReason, setRegistryTransitionReason] = useState("");
  const [signingKeys, setSigningKeys] = useState<
    readonly ExportSigningKeyMetadata[]
  >([]);
  const [keyRotationReason, setKeyRotationReason] = useState("");
  const [recoveryPassphrase, setRecoveryPassphrase] = useState("");
  const [recoveryBundleJson, setRecoveryBundleJson] = useState("");
  const [governanceRecipients, setGovernanceRecipients] = useState<
    readonly ExportRecipient[]
  >([]);
  const [governanceEvidence, setGovernanceEvidence] = useState<
    readonly ExportConsentEvidence[]
  >([]);
  const [governanceDisclosures, setGovernanceDisclosures] = useState<
    readonly ExportDisclosure[]
  >([]);
  const [governanceReceipts, setGovernanceReceipts] = useState<
    readonly ExportReceipt[]
  >([]);
  const [recipientDisplayName, setRecipientDisplayName] = useState("");
  const [recipientOrganizationName, setRecipientOrganizationName] =
    useState("");
  const [recipientCategory, setRecipientCategory] =
    useState<ExportRecipient["category"]>("referral-provider");
  const [recipientContactChannel, setRecipientContactChannel] = useState("");
  const [governanceEvidenceReference, setGovernanceEvidenceReference] =
    useState("");
  const [governanceReason, setGovernanceReason] = useState("");
  const [fhirProfiles, setFhirProfiles] = useState<
    readonly FhirProfileBundleRecord[]
  >([]);
  const [fhirProfileBundleJson, setFhirProfileBundleJson] = useState("");
  const [amendmentForm, setAmendmentForm] = useState<AmendmentFormState | null>(
    null,
  );
  const [amendmentReviewReason, setAmendmentReviewReason] = useState("");
  const [diagnoses, setDiagnoses] = useState<readonly Diagnosis[]>([]);
  const [encounterForm, setEncounterForm] = useState<EncounterFormState | null>(
    null,
  );
  const [diagnosisForm, setDiagnosisForm] = useState<DiagnosisFormState | null>(
    null,
  );
  const [diagnosisReviewReason, setDiagnosisReviewReason] = useState("");
  const [icd10Code, setIcd10Code] = useState("");
  const [icd10Title, setIcd10Title] = useState("");
  const [icd10Release, setIcd10Release] = useState("");
  const [doctors, setDoctors] = useState<readonly DoctorDirectoryEntry[]>([]);
  const [appointmentDoctorId, setAppointmentDoctorId] = useState("");
  const [calendarDoctorId, setCalendarDoctorId] = useState("");
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [selectedDate, setSelectedDate] = useState(() =>
    formatLocalDate(new Date()),
  );
  const [doctorId, setDoctorId] = useState("");
  const [scheduleDepartmentId, setScheduleDepartmentId] = useState("");
  const [scheduleDay, setScheduleDay] = useState("6");
  const [scheduleStart, setScheduleStart] = useState("09:00");
  const [scheduleEnd, setScheduleEnd] = useState("17:00");
  const [slotDuration, setSlotDuration] = useState("15");
  const [exceptionDoctorId, setExceptionDoctorId] = useState("");
  const [exceptionDepartmentId, setExceptionDepartmentId] = useState("");
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionKind, setExceptionKind] = useState<"closed" | "open">(
    "closed",
  );
  const [exceptionStart, setExceptionStart] = useState("");
  const [exceptionEnd, setExceptionEnd] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [patientId, setPatientId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [visitType, setVisitType] = useState("consultation");
  const [appointmentStep, setAppointmentStep] = useState<1 | 2 | 3 | 4>(1);
  const [scheduledStart, setScheduledStart] = useState("");
  const [specialtyCode, setSpecialtyCode] = useState("");
  const [specialtyName, setSpecialtyName] = useState("");
  const [departmentCode, setDepartmentCode] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [serviceCode, setServiceCode] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const t = (english: string, arabic: string): string =>
    frontDeskCopy(locale, english, arabic);

  const refresh = async (): Promise<void> => {
    try {
      const [
        specialtyRows,
        departmentRows,
        serviceRows,
        scheduleRows,
        exceptionRows,
        icd10Rows,
        doctorRows,
        appointmentRows,
        waitlistRows,
      ] = await Promise.all([
        canReadClinical
          ? window.elite.clinical.listSpecialties(token)
          : Promise.resolve([] as readonly Specialty[]),
        window.elite.clinical.listDepartments(token),
        window.elite.clinical.listServices(token),
        canReadClinical
          ? window.elite.clinical.listSchedules(token)
          : Promise.resolve([] as readonly Schedule[]),
        canReadClinical
          ? window.elite.clinical.listExceptions(token)
          : Promise.resolve([] as readonly ScheduleException[]),
        canReadClinical
          ? window.elite.clinical.listIcd10Codes(token)
          : Promise.resolve([] as readonly Icd10Code[]),
        window.elite.clinical.listDoctors(token),
        window.elite.clinical.listAppointments(
          token,
          getCalendarRange(calendarView, selectedDate).from,
          getCalendarRange(calendarView, selectedDate).to,
          calendarDoctorId || undefined,
        ),
        window.elite.clinical.listWaitlist(token, "active"),
      ]);
      setSpecialties(specialtyRows);
      setDepartments(departmentRows);
      setServices(serviceRows);
      setSchedules(scheduleRows);
      setExceptions(exceptionRows);
      setIcd10Codes(icd10Rows);
      setDoctors(doctorRows);
      setAppointments(appointmentRows);
      setWaitlistEntries(waitlistRows);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load clinical workflow data",
      );
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, calendarView, selectedDate, calendarDoctorId, canReadClinical]);

  const createAppointment = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedAppointmentPatient) {
      setError("Choose a patient before booking the appointment.");
      return;
    }
    const proposedStart = new Date(scheduledStart).getTime();
    const selectedService = services.find(
      (service) => service.id === serviceId,
    );
    const proposedDuration = selectedService?.durationMinutes ?? 15;
    const proposedEnd = proposedStart + proposedDuration * 60_000;
    const hasVisibleConflict = appointments.some((appointment) => {
      if (
        appointment.status === "cancelled" ||
        appointment.status === "no-show"
      ) {
        return false;
      }
      const appointmentStart = new Date(appointment.scheduledStart).getTime();
      const appointmentEnd = new Date(appointment.scheduledEnd).getTime();
      const samePatient =
        appointment.patientId === selectedAppointmentPatient.patientId;
      const sameDoctor =
        Boolean(appointmentDoctorId) &&
        appointment.doctorId === appointmentDoctorId;
      return (
        (samePatient || sameDoctor) &&
        proposedStart < appointmentEnd &&
        proposedEnd > appointmentStart
      );
    });
    if (hasVisibleConflict) {
      setError(
        t(
          "This patient or doctor already has an appointment at that time. Add the patient to the waitlist or choose another time.",
          "لدى هذا المريض أو الطبيب موعد آخر في هذا الوقت. أضف المريض إلى قائمة الانتظار أو اختر وقتاً آخر.",
        ),
      );
      setShowWaitlistForm(true);
      return;
    }
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input: AppointmentCreateInput = {
        patientId: selectedAppointmentPatient.patientId,
        departmentId,
        ...(appointmentDoctorId ? { doctorId: appointmentDoctorId } : {}),
        ...(serviceId ? { serviceId } : {}),
        scheduledStart: new Date(scheduledStart).toISOString(),
        visitType,
        isWalkIn: false,
      };
      await window.elite.clinical.createAppointment(token, input);
      const bookedPatientName = selectedAppointmentPatient.nameEn;
      setSelectedAppointmentPatient(null);
      setPatientId("");
      setScheduledStart("");
      setAppointmentStep(1);
      setNotice(`Appointment booked for ${bookedPatientName}.`);
      await refresh();
    } catch (reason: unknown) {
      setError(
        receptionistFriendlyError(
          reason,
          "The appointment could not be saved. Check the details and try again.",
        ),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const createWaitlist = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedAppointmentPatient) {
      setError(
        t(
          "Choose a patient before adding to the waitlist.",
          "اختر مريضاً قبل إضافته إلى قائمة الانتظار.",
        ),
      );
      return;
    }
    if (!departmentId) {
      setError(
        t(
          "Choose a clinic area before adding to the waitlist.",
          "اختر منطقة العيادة قبل إضافة المريض إلى قائمة الانتظار.",
        ),
      );
      return;
    }
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input: WaitlistEntryInput = {
        patientId: selectedAppointmentPatient.patientId,
        departmentId,
        ...(appointmentDoctorId ? { doctorId: appointmentDoctorId } : {}),
        ...(serviceId ? { serviceId } : {}),
        ...(waitlistDate ? { preferredDate: waitlistDate } : {}),
        ...(waitlistTime ? { preferredStartTime: waitlistTime } : {}),
        ...(waitlistNotes.trim() ? { notes: waitlistNotes.trim() } : {}),
      };
      await window.elite.clinical.createWaitlistEntry(token, input);
      setWaitlistDate("");
      setWaitlistTime("");
      setWaitlistNotes("");
      setShowWaitlistForm(false);
      setNotice(
        t(
          "Patient added to the waitlist.",
          "تمت إضافة المريض إلى قائمة الانتظار.",
        ),
      );
      await refresh();
    } catch (reason: unknown) {
      setError(
        receptionistFriendlyError(
          reason,
          t(
            "The patient could not be added to the waitlist. Check the details and try again.",
            "تعذرت إضافة المريض إلى قائمة الانتظار. راجع البيانات وحاول مرة أخرى.",
          ),
        ),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const updateWaitlist = async (
    entry: WaitlistEntry,
    status: WaitlistStatusUpdate["status"],
  ): Promise<void> => {
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      await window.elite.clinical.updateWaitlistStatus(token, entry.id, {
        status,
        reason: t(
          "Updated from front desk waitlist",
          "تم التحديث من قائمة انتظار الاستقبال",
        ),
      });
      setNotice(
        status === "contacted"
          ? t(
              "Waitlist entry marked as contacted.",
              "تم تسجيل التواصل مع المريض.",
            )
          : t("Waitlist entry cancelled.", "تم إلغاء إدخال قائمة الانتظار."),
      );
      await refresh();
    } catch (reason: unknown) {
      setError(
        receptionistFriendlyError(
          reason,
          t(
            "The waitlist entry could not be updated. Try again.",
            "تعذر تحديث إدخال قائمة الانتظار. حاول مرة أخرى.",
          ),
        ),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const updateStatus = async (
    appointment: Appointment,
    status: Appointment["status"],
    reason = "Updated from front desk appointment workspace",
  ): Promise<void> => {
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      await window.elite.clinical.updateAppointmentStatus(
        token,
        appointment.id,
        { status, reason },
      );
      await refresh();
      setNotice(
        status === "arrived"
          ? "Patient checked in successfully."
          : status === "no-show"
            ? "Appointment marked as no-show."
            : status === "cancelled"
              ? "Appointment cancelled."
              : "Appointment status updated.",
      );
    } catch (reason: unknown) {
      setError(
        receptionistFriendlyError(
          reason,
          "The appointment status could not be updated. Try again.",
        ),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const openEncounter = async (appointment: Appointment): Promise<void> => {
    setSelectedAppointment(appointment);
    setError(null);
    try {
      const encounter = await window.elite.clinical.getEncounterForAppointment(
        token,
        appointment.id,
      );
      const [effectiveEncounter, amendmentRows, diffRows, snapshotRows] =
        encounter
          ? await Promise.all([
              window.elite.clinical.getEffectiveEncounterForAppointment(
                token,
                appointment.id,
              ),
              window.elite.clinical.listAmendments(token, encounter.id),
              window.elite.clinical.listAmendmentDiffs(token, encounter.id),
              window.elite.clinical.listProjectionSnapshots(
                token,
                encounter.id,
              ),
            ])
          : [
              null,
              [] as readonly EncounterAmendment[],
              [] as readonly EncounterAmendmentDiff[],
              [] as readonly ProjectionSnapshot[],
            ];
      setSelectedEncounter(encounter);
      setSelectedEffectiveEncounter(effectiveEncounter);
      setAmendments(amendmentRows);
      setAmendmentDiffs(diffRows);
      setProjectionSnapshots(snapshotRows);
      setSnapshotExportReason("");
      setAmendmentForm(null);
      setAmendmentReviewReason("");
      setEncounterForm(
        canWriteClinical
          ? encounter
            ? {
                subjective: encounter.subjective ?? "",
                objective: encounter.objective ?? "",
                assessment: encounter.assessment ?? "",
                plan: encounter.plan ?? "",
                followUp: encounter.followUp ?? "",
              }
            : { ...emptyEncounterForm }
          : null,
      );
      setDiagnosisForm(null);
      setDiagnoses(
        encounter
          ? await window.elite.clinical.listDiagnoses(token, encounter.id)
          : [],
      );
    } catch (reason: unknown) {
      setSelectedEncounter(null);
      setSelectedEffectiveEncounter(null);
      setAmendments([]);
      setAmendmentDiffs([]);
      setProjectionSnapshots([]);
      setSnapshotExportReason("");
      setAmendmentForm(null);
      setAmendmentReviewReason("");
      setEncounterForm(null);
      setDiagnoses([]);
      setError(
        reason instanceof Error ? reason.message : "Unable to load encounter",
      );
    }
  };

  const refreshProjectionArtifacts = async (): Promise<void> => {
    if (!selectedEncounter || !selectedAppointment) return;
    const [effective, amendmentRows, diffRows, snapshotRows] =
      await Promise.all([
        window.elite.clinical.getEffectiveEncounterForAppointment(
          token,
          selectedAppointment.id,
        ),
        window.elite.clinical.listAmendments(token, selectedEncounter.id),
        window.elite.clinical.listAmendmentDiffs(token, selectedEncounter.id),
        window.elite.clinical.listProjectionSnapshots(
          token,
          selectedEncounter.id,
        ),
      ]);
    setSelectedEffectiveEncounter(effective);
    setAmendments(amendmentRows);
    setAmendmentDiffs(diffRows);
    setProjectionSnapshots(snapshotRows);
  };

  const createProjectionSnapshot = async (): Promise<void> => {
    if (!selectedEncounter || snapshotExportReason.trim().length < 3) {
      setError("Enter an export reason before creating a projection snapshot");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.createProjectionSnapshot(
        token,
        selectedEncounter.id,
        { exportReason: snapshotExportReason },
      );
      setSnapshotExportReason("");
      await refreshProjectionArtifacts();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create projection snapshot",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const exportPatientRecord = async (): Promise<void> => {
    if (!canExport) {
      setError("Your role is not authorized to export patient records");
      return;
    }
    const latestSnapshot = projectionSnapshots[0];
    if (!latestSnapshot) {
      setError("Create an immutable projection snapshot before exporting");
      return;
    }
    if (exportReason.trim().length < 3) {
      setError("Enter an export reason before creating a signed export");
      return;
    }
    if (exportRedactionPolicy === "full" && !canSensitiveExport) {
      setError("Full export requires the sensitive-export permission");
      return;
    }
    setIsBusy(true);
    setError(null);
    setExportVerification(null);
    try {
      const created = await window.elite.export.createExport(token, {
        snapshotId: latestSnapshot.id,
        format: exportFormat,
        redactionPolicy: exportRedactionPolicy,
        exportReason,
      });
      setExportResult(created);
      setExportReason("");
      setExportVerification(
        await window.elite.export.verifyExport({
          manifestJson: JSON.stringify(created.package.manifest),
          payloadBase64: created.package.payloadBase64,
        }),
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create signed export",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const validateFhirExport = async (): Promise<void> => {
    const latestSnapshot = projectionSnapshots[0];
    if (!latestSnapshot || exportReason.trim().length < 3) {
      setError(
        "Create a projection snapshot and enter an export reason before FHIR validation",
      );
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const result = await window.elite.export.validateFhir(token, {
        snapshotId: latestSnapshot.id,
        format: "fhir",
        redactionPolicy: exportRedactionPolicy,
        exportReason,
      });
      setFhirValidation(result);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to validate FHIR export",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const createZipPatientRecord = async (): Promise<void> => {
    if (!canExport) {
      setError("Your role is not authorized to export patient records");
      return;
    }
    const latestSnapshot = projectionSnapshots[0];
    if (!latestSnapshot || exportReason.trim().length < 3) {
      setError(
        "Create a projection snapshot and enter an export reason before creating a ZIP export",
      );
      return;
    }
    if (exportRedactionPolicy === "full" && !canSensitiveExport) {
      setError("Full export requires the sensitive-export permission");
      return;
    }
    setIsBusy(true);
    setError(null);
    setFhirValidation(null);
    try {
      const created = await window.elite.export.createZipExport(token, {
        snapshotId: latestSnapshot.id,
        format: exportFormat,
        redactionPolicy: exportRedactionPolicy,
        exportReason,
      });
      setZipExportResult(created);
      setFhirValidation(created.fhirValidation ?? null);
      setExportReason("");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create signed ZIP export",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const loadExportRegistry = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      const records = await window.elite.export.listRegistry(token, {
        limit: 100,
      });
      setExportRegistry(records);
      if (!selectedRegistryPackageId && records[0])
        setSelectedRegistryPackageId(records[0].packageId);
      setSigningKeys(await window.elite.export.listSigningKeys(token));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load export registry",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const transitionRegistryPackage = async (): Promise<void> => {
    if (
      !selectedRegistryPackageId ||
      registryTransitionReason.trim().length < 3
    )
      return;
    setIsBusy(true);
    setError(null);
    try {
      const current = exportRegistry.find(
        (record) => record.packageId === selectedRegistryPackageId,
      );
      if (!current) throw new Error("Export package is not selected");
      const nextStatus =
        current.status === "stored"
          ? "downloaded"
          : current.status === "downloaded"
            ? "archived"
            : "destroyed";
      const updated = await window.elite.export.transitionRegistry(token, {
        packageId: current.packageId,
        toStatus: nextStatus,
        reason: registryTransitionReason,
      });
      setExportRegistry(
        exportRegistry.map((record) =>
          record.packageId === updated.packageId ? updated : record,
        ),
      );
      setRegistryTransitionReason("");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to transition export package",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const rotateSigningKey = async (): Promise<void> => {
    if (keyRotationReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      const rotated = await window.elite.export.rotateSigningKey(
        token,
        keyRotationReason,
      );
      setSigningKeys([
        rotated,
        ...signingKeys.filter((key) => key.keyId !== rotated.keyId),
      ]);
      setKeyRotationReason("");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to rotate export signing key",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const exportSigningKeyRecovery = async (): Promise<void> => {
    if (recoveryPassphrase.length < 12) return;
    setIsBusy(true);
    setError(null);
    try {
      const bundle = await window.elite.export.exportSigningKeyRecovery(
        token,
        recoveryPassphrase,
      );
      setRecoveryBundleJson(JSON.stringify(bundle, null, 2));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to export signing-key recovery bundle",
      );
    } finally {
      setRecoveryPassphrase("");
      setIsBusy(false);
    }
  };

  const restoreSigningKeyRecovery = async (): Promise<void> => {
    if (recoveryPassphrase.length < 12 || recoveryBundleJson.trim().length < 2)
      return;
    setIsBusy(true);
    setError(null);
    try {
      const restored = await window.elite.export.restoreSigningKeyRecovery(
        token,
        JSON.parse(recoveryBundleJson) as ExportSigningKeyRecoveryBundle,
        recoveryPassphrase,
      );
      setSigningKeys(await window.elite.export.listSigningKeys(token));
      setRecoveryBundleJson("");
      setError(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to restore signing-key recovery bundle",
      );
    } finally {
      setRecoveryPassphrase("");
      setIsBusy(false);
    }
  };

  const loadGovernance = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      const [recipients, evidence, disclosures, receipts] = await Promise.all([
        window.elite.export.listRecipients(token),
        window.elite.export.listConsentEvidence(token, patientId || undefined),
        window.elite.export.listDisclosures(token),
        window.elite.export.listReceipts(token),
      ]);
      setGovernanceRecipients(recipients);
      setGovernanceEvidence(evidence);
      setGovernanceDisclosures(disclosures);
      setGovernanceReceipts(receipts);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load export governance data",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const createGovernanceRecipient = async (): Promise<void> => {
    if (recipientDisplayName.trim().length < 1) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.createRecipient(token, {
        displayName: recipientDisplayName,
        organizationName: recipientOrganizationName || undefined,
        category: recipientCategory,
        contactChannel: recipientContactChannel || undefined,
      });
      setRecipientDisplayName("");
      setRecipientOrganizationName("");
      setRecipientContactChannel("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to create recipient",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const verifyFirstRecipient = async (): Promise<void> => {
    const recipient = governanceRecipients.find(
      (candidate) => candidate.verificationStatus === "unverified",
    );
    if (!recipient || governanceReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.verifyRecipient(
        token,
        recipient.id,
        "verified",
        governanceReason,
      );
      setGovernanceReason("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to verify recipient",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const createGovernanceEvidence = async (): Promise<void> => {
    if (
      patientId.trim().length < 3 ||
      governanceEvidenceReference.trim().length < 1
    )
      return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.createConsentEvidence(token, {
        patientId,
        evidenceType: "patient-consent",
        sourceReference: governanceEvidenceReference,
      });
      setGovernanceEvidenceReference("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to record consent evidence",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const approveFirstEvidence = async (): Promise<void> => {
    const evidence = governanceEvidence.find(
      (candidate) => candidate.status === "pending",
    );
    if (!evidence || governanceReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.reviewConsentEvidence(
        token,
        evidence.id,
        "approve",
        governanceReason,
      );
      setGovernanceReason("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to approve consent evidence",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const requestFirstDisclosure = async (): Promise<void> => {
    const packageId = selectedRegistryPackageId;
    const recipient = governanceRecipients.find(
      (candidate) => candidate.verificationStatus === "verified",
    );
    const evidence = governanceEvidence.find(
      (candidate) => candidate.status === "approved",
    );
    if (
      !packageId ||
      !recipient ||
      !evidence ||
      governanceReason.trim().length < 3
    )
      return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.requestDisclosure(token, {
        packageId,
        recipientId: recipient.id,
        purposeOfUse: "referral",
        deliveryMethod: "usb",
        consentEvidenceId: evidence.id,
        reason: governanceReason,
      });
      setGovernanceReason("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to request disclosure",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const advanceFirstDisclosure = async (): Promise<void> => {
    const disclosure = governanceDisclosures.find(
      (candidate) =>
        candidate.status === "requested" || candidate.status === "approved",
    );
    if (!disclosure || governanceReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      if (disclosure.status === "requested") {
        await window.elite.export.decideDisclosure(token, {
          disclosureId: disclosure.id,
          decision: "approve",
          reason: governanceReason,
        });
      } else {
        await window.elite.export.sendDisclosure(
          token,
          disclosure.id,
          governanceReason,
        );
      }
      setGovernanceReason("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to advance disclosure",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const issueFirstReceipt = async (): Promise<void> => {
    const disclosure = governanceDisclosures.find(
      (candidate) => candidate.status === "sent",
    );
    if (!disclosure) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.issueReceipt(token, disclosure.id);
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to issue export receipt",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const acknowledgeFirstReceipt = async (): Promise<void> => {
    const receipt = governanceReceipts.find(
      (candidate) => !candidate.acknowledgedAt,
    );
    if (!receipt || governanceReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.acknowledgeReceipt(
        token,
        receipt.id,
        governanceReason,
      );
      setGovernanceReason("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to acknowledge receipt",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const loadOrganizationSettings = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      const settings = await window.elite.settings.getOrgSettings(token);
      setOrgSettings(settings);
      setOrgSettingsForm({
        clinicNameEn: settings.clinicNameEn,
        countryCode: settings.countryCode,
        oid: settings.oid,
        fhirSystemUrl: settings.fhirSystemUrl,
        exportExpirationDays: settings.exportExpirationDays,
        sessionTtlMinutes: settings.sessionTtlMinutes,
        fhirProfileBundleId: settings.fhirProfileBundleId,
      });
      setFhirProfiles(
        await window.elite.settings.listFhirProfileBundles(token),
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load organization settings",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const installFhirProfileBundle = async (): Promise<void> => {
    if (fhirProfileBundleJson.trim().length < 2) {
      setError("Paste a FHIR profile bundle JSON document before installing");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const bundle = JSON.parse(fhirProfileBundleJson) as FhirProfileBundle;
      const installed = await window.elite.settings.installFhirProfileBundle(
        token,
        bundle,
      );
      setFhirProfiles([
        installed,
        ...fhirProfiles.filter((profile) => profile.id !== installed.id),
      ]);
      setOrgSettingsForm({
        ...orgSettingsForm,
        fhirProfileBundleId: installed.id,
      });
      setFhirProfileBundleJson("");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to install FHIR profile bundle",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const saveOrganizationSettings = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      const settings = await window.elite.settings.updateOrgSettings(
        token,
        orgSettingsForm,
      );
      setOrgSettings(settings);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to update organization settings",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const revokeLatestZipExport = async (): Promise<void> => {
    if (!zipExportResult || revocationReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      const revocation = await window.elite.export.revokeExport(
        token,
        zipExportResult.package.packageId,
        revocationReason,
      );
      setRevocations([revocation, ...revocations]);
      setZipExportResult({
        ...zipExportResult,
        verification: {
          ...zipExportResult.verification,
          verified: false,
          revoked: true,
          reason: "ZIP package has been revoked.",
        },
      });
      setRevocationReason("");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to revoke export package",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const openAmendmentForm = (): void => {
    if (!selectedEncounter || selectedEncounter.status !== "signed") return;
    setAmendmentForm({
      subjective: selectedEncounter.subjective ?? "",
      objective: selectedEncounter.objective ?? "",
      assessment: selectedEncounter.assessment ?? "",
      plan: selectedEncounter.plan ?? "",
      followUp: selectedEncounter.followUp ?? "",
      correctionReason: "",
    });
    setError(null);
  };

  const saveAmendment = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedEncounter || !amendmentForm) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.createAmendment(
        token,
        selectedEncounter.id,
        amendmentForm,
      );
      setAmendments(
        await window.elite.clinical.listAmendments(token, selectedEncounter.id),
      );
      setAmendmentForm(null);
      await refreshProjectionArtifacts();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to request amendment",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const reviewAmendment = async (
    amendment: EncounterAmendment,
    decision: "approved" | "rejected",
  ): Promise<void> => {
    if (amendmentReviewReason.trim().length < 3) {
      setError("Enter a reason before reviewing the amendment");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.reviewAmendment(
        token,
        amendment.id,
        decision,
        amendmentReviewReason,
        amendment.version,
      );
      setAmendmentReviewReason("");
      if (selectedEncounter) {
        setAmendments(
          await window.elite.clinical.listAmendments(
            token,
            selectedEncounter.id,
          ),
        );
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to review amendment",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const resolveAmendmentConflict = async (
    amendment: EncounterAmendment,
    resolution: "rebase" | "reject",
  ): Promise<void> => {
    if (amendmentReviewReason.trim().length < 3) {
      setError("Enter a reason before resolving the amendment conflict");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.resolveAmendmentConflict(
        token,
        amendment.id,
        resolution,
        amendmentReviewReason,
        amendment.version,
      );
      setAmendmentReviewReason("");
      if (selectedEncounter) {
        setAmendments(
          await window.elite.clinical.listAmendments(
            token,
            selectedEncounter.id,
          ),
        );
      }
      await refreshProjectionArtifacts();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to resolve amendment conflict",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const applyAmendment = async (
    amendment: EncounterAmendment,
  ): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.applyAmendment(
        token,
        amendment.id,
        amendment.version,
      );
      if (selectedEncounter) {
        setAmendments(
          await window.elite.clinical.listAmendments(
            token,
            selectedEncounter.id,
          ),
        );
        setSelectedEffectiveEncounter(
          await window.elite.clinical.getEffectiveEncounterForAppointment(
            token,
            selectedAppointment?.id ?? "",
          ),
        );
      }
      await refreshProjectionArtifacts();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to apply amendment",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const saveEncounter = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedAppointment || !encounterForm) return;
    setIsBusy(true);
    setError(null);
    try {
      const saved = selectedEncounter
        ? await window.elite.clinical.updateEncounter(
            token,
            selectedEncounter.id,
            encounterForm,
            selectedEncounter.version,
          )
        : await window.elite.clinical.createEncounter(
            token,
            selectedAppointment.id,
            encounterForm,
          );
      setSelectedEncounter(saved);
      setSelectedEffectiveEncounter(
        await window.elite.clinical.getEffectiveEncounterForAppointment(
          token,
          selectedAppointment.id,
        ),
      );
      setEncounterForm({
        subjective: saved.subjective ?? "",
        objective: saved.objective ?? "",
        assessment: saved.assessment ?? "",
        plan: saved.plan ?? "",
        followUp: saved.followUp ?? "",
      });
      setDiagnoses(await window.elite.clinical.listDiagnoses(token, saved.id));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save encounter",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const signSelectedEncounter = async (): Promise<void> => {
    if (!selectedEncounter) return;
    setIsBusy(true);
    setError(null);
    try {
      const signed = await window.elite.clinical.signEncounter(
        token,
        selectedEncounter.id,
        selectedEncounter.version,
      );
      setSelectedEncounter(signed);
      setSelectedEffectiveEncounter(
        await window.elite.clinical.getEffectiveEncounterForAppointment(
          token,
          selectedAppointment?.id ?? "",
        ),
      );
      setEncounterForm(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to sign encounter",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const saveDiagnosis = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedEncounter || !diagnosisForm) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.createDiagnosis(
        token,
        selectedEncounter.id,
        diagnosisForm,
      );
      setDiagnoses(
        await window.elite.clinical.listDiagnoses(token, selectedEncounter.id),
      );
      setDiagnosisForm(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to record diagnosis",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const reviewDiagnosis = async (
    diagnosis: Diagnosis,
    decision: "approved" | "rejected",
  ): Promise<void> => {
    if (diagnosisReviewReason.trim().length < 3) {
      setError("Enter a reason before reviewing the diagnosis");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.approveDiagnosis(
        token,
        diagnosis.id,
        decision,
        diagnosisReviewReason,
        diagnosis.version,
      );
      setDiagnosisReviewReason("");
      if (selectedEncounter) {
        setDiagnoses(
          await window.elite.clinical.listDiagnoses(
            token,
            selectedEncounter.id,
          ),
        );
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to review diagnosis",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const createIcd10Code = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const input: Icd10CodeInput = {
      code: icd10Code,
      titleEn: icd10Title,
      releaseVersion: icd10Release,
    };
    await manage(async () => {
      await window.elite.clinical.createIcd10Code(token, input);
      setIcd10Code("");
      setIcd10Title("");
      setIcd10Release("");
    });
  };

  const navigateCalendar = (direction: -1 | 1): void => {
    const date = parseLocalDate(selectedDate);
    const amount = calendarView === "month" ? 1 : 7;
    setSelectedDate(formatLocalDate(addCalendarDays(date, direction * amount)));
  };

  const goToToday = (): void => setSelectedDate(formatLocalDate(new Date()));

  const doctorLabel = (id: string): string =>
    doctors.find((doctor) => doctor.id === id)?.displayNameEn ?? id;

  const createSchedule = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const input: ScheduleInput = {
      doctorId,
      departmentId: scheduleDepartmentId,
      dayOfWeek: Number(scheduleDay),
      startTime: scheduleStart,
      endTime: scheduleEnd,
      slotDurationMinutes: Number(slotDuration),
    };
    await manage(() => window.elite.clinical.createSchedule(token, input));
  };

  const createException = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const input: ScheduleExceptionInput = {
      ...(exceptionDoctorId.trim()
        ? { doctorId: exceptionDoctorId.trim() }
        : {}),
      ...(exceptionDepartmentId ? { departmentId: exceptionDepartmentId } : {}),
      exceptionDate,
      kind: exceptionKind,
      ...(exceptionKind === "open" && exceptionStart
        ? { startTime: exceptionStart }
        : {}),
      ...(exceptionKind === "open" && exceptionEnd
        ? { endTime: exceptionEnd }
        : {}),
      reason: exceptionReason,
    };
    await manage(() => window.elite.clinical.createException(token, input));
  };

  const deleteSchedule = async (id: string): Promise<void> => {
    await manage(() =>
      window.elite.clinical.deleteSchedule(
        token,
        id,
        "Removed from Admin schedule controls",
      ),
    );
  };

  const deleteException = async (id: string): Promise<void> => {
    await manage(() =>
      window.elite.clinical.deleteException(
        token,
        id,
        "Removed from Admin exception controls",
      ),
    );
  };

  const manage = async (action: () => Promise<unknown>): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to update clinical configuration",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const appointmentsForDate = (dateKey: string): readonly Appointment[] =>
    appointments.filter(
      (appointment) =>
        formatLocalDate(new Date(appointment.scheduledStart)) === dateKey,
    );
  const monthGridDays = getMonthGridDays(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addCalendarDays(startOfClinicWeek(parseLocalDate(selectedDate)), index),
  );
  const selectedMonth = parseLocalDate(selectedDate).getMonth();
  const displayedEncounter = selectedEffectiveEncounter ?? selectedEncounter;
  const continueAppointmentWizard = (): void => {
    if (appointmentStep === 1 && !selectedAppointmentPatient) {
      setError("Choose a patient before continuing.");
      return;
    }
    if (appointmentStep === 2 && !departmentId) {
      setError("Choose a department before continuing.");
      return;
    }
    if (appointmentStep === 3 && !scheduledStart) {
      setError("Choose the appointment date and time before continuing.");
      return;
    }
    setError(null);
    setAppointmentStep((current) =>
      current < 4 ? ((current + 1) as 1 | 2 | 3 | 4) : current,
    );
  };
  const previousAppointmentStep = (): void => {
    setError(null);
    setAppointmentStep((current) =>
      current > 1 ? ((current - 1) as 1 | 2 | 3 | 4) : current,
    );
  };

  return (
    <section
      className="card clinical-workflow-card"
      aria-labelledby="clinical-workflow-title"
    >
      <span id="workspace-records" className="workspace-anchor" />
      <span id="workspace-settings" className="workspace-anchor" />
      <div className="card-heading">
        <div>
          <p className="eyebrow">{t("Front desk", "الاستقبال")}</p>
          <h2 id="clinical-workflow-title">
            {t("Appointments and check-in", "المواعيد وتسجيل الوصول")}
          </h2>
        </div>
        <span className="status ok">
          {t("Saved on this computer", "محفوظ على هذا الكمبيوتر")}
        </span>
      </div>
      <ErrorMessage message={error} />
      {notice ? (
        <p className="success" role="status">
          {notice}
        </p>
      ) : null}
      <form
        className="appointment-form appointment-wizard"
        onSubmit={(event) => void createAppointment(event)}
      >
        <div className="appointment-wizard-heading">
          <div>
            <p className="eyebrow">
              {t(
                `Step ${appointmentStep} of 4`,
                `الخطوة ${appointmentStep} من 4`,
              )}
            </p>
            <h3>{t("Book an appointment", "حجز موعد")}</h3>
          </div>
          <ol
            className="appointment-wizard-steps"
            aria-label={t("Appointment steps", "خطوات حجز الموعد")}
          >
            {[
              t("Patient", "المريض"),
              t("Doctor and service", "الطبيب والخدمة"),
              t("Date and time", "التاريخ والوقت"),
              t("Confirm", "تأكيد"),
            ].map((step, index) => (
              <li
                className={
                  appointmentStep === index + 1
                    ? "is-active"
                    : appointmentStep > index + 1
                      ? "is-complete"
                      : ""
                }
                key={step}
              >
                <span>{index + 1}</span>
                <small>{step}</small>
              </li>
            ))}
          </ol>
        </div>
        {appointmentStep === 1 ? (
          <PatientLookup
            token={token}
            selectedPatient={selectedAppointmentPatient}
            onSelect={(patient) => {
              setSelectedAppointmentPatient(patient);
              setPatientId(patient.patientId);
              setError(null);
            }}
            onClear={() => {
              setSelectedAppointmentPatient(null);
              setPatientId("");
            }}
            label={t(
              "Which patient is this appointment for?",
              "لأي مريض هذا الموعد؟",
            )}
            helper={t(
              "Search by the patient’s name, phone, or patient number.",
              "ابحث باسم المريض أو هاتفه أو رقم المريض.",
            )}
          />
        ) : null}
        {appointmentStep === 2 ? (
          <div className="form-grid">
            <label>
              {t("Clinic area", "منطقة العيادة")}
              <select
                required
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="">
                  {t("Select clinic area", "اختر منطقة العيادة")}
                </option>
                {departments
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameEn}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("Doctor", "الطبيب")}
              <select
                value={appointmentDoctorId}
                onChange={(event) => setAppointmentDoctorId(event.target.value)}
              >
                <option value="">
                  {t("Any available doctor", "أي طبيب متاح")}
                </option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.displayNameEn}
                    {doctor.isClinicalApprover ? " · Approver" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Visit type or treatment", "نوع الزيارة أو العلاج")}
              <select
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
              >
                <option value="">
                  {t("Default 15-minute slot", "موعد افتراضي 15 دقيقة")}
                </option>
                {services
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameEn} · {item.durationMinutes} min · EGP{" "}
                      {item.priceEgp}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        ) : null}
        {appointmentStep === 3 ? (
          <div className="form-grid">
            <label>
              {t("Visit type", "نوع الزيارة")}
              <select
                required
                value={visitType}
                onChange={(event) => setVisitType(event.target.value)}
              >
                <option value="consultation">
                  {t("Consultation", "استشارة")}
                </option>
                <option value="follow-up">{t("Follow-up", "متابعة")}</option>
                <option value="procedure">{t("Procedure", "إجراء")}</option>
                <option value="other">{t("Other", "أخرى")}</option>
              </select>
            </label>
            <label>
              {t("Start time", "وقت البداية")}
              <input
                required
                type="datetime-local"
                value={scheduledStart}
                onChange={(event) => setScheduledStart(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        {appointmentStep === 4 ? (
          <div className="appointment-confirmation">
            <h4>
              {t(
                "Check the appointment before saving",
                "راجع الموعد قبل الحفظ",
              )}
            </h4>
            <dl className="status-grid">
              <div>
                <dt>{t("Patient", "المريض")}</dt>
                <dd>
                  {selectedAppointmentPatient?.nameEn ??
                    t("Not selected", "لم يتم الاختيار")}
                </dd>
              </div>
              <div>
                <dt>{t("Clinic area", "منطقة العيادة")}</dt>
                <dd>
                  {departments.find((item) => item.id === departmentId)
                    ?.nameEn ?? t("Not selected", "لم يتم الاختيار")}
                </dd>
              </div>
              <div>
                <dt>{t("Doctor", "الطبيب")}</dt>
                <dd>
                  {doctors.find((item) => item.id === appointmentDoctorId)
                    ?.displayNameEn ??
                    t("Any available doctor", "أي طبيب متاح")}
                </dd>
              </div>
              <div>
                <dt>{t("When", "الموعد")}</dt>
                <dd>
                  {scheduledStart
                    ? new Date(scheduledStart).toLocaleString()
                    : t("Not selected", "لم يتم الاختيار")}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
        <div className="button-row appointment-wizard-actions">
          {appointmentStep > 1 ? (
            <button
              className="button secondary"
              type="button"
              onClick={previousAppointmentStep}
            >
              {t("Back", "رجوع")}
            </button>
          ) : null}
          {appointmentStep < 4 ? (
            <button
              className="button primary"
              type="button"
              onClick={continueAppointmentWizard}
            >
              {t("Continue", "متابعة")}
            </button>
          ) : (
            <button className="button primary" type="submit" disabled={isBusy}>
              {t("Book appointment", "حجز الموعد")}
            </button>
          )}
        </div>
      </form>
      {canWriteAppointments ? (
        <section className="waitlist-panel" aria-labelledby="waitlist-title">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                {t("No suitable slot?", "لا يوجد موعد مناسب؟")}
              </p>
              <h3 id="waitlist-title">{t("Waitlist", "قائمة الانتظار")}</h3>
            </div>
            <span className="status info">{waitlistEntries.length}</span>
          </div>
          <p className="form-help">
            {t(
              "Keep the patient’s request safely recorded and contact them when a suitable slot opens.",
              "احتفظ بطلب المريض بأمان وتواصل معه عند توفر موعد مناسب.",
            )}
          </p>
          {!showWaitlistForm ? (
            <button
              className="button secondary"
              type="button"
              onClick={() => setShowWaitlistForm(true)}
            >
              {t("Add patient to waitlist", "إضافة المريض إلى قائمة الانتظار")}
            </button>
          ) : (
            <form
              className="form-section waitlist-form"
              onSubmit={(event) => void createWaitlist(event)}
            >
              {!selectedAppointmentPatient ? (
                <PatientLookup
                  token={token}
                  selectedPatient={selectedAppointmentPatient}
                  onSelect={(patient) => {
                    setSelectedAppointmentPatient(patient);
                    setPatientId(patient.patientId);
                  }}
                  onClear={() => {
                    setSelectedAppointmentPatient(null);
                    setPatientId("");
                  }}
                  label={t(
                    "Which patient should wait for a slot?",
                    "أي مريض ينتظر موعداً؟",
                  )}
                  helper={t(
                    "Search by name, phone, or patient number.",
                    "ابحث بالاسم أو الهاتف أو رقم المريض.",
                  )}
                />
              ) : null}
              <div className="form-grid">
                <label>
                  {t("Preferred date (optional)", "التاريخ المفضل (اختياري)")}
                  <input
                    type="date"
                    value={waitlistDate}
                    onChange={(event) => setWaitlistDate(event.target.value)}
                  />
                </label>
                <label>
                  {t("Preferred time (optional)", "الوقت المفضل (اختياري)")}
                  <input
                    type="time"
                    value={waitlistTime}
                    onChange={(event) => setWaitlistTime(event.target.value)}
                  />
                </label>
                <label>
                  {t("Notes (optional)", "ملاحظات (اختياري)")}
                  <input
                    value={waitlistNotes}
                    onChange={(event) => setWaitlistNotes(event.target.value)}
                  />
                </label>
              </div>
              <div className="button-row">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setShowWaitlistForm(false)}
                >
                  {t("Cancel", "إلغاء")}
                </button>
                <button
                  className="button primary"
                  type="submit"
                  disabled={isBusy || !selectedAppointmentPatient}
                >
                  {t("Save to waitlist", "حفظ في قائمة الانتظار")}
                </button>
              </div>
            </form>
          )}
          <div className="waitlist-list" aria-live="polite">
            {waitlistEntries.length === 0 ? (
              <p className="muted">
                {t(
                  "No active waitlist entries.",
                  "لا توجد طلبات نشطة في قائمة الانتظار.",
                )}
              </p>
            ) : (
              waitlistEntries.map((entry) => (
                <article className="waitlist-row" key={entry.id}>
                  <div>
                    <strong>
                      <BidiValue direction="ltr">{entry.patientId}</BidiValue>
                    </strong>
                    <span>
                      {entry.preferredDate ?? t("Any date", "أي تاريخ")}
                      {entry.preferredStartTime
                        ? ` · ${entry.preferredStartTime}`
                        : ""}
                    </span>
                    {entry.notes ? <small>{entry.notes}</small> : null}
                  </div>
                  <div className="button-row">
                    <button
                      className="button small secondary"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void updateWaitlist(entry, "contacted")}
                    >
                      {t("Contacted", "تم التواصل")}
                    </button>
                    <button
                      className="button small danger"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void updateWaitlist(entry, "cancelled")}
                    >
                      {t("Remove", "إزالة")}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}
      {canManage ? (
        <>
          <div className="clinical-config-grid">
            <form
              className="clinical-config-form"
              onSubmit={(event) => {
                event.preventDefault();
                void manage(() =>
                  window.elite.clinical.createSpecialty(token, {
                    code: specialtyCode,
                    nameEn: specialtyName,
                  }),
                );
              }}
            >
              <h3>Specialty</h3>
              <input
                required
                placeholder="Code"
                value={specialtyCode}
                onChange={(event) => setSpecialtyCode(event.target.value)}
              />
              <input
                required
                placeholder="English name"
                value={specialtyName}
                onChange={(event) => setSpecialtyName(event.target.value)}
              />
              <button
                className="button secondary"
                type="submit"
                disabled={isBusy}
              >
                Add specialty
              </button>
            </form>
            <form
              className="clinical-config-form"
              onSubmit={(event) => {
                event.preventDefault();
                void manage(() =>
                  window.elite.clinical.createDepartment(token, {
                    specialtyId: specialties[0]?.id ?? "",
                    code: departmentCode,
                    nameEn: departmentName,
                  }),
                );
              }}
            >
              <h3>Department</h3>
              <select
                required
                value={specialties[0]?.id ?? ""}
                onChange={() => undefined}
              >
                {specialties
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameEn}
                    </option>
                  ))}
              </select>
              <input
                required
                placeholder="Code"
                value={departmentCode}
                onChange={(event) => setDepartmentCode(event.target.value)}
              />
              <input
                required
                placeholder="English name"
                value={departmentName}
                onChange={(event) => setDepartmentName(event.target.value)}
              />
              <button
                className="button secondary"
                type="submit"
                disabled={isBusy}
              >
                Add department
              </button>
            </form>
            <form
              className="clinical-config-form"
              onSubmit={(event) => {
                event.preventDefault();
                void manage(() =>
                  window.elite.clinical.createService(token, {
                    departmentId: departments[0]?.id ?? "",
                    code: serviceCode,
                    nameEn: serviceName,
                    durationMinutes: 15,
                    priceEgp: 0,
                  }),
                );
              }}
            >
              <h3>Service catalog</h3>
              <select
                required
                value={departments[0]?.id ?? ""}
                onChange={() => undefined}
              >
                {departments
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameEn}
                    </option>
                  ))}
              </select>
              <input
                required
                placeholder="Code"
                value={serviceCode}
                onChange={(event) => setServiceCode(event.target.value)}
              />
              <input
                required
                placeholder="English name"
                value={serviceName}
                onChange={(event) => setServiceName(event.target.value)}
              />
              <button
                className="button secondary"
                type="submit"
                disabled={isBusy}
              >
                Add service
              </button>
            </form>
            <form
              className="clinical-config-form"
              onSubmit={(event) => void createIcd10Code(event)}
            >
              <h3>ICD-10 catalog</h3>
              <input
                required
                placeholder="ICD-10 code, e.g. J06.9"
                value={icd10Code}
                onChange={(event) => setIcd10Code(event.target.value)}
              />
              <input
                required
                placeholder="English diagnosis title"
                value={icd10Title}
                onChange={(event) => setIcd10Title(event.target.value)}
              />
              <input
                required
                placeholder="Release version"
                value={icd10Release}
                onChange={(event) => setIcd10Release(event.target.value)}
              />
              <small className="muted">
                {icd10Codes.length} active catalog codes available locally.
              </small>
              <button
                className="button secondary"
                type="submit"
                disabled={isBusy}
              >
                Add ICD-10 code
              </button>
            </form>
            <form
              className="clinical-config-form"
              onSubmit={(event) => void createSchedule(event)}
            >
              <h3>Doctor recurring schedule</h3>
              <select
                required
                value={doctorId}
                onChange={(event) => setDoctorId(event.target.value)}
              >
                <option value="">Select doctor</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.displayNameEn}
                  </option>
                ))}
              </select>
              <select
                required
                value={scheduleDepartmentId}
                onChange={(event) =>
                  setScheduleDepartmentId(event.target.value)
                }
              >
                <option value="">Department</option>
                {departments
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameEn}
                    </option>
                  ))}
              </select>
              <select
                value={scheduleDay}
                onChange={(event) => setScheduleDay(event.target.value)}
              >
                <option value="6">Saturday</option>
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
              </select>
              <div className="inline-fields">
                <input
                  required
                  type="time"
                  value={scheduleStart}
                  onChange={(event) => setScheduleStart(event.target.value)}
                />
                <input
                  required
                  type="time"
                  value={scheduleEnd}
                  onChange={(event) => setScheduleEnd(event.target.value)}
                />
                <input
                  required
                  type="number"
                  min="5"
                  max="480"
                  value={slotDuration}
                  onChange={(event) => setSlotDuration(event.target.value)}
                />
              </div>
              <button
                className="button secondary"
                type="submit"
                disabled={isBusy}
              >
                Add recurring schedule
              </button>
            </form>
            <form
              className="clinical-config-form"
              onSubmit={(event) => void createException(event)}
            >
              <h3>Holiday / leave / closure exception</h3>
              <input
                type="date"
                required
                value={exceptionDate}
                onChange={(event) => setExceptionDate(event.target.value)}
              />
              <select
                value={exceptionDoctorId}
                onChange={(event) => setExceptionDoctorId(event.target.value)}
              >
                <option value="">Doctor scope (optional)</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.displayNameEn}
                  </option>
                ))}
              </select>
              <select
                value={exceptionDepartmentId}
                onChange={(event) =>
                  setExceptionDepartmentId(event.target.value)
                }
              >
                <option value="">Department scope (optional)</option>
                {departments
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameEn}
                    </option>
                  ))}
              </select>
              <select
                value={exceptionKind}
                onChange={(event) =>
                  setExceptionKind(event.target.value as "closed" | "open")
                }
              >
                <option value="closed">Closed</option>
                <option value="open">Open override</option>
              </select>
              {exceptionKind === "open" ? (
                <div className="inline-fields">
                  <input
                    required
                    type="time"
                    value={exceptionStart}
                    onChange={(event) => setExceptionStart(event.target.value)}
                  />
                  <input
                    required
                    type="time"
                    value={exceptionEnd}
                    onChange={(event) => setExceptionEnd(event.target.value)}
                  />
                </div>
              ) : null}
              <input
                required
                placeholder="Reason"
                value={exceptionReason}
                onChange={(event) => setExceptionReason(event.target.value)}
              />
              <button
                className="button secondary"
                type="submit"
                disabled={isBusy}
              >
                Add exception
              </button>
            </form>
          </div>
          <div className="schedule-management-list">
            <h3>Configured recurring schedules</h3>
            {schedules.length === 0 ? (
              <p className="muted">No recurring schedules configured.</p>
            ) : (
              schedules.map((schedule) => (
                <article className="schedule-row" key={schedule.id}>
                  <div>
                    <strong>{schedule.doctorId}</strong>
                    <span>
                      {schedule.startTime}–{schedule.endTime} · day{" "}
                      {schedule.dayOfWeek} · {schedule.slotDurationMinutes} min
                    </span>
                    <small>{schedule.departmentId}</small>
                  </div>
                  <button
                    className="button danger"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void deleteSchedule(schedule.id)}
                  >
                    Remove
                  </button>
                </article>
              ))
            )}
            <h3>Configured exceptions</h3>
            {exceptions.length === 0 ? (
              <p className="muted">No schedule exceptions configured.</p>
            ) : (
              exceptions.map((exception) => (
                <article className="schedule-row" key={exception.id}>
                  <div>
                    <strong>
                      {exception.exceptionDate} · {exception.kind}
                    </strong>
                    <span>
                      {exception.doctorId ?? "Department scope"} ·{" "}
                      {exception.reason}
                    </span>
                  </div>
                  <button
                    className="button danger"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void deleteException(exception.id)}
                  >
                    Remove
                  </button>
                </article>
              ))
            )}
          </div>
        </>
      ) : null}
      <section className="calendar-panel" aria-labelledby="calendar-title">
        <div className="calendar-toolbar">
          <div>
            <p className="eyebrow">Schedule calendar</p>
            <h3 id="calendar-title">
              {formatCalendarHeading(calendarView, selectedDate)}
            </h3>
          </div>
          <div className="calendar-actions">
            <button
              className="button secondary"
              type="button"
              disabled={isBusy}
              onClick={() => navigateCalendar(-1)}
            >
              Previous
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={isBusy}
              onClick={goToToday}
            >
              Today
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={isBusy}
              onClick={() => navigateCalendar(1)}
            >
              Next
            </button>
          </div>
        </div>
        <div className="calendar-filters">
          <label>
            View
            <select
              value={calendarView}
              onChange={(event) =>
                setCalendarView(event.target.value as CalendarView)
              }
            >
              <option value="month">Month</option>
              <option value="week">Week</option>
              <option value="day">Day</option>
            </select>
          </label>
          <label>
            Focus date
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
          <label>
            Doctor
            <select
              value={calendarDoctorId}
              onChange={(event) => setCalendarDoctorId(event.target.value)}
            >
              <option value="">All doctors</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.displayNameEn}
                </option>
              ))}
            </select>
          </label>
        </div>
        {calendarView === "month" ? (
          <div className="calendar-month-grid">
            {CALENDAR_DAY_NAMES.map((dayName) => (
              <div className="calendar-weekday" key={dayName}>
                {dayName.slice(0, 3)}
              </div>
            ))}
            {monthGridDays.map((day) => {
              const dayKey = formatLocalDate(day);
              const dayAppointments = appointmentsForDate(dayKey);
              return (
                <button
                  className={`calendar-day${day.getMonth() !== selectedMonth ? " outside-month" : ""}${dayKey === selectedDate ? " selected-day" : ""}`}
                  key={dayKey}
                  type="button"
                  onClick={() => {
                    setSelectedDate(dayKey);
                    setCalendarView("day");
                  }}
                >
                  <strong>{day.getDate()}</strong>
                  <span className="calendar-day-count">
                    {dayAppointments.length} appointment
                    {dayAppointments.length === 1 ? "" : "s"}
                  </span>
                  {dayAppointments.slice(0, 3).map((appointment) => (
                    <span
                      className="calendar-appointment-chip"
                      key={appointment.id}
                    >
                      {new Date(appointment.scheduledStart).toLocaleTimeString(
                        undefined,
                        { hour: "2-digit", minute: "2-digit" },
                      )}{" "}
                      · {appointment.patientId}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        ) : calendarView === "week" ? (
          <div className="calendar-week-grid">
            {weekDays.map((day) => {
              const dayKey = formatLocalDate(day);
              return (
                <div className="calendar-week-column" key={dayKey}>
                  <button
                    className={`calendar-column-heading${dayKey === selectedDate ? " selected-day" : ""}`}
                    type="button"
                    onClick={() => {
                      setSelectedDate(dayKey);
                      setCalendarView("day");
                    }}
                  >
                    <strong>
                      {day.toLocaleDateString(undefined, { weekday: "short" })}
                    </strong>
                    <span>
                      {day.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </button>
                  <div className="calendar-column-appointments">
                    {appointmentsForDate(dayKey).length === 0 ? (
                      <span className="muted">No visits</span>
                    ) : (
                      appointmentsForDate(dayKey).map((appointment) => (
                        <article
                          className="calendar-appointment-card"
                          key={appointment.id}
                        >
                          <strong>
                            {new Date(
                              appointment.scheduledStart,
                            ).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </strong>
                          <span>{appointment.patientId}</span>
                          <small>
                            {appointment.status} · {appointment.durationMinutes}{" "}
                            min
                          </small>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="calendar-day-view">
            {appointmentsForDate(selectedDate).length === 0 ? (
              <p className="muted">No appointments for this day.</p>
            ) : (
              appointmentsForDate(selectedDate).map((appointment) => (
                <article
                  className="calendar-day-appointment"
                  key={appointment.id}
                >
                  <div>
                    <strong>
                      {new Date(appointment.scheduledStart).toLocaleTimeString(
                        undefined,
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                    </strong>
                    <span>
                      {appointment.patientId} ·{" "}
                      {formatVisitTypeLabel(appointment.visitType, locale)}
                    </span>
                    <small>
                      {formatStatusLabel(appointment.status, locale)} ·{" "}
                      {appointment.durationMinutes} min ·{" "}
                      {appointment.doctorId
                        ? doctorLabel(appointment.doctorId)
                        : "Unassigned"}
                    </small>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </section>
      <div className="appointment-list">
        <h3>
          {t(
            "Appointments in selected calendar range",
            "المواعيد في الفترة المحددة",
          )}
        </h3>
        {appointments.length === 0 ? (
          <p className="muted">
            {t("No appointments found.", "لا توجد مواعيد.")}
          </p>
        ) : (
          appointments.map((appointment) => (
            <article className="appointment-row" key={appointment.id}>
              <div>
                <strong>{appointment.patientId}</strong>
                <span>
                  {new Date(appointment.scheduledStart).toLocaleString()} ·{" "}
                  {formatVisitTypeLabel(appointment.visitType, locale)}
                </span>
                <small>
                  {formatStatusLabel(appointment.status, locale)} ·{" "}
                  {appointment.durationMinutes} min
                </small>
              </div>
              {canReadClinical ? (
                <button
                  className="button secondary"
                  type="button"
                  disabled={isBusy}
                  onClick={() => void openEncounter(appointment)}
                >
                  {t("Open encounter", "فتح الزيارة")}
                </button>
              ) : null}
              {appointment.status === "scheduled" ? (
                <>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void updateStatus(
                        appointment,
                        "arrived",
                        "Patient checked in at front desk",
                      )
                    }
                  >
                    {t("Check in", "تسجيل الوصول")}
                  </button>
                  {isReceptionist ? (
                    <>
                      <button
                        className="button small secondary"
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void updateStatus(
                            appointment,
                            "no-show",
                            "Patient did not arrive",
                          )
                        }
                      >
                        {t("Mark no-show", "تسجيل عدم الحضور")}
                      </button>
                      <button
                        className="button small danger"
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          if (
                            window.confirm(
                              t(
                                "Cancel this appointment?",
                                "هل تريد إلغاء هذا الموعد؟",
                              ),
                            )
                          ) {
                            void updateStatus(
                              appointment,
                              "cancelled",
                              t(
                                "Cancelled by front desk",
                                "تم الإلغاء من الاستقبال",
                              ),
                            );
                          }
                        }}
                      >
                        {t("Cancel", "إلغاء")}
                      </button>
                    </>
                  ) : null}
                </>
              ) : !isReceptionist && appointment.status === "arrived" ? (
                <button
                  className="button secondary"
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void updateStatus(appointment, "in-consultation")
                  }
                >
                  {t("Start consultation", "بدء الكشف")}
                </button>
              ) : !isReceptionist &&
                appointment.status === "in-consultation" ? (
                <button
                  className="button primary"
                  type="button"
                  disabled={isBusy}
                  onClick={() => void updateStatus(appointment, "completed")}
                >
                  {t("Complete visit", "إنهاء الزيارة")}
                </button>
              ) : appointment.status === "arrived" ? (
                <span className="status info">
                  {t("Waiting for clinical team", "في انتظار الفريق الطبي")}
                </span>
              ) : null}
            </article>
          ))
        )}
      </div>
      {canReadClinical && selectedAppointment ? (
        <section className="encounter-panel" aria-labelledby="encounter-title">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Clinical record</p>
              <h3 id="encounter-title">
                Encounter note · {selectedAppointment.patientId}
              </h3>
              <p className="form-help">
                {new Date(selectedAppointment.scheduledStart).toLocaleString()}{" "}
                · {formatVisitTypeLabel(selectedAppointment.visitType, locale)}
              </p>
            </div>
            <span
              className={`status ${selectedEncounter?.status === "signed" ? "ok" : "warn"}`}
            >
              {selectedEncounter?.status ?? "not started"}
            </span>
          </div>
          {!selectedEncounter && !encounterForm ? (
            <p className="muted">
              No encounter note exists for this appointment.
            </p>
          ) : null}
          {encounterForm ? (
            <form
              className="encounter-editor"
              onSubmit={(event) => void saveEncounter(event)}
            >
              <div className="form-grid">
                <label>
                  Subjective
                  <textarea
                    rows={5}
                    value={encounterForm.subjective ?? ""}
                    onChange={(event) =>
                      setEncounterForm((current) =>
                        current
                          ? { ...current, subjective: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Objective
                  <textarea
                    rows={5}
                    value={encounterForm.objective ?? ""}
                    onChange={(event) =>
                      setEncounterForm((current) =>
                        current
                          ? { ...current, objective: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Assessment
                  <textarea
                    rows={5}
                    value={encounterForm.assessment ?? ""}
                    onChange={(event) =>
                      setEncounterForm((current) =>
                        current
                          ? { ...current, assessment: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Plan
                  <textarea
                    rows={5}
                    value={encounterForm.plan ?? ""}
                    onChange={(event) =>
                      setEncounterForm((current) =>
                        current
                          ? { ...current, plan: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
              </div>
              <label>
                Follow-up
                <textarea
                  rows={3}
                  value={encounterForm.followUp ?? ""}
                  onChange={(event) =>
                    setEncounterForm((current) =>
                      current
                        ? { ...current, followUp: event.target.value }
                        : current,
                    )
                  }
                />
              </label>
              <div className="button-row">
                <button
                  className="button primary"
                  type="submit"
                  disabled={isBusy}
                >
                  {selectedEncounter ? "Save draft note" : "Create draft note"}
                </button>
                {selectedEncounter && canSignClinical ? (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isBusy || selectedEncounter.status !== "draft"}
                    onClick={() => void signSelectedEncounter()}
                  >
                    Sign encounter
                  </button>
                ) : null}
              </div>
            </form>
          ) : selectedEncounter ? (
            <div className="encounter-readonly">
              <dl className="encounter-note-grid">
                <div>
                  <dt>Subjective</dt>
                  <dd>{displayedEncounter?.subjective ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Objective</dt>
                  <dd>{displayedEncounter?.objective ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Assessment</dt>
                  <dd>{displayedEncounter?.assessment ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Plan</dt>
                  <dd>{displayedEncounter?.plan ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Follow-up</dt>
                  <dd>{displayedEncounter?.followUp ?? "Not recorded"}</dd>
                </div>
              </dl>
              {selectedEncounter.status === "signed" ? (
                <p className="status ok">
                  Signed original is immutable. Effective projection includes{" "}
                  {selectedEffectiveEncounter?.appliedAmendmentCount ?? 0}{" "}
                  applied amendment(s).
                </p>
              ) : null}
            </div>
          ) : null}
          {selectedEncounter?.status === "signed" ? (
            <div className="amendment-section">
              <div className="related-person-heading">
                <div>
                  <h4>Encounter amendments</h4>
                  <p className="form-help">
                    Corrections preserve the signed original and require a
                    separate Doctor review.
                  </p>
                </div>
                {canRecordDiagnosis ? (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isBusy}
                    onClick={openAmendmentForm}
                  >
                    Request amendment
                  </button>
                ) : null}
              </div>
              <div className="projection-snapshot-controls">
                <label>
                  Export snapshot reason
                  <input
                    value={snapshotExportReason}
                    onChange={(event) =>
                      setSnapshotExportReason(event.target.value)
                    }
                    placeholder="Required for patient-record export snapshot"
                  />
                </label>
                <button
                  className="button secondary"
                  type="button"
                  disabled={isBusy || snapshotExportReason.trim().length < 3}
                  onClick={() => void createProjectionSnapshot()}
                >
                  Create immutable export snapshot
                </button>
              </div>
              {projectionSnapshots.length > 0 ? (
                <div className="projection-snapshot-list">
                  <strong>Export snapshots</strong>
                  {projectionSnapshots.map((snapshot) => (
                    <small key={snapshot.id}>
                      {new Date(snapshot.createdAt).toLocaleString()} ·
                      effective v{snapshot.effectiveVersion} ·{" "}
                      {snapshot.appliedAmendmentCount} amendment(s) · hash{" "}
                      {snapshot.payloadHash.slice(0, 16)}… ·{" "}
                      {snapshot.exportReason}
                    </small>
                  ))}
                </div>
              ) : null}
              {canExport && projectionSnapshots.length > 0 ? (
                <div className="signed-export-controls">
                  <div className="inline-fields">
                    <label>
                      Export format
                      <select
                        value={exportFormat}
                        onChange={(event) =>
                          setExportFormat(event.target.value as "pdf" | "fhir")
                        }
                      >
                        <option value="pdf">Signed PDF</option>
                        <option value="fhir">FHIR JSON Bundle</option>
                      </select>
                    </label>
                    <label>
                      Redaction policy
                      <select
                        value={exportRedactionPolicy}
                        onChange={(event) =>
                          setExportRedactionPolicy(
                            event.target.value as
                              "minimal" | "clinical" | "full",
                          )
                        }
                      >
                        <option value="minimal">
                          Minimal — ID and clinical note
                        </option>
                        <option value="clinical">
                          Clinical — no phone or national ID
                        </option>
                        <option value="full" disabled={!canSensitiveExport}>
                          Full — sensitive identity fields
                        </option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Signed export reason
                    <input
                      value={exportReason}
                      onChange={(event) => setExportReason(event.target.value)}
                      placeholder="Required for the export audit trail"
                    />
                  </label>
                  <button
                    className="button primary"
                    type="button"
                    disabled={isBusy || exportReason.trim().length < 3}
                    onClick={() => void exportPatientRecord()}
                  >
                    Create and save signed export
                  </button>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      type="button"
                      disabled={
                        isBusy ||
                        exportReason.trim().length < 3 ||
                        exportFormat !== "fhir"
                      }
                      onClick={() => void validateFhirExport()}
                    >
                      Validate FHIR R4
                    </button>
                    <button
                      className="button primary"
                      type="button"
                      disabled={isBusy || exportReason.trim().length < 3}
                      onClick={() => void createZipPatientRecord()}
                    >
                      Create signed ZIP export
                    </button>
                  </div>
                  {fhirValidation ? (
                    <div className="export-validation">
                      <strong
                        className={
                          fhirValidation.valid ? "status ok" : "status error"
                        }
                      >
                        {fhirValidation.valid
                          ? "FHIR R4 validation passed"
                          : "FHIR R4 validation failed"}
                      </strong>
                      {fhirValidation.issues.map((issue) => (
                        <small key={`${issue.path}-${issue.code}`}>
                          {issue.severity.toUpperCase()} · {issue.path} ·{" "}
                          {issue.message}
                        </small>
                      ))}
                    </div>
                  ) : null}
                  {exportResult ? (
                    <div className="export-result">
                      <small>
                        Payload: {exportResult.savedFiles.payloadPath}
                      </small>
                      <small>
                        Manifest: {exportResult.savedFiles.manifestPath}
                      </small>
                      <small>
                        Signature: {exportResult.savedFiles.signaturePath}
                      </small>
                      {exportVerification ? (
                        <strong
                          className={
                            exportVerification.verified
                              ? "status ok"
                              : "status error"
                          }
                        >
                          {exportVerification.verified
                            ? "Verified: payload hash, signature, and snapshot hash reference are valid."
                            : exportVerification.reason}
                        </strong>
                      ) : null}
                    </div>
                  ) : null}
                  {zipExportResult ? (
                    <div className="export-result">
                      <small>
                        ZIP archive: {zipExportResult.savedArchivePath}
                      </small>
                      <small>
                        Package ID: {zipExportResult.package.packageId}
                      </small>
                      <small>
                        Expires:{" "}
                        {zipExportResult.package.manifest.expiresAt ?? "Never"}
                      </small>
                      <strong
                        className={
                          zipExportResult.verification.verified
                            ? "status ok"
                            : "status error"
                        }
                      >
                        {zipExportResult.verification.verified
                          ? "ZIP verified and currently valid"
                          : zipExportResult.verification.reason}
                      </strong>
                      {canRevoke && !zipExportResult.verification.revoked ? (
                        <div className="button-row">
                          <input
                            value={revocationReason}
                            onChange={(event) =>
                              setRevocationReason(event.target.value)
                            }
                            placeholder="Reason to revoke this package"
                          />
                          <button
                            className="button danger"
                            type="button"
                            disabled={
                              isBusy || revocationReason.trim().length < 3
                            }
                            onClick={() => void revokeLatestZipExport()}
                          >
                            Revoke package
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {canManage ? (
                <div className="org-settings-panel">
                  <div className="section-heading">
                    <h4>Export registry and signing-key security</h4>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void loadExportRegistry()}
                    >
                      Load export registry
                    </button>
                  </div>
                  {exportRegistry.length > 0 ? (
                    <div className="export-registry-list">
                      <label>
                        Package
                        <select
                          value={selectedRegistryPackageId}
                          onChange={(event) =>
                            setSelectedRegistryPackageId(event.target.value)
                          }
                        >
                          {exportRegistry.map((record) => (
                            <option
                              key={record.packageId}
                              value={record.packageId}
                            >
                              {record.packageId} · {record.status} ·{" "}
                              {record.format.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                      <input
                        value={registryTransitionReason}
                        onChange={(event) =>
                          setRegistryTransitionReason(event.target.value)
                        }
                        placeholder="Lifecycle transition reason"
                      />
                      <button
                        className="button secondary"
                        type="button"
                        disabled={
                          isBusy || registryTransitionReason.trim().length < 3
                        }
                        onClick={() => void transitionRegistryPackage()}
                      >
                        Advance lifecycle
                      </button>
                    </div>
                  ) : (
                    <small>No registered exports loaded.</small>
                  )}
                  {signingKeys.length > 0 ? (
                    <div className="export-registry-list">
                      <small>
                        Active key:{" "}
                        {signingKeys.find((key) => key.status === "active")
                          ?.keyId ?? "none"}
                      </small>
                      <small>
                        Known key versions:{" "}
                        {signingKeys
                          .map((key) => `${key.keyVersion}:${key.status}`)
                          .join(", ")}
                      </small>
                    </div>
                  ) : null}
                  <div className="button-row">
                    <input
                      value={keyRotationReason}
                      onChange={(event) =>
                        setKeyRotationReason(event.target.value)
                      }
                      placeholder="Reason for key rotation"
                    />
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy || keyRotationReason.trim().length < 3}
                      onClick={() => void rotateSigningKey()}
                    >
                      Rotate signing key
                    </button>
                  </div>
                  <div className="button-row">
                    <input
                      type="password"
                      value={recoveryPassphrase}
                      onChange={(event) =>
                        setRecoveryPassphrase(event.target.value)
                      }
                      placeholder="Recovery passphrase (12+ characters)"
                    />
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy || recoveryPassphrase.length < 12}
                      onClick={() => void exportSigningKeyRecovery()}
                    >
                      Create recovery bundle
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={
                        isBusy ||
                        recoveryPassphrase.length < 12 ||
                        recoveryBundleJson.trim().length < 2
                      }
                      onClick={() => void restoreSigningKeyRecovery()}
                    >
                      Restore recovery bundle
                    </button>
                  </div>
                  <textarea
                    value={recoveryBundleJson}
                    onChange={(event) =>
                      setRecoveryBundleJson(event.target.value)
                    }
                    placeholder="Encrypted signing-key recovery bundle JSON"
                    rows={4}
                  />
                </div>
              ) : null}
              {canManage ? (
                <div className="org-settings-panel export-governance-panel">
                  <div className="section-heading">
                    <div>
                      <h4>Export governance and disclosure receipts</h4>
                      <small>
                        Review recipients, consent evidence, disclosures, and
                        signed receipts without exposing recovery material.
                      </small>
                    </div>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void loadGovernance()}
                    >
                      Load governance data
                    </button>
                  </div>
                  <div className="inline-fields">
                    <label>
                      Recipient name
                      <input
                        value={recipientDisplayName}
                        onChange={(event) =>
                          setRecipientDisplayName(event.target.value)
                        }
                        placeholder="Referral recipient"
                      />
                    </label>
                    <label>
                      Organization
                      <input
                        value={recipientOrganizationName}
                        onChange={(event) =>
                          setRecipientOrganizationName(event.target.value)
                        }
                        placeholder="Recipient organization"
                      />
                    </label>
                    <label>
                      Category
                      <select
                        value={recipientCategory}
                        onChange={(event) =>
                          setRecipientCategory(
                            event.target.value as ExportRecipient["category"],
                          )
                        }
                      >
                        <option value="referral-provider">
                          Referral provider
                        </option>
                        <option value="treating-provider">
                          Treating provider
                        </option>
                        <option value="patient">Patient</option>
                        <option value="guardian">Guardian</option>
                        <option value="legal-authority">Legal authority</option>
                        <option value="administrative-authority">
                          Administrative authority
                        </option>
                        <option value="internal-clinic">Internal clinic</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      Contact/delivery note
                      <input
                        value={recipientContactChannel}
                        onChange={(event) =>
                          setRecipientContactChannel(event.target.value)
                        }
                        placeholder="USB handoff or verified channel"
                      />
                    </label>
                  </div>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      type="button"
                      disabled={
                        isBusy || recipientDisplayName.trim().length < 1
                      }
                      onClick={() => void createGovernanceRecipient()}
                    >
                      Create recipient
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy || governanceReason.trim().length < 3}
                      onClick={() => void verifyFirstRecipient()}
                    >
                      Verify first pending recipient
                    </button>
                  </div>
                  <div className="inline-fields">
                    <label>
                      Evidence patient ID
                      <input
                        value={patientId}
                        onChange={(event) => setPatientId(event.target.value)}
                        placeholder="EL-00001"
                      />
                    </label>
                    <label>
                      Evidence reference
                      <input
                        value={governanceEvidenceReference}
                        onChange={(event) =>
                          setGovernanceEvidenceReference(event.target.value)
                        }
                        placeholder="Consent record or policy reference"
                      />
                    </label>
                    <label>
                      Governance reason
                      <input
                        value={governanceReason}
                        onChange={(event) =>
                          setGovernanceReason(event.target.value)
                        }
                        placeholder="Reason for review or delivery"
                      />
                    </label>
                  </div>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      type="button"
                      disabled={
                        isBusy ||
                        patientId.trim().length < 3 ||
                        governanceEvidenceReference.trim().length < 1
                      }
                      onClick={() => void createGovernanceEvidence()}
                    >
                      Record patient-consent evidence
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy || governanceReason.trim().length < 3}
                      onClick={() => void approveFirstEvidence()}
                    >
                      Approve first pending evidence
                    </button>
                  </div>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      type="button"
                      disabled={
                        isBusy ||
                        governanceReason.trim().length < 3 ||
                        !selectedRegistryPackageId
                      }
                      onClick={() => void requestFirstDisclosure()}
                    >
                      Request referral disclosure for selected package
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy || governanceReason.trim().length < 3}
                      onClick={() => void advanceFirstDisclosure()}
                    >
                      Approve/send next disclosure
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void issueFirstReceipt()}
                    >
                      Issue signed receipt
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy || governanceReason.trim().length < 3}
                      onClick={() => void acknowledgeFirstReceipt()}
                    >
                      Acknowledge receipt
                    </button>
                  </div>
                  <div className="export-registry-list">
                    <small>Recipients: {governanceRecipients.length}</small>
                    <small>Consent evidence: {governanceEvidence.length}</small>
                    <small>Disclosures: {governanceDisclosures.length}</small>
                    <small>Receipts: {governanceReceipts.length}</small>
                    {governanceDisclosures[0] ? (
                      <small>
                        Latest disclosure: {governanceDisclosures[0].status} ·{" "}
                        {governanceDisclosures[0].packageId}
                      </small>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {canManage ? (
                <div className="org-settings-panel">
                  <div className="section-heading">
                    <h4>Organization identifiers and export expiration</h4>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void loadOrganizationSettings()}
                    >
                      Load settings
                    </button>
                  </div>
                  <div className="inline-fields">
                    <label>
                      Clinic name
                      <input
                        value={orgSettingsForm.clinicNameEn}
                        onChange={(event) =>
                          setOrgSettingsForm({
                            ...orgSettingsForm,
                            clinicNameEn: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Country code
                      <input
                        value={orgSettingsForm.countryCode}
                        maxLength={2}
                        onChange={(event) =>
                          setOrgSettingsForm({
                            ...orgSettingsForm,
                            countryCode: event.target.value.toUpperCase(),
                          })
                        }
                      />
                    </label>
                    <label>
                      OID
                      <input
                        value={orgSettingsForm.oid}
                        onChange={(event) =>
                          setOrgSettingsForm({
                            ...orgSettingsForm,
                            oid: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      FHIR system URL
                      <input
                        value={orgSettingsForm.fhirSystemUrl}
                        onChange={(event) =>
                          setOrgSettingsForm({
                            ...orgSettingsForm,
                            fhirSystemUrl: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Expiration days
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={orgSettingsForm.exportExpirationDays}
                        onChange={(event) =>
                          setOrgSettingsForm({
                            ...orgSettingsForm,
                            exportExpirationDays: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Session duration (minutes)
                      <input
                        type="number"
                        min={15}
                        max={720}
                        step={15}
                        value={orgSettingsForm.sessionTtlMinutes}
                        onChange={(event) =>
                          setOrgSettingsForm({
                            ...orgSettingsForm,
                            sessionTtlMinutes: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void saveOrganizationSettings()}
                  >
                    Save organization settings
                  </button>
                  {orgSettings ? (
                    <small className="muted">
                      Last updated{" "}
                      {new Date(orgSettings.updatedAt).toLocaleString()} by{" "}
                      {orgSettings.updatedByUserId}
                    </small>
                  ) : null}
                </div>
              ) : null}
              {amendments.length === 0 ? (
                <p className="muted">
                  No amendment requests for this signed note.
                </p>
              ) : (
                <div className="amendment-list">
                  {amendments.map((amendment) => (
                    <article className="amendment-row" key={amendment.id}>
                      <div>
                        <strong>{amendment.status} amendment</strong>
                        <span>{amendment.correctionReason}</span>
                        <small>
                          Requested by {amendment.requestedByUserId} · base
                          version {amendment.baseEncounterVersion}
                          {amendment.baseAmendmentId
                            ? ` · after ${amendment.baseAmendmentId}`
                            : " · original signed record"}
                          {amendment.appliedSequence
                            ? ` · sequence ${amendment.appliedSequence}`
                            : ""}
                        </small>
                        {amendment.reviewReason ? (
                          <small>Review: {amendment.reviewReason}</small>
                        ) : null}
                        {amendment.conflictReason ? (
                          <small>Conflict: {amendment.conflictReason}</small>
                        ) : null}
                        {amendmentDiffs
                          .find((diff) => diff.amendmentId === amendment.id)
                          ?.fields.map((fieldDiff) => (
                            <small key={`${amendment.id}-${fieldDiff.field}`}>
                              {fieldDiff.field}:{" "}
                              {fieldDiff.before ?? "Not recorded"} →{" "}
                              {fieldDiff.after ?? "Not recorded"}
                            </small>
                          ))}
                      </div>
                      {canApproveClinical && amendment.status === "pending" ? (
                        <div className="button-row">
                          <button
                            className="button primary"
                            type="button"
                            disabled={
                              isBusy || amendmentReviewReason.trim().length < 3
                            }
                            onClick={() =>
                              void reviewAmendment(amendment, "approved")
                            }
                          >
                            Approve
                          </button>
                          <button
                            className="button danger"
                            type="button"
                            disabled={
                              isBusy || amendmentReviewReason.trim().length < 3
                            }
                            onClick={() =>
                              void reviewAmendment(amendment, "rejected")
                            }
                          >
                            Reject
                          </button>
                        </div>
                      ) : amendment.status === "approved" &&
                        canApproveClinical ? (
                        <button
                          className="button primary"
                          type="button"
                          disabled={isBusy}
                          onClick={() => void applyAmendment(amendment)}
                        >
                          Apply amendment
                        </button>
                      ) : amendment.status === "conflict" &&
                        canApproveClinical ? (
                        <div className="button-row">
                          <button
                            className="button primary"
                            type="button"
                            disabled={
                              isBusy || amendmentReviewReason.trim().length < 3
                            }
                            onClick={() =>
                              void resolveAmendmentConflict(amendment, "rebase")
                            }
                          >
                            Rebase and approve
                          </button>
                          <button
                            className="button danger"
                            type="button"
                            disabled={
                              isBusy || amendmentReviewReason.trim().length < 3
                            }
                            onClick={() =>
                              void resolveAmendmentConflict(amendment, "reject")
                            }
                          >
                            Reject conflict
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
              {canApproveClinical &&
              amendments.some(
                (amendment) =>
                  amendment.status === "pending" ||
                  amendment.status === "conflict",
              ) ? (
                <label className="history-audit-reason">
                  Amendment review or conflict-resolution reason
                  <input
                    value={amendmentReviewReason}
                    onChange={(event) =>
                      setAmendmentReviewReason(event.target.value)
                    }
                    placeholder="Required for review, rebase, or rejection"
                  />
                </label>
              ) : null}
              {amendmentForm ? (
                <form
                  className="amendment-editor"
                  onSubmit={(event) => void saveAmendment(event)}
                >
                  <h4>Proposed correction</h4>
                  <div className="form-grid">
                    <label>
                      Subjective
                      <textarea
                        rows={5}
                        value={amendmentForm.subjective ?? ""}
                        onChange={(event) =>
                          setAmendmentForm((current) =>
                            current
                              ? { ...current, subjective: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      Objective
                      <textarea
                        rows={5}
                        value={amendmentForm.objective ?? ""}
                        onChange={(event) =>
                          setAmendmentForm((current) =>
                            current
                              ? { ...current, objective: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      Assessment
                      <textarea
                        rows={5}
                        value={amendmentForm.assessment ?? ""}
                        onChange={(event) =>
                          setAmendmentForm((current) =>
                            current
                              ? { ...current, assessment: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      Plan
                      <textarea
                        rows={5}
                        value={amendmentForm.plan ?? ""}
                        onChange={(event) =>
                          setAmendmentForm((current) =>
                            current
                              ? { ...current, plan: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Follow-up
                    <textarea
                      rows={3}
                      value={amendmentForm.followUp ?? ""}
                      onChange={(event) =>
                        setAmendmentForm((current) =>
                          current
                            ? { ...current, followUp: event.target.value }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label>
                    Correction reason
                    <textarea
                      required
                      rows={3}
                      value={amendmentForm.correctionReason}
                      onChange={(event) =>
                        setAmendmentForm((current) =>
                          current
                            ? {
                                ...current,
                                correctionReason: event.target.value,
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                  <div className="button-row">
                    <button
                      className="button primary"
                      type="submit"
                      disabled={isBusy}
                    >
                      Submit amendment request
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setAmendmentForm(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
          {selectedEncounter ? (
            <div className="diagnosis-section">
              <div className="related-person-heading">
                <div>
                  <h4>ICD-10 diagnoses</h4>
                  <p className="form-help">
                    Diagnosis text is recorded in English and linked to a local
                    ICD-10 release.
                  </p>
                </div>
                {canRecordDiagnosis && selectedEncounter.status === "draft" ? (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isBusy}
                    onClick={() => setDiagnosisForm({ ...emptyDiagnosisForm })}
                  >
                    Add diagnosis
                  </button>
                ) : null}
              </div>
              {diagnoses.length === 0 ? (
                <p className="muted">
                  No diagnoses recorded for this encounter.
                </p>
              ) : (
                <div className="diagnosis-list">
                  {diagnoses.map((diagnosis) => (
                    <article className="diagnosis-row" key={diagnosis.id}>
                      <div>
                        <strong>
                          {diagnosis.icd10Code} · {diagnosis.diagnosisTextEn}
                        </strong>
                        <span>
                          {diagnosis.icd10TitleEn} ·{" "}
                          {diagnosis.isPrimary ? "Primary" : "Additional"}
                        </span>
                        <small>
                          Approval: {diagnosis.approvalStatus} · recorded by{" "}
                          {diagnosis.recordedByUserId}
                        </small>
                      </div>
                      {canApproveClinical &&
                      diagnosis.approvalStatus === "pending" ? (
                        <div className="button-row">
                          <button
                            className="button primary"
                            type="button"
                            disabled={
                              isBusy || diagnosisReviewReason.trim().length < 3
                            }
                            onClick={() =>
                              void reviewDiagnosis(diagnosis, "approved")
                            }
                          >
                            Approve
                          </button>
                          <button
                            className="button danger"
                            type="button"
                            disabled={
                              isBusy || diagnosisReviewReason.trim().length < 3
                            }
                            onClick={() =>
                              void reviewDiagnosis(diagnosis, "rejected")
                            }
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
              {canApproveClinical &&
              diagnoses.some(
                (diagnosis) => diagnosis.approvalStatus === "pending",
              ) ? (
                <label className="history-audit-reason">
                  Diagnosis review reason
                  <input
                    value={diagnosisReviewReason}
                    onChange={(event) =>
                      setDiagnosisReviewReason(event.target.value)
                    }
                    placeholder="Required for approval or rejection"
                  />
                </label>
              ) : null}
              {diagnosisForm ? (
                <form
                  className="diagnosis-editor"
                  onSubmit={(event) => void saveDiagnosis(event)}
                >
                  <div className="form-grid">
                    <label>
                      ICD-10 code
                      <select
                        required
                        value={diagnosisForm.icd10CodeId}
                        onChange={(event) =>
                          setDiagnosisForm((current) =>
                            current
                              ? { ...current, icd10CodeId: event.target.value }
                              : current,
                          )
                        }
                      >
                        <option value="">Select code</option>
                        {icd10Codes.map((code) => (
                          <option key={code.id} value={code.id}>
                            {code.code} · {code.titleEn} · {code.releaseVersion}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Diagnosis in English
                      <input
                        required
                        value={diagnosisForm.diagnosisTextEn}
                        onChange={(event) =>
                          setDiagnosisForm((current) =>
                            current
                              ? {
                                  ...current,
                                  diagnosisTextEn: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                  </div>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={diagnosisForm.isPrimary}
                      onChange={(event) =>
                        setDiagnosisForm((current) =>
                          current
                            ? { ...current, isPrimary: event.target.checked }
                            : current,
                        )
                      }
                    />
                    Primary diagnosis
                  </label>
                  <div className="button-row">
                    <button
                      className="button primary"
                      type="submit"
                      disabled={isBusy}
                    >
                      Record diagnosis
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setDiagnosisForm(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {!canReadClinical ? (
        <p className="form-help">
          Clinical records are restricted to clinical staff. Appointment and
          front-desk actions remain available here.
        </p>
      ) : null}
    </section>
  );
}

const MERGE_FIELDS: readonly PatientMergeField[] = [
  "nameEn",
  "nameAr",
  "dob",
  "sex",
  "phone",
  "nationalId",
  "primaryDepartmentId",
];

const MERGE_FIELD_LABELS: Record<PatientMergeField, string> = {
  nameEn: "English name",
  nameAr: "Arabic name",
  dob: "Date of birth",
  sex: "Sex",
  phone: "Phone",
  nationalId: "National ID",
  primaryDepartmentId: "Primary department",
};

function defaultMergeDecisions(): PatientMergeFieldDecisions {
  return {
    nameEn: "target",
    nameAr: "target",
    dob: "target",
    sex: "target",
    phone: "target",
    nationalId: "target",
    primaryDepartmentId: "target",
  };
}

function mergePatientValue(
  patient: Patient | null,
  field: PatientMergeField,
): string {
  if (!patient) return "Loading…";
  const values: Record<PatientMergeField, string | undefined> = {
    nameEn: patient.nameEn,
    nameAr: patient.nameAr,
    dob: patient.dob,
    sex: patient.sex,
    phone: patient.phone,
    nationalId: patient.nationalId,
    primaryDepartmentId: patient.primaryDepartmentId,
  };
  return values[field] ?? "Not recorded";
}

function MergeReviewQueue({ token }: { token: string }): ReactElement {
  const [cases, setCases] = useState<readonly PatientMergeCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<PatientMergeCase | null>(
    null,
  );
  const [sourcePatient, setSourcePatient] = useState<Patient | null>(null);
  const [targetPatient, setTargetPatient] = useState<Patient | null>(null);
  const [fieldDecisions, setFieldDecisions] =
    useState<PatientMergeFieldDecisions>(defaultMergeDecisions);
  const [reviewReason, setReviewReason] = useState("");
  const [requestSourceId, setRequestSourceId] = useState("");
  const [requestTargetId, setRequestTargetId] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestDecisions, setRequestDecisions] =
    useState<PatientMergeFieldDecisions>(defaultMergeDecisions);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = async (): Promise<void> => {
    try {
      setCases(await window.elite.patients.listMergeCases(token));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load merge cases",
      );
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const selectCase = async (mergeCase: PatientMergeCase): Promise<void> => {
    setSelectedCase(mergeCase);
    setFieldDecisions({
      ...defaultMergeDecisions(),
      ...mergeCase.fieldDecisions,
    });
    setReviewReason(mergeCase.reviewReason ?? "");
    setError(null);
    try {
      const [source, target] = await Promise.all([
        window.elite.patients.get(token, mergeCase.sourcePatientId),
        window.elite.patients.get(token, mergeCase.targetPatientId),
      ]);
      setSourcePatient(source);
      setTargetPatient(target);
    } catch (reason: unknown) {
      setSourcePatient(null);
      setTargetPatient(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load merge patients",
      );
    }
  };

  const reviewCase = async (decision: "approve" | "reject"): Promise<void> => {
    if (!selectedCase || reviewReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      const reviewed = await window.elite.patients.reviewMerge(
        token,
        selectedCase.id,
        decision,
        reviewReason,
        fieldDecisions,
      );
      setSelectedCase(reviewed);
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to review merge case",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const executeCase = async (): Promise<void> => {
    if (!selectedCase || selectedCase.status !== "approved") return;
    setIsBusy(true);
    setError(null);
    try {
      const executed = await window.elite.patients.executeMerge(
        token,
        selectedCase.id,
      );
      setSelectedCase(executed);
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to execute merge case",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const requestMerge = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (requestSourceId.trim() === requestTargetId.trim()) {
      setError("Source and target patients must be different");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const created = await window.elite.patients.requestMerge(token, {
        sourcePatientId: requestSourceId.trim(),
        targetPatientId: requestTargetId.trim(),
        reason: requestReason,
        fieldDecisions: requestDecisions,
      });
      setRequestSourceId("");
      setRequestTargetId("");
      setRequestReason("");
      setRequestDecisions(defaultMergeDecisions());
      await refresh();
      await selectCase(created);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create merge request",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const decisionFields = (
    decisions: PatientMergeFieldDecisions,
    setDecisions: React.Dispatch<
      React.SetStateAction<PatientMergeFieldDecisions>
    >,
    source: Patient | null,
    target: Patient | null,
  ): ReactElement => (
    <div className="merge-field-list">
      {MERGE_FIELDS.map((field) => (
        <div className="merge-field-row" key={field}>
          <div>
            <strong>{MERGE_FIELD_LABELS[field]}</strong>
            <small>
              Source: {mergePatientValue(source, field)} · Target:{" "}
              {mergePatientValue(target, field)}
            </small>
          </div>
          <select
            value={decisions[field] ?? "target"}
            onChange={(event) =>
              setDecisions((current) => ({
                ...current,
                [field]: event.target.value as "source" | "target",
              }))
            }
          >
            <option value="target">Keep target</option>
            <option value="source">Use source</option>
          </select>
        </div>
      ))}
    </div>
  );

  const pendingCount = cases.filter(
    (mergeCase) => mergeCase.status === "pending",
  ).length;

  return (
    <section
      className="card merge-review-card"
      aria-labelledby="merge-review-title"
    >
      <div className="card-heading">
        <div>
          <p className="eyebrow">Admin control</p>
          <h2 id="merge-review-title">Patient merge review queue</h2>
        </div>
        <span className={`status ${pendingCount > 0 ? "warn" : "ok"}`}>
          {pendingCount} pending
        </span>
      </div>
      <ErrorMessage message={error} />
      <form
        className="merge-request-form"
        onSubmit={(event) => void requestMerge(event)}
      >
        <h3>Request a controlled merge</h3>
        <div className="form-grid">
          <label>
            Source patient ID
            <input
              required
              placeholder="EL-00001"
              value={requestSourceId}
              onChange={(event) => setRequestSourceId(event.target.value)}
            />
          </label>
          <label>
            Target patient ID
            <input
              required
              placeholder="EL-00002"
              value={requestTargetId}
              onChange={(event) => setRequestTargetId(event.target.value)}
            />
          </label>
        </div>
        <label>
          Reason
          <textarea
            required
            minLength={3}
            maxLength={500}
            value={requestReason}
            onChange={(event) => setRequestReason(event.target.value)}
          />
        </label>
        {decisionFields(requestDecisions, setRequestDecisions, null, null)}
        <button className="button primary" type="submit" disabled={isBusy}>
          Create merge request
        </button>
      </form>
      <div className="merge-queue-list">
        {cases.length === 0 ? (
          <p className="muted">No merge cases have been requested.</p>
        ) : null}
        {cases.map((mergeCase) => (
          <button
            className={`merge-case-row ${selectedCase?.id === mergeCase.id ? "selected" : ""}`}
            type="button"
            key={mergeCase.id}
            onClick={() => void selectCase(mergeCase)}
            disabled={isBusy}
          >
            <strong>
              {mergeCase.sourcePatientId} → {mergeCase.targetPatientId}
            </strong>
            <span>
              {mergeCase.status} · requested{" "}
              {new Date(mergeCase.requestedAt).toLocaleString()}
            </span>
            <small>Correlation {mergeCase.correlationId}</small>
          </button>
        ))}
      </div>
      {selectedCase ? (
        <div className="merge-case-detail">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Selected case</p>
              <h3>
                {selectedCase.sourcePatientId} → {selectedCase.targetPatientId}
              </h3>
            </div>
            <span
              className={`status ${selectedCase.status === "pending" ? "warn" : selectedCase.status === "executed" ? "ok" : "info"}`}
            >
              {selectedCase.status}
            </span>
          </div>
          <p className="form-help">
            Correlation ID: <strong>{selectedCase.correlationId}</strong>
          </p>
          {decisionFields(
            fieldDecisions,
            setFieldDecisions,
            sourcePatient,
            targetPatient,
          )}
          <label>
            Review reason
            <textarea
              minLength={3}
              maxLength={500}
              value={reviewReason}
              onChange={(event) => setReviewReason(event.target.value)}
            />
          </label>
          {selectedCase.status === "pending" ? (
            <div className="button-row">
              <button
                className="button primary"
                type="button"
                disabled={isBusy || reviewReason.trim().length < 3}
                onClick={() => void reviewCase("approve")}
              >
                Approve case
              </button>
              <button
                className="button danger"
                type="button"
                disabled={isBusy || reviewReason.trim().length < 3}
                onClick={() => void reviewCase("reject")}
              >
                Reject case
              </button>
            </div>
          ) : null}
          {selectedCase.status === "approved" ? (
            <button
              className="button primary"
              type="button"
              disabled={isBusy}
              onClick={() => void executeCase()}
            >
              Execute approved merge
            </button>
          ) : null}
          {selectedCase.status === "executed" ? (
            <p className="status ok">
              Merge executed transactionally. The source patient remains as a
              merged redirect record.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function formatEgp(amount: number): string {
  return `${amount.toLocaleString("en-EG")} EGP`;
}

function BillingWorkspace({
  token,
  session,
  locale,
}: {
  token: string;
  session: SessionSummary;
  locale: InterfaceLocale;
}): ReactElement {
  const [packages, setPackages] = useState<readonly BillingPackage[]>([]);
  const [services, setServices] = useState<readonly Service[]>([]);
  const [invoices, setInvoices] = useState<readonly BillingInvoice[]>([]);
  const [selectedBillingPatient, setSelectedBillingPatient] =
    useState<Patient | null>(null);
  const [billingAppointments, setBillingAppointments] = useState<
    readonly Appointment[]
  >([]);
  const [selectedBillingAppointmentId, setSelectedBillingAppointmentId] =
    useState("");
  const [receiptPreview, setReceiptPreview] = useState<{
    payment: BillingPayment;
    receipt: BillingReceipt;
    invoice: BillingInvoice;
  } | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [discountEgp, setDiscountEgp] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<BillingPaymentInput["method"]>("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [refundPaymentId, setRefundPaymentId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [packageCode, setPackageCode] = useState("");
  const [packageName, setPackageName] = useState("");
  const [packagePrice, setPackagePrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [payoutReportMonth, setPayoutReportMonth] = useState(() => {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [payoutScheduleStatus, setPayoutScheduleStatus] =
    useState<BillingDoctorPayoutScheduleStatus | null>(null);
  const [lastPayoutExport, setLastPayoutExport] =
    useState<BillingDoctorPayoutExportResult | null>(null);
  const canManageCatalog = session.capabilities.includes("module.manage");
  const canManagePayoutReports = session.capabilities.includes(
    "billing.payout.report",
  );
  const canWriteBilling = session.capabilities.includes("billing.write");
  const canRefund = session.capabilities.includes("billing.refund");
  const t = (english: string, arabic: string): string =>
    frontDeskCopy(locale, english, arabic);

  const selectBillingPatient = async (patient: Patient): Promise<void> => {
    setSelectedBillingPatient(patient);
    setSelectedBillingAppointmentId("");
    setError(null);
    try {
      setBillingAppointments(
        await window.elite.clinical.listAppointments(
          token,
          undefined,
          undefined,
          undefined,
          patient.patientId,
        ),
      );
    } catch {
      setBillingAppointments([]);
    }
  };

  const refresh = async (): Promise<void> => {
    setError(null);
    try {
      const [nextPackages, nextServices, nextInvoices, nextPayoutStatus] =
        await Promise.all([
          window.elite.billing.listPackages(token),
          window.elite.clinical.listServices(token),
          window.elite.billing.listInvoices(token),
          canManagePayoutReports
            ? window.elite.billing.getPayoutReportStatus(token)
            : Promise.resolve(null),
        ]);
      setPackages(nextPackages);
      setServices(
        nextServices.filter((service) => service.status === "active"),
      );
      setInvoices(nextInvoices);
      setPayoutScheduleStatus(nextPayoutStatus);
      if (!selectedInvoiceId && nextInvoices[0]) {
        setSelectedInvoiceId(nextInvoices[0].id);
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load billing data",
      );
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, canManagePayoutReports]);

  const generatePayoutReport = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await window.elite.billing.generatePayoutReport(token, {
        reportMonth: payoutReportMonth,
      });
      setLastPayoutExport(result);
      setPayoutScheduleStatus((current) =>
        current
          ? {
              ...current,
              lastRunAt: result.report.generatedAt,
              lastReportMonth: result.report.reportMonth,
              lastOutputFileName: result.fileName,
              lastError: undefined,
            }
          : current,
      );
      setNotice(`Doctor payout report ${result.fileName} exported.`);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to export doctor payout report",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const createPackage = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!serviceId) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      await window.elite.billing.createPackage(token, {
        code: packageCode,
        nameEn: packageName,
        priceEgp: Number(packagePrice),
        items: [{ serviceId, quantity: 1 }],
      });
      setPackageCode("");
      setPackageName("");
      setPackagePrice("");
      setNotice("Service package created.");
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to create package",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const createInvoice = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedBillingPatient) {
      setError("Choose a patient before creating the bill.");
      return;
    }
    if (!serviceId && !packageId) {
      setError("Choose a service or package before creating the bill.");
      return;
    }
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const line = serviceId
        ? { serviceId, quantity: Number(quantity) }
        : { packageId, quantity: Number(quantity) };
      const input: BillingInvoiceCreateInput = {
        patientId: selectedBillingPatient.patientId,
        ...(selectedBillingAppointmentId
          ? { appointmentId: selectedBillingAppointmentId }
          : {}),
        lines: [line],
        discountEgp: Number(discountEgp),
        ...(discountReason.trim()
          ? { discountReason: discountReason.trim() }
          : {}),
      };
      const invoice = await window.elite.billing.createInvoice(token, input);
      setSelectedInvoiceId(invoice.id);
      setInvoices((current) => [
        invoice,
        ...current.filter((item) => item.id !== invoice.id),
      ]);
      setNotice(`Invoice ${invoice.invoiceNumber} created.`);
    } catch (reason: unknown) {
      setError(
        receptionistFriendlyError(
          reason,
          "The bill could not be created. Check the patient and service, then try again.",
        ),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const postPayment = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedInvoiceId) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input: BillingPaymentInput = {
        invoiceId: selectedInvoiceId,
        amountEgp: Number(paymentAmount),
        method: paymentMethod,
        ...(paymentReference.trim()
          ? { reference: paymentReference.trim() }
          : {}),
      };
      const result = await window.elite.billing.postPayment(token, input);
      const payment = result.payment as BillingPayment;
      setReceiptPreview(result);
      setRefundPaymentId(payment.id);
      setPaymentAmount("");
      setPaymentReference("");
      setNotice(`Receipt ${result.receipt.receiptNumber} issued.`);
      await refresh();
    } catch (reason: unknown) {
      setError(
        receptionistFriendlyError(
          reason,
          "The payment could not be recorded. Check the amount and try again.",
        ),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const postRefund = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input: BillingRefundInput = {
        paymentId: refundPaymentId,
        amountEgp: Number(refundAmount),
        reason: refundReason,
      };
      await window.elite.billing.postRefund(token, input);
      setRefundAmount("");
      setRefundReason("");
      setNotice("Refund recorded and the invoice was reconciled.");
      await refresh();
    } catch (reason: unknown) {
      setError(
        receptionistFriendlyError(
          reason,
          "The payment correction could not be recorded. Check the details and try again.",
        ),
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="billing-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">{t("Front desk", "الاستقبال")}</p>
          <h2 id="billing-title">
            {t("Payments and receipts", "المدفوعات والإيصالات")}
          </h2>
        </div>
        <span className="status ok">
          {t("Saved on this computer", "محفوظ على هذا الكمبيوتر")}
        </span>
      </div>
      <p className="form-help">
        {t(
          "Choose the patient first, then create a bill or record a payment. Every receipt is saved safely for the clinic.",
          "اختر المريض أولاً، ثم أنشئ فاتورة أو سجل دفعة. يتم حفظ كل إيصال بأمان للعيادة.",
        )}
      </p>
      <ErrorMessage message={error} />
      {notice ? <p className="status ok">{notice}</p> : null}
      {receiptPreview ? (
        <section
          className="receipt-preview"
          aria-labelledby="receipt-preview-title"
        >
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                {t("Payment complete", "اكتملت الدفعة")}
              </p>
              <h3 id="receipt-preview-title">
                {t("Receipt preview", "معاينة الإيصال")}
              </h3>
            </div>
            <span className="status ok">
              {receiptPreview.receipt.receiptNumber}
            </span>
          </div>
          <dl className="status-grid receipt-preview-grid">
            <div>
              <dt>{t("Patient", "المريض")}</dt>
              <dd>
                {selectedBillingPatient?.nameEn ??
                  receiptPreview.invoice.patientId}
              </dd>
            </div>
            <div>
              <dt>{t("Amount", "المبلغ")}</dt>
              <dd>{formatEgp(receiptPreview.receipt.amountEgp)}</dd>
            </div>
            <div>
              <dt>{t("Invoice", "الفاتورة")}</dt>
              <dd>{receiptPreview.invoice.invoiceNumber}</dd>
            </div>
            <div>
              <dt>{t("Issued", "تاريخ الإصدار")}</dt>
              <dd>
                {new Date(receiptPreview.receipt.issuedAt).toLocaleString()}
              </dd>
            </div>
          </dl>
          <div className="button-row">
            <button
              className="button primary"
              type="button"
              onClick={() => window.print()}
            >
              {t("Print / save PDF", "طباعة / حفظ PDF")}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setReceiptPreview(null)}
            >
              {t("Close preview", "إغلاق المعاينة")}
            </button>
          </div>
        </section>
      ) : null}
      <DoctorEarningsPanel token={token} session={session} locale={locale} />
      {canManagePayoutReports ? (
        <section
          className="doctor-payout-report-card"
          aria-labelledby="doctor-payout-report-title"
        >
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                {locale === "ar-EG" ? "تقرير المستحقات" : "Payroll export"}
              </p>
              <h3 id="doctor-payout-report-title">
                {locale === "ar-EG"
                  ? "تقرير مستحقات الأطباء الشهري"
                  : "Monthly doctor payout report"}
              </h3>
            </div>
            <span className="status ok" dir="ltr">
              1st · 07:00 Africa/Cairo
            </span>
          </div>
          <p className="form-help">
            {locale === "ar-EG"
              ? "يُحسب التقرير من المدفوعات المحصلة والمرتجعات، ويُحفظ محلياً بصيغة CSV."
              : "The report uses collected payments and refund adjustments, then saves a local CSV on the Windows Hub."}
          </p>
          <form
            className="inline-form doctor-payout-report-form"
            onSubmit={(event) => void generatePayoutReport(event)}
          >
            <label className="inline-label">
              {locale === "ar-EG" ? "شهر التقرير" : "Report month"}
              <input
                required
                type="month"
                value={payoutReportMonth}
                onChange={(event) => setPayoutReportMonth(event.target.value)}
              />
            </label>
            <button
              className="button secondary"
              type="submit"
              disabled={isBusy}
            >
              {locale === "ar-EG" ? "تصدير CSV" : "Export CSV"}
            </button>
          </form>
          <div className="doctor-payout-report-status">
            <span>
              {locale === "ar-EG" ? "مجلد الحفظ" : "Output folder"}:
              <code dir="ltr">{payoutScheduleStatus?.outputDirectory}</code>
            </span>
            {payoutScheduleStatus?.lastRunAt ? (
              <span>
                {locale === "ar-EG" ? "آخر تشغيل" : "Last run"}:{" "}
                {payoutScheduleStatus.lastRunAt}
              </span>
            ) : null}
            {lastPayoutExport ? (
              <span className="status ok" dir="ltr">
                {lastPayoutExport.filePath}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
      {canManageCatalog ? (
        <form
          className="form-section"
          onSubmit={(event) => void createPackage(event)}
        >
          <h3>Admin service package</h3>
          <div className="form-grid">
            <label>
              Code
              <input
                required
                value={packageCode}
                onChange={(event) => setPackageCode(event.target.value)}
              />
            </label>
            <label>
              Name
              <input
                required
                value={packageName}
                onChange={(event) => setPackageName(event.target.value)}
              />
            </label>
            <label>
              Price (EGP)
              <input
                required
                min="0"
                type="number"
                value={packagePrice}
                onChange={(event) => setPackagePrice(event.target.value)}
              />
            </label>
            <label>
              Included service
              <select
                required
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
              >
                <option value="">Select service</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.nameEn} · {formatEgp(service.priceEgp)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="button secondary" type="submit" disabled={isBusy}>
            Create package
          </button>
        </form>
      ) : null}
      {canManageCatalog ? (
        <>
          <div id="workspace-catalog" className="workspace-anchor-section">
            <DrugCatalogAdminPanel token={token} canManage={canManageCatalog} />
          </div>
          <div className="form-section">
            <h3>Available catalog</h3>
            <div className="patient-list">
              {services.map((service) => (
                <div className="patient-row" key={service.id}>
                  <span>
                    <strong>{service.nameEn}</strong>
                    <small>
                      {service.code} · {formatEgp(service.priceEgp)}
                    </small>
                  </span>
                  <span className="status ok">Active</span>
                </div>
              ))}
              {packages.map((pkg) => (
                <div className="patient-row" key={pkg.id}>
                  <span>
                    <strong>{pkg.nameEn}</strong>
                    <small>
                      {pkg.code} · {formatEgp(pkg.priceEgp)}
                    </small>
                  </span>
                  <span className="status ok">{pkg.status}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
      {canWriteBilling ? (
        <form
          className="form-section"
          onSubmit={(event) => void createInvoice(event)}
        >
          <h3>{t("Create bill", "إنشاء فاتورة")}</h3>
          <div className="form-grid">
            <PatientLookup
              token={token}
              selectedPatient={selectedBillingPatient}
              onSelect={(patient) => void selectBillingPatient(patient)}
              onClear={() => {
                setSelectedBillingPatient(null);
                setBillingAppointments([]);
                setSelectedBillingAppointmentId("");
              }}
              label={t(
                "Which patient is this bill for?",
                "لأي مريض هذه الفاتورة؟",
              )}
              helper={t(
                "Find the patient before choosing a service or payment.",
                "ابحث عن المريض قبل اختيار الخدمة أو الدفع.",
              )}
            />
            {billingAppointments.length > 0 ? (
              <label>
                {t("Link to appointment (optional)", "ربط بالموعد (اختياري)")}
                <select
                  value={selectedBillingAppointmentId}
                  onChange={(event) =>
                    setSelectedBillingAppointmentId(event.target.value)
                  }
                >
                  <option value="">
                    {t("No appointment link", "بدون ربط بموعد")}
                  </option>
                  {billingAppointments.map((appointment) => (
                    <option key={appointment.id} value={appointment.id}>
                      {new Date(appointment.scheduledStart).toLocaleString()} ·{" "}
                      {formatVisitTypeLabel(appointment.visitType, locale)} ·{" "}
                      {formatStatusLabel(appointment.status, locale)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              {t("Service", "الخدمة")}
              <select
                value={serviceId}
                onChange={(event) => {
                  setServiceId(event.target.value);
                  setPackageId("");
                }}
              >
                <option value="">{t("No service", "بدون خدمة")}</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.nameEn} · {formatEgp(service.priceEgp)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Package", "الباقة")}
              <select
                value={packageId}
                onChange={(event) => {
                  setPackageId(event.target.value);
                  setServiceId("");
                }}
              >
                <option value="">{t("No package", "بدون باقة")}</option>
                {packages
                  .filter((pkg) => pkg.status === "active")
                  .map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.nameEn} · {formatEgp(pkg.priceEgp)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("Quantity", "الكمية")}
              <input
                required
                min="1"
                type="number"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label>
              {t("Discount (EGP)", "الخصم (جنيه مصري)")}
              <input
                min="0"
                type="number"
                value={discountEgp}
                onChange={(event) => setDiscountEgp(event.target.value)}
              />
            </label>
            <label>
              {t("Discount reason", "سبب الخصم")}
              <input
                value={discountReason}
                onChange={(event) => setDiscountReason(event.target.value)}
              />
            </label>
          </div>
          <button
            className="button primary"
            type="submit"
            disabled={isBusy || (!serviceId && !packageId)}
          >
            {t("Create bill", "إنشاء فاتورة")}
          </button>
        </form>
      ) : null}
      <div className="form-section">
        <h3>{t("Invoices", "الفواتير")}</h3>
        <div className="patient-list">
          {invoices.map((invoice) => (
            <button
              className="patient-row"
              type="button"
              key={invoice.id}
              onClick={() => setSelectedInvoiceId(invoice.id)}
            >
              <span>
                <strong>{invoice.invoiceNumber}</strong>
                <small>
                  {invoice.patientId} · {invoice.status}
                </small>
              </span>
              <span>
                <strong>{formatEgp(invoice.totalEgp)}</strong>
                <small>
                  Paid {formatEgp(invoice.paidEgp)} · Balance{" "}
                  {formatEgp(invoice.balanceEgp)}
                </small>
              </span>
            </button>
          ))}
          {invoices.length === 0 ? (
            <p className="muted">
              {t("No invoices recorded yet.", "لا توجد فواتير مسجلة بعد.")}
            </p>
          ) : null}
        </div>
      </div>
      {selectedInvoiceId && canWriteBilling ? (
        <form
          className="form-section"
          onSubmit={(event) => void postPayment(event)}
        >
          <h3>
            {t(
              "Take payment and issue receipt",
              "استلام الدفعة وإصدار الإيصال",
            )}
          </h3>
          <div className="form-grid">
            <label>
              {t("Invoice", "الفاتورة")}
              <select
                value={selectedInvoiceId}
                onChange={(event) => setSelectedInvoiceId(event.target.value)}
              >
                {invoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoiceNumber} · Balance{" "}
                    {formatEgp(invoice.balanceEgp)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Amount (EGP)", "المبلغ (جنيه مصري)")}
              <input
                required
                min="1"
                type="number"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </label>
            <label>
              {t("Method", "طريقة الدفع")}
              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(
                    event.target.value as BillingPaymentInput["method"],
                  )
                }
              >
                <option value="cash">{t("Cash", "نقدي")}</option>
                <option value="card">{t("Card", "بطاقة")}</option>
                <option value="bank-transfer">
                  {t("Bank transfer", "تحويل بنكي")}
                </option>
                <option value="other">{t("Other", "أخرى")}</option>
              </select>
            </label>
            <label>
              {t("Reference", "المرجع")}
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </label>
          </div>
          <button className="button primary" type="submit" disabled={isBusy}>
            {t("Take payment", "استلام الدفعة")}
          </button>
        </form>
      ) : null}
      {selectedInvoiceId && canRefund ? (
        <form
          className="form-section"
          onSubmit={(event) => void postRefund(event)}
        >
          <h3>{t("Correct a payment", "تصحيح دفعة")}</h3>
          <div className="form-grid">
            <label>
              {t("Payment ID", "معرّف الدفعة")}
              <input
                required
                value={refundPaymentId}
                onChange={(event) => setRefundPaymentId(event.target.value)}
              />
            </label>
            <label>
              {t("Refund amount (EGP)", "مبلغ الاسترداد (جنيه مصري)")}
              <input
                required
                min="1"
                type="number"
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
              />
            </label>
            <label>
              Reason
              <input
                required
                minLength={3}
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
              />
            </label>
          </div>
          <button className="button danger" type="submit" disabled={isBusy}>
            {t("Record correction", "تسجيل التصحيح")}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function DoctorWorkspace({
  token,
  session,
}: {
  token: string;
  session: SessionSummary;
}): ReactElement {
  const [profiles, setProfiles] = useState<readonly DoctorProfile[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [documents, setDocuments] = useState<readonly DoctorDocument[]>([]);
  const [form, setForm] = useState<DoctorProfileUpdateInput | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] =
    useState<DoctorDocumentUploadInput["documentType"]>("other");
  const [documentName, setDocumentName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [viewer, setViewer] = useState<{
    url: string;
    name: string;
    mimeType: string;
  } | null>(null);
  const canEditSelected =
    session.role === "admin" || session.userId === selectedDoctorId;
  const canManageDocuments =
    session.role === "admin" || session.userId === selectedDoctorId;

  const loadDoctor = async (doctorId: string): Promise<void> => {
    if (!doctorId) return;
    setError(null);
    try {
      const [nextProfile, nextDocuments] = await Promise.all([
        window.elite.doctor.getProfile(token, doctorId),
        window.elite.doctor.listDocuments(
          token,
          doctorId,
          session.role === "admin",
        ),
      ]);
      setSelectedDoctorId(doctorId);
      setProfile(nextProfile);
      setDocuments(nextDocuments);
      setForm({
        doctorId,
        displayNameEn: nextProfile.displayNameEn,
        displayNameAr: nextProfile.displayNameAr ?? null,
        professionalRegistrationNumber:
          nextProfile.professionalRegistrationNumber ?? null,
        licenseExpiry: nextProfile.licenseExpiry ?? null,
        specialtyIds: nextProfile.specialtyIds,
        departmentIds: nextProfile.departmentIds,
        qualifications: nextProfile.qualifications ?? null,
        biography: nextProfile.biography ?? null,
        languages: nextProfile.languages,
        phone: nextProfile.phone ?? null,
        email: nextProfile.email ?? null,
        clinicRoom: nextProfile.clinicRoom ?? null,
        consultationFeeEgp: nextProfile.consultationFeeEgp ?? null,
        licenseVerificationStatus: nextProfile.licenseVerificationStatus,
        isClinicalApprover: nextProfile.isClinicalApprover,
        isActive: nextProfile.isActive,
      });
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load doctor profile",
      );
    }
  };

  const loadProfiles = async (): Promise<void> => {
    try {
      const nextProfiles = await window.elite.doctor.listProfiles(token);
      setProfiles(nextProfiles);
      const preferred =
        session.role === "doctor"
          ? session.userId
          : (nextProfiles[0]?.doctorId ?? "");
      if (preferred) await loadDoctor(preferred);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load doctor profiles",
      );
    }
  };

  useEffect(() => {
    void loadProfiles();
    return () => {
      if (viewer) URL.revokeObjectURL(viewer.url);
    };
  }, [token]);

  const saveProfile = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!form || !canEditSelected) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const editablePayload: DoctorProfileUpdateInput =
        session.role === "admin"
          ? form
          : {
              doctorId: form.doctorId,
              displayNameEn: form.displayNameEn,
              displayNameAr: form.displayNameAr,
              professionalRegistrationNumber:
                form.professionalRegistrationNumber,
              licenseExpiry: form.licenseExpiry,
              qualifications: form.qualifications,
              biography: form.biography,
              languages: form.languages,
              phone: form.phone,
              email: form.email,
              clinicRoom: form.clinicRoom,
            };
      const updated = await window.elite.doctor.updateProfile(
        token,
        editablePayload,
      );
      setProfile(updated);
      setNotice("Doctor profile saved.");
      await loadProfiles();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save doctor profile",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const upload = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedFile || !selectedDoctorId || !canManageDocuments) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const bytes = new Uint8Array(await selectedFile.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      await window.elite.doctor.uploadDocument(token, {
        doctorId: selectedDoctorId,
        documentType,
        displayName: documentName.trim() || selectedFile.name,
        fileName: selectedFile.name,
        mimeType: selectedFile.type as DoctorDocumentUploadInput["mimeType"],
        contentBase64: btoa(binary),
      });
      setSelectedFile(null);
      setDocumentName("");
      setNotice("Document encrypted and stored on the Windows Hub.");
      await loadDoctor(selectedDoctorId);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to upload doctor document",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const viewDocument = async (documentId: string): Promise<void> => {
    setError(null);
    try {
      const content = await window.elite.doctor.viewDocument(token, documentId);
      if (viewer) URL.revokeObjectURL(viewer.url);
      const bytes = Uint8Array.from(atob(content.contentBase64), (character) =>
        character.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: content.mimeType }),
      );
      setViewer({ url, name: content.fileName, mimeType: content.mimeType });
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to view document",
      );
    }
  };

  const archiveDocument = async (documentId: string): Promise<void> => {
    if (!canManageDocuments) return;
    setIsBusy(true);
    try {
      await window.elite.doctor.archiveDocument(token, documentId);
      await loadDoctor(selectedDoctorId);
      setNotice("Document version archived.");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to archive document",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const updateForm = <K extends keyof DoctorProfileUpdateInput>(
    key: K,
    value: DoctorProfileUpdateInput[K],
  ): void => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  return (
    <section
      className="card doctor-workspace"
      aria-labelledby="doctor-workspace-title"
    >
      <div className="card-heading">
        <div>
          <p className="eyebrow">Staff records</p>
          <h2 id="doctor-workspace-title">Doctor profiles and documents</h2>
        </div>
        <span className="status ok">Windows Hub vault</span>
      </div>
      <p className="form-help">
        Documents are encrypted and stored on the Windows Hub. Android access is
        streamed over the secured LAN session and is not stored on Android.
      </p>
      <ErrorMessage message={error} />
      {notice ? <p className="success">{notice}</p> : null}
      <div className="doctor-profile-grid" aria-label="Doctor profiles">
        {profiles.length === 0 ? (
          <p className="muted">No doctor profiles are available.</p>
        ) : null}
        {profiles.map((item) => {
          const initials = item.displayNameEn.trim().slice(0, 2).toUpperCase();
          const fee =
            item.consultationFeeEgp == null
              ? "Fee not set"
              : new Intl.NumberFormat("en-EG", {
                  style: "currency",
                  currency: "EGP",
                  maximumFractionDigits: 0,
                }).format(item.consultationFeeEgp);
          return (
            <button
              className={`doctor-profile-card${selectedDoctorId === item.doctorId ? " is-selected" : ""}`}
              type="button"
              disabled={isBusy}
              aria-pressed={selectedDoctorId === item.doctorId}
              onClick={() => void loadDoctor(item.doctorId)}
            >
              <span className="doctor-profile-card-heading">
                <span className="doctor-avatar" aria-hidden="true">
                  {initials || "DR"}
                </span>
                <span>
                  <strong>{item.displayNameEn}</strong>
                  <small>
                    {item.displayNameAr ?? "Arabic name not recorded"}
                  </small>
                </span>
              </span>
              <span className="doctor-profile-card-facts">
                <span>{item.specialtyIds.length} specialties</span>
                <span>{item.clinicRoom ?? "Room not assigned"}</span>
                <span dir="ltr">{fee}</span>
              </span>
              <span className="doctor-profile-card-footer">
                <span className={`status ${item.isActive ? "ok" : "warn"}`}>
                  {item.isActive ? "Active" : "Inactive"}
                </span>
                <span className="doctor-license-state">
                  License: {item.licenseVerificationStatus}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {profile && form ? (
        <>
          <form
            className="form-section"
            onSubmit={(event) => void saveProfile(event)}
          >
            <h3>Profile</h3>
            <div className="form-grid">
              <label>
                English name
                <input
                  disabled={!canEditSelected}
                  value={String(form.displayNameEn ?? "")}
                  onChange={(event) =>
                    updateForm("displayNameEn", event.target.value)
                  }
                />
              </label>
              <label>
                Arabic name
                <input
                  disabled={!canEditSelected}
                  value={String(form.displayNameAr ?? "")}
                  onChange={(event) =>
                    updateForm("displayNameAr", event.target.value || null)
                  }
                />
              </label>
              <label>
                Registration number
                <input
                  disabled={!canEditSelected}
                  value={String(form.professionalRegistrationNumber ?? "")}
                  onChange={(event) =>
                    updateForm(
                      "professionalRegistrationNumber",
                      event.target.value || null,
                    )
                  }
                />
              </label>
              <label>
                License expiry
                <input
                  disabled={!canEditSelected}
                  type="date"
                  value={String(form.licenseExpiry ?? "").slice(0, 10)}
                  onChange={(event) =>
                    updateForm(
                      "licenseExpiry",
                      event.target.value
                        ? `${event.target.value}T00:00:00.000Z`
                        : null,
                    )
                  }
                />
              </label>
              <label>
                Phone
                <input
                  disabled={!canEditSelected}
                  value={String(form.phone ?? "")}
                  onChange={(event) =>
                    updateForm("phone", event.target.value || null)
                  }
                />
              </label>
              <label>
                Email
                <input
                  disabled={!canEditSelected}
                  type="email"
                  value={String(form.email ?? "")}
                  onChange={(event) =>
                    updateForm("email", event.target.value || null)
                  }
                />
              </label>
              <label>
                Clinic room
                <input
                  disabled={!canEditSelected}
                  value={String(form.clinicRoom ?? "")}
                  onChange={(event) =>
                    updateForm("clinicRoom", event.target.value || null)
                  }
                />
              </label>
              <label>
                Languages
                <input
                  disabled={!canEditSelected}
                  value={(form.languages ?? []).join(", ")}
                  onChange={(event) =>
                    updateForm(
                      "languages",
                      event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </label>
              <label>
                Qualifications
                <textarea
                  disabled={!canEditSelected}
                  value={String(form.qualifications ?? "")}
                  onChange={(event) =>
                    updateForm("qualifications", event.target.value || null)
                  }
                />
              </label>
              <label>
                Biography
                <textarea
                  disabled={!canEditSelected}
                  value={String(form.biography ?? "")}
                  onChange={(event) =>
                    updateForm("biography", event.target.value || null)
                  }
                />
              </label>
              {session.role === "admin" ? (
                <>
                  <label>
                    License verification
                    <select
                      value={String(form.licenseVerificationStatus)}
                      onChange={(event) =>
                        updateForm(
                          "licenseVerificationStatus",
                          event.target
                            .value as DoctorProfileUpdateInput["licenseVerificationStatus"],
                        )
                      }
                    >
                      <option value="unverified">Unverified</option>
                      <option value="pending">Pending</option>
                      <option value="verified">Verified</option>
                      <option value="expired">Expired</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <label>
                    Consultation fee (EGP)
                    <input
                      type="number"
                      min="0"
                      value={String(form.consultationFeeEgp ?? "")}
                      onChange={(event) =>
                        updateForm(
                          "consultationFeeEgp",
                          event.target.value
                            ? Number(event.target.value)
                            : null,
                        )
                      }
                    />
                  </label>
                  <label>
                    Specialty IDs
                    <input
                      value={(form.specialtyIds ?? []).join(", ")}
                      onChange={(event) =>
                        updateForm(
                          "specialtyIds",
                          event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  </label>
                  <label>
                    Department IDs
                    <input
                      value={(form.departmentIds ?? []).join(", ")}
                      onChange={(event) =>
                        updateForm(
                          "departmentIds",
                          event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  </label>

                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(form.isClinicalApprover)}
                      onChange={(event) =>
                        updateForm("isClinicalApprover", event.target.checked)
                      }
                    />{" "}
                    Clinical approver
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(form.isActive)}
                      onChange={(event) =>
                        updateForm("isActive", event.target.checked)
                      }
                    />{" "}
                    Active account
                  </label>
                </>
              ) : null}
            </div>
            {canEditSelected ? (
              <button
                className="button primary"
                type="submit"
                disabled={isBusy}
              >
                Save profile
              </button>
            ) : (
              <p className="form-help">Read-only view for this account.</p>
            )}
          </form>
          <section id="workspace-documents" className="form-section">
            <h3>Documents</h3>
            <div className="list-stack">
              {documents.map((document) => (
                <article className="list-item" key={document.documentId}>
                  <div>
                    <strong>{document.displayName}</strong>
                    <span>
                      {document.documentType} · version {document.version} ·{" "}
                      {Math.ceil(document.sizeBytes / 1024)} KB ·{" "}
                      {document.status}
                    </span>
                  </div>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => void viewDocument(document.documentId)}
                    >
                      View temporarily
                    </button>
                    {canManageDocuments && document.status === "active" ? (
                      <button
                        className="button danger"
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void archiveDocument(document.documentId)
                        }
                      >
                        Archive
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {!documents.length ? (
                <p className="form-help">
                  No documents are stored for this doctor.
                </p>
              ) : null}
            </div>
            {canManageDocuments ? (
              <form
                className="form-section"
                onSubmit={(event) => void upload(event)}
              >
                <h4>Upload or replace document</h4>
                <div className="form-grid">
                  <label>
                    Document type
                    <select
                      value={documentType}
                      onChange={(event) =>
                        setDocumentType(
                          event.target
                            .value as DoctorDocumentUploadInput["documentType"],
                        )
                      }
                    >
                      {[
                        "national-id",
                        "passport",
                        "medical-degree",
                        "professional-license",
                        "specialty-certificate",
                        "cv",
                        "employment-contract",
                        "training-certificate",
                        "profile-photo",
                        "other",
                      ].map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Display name
                    <input
                      value={documentName}
                      onChange={(event) => setDocumentName(event.target.value)}
                    />
                  </label>
                  <label>
                    File
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        setSelectedFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                </div>
                <button
                  className="button primary"
                  type="submit"
                  disabled={isBusy || !selectedFile}
                >
                  Encrypt and store
                </button>
              </form>
            ) : null}
          </section>
          {viewer ? (
            <section className="form-section">
              <h3>Temporary document viewer: {viewer.name}</h3>
              {viewer.mimeType === "application/pdf" ? (
                <iframe
                  title={viewer.name}
                  src={viewer.url}
                  style={{ width: "100%", minHeight: 560 }}
                />
              ) : (
                <img
                  alt={viewer.name}
                  src={viewer.url}
                  style={{ maxWidth: "100%", maxHeight: 560 }}
                />
              )}
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(viewer.url);
                  setViewer(null);
                }}
              >
                Close and erase viewer
              </button>
            </section>
          ) : null}
        </>
      ) : (
        <p className="form-help">Select a doctor to view the profile.</p>
      )}
    </section>
  );
}

function WorkspaceSection({
  id,
  children,
}: {
  id: string;
  children: ReactElement;
}): ReactElement {
  return (
    <section id={id} className="workspace-section">
      {children}
    </section>
  );
}

function AuthenticatedView({
  token,
  session,
  locale,
  onLocaleChange,
  theme,
  onThemeChange,
  onLogout,
}: {
  token: string;
  session: SessionSummary;
  locale: InterfaceLocale;
  onLocaleChange: (locale: InterfaceLocale) => void;
  theme: WorkspaceTheme;
  onThemeChange: (theme: WorkspaceTheme) => void;
  onLogout: () => void;
}): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>(
    () => window.location.hash.slice(1) || "workspace-overview",
  );
  const logout = async (): Promise<void> => {
    try {
      await window.elite.auth.logout(token);
      onLogout();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to sign out");
    }
  };

  const openWorkspace = (id: string): void => {
    setActiveSection(id);
    window.history.replaceState(null, "", `#${id}`);
  };

  const canOpenClinicalWorkspace = session.capabilities.some((capability) =>
    [
      "appointment.read",
      "clinical.read",
      "clinical.write",
      "clinical.sign",
      "clinical.approve",
    ].includes(capability),
  );

  const activeWorkspaceIsVisible =
    activeSection === "workspace-overview" ||
    (activeSection === "workspace-patients" &&
      session.capabilities.includes("patient.read")) ||
    (activeSection === "workspace-appointments" &&
      session.capabilities.includes("appointment.read")) ||
    (activeSection === "workspace-doctors" &&
      session.capabilities.includes("doctor.profile.read")) ||
    (activeSection === "workspace-billing" &&
      session.capabilities.includes("billing.read")) ||
    (activeSection === "workspace-reports" &&
      session.capabilities.includes("reports.read")) ||
    (activeSection === "workspace-sync" &&
      session.role === "admin" &&
      session.capabilities.includes("device.manage")) ||
    (["workspace-records", "workspace-settings"].includes(activeSection) &&
      canOpenClinicalWorkspace);

  useEffect(() => {
    if (!activeWorkspaceIsVisible) {
      openWorkspace("workspace-overview");
    }
  }, [activeWorkspaceIsVisible]);

  const isActiveWorkspace = (id: string): boolean => activeSection === id;
  const receptionistOfflineCopy = session.role === "receptionist";
  const savedOnComputer = receptionistOfflineCopy
    ? locale === "ar-EG"
      ? "محفوظ على هذا الكمبيوتر"
      : "Saved on this computer"
    : copy(locale, "localFirst");
  const workingLocally = receptionistOfflineCopy
    ? locale === "ar-EG"
      ? "البيانات محفوظة محلياً"
      : "Saved locally"
    : copy(locale, "workingLocally");
  const offlineDetail = receptionistOfflineCopy
    ? locale === "ar-EG"
      ? "يمكنك متابعة العمل حتى عند انقطاع الشبكة."
      : "You can keep working even when the network is unavailable."
    : copy(locale, "offlineValidDetail");

  return (
    <AppShell
      session={session}
      locale={locale}
      labels={{
        appName: copy(locale, "appName"),
        clinicWorkspace: copy(locale, "clinicWorkspace"),
        localFirst: savedOnComputer,
        workingLocally,
        encryptedStore: copy(locale, "encryptedStore"),
        interfaceLanguage: copy(locale, "interfaceLanguage"),
        visualTheme: locale === "ar-EG" ? "المظهر" : "Theme",
        lightTheme: locale === "ar-EG" ? "فاتح" : "Light",
        darkTheme: locale === "ar-EG" ? "داكن" : "Dark",
        highContrastTheme: locale === "ar-EG" ? "تباين عالٍ" : "High contrast",
        signOut: copy(locale, "signOut"),
        workspaceLabel: locale === "ar-EG" ? "مساحة العمل" : "Workspace",
        primaryNavigationLabel:
          locale === "ar-EG" ? "التنقل الرئيسي" : "Primary navigation",
        expandNavigation:
          locale === "ar-EG" ? "توسيع التنقل" : "Expand navigation",
        collapseNavigation:
          locale === "ar-EG" ? "طيّ التنقل" : "Collapse navigation",
        todayGroup: copy(locale, "todayGroup"),
        frontDeskGroup: copy(locale, "frontDeskGroup"),
        clinicalGroup: copy(locale, "clinicalGroup"),
        operationsGroup: copy(locale, "operationsGroup"),
        insightsGroup: copy(locale, "insightsGroup"),
        systemGroup: copy(locale, "systemGroup"),
        dashboard: copy(locale, "dashboard"),
        dashboardDetail: copy(locale, "dashboardDetail"),
        patients: copy(locale, "patients"),
        patientsDetail: copy(locale, "patientsDetail"),
        appointments: copy(locale, "appointments"),
        appointmentsDetail: copy(locale, "appointmentsDetail"),
        doctors: copy(locale, "doctors"),
        doctorsDetail: copy(locale, "doctorsDetail"),
        clinicalRecords: copy(locale, "clinicalRecords"),
        clinicalRecordsDetail: copy(locale, "clinicalRecordsDetail"),
        documents: copy(locale, "documents"),
        documentsDetail: copy(locale, "documentsDetail"),
        billing: copy(locale, "billing"),
        billingDetail: copy(locale, "billingDetail"),
        drugCatalog: copy(locale, "drugCatalog"),
        drugCatalogDetail: copy(locale, "drugCatalogDetail"),
        reports: copy(locale, "reports"),
        reportsDetail: copy(locale, "reportsDetail"),
        syncDevices: copy(locale, "syncDevices"),
        syncDevicesDetail: copy(locale, "syncDevicesDetail"),
        adminSettings: copy(locale, "adminSettings"),
        adminSettingsDetail: copy(locale, "adminSettingsDetail"),
      }}
      onLocaleChange={onLocaleChange}
      theme={theme}
      onThemeChange={onThemeChange}
      onLogout={logout}
      activeSection={activeSection}
      onSectionChange={openWorkspace}
    >
      <section
        className="workspace-stack workspace-tabs"
        aria-label="Clinic workspaces"
      >
        <ErrorMessage message={error} />
        {isActiveWorkspace("workspace-overview") ? (
          <TodayWorkspace
            token={token}
            session={session}
            locale={locale}
            labels={{
              todayEyebrow: copy(locale, "todayEyebrow"),
              todayWorkspace: copy(locale, "todayWorkspace"),
              greeting: locale === "ar-EG" ? "" : "Good day",
              findPatient: copy(locale, "findPatient"),
              refreshToday: copy(locale, "refreshToday"),
              refreshing: copy(locale, "refreshing"),
              appointments: copy(locale, "appointments"),
              waiting: copy(locale, "waiting"),
              completed: copy(locale, "completed"),
              nextPatient: copy(locale, "nextPatient"),
              scheduledToday: copy(locale, "scheduledToday"),
              arrivedNotCompleted: copy(locale, "arrivedNotCompleted"),
              closedVisits: copy(locale, "closedVisits"),
              noUpcomingVisit: copy(locale, "noUpcomingVisit"),
              clinicQueue: copy(locale, "clinicQueue"),
              todaysAppointments: copy(locale, "todaysAppointments"),
              localData: copy(locale, "localData"),
              loadingAppointments: copy(locale, "loadingAppointments"),
              noAppointments: copy(locale, "noAppointments"),
              queueDescription: copy(locale, "queueDescription"),
              yourFocus: copy(locale, "yourFocus"),
              calmNextAction: copy(locale, "calmNextAction"),
              patientIdentityFirst: copy(locale, "patientIdentityFirst"),
              patientIdentityFirstDetail: copy(
                locale,
                "patientIdentityFirstDetail",
              ),
              offlineValid: savedOnComputer,
              offlineValidDetail: offlineDetail,
              minuteShort: locale === "ar-EG" ? "دقيقة" : "min",
              quickActions:
                session.role === "receptionist"
                  ? locale === "ar-EG"
                    ? "ماذا تريد أن تفعل؟"
                    : "What do you need to do?"
                  : locale === "ar-EG"
                    ? "اختصارات سريعة"
                    : "Quick actions",
              quickFindPatient:
                locale === "ar-EG" ? "البحث عن مريض" : "Find a patient",
              quickFindPatientDetail:
                locale === "ar-EG"
                  ? "ابحث بالاسم أو الهاتف أو رقم المريض"
                  : "Search by name, phone, or patient number",
              quickAppointments:
                locale === "ar-EG" ? "مواعيد اليوم" : "Today’s appointments",
              quickAppointmentsDetail:
                locale === "ar-EG"
                  ? "سجّل الوصول وتابع قائمة الانتظار"
                  : "Check in patients and follow the queue",
              quickPayment:
                locale === "ar-EG" ? "استلام دفعة" : "Take a payment",
              quickPaymentDetail:
                locale === "ar-EG"
                  ? "اختر المريض وسجّل المبلغ وأصدر الإيصال"
                  : "Choose the patient, record the amount, and issue a receipt",
              frontDeskView: locale === "ar-EG" ? "الاستقبال" : "Front Desk",
              allView: locale === "ar-EG" ? "الكل" : "All",
              departmentFilter: locale === "ar-EG" ? "القسم" : "Department",
              allDepartments:
                locale === "ar-EG" ? "كل الأقسام" : "All departments",
              waitingRoom:
                locale === "ar-EG" ? "غرفة الانتظار" : "Waiting room",
              waitingColumn: locale === "ar-EG" ? "في الانتظار" : "Waiting",
              inConsultationColumn:
                locale === "ar-EG" ? "داخل الكشف" : "In consultation",
              completedColumn: locale === "ar-EG" ? "مكتمل" : "Completed",
              noPatientsInColumn:
                locale === "ar-EG" ? "لا يوجد مرضى هنا" : "No patients here",
              openPatients:
                locale === "ar-EG" ? "البحث عن مريض" : "Find a patient",
              openAppointments:
                locale === "ar-EG" ? "مواعيد اليوم" : "Today’s appointments",
              openDoctors: locale === "ar-EG" ? "الأطباء" : "Doctors",
              openBilling: locale === "ar-EG" ? "استلام دفعة" : "Take payment",
              scheduledDoctors:
                locale === "ar-EG"
                  ? "الأطباء المجدولون اليوم"
                  : "Doctors scheduled today",
              loadingDoctors:
                locale === "ar-EG"
                  ? "جارٍ تحميل الأطباء…"
                  : "Loading scheduled doctors…",
              noDoctorsScheduled:
                locale === "ar-EG"
                  ? "لا توجد جداول أطباء متاحة لهذا اليوم"
                  : "No doctor schedules are available for today",
              billingTitle:
                locale === "ar-EG" ? "ملخص الفوترة" : "Billing snapshot",
              invoicedThisMonth:
                locale === "ar-EG"
                  ? "الفواتير هذا الشهر"
                  : "Invoiced this month",
              collectedThisMonth:
                locale === "ar-EG"
                  ? "المحصّل هذا الشهر"
                  : "Collected this month",
              outstanding: locale === "ar-EG" ? "المتبقي" : "Outstanding",
              openInvoices:
                locale === "ar-EG" ? "الفواتير المفتوحة" : "Open invoices",
              recentInvoices:
                locale === "ar-EG" ? "أحدث الفواتير" : "Recent invoices",
              noRecentInvoices:
                locale === "ar-EG"
                  ? "لا توجد فواتير حديثة"
                  : "No recent invoices",
              invoiceNumber: locale === "ar-EG" ? "رقم الفاتورة" : "Invoice",
              unableToLoadAppointments:
                locale === "ar-EG"
                  ? "تعذر تحميل بيانات اليوم"
                  : "Unable to load today’s appointments",
            }}
            formatDate={(value, options) =>
              formatLocalizedDate(value, locale, options)
            }
            formatTime={(value) => formatLocalizedTime(value, locale)}
            formatStatusLabel={(value) => formatStatusLabel(value, locale)}
            onFindPatient={() => openWorkspace("workspace-patients")}
            onOpenAppointments={() => openWorkspace("workspace-appointments")}
            onOpenDoctors={() => openWorkspace("workspace-doctors")}
            onOpenBilling={() => openWorkspace("workspace-billing")}
          />
        ) : null}
        {session.role === "admin" &&
        session.capabilities.includes("device.manage") &&
        isActiveWorkspace("workspace-sync") ? (
          <WorkspaceSection id="workspace-sync">
            <DevicePanel token={token} />
          </WorkspaceSection>
        ) : null}
        {session.capabilities.includes("patient.read") &&
        isActiveWorkspace("workspace-patients") ? (
          <WorkspaceSection id="workspace-patients">
            <PatientWorkspace
              token={token}
              session={session}
              locale={locale}
              onOpenAppointments={() => openWorkspace("workspace-appointments")}
              onOpenBilling={() => openWorkspace("workspace-billing")}
            />
          </WorkspaceSection>
        ) : null}
        {session.capabilities.includes("billing.read") &&
        isActiveWorkspace("workspace-billing") ? (
          <WorkspaceSection id="workspace-billing">
            <BillingWorkspace token={token} session={session} locale={locale} />
          </WorkspaceSection>
        ) : null}
        {session.capabilities.includes("doctor.profile.read") &&
        isActiveWorkspace("workspace-doctors") ? (
          <WorkspaceSection id="workspace-doctors">
            <DoctorWorkspace token={token} session={session} />
          </WorkspaceSection>
        ) : null}
        {session.capabilities.includes("reports.read") &&
        isActiveWorkspace("workspace-reports") ? (
          <WorkspaceSection id="workspace-reports">
            <ReportsWorkspace
              token={token}
              locale={locale}
              labels={{
                title:
                  locale === "ar-EG"
                    ? "التقارير والتحليلات"
                    : "Reports & analytics",
                detail:
                  locale === "ar-EG"
                    ? "الإيرادات الشهرية واتجاهات المرضى من بيانات مجمعة محلياً."
                    : "Monthly revenue and patient trends from local aggregate data.",
                revenueTitle:
                  locale === "ar-EG" ? "الإيرادات الشهرية" : "Monthly revenue",
                patientTrendsTitle:
                  locale === "ar-EG" ? "اتجاهات المرضى" : "Patient trends",
                invoiced: locale === "ar-EG" ? "الفواتير" : "Invoiced",
                collected: locale === "ar-EG" ? "المحصّل" : "Collected",
                refunded: locale === "ar-EG" ? "المسترد" : "Refunded",
                newPatients: locale === "ar-EG" ? "مرضى جدد" : "New patients",
                appointments: locale === "ar-EG" ? "المواعيد" : "Appointments",
                completedVisits:
                  locale === "ar-EG" ? "الزيارات المكتملة" : "Completed visits",
                refresh: locale === "ar-EG" ? "تحديث" : "Refresh",
                refreshing:
                  locale === "ar-EG" ? "جارٍ التحديث…" : "Refreshing…",
                loading:
                  locale === "ar-EG"
                    ? "جارٍ تحميل التقارير…"
                    : "Loading reports…",
                empty:
                  locale === "ar-EG"
                    ? "لا توجد بيانات تقرير"
                    : "No report data is available",
                unavailable:
                  locale === "ar-EG"
                    ? "التقارير غير متاحة"
                    : "Reports are unavailable",
                month: locale === "ar-EG" ? "الشهر" : "Month",
                localAggregate:
                  locale === "ar-EG" ? "مجمّع محلياً" : "Local aggregate",
              }}
            />
          </WorkspaceSection>
        ) : null}
        {session.capabilities.includes("appointment.read") &&
        [
          "workspace-appointments",
          "workspace-records",
          "workspace-settings",
        ].includes(activeSection) ? (
          <WorkspaceSection id={activeSection}>
            <ClinicalWorkflowWorkspace
              token={token}
              locale={locale}
              canManage={session.capabilities.includes("module.manage")}
              canWriteAppointments={session.capabilities.includes(
                "appointment.write",
              )}
              canReadClinical={session.capabilities.includes("clinical.read")}
              canWriteClinical={session.capabilities.includes("clinical.write")}
              canSignClinical={session.capabilities.includes("clinical.sign")}
              canApproveClinical={session.capabilities.includes(
                "clinical.approve",
              )}
              canRecordDiagnosis={
                session.role === "doctor" &&
                session.capabilities.includes("clinical.write")
              }
              canExport={session.capabilities.includes("export.manage")}
              canSensitiveExport={session.capabilities.includes(
                "export.sensitive",
              )}
              canRevoke={session.capabilities.includes("export.revoke")}
              isReceptionist={session.role === "receptionist"}
            />
          </WorkspaceSection>
        ) : null}
        {session.role === "admin" &&
        session.capabilities.includes("patient.merge") &&
        isActiveWorkspace("workspace-patients") ? (
          <WorkspaceSection id="workspace-patient-review">
            <MergeReviewQueue token={token} />
          </WorkspaceSection>
        ) : null}
      </section>
    </AppShell>
  );
}

function LanSyncRecoveryNotice({
  status,
  token,
  session,
  onStatusChange,
}: {
  status: LanSyncStatus;
  token: string | null;
  session: SessionSummary | null;
  onStatusChange: (status: LanSyncStatus) => void;
}): ReactElement | null {
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRecover =
    session?.role === "admin" &&
    session.capabilities.includes("device.manage") &&
    Boolean(token);

  if (status.state === "ready") return null;

  const retry = async (): Promise<void> => {
    if (!token || !canRecover) return;
    setIsRetrying(true);
    setError(null);
    try {
      onStatusChange(await window.elite.app.restartLanSync(token));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to retry secure LAN synchronization",
      );
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <section
      className="card tls-recovery-card"
      aria-labelledby="lan-sync-title"
    >
      <div className="card-heading">
        <div>
          <p className="eyebrow">Administrator attention</p>
          <h2 id="lan-sync-title">LAN synchronization unavailable</h2>
        </div>
        <span
          className={`status ${status.state === "starting" ? "warn" : "error"}`}
        >
          {status.state === "starting" ? "Starting" : "Action required"}
        </span>
      </div>
      <p className="form-help">
        Android devices cannot synchronize until the Hub’s secure TLS transport
        is available. Patient data remains local and protected while this is
        unresolved.
      </p>
      <p className="error" role="alert">
        {status.message}
      </p>
      {status.lastAttemptAt ? (
        <p className="muted">
          Last attempt: {new Date(status.lastAttemptAt).toLocaleString()}
        </p>
      ) : null}
      {canRecover ? (
        <button
          className="button primary"
          type="button"
          onClick={() => void retry()}
          disabled={isRetrying}
        >
          {isRetrying
            ? "Retrying secure LAN startup…"
            : "Retry secure LAN startup"}
        </button>
      ) : (
        <p className="form-help">
          Sign in with an Admin account that has device-management permission to
          retry after correcting the Hub TLS configuration.
        </p>
      )}
      <ErrorMessage message={error} />
    </section>
  );
}

function FoundationStatus(): ReactElement {
  const [locale, setLocale] = useInterfaceLocale();
  const [theme, setTheme] = useWorkspaceTheme();
  const [security, setSecurity] = useState<EliteSecurityStatus | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.allSettled([
      window.elite.app.getSecurityStatus(),
      window.elite.auth.getStatus(),
    ]).then(([securityResult, authResult]) => {
      if (securityResult.status === "fulfilled") {
        setSecurity(securityResult.value);
      } else {
        setError(
          securityResult.reason instanceof Error
            ? securityResult.reason.message
            : "Unable to read secure service status",
        );
      }
      if (authResult.status === "fulfilled") {
        setAuthStatus(authResult.value);
      } else {
        setError(
          authResult.reason instanceof Error
            ? authResult.reason.message
            : "Unable to read authentication status",
        );
      }
    });
  }, []);

  const handleLogin = (newToken: string, newSession: SessionSummary): void => {
    setToken(newToken);
    setSession(newSession);
  };

  const handleLogout = (): void => {
    setToken(null);
    setSession(null);
  };

  return (
    <main className="shell" aria-labelledby="page-title">
      <header className="header">
        <div>
          <p className="eyebrow">Elite Clinic Management System</p>
          <h1 id="page-title">Secure access foundation</h1>
          <p className="subtitle">
            Authentication, encrypted local storage, patient identity, guardian
            links, duplicate review, and controlled archive workflows are
            connected to the local secure service boundary.
          </p>
        </div>
        <div className="badge">Step 4</div>
      </header>

      <section className="card" aria-labelledby="status-title">
        <div className="card-heading">
          <h2 id="status-title">Foundation status</h2>
          <span
            className={
              security?.secureServicesReady ? "status ok" : "status warn"
            }
          >
            {security?.secureServicesReady
              ? "Secure services ready"
              : "Checking secure services"}
          </span>
        </div>
        <ErrorMessage message={security?.serviceError ?? error} />
        {security ? (
          <dl className="status-grid">
            <div>
              <dt>Electron</dt>
              <dd>{security.electronVersion}</dd>
            </div>
            <div>
              <dt>OS-backed storage</dt>
              <dd>
                {security.safeStorageAvailable ? "Available" : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Database key provider</dt>
              <dd>{security.databaseKeyProvider}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{security.isPackaged ? "Production" : "Development"}</dd>
            </div>
            <div>
              <dt>Local auth</dt>
              <dd>
                {authStatus?.configured ? "Configured" : "Bootstrap required"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="muted">Checking the secure main-process boundary…</p>
        )}
      </section>

      {security ? (
        <LanSyncRecoveryNotice
          status={security.lanSync}
          token={token}
          session={session}
          onStatusChange={(nextStatus) =>
            setSecurity((current) =>
              current ? { ...current, lanSync: nextStatus } : current,
            )
          }
        />
      ) : null}

      {authStatus?.bootstrapRequired ? (
        <BootstrapForm onComplete={setAuthStatus} />
      ) : null}
      {!authStatus?.bootstrapRequired && !session && authStatus?.hubDeviceId ? (
        <LoginForm deviceId={authStatus.hubDeviceId} onLogin={handleLogin} />
      ) : null}
      {token && session ? (
        <AuthenticatedView
          token={token}
          session={session}
          locale={locale}
          onLocaleChange={setLocale}
          theme={theme}
          onThemeChange={setTheme}
          onLogout={handleLogout}
        />
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FoundationStatus />
  </StrictMode>,
);
