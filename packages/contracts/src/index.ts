import { z } from "zod";

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const opaqueIdSchema = z.string().min(8).max(128);
export const patientIdSchema = z.string().regex(/^EL-\d{5,}$/);
export const phoneSchema = z.string().trim().min(3).max(32);

export const userRoleSchema = z.enum([
  "admin",
  "doctor",
  "nurse",
  "receptionist",
]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const capabilitySchema = z.enum([
  "patient.read",
  "patient.write",
  "patient.archive",
  "patient.merge",
  "clinical.read",
  "clinical.write",
  "clinical.sign",
  "clinical.approve",
  "appointment.read",
  "appointment.write",
  "billing.read",
  "billing.write",
  "billing.refund",
  "staff.manage",
  "device.manage",
  "backup.manage",
  "export.manage",
  "export.sensitive",
  "export.revoke",
  "export.key.manage",
  "export.governance.request",
  "export.governance.review",
  "export.governance.send",
  "export.governance.audit",
  "export.receipt.manage",
  "sync.read",
  "sync.write",
  "sync.manage",
  "audit.read",
  "module.manage",
  "doctor.profile.read",
  "doctor.profile.write",
  "doctor.document.read",
  "doctor.document.write",
  "doctor.document.sensitive-read",
  "doctor.document.archive",
]);
export type Capability = z.infer<typeof capabilitySchema>;

export const roleCapabilities = {
  admin: [
    "patient.read",
    "patient.write",
    "patient.archive",
    "patient.merge",
    "clinical.read",
    "clinical.write",
    "clinical.sign",
    "appointment.read",
    "appointment.write",
    "billing.read",
    "billing.write",
    "billing.refund",
    "staff.manage",
    "device.manage",
    "backup.manage",
    "export.manage",
    "export.sensitive",
    "export.revoke",
    "export.key.manage",
    "export.governance.request",
    "export.governance.review",
    "export.governance.send",
    "export.governance.audit",
    "export.receipt.manage",
    "sync.read",
    "sync.write",
    "sync.manage",
    "audit.read",
    "module.manage",
    "doctor.profile.read",
    "doctor.profile.write",
    "doctor.document.read",
    "doctor.document.write",
    "doctor.document.sensitive-read",
    "doctor.document.archive",
  ],
  doctor: [
    "patient.read",
    "patient.write",
    "clinical.read",
    "clinical.write",
    "clinical.sign",
    "clinical.approve",
    "appointment.read",
    "appointment.write",
    "billing.read",
    "billing.write",
    "export.manage",
    "export.governance.request",
    "sync.read",
    "sync.write",
    "doctor.profile.read",
    "doctor.profile.write",
    "doctor.document.read",
    "doctor.document.write",
    "doctor.document.sensitive-read",
    "doctor.document.archive",
  ],
  nurse: [
    "patient.read",
    "patient.write",
    "clinical.read",
    "clinical.write",
    "appointment.read",
    "appointment.write",
    "sync.read",
    "sync.write",
    "doctor.profile.read",
    "doctor.document.read",
  ],
  receptionist: [
    "patient.read",
    "patient.write",
    "appointment.read",
    "appointment.write",
    "billing.read",
    "billing.write",
    "billing.refund",
    "sync.read",
    "sync.write",
  ],
} as const satisfies Record<UserRole, readonly Capability[]>;

export const userSchema = z.object({
  id: opaqueIdSchema,
  username: z.string().trim().min(3).max(80),
  displayNameEn: z.string().trim().min(1).max(160),
  displayNameAr: z.string().trim().max(160).optional(),
  role: userRoleSchema,
  capabilities: z.array(capabilitySchema),
  isClinicalApprover: z.boolean(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type User = z.infer<typeof userSchema>;

export const doctorDirectoryEntrySchema = z.object({
  id: opaqueIdSchema,
  displayNameEn: z.string().trim().min(1).max(160),
  displayNameAr: z.string().trim().max(160).optional(),
  role: z.literal("doctor"),
  isClinicalApprover: z.boolean(),
  isActive: z.literal(true),
});
export type DoctorDirectoryEntry = z.infer<typeof doctorDirectoryEntrySchema>;

export const doctorLicenseVerificationStatusSchema = z.enum([
  "unverified",
  "pending",
  "verified",
  "expired",
  "rejected",
]);
export type DoctorLicenseVerificationStatus = z.infer<
  typeof doctorLicenseVerificationStatusSchema
>;

export const doctorDocumentTypeSchema = z.enum([
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
]);
export type DoctorDocumentType = z.infer<typeof doctorDocumentTypeSchema>;

export const doctorDocumentStatusSchema = z.enum([
  "active",
  "archived",
  "destroyed",
]);
export type DoctorDocumentStatus = z.infer<typeof doctorDocumentStatusSchema>;

export const doctorProfileSchema = z.object({
  doctorId: opaqueIdSchema,
  displayNameEn: z.string().trim().min(1).max(160),
  displayNameAr: z.string().trim().max(160).optional(),
  professionalRegistrationNumber: z.string().trim().max(80).optional(),
  licenseExpiry: isoDateTimeSchema.optional(),
  licenseVerificationStatus: doctorLicenseVerificationStatusSchema,
  specialtyIds: z.array(opaqueIdSchema).max(32),
  departmentIds: z.array(opaqueIdSchema).max(32),
  qualifications: z.string().trim().max(4000).optional(),
  biography: z.string().trim().max(6000).optional(),
  languages: z.array(z.string().trim().min(1).max(64)).max(16),
  phone: phoneSchema.optional(),
  email: z.string().email().max(254).optional(),
  clinicRoom: z.string().trim().max(80).optional(),
  consultationFeeEgp: z.number().int().nonnegative().optional(),
  isClinicalApprover: z.boolean(),
  isActive: z.boolean(),
  updatedAt: isoDateTimeSchema,
});
export type DoctorProfile = z.infer<typeof doctorProfileSchema>;

export const doctorProfileUpdateInputSchema = z.object({
  doctorId: opaqueIdSchema,
  displayNameEn: z.string().trim().min(1).max(160).optional(),
  displayNameAr: z.string().trim().max(160).nullable().optional(),
  professionalRegistrationNumber: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional(),
  licenseExpiry: isoDateTimeSchema.nullable().optional(),
  licenseVerificationStatus: doctorLicenseVerificationStatusSchema.optional(),
  specialtyIds: z.array(opaqueIdSchema).max(32).optional(),
  departmentIds: z.array(opaqueIdSchema).max(32).optional(),
  qualifications: z.string().trim().max(4000).nullable().optional(),
  biography: z.string().trim().max(6000).nullable().optional(),
  languages: z.array(z.string().trim().min(1).max(64)).max(16).optional(),
  phone: phoneSchema.nullable().optional(),
  email: z.string().email().max(254).nullable().optional(),
  clinicRoom: z.string().trim().max(80).nullable().optional(),
  consultationFeeEgp: z.number().int().nonnegative().nullable().optional(),
  isClinicalApprover: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type DoctorProfileUpdateInput = z.infer<
  typeof doctorProfileUpdateInputSchema
>;

export const doctorDocumentSchema = z.object({
  documentId: opaqueIdSchema,
  familyId: opaqueIdSchema,
  doctorId: opaqueIdSchema,
  documentType: doctorDocumentTypeSchema,
  displayName: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.enum([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  version: z.number().int().positive(),
  status: doctorDocumentStatusSchema,
  sensitive: z.boolean(),
  uploadedByUserId: opaqueIdSchema,
  uploadedAt: isoDateTimeSchema,
  archivedAt: isoDateTimeSchema.optional(),
  archivedByUserId: opaqueIdSchema.optional(),
});
export type DoctorDocument = z.infer<typeof doctorDocumentSchema>;

export const doctorDocumentUploadInputSchema = z.object({
  doctorId: opaqueIdSchema,
  documentType: doctorDocumentTypeSchema,
  displayName: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.enum([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]),
  contentBase64: z.string().min(4).max(28_000_000),
  replacesDocumentId: opaqueIdSchema.optional(),
});
export type DoctorDocumentUploadInput = z.infer<
  typeof doctorDocumentUploadInputSchema
>;

export const doctorDocumentUploadMetadataSchema = z.object({
  doctorId: opaqueIdSchema,
  documentType: doctorDocumentTypeSchema,
  displayName: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.enum([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  replacesDocumentId: opaqueIdSchema.optional(),
});
export type DoctorDocumentUploadMetadata = z.infer<
  typeof doctorDocumentUploadMetadataSchema
>;

export const doctorDocumentViewRequestSchema = z.object({
  documentId: opaqueIdSchema,
});
export type DoctorDocumentViewRequest = z.infer<
  typeof doctorDocumentViewRequestSchema
>;

export const doctorDocumentContentSchema = doctorDocumentSchema.extend({
  contentBase64: z.string().min(4).max(28_000_000),
});
export type DoctorDocumentContent = z.infer<typeof doctorDocumentContentSchema>;

export const deviceStatusSchema = z.enum([
  "pending",
  "active",
  "revoked",
  "wipe-pending",
]);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

export const deviceSchema = z.object({
  id: opaqueIdSchema,
  friendlyName: z.string().trim().min(1).max(120),
  platform: z.enum(["windows", "android"]),
  appVersion: z.string().trim().min(1).max(64),
  apiLevel: z.number().int().nonnegative().optional(),
  securityPatchLevel: z.string().trim().max(32).optional(),
  ownerUserId: opaqueIdSchema,
  status: deviceStatusSchema,
  approvedByUserId: opaqueIdSchema.optional(),
  approvedAt: isoDateTimeSchema.optional(),
  lastSeenAt: isoDateTimeSchema.optional(),
  lastSyncAt: isoDateTimeSchema.optional(),
  revokedAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Device = z.infer<typeof deviceSchema>;

export const syncScopeSchema = z.enum([
  "appointments",
  "patient-summary",
  "encounter-summary",
  "clinical-notes",
  "export-governance",
  "billing-summary",
]);
export type SyncScope = z.infer<typeof syncScopeSchema>;

export const syncResourceTypeSchema = z.enum([
  "Appointment",
  "Patient",
  "Encounter",
  "Composition",
  "Condition",
  "ExportPackage",
  "BillingInvoice",
]);
export type SyncResourceType = z.infer<typeof syncResourceTypeSchema>;

export const syncChangeOperationSchema = z.enum(["upsert", "delete", "redact"]);
export type SyncChangeOperation = z.infer<typeof syncChangeOperationSchema>;

export const syncChangeSchema = z.object({
  resourceType: syncResourceTypeSchema,
  resourceId: opaqueIdSchema,
  version: z.number().int().positive(),
  updatedAt: isoDateTimeSchema,
  operation: syncChangeOperationSchema,
  payload: z.record(z.string(), z.unknown()).optional(),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceSnapshotHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  redactionReason: z.string().trim().max(240).optional(),
});
export type SyncChange = z.infer<typeof syncChangeSchema>;

export const syncCapabilityRequestSchema = z.object({
  protocolVersion: z.literal(1),
  organizationId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  enrollmentId: opaqueIdSchema,
  userId: opaqueIdSchema,
  clientVersion: z.string().trim().min(1).max(64),
  lastAcceptedStatusSequence: z.number().int().nonnegative().optional(),
  requestedScopes: z.array(syncScopeSchema).min(1).max(6),
  requestNonce: z.string().trim().min(16).max(128),
  requestedAt: isoDateTimeSchema,
});
export type SyncCapabilityRequest = z.infer<typeof syncCapabilityRequestSchema>;

export const syncCapabilityResponseSchema = z.object({
  protocolVersion: z.literal(1),
  organizationId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  userId: opaqueIdSchema,
  supportedScopes: z.array(syncScopeSchema),
  policyVersion: z.number().int().positive(),
  serverTime: isoDateTimeSchema,
  minimumClientVersion: z.string().trim().min(1).max(64),
  statusSequence: z.number().int().nonnegative(),
  responseNonce: z.string().trim().min(16).max(128),
  responseHash: z.string().regex(/^[a-f0-9]{64}$/),
  signatureAlgorithm: z.literal("ed25519"),
  signatureBase64: z.string().trim().min(80).max(256),
  signerKeyId: opaqueIdSchema,
  signerKeyVersion: z.number().int().positive(),
});
export type SyncCapabilityResponse = z.infer<
  typeof syncCapabilityResponseSchema
>;

export const syncDeviceRegistrationInputSchema = z.object({
  deviceId: opaqueIdSchema,
  enrollmentId: opaqueIdSchema,
  organizationId: opaqueIdSchema,
  ownerUserId: opaqueIdSchema,
  policyVersion: z.number().int().positive(),
  allowedScopes: z.array(syncScopeSchema).min(1).max(6),
  patientScope: z.record(z.string(), z.unknown()).optional(),
});
export type SyncDeviceRegistrationInput = z.infer<
  typeof syncDeviceRegistrationInputSchema
>;

export const syncDevicePolicySchema = z.object({
  deviceId: opaqueIdSchema,
  enrollmentId: opaqueIdSchema,
  organizationId: opaqueIdSchema,
  ownerUserId: opaqueIdSchema,
  policyVersion: z.number().int().positive(),
  allowedScopes: z.array(syncScopeSchema).max(6),
  patientScope: z.record(z.string(), z.unknown()).optional(),
  state: z.enum(["active", "suspended", "revoked"]),
});
export type SyncDevicePolicy = z.infer<typeof syncDevicePolicySchema>;

export const syncDeltaRequestSchema = z.object({
  protocolVersion: z.literal(1),
  organizationId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  userId: opaqueIdSchema,
  syncSessionId: opaqueIdSchema,
  scope: syncScopeSchema,
  cursor: z.string().trim().max(256).optional(),
  clientBaseVersion: z.number().int().nonnegative(),
  knownPolicyVersion: z.number().int().positive(),
  requestNonce: z.string().trim().min(16).max(128),
  requestedAt: isoDateTimeSchema,
  maxChanges: z.number().int().positive().max(5000).default(500),
});
export type SyncDeltaRequest = z.input<typeof syncDeltaRequestSchema>;

export const syncResourceConflictSchema = z.object({
  resourceType: syncResourceTypeSchema,
  resourceId: opaqueIdSchema,
  operationId: opaqueIdSchema.optional(),
  clientBaseVersion: z.number().int().positive(),
  serverVersion: z.number().int().positive(),
  conflictType: z.enum([
    "version-mismatch",
    "requires-amendment",
    "redacted",
    "policy-denied",
  ]),
  resolution: z.enum(["refresh", "amend", "rejected", "none"]),
});
export type SyncResourceConflict = z.infer<typeof syncResourceConflictSchema>;

export const syncDeltaResponseSchema = z.object({
  protocolVersion: z.literal(1),
  organizationId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  syncSessionId: opaqueIdSchema,
  scope: syncScopeSchema,
  serverCursor: z.string().trim().min(1).max(256),
  serverSequence: z.number().int().nonnegative(),
  generatedAt: isoDateTimeSchema,
  validUntil: isoDateTimeSchema,
  fullSyncRequired: z.boolean(),
  changes: z.array(syncChangeSchema).max(5000),
  conflicts: z.array(syncResourceConflictSchema).max(5000),
  redactions: z.array(opaqueIdSchema).max(5000),
  nextCursor: z.string().trim().min(1).max(256),
  responseNonce: z.string().trim().min(16).max(128),
  responseIntegrity: z.string().regex(/^[a-f0-9]{64}$/),
  signatureAlgorithm: z.literal("ed25519"),
  signatureBase64: z.string().trim().min(80).max(256),
  signerKeyId: opaqueIdSchema,
  signerKeyVersion: z.number().int().positive(),
});
export type SyncDeltaResponse = z.infer<typeof syncDeltaResponseSchema>;

export const syncOutboxOperationSchema = z.enum([
  "appointment-acknowledge",
  "appointment-arrival",
  "queue-note",
]);
export type SyncOutboxOperation = z.infer<typeof syncOutboxOperationSchema>;

export const syncOutboxStateSchema = z.enum([
  "pending",
  "sending",
  "accepted",
  "already-applied",
  "conflict",
  "rejected",
  "requires-amendment",
]);
export type SyncOutboxState = z.infer<typeof syncOutboxStateSchema>;

export const syncOutboxInputSchema = z.object({
  operationId: opaqueIdSchema,
  organizationId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  userId: opaqueIdSchema,
  scope: syncScopeSchema,
  operation: syncOutboxOperationSchema,
  resourceType: syncResourceTypeSchema,
  resourceId: opaqueIdSchema,
  baseVersion: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().trim().min(3).max(500),
  createdAt: isoDateTimeSchema,
});
export type SyncOutboxInput = z.infer<typeof syncOutboxInputSchema>;

export const syncOutboxAcknowledgmentSchema = z.object({
  operationId: opaqueIdSchema,
  state: syncOutboxStateSchema,
  resourceType: syncResourceTypeSchema,
  resourceId: opaqueIdSchema,
  serverVersion: z.number().int().positive().optional(),
  conflict: syncResourceConflictSchema.optional(),
  acknowledgmentHash: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledgedAt: isoDateTimeSchema,
});
export type SyncOutboxAcknowledgment = z.infer<
  typeof syncOutboxAcknowledgmentSchema
>;

export const syncAuditResultSchema = z.enum([
  "success",
  "partial",
  "rejected",
  "conflict",
  "error",
]);
export type SyncAuditResult = z.infer<typeof syncAuditResultSchema>;

export const consentRecordSchema = z.object({
  id: opaqueIdSchema,
  patientId: patientIdSchema,
  consentType: z.enum([
    "treatment",
    "data-processing",
    "guardian",
    "communications",
    "media",
    "research",
  ]),
  status: z.enum(["requested", "granted", "refused", "withdrawn", "expired"]),
  grantedByRelatedPersonId: opaqueIdSchema.optional(),
  recordedByUserId: opaqueIdSchema,
  recordedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema.optional(),
  notes: z.string().max(4000).optional(),
});
export type ConsentRecord = z.infer<typeof consentRecordSchema>;

export const relatedPersonSchema = z.object({
  id: opaqueIdSchema,
  displayNameEn: z.string().trim().min(1).max(160),
  displayNameAr: z.string().trim().max(160).optional(),
  relationship: z.string().trim().min(1).max(80),
  phoneNumbers: z.array(phoneSchema).min(1),
  nationalId: z.string().trim().max(64).optional(),
  isGuardian: z.boolean(),
  isAuthorizedToConsent: z.boolean(),
  isAuthorizedToContact: z.boolean(),
  verificationStatus: z.enum(["unverified", "verified", "rejected"]),
});
export type RelatedPerson = z.infer<typeof relatedPersonSchema>;

export const patientRegistrationModeSchema = z.enum(["quick", "full"]);
export type PatientRegistrationMode = z.infer<
  typeof patientRegistrationModeSchema
>;

export const patientCompletenessStatusSchema = z.enum(["minimal", "complete"]);
export type PatientCompletenessStatus = z.infer<
  typeof patientCompletenessStatusSchema
>;

export const relationshipConsentAuthoritySchema = z.enum([
  "none",
  "inform",
  "consent",
]);
export type RelationshipConsentAuthority = z.infer<
  typeof relationshipConsentAuthoritySchema
>;

export const preferredContactMethodSchema = z.enum([
  "phone",
  "sms",
  "whatsapp",
  "email",
  "none",
]);
export type PreferredContactMethod = z.infer<
  typeof preferredContactMethodSchema
>;

export const patientSchema = z.object({
  id: opaqueIdSchema,
  patientId: patientIdSchema,
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().max(160).optional(),
  dob: z.string().date().optional(),
  sex: z.enum(["female", "male", "intersex", "unknown"]).optional(),
  phone: phoneSchema,
  nationalId: z.string().trim().max(64).optional(),
  relatedPersonIds: z.array(opaqueIdSchema),
  primaryDepartmentId: opaqueIdSchema.optional(),
  registrationMode: patientRegistrationModeSchema,
  completenessStatus: patientCompletenessStatusSchema,
  status: z.enum(["active", "archived", "merged"]),
  archivedAt: isoDateTimeSchema.optional(),
  archiveReason: z.string().optional(),
  mergedIntoPatientId: patientIdSchema.optional(),
  createdAt: isoDateTimeSchema,
  createdByUserId: opaqueIdSchema,
  updatedAt: isoDateTimeSchema,
  updatedByUserId: opaqueIdSchema,
  version: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
});
export type Patient = z.infer<typeof patientSchema>;

export const medicalHistoryCategorySchema = z.enum([
  "condition",
  "allergy",
  "medication",
  "surgery",
  "family-history",
  "social-history",
  "immunization",
  "other",
]);
export type MedicalHistoryCategory = z.infer<
  typeof medicalHistoryCategorySchema
>;

export const medicalHistoryStatusSchema = z.enum([
  "active",
  "resolved",
  "inactive",
]);
export type MedicalHistoryStatus = z.infer<typeof medicalHistoryStatusSchema>;

export const medicalHistorySourceSchema = z.enum([
  "patient-reported",
  "clinician-recorded",
  "external-record",
]);
export type MedicalHistorySource = z.infer<typeof medicalHistorySourceSchema>;

export const medicalHistoryInputSchema = z.object({
  category: medicalHistoryCategorySchema,
  title: z.string().trim().min(1).max(160),
  details: z.string().trim().max(4000).optional(),
  onsetDate: z.string().date().optional(),
  status: medicalHistoryStatusSchema.default("active"),
  source: medicalHistorySourceSchema.default("clinician-recorded"),
});
export type MedicalHistoryInput = z.infer<typeof medicalHistoryInputSchema>;

export const medicalHistorySchema = medicalHistoryInputSchema.extend({
  id: opaqueIdSchema,
  patientId: patientIdSchema,
  recordedAt: isoDateTimeSchema,
  recordedByUserId: opaqueIdSchema,
  updatedAt: isoDateTimeSchema,
  updatedByUserId: opaqueIdSchema,
  version: z.number().int().positive(),
});
export type MedicalHistoryEntry = z.infer<typeof medicalHistorySchema>;

export const icd10CodeInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Z][0-9A-Z.\-]{1,31}$/),
  titleEn: z.string().trim().min(1).max(240),
  titleAr: z.string().trim().max(240).optional(),
  releaseVersion: z.string().trim().min(1).max(80),
  sourceUrl: z.string().url().max(500).optional(),
});
export type Icd10CodeInput = z.infer<typeof icd10CodeInputSchema>;

export const icd10CodeSchema = icd10CodeInputSchema.extend({
  id: opaqueIdSchema,
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  createdByUserId: opaqueIdSchema,
});
export type Icd10Code = z.infer<typeof icd10CodeSchema>;

export const encounterStatusSchema = z.enum(["draft", "signed"]);
export type EncounterStatus = z.infer<typeof encounterStatusSchema>;

export const encounterInputSchema = z.object({
  subjective: z.string().trim().max(12000).optional(),
  objective: z.string().trim().max(12000).optional(),
  assessment: z.string().trim().max(12000).optional(),
  plan: z.string().trim().max(12000).optional(),
  followUp: z.string().trim().max(4000).optional(),
});
export type EncounterInput = z.infer<typeof encounterInputSchema>;

export const encounterSchema = encounterInputSchema.extend({
  id: opaqueIdSchema,
  patientId: patientIdSchema,
  appointmentId: opaqueIdSchema,
  authorUserId: opaqueIdSchema,
  encounterAt: isoDateTimeSchema,
  status: encounterStatusSchema,
  signedAt: isoDateTimeSchema.optional(),
  signedByUserId: opaqueIdSchema.optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  version: z.number().int().positive(),
});
export type Encounter = z.infer<typeof encounterSchema>;

export const encounterAmendmentStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "applied",
  "conflict",
]);
export type EncounterAmendmentStatus = z.infer<
  typeof encounterAmendmentStatusSchema
>;

export const encounterAmendmentInputSchema = encounterInputSchema.extend({
  correctionReason: z.string().trim().min(3).max(1000),
});
export type EncounterAmendmentInput = z.infer<
  typeof encounterAmendmentInputSchema
>;

export const encounterAmendmentSchema = encounterAmendmentInputSchema.extend({
  id: opaqueIdSchema,
  encounterId: opaqueIdSchema,
  patientId: patientIdSchema,
  baseEncounterVersion: z.number().int().positive(),
  baseAmendmentId: opaqueIdSchema.optional(),
  status: encounterAmendmentStatusSchema,
  conflictReason: z.string().max(1000).optional(),
  conflictResolvedAt: isoDateTimeSchema.optional(),
  conflictResolvedByUserId: opaqueIdSchema.optional(),
  conflictResolutionReason: z.string().max(1000).optional(),
  appliedSequence: z.number().int().positive().optional(),
  requestedByUserId: opaqueIdSchema,
  requestedAt: isoDateTimeSchema,
  reviewedByUserId: opaqueIdSchema.optional(),
  reviewedAt: isoDateTimeSchema.optional(),
  reviewReason: z.string().max(1000).optional(),
  appliedByUserId: opaqueIdSchema.optional(),
  appliedAt: isoDateTimeSchema.optional(),
  version: z.number().int().positive(),
});
export type EncounterAmendment = z.infer<typeof encounterAmendmentSchema>;

export const effectiveEncounterSchema = encounterSchema.extend({
  effectiveVersion: z.number().int().positive(),
  appliedAmendmentCount: z.number().int().nonnegative(),
  lastAppliedAmendmentId: opaqueIdSchema.optional(),
  lastAmendedAt: isoDateTimeSchema.optional(),
});
export type EffectiveEncounter = z.infer<typeof effectiveEncounterSchema>;

export const encounterAmendmentFieldSchema = z.enum([
  "subjective",
  "objective",
  "assessment",
  "plan",
  "followUp",
]);
export type EncounterAmendmentField = z.infer<
  typeof encounterAmendmentFieldSchema
>;

export const encounterFieldDiffSchema = z.object({
  field: encounterAmendmentFieldSchema,
  before: z.string().optional(),
  after: z.string().optional(),
});
export type EncounterFieldDiff = z.infer<typeof encounterFieldDiffSchema>;

export const encounterAmendmentDiffSchema = z.object({
  amendmentId: opaqueIdSchema,
  encounterId: opaqueIdSchema,
  status: encounterAmendmentStatusSchema,
  baseAmendmentId: opaqueIdSchema.optional(),
  fields: z.array(encounterFieldDiffSchema),
});
export type EncounterAmendmentDiff = z.infer<
  typeof encounterAmendmentDiffSchema
>;

export const projectionSnapshotInputSchema = z.object({
  exportReason: z.string().trim().min(3).max(500),
});
export type ProjectionSnapshotInput = z.infer<
  typeof projectionSnapshotInputSchema
>;

export const exportRedactionPolicySchema = z.enum([
  "minimal",
  "clinical",
  "full",
]);
export type ExportRedactionPolicy = z.infer<typeof exportRedactionPolicySchema>;

export const exportFormatSchema = z.enum(["pdf", "fhir"]);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const orgIdentifierSchema = z.object({
  clinicNameEn: z.string().trim().min(1).max(160),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  oid: z
    .string()
    .regex(/^\d+(\.\d+)+$/)
    .max(128),
  fhirSystemUrl: z.string().url().max(500),
});
export type OrgIdentifier = z.infer<typeof orgIdentifierSchema>;

export const orgSettingsInputSchema = orgIdentifierSchema.extend({
  exportExpirationDays: z.number().int().min(1).max(3650).default(30),
  sessionTtlMinutes: z.number().int().min(15).max(720).default(180),
  fhirProfileBundleId: z.string().trim().min(3).max(128).optional(),
});
export type OrgSettingsInput = z.infer<typeof orgSettingsInputSchema>;

export const orgSettingsSchema = orgSettingsInputSchema.extend({
  updatedAt: isoDateTimeSchema,
  updatedByUserId: opaqueIdSchema,
});
export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export const exportExpirationPolicySchema = z.enum([
  "30-days",
  "custom-days",
  "never",
]);
export type ExportExpirationPolicy = z.infer<
  typeof exportExpirationPolicySchema
>;

export const exportExpirationSchema = z.object({
  expiresAt: isoDateTimeSchema.nullable(),
  expirationPolicy: exportExpirationPolicySchema,
});
export type ExportExpiration = z.infer<typeof exportExpirationSchema>;

export const fhirProfileConstraintSchema = z.object({
  resourceType: z.string().regex(/^[A-Z][A-Za-z0-9]+$/),
  canonicalUrl: z.string().url().or(z.string().startsWith("urn:")),
  requiredPaths: z
    .array(z.string().regex(/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/))
    .max(100)
    .default([]),
  fixedValues: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
});
export type FhirProfileConstraint = z.infer<typeof fhirProfileConstraintSchema>;

export const fhirProfileBundleSchema = z.object({
  id: z
    .string()
    .trim()
    .min(3)
    .max(128)
    .regex(/^[a-z0-9][a-z0-9.-]*$/),
  displayName: z.string().trim().min(1).max(240),
  jurisdiction: z.string().trim().min(2).max(120),
  version: z.string().trim().min(1).max(80),
  fhirVersion: z.literal("R4"),
  publisher: z.string().trim().min(1).max(240),
  sourceUri: z.string().url().or(z.string().startsWith("urn:")).optional(),
  profiles: z.array(fhirProfileConstraintSchema).min(1).max(100),
});
export type FhirProfileBundle = z.infer<typeof fhirProfileBundleSchema>;

export const fhirProfileBundleRecordSchema = fhirProfileBundleSchema.extend({
  bundleHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["active", "disabled"]),
  installedAt: isoDateTimeSchema,
  installedByUserId: opaqueIdSchema,
  updatedAt: isoDateTimeSchema,
  updatedByUserId: opaqueIdSchema,
});
export type FhirProfileBundleRecord = z.infer<
  typeof fhirProfileBundleRecordSchema
>;

export const fhirValidationIssueSchema = z.object({
  severity: z.enum(["error", "warning"]),
  path: z.string().min(1),
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(1000),
});
export type FhirValidationIssue = z.infer<typeof fhirValidationIssueSchema>;

export const fhirValidationResultSchema = z.object({
  valid: z.boolean(),
  fhirVersion: z.literal("R4"),
  validatorVersion: z.string().min(1).max(40),
  profileBundleId: z.string().min(3).max(128),
  profileBundleHash: z.string().regex(/^[a-f0-9]{64}$/),
  profileIds: z.array(z.string().url().or(z.string().startsWith("urn:"))),
  issues: z.array(fhirValidationIssueSchema),
});
export type FhirValidationResult = z.infer<typeof fhirValidationResultSchema>;

export const exportRevocationSchema = z.object({
  id: opaqueIdSchema,
  packageId: opaqueIdSchema,
  reason: z.string().trim().min(3).max(1000),
  revokedByUserId: opaqueIdSchema,
  revokedAt: isoDateTimeSchema,
  auditEventId: opaqueIdSchema,
});
export type ExportRevocation = z.infer<typeof exportRevocationSchema>;

export const exportPackageLifecycleStatusSchema = z.enum([
  "issued",
  "stored",
  "downloaded",
  "expired",
  "revoked",
  "superseded",
  "archived",
  "destroyed",
]);
export type ExportPackageLifecycleStatus = z.infer<
  typeof exportPackageLifecycleStatusSchema
>;

export const exportPackageTypeSchema = z.enum(["detached", "zip"]);
export type ExportPackageType = z.infer<typeof exportPackageTypeSchema>;

export const exportPackageRegistryRecordSchema = z.object({
  packageId: opaqueIdSchema,
  packageType: exportPackageTypeSchema,
  snapshotId: opaqueIdSchema,
  patientId: patientIdSchema,
  format: exportFormatSchema,
  redactionPolicy: exportRedactionPolicySchema,
  exportReason: z.string().trim().min(3).max(500),
  createdAt: isoDateTimeSchema,
  createdByUserId: opaqueIdSchema,
  expiresAt: isoDateTimeSchema.nullable(),
  status: exportPackageLifecycleStatusSchema,
  statusChangedAt: isoDateTimeSchema,
  statusChangedByUserId: opaqueIdSchema,
  packageHash: z.string().regex(/^[a-f0-9]{64}$/),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  signerKeyId: opaqueIdSchema,
  signerKeyVersion: z.number().int().positive(),
  archiveFileName: z
    .string()
    .regex(/^[a-zA-Z0-9._-]+$/)
    .optional(),
  archivePath: z.string().min(1).optional(),
  payloadPath: z.string().min(1).optional(),
  manifestPath: z.string().min(1).optional(),
  signaturePath: z.string().min(1).optional(),
  fhirProfileBundleId: z.string().min(3).max(128).optional(),
});
export type ExportPackageRegistryRecord = z.infer<
  typeof exportPackageRegistryRecordSchema
>;

export const exportRegistryCreateInputSchema =
  exportPackageRegistryRecordSchema.omit({
    status: true,
    statusChangedAt: true,
    statusChangedByUserId: true,
  });
export type ExportRegistryCreateInput = z.infer<
  typeof exportRegistryCreateInputSchema
>;

export const exportPackageLifecycleEventSchema = z.object({
  id: opaqueIdSchema,
  packageId: opaqueIdSchema,
  fromStatus: exportPackageLifecycleStatusSchema.nullable(),
  toStatus: exportPackageLifecycleStatusSchema,
  reason: z.string().trim().min(3).max(1000),
  changedAt: isoDateTimeSchema,
  changedByUserId: opaqueIdSchema,
  auditEventId: opaqueIdSchema,
});
export type ExportPackageLifecycleEvent = z.infer<
  typeof exportPackageLifecycleEventSchema
>;

export const exportRegistryTransitionInputSchema = z.object({
  packageId: opaqueIdSchema,
  toStatus: exportPackageLifecycleStatusSchema,
  reason: z.string().trim().min(3).max(1000),
});
export type ExportRegistryTransitionInput = z.infer<
  typeof exportRegistryTransitionInputSchema
>;

export const exportRegistryListInputSchema = z.object({
  patientId: patientIdSchema.optional(),
  status: exportPackageLifecycleStatusSchema.optional(),
  limit: z.number().int().min(1).max(500).default(100),
});
export type ExportRegistryListInput = z.infer<
  typeof exportRegistryListInputSchema
>;

export const exportSigningKeyStatusSchema = z.enum([
  "active",
  "retired",
  "revoked",
]);
export type ExportSigningKeyStatus = z.infer<
  typeof exportSigningKeyStatusSchema
>;

export const exportSigningKeyMetadataSchema = z.object({
  keyId: opaqueIdSchema,
  keyVersion: z.number().int().positive(),
  algorithm: z.literal("ed25519"),
  publicKeyPem: z.string().min(64),
  publicKeyFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  status: exportSigningKeyStatusSchema,
  createdAt: isoDateTimeSchema,
  retiredAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
});
export type ExportSigningKeyMetadata = z.infer<
  typeof exportSigningKeyMetadataSchema
>;

export const exportSigningKeyRotationInputSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});
export type ExportSigningKeyRotationInput = z.infer<
  typeof exportSigningKeyRotationInputSchema
>;

export const exportSigningKeyPassphraseSchema = z
  .string()
  .trim()
  .min(12)
  .max(256);
export type ExportSigningKeyPassphrase = z.infer<
  typeof exportSigningKeyPassphraseSchema
>;

const exportSigningKeyRecoveryKdfSchema = z.object({
  cost: z
    .number()
    .int()
    .min(32_768)
    .max(262_144)
    .refine((value) => (value & (value - 1)) === 0, {
      message: "scrypt cost must be a power of two",
    }),
  blockSize: z.number().int().min(8).max(32),
  parallelization: z.number().int().min(1).max(16),
  maxMemoryBytes: z
    .number()
    .int()
    .min(64 * 1024 * 1024)
    .max(512 * 1024 * 1024),
});

export const exportSigningKeyRecoveryBundleSchema = z.object({
  schemaVersion: z.literal(2),
  keyId: opaqueIdSchema,
  keyVersion: z.number().int().positive(),
  algorithm: z.literal("ed25519"),
  publicKeyPem: z.string().min(64).max(4096),
  publicKeyFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  kdf: z.literal("scrypt"),
  kdfParameters: exportSigningKeyRecoveryKdfSchema,
  saltBase64: z.string().min(16).max(128),
  ivBase64: z.string().min(16).max(64),
  authTagBase64: z.string().min(16).max(64),
  ciphertextBase64: z.string().min(16).max(8192),
  createdAt: isoDateTimeSchema,
});
export type ExportSigningKeyRecoveryBundle = z.infer<
  typeof exportSigningKeyRecoveryBundleSchema
>;

export const patientExportInputSchema = z.object({
  snapshotId: opaqueIdSchema,
  format: exportFormatSchema,
  fhirProfileBundleId: z.string().trim().min(3).max(128).optional(),
  redactionPolicy: exportRedactionPolicySchema,
  exportReason: z.string().trim().min(3).max(500),
});
export type PatientExportInput = z.infer<typeof patientExportInputSchema>;

export const exportRecipientCategorySchema = z.enum([
  "patient",
  "guardian",
  "treating-provider",
  "referral-provider",
  "legal-authority",
  "administrative-authority",
  "internal-clinic",
  "other",
]);
export type ExportRecipientCategory = z.infer<
  typeof exportRecipientCategorySchema
>;

export const exportRecipientVerificationStatusSchema = z.enum([
  "unverified",
  "verified",
  "rejected",
]);
export type ExportRecipientVerificationStatus = z.infer<
  typeof exportRecipientVerificationStatusSchema
>;

export const exportRecipientSchema = z.object({
  id: opaqueIdSchema,
  displayName: z.string().trim().min(1).max(160),
  organizationName: z.string().trim().max(160).optional(),
  category: exportRecipientCategorySchema,
  contactChannel: z.string().trim().max(160).optional(),
  verificationStatus: exportRecipientVerificationStatusSchema,
  createdAt: isoDateTimeSchema,
  createdByUserId: opaqueIdSchema,
});
export type ExportRecipient = z.infer<typeof exportRecipientSchema>;

export const exportConsentEvidenceTypeSchema = z.enum([
  "patient-consent",
  "guardian-consent",
  "clinical-treatment",
  "legal-request",
  "administrative-policy",
  "emergency-exception",
]);
export type ExportConsentEvidenceType = z.infer<
  typeof exportConsentEvidenceTypeSchema
>;

export const exportConsentEvidenceStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
]);
export type ExportConsentEvidenceStatus = z.infer<
  typeof exportConsentEvidenceStatusSchema
>;

export const exportConsentEvidenceSchema = z.object({
  id: opaqueIdSchema,
  patientId: patientIdSchema,
  evidenceType: exportConsentEvidenceTypeSchema,
  status: exportConsentEvidenceStatusSchema,
  sourceReference: z.string().trim().min(1).max(240),
  sourceHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  relatedPersonId: opaqueIdSchema.optional(),
  effectiveFrom: isoDateTimeSchema.optional(),
  effectiveUntil: isoDateTimeSchema.optional(),
  recordedByUserId: opaqueIdSchema,
  recordedAt: isoDateTimeSchema,
  reviewedByUserId: opaqueIdSchema.optional(),
  reviewedAt: isoDateTimeSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type ExportConsentEvidence = z.infer<typeof exportConsentEvidenceSchema>;

export const exportDisclosureStatusSchema = z.enum([
  "requested",
  "approved",
  "rejected",
  "sent",
  "acknowledged",
  "cancelled",
]);
export type ExportDisclosureStatus = z.infer<
  typeof exportDisclosureStatusSchema
>;

export const exportPurposeOfUseSchema = z.enum([
  "treatment",
  "referral",
  "patient-access",
  "legal-request",
  "administrative",
  "emergency",
]);
export type ExportPurposeOfUse = z.infer<typeof exportPurposeOfUseSchema>;

export const exportDeliveryMethodSchema = z.enum([
  "usb",
  "lan-share",
  "local-copy",
  "printed",
  "other",
]);
export type ExportDeliveryMethod = z.infer<typeof exportDeliveryMethodSchema>;

export const exportDisclosureSchema = z.object({
  id: opaqueIdSchema,
  packageId: opaqueIdSchema,
  patientId: patientIdSchema,
  recipientId: opaqueIdSchema,
  purposeOfUse: exportPurposeOfUseSchema,
  deliveryMethod: exportDeliveryMethodSchema,
  status: exportDisclosureStatusSchema,
  requestedByUserId: opaqueIdSchema,
  requestedAt: isoDateTimeSchema,
  approvedByUserId: opaqueIdSchema.optional(),
  approvedAt: isoDateTimeSchema.optional(),
  decisionReason: z.string().trim().max(1000).optional(),
  sentAt: isoDateTimeSchema.optional(),
  acknowledgedAt: isoDateTimeSchema.optional(),
  consentEvidenceId: opaqueIdSchema.optional(),
  receiptId: opaqueIdSchema.optional(),
});
export type ExportDisclosure = z.infer<typeof exportDisclosureSchema>;

export const exportDisclosureRequestSchema = z.object({
  packageId: opaqueIdSchema,
  recipientId: opaqueIdSchema,
  purposeOfUse: exportPurposeOfUseSchema,
  deliveryMethod: exportDeliveryMethodSchema,
  consentEvidenceId: opaqueIdSchema.optional(),
  reason: z.string().trim().min(3).max(1000),
});
export type ExportDisclosureRequest = z.infer<
  typeof exportDisclosureRequestSchema
>;

export const exportDisclosureDecisionSchema = z.object({
  disclosureId: opaqueIdSchema,
  decision: z.enum(["approve", "reject", "cancel"]),
  reason: z.string().trim().min(3).max(1000),
});
export type ExportDisclosureDecision = z.infer<
  typeof exportDisclosureDecisionSchema
>;

export const exportReceiptSchema = z.object({
  id: opaqueIdSchema,
  disclosureId: opaqueIdSchema,
  packageId: opaqueIdSchema,
  recipientId: opaqueIdSchema,
  purposeOfUse: exportPurposeOfUseSchema,
  packageHash: z.string().regex(/^[a-f0-9]{64}$/),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  signerKeyId: opaqueIdSchema,
  signerKeyVersion: z.number().int().positive(),
  statusAtIssuance: exportPackageLifecycleStatusSchema,
  issuedAt: isoDateTimeSchema,
  issuedByUserId: opaqueIdSchema,
  receiptHash: z.string().regex(/^[a-f0-9]{64}$/),
  signatureBase64: z.string().min(16),
  acknowledgedAt: isoDateTimeSchema.optional(),
});
export type ExportReceipt = z.infer<typeof exportReceiptSchema>;

export const exportSecurityLabelSchema = z.object({
  system: z.string().url(),
  code: z.string().trim().min(1).max(64),
  display: z.string().trim().min(1).max(160),
});
export type ExportSecurityLabel = z.infer<typeof exportSecurityLabelSchema>;

export const exportFhirGovernanceMetadataSchema = z.object({
  provenanceResourceId: opaqueIdSchema,
  auditEventResourceId: opaqueIdSchema,
  purposeOfUse: exportPurposeOfUseSchema,
  securityLabels: z.array(exportSecurityLabelSchema).min(1),
  redactionPolicy: exportRedactionPolicySchema,
  redactionSummary: z.string().trim().min(1).max(1000),
});
export type ExportFhirGovernanceMetadata = z.infer<
  typeof exportFhirGovernanceMetadataSchema
>;

export const exportRecipientCreateInputSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  organizationName: z.string().trim().max(160).optional(),
  category: exportRecipientCategorySchema,
  contactChannel: z.string().trim().max(160).optional(),
});
export type ExportRecipientCreateInput = z.infer<
  typeof exportRecipientCreateInputSchema
>;

export const exportConsentEvidenceCreateInputSchema = z.object({
  patientId: patientIdSchema,
  evidenceType: exportConsentEvidenceTypeSchema,
  sourceReference: z.string().trim().min(1).max(240),
  sourceHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  relatedPersonId: opaqueIdSchema.optional(),
  effectiveFrom: isoDateTimeSchema.optional(),
  effectiveUntil: isoDateTimeSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type ExportConsentEvidenceCreateInput = z.infer<
  typeof exportConsentEvidenceCreateInputSchema
>;

export const exportFieldPolicySchema = z.object({
  includeName: z.boolean(),
  includeDateOfBirth: z.boolean(),
  includeSex: z.boolean(),
  includePhone: z.boolean(),
  includeNationalId: z.boolean(),
  includeMedicalHistory: z.boolean(),
  includeEncounter: z.boolean(),
});
export type ExportFieldPolicy = z.infer<typeof exportFieldPolicySchema>;

export const patientExportPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  patientId: patientIdSchema,
  identity: z.object({
    patientId: patientIdSchema,
    nameEn: z.string().optional(),
    nameAr: z.string().optional(),
    dob: z.string().trim().max(32).optional(),
    sex: z.string().optional(),
    phone: z.string().optional(),
    nationalId: z.string().optional(),
  }),
  medicalHistory: z.array(z.record(z.string(), z.unknown())),
  effectiveEncounter: effectiveEncounterSchema,
  redactionPolicy: exportRedactionPolicySchema,
  fieldPolicy: exportFieldPolicySchema,
  snapshotId: opaqueIdSchema,
  snapshotPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PatientExportPayload = z.infer<typeof patientExportPayloadSchema>;

export const signedExportManifestSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  packageType: z.enum(["detached", "zip"]).optional(),
  packageId: opaqueIdSchema,
  snapshotId: opaqueIdSchema,
  snapshotPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  signatureAlgorithm: z.literal("ed25519"),
  signerKeyId: opaqueIdSchema.optional(),
  signerKeyVersion: z.number().int().positive().optional(),
  publicKeyPem: z.string().min(64),
  signatureBase64: z.string().min(16),
  format: exportFormatSchema,
  redactionPolicy: exportRedactionPolicySchema,
  exportReason: z.string().trim().min(3).max(500),
  createdAt: isoDateTimeSchema,
  createdByUserId: opaqueIdSchema,
  orgIdentifier: orgIdentifierSchema.optional(),
  expiresAt: isoDateTimeSchema.nullable().optional(),
  expirationPolicy: exportExpirationPolicySchema.optional(),
  fhirValidation: fhirValidationResultSchema.optional(),
  fhirProfileBundleId: z.string().min(3).max(128).optional(),
  fhirProfileBundleHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  memberHashes: z
    .record(z.string(), z.string().regex(/^[a-f0-9]{64}$/))
    .optional(),
  packageContentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  revokedAt: isoDateTimeSchema.optional(),
  revokedReason: z.string().max(1000).optional(),
});
export type SignedExportManifest = z.infer<typeof signedExportManifestSchema>;

export const exportPackageSchema = z.object({
  manifest: signedExportManifestSchema,
  payloadBase64: z.string().min(1),
  payloadFileName: z.string().regex(/^[a-zA-Z0-9._-]+$/),
  manifestFileName: z.string().regex(/^[a-zA-Z0-9._-]+$/),
  signatureFileName: z.string().regex(/^[a-zA-Z0-9._-]+$/),
});
export type ExportPackage = z.infer<typeof exportPackageSchema>;

export const exportZipPackageSchema = z.object({
  packageId: opaqueIdSchema,
  archiveFileName: z.string().regex(/^[a-zA-Z0-9._-]+\.zip$/),
  manifest: signedExportManifestSchema.refine(
    (manifest) => manifest.packageType === "zip",
    "ZIP package manifest must declare packageType=zip",
  ),
  memberNames: z.array(z.string().regex(/^[a-zA-Z0-9._-]+$/)).min(4),
  archivePath: z.string().min(1),
});
export type ExportZipPackage = z.infer<typeof exportZipPackageSchema>;

export const exportResultSchema = z.object({
  package: exportPackageSchema,
  savedFiles: z.object({
    payloadPath: z.string().min(1),
    manifestPath: z.string().min(1),
    signaturePath: z.string().min(1),
  }),
});
export type ExportResult = z.infer<typeof exportResultSchema>;

export const exportVerificationInputSchema = z.object({
  manifestJson: z.string().min(20),
  payloadBase64: z.string().min(1),
});
export type ExportVerificationInput = z.infer<
  typeof exportVerificationInputSchema
>;

export const exportVerificationResultSchema = z.object({
  verified: z.boolean(),
  signatureValid: z.boolean(),
  payloadHashValid: z.boolean(),
  snapshotHashPresent: z.boolean(),
  reason: z.string(),
  archiveIntegrityValid: z.boolean().default(false),
  expired: z.boolean().default(false),
  revoked: z.boolean().default(false),
  revocation: exportRevocationSchema.optional(),
  manifest: signedExportManifestSchema.optional(),
});
export type ExportVerificationResult = z.infer<
  typeof exportVerificationResultSchema
>;

export const projectionSnapshotSchema = z.object({
  id: opaqueIdSchema,
  encounterId: opaqueIdSchema,
  patientId: patientIdSchema,
  signedEncounterVersion: z.number().int().positive(),
  effectiveVersion: z.number().int().positive(),
  appliedAmendmentCount: z.number().int().nonnegative(),
  effectiveEncounter: effectiveEncounterSchema,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  exportReason: z.string().trim().min(3).max(500),
  createdAt: isoDateTimeSchema,
  createdByUserId: opaqueIdSchema,
});
export type ProjectionSnapshot = z.infer<typeof projectionSnapshotSchema>;

export const amendmentConflictResolutionSchema = z.enum(["rebase", "reject"]);
export type AmendmentConflictResolution = z.infer<
  typeof amendmentConflictResolutionSchema
>;

export const diagnosisInputSchema = z.object({
  icd10CodeId: opaqueIdSchema,
  diagnosisTextEn: z.string().trim().min(1).max(240),
  isPrimary: z.boolean().default(false),
});
export type DiagnosisInput = z.infer<typeof diagnosisInputSchema>;

export const diagnosisApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
]);
export type DiagnosisApprovalStatus = z.infer<
  typeof diagnosisApprovalStatusSchema
