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
