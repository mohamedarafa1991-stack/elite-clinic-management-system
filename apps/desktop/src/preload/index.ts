import { contextBridge, ipcRenderer } from "electron";
import type {
  DuplicateCandidate,
  Patient,
  PatientMergeCase,
  PatientMergeFieldDecisions,
  PatientMergeRequest,
  PatientRegistrationInput,
  PatientUpdateInput,
  Specialty,
  Department,
  Service,
  Appointment,
  AppointmentCreateInput,
  AppointmentStatusUpdate,
  Schedule,
  ScheduleInput,
  ScheduleException,
  ScheduleExceptionInput,
} from "@elite/contracts";
import type {
  PatientRelatedPersonLinkSummary,
  PatientSearchFilters,
  RelatedPersonInput,
  RelatedPersonLinkInput,
  RelatedPersonSummary,
} from "@elite/auth";

export interface EliteSecurityStatus {
  electronVersion: string;
  chromiumVersion: string;
  nodeVersion: string;
  safeStorageAvailable: boolean;
  databaseKeyProvider:
    "electron-safe-storage" | "test-in-memory" | "unavailable";
  isPackaged: boolean;
  secureServicesReady: boolean;
  serviceError?: string;
}

export interface AuthStatus {
  configured: boolean;
  bootstrapRequired: boolean;
  hubDeviceId?: string;
}

export interface SessionSummary {
  sessionId: string;
  userId: string;
  username: string;
  role: "admin" | "doctor" | "nurse" | "receptionist";
  deviceId: string;
  capabilities: readonly string[];
  expiresAt: string;
}

export interface DeviceSummary {
  id: string;
  friendlyName: string;
  platform: "windows" | "android";
  appVersion: string;
  apiLevel?: number;
  securityPatchLevel?: string;
  ownerUserId: string;
  status: "pending" | "active" | "revoked" | "wipe-pending";
  lastSeenAt?: string;
  lastSyncAt?: string;
  createdAt: string;
}