>;

export const diagnosisSchema = diagnosisInputSchema.extend({
  id: opaqueIdSchema,
  encounterId: opaqueIdSchema,
  patientId: patientIdSchema,
  icd10Code: z.string().trim().min(1).max(32),
  icd10TitleEn: z.string().trim().min(1).max(240),
  approvalStatus: diagnosisApprovalStatusSchema,
  recordedByUserId: opaqueIdSchema,
  recordedAt: isoDateTimeSchema,
  approvedByUserId: opaqueIdSchema.optional(),
  approvedAt: isoDateTimeSchema.optional(),
  approvalReason: z.string().max(500).optional(),
  version: z.number().int().positive(),
});
export type Diagnosis = z.infer<typeof diagnosisSchema>;

export const patientRelationLinkInputSchema = z.object({
  relatedPersonId: opaqueIdSchema,
  relationshipRole: z.string().trim().min(1).max(80),
  isPrimary: z.boolean().default(false),
  consentAuthority: relationshipConsentAuthoritySchema.default("none"),
});
export type PatientRelationLinkInput = z.infer<
  typeof patientRelationLinkInputSchema
>;

export const patientRegistrationInputSchema = z.object({
  registrationMode: patientRegistrationModeSchema,
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().max(160).optional(),
  dob: z.string().date().optional(),
  sex: z.enum(["female", "male", "intersex", "unknown"]).optional(),
  phone: phoneSchema,
  nationalId: z.string().trim().max(64).optional(),
  primaryDepartmentId: opaqueIdSchema.optional(),
  relatedPersons: z.array(patientRelationLinkInputSchema).max(20).optional(),
});
export type PatientRegistrationInput = z.infer<
  typeof patientRegistrationInputSchema
