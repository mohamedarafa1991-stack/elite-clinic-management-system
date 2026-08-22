import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import {
  canonicalJson,
  syncCapabilityRequestSchema,
  syncCapabilityResponseSchema,
  syncDeltaRequestSchema,
  syncDeltaResponseSchema,
  syncDevicePolicySchema,
  syncDeviceRegistrationInputSchema,
  syncOutboxAcknowledgmentSchema,
  syncOutboxInputSchema,
  syncResourceConflictSchema,
  syncScopeSchema,
  type SyncCapabilityRequest,
  type SyncCapabilityResponse,
  type SyncDeltaRequest,
  type SyncDeltaResponse,
  type SyncDevicePolicy,
  type SyncDeviceRegistrationInput,
  type SyncOutboxAcknowledgment,
  type SyncOutboxInput,
  type SyncScope,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import { requireCapability, type SessionContext } from "./index.js";
import type { ExportSignaturePort } from "./patient-export-service.js";

const MAX_CHANGES = 5000;
const MIN_REASON_LENGTH = 3;

type Row = any;

function now(): string {
  return new Date().toISOString();
}

function stableJson(value: unknown): string {
  return canonicalJson(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function newOpaqueId(prefix: string): string {
  return `${prefix}-${nanoid(18)}`;
}

function requireReason(reason: string): string {
  if (typeof reason !== "string" || reason.trim().length < MIN_REASON_LENGTH) {
    throw new Error(
      "ELITE_SYNC_REASON_REQUIRED: a reason of at least 3 characters is required",
    );
  }
  return reason.trim().slice(0, 500);
}

function parseScopes(value: string): readonly SyncScope[] {
  const parsed = JSON.parse(value) as unknown;
  const result = syncScopeSchema.array().max(7).safeParse(parsed);
  if (!result.success) {
    throw new Error(
      "ELITE_SYNC_POLICY_CORRUPT: allowed synchronization scopes are invalid",
    );
  }
  return result.data;
}

function payloadHash(payload: Record<string, unknown>): string {
  return sha256(stableJson(payload));
}

function jsonStringArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

interface SyncCursor {
  version: 1;
  scope: SyncScope;
  updatedAt: string;
  resourceId: string;
}

interface SyncPage {
  changes: readonly Record<string, unknown>[];
  nextCursor: string;
  hasMore: boolean;
  fullSyncRequired: boolean;
}

function encodeCursor(cursor: SyncCursor): string {
  return `v1:${Buffer.from(stableJson(cursor), "utf8").toString("base64url")}`;
}

function decodeCursor(value: string | undefined): SyncCursor | undefined {
  if (!value?.startsWith("v1:")) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(value.slice(3), "base64url").toString("utf8"),
    ) as Partial<SyncCursor>;
    if (
      parsed.version !== 1 ||
      !syncScopeSchema.safeParse(parsed.scope).success ||
      typeof parsed.updatedAt !== "string" ||
      typeof parsed.resourceId !== "string"
    )
      return undefined;
    return parsed as SyncCursor;
  } catch {
    return undefined;
  }
}

function cursorPredicate(
  updatedAtColumn: string,
  resourceIdColumn: string,
  cursor: SyncCursor | undefined,
): { sql: string; params: readonly string[] } {
  if (!cursor) return { sql: "", params: [] };
  return {
    sql: ` AND (${updatedAtColumn} > ? OR (${updatedAtColumn} = ? AND ${resourceIdColumn} > ?))`,
    params: [cursor.updatedAt, cursor.updatedAt, cursor.resourceId],
  };
}

function pageRows(
  rows: Row[],
  limit: number,
  scope: SyncScope,
  cursor: SyncCursor | undefined,
): { rows: Row[]; nextCursor: string; hasMore: boolean } {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const nextCursor = last
    ? encodeCursor({
        version: 1,
        scope,
        updatedAt: String(last.updatedAt),
        resourceId: String(last.id),
      })
    : cursor && cursor.scope === scope
      ? encodeCursor(cursor)
      : encodeCursor({ version: 1, scope, updatedAt: "", resourceId: "" });
  return { rows: page, nextCursor, hasMore: rows.length > limit };
}

export class SynchronizationService {
  public constructor(
    private readonly database: EliteDatabase,
    private readonly signaturePort: ExportSignaturePort,
    private readonly clock: () => string = now,
  ) {}

  public registerDevice(
    context: SessionContext,
    input: SyncDeviceRegistrationInput,
  ): SyncDevicePolicy {
    requireCapability(context, "sync.manage");
    const parsed = syncDeviceRegistrationInputSchema.parse(input);
    const device = this.database.raw
      .prepare(
        "SELECT id, platform, status, owner_user_id FROM devices WHERE id = ?",
      )
      .get(parsed.deviceId) as
      | { id: string; platform: string; status: string; owner_user_id: string }
      | undefined;
    if (
      !device ||
      device.platform !== "android" ||
      device.status !== "active"
    ) {
      throw new Error(
        "ELITE_SYNC_DEVICE_UNAVAILABLE: Android device is not active",
      );
    }
    if (device.owner_user_id !== parsed.ownerUserId) {
      throw new Error(
        "ELITE_SYNC_DEVICE_OWNER_MISMATCH: device owner does not match enrollment",
      );
    }
    const timestamp = this.clock();
    const id = newOpaqueId("sync-device");
    const existing = this.database.raw
      .prepare("SELECT id FROM sync_devices WHERE device_id = ?")
      .get(parsed.deviceId) as { id: string } | undefined;
    if (existing) {
      this.database.raw
        .prepare(
          `UPDATE sync_devices
           SET enrollment_id = ?, organization_id = ?, owner_user_id = ?, policy_version = ?, state = 'active', allowed_scopes_json = ?, patient_scope_json = ?, updated_at = ?
           WHERE device_id = ?`,
        )
        .run(
          parsed.enrollmentId,
          parsed.organizationId,
          parsed.ownerUserId,
          parsed.policyVersion,
          JSON.stringify(parsed.allowedScopes),
          parsed.patientScope ? JSON.stringify(parsed.patientScope) : null,
          timestamp,
          parsed.deviceId,
        );
    } else {
      this.database.raw
        .prepare(
          `INSERT INTO sync_devices
           (id, device_id, enrollment_id, organization_id, owner_user_id, policy_version, state, allowed_scopes_json, patient_scope_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
        )
        .run(
          id,
          parsed.deviceId,
          parsed.enrollmentId,
          parsed.organizationId,
          parsed.ownerUserId,
          parsed.policyVersion,
          JSON.stringify(parsed.allowedScopes),
          parsed.patientScope ? JSON.stringify(parsed.patientScope) : null,
          timestamp,
          timestamp,
        );
    }
    this.writeAudit(
      context,
      "sync.device.registered",
      "sync-device",
      parsed.deviceId,
      {
        organizationId: parsed.organizationId,
        policyVersion: parsed.policyVersion,
        scopeCount: parsed.allowedScopes.length,
      },
    );
    return this.getDevicePolicy(context, parsed.deviceId);
  }

  public getDevicePolicy(
    context: SessionContext,
    deviceId: string,
  ): SyncDevicePolicy {
    requireCapability(context, "sync.read");
    const row = this.database.raw
      .prepare("SELECT * FROM sync_devices WHERE device_id = ?")
      .get(deviceId) as Row | undefined;
    if (!row) {
      throw new Error(
        "ELITE_SYNC_DEVICE_NOT_REGISTERED: device has no sync policy",
      );
    }
    if (row.owner_user_id !== context.userId && context.role !== "admin") {
      throw new Error(
        "ELITE_SYNC_DEVICE_FORBIDDEN: device is outside the current user scope",
      );
    }
    return syncDevicePolicySchema.parse({
      deviceId: row.device_id,
      enrollmentId: row.enrollment_id,
      organizationId: row.organization_id,
      ownerUserId: row.owner_user_id,
      policyVersion: row.policy_version,
      allowedScopes: parseScopes(row.allowed_scopes_json),
      patientScope: row.patient_scope_json
        ? (JSON.parse(row.patient_scope_json) as Record<string, unknown>)
        : undefined,
      state: row.state,
    });
  }

  public getCapabilities(
    context: SessionContext,
    input: SyncCapabilityRequest,
  ): SyncCapabilityResponse {
    requireCapability(context, "sync.read");
    const parsed = syncCapabilityRequestSchema.parse(input);
    this.assertRequestIdentity(context, parsed.deviceId, parsed.userId);
    const policy = this.getDevicePolicy(context, parsed.deviceId);
    if (policy.organizationId !== parsed.organizationId) {
      throw new Error(
        "ELITE_SYNC_ORGANIZATION_MISMATCH: organization is not trusted",
      );
    }
    if (policy.state !== "active") {
      throw new Error(
        "ELITE_SYNC_DEVICE_SUSPENDED: synchronization is not active",
      );
    }
    const supportedScopes = parsed.requestedScopes.filter((scope) =>
      policy.allowedScopes.includes(scope),
    );
    const serverTime = this.clock();
    const statusSequence = this.currentServerSequence();
    const responseBody = {
      protocolVersion: 1 as const,
      organizationId: policy.organizationId,
      deviceId: policy.deviceId,
      userId: context.userId,
      supportedScopes,
      policyVersion: policy.policyVersion,
      serverTime,
      minimumClientVersion: "0.1.0",
      statusSequence,
      responseNonce: parsed.requestNonce,
      responseHash: "0".repeat(64),
    };
    const responseHash = sha256(
      stableJson({ ...responseBody, responseHash: undefined }),
    );
    const response = syncCapabilityResponseSchema.parse(
      this.signResponse({ ...responseBody, responseHash }),
    );
    this.writeSyncAudit(
      context,
      policy.deviceId,
      null,
      null,
      "success",
      0,
      0,
      0,
      "capability-granted",
    );
    return response;
  }

  public getDelta(
    context: SessionContext,
    input: SyncDeltaRequest,
  ): SyncDeltaResponse {
    requireCapability(context, "sync.read");
    const parsed = syncDeltaRequestSchema.parse(input);
    this.assertRequestIdentity(context, parsed.deviceId, parsed.userId);
    const policy = this.getDevicePolicy(context, parsed.deviceId);
    if (policy.organizationId !== parsed.organizationId) {
      throw new Error(
        "ELITE_SYNC_ORGANIZATION_MISMATCH: organization is not trusted",
      );
    }
    if (policy.state !== "active") {
      throw new Error(
        "ELITE_SYNC_DEVICE_SUSPENDED: synchronization is not active",
      );
    }
    if (policy.policyVersion !== parsed.knownPolicyVersion) {
      throw new Error(
        "ELITE_SYNC_POLICY_STALE: device policy must be refreshed before synchronization",
      );
    }
    if (!policy.allowedScopes.includes(parsed.scope)) {
      this.writeSyncAudit(
        context,
        policy.deviceId,
        parsed.syncSessionId,
        parsed.scope,
        "rejected",
        0,
        0,
        0,
        "scope-denied",
      );
      throw new Error(
        "ELITE_SYNC_SCOPE_DENIED: requested scope is not allowed",
      );
    }
    const cursor = decodeCursor(parsed.cursor);
    if (parsed.cursor && !cursor) {
      throw new Error("ELITE_SYNC_CURSOR_INVALID: refresh is required");
    }
    if (cursor && cursor.scope !== parsed.scope) {
      throw new Error("ELITE_SYNC_CURSOR_SCOPE_MISMATCH: refresh is required");
    }
    const serverSequence = this.currentServerSequence();
    const page: SyncPage = this.buildChanges(
      parsed.scope,
      context,
      parsed.maxChanges,
      cursor,
    );
    const generatedAt = this.clock();
    const validUntil = new Date(
      Date.parse(generatedAt) + 5 * 60 * 1000,
    ).toISOString();
    const responseWithoutIntegrity = {
      protocolVersion: 1 as const,
      organizationId: policy.organizationId,
      deviceId: policy.deviceId,
      syncSessionId: parsed.syncSessionId,
      scope: parsed.scope,
      serverCursor: page.nextCursor,
      serverSequence,
      generatedAt,
      validUntil,
      fullSyncRequired: page.fullSyncRequired,
      changes: page.changes,
      conflicts: [],
      redactions: [],
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      responseNonce: parsed.requestNonce,
      responseIntegrity: "0".repeat(64),
    };
    const responseIntegrity = sha256(
      stableJson({
        ...responseWithoutIntegrity,
        responseIntegrity: undefined,
      }),
    );
    const response = syncDeltaResponseSchema.parse(
      this.signResponse({ ...responseWithoutIntegrity, responseIntegrity }),
    );
    this.touchDevice(policy.deviceId, generatedAt);
    this.writeSyncAudit(
      context,
      policy.deviceId,
      parsed.syncSessionId,
      parsed.scope,
      "success",
      page.changes.length,
      0,
      0,
      page.hasMore ? "snapshot-page" : "snapshot-complete",
    );
    return response;
  }

  public queueOutbox(
    context: SessionContext,
    input: SyncOutboxInput,
  ): SyncOutboxInput {
    requireCapability(context, "sync.write");
    const parsed = syncOutboxInputSchema.parse(input);
    this.assertRequestIdentity(context, parsed.deviceId, parsed.userId);
    if (parsed.resourceType !== "Appointment") {
      throw new Error(
        "ELITE_SYNC_OUTBOX_SCOPE: first increment only supports appointment operations",
      );
    }
    const policy = this.getDevicePolicy(context, parsed.deviceId);
    if (!policy.allowedScopes.includes(parsed.scope)) {
      throw new Error("ELITE_SYNC_SCOPE_DENIED: outbox scope is not allowed");
    }
    const hash = payloadHash(parsed.payload);
    const timestamp = this.clock();
    this.database.raw
      .prepare(
        `INSERT OR IGNORE INTO sync_outbox
         (id, operation_id, sync_device_id, user_id, organization_id, scope, operation, resource_type, resource_id, base_version, payload_json, payload_hash, reason, state, created_at, updated_at)
         SELECT ?, ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?
         FROM sync_devices WHERE device_id = ?`,
      )
      .run(
        newOpaqueId("sync-outbox"),
        parsed.operationId,
        context.userId,
        parsed.organizationId,
        parsed.scope,
        parsed.operation,
        parsed.resourceType,
        parsed.resourceId,
        parsed.baseVersion,
        JSON.stringify(parsed.payload),
        hash,
        parsed.reason,
        timestamp,
        timestamp,
        parsed.deviceId,
      );
    this.writeAudit(
      context,
      "sync.outbox.queued",
      "sync-outbox",
      parsed.operationId,
      {
        resourceType: parsed.resourceType,
        resourceId: parsed.resourceId,
        operation: parsed.operation,
      },
    );
    return { ...parsed, payload: parsed.payload };
  }

  public recordOutboxAcknowledgment(
    context: SessionContext,
    input: SyncOutboxAcknowledgment,
  ): SyncOutboxAcknowledgment {
    requireCapability(context, "sync.write");
    const parsed = syncOutboxAcknowledgmentSchema.parse(input);
    const row = this.database.raw
      .prepare(
        "SELECT * FROM sync_outbox WHERE operation_id = ? AND user_id = ?",
      )
      .get(parsed.operationId, context.userId) as Row | undefined;
    if (!row) {
      throw new Error(
        "ELITE_SYNC_OUTBOX_NOT_FOUND: operation does not belong to the current user",
      );
    }
    const timestamp = parsed.acknowledgedAt;
    const transaction = this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          "UPDATE sync_outbox SET state = ?, updated_at = ?, last_error_code = ? WHERE operation_id = ?",
        )
        .run(
          parsed.state,
          timestamp,
          parsed.state === "rejected" ? "HUB_REJECTED" : null,
          parsed.operationId,
        );
      if (parsed.conflict) {
        const conflict = syncResourceConflictSchema.parse(parsed.conflict);
        this.database.raw
          .prepare(
            `INSERT OR IGNORE INTO clinical_sync_conflicts
             (id, sync_device_id, operation_id, resource_type, resource_id, client_base_version, server_version, conflict_type, resolution, created_at)
             VALUES (?, (SELECT sync_device_id FROM sync_outbox WHERE operation_id = ?), ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            newOpaqueId("sync-conflict"),
            parsed.operationId,
            parsed.operationId,
            conflict.resourceType,
            conflict.resourceId,
            conflict.clientBaseVersion,
            conflict.serverVersion,
            conflict.conflictType,
            conflict.resolution,
            timestamp,
          );
      }
    });
    transaction();
    this.writeAudit(
      context,
      "sync.outbox.acknowledged",
      "sync-outbox",
      parsed.operationId,
      {
        state: parsed.state,
        serverVersion: parsed.serverVersion,
      },
    );
    return parsed;
  }

  public listPendingOutbox(
    context: SessionContext,
    deviceId: string,
  ): readonly Row[] {
    requireCapability(context, "sync.write");
    this.assertRequestIdentity(context, deviceId, context.userId);
    return this.database.raw
      .prepare(
        `SELECT operation_id AS operationId, scope, operation, resource_type AS resourceType,
                resource_id AS resourceId, base_version AS baseVersion, payload_json AS payloadJson,
                payload_hash AS payloadHash, reason, state, attempt_count AS attemptCount, created_at AS createdAt
         FROM sync_outbox WHERE sync_device_id = (SELECT id FROM sync_devices WHERE device_id = ?)
         ORDER BY created_at ASC`,
      )
      .all(deviceId) as readonly Row[];
  }

  private buildChanges(
    scope: SyncScope,
    context: SessionContext,
    maxChanges: number,
    cursor: SyncCursor | undefined,
  ): SyncPage {
    const limit = Math.min(maxChanges, MAX_CHANGES);
    const queryLimit = Math.min(limit + 1, MAX_CHANGES + 1);
    if (scope === "appointments") {
      const filter = cursorPredicate(
        "appointments.updated_at",
        "appointments.id",
        cursor,
      );
      const rows = this.database.raw
        .prepare(
          `SELECT appointments.id, patients.patient_id AS patientId, appointments.department_id AS departmentId,
                  appointments.doctor_id AS doctorId, appointments.scheduled_start AS scheduledStart,
                  appointments.scheduled_end AS scheduledEnd, appointments.status, appointments.visit_type AS visitType,
                  appointments.is_walk_in AS isWalkIn, appointments.updated_at AS updatedAt, appointments.version
           FROM appointments INNER JOIN patients ON patients.id = appointments.patient_id
           WHERE patients.status = 'active'${filter.sql}
           ORDER BY appointments.updated_at ASC, appointments.id ASC LIMIT ?`,
        )
        .all(...filter.params, queryLimit) as Row[];
      const page = pageRows(rows, limit, scope, cursor);
      return {
        ...page,
        fullSyncRequired: false,
        changes: page.rows.map((row) =>
          this.change(
            "Appointment",
            String(row.id),
            Number(row.version),
            String(row.updatedAt),
            {
              appointmentId: row.id,
              patientId: row.patientId,
              departmentId: row.departmentId,
              doctorId: row.doctorId,
              scheduledStart: row.scheduledStart,
              scheduledEnd: row.scheduledEnd,
              status: row.status,
              visitType: row.visitType,
              isWalkIn: Boolean(row.isWalkIn),
            },
          ),
        ),
      };
    }
    if (scope === "patient-summary") {
      const filter = cursorPredicate("updated_at", "id", cursor);
      const rows = this.database.raw
        .prepare(
          `SELECT id, patient_id AS patientId, name_en AS nameEn, name_ar AS nameAr, dob, sex, phone,
                  status, updated_at AS updatedAt, version FROM patients
           WHERE status = 'active'${filter.sql}
           ORDER BY updated_at ASC, id ASC LIMIT ?`,
        )
        .all(...filter.params, queryLimit) as Row[];
      const page = pageRows(rows, limit, scope, cursor);
      return {
        ...page,
        fullSyncRequired: false,
        changes: page.rows.map((row) =>
          this.change(
            "Patient",
            String(row.id),
            Number(row.version),
            String(row.updatedAt),
            {
              patientId: row.patientId,
              nameEn: row.nameEn,
              ...(context.role === "admin" || context.role === "doctor"
                ? { nameAr: row.nameAr, dob: row.dob, sex: row.sex }
                : {}),
              phone: row.phone,
              status: row.status,
            },
          ),
        ),
      };
    }
    if (scope === "encounter-summary" || scope === "clinical-notes") {
      if (
        scope === "clinical-notes" &&
        context.role !== "admin" &&
        context.role !== "doctor"
      ) {
        throw new Error(
          "ELITE_SYNC_SCOPE_DENIED: clinical note scope requires a clinician role",
        );
      }
      const filter = cursorPredicate(
        "encounters.updated_at",
        "encounters.id",
        cursor,
      );
      const rows = this.database.raw
        .prepare(
          `SELECT encounters.id, patients.patient_id AS patientId, encounters.appointment_id AS appointmentId,
                  encounters.author_user_id AS authorUserId, encounters.encounter_at AS encounterAt,
                  encounters.status, encounters.signed_at AS signedAt, encounters.signed_by_user_id AS signedByUserId,
                  encounters.updated_at AS updatedAt, encounters.version, encounters.subjective, encounters.objective,
                  encounters.assessment, encounters.plan, encounters.follow_up AS followUp
           FROM encounters INNER JOIN patients ON patients.id = encounters.patient_id
           WHERE patients.status = 'active'${filter.sql}
           ORDER BY encounters.updated_at ASC, encounters.id ASC LIMIT ?`,
        )
        .all(...filter.params, queryLimit) as Row[];
      const page = pageRows(rows, limit, scope, cursor);
      return {
        ...page,
        fullSyncRequired: false,
        changes: page.rows.map((row) =>
          this.change(
            "Encounter",
            String(row.id),
            Number(row.version),
            String(row.updatedAt),
            {
              encounterId: row.id,
              patientId: row.patientId,
              appointmentId: row.appointmentId,
              authorUserId: row.authorUserId,
              encounterAt: row.encounterAt,
              status: row.status,
              signedAt: row.signedAt,
              signedByUserId: row.signedByUserId,
              ...(scope === "clinical-notes"
                ? {
                    subjective: row.subjective,
                    objective: row.objective,
                    assessment: row.assessment,
                    plan: row.plan,
                    followUp: row.followUp,
                  }
                : {}),
            },
          ),
        ),
      };
    }
    if (scope === "doctor-summary") {
      if (!context.capabilities.includes("doctor.profile.read")) {
        throw new Error(
          "ELITE_SYNC_SCOPE_DENIED: doctor profile summary requires doctor-profile-read capability",
        );
      }
      const filter = cursorPredicate(
        "COALESCE(dp.updated_at, u.updated_at)",
        "u.id",
        cursor,
      );
      const rows = this.database.raw
        .prepare(
          `SELECT u.id, u.display_name_en AS displayNameEn, u.display_name_ar AS displayNameAr,
                  u.is_clinical_approver AS isClinicalApprover,
                  u.updated_at AS userUpdatedAt, dp.professional_registration_number AS professionalRegistrationNumber,
                  dp.license_expiry AS licenseExpiry, dp.license_verification_status AS licenseVerificationStatus,
                  dp.specialty_ids_json AS specialtyIdsJson, dp.department_ids_json AS departmentIdsJson,
                  dp.qualifications, dp.biography, dp.languages_json AS languagesJson,
                  dp.phone, dp.email, dp.clinic_room AS clinicRoom,
                  dp.consultation_fee_egp AS consultationFeeEgp,
                  COALESCE(dp.updated_at, u.updated_at) AS updatedAt,
                  COALESCE(dp.version, 1) AS version,
                  COALESCE((SELECT COUNT(*) FROM doctor_documents d
                    WHERE d.doctor_id = u.id AND d.status = 'active'), 0) AS documentCount
           FROM users u LEFT JOIN doctor_profiles dp ON dp.doctor_id = u.id
           WHERE u.role = 'doctor' AND u.is_active = 1${filter.sql}
           ORDER BY updatedAt ASC, u.id ASC LIMIT ?`,
        )
        .all(...filter.params, queryLimit) as Row[];
      const page = pageRows(rows, limit, scope, cursor);
      return {
        ...page,
        fullSyncRequired: false,
        changes: page.rows.map((row) =>
          this.change(
            "DoctorProfile",
            String(row.id),
            Number(row.version),
            String(row.updatedAt),
            {
              doctorId: row.id,
              displayNameEn: row.displayNameEn,
              ...(row.displayNameAr
                ? { displayNameAr: row.displayNameAr }
                : {}),
              ...(row.professionalRegistrationNumber
                ? {
                    professionalRegistrationNumber:
                      row.professionalRegistrationNumber,
                  }
                : {}),
              ...(row.licenseExpiry
                ? { licenseExpiry: row.licenseExpiry }
                : {}),
              licenseVerificationStatus:
                row.licenseVerificationStatus ?? "unverified",
              specialtyIds: jsonStringArray(row.specialtyIdsJson),
              departmentIds: jsonStringArray(row.departmentIdsJson),
              ...(row.qualifications
                ? { qualifications: row.qualifications }
                : {}),
              ...(row.biography ? { biography: row.biography } : {}),
              languages: jsonStringArray(row.languagesJson),
              ...(row.phone ? { phone: row.phone } : {}),
              ...(row.email ? { email: row.email } : {}),
              ...(row.clinicRoom ? { clinicRoom: row.clinicRoom } : {}),
              ...(row.consultationFeeEgp != null
                ? { consultationFeeEgp: Number(row.consultationFeeEgp) }
                : {}),
              isClinicalApprover: Boolean(row.isClinicalApprover),
              isActive: true,
              updatedAt: row.updatedAt,
              documentCount: Number(row.documentCount),
            },
          ),
        ),
      };
    }
    if (scope === "billing-summary") {
      if (!context.capabilities.includes("billing.read")) {
        throw new Error(
          "ELITE_SYNC_SCOPE_DENIED: billing summary requires billing-read capability",
        );
      }
      const filter = cursorPredicate("i.updated_at", "i.id", cursor);
      const rows = this.database.raw
        .prepare(
          `SELECT i.id, i.invoice_number AS invoiceNumber, patients.patient_id AS patientId,
                  i.currency, i.status, i.subtotal_egp AS subtotalEgp,
                  i.discount_egp AS discountEgp, i.total_egp AS totalEgp,
                  i.created_at AS createdAt, i.updated_at AS updatedAt, i.version,
                  MAX(0, COALESCE((SELECT SUM(amount_egp) FROM billing_payments
                    WHERE invoice_id = i.id AND status IN ('posted', 'refunded')), 0)
                    - COALESCE((SELECT SUM(r.amount_egp) FROM billing_refunds r
                      JOIN billing_payments p ON p.id = r.payment_id
                      WHERE p.invoice_id = i.id AND r.status = 'posted'), 0)) AS paidEgp
           FROM billing_invoices i
           INNER JOIN patients ON patients.id = i.patient_id
           WHERE patients.status = 'active'${filter.sql}
           ORDER BY i.updated_at ASC, i.id ASC LIMIT ?`,
        )
        .all(...filter.params, queryLimit) as Row[];
      const page = pageRows(rows, limit, scope, cursor);
      return {
        ...page,
        fullSyncRequired: false,
        changes: page.rows.map((row) => {
          const paidEgp = Number(row.paidEgp);
          const totalEgp = Number(row.totalEgp);
          return this.change(
            "BillingInvoice",
            String(row.id),
            Number(row.version),
            String(row.updatedAt),
            {
              invoiceNumber: row.invoiceNumber,
              patientId: row.patientId,
              currency: row.currency,
              status: row.status,
              subtotalEgp: Number(row.subtotalEgp),
              discountEgp: Number(row.discountEgp),
              totalEgp,
              paidEgp,
              balanceEgp: Math.max(0, totalEgp - paidEgp),
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            },
          );
        }),
      };
    }
    if (scope === "export-governance") {
      const filter = cursorPredicate("status_changed_at", "package_id", cursor);
      const rows = this.database.raw
        .prepare(
          `SELECT package_id AS id, package_id AS packageId, status, status_changed_at AS updatedAt,
                  status_changed_at AS statusChangedAt, package_hash AS packageHash, manifest_hash AS manifestHash
           FROM export_packages
           WHERE 1 = 1${filter.sql}
           ORDER BY status_changed_at ASC, package_id ASC LIMIT ?`,
        )
        .all(...filter.params, queryLimit) as Row[];
      const page = pageRows(rows, limit, scope, cursor);
      return {
        ...page,
        fullSyncRequired: false,
        changes: page.rows.map((row) =>
          this.change(
            "ExportPackage",
            String(row.packageId),
            1,
            String(row.statusChangedAt),
            {
              packageId: row.packageId,
              status: row.status,
              statusChangedAt: row.statusChangedAt,
              packageHash: row.packageHash,
              manifestHash: row.manifestHash,
            },
          ),
        ),
      };
    }
    throw new Error("ELITE_SYNC_SCOPE_UNSUPPORTED: scope is not implemented");
  }

  private change(
    resourceType:
      | "Appointment"
      | "Patient"
      | "Encounter"
      | "ExportPackage"
      | "BillingInvoice"
      | "DoctorProfile",
    resourceId: string,
    version: number,
    updatedAt: string,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      resourceType,
      resourceId,
      version,
      updatedAt,
      operation: "upsert" as const,
      payload,
      payloadHash: payloadHash(payload),
    };
  }

  private signResponse<T extends Record<string, unknown>>(
    body: T,
  ): T & {
    signatureAlgorithm: "ed25519";
    signatureBase64: string;
    signerKeyId: string;
    signerKeyVersion: number;
  } {
    const signature = this.signaturePort.sign(
      Buffer.from(
        stableJson({
          ...body,
          signatureAlgorithm: undefined,
          signatureBase64: undefined,
          signerKeyId: undefined,
          signerKeyVersion: undefined,
        }),
        "utf8",
      ),
    );
    if (!signature.keyId || !signature.keyVersion) {
      throw new Error(
        "ELITE_SYNC_SIGNER_METADATA_REQUIRED: response signer metadata is unavailable",
      );
    }
    return {
      ...body,
      signatureAlgorithm: "ed25519",
      signatureBase64: signature.signature.toString("base64"),
      signerKeyId: signature.keyId,
      signerKeyVersion: signature.keyVersion,
    };
  }

  private currentServerSequence(): number {
    const rows = this.database.raw
      .prepare(
        `SELECT 'appointments' AS resource, COUNT(*) AS count, COALESCE(MAX(updated_at), '') AS latest, COALESCE(MAX(version), 0) AS maxVersion FROM appointments
         UNION ALL SELECT 'patients', COUNT(*), COALESCE(MAX(updated_at), ''), COALESCE(MAX(version), 0) FROM patients
         UNION ALL SELECT 'encounters', COUNT(*), COALESCE(MAX(updated_at), ''), COALESCE(MAX(version), 0) FROM encounters`,
      )
      .all() as Array<{
      resource: string;
      count: number;
      latest: string;
      maxVersion: number;
    }>;
    const fingerprint = sha256(stableJson(rows));
    return Math.max(1, Number.parseInt(fingerprint.slice(0, 12), 16));
  }

  private touchDevice(deviceId: string, timestamp: string): void {
    this.database.raw
      .prepare(
        "UPDATE sync_devices SET last_seen_at = ?, last_sync_at = ?, updated_at = ? WHERE device_id = ?",
      )
      .run(timestamp, timestamp, timestamp, deviceId);
    this.database.raw
      .prepare(
        "UPDATE devices SET last_seen_at = ?, last_sync_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(timestamp, timestamp, timestamp, deviceId);
  }

  private assertRequestIdentity(
    context: SessionContext,
    deviceId: string,
    userId: string,
  ): void {
    if (context.deviceId !== deviceId || context.userId !== userId) {
      throw new Error(
        "ELITE_SYNC_IDENTITY_MISMATCH: session identity does not match synchronization request",
      );
    }
  }

  private writeAudit(
    context: SessionContext,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): void {
    this.database.raw
      .prepare(
        `INSERT INTO audit_events
         (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?)`,
      )
      .run(
        newOpaqueId("audit"),
        context.userId,
        context.deviceId,
        action,
        entityType,
        entityId,
        JSON.stringify(metadata),
        this.clock(),
      );
  }

  private writeSyncAudit(
    context: SessionContext,
    deviceId: string,
    syncSessionId: string | null,
    scope: SyncScope | null,
    result: "success" | "partial" | "rejected" | "conflict" | "error",
    changeCount: number,
    conflictCount: number,
    redactionCount: number,
    reasonCode: string,
  ): void {
    const auditEventId = newOpaqueId("audit");
    const timestamp = this.clock();
    const syncAuditId = newOpaqueId("sync-audit");
    this.database.raw
      .prepare(
        `INSERT INTO audit_events
         (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at)
         VALUES (?, ?, ?, 'sync.request', 'sync-device', ?, ?, ?, ?)`,
      )
      .run(
        auditEventId,
        context.userId,
        deviceId,
        deviceId,
        result === "success" ? "success" : "failure",
        JSON.stringify({
          syncSessionId,
          scope,
          changeCount,
          conflictCount,
          redactionCount,
          reasonCode,
        }),
        timestamp,
      );
    this.database.raw
      .prepare(
        `INSERT INTO sync_audit_events
         (id, sync_device_id, sync_session_id, user_id, scope, result, change_count, conflict_count, redaction_count, reason_code, occurred_at, audit_event_id)
         VALUES (?, (SELECT id FROM sync_devices WHERE device_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        syncAuditId,
        deviceId,
        syncSessionId,
        context.userId,
        scope ?? "appointments",
        result,
        changeCount,
        conflictCount,
        redactionCount,
        reasonCode,
        timestamp,
        auditEventId,
      );
  }
}
