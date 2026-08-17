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
  "audit.read",
  "module.manage",
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
    "audit.read",
    "module.manage",
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
  ],
  nurse: [
    "patient.read",
    "patient.write",
    "clinical.read",
    "clinical.write",
    "appointment.read",
    "appointment.write",
  ],
  receptionist: [
    "patient.read",
    "patient.write",
    "appointment.read",
    "appointment.write",
    "billing.read",
    "billing.write",
    "billing.refund",
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

export const patientExportInputSchema = z.object({
  snapshotId: opaqueIdSchema,
  format: exportFormatSchema,
  redactionPolicy: exportRedactionPolicySchema,
  exportReason: z.string().trim().min(3).max(500),
});
export type PatientExportInput = z.infer<typeof patientExportInputSchema>;

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
