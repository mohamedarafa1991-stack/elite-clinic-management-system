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
  DoctorDirectoryEntry,
  DoctorProfile,
  DoctorProfileUpdateInput,
  DoctorDocument,
  DoctorDocumentContent,
  DoctorDocumentUploadInput,
  MedicalHistoryEntry,
  MedicalHistoryInput,
  Diagnosis,
  DiagnosisInput,
  EncounterAmendmentDiff,
  ProjectionSnapshot,
  ProjectionSnapshotInput,
  EncounterAmendment,
  EncounterAmendmentInput,
  EffectiveEncounter,
  ExportResult,
  ExportZipPackage,
  ExportRevocation,
  ExportPackageRegistryRecord,
  ExportPackageLifecycleEvent,
  ExportRegistryListInput,
  ExportRegistryTransitionInput,
  ExportSigningKeyMetadata,
  ExportSigningKeyRecoveryBundle,
  FhirValidationResult,
  FhirProfileBundle,
  FhirProfileBundleRecord,
  OrgSettings,
  OrgSettingsInput,
  PatientExportInput,
  ExportVerificationInput,
  ExportVerificationResult,
  Encounter,
  EncounterInput,
  Icd10Code,
  Icd10CodeInput,
  AppointmentStatusUpdate,
  BillingInvoice,
  BillingInvoiceCreateInput,
  BillingPackage,
  BillingPayment,
  BillingPaymentInput,
  BillingReceipt,
  BillingRefund,
  BillingRefundInput,
  Schedule,
  ScheduleInput,
  ScheduleException,
  ScheduleExceptionInput,
  ExportRecipient,
  ExportRecipientCreateInput,
  ExportConsentEvidence,
  ExportConsentEvidenceCreateInput,
  ExportDisclosure,
  ExportDisclosureDecision,
  ExportDisclosureRequest,
  ExportReceipt,
  SyncCapabilityRequest,
  SyncCapabilityResponse,
  SyncDeltaRequest,
  SyncDeltaResponse,
  SyncDevicePolicy,
  SyncDeviceRegistrationInput,
  SyncOutboxAcknowledgment,
  SyncOutboxInput,
  EnrollmentAcknowledgment,
  EnrollmentChallenge,
  EnrollmentChallengeCreateInput,
  EnrollmentDeviceRequest,
  EnrollmentResponse,
  EnrollmentStateSummary,
  DrugCatalogEntry,
  DrugCatalogImportInput,
  DrugCatalogRemoteImportInput,
  DrugCatalogSnapshot,
  DrugCatalogSnapshotTransitionInput,
} from "@elite/contracts";
import type {
  PatientRelatedPersonLinkSummary,
  PatientSearchFilters,
  RelatedPersonInput,
  RelatedPersonLinkInput,
  RelatedPersonSummary,
} from "@elite/auth";