export interface EnrollmentRequestSummary {
  requestId: string;
  device: DeviceSummary;
  requestedByUserId: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewedByUserId?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

const eliteApi = {
  app: {
    getSecurityStatus: (): Promise<EliteSecurityStatus> =>
      ipcRenderer.invoke("app:security-status") as Promise<EliteSecurityStatus>,
  },
  patients: {
    search: (token: string, filters?: PatientSearchFilters) =>
      ipcRenderer.invoke("patient:search", token, filters) as Promise<
        readonly Patient[]
      >,
    get: (token: string, patientId: string) =>
      ipcRenderer.invoke("patient:get", token, patientId) as Promise<Patient>,
    findDuplicates: (
      token: string,
      input: PatientRegistrationInput | PatientUpdateInput,
      excludePatientId?: string,
    ) =>
      ipcRenderer.invoke(
        "patient:duplicates",
        token,
        input,
        excludePatientId,
      ) as Promise<readonly DuplicateCandidate[]>,
    create: (
      token: string,
      input: PatientRegistrationInput,
      decisionReason?: string,
    ) =>
      ipcRenderer.invoke(
        "patient:create",
        token,
        input,
        decisionReason,
      ) as Promise<{
        patient: Patient;
        duplicateCandidates: readonly DuplicateCandidate[];
      }>,
    update: (
      token: string,
      patientId: string,
      input: PatientUpdateInput,
      expectedVersion: number,
      decisionReason?: string,
    ) =>
      ipcRenderer.invoke(
        "patient:update",
        token,
        patientId,
        input,
        expectedVersion,
        decisionReason,
      ) as Promise<Patient>,
    archive: (token: string, patientId: string, reason: string) =>
      ipcRenderer.invoke(
        "patient:archive",
        token,
        patientId,
        reason,
      ) as Promise<void>,
    unarchive: (token: string, patientId: string, reason: string) =>
      ipcRenderer.invoke(
        "patient:unarchive",
        token,
        patientId,
        reason,
      ) as Promise<void>,
    requestMerge: (token: string, input: PatientMergeRequest) =>
      ipcRenderer.invoke(
        "patient:merge-request",
        token,
        input,
      ) as Promise<PatientMergeCase>,
    listMergeCases: (token: string) =>
      ipcRenderer.invoke("patient:merge-list", token) as Promise<
        readonly PatientMergeCase[]
      >,
    reviewMerge: (
      token: string,
      caseId: string,
      decision: "approve" | "reject",
      reason: string,
      fieldDecisions?: PatientMergeFieldDecisions,
    ) =>
      ipcRenderer.invoke(
        "patient:merge-review",
        token,
        caseId,
        decision,
        reason,
        fieldDecisions,
      ) as Promise<PatientMergeCase>,
    executeMerge: (token: string, caseId: string) =>
      ipcRenderer.invoke(
        "patient:merge-execute",
        token,
        caseId,
      ) as Promise<PatientMergeCase>,
  },
  clinical: {
    listSpecialties: (token: string) =>
      ipcRenderer.invoke("clinical:specialties", token) as Promise<
        readonly Specialty[]
      >,
    createSpecialty: (token: string, input: unknown) =>
      ipcRenderer.invoke(
        "clinical:specialty-create",
        token,
        input,
      ) as Promise<Specialty>,
    archiveSpecialty: (token: string, id: string, reason: string) =>
      ipcRenderer.invoke(
        "clinical:specialty-archive",
        token,
        id,
        reason,
      ) as Promise<void>,
    listDepartments: (token: string) =>
      ipcRenderer.invoke("clinical:departments", token) as Promise<
        readonly Department[]
      >,
    createDepartment: (token: string, input: unknown) =>
      ipcRenderer.invoke(
        "clinical:department-create",
        token,
        input,
      ) as Promise<Department>,
    listServices: (token: string) =>
      ipcRenderer.invoke("clinical:services", token) as Promise<
        readonly Service[]
      >,
    createService: (token: string, input: unknown) =>
      ipcRenderer.invoke(
        "clinical:service-create",
        token,
        input,
      ) as Promise<Service>,
    listSchedules: (token: string) =>
      ipcRenderer.invoke("clinical:schedules", token) as Promise<
        readonly Schedule[]
      >,
    listExceptions: (token: string) =>
      ipcRenderer.invoke("clinical:exceptions", token) as Promise<
        readonly ScheduleException[]
      >,
    createSchedule: (token: string, input: ScheduleInput) =>
      ipcRenderer.invoke(
        "clinical:schedule-create",
        token,
        input,
      ) as Promise<void>,
    deleteSchedule: (token: string, id: string, reason: string) =>
      ipcRenderer.invoke(
        "clinical:schedule-delete",
        token,
        id,
        reason,
      ) as Promise<void>,
    createException: (token: string, input: ScheduleExceptionInput) =>
      ipcRenderer.invoke(
        "clinical:exception-create",
        token,
        input,
      ) as Promise<void>,
    deleteException: (token: string, id: string, reason: string) =>
      ipcRenderer.invoke(
        "clinical:exception-delete",
        token,
        id,
        reason,
      ) as Promise<void>,
    listAppointments: (token: string, from?: string, to?: string) =>
      ipcRenderer.invoke("clinical:appointments", token, from, to) as Promise<
        readonly Appointment[]
      >,
    createAppointment: (token: string, input: AppointmentCreateInput) =>
      ipcRenderer.invoke(
        "clinical:appointment-create",
        token,
        input,
      ) as Promise<Appointment>,
    updateAppointmentStatus: (
      token: string,
      id: string,
      input: AppointmentStatusUpdate,
    ) =>
      ipcRenderer.invoke(
        "clinical:appointment-status",
        token,
        id,
        input,
      ) as Promise<Appointment>,
  },
  relatedPersons: {
    create: (token: string, input: RelatedPersonInput) =>
      ipcRenderer.invoke(
        "related-person:create",
        token,
        input,
      ) as Promise<RelatedPersonSummary>,
    update: (
      token: string,
      relatedPersonId: string,
      input: RelatedPersonInput,
      expectedVersion: number,
    ) =>
      ipcRenderer.invoke(
        "related-person:update",
        token,
        relatedPersonId,
        input,
        expectedVersion,
      ) as Promise<RelatedPersonSummary>,
    list: (token: string, patientId: string) =>
      ipcRenderer.invoke("related-person:list", token, patientId) as Promise<
        readonly RelatedPersonSummary[]
      >,
    listLinks: (token: string, patientId: string) =>
      ipcRenderer.invoke("patient:related-links", token, patientId) as Promise<
        readonly PatientRelatedPersonLinkSummary[]
      >,
    link: (
      token: string,
      patientId: string,
      relatedPersonId: string,
      input: RelatedPersonLinkInput,
    ) =>
      ipcRenderer.invoke(
        "patient:related-link",
        token,
        patientId,
        relatedPersonId,
        input,
      ) as Promise<PatientRelatedPersonLinkSummary>,
    updateLink: (
      token: string,
      patientId: string,
      relatedPersonId: string,
      input: RelatedPersonLinkInput,
    ) =>
      ipcRenderer.invoke(
        "patient:related-link-update",
        token,
        patientId,
        relatedPersonId,
        input,
      ) as Promise<PatientRelatedPersonLinkSummary>,
    unlink: (
      token: string,
      patientId: string,
      relatedPersonId: string,
      reason: string,
    ) =>
      ipcRenderer.invoke(
        "patient:related-link-unlink",
        token,
        patientId,
        relatedPersonId,
        reason,
      ) as Promise<void>,
  },
  auth: {
    getStatus: (): Promise<AuthStatus> =>
      ipcRenderer.invoke("auth:status") as Promise<AuthStatus>,
    bootstrap: (
      input: unknown,
    ): Promise<{ adminUserIds: readonly string[]; hubDeviceId: string }> =>
      ipcRenderer.invoke("auth:bootstrap", input) as Promise<{
        adminUserIds: readonly string[];
        hubDeviceId: string;
      }>,
    login: (
      input: unknown,
    ): Promise<{ token: string; session: SessionSummary }> =>
      ipcRenderer.invoke("auth:login", input) as Promise<{
        token: string;
        session: SessionSummary;
      }>,
    getSession: (token: string): Promise<SessionSummary> =>
      ipcRenderer.invoke("auth:session", token) as Promise<SessionSummary>,
    logout: (token: string): Promise<void> =>
      ipcRenderer.invoke("auth:logout", token) as Promise<void>,
    listDevices: (token: string): Promise<readonly DeviceSummary[]> =>
      ipcRenderer.invoke("auth:devices", token) as Promise<
        readonly DeviceSummary[]
      >,
    listEnrollmentRequests: (
      token: string,
    ): Promise<readonly EnrollmentRequestSummary[]> =>
      ipcRenderer.invoke("auth:enrollment-requests", token) as Promise<
        readonly EnrollmentRequestSummary[]
      >,
    requestDevice: (
      token: string,
      input: unknown,
    ): Promise<{ requestId: string; deviceId: string; status: string }> =>
      ipcRenderer.invoke("auth:device-request", token, input) as Promise<{
        requestId: string;
        deviceId: string;
        status: string;
      }>,
    approveDevice: (token: string, requestId: string): Promise<void> =>
      ipcRenderer.invoke(
        "auth:device-approve",
        token,
        requestId,
      ) as Promise<void>,
    rejectDevice: (
      token: string,
      requestId: string,
      reason: string,
    ): Promise<void> =>
      ipcRenderer.invoke(
        "auth:device-reject",
        token,
        requestId,
        reason,
      ) as Promise<void>,
    revokeDevice: (
      token: string,
      deviceId: string,
      reason: string,
    ): Promise<void> =>
      ipcRenderer.invoke(
        "auth:device-revoke",
        token,
        deviceId,
        reason,
      ) as Promise<void>,
  },
};

contextBridge.exposeInMainWorld("elite", eliteApi);

declare global {
  interface Window {
    elite: typeof eliteApi;
  }
}
