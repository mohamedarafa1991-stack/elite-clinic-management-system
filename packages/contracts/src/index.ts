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
  status: z.enum(["active", "archived", "merged"]),
  createdAt: isoDateTimeSchema,
  createdByUserId: opaqueIdSchema,
  updatedAt: isoDateTimeSchema,
  updatedByUserId: opaqueIdSchema,
  schemaVersion: z.number().int().positive(),
});
export type Patient = z.infer<typeof patientSchema>;

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
  scheduledStart: isoDateTimeSchema,
  scheduledEnd: isoDateTimeSchema,
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