export interface LanSyncStatus {
  state: "starting" | "ready" | "failed" | "unavailable";
  message: string;
  lastAttemptAt?: string;
}

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
  lanSync: LanSyncStatus;
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
  medicalHistory: {
    list: (token: string, patientId: string) =>
      ipcRenderer.invoke("medical-history:list", token, patientId) as Promise<
        readonly MedicalHistoryEntry[]
      >,
    create: (token: string, patientId: string, input: MedicalHistoryInput) =>
      ipcRenderer.invoke(
        "medical-history:create",
        token,
        patientId,
        input,
      ) as Promise<MedicalHistoryEntry>,
    update: (
      token: string,
      patientId: string,
      entryId: string,
      input: MedicalHistoryInput,
      expectedVersion: number,
    ) =>
      ipcRenderer.invoke(
        "medical-history:update",
        token,
        patientId,
        entryId,
        input,
        expectedVersion,
      ) as Promise<MedicalHistoryEntry>,
    archive: (
      token: string,
      patientId: string,
      entryId: string,
      expectedVersion: number,
      reason: string,
    ) =>
      ipcRenderer.invoke(
        "medical-history:archive",
        token,
        patientId,
        entryId,
        expectedVersion,
        reason,
      ) as Promise<void>,
  },
  app: {
    getSecurityStatus: (): Promise<EliteSecurityStatus> =>
      ipcRenderer.invoke("app:security-status") as Promise<EliteSecurityStatus>,
    restartLanSync: (token: string): Promise<LanSyncStatus> =>
      ipcRenderer.invoke(
        "app:lan-sync-restart",
        token,
      ) as Promise<LanSyncStatus>,
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
    listIcd10Codes: (token: string) =>
      ipcRenderer.invoke("clinical:icd10", token) as Promise<
        readonly Icd10Code[]
      >,
    createIcd10Code: (token: string, input: Icd10CodeInput) =>
      ipcRenderer.invoke(
        "clinical:icd10-create",
        token,
        input,
      ) as Promise<Icd10Code>,
    getEncounterForAppointment: (token: string, appointmentId: string) =>
      ipcRenderer.invoke(
        "clinical:encounter-by-appointment",
        token,
        appointmentId,
      ) as Promise<Encounter | null>,
    createExport: (token: string, input: PatientExportInput) =>
      ipcRenderer.invoke(
        "export:create",
        token,
        input,
      ) as Promise<ExportResult>,
    verifyExport: (input: ExportVerificationInput) =>
      ipcRenderer.invoke(
        "export:verify",
        input,
      ) as Promise<ExportVerificationResult>,
    getEffectiveEncounterForAppointment: (
      token: string,
      appointmentId: string,
    ) =>
      ipcRenderer.invoke(
        "clinical:encounter-effective-by-appointment",
        token,
        appointmentId,
      ) as Promise<EffectiveEncounter | null>,
    createEncounter: (
      token: string,
      appointmentId: string,
      input: EncounterInput,
    ) =>
      ipcRenderer.invoke(
        "clinical:encounter-create",
        token,
        appointmentId,
        input,
      ) as Promise<Encounter>,
    updateEncounter: (
      token: string,
      encounterId: string,
      input: EncounterInput,
      expectedVersion: number,
    ) =>
      ipcRenderer.invoke(
        "clinical:encounter-update",
        token,
        encounterId,
        input,
        expectedVersion,
      ) as Promise<Encounter>,
    signEncounter: (
      token: string,
      encounterId: string,
      expectedVersion: number,
    ) =>
      ipcRenderer.invoke(
        "clinical:encounter-sign",
        token,
        encounterId,
        expectedVersion,
      ) as Promise<Encounter>,
    listAmendmentDiffs: (token: string, encounterId: string) =>
      ipcRenderer.invoke(
        "clinical:amendment-diffs",
        token,
        encounterId,
      ) as Promise<readonly EncounterAmendmentDiff[]>,
    createProjectionSnapshot: (
      token: string,
      encounterId: string,
      input: ProjectionSnapshotInput,
    ) =>
      ipcRenderer.invoke(
        "clinical:projection-snapshot-create",
        token,
        encounterId,
        input,
      ) as Promise<ProjectionSnapshot>,
    listProjectionSnapshots: (token: string, encounterId: string) =>
      ipcRenderer.invoke(
        "clinical:projection-snapshots",
        token,
        encounterId,
      ) as Promise<readonly ProjectionSnapshot[]>,
    listAmendments: (token: string, encounterId: string) =>
      ipcRenderer.invoke("clinical:amendments", token, encounterId) as Promise<
        readonly EncounterAmendment[]
      >,
    createAmendment: (
      token: string,
      encounterId: string,
      input: EncounterAmendmentInput,
    ) =>
      ipcRenderer.invoke(
        "clinical:amendment-create",
        token,
        encounterId,
        input,
      ) as Promise<EncounterAmendment>,
    reviewAmendment: (
      token: string,
      amendmentId: string,
      decision: "approved" | "rejected",
      reason: string,
      expectedVersion: number,
    ) =>
      ipcRenderer.invoke(
        "clinical:amendment-review",
        token,
        amendmentId,
        decision,
        reason,
        expectedVersion,
      ) as Promise<EncounterAmendment>,
    resolveAmendmentConflict: (
      token: string,
      amendmentId: string,
      resolution: "rebase" | "reject",
      reason: string,
      expectedVersion: number,
    ) =>
      ipcRenderer.invoke(
        "clinical:amendment-resolve",
        token,
        amendmentId,
        resolution,
        reason,
        expectedVersion,
      ) as Promise<EncounterAmendment>,
    applyAmendment: (
      token: string,
      amendmentId: string,
      expectedVersion: number,
    ) =>
      ipcRenderer.invoke(
        "clinical:amendment-apply",
        token,
        amendmentId,
        expectedVersion,
      ) as Promise<EncounterAmendment>,
    listDiagnoses: (token: string, encounterId: string) =>
      ipcRenderer.invoke("clinical:diagnoses", token, encounterId) as Promise<
        readonly Diagnosis[]
      >,
    createDiagnosis: (
      token: string,
      encounterId: string,
      input: DiagnosisInput,
    ) =>
      ipcRenderer.invoke(
        "clinical:diagnosis-create",
        token,
        encounterId,
        input,
      ) as Promise<Diagnosis>,
    approveDiagnosis: (
      token: string,
      diagnosisId: string,
      decision: "approved" | "rejected",
      reason: string,
      expectedVersion: number,
    ) =>
      ipcRenderer.invoke(
        "clinical:diagnosis-approve",
        token,
        diagnosisId,
        decision,
        reason,
        expectedVersion,
      ) as Promise<Diagnosis>,
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
    listDoctors: (token: string) =>
      ipcRenderer.invoke("clinical:doctors", token) as Promise<
        readonly DoctorDirectoryEntry[]
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
    listAppointments: (
      token: string,
      from?: string,
      to?: string,
      doctorId?: string,
    ) =>
      ipcRenderer.invoke(
        "clinical:appointments",
        token,
        from,
        to,
        doctorId,
      ) as Promise<readonly Appointment[]>,
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
  doctor: {
    listProfiles: (token: string) =>
      ipcRenderer.invoke("doctor:profiles", token) as Promise<
        readonly DoctorProfile[]
      >,
    getProfile: (token: string, doctorId: string) =>
      ipcRenderer.invoke(
        "doctor:profile",
        token,
        doctorId,
      ) as Promise<DoctorProfile>,
    updateProfile: (token: string, input: DoctorProfileUpdateInput) =>
      ipcRenderer.invoke(
        "doctor:profile-update",
        token,
        input,
      ) as Promise<DoctorProfile>,
    listDocuments: (token: string, doctorId: string, includeArchived = false) =>
      ipcRenderer.invoke(
        "doctor:documents",
        token,
        doctorId,
        includeArchived,
      ) as Promise<readonly DoctorDocument[]>,
    uploadDocument: (token: string, input: DoctorDocumentUploadInput) =>
      ipcRenderer.invoke(
        "doctor:document-upload",
        token,
        input,
      ) as Promise<DoctorDocument>,
    viewDocument: (token: string, documentId: string) =>
      ipcRenderer.invoke("doctor:document-view", token, {
        documentId,
      }) as Promise<DoctorDocumentContent>,
    archiveDocument: (token: string, documentId: string) =>
      ipcRenderer.invoke(
        "doctor:document-archive",
        token,
        documentId,
      ) as Promise<DoctorDocument>,
  },
  drugCatalog: {
    listSnapshots: (token: string) =>
      ipcRenderer.invoke("drug-catalog:snapshots", token) as Promise<
        readonly DrugCatalogSnapshot[]
      >,
    listEntries: (token: string, snapshotId: string) =>
      ipcRenderer.invoke("drug-catalog:entries", token, snapshotId) as Promise<
        readonly DrugCatalogEntry[]
      >,
    fetchAndStageRemote: (token: string, input: DrugCatalogRemoteImportInput) =>
      ipcRenderer.invoke(
        "drug-catalog:fetch-stage",
        token,
        input,
      ) as Promise<DrugCatalogSnapshot>,
    stageImport: (token: string, input: DrugCatalogImportInput) =>
      ipcRenderer.invoke(
        "drug-catalog:stage",
        token,
        input,
      ) as Promise<DrugCatalogSnapshot>,
    promoteSnapshot: (
      token: string,
      input: DrugCatalogSnapshotTransitionInput,
    ) =>
      ipcRenderer.invoke(
        "drug-catalog:promote",
        token,
        input,
      ) as Promise<DrugCatalogSnapshot>,
    rejectSnapshot: (
      token: string,
      input: DrugCatalogSnapshotTransitionInput,
    ) =>
      ipcRenderer.invoke(
        "drug-catalog:reject",
        token,
        input,
      ) as Promise<DrugCatalogSnapshot>,
    rollbackSnapshot: (
      token: string,
      input: DrugCatalogSnapshotTransitionInput,
    ) =>
      ipcRenderer.invoke(
        "drug-catalog:rollback",
        token,
        input,
      ) as Promise<DrugCatalogSnapshot>,
  },
  billing: {
    listPackages: (token: string) =>
      ipcRenderer.invoke("billing:packages", token) as Promise<
        readonly BillingPackage[]
      >,
    createPackage: (token: string, input: unknown) =>
      ipcRenderer.invoke(
        "billing:package-create",
        token,
        input,
      ) as Promise<BillingPackage>,
    archivePackage: (token: string, packageId: string, reason: string) =>
      ipcRenderer.invoke(
        "billing:package-archive",
        token,
        packageId,
        reason,
      ) as Promise<void>,
    listInvoices: (token: string, patientId?: string) =>
      ipcRenderer.invoke("billing:invoices", token, patientId) as Promise<
        readonly BillingInvoice[]
      >,
    createInvoice: (token: string, input: BillingInvoiceCreateInput) =>
      ipcRenderer.invoke(
        "billing:invoice-create",
        token,
        input,
      ) as Promise<BillingInvoice>,
    getInvoice: (token: string, invoiceId: string) =>
      ipcRenderer.invoke(
        "billing:invoice-get",
        token,
        invoiceId,
      ) as Promise<BillingInvoice>,
    postPayment: (
      token: string,
      input: BillingPaymentInput,
    ): Promise<{
      payment: BillingPayment;
      receipt: BillingReceipt;
      invoice: BillingInvoice;
    }> =>
      ipcRenderer.invoke("billing:payment-post", token, input) as Promise<{
        payment: BillingPayment;
        receipt: BillingReceipt;
        invoice: BillingInvoice;
      }>,
    postRefund: (token: string, input: BillingRefundInput) =>
      ipcRenderer.invoke("billing:refund-post", token, input) as Promise<{
        refund: BillingRefund;
        invoice: BillingInvoice;
      }>,
  },
  sync: {
    registerDevice: (
      token: string,
      input: SyncDeviceRegistrationInput,
    ): Promise<SyncDevicePolicy> =>
      ipcRenderer.invoke(
        "sync:device-register",
        token,
        input,
      ) as Promise<SyncDevicePolicy>,
    getDevicePolicy: (
      token: string,
      deviceId: string,
    ): Promise<SyncDevicePolicy> =>
      ipcRenderer.invoke(
        "sync:device-policy",
        token,
        deviceId,
      ) as Promise<SyncDevicePolicy>,
    getCapabilities: (
      token: string,
      input: SyncCapabilityRequest,
    ): Promise<SyncCapabilityResponse> =>
      ipcRenderer.invoke(
        "sync:capabilities",
        token,
        input,
      ) as Promise<SyncCapabilityResponse>,
    getDelta: (
      token: string,
      input: SyncDeltaRequest,
    ): Promise<SyncDeltaResponse> =>
      ipcRenderer.invoke(
        "sync:delta",
        token,
        input,
      ) as Promise<SyncDeltaResponse>,
    queueOutbox: (
      token: string,
      input: SyncOutboxInput,
    ): Promise<SyncOutboxInput> =>
      ipcRenderer.invoke(
        "sync:outbox-queue",
        token,
        input,
      ) as Promise<SyncOutboxInput>,
    acknowledgeOutbox: (
      token: string,
      input: SyncOutboxAcknowledgment,
    ): Promise<SyncOutboxAcknowledgment> =>
      ipcRenderer.invoke(
        "sync:outbox-ack",
        token,
        input,
      ) as Promise<SyncOutboxAcknowledgment>,
    listOutbox: (
      token: string,
      deviceId: string,
    ): Promise<readonly Record<string, unknown>[]> =>
      ipcRenderer.invoke("sync:outbox-list", token, deviceId) as Promise<
        readonly Record<string, unknown>[]
      >,
  },
  enrollment: {
    createChallenge: (
      token: string,
      input: EnrollmentChallengeCreateInput,
    ): Promise<EnrollmentChallenge> =>
      ipcRenderer.invoke(
        "enrollment:challenge-create",
        token,
        input,
      ) as Promise<EnrollmentChallenge>,
    submitDeviceRequest: (
      input: EnrollmentDeviceRequest,
    ): Promise<EnrollmentStateSummary> =>
      ipcRenderer.invoke(
        "enrollment:request-submit",
        input,
      ) as Promise<EnrollmentStateSummary>,
    approveDeviceRequest: (
      token: string,
      requestId: string,
      offlineAccessDays?: number,
    ): Promise<EnrollmentResponse> =>
      ipcRenderer.invoke(
        "enrollment:request-approve",
        token,
        requestId,
        offlineAccessDays,
      ) as Promise<EnrollmentResponse>,
    acknowledge: (
      input: EnrollmentAcknowledgment,
    ): Promise<EnrollmentStateSummary> =>
      ipcRenderer.invoke(
        "enrollment:acknowledge",
        input,
      ) as Promise<EnrollmentStateSummary>,
    revoke: (
      token: string,
      enrollmentId: string,
      reason: string,
    ): Promise<EnrollmentStateSummary> =>
      ipcRenderer.invoke(
        "enrollment:revoke",
        token,
        enrollmentId,
        reason,
      ) as Promise<EnrollmentStateSummary>,
    getSummary: (
      token: string,
      enrollmentId: string,
    ): Promise<EnrollmentStateSummary> =>
      ipcRenderer.invoke(
        "enrollment:summary",
        token,
        enrollmentId,
      ) as Promise<EnrollmentStateSummary>,
  },
  export: {
    createExport: (token: string, input: PatientExportInput) =>
      ipcRenderer.invoke(
        "export:create",
        token,
        input,
      ) as Promise<ExportResult>,
    verifyExport: (input: ExportVerificationInput) =>
      ipcRenderer.invoke(
        "export:verify",
        input,
      ) as Promise<ExportVerificationResult>,
    createZipExport: (token: string, input: PatientExportInput) =>
      ipcRenderer.invoke("export:create-zip", token, input) as Promise<{
        package: ExportZipPackage;
        savedArchivePath: string;
        fhirValidation?: FhirValidationResult;
        verification: ExportVerificationResult;
      }>,
    verifyZipExport: (archiveBase64: string) =>
      ipcRenderer.invoke(
        "export:verify-zip",
        archiveBase64,
      ) as Promise<ExportVerificationResult>,
    validateFhir: (token: string, input: PatientExportInput) =>
      ipcRenderer.invoke(
        "export:fhir-validate",
        token,
        input,
      ) as Promise<FhirValidationResult>,
    revokeExport: (token: string, packageId: string, reason: string) =>
      ipcRenderer.invoke(
        "export:revoke",
        token,
        packageId,
        reason,
      ) as Promise<ExportRevocation>,
    listRevocations: (token: string) =>
      ipcRenderer.invoke("export:revocations", token) as Promise<
        readonly ExportRevocation[]
      >,
    listRegistry: (token: string, input?: ExportRegistryListInput) =>
      ipcRenderer.invoke(
        "export:registry",
        token,
        input ?? { limit: 100 },
      ) as Promise<readonly ExportPackageRegistryRecord[]>,
    transitionRegistry: (token: string, input: ExportRegistryTransitionInput) =>
      ipcRenderer.invoke(
        "export:lifecycle",
        token,
        input,
      ) as Promise<ExportPackageRegistryRecord>,
    listLifecycle: (token: string, packageId: string) =>
      ipcRenderer.invoke(
        "export:lifecycle-events",
        token,
        packageId,
      ) as Promise<readonly ExportPackageLifecycleEvent[]>,
    listSigningKeys: (token: string) =>
      ipcRenderer.invoke("export:key-list", token) as Promise<
        readonly ExportSigningKeyMetadata[]
      >,
    rotateSigningKey: (token: string, reason: string) =>
      ipcRenderer.invoke(
        "export:key-rotate",
        token,
        reason,
      ) as Promise<ExportSigningKeyMetadata>,
    exportSigningKeyRecovery: (token: string, passphrase: string) =>
      ipcRenderer.invoke(
        "export:key-recovery-export",
        token,
        passphrase,
      ) as Promise<ExportSigningKeyRecoveryBundle>,
    restoreSigningKeyRecovery: (
      token: string,
      bundle: ExportSigningKeyRecoveryBundle,
      passphrase: string,
    ) =>
      ipcRenderer.invoke(
        "export:key-recovery-import",
        token,
        bundle,
        passphrase,
      ) as Promise<ExportSigningKeyMetadata>,
    createRecipient: (token: string, input: ExportRecipientCreateInput) =>
      ipcRenderer.invoke(
        "export:recipient-create",
        token,
        input,
      ) as Promise<ExportRecipient>,
    listRecipients: (token: string) =>
      ipcRenderer.invoke("export:recipients", token) as Promise<
        readonly ExportRecipient[]
      >,
    verifyRecipient: (
      token: string,
      recipientId: string,
      status: "verified" | "rejected",
      reason: string,
    ) =>
      ipcRenderer.invoke(
        "export:recipient-verify",
        token,
        recipientId,
        status,
        reason,
      ) as Promise<ExportRecipient>,
    createConsentEvidence: (
      token: string,
      input: ExportConsentEvidenceCreateInput,
    ) =>
      ipcRenderer.invoke(
        "export:evidence-create",
        token,
        input,
      ) as Promise<ExportConsentEvidence>,
    listConsentEvidence: (token: string, patientId?: string) =>
      ipcRenderer.invoke("export:evidence-list", token, patientId) as Promise<
        readonly ExportConsentEvidence[]
      >,
    reviewConsentEvidence: (
      token: string,
      evidenceId: string,
      decision: "approve" | "reject",
      reason: string,
    ) =>
      ipcRenderer.invoke(
        "export:evidence-review",
        token,
        evidenceId,
        decision,
        reason,
      ) as Promise<ExportConsentEvidence>,
    requestDisclosure: (token: string, input: ExportDisclosureRequest) =>
      ipcRenderer.invoke(
        "export:disclosure-request",
        token,
        input,
      ) as Promise<ExportDisclosure>,
    listDisclosures: (token: string) =>
      ipcRenderer.invoke("export:disclosures", token) as Promise<
        readonly ExportDisclosure[]
      >,
    decideDisclosure: (token: string, input: ExportDisclosureDecision) =>
      ipcRenderer.invoke(
        "export:disclosure-decision",
        token,
        input,
      ) as Promise<ExportDisclosure>,
    sendDisclosure: (token: string, disclosureId: string, reason: string) =>
      ipcRenderer.invoke(
        "export:disclosure-send",
        token,
        disclosureId,
        reason,
      ) as Promise<ExportDisclosure>,
    issueReceipt: (token: string, disclosureId: string) =>
      ipcRenderer.invoke(
        "export:receipt-issue",
        token,
        disclosureId,
      ) as Promise<ExportReceipt>,
    acknowledgeReceipt: (token: string, receiptId: string, reason: string) =>
      ipcRenderer.invoke(
        "export:receipt-acknowledge",
        token,
        receiptId,
        reason,
      ) as Promise<ExportReceipt>,
    listReceipts: (token: string) =>
      ipcRenderer.invoke("export:receipts", token) as Promise<
        readonly ExportReceipt[]
      >,
  },
  settings: {
    getOrgSettings: (token: string) =>
      ipcRenderer.invoke("settings:org-get", token) as Promise<OrgSettings>,
    updateOrgSettings: (token: string, input: OrgSettingsInput) =>
      ipcRenderer.invoke(
        "settings:org-update",
        token,
        input,
      ) as Promise<OrgSettings>,
    listFhirProfileBundles: (token: string) =>
      ipcRenderer.invoke("settings:fhir-profiles", token) as Promise<
        readonly FhirProfileBundleRecord[]
      >,
    installFhirProfileBundle: (token: string, input: FhirProfileBundle) =>
      ipcRenderer.invoke(
        "settings:fhir-profile-install",
        token,
        input,
      ) as Promise<FhirProfileBundleRecord>,
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