>;

export const patientUpdateInputSchema = patientRegistrationInputSchema
  .omit({ registrationMode: true, relatedPersons: true })
  .extend({
    registrationMode: patientRegistrationModeSchema.optional(),
    relatedPersons: z.array(patientRelationLinkInputSchema).max(20).optional(),
  });
export type PatientUpdateInput = z.infer<typeof patientUpdateInputSchema>;

export const duplicateDecisionSchema = z.object({
  type: z.literal("create-another"),
  reason: z.string().trim().min(3).max(500),
});
export type DuplicateDecision = z.infer<typeof duplicateDecisionSchema>;

export const duplicateSignalSchema = z.object({
  code: z.enum(["national-id", "name-en", "dob", "phone", "name-ar", "sex"]),
  weight: z.number().int().nonnegative(),
});
export type DuplicateSignal = z.infer<typeof duplicateSignalSchema>;

export const duplicateCandidateSchema = z.object({
  patient: patientSchema,
  score: z.number().int().nonnegative(),
  severity: z.enum(["possible", "high"]),
  signals: z.array(duplicateSignalSchema),
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;

export const patientMergeFieldSchema = z.enum([
  "nameEn",
  "nameAr",
  "dob",
  "sex",
  "phone",
  "nationalId",
  "primaryDepartmentId",
]);
export type PatientMergeField = z.infer<typeof patientMergeFieldSchema>;

const patientMergeDecisionSchema = z.enum(["source", "target"]);
export const patientMergeFieldDecisionsSchema = z
  .object({
    nameEn: patientMergeDecisionSchema.optional(),
    nameAr: patientMergeDecisionSchema.optional(),
    dob: patientMergeDecisionSchema.optional(),
    sex: patientMergeDecisionSchema.optional(),
    phone: patientMergeDecisionSchema.optional(),
    nationalId: patientMergeDecisionSchema.optional(),
    primaryDepartmentId: patientMergeDecisionSchema.optional(),
  })
  .strict();
export type PatientMergeFieldDecisions = z.infer<
  typeof patientMergeFieldDecisionsSchema
>;

export const patientMergeRequestSchema = z.object({
  sourcePatientId: patientIdSchema,
  targetPatientId: patientIdSchema,
  reason: z.string().trim().min(3).max(500),
  fieldDecisions: patientMergeFieldDecisionsSchema.default({}),
});
export type PatientMergeRequest = z.infer<typeof patientMergeRequestSchema>;

export const patientMergeCaseSchema = z.object({
  id: opaqueIdSchema,
  sourcePatientId: patientIdSchema,
  targetPatientId: patientIdSchema,
  status: z.enum(["pending", "approved", "rejected", "cancelled", "executed"]),
  reason: z.string().trim().min(3).max(500),
  fieldDecisions: patientMergeFieldDecisionsSchema,
  correlationId: opaqueIdSchema,
  requestedByUserId: opaqueIdSchema,
  requestedAt: isoDateTimeSchema,
  reviewedByUserId: opaqueIdSchema.optional(),
  reviewedAt: isoDateTimeSchema.optional(),
  reviewReason: z.string().optional(),
  executedByUserId: opaqueIdSchema.optional(),
  executedAt: isoDateTimeSchema.optional(),
});
export type PatientMergeCase = z.infer<typeof patientMergeCaseSchema>;

export const patientArchiveInputSchema = z.object({
  patientId: patientIdSchema,
  reason: z.string().trim().min(3).max(500),
});
export type PatientArchiveInput = z.infer<typeof patientArchiveInputSchema>;

export const clinicalLifecycleSchema = z.enum(["active", "archived"]);
export type ClinicalLifecycle = z.infer<typeof clinicalLifecycleSchema>;

export const specialtySchema = z.object({
  id: opaqueIdSchema,
  code: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().max(160).optional(),
  status: clinicalLifecycleSchema,
  sortOrder: z.number().int(),
  version: z.number().int().positive(),
});
export type Specialty = z.infer<typeof specialtySchema>;

export const departmentSchema = z.object({
  id: opaqueIdSchema,
  specialtyId: opaqueIdSchema,
  code: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().max(160).optional(),
  status: clinicalLifecycleSchema,
  version: z.number().int().positive(),
});
export type Department = z.infer<typeof departmentSchema>;

export const serviceSchema = z.object({
  id: opaqueIdSchema,
  departmentId: opaqueIdSchema,
  code: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().max(160).optional(),
  durationMinutes: z.number().int().min(5).max(480),
  priceEgp: z.number().int().nonnegative(),
  status: clinicalLifecycleSchema,
  version: z.number().int().positive(),
});
export type Service = z.infer<typeof serviceSchema>;

export const drugCatalogSourceKindSchema = z.enum([
  "remote-json",
  "local-json",
]);
export type DrugCatalogSourceKind = z.infer<typeof drugCatalogSourceKindSchema>;
export const drugCatalogSnapshotStatusSchema = z.enum([
  "staged",
  "active",
  "superseded",
  "rejected",
]);
export type DrugCatalogSnapshotStatus = z.infer<
  typeof drugCatalogSnapshotStatusSchema
>;
export const drugCatalogWarningSchema = z.object({
  highBloodPressure: z.boolean(),
  diabetes: z.boolean(),
  pregnancy: z.boolean(),
  lactation: z.boolean(),
  kidney: z.boolean(),
  liver: z.boolean(),
  heart: z.boolean(),
});
export type DrugCatalogWarning = z.infer<typeof drugCatalogWarningSchema>;
export const drugCatalogImportInputSchema = z.object({
  sourceKind: drugCatalogSourceKindSchema,
  sourceUrl: z.string().url(),
  sourceCommit: z.string().trim().min(7).max(80),
  sourceFile: z.literal("data/eg_drugs.json"),
  sourceVersion: z.string().trim().min(1).max(80),
  licenseAcknowledged: z.literal(true),
  content: z.string().min(2).max(50_000_000),
});
export type DrugCatalogImportInput = z.infer<
  typeof drugCatalogImportInputSchema
>;
export const drugCatalogRemoteImportInputSchema = z.object({
  sourceKind: z.literal("remote-json"),
  sourceUrl: z.string().url(),
  sourceCommit: z.string().trim().min(7).max(80),
  sourceFile: z.literal("data/eg_drugs.json"),
  sourceVersion: z.string().trim().min(1).max(80),
  licenseAcknowledged: z.literal(true),
});
export type DrugCatalogRemoteImportInput = z.infer<
  typeof drugCatalogRemoteImportInputSchema
>;
export const drugCatalogSnapshotTransitionInputSchema = z.object({
  snapshotId: opaqueIdSchema,
  reason: z.string().trim().min(3).max(500),
});
export type DrugCatalogSnapshotTransitionInput = z.infer<
  typeof drugCatalogSnapshotTransitionInputSchema
>;
export const drugCatalogSnapshotSchema = z.object({
  id: opaqueIdSchema,
  sourceKind: drugCatalogSourceKindSchema,
  sourceUrl: z.string().url(),
  sourceCommit: z.string().trim().min(7).max(80),
  sourceFile: z.literal("data/eg_drugs.json"),
  sourceVersion: z.string().trim().min(1).max(80),
  licenseAcknowledged: z.literal(true),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: drugCatalogSnapshotStatusSchema,
  totalRecords: z.number().int().nonnegative(),
  validRecords: z.number().int().nonnegative(),
  invalidRecords: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  createdByUserId: opaqueIdSchema,
  promotedAt: isoDateTimeSchema.optional(),
  promotedByUserId: opaqueIdSchema.optional(),
  supersededAt: isoDateTimeSchema.optional(),
  rejectedAt: isoDateTimeSchema.optional(),
  rejectionReason: z.string().optional(),
  previousSnapshotId: opaqueIdSchema.optional(),
});
export type DrugCatalogSnapshot = z.infer<typeof drugCatalogSnapshotSchema>;
export const drugCatalogEntrySchema = z.object({
  id: opaqueIdSchema,
  snapshotId: opaqueIdSchema,
  externalId: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().min(1).max(240),
  nameAr: z.string().trim().max(240).optional(),
  activeIngredients: z.string().trim().min(1).max(2000),
  company: z.string().trim().max(240).optional(),
  priceEgp: z.number().nonnegative().max(1_000_000).optional(),
  oldPriceEgp: z.number().nonnegative().max(1_000_000).optional(),
  availability: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(80).optional(),
  slug: z.string().trim().max(240).optional(),
  units: z.string().trim().max(240).optional(),
  description: z.string().trim().max(1000).optional(),
  usesAr: z.string().trim().max(5000).optional(),
  matchedFdaIngredients: z.string().trim().max(2000).optional(),
  usesSummaryAr: z.string().trim().max(2000).optional(),
  usesSummaryEn: z.string().trim().max(2000).optional(),
  warnings: drugCatalogWarningSchema,
  warningsSummaryAr: z.string().trim().max(5000).optional(),
  warningsSummaryEn: z.string().trim().max(5000).optional(),
  validationStatus: z.enum(["valid", "invalid"]),
  validationErrors: z.array(z.string().trim().min(1).max(240)).max(20),
});
export type DrugCatalogEntry = z.infer<typeof drugCatalogEntrySchema>;

export const billingInvoiceStatusSchema = z.enum([
  "open",
  "partially-paid",
  "paid",
  "voided",
  "refunded",
]);
export type BillingInvoiceStatus = z.infer<typeof billingInvoiceStatusSchema>;
export const billingPaymentMethodSchema = z.enum([
  "cash",
  "card",
  "bank-transfer",
  "other",
]);
export type BillingPaymentMethod = z.infer<typeof billingPaymentMethodSchema>;
export const billingPaymentStatusSchema = z.enum([
  "posted",
  "voided",
  "refunded",
]);
export type BillingPaymentStatus = z.infer<typeof billingPaymentStatusSchema>;
export const billingPackageStatusSchema = z.enum(["active", "archived"]);
export type BillingPackageStatus = z.infer<typeof billingPackageStatusSchema>;
export const billingPackageItemInputSchema = z.object({
  serviceId: opaqueIdSchema,
  quantity: z.number().int().positive().max(100),
});
export type BillingPackageItemInput = z.infer<
  typeof billingPackageItemInputSchema
>;
export const billingPackageInputSchema = z.object({
  code: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().max(160).optional(),
  priceEgp: z.number().int().nonnegative(),
  validityDays: z.number().int().positive().max(3650).optional(),
  items: z.array(billingPackageItemInputSchema).min(1).max(100),
});
export type BillingPackageInput = z.infer<typeof billingPackageInputSchema>;
export const billingPackageItemSchema = billingPackageItemInputSchema.extend({
  serviceNameEn: z.string().trim().min(1).max(160),
});
export type BillingPackageItem = z.infer<typeof billingPackageItemSchema>;
export const billingPackageSchema = billingPackageInputSchema
  .omit({ items: true })
  .extend({
    id: opaqueIdSchema,
    status: billingPackageStatusSchema,
    items: z.array(billingPackageItemSchema),
    createdAt: isoDateTimeSchema,
    createdByUserId: opaqueIdSchema,
    updatedAt: isoDateTimeSchema,
    updatedByUserId: opaqueIdSchema,
    version: z.number().int().positive(),
  });
export type BillingPackage = z.infer<typeof billingPackageSchema>;
const billingInvoiceLineBaseSchema = z.object({
  serviceId: opaqueIdSchema.optional(),
  packageId: opaqueIdSchema.optional(),
  quantity: z.number().int().positive().max(100),
  descriptionEn: z.string().trim().min(1).max(240).optional(),
});
export const billingInvoiceLineInputSchema =
  billingInvoiceLineBaseSchema.refine(
    (value) => Boolean(value.serviceId) !== Boolean(value.packageId),
    {
      message:
        "Each invoice line must reference exactly one service or package",
    },
  );
export type BillingInvoiceLineInput = z.infer<
  typeof billingInvoiceLineInputSchema
>;
export const billingInvoiceCreateInputSchema = z.object({
  patientId: patientIdSchema,
  appointmentId: opaqueIdSchema.optional(),
  lines: z.array(billingInvoiceLineInputSchema).min(1).max(100),
  discountEgp: z.number().int().nonnegative().default(0),
  discountReason: z.string().trim().min(3).max(500).optional(),
});
export type BillingInvoiceCreateInput = z.infer<
  typeof billingInvoiceCreateInputSchema
>;
export const billingInvoiceLineSchema = billingInvoiceLineBaseSchema.extend({
  id: opaqueIdSchema,
  descriptionEn: z.string().trim().min(1).max(240),
  unitPriceEgp: z.number().int().nonnegative(),
  lineTotalEgp: z.number().int().nonnegative(),
});
export type BillingInvoiceLine = z.infer<typeof billingInvoiceLineSchema>;
export const billingInvoiceSchema = z.object({
  id: opaqueIdSchema,
  invoiceNumber: z.string().regex(/^EL-INV-\d{6}$/),
  patientId: patientIdSchema,
  appointmentId: opaqueIdSchema.optional(),
  currency: z.literal("EGP"),
  status: billingInvoiceStatusSchema,
  subtotalEgp: z.number().int().nonnegative(),
  discountEgp: z.number().int().nonnegative(),
  totalEgp: z.number().int().nonnegative(),
  paidEgp: z.number().int().nonnegative(),
  balanceEgp: z.number().int().nonnegative(),
  lines: z.array(billingInvoiceLineSchema),
  createdAt: isoDateTimeSchema,
  createdByUserId: opaqueIdSchema,
  updatedAt: isoDateTimeSchema,
  updatedByUserId: opaqueIdSchema,
  version: z.number().int().positive(),
});
export type BillingInvoice = z.infer<typeof billingInvoiceSchema>;
export const billingPaymentInputSchema = z.object({
  invoiceId: opaqueIdSchema,
  amountEgp: z.number().int().positive(),
  method: billingPaymentMethodSchema,
  reference: z.string().trim().max(160).optional(),
});
export type BillingPaymentInput = z.infer<typeof billingPaymentInputSchema>;
export const billingPaymentSchema = billingPaymentInputSchema.extend({
  id: opaqueIdSchema,
  status: billingPaymentStatusSchema,
  receivedAt: isoDateTimeSchema,
  receivedByUserId: opaqueIdSchema,
  version: z.number().int().positive(),
});
export type BillingPayment = z.infer<typeof billingPaymentSchema>;
export const billingRefundInputSchema = z.object({
  paymentId: opaqueIdSchema,
  amountEgp: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
export type BillingRefundInput = z.infer<typeof billingRefundInputSchema>;
export const billingRefundSchema = billingRefundInputSchema.extend({
  id: opaqueIdSchema,
  status: z.enum(["posted", "voided"]),
  refundedAt: isoDateTimeSchema,
  refundedByUserId: opaqueIdSchema,
});
export type BillingRefund = z.infer<typeof billingRefundSchema>;
export const billingReceiptSchema = z.object({
  id: opaqueIdSchema,
  receiptNumber: z.string().regex(/^EL-REC-\d{6}$/),
  invoiceId: opaqueIdSchema,
  paymentId: opaqueIdSchema,
  amountEgp: z.number().int().positive(),
  issuedAt: isoDateTimeSchema,
  issuedByUserId: opaqueIdSchema,
  status: z.enum(["issued", "voided"]),
});
export type BillingReceipt = z.infer<typeof billingReceiptSchema>;

export const scheduleInputSchema = z.object({
  doctorId: opaqueIdSchema,
  departmentId: opaqueIdSchema,
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  slotDurationMinutes: z.number().int().min(5).max(480).default(15),
});
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export const scheduleSchema = scheduleInputSchema.extend({
  id: opaqueIdSchema,
  version: z.number().int().positive(),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export const scheduleExceptionInputSchema = z.object({
  doctorId: opaqueIdSchema.optional(),
  departmentId: opaqueIdSchema.optional(),
  exceptionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["closed", "open"]),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  reason: z.string().trim().min(3).max(500),
});
export type ScheduleExceptionInput = z.infer<
  typeof scheduleExceptionInputSchema
>;

export const scheduleExceptionSchema = scheduleExceptionInputSchema.extend({
  id: opaqueIdSchema,
  createdAt: isoDateTimeSchema,
});
export type ScheduleException = z.infer<typeof scheduleExceptionSchema>;

export const appointmentCalendarQuerySchema = z
  .object({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    doctorId: opaqueIdSchema.optional(),
  })
  .refine(
    (value) =>
      !value.from || !value.to || new Date(value.from) < new Date(value.to),
    { message: "from must be before to" },
  );
export type AppointmentCalendarQuery = z.infer<
  typeof appointmentCalendarQuerySchema
>;

export const appointmentStatusSchema = z.enum([
  "scheduled",
  "arrived",
  "in-consultation",
  "completed",
  "cancelled",
  "no-show",
  "rescheduled",
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export const appointmentSchema = z.object({
  id: opaqueIdSchema,
  patientId: patientIdSchema,
  departmentId: opaqueIdSchema,
  doctorId: opaqueIdSchema.optional(),
  serviceId: opaqueIdSchema.optional(),
  scheduledStart: isoDateTimeSchema,
  scheduledEnd: isoDateTimeSchema,
  durationMinutes: z.number().int().min(5).max(480).default(15),
  status: appointmentStatusSchema,
  visitType: z.string().trim().min(1).max(80),
  isWalkIn: z.boolean(),
  notes: z.string().max(4000).optional(),
  createdAt: isoDateTimeSchema,
  createdByUserId: opaqueIdSchema,
  updatedAt: isoDateTimeSchema,
  updatedByUserId: opaqueIdSchema,
  version: z.number().int().positive(),
});
export type Appointment = z.infer<typeof appointmentSchema>;

export const appointmentCreateInputSchema = z.object({
  patientId: patientIdSchema,
  departmentId: opaqueIdSchema,
  doctorId: opaqueIdSchema.optional(),
  serviceId: opaqueIdSchema.optional(),
  scheduledStart: isoDateTimeSchema,
  scheduledEnd: isoDateTimeSchema.optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  visitType: z.string().trim().min(1).max(80),
  isWalkIn: z.boolean().default(false),
  notes: z.string().max(4000).optional(),
});
export type AppointmentCreateInput = z.infer<
  typeof appointmentCreateInputSchema
>;

export const appointmentStatusUpdateSchema = z.object({
  status: appointmentStatusSchema,
  reason: z.string().trim().min(3).max(500).optional(),
});
export type AppointmentStatusUpdate = z.infer<
  typeof appointmentStatusUpdateSchema
>;

export const syncOperationSchema = z.enum([
  "create",
  "update",
  "archive",
  "amend",
  "merge",
]);
export type SyncOperation = z.infer<typeof syncOperationSchema>;

export const syncEventSchema = z.object({
  id: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  userId: opaqueIdSchema,
  entityType: z.string().trim().min(1).max(80),
  entityId: opaqueIdSchema,
  baseVersion: z.number().int().nonnegative(),
  newVersion: z.number().int().positive(),
  operation: syncOperationSchema,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  occurredAt: isoDateTimeSchema,
  receivedAt: isoDateTimeSchema.optional(),
});
export type SyncEvent = z.infer<typeof syncEventSchema>;

export const syncConflictSchema = z.object({
  id: opaqueIdSchema,
  entityType: z.string().trim().min(1).max(80),
  entityId: opaqueIdSchema,
  leftEventId: opaqueIdSchema,
  rightEventId: opaqueIdSchema,
  status: z.enum(["open", "resolved", "rejected"]),
  resolution: z
    .enum(["amendment", "keep-left", "keep-right", "manual-merge"])
    .optional(),
  resolvedByUserId: opaqueIdSchema.optional(),
  resolvedAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
});
export type SyncConflict = z.infer<typeof syncConflictSchema>;

export {
  assertCanonicalJsonSafeInteger,
  canonicalJson,
  type CanonicalJsonPrimitive,
  type CanonicalJsonValue,
} from "./canonical-json.js";

const step22Base64TextSchema = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .min(16)
  .max(8192);
const step22Sha256FingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const step22NonceSchema = z.string().trim().min(16).max(128);
const step22NoncePrefixSchema = z
  .string()
  .regex(/^[A-Za-z0-9+/]{6}==$|^[A-Za-z0-9+/]{7}=$|^[A-Za-z0-9+/]{8}$/)
  .length(8);
const step22PositiveIntSchema = z.number().int().positive();
const step22HubSignatureSchema = z.object({
  signatureAlgorithm: z.literal("ed25519"),
  signatureBase64: step22Base64TextSchema,
  signerKeyId: opaqueIdSchema,
  signerKeyVersion: step22PositiveIntSchema,
});

export const enrollmentChallengeDescriptorSchema = z.object({
  protocolVersion: z.literal(1),
  messageType: z.literal("enrollment-challenge"),
  challengeId: opaqueIdSchema,
  organizationId: opaqueIdSchema,
  intendedUserId: opaqueIdSchema,
  intendedRole: userRoleSchema,
  requestedPolicyVersion: step22PositiveIntSchema,
  requestedScopes: z.array(syncScopeSchema).min(1).max(6),
  issuedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  responseNonce: step22NonceSchema,
});
export type EnrollmentChallengeDescriptor = z.infer<
  typeof enrollmentChallengeDescriptorSchema
>;

export const enrollmentChallengeSchema = enrollmentChallengeDescriptorSchema
  .extend({
    responseHash: step22Sha256FingerprintSchema,
  })
  .extend(step22HubSignatureSchema.shape);
export type EnrollmentChallenge = z.infer<typeof enrollmentChallengeSchema>;

export const enrollmentDeviceRequestDescriptorSchema = z.object({
  protocolVersion: z.literal(1),
  messageType: z.literal("enrollment-request"),
  requestId: opaqueIdSchema,
  challengeId: opaqueIdSchema,
  organizationId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  deviceName: z.string().trim().min(1).max(120),
  devicePublicKeySpkiBase64: step22Base64TextSchema,
  devicePublicKeyFingerprint: step22Sha256FingerprintSchema,
  appVersion: z.string().trim().min(1).max(64),
  apiLevel: z.number().int().min(29).max(100).optional(),
  requestedAt: isoDateTimeSchema,
  requestNonce: step22NonceSchema,
});
export type EnrollmentDeviceRequestDescriptor = z.infer<
  typeof enrollmentDeviceRequestDescriptorSchema
>;

export const enrollmentDeviceRequestSchema =
  enrollmentDeviceRequestDescriptorSchema.extend({
    deviceSignatureAlgorithm: z.literal("sha256with-ecdsa"),
    deviceSignatureBase64: step22Base64TextSchema,
  });
export type EnrollmentDeviceRequest = z.infer<
  typeof enrollmentDeviceRequestSchema
>;

export const enrollmentResponseDescriptorSchema = z.object({
  protocolVersion: z.literal(1),
  messageType: z.literal("enrollment-response"),
  enrollmentId: opaqueIdSchema,
  challengeId: opaqueIdSchema,
  organizationId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  userId: opaqueIdSchema,
  role: userRoleSchema,
  deviceName: z.string().trim().min(1).max(120),
  devicePublicKeyFingerprint: step22Sha256FingerprintSchema,
  policyVersion: step22PositiveIntSchema,
  allowedScopes: z.array(syncScopeSchema).min(1).max(6),
  patientScope: z.record(z.string(), z.unknown()).optional(),
  responseNonce: step22NonceSchema,
  issuedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  offlineAccessUntil: isoDateTimeSchema,
  hubTrustAnchorId: opaqueIdSchema,
  hubTrustAnchorVersion: step22PositiveIntSchema,
  responseHash: step22Sha256FingerprintSchema,
});
export type EnrollmentResponseDescriptor = z.infer<
  typeof enrollmentResponseDescriptorSchema
>;

export const enrollmentResponseSchema =
  enrollmentResponseDescriptorSchema.extend(step22HubSignatureSchema.shape);
export type EnrollmentResponse = z.infer<typeof enrollmentResponseSchema>;

export const enrollmentAcknowledgmentDescriptorSchema = z.object({
  protocolVersion: z.literal(1),
  messageType: z.literal("enrollment-acknowledgment"),
  enrollmentId: opaqueIdSchema,
  responseHash: step22Sha256FingerprintSchema,
  deviceId: opaqueIdSchema,
  acceptedAt: isoDateTimeSchema,
  acknowledgmentNonce: step22NonceSchema,
});
export type EnrollmentAcknowledgmentDescriptor = z.infer<
  typeof enrollmentAcknowledgmentDescriptorSchema
>;

export const enrollmentAcknowledgmentSchema =
  enrollmentAcknowledgmentDescriptorSchema.extend({
    deviceSignatureAlgorithm: z.literal("sha256with-ecdsa"),
    deviceSignatureBase64: step22Base64TextSchema,
  });
export type EnrollmentAcknowledgment = z.infer<
  typeof enrollmentAcknowledgmentSchema
>;

export const sessionInitDescriptorSchema = z.object({
  protocolVersion: z.literal(1),
  messageType: z.literal("session-init"),
  organizationId: opaqueIdSchema,
  enrollmentId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  userId: opaqueIdSchema,
  sessionId: opaqueIdSchema,
  requestNonce: step22NonceSchema,
  clientCounter: z.number().int().nonnegative(),
  deviceIdentityKeyFingerprint: step22Sha256FingerprintSchema,
  deviceEphemeralPublicKeySpkiBase64: step22Base64TextSchema,
  deviceEphemeralKeyFingerprint: step22Sha256FingerprintSchema,
  requestedScopes: z.array(syncScopeSchema).min(1).max(6),
  requestedAt: isoDateTimeSchema,
});
export type SessionInitDescriptor = z.infer<typeof sessionInitDescriptorSchema>;

export const sessionInitRequestSchema = sessionInitDescriptorSchema.extend({
  deviceSignatureAlgorithm: z.literal("sha256with-ecdsa"),
  deviceSignatureBase64: step22Base64TextSchema,
});
export type SessionInitRequest = z.infer<typeof sessionInitRequestSchema>;

export const sessionGrantDescriptorSchema = z.object({
  protocolVersion: z.literal(1),
  messageType: z.literal("session-grant"),
  organizationId: opaqueIdSchema,
  enrollmentId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  userId: opaqueIdSchema,
  sessionId: opaqueIdSchema,
  requestNonce: step22NonceSchema,
  clientCounter: z.number().int().nonnegative(),
  serverEphemeralPublicKeySpkiBase64: step22Base64TextSchema,
  serverEphemeralKeyFingerprint: step22Sha256FingerprintSchema,
  grantedScopes: z.array(syncScopeSchema).min(1).max(6),
  issuedAt: isoDateTimeSchema,
  validUntil: isoDateTimeSchema,
  transcriptHash: step22Sha256FingerprintSchema,
  keyConfirmationMacBase64: step22Base64TextSchema,
  noncePrefixBase64: step22NoncePrefixSchema,
});
export type SessionGrantDescriptor = z.infer<
  typeof sessionGrantDescriptorSchema
>;

export const sessionGrantSchema = sessionGrantDescriptorSchema.extend(
  step22HubSignatureSchema.shape,
);
export type SessionGrant = z.infer<typeof sessionGrantSchema>;

export const sessionFrameSchema = z.object({
  protocolVersion: z.literal(1),
  messageType: z.enum([
    "sync-request",
    "sync-response",
    "outbox-request",
    "outbox-response",
    "document-request",
    "document-response",
    "document-upload-request",
    "document-upload-response",
  ]),
  sessionId: opaqueIdSchema,
  direction: z.enum(["client-to-hub", "hub-to-client"]),
  counter: z.number().int().nonnegative(),
  nonceBase64: step22Base64TextSchema,
  aadHash: step22Sha256FingerprintSchema,
  ciphertextBase64: step22Base64TextSchema,
  tagBase64: step22Base64TextSchema,
  deviceSignatureAlgorithm: z.literal("sha256with-ecdsa").optional(),
  deviceSignatureBase64: step22Base64TextSchema.optional(),
});
export type SessionFrame = z.infer<typeof sessionFrameSchema>;

export const enrollmentStateSchema = z.enum([
  "pending",
  "approved",
  "active",
  "suspended",
  "revoked",
  "rejected",
  "expired",
]);
export type EnrollmentState = z.infer<typeof enrollmentStateSchema>;

export const enrollmentChallengeCreateInputSchema = z.object({
  organizationId: opaqueIdSchema,
  intendedUserId: opaqueIdSchema,
  intendedRole: userRoleSchema,
  requestedPolicyVersion: step22PositiveIntSchema,
  requestedScopes: z.array(syncScopeSchema).min(1).max(6),
  validitySeconds: z.number().int().min(60).max(86_400).default(86_400),
});
export type EnrollmentChallengeCreateInput = z.input<
  typeof enrollmentChallengeCreateInputSchema
>;

export const enrollmentStateSummarySchema = z.object({
  enrollmentId: opaqueIdSchema.optional(),
  challengeId: opaqueIdSchema,
  requestId: opaqueIdSchema,
  deviceId: opaqueIdSchema,
  organizationId: opaqueIdSchema,
  ownerUserId: opaqueIdSchema,
  role: userRoleSchema,
  deviceName: z.string().trim().min(1).max(120),
  state: enrollmentStateSchema,
  policyVersion: step22PositiveIntSchema,
  allowedScopes: z.array(syncScopeSchema).max(6),
  issuedAt: isoDateTimeSchema.optional(),
  expiresAt: isoDateTimeSchema.optional(),
  offlineAccessUntil: isoDateTimeSchema.optional(),
  acknowledgedAt: isoDateTimeSchema.optional(),
  revokedAt: isoDateTimeSchema.optional(),
});
export type EnrollmentStateSummary = z.infer<
  typeof enrollmentStateSummarySchema
>;
