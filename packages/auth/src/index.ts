import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  capabilitySchema,
  roleCapabilities,
  userRoleSchema,
  type Capability,
  type UserRole,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-zA-Z0-9._-]+$/);
const passwordSchema = z.string().min(12).max(256);

export const bootstrapInputSchema = z.object({
  admins: z
    .array(
      z.object({
        username: usernameSchema,
        password: passwordSchema,
        displayNameEn: z.string().trim().min(1).max(160),
        displayNameAr: z.string().trim().max(160).optional(),
      }),
    )
    .length(2),
  hubDevice: z.object({
    friendlyName: z.string().trim().min(1).max(120),
    appVersion: z.string().trim().min(1).max(64),
  }),
});
export type BootstrapInput = z.infer<typeof bootstrapInputSchema>;

export const loginInputSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  deviceId: z.string().trim().min(8).max(128),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const enrollmentInputSchema = z.object({
  friendlyName: z.string().trim().min(1).max(120),
  platform: z.enum(["windows", "android"]),
  appVersion: z.string().trim().min(1).max(64),
  apiLevel: z.number().int().nonnegative().optional(),
  securityPatchLevel: z.string().trim().max(32).optional(),
});
export type EnrollmentInput = z.infer<typeof enrollmentInputSchema>;

export interface SessionContext {
  sessionId: string;
  token: string;
  userId: string;
  username: string;
  role: UserRole;
  deviceId: string;
  capabilities: readonly Capability[];
  expiresAt: string;
}

export interface BootstrapResult {
  adminUserIds: readonly string[];
  hubDeviceId: string;
}

export interface DeviceEnrollment {
  requestId: string;
  deviceId: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
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

export interface BootstrapStatus {
  configured: boolean;
  bootstrapRequired: boolean;
  hubDeviceId?: string;
}

export interface SessionSummary {
  sessionId: string;
  userId: string;
  username: string;
  role: UserRole;
  deviceId: string;
  capabilities: readonly Capability[];
  expiresAt: string;
}

function now(): string {
  return new Date().toISOString();
}

function later(milliseconds: number): string {
  return new Date(Date.now() + milliseconds).toISOString();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function parseCapabilities(value: string): readonly Capability[] {
  const parsed = z.array(capabilitySchema).safeParse(JSON.parse(value));
  if (!parsed.success) {
    throw new Error(
      "ELITE_AUTH_CORRUPT_CAPABILITIES: stored capability data is invalid",
    );
  }
  return parsed.data;
}

function defaultCapabilities(role: UserRole): readonly Capability[] {
  return roleCapabilities[role];
}

function requireAdminContext(context: SessionContext): void {
  if (context.role !== "admin") {
    throw new Error(
      "ELITE_AUTH_ADMIN_REQUIRED: administrator privileges are required",
    );
  }
}

export function hasCapability(
  context: SessionContext,
  capability: Capability,
): boolean {
  return context.capabilities.includes(capability);
}

export function requireCapability(
  context: SessionContext,
  capability: Capability,
): void {
  if (!hasCapability(context, capability)) {
    throw new Error(`ELITE_AUTH_CAPABILITY_REQUIRED: ${capability}`);
  }
}

function writeAudit(
  database: EliteDatabase,
  input: {
    actorUserId?: string;
    deviceId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    result: "success" | "failure" | "denied";
    metadata?: Record<string, unknown>;
  },
): void {
  database.raw
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      nanoid(18),
      input.actorUserId ?? null,
      input.deviceId ?? null,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.result,
      JSON.stringify(input.metadata ?? {}),
      now(),
    );
}

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

function assertNotLocked(lockedUntil: string | null): void {
  if (lockedUntil && Date.parse(lockedUntil) > Date.now()) {
    throw new Error(
      "ELITE_AUTH_ACCOUNT_LOCKED: account temporarily locked after failed attempts",
    );
  }
}

export class AuthService {
  public constructor(private readonly database: EliteDatabase) {}

  public bootstrapStatus(): BootstrapStatus {
    const countRow = this.database.raw
      .prepare("SELECT COUNT(*) AS count FROM users")
      .get() as { count: number };
    const hub = this.database.raw
      .prepare(
        "SELECT id FROM devices WHERE platform = 'windows' AND status = 'active' ORDER BY created_at LIMIT 1",
      )
      .get() as { id: string } | undefined;
    const configured = Number(countRow.count) > 0;
    const status = {
      configured,
      bootstrapRequired: !configured,
    };
    return hub?.id ? { ...status, hubDeviceId: hub.id } : status;
  }

  public sessionSummary(token: string): SessionSummary {
    const session = this.getSession(token);
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      username: session.username,
      role: session.role,
      deviceId: session.deviceId,
      capabilities: session.capabilities,
      expiresAt: session.expiresAt,
    };
  }

  public async bootstrapInitialAdmins(
    input: BootstrapInput,
  ): Promise<BootstrapResult> {
    const parsed = bootstrapInputSchema.parse(input);
    const countRow = this.database.raw
      .prepare("SELECT COUNT(*) AS count FROM users")
      .get() as { count: number };
    if (Number(countRow.count) !== 0) {
      throw new Error(
        "ELITE_AUTH_BOOTSTRAP_CLOSED: initial Admin bootstrap is already complete",
      );
    }

    const usernames = new Set(
      parsed.admins.map((admin) => admin.username.toLowerCase()),
    );
    if (usernames.size !== parsed.admins.length) {
      throw new Error(
        "ELITE_AUTH_DUPLICATE_USERNAME: the two Admin usernames must be different",
      );
    }

    const hashes = await Promise.all(
      parsed.admins.map((admin) => hashPassword(admin.password)),
    );
    const userIds = parsed.admins.map(() => nanoid(18));
    const hubDeviceId = nanoid(18);
    const timestamp = now();

    const transaction = this.database.raw.transaction(() => {
      for (const [index, admin] of parsed.admins.entries()) {
        const userId = userIds[index]!;
        const capabilities = defaultCapabilities("admin");
        this.database.raw
          .prepare(
            `INSERT INTO users
              (id, username, display_name_en, display_name_ar, role, capabilities_json, is_clinical_approver, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'admin', ?, 0, 1, ?, ?)`,
          )
          .run(
            userId,
            admin.username,
            admin.displayNameEn,
            admin.displayNameAr ?? null,
            JSON.stringify(capabilities),
            timestamp,
            timestamp,
          );
        this.database.raw
          .prepare(
            `INSERT INTO auth_credentials
              (user_id, password_hash, password_algorithm, failed_attempts, locked_until, password_changed_at, created_at, updated_at)
             VALUES (?, ?, 'argon2id', 0, NULL, ?, ?, ?)`,
          )
          .run(userId, hashes[index], timestamp, timestamp, timestamp);
      }

      this.database.raw
        .prepare(
          `INSERT INTO devices
            (id, friendly_name, platform, app_version, owner_user_id, status, approved_by_user_id, approved_at, created_at, updated_at)
           VALUES (?, ?, 'windows', ?, ?, 'active', ?, ?, ?, ?)`,
        )
        .run(
          hubDeviceId,
          parsed.hubDevice.friendlyName,
          parsed.hubDevice.appVersion,
          userIds[0],
          userIds[0],
          timestamp,
          timestamp,
          timestamp,
        );

      writeAudit(this.database, {
        actorUserId: userIds[0]!,
        deviceId: hubDeviceId,
        action: "auth.bootstrap.initial-admins",
        result: "success",
        metadata: { adminCount: 2 },
      });
    });
    transaction();

    return { adminUserIds: userIds, hubDeviceId };
  }

  public async login(input: LoginInput): Promise<SessionContext> {
    const parsed = loginInputSchema.parse(input);
    const user = this.database.raw
      .prepare(
        `SELECT u.id, u.username, u.role, u.capabilities_json, u.is_active,
                c.password_hash, c.failed_attempts, c.locked_until
         FROM users u
         JOIN auth_credentials c ON c.user_id = u.id
         WHERE lower(u.username) = lower(?)`,
      )
      .get(parsed.username) as
      | {
          id: string;
          username: string;
          role: UserRole;
          capabilities_json: string;
          is_active: number;
          password_hash: string;
          failed_attempts: number;
          locked_until: string | null;
        }
      | undefined;

    if (!user || user.is_active !== 1) {
      throw new Error(
        "ELITE_AUTH_INVALID_CREDENTIALS: username or password is invalid",
      );
    }

    assertNotLocked(user.locked_until);

    const device = this.database.raw
      .prepare("SELECT id, status FROM devices WHERE id = ?")
      .get(parsed.deviceId) as { id: string; status: string } | undefined;
    if (!device || device.status !== "active") {
      writeAudit(this.database, {
        actorUserId: user.id,
        deviceId: parsed.deviceId,
        action: "auth.login",
        result: "denied",
        metadata: { reason: "device-not-active" },
      });
      throw new Error(
        "ELITE_AUTH_DEVICE_NOT_APPROVED: this device is not approved",
      );
    }

    const valid = await argon2.verify(user.password_hash, parsed.password);
    if (!valid) {
      const nextAttempts = user.failed_attempts + 1;
      const lockedUntil =
        nextAttempts >= LOCKOUT_THRESHOLD ? later(LOCKOUT_DURATION_MS) : null;
      this.database.raw
        .prepare(
          "UPDATE auth_credentials SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE user_id = ?",
        )
        .run(nextAttempts, lockedUntil, now(), user.id);
      writeAudit(this.database, {
        actorUserId: user.id,
        deviceId: parsed.deviceId,
        action: "auth.login",
        result: "failure",
        metadata: { failedAttempts: nextAttempts },
      });
      throw new Error(
        "ELITE_AUTH_INVALID_CREDENTIALS: username or password is invalid",
      );
    }

    const sessionId = nanoid(18);
    const token = randomBytes(32).toString("base64url");
    const timestamp = now();
    const expiresAt = later(SESSION_TTL_MS);
    this.database.raw
      .prepare(
        "UPDATE auth_credentials SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE user_id = ?",
      )
      .run(timestamp, user.id);
    this.database.raw
      .prepare(
        `INSERT INTO sessions
          (id, user_id, device_id, token_hash, created_at, expires_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sessionId,
        user.id,
        parsed.deviceId,
        hashToken(token),
        timestamp,
        expiresAt,
        timestamp,
      );
    writeAudit(this.database, {
      actorUserId: user.id,
      deviceId: parsed.deviceId,
      action: "auth.login",
      result: "success",
    });

    return {
      sessionId,
      token,
      userId: user.id,
      username: user.username,
      role: user.role,
      deviceId: parsed.deviceId,
      capabilities: parseCapabilities(user.capabilities_json),
      expiresAt,
    };
  }

  public getSession(token: string): SessionContext {
    const tokenHash = hashToken(token);
    const row = this.database.raw
      .prepare(
        `SELECT s.id AS session_id, s.user_id, s.device_id, s.expires_at,
                u.username, u.role, u.capabilities_json, u.is_active, d.status AS device_status
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         JOIN devices d ON d.id = s.device_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL`,
      )
      .get(tokenHash) as
      | {
          session_id: string;
          user_id: string;
          device_id: string;
          expires_at: string;
          username: string;
          role: UserRole;
          capabilities_json: string;
          is_active: number;
          device_status: string;
        }
      | undefined;

    if (!row || row.is_active !== 1 || row.device_status !== "active") {
      throw new Error(
        "ELITE_AUTH_SESSION_INVALID: session is invalid or revoked",
      );
    }
    if (Date.parse(row.expires_at) <= Date.now()) {
      throw new Error("ELITE_AUTH_SESSION_EXPIRED: session has expired");
    }

    this.database.raw
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
      .run(now(), row.session_id);
    return {
      sessionId: row.session_id,
      token,
      userId: row.user_id,
      username: row.username,
      role: row.role,
      deviceId: row.device_id,
      capabilities: parseCapabilities(row.capabilities_json),
      expiresAt: row.expires_at,
    };
  }

  public logout(token: string): void {
    const tokenHash = hashToken(token);
    this.database.raw
      .prepare(
        "UPDATE sessions SET revoked_at = ?, revoked_reason = 'logout' WHERE token_hash = ? AND revoked_at IS NULL",
      )
      .run(now(), tokenHash);
  }

  public requestDeviceEnrollment(
    context: SessionContext,
    input: EnrollmentInput,
  ): DeviceEnrollment {
    requireCapability(context, "device.manage");
    const parsed = enrollmentInputSchema.parse(input);
    const deviceId = nanoid(18);
    const requestId = nanoid(18);
    const timestamp = now();
    const transaction = this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          `INSERT INTO devices
            (id, friendly_name, platform, app_version, api_level, security_patch_level, owner_user_id, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .run(
          deviceId,
          parsed.friendlyName,
          parsed.platform,
          parsed.appVersion,
          parsed.apiLevel ?? null,
          parsed.securityPatchLevel ?? null,
          context.userId,
          timestamp,
          timestamp,
        );
      this.database.raw
        .prepare(
          `INSERT INTO device_enrollment_requests
            (id, device_id, requested_by_user_id, requested_at, status)
           VALUES (?, ?, ?, ?, 'pending')`,
        )
        .run(requestId, deviceId, context.userId, timestamp);
      writeAudit(this.database, {
        actorUserId: context.userId,
        deviceId: context.deviceId,
        action: "device.enrollment.request",
        entityType: "device",
        entityId: deviceId,
        result: "success",
        metadata: { requestId, platform: parsed.platform },
      });
    });
    transaction();
    return { requestId, deviceId, status: "pending" };
  }

  public listDevices(context: SessionContext): readonly DeviceSummary[] {
    requireAdminContext(context);
    requireCapability(context, "device.manage");
    const rows = this.database.raw
      .prepare(
        `SELECT id, friendly_name, platform, app_version, api_level, security_patch_level,
                owner_user_id, status, last_seen_at, last_sync_at, created_at
         FROM devices ORDER BY created_at DESC`,
      )
      .all() as Array<{
      id: string;
      friendly_name: string;
      platform: "windows" | "android";
      app_version: string;
      api_level: number | null;
      security_patch_level: string | null;
      owner_user_id: string;
      status: DeviceSummary["status"];
      last_seen_at: string | null;
      last_sync_at: string | null;
      created_at: string;
    }>;
    return rows.map((row) => {
      const summary: DeviceSummary = {
        id: row.id,
        friendlyName: row.friendly_name,
        platform: row.platform,
        appVersion: row.app_version,
        ownerUserId: row.owner_user_id,
        status: row.status,
        createdAt: row.created_at,
      };
      if (row.api_level !== null) summary.apiLevel = row.api_level;
      if (row.security_patch_level !== null)
        summary.securityPatchLevel = row.security_patch_level;
      if (row.last_seen_at !== null) summary.lastSeenAt = row.last_seen_at;
      if (row.last_sync_at !== null) summary.lastSyncAt = row.last_sync_at;
      return summary;
    });
  }

  public listEnrollmentRequests(
    context: SessionContext,
  ): readonly EnrollmentRequestSummary[] {
    requireAdminContext(context);
    requireCapability(context, "device.manage");
    const rows = this.database.raw
      .prepare(
        `SELECT r.id AS request_id, r.requested_by_user_id, r.requested_at, r.status,
                r.reviewed_by_user_id, r.reviewed_at, r.rejection_reason,
                d.id, d.friendly_name, d.platform, d.app_version, d.api_level,
                d.security_patch_level, d.owner_user_id, d.status AS device_status,
                d.last_seen_at, d.last_sync_at, d.created_at
         FROM device_enrollment_requests r
         JOIN devices d ON d.id = r.device_id
         ORDER BY r.requested_at DESC`,
      )
      .all() as Array<{
      request_id: string;
      requested_by_user_id: string;
      requested_at: string;
      status: EnrollmentRequestSummary["status"];
      reviewed_by_user_id: string | null;
      reviewed_at: string | null;
      rejection_reason: string | null;
      id: string;
      friendly_name: string;
      platform: "windows" | "android";
      app_version: string;
      api_level: number | null;
      security_patch_level: string | null;
      owner_user_id: string;
      device_status: DeviceSummary["status"];
      last_seen_at: string | null;
      last_sync_at: string | null;
      created_at: string;
    }>;
    return rows.map((row) => {
      const device: DeviceSummary = {
        id: row.id,
        friendlyName: row.friendly_name,
        platform: row.platform,
        appVersion: row.app_version,
        ownerUserId: row.owner_user_id,
        status: row.device_status,
        createdAt: row.created_at,
      };
      if (row.api_level !== null) device.apiLevel = row.api_level;
      if (row.security_patch_level !== null)
        device.securityPatchLevel = row.security_patch_level;
      if (row.last_seen_at !== null) device.lastSeenAt = row.last_seen_at;
      if (row.last_sync_at !== null) device.lastSyncAt = row.last_sync_at;
      const summary: EnrollmentRequestSummary = {
        requestId: row.request_id,
        device,
        requestedByUserId: row.requested_by_user_id,
        requestedAt: row.requested_at,
        status: row.status,
      };
      if (row.reviewed_by_user_id !== null)
        summary.reviewedByUserId = row.reviewed_by_user_id;
      if (row.reviewed_at !== null) summary.reviewedAt = row.reviewed_at;
      if (row.rejection_reason !== null)
        summary.rejectionReason = row.rejection_reason;
      return summary;
    });
  }

  public approveDevice(context: SessionContext, requestId: string): void {
    requireAdminContext(context);
    requireCapability(context, "device.manage");
    const timestamp = now();
    const transaction = this.database.raw.transaction(() => {
      const request = this.database.raw
        .prepare(
          "SELECT id, device_id, status FROM device_enrollment_requests WHERE id = ?",
        )
        .get(requestId) as
        { id: string; device_id: string; status: string } | undefined;
      if (!request || request.status !== "pending") {
        throw new Error(
          "ELITE_DEVICE_ENROLLMENT_NOT_PENDING: enrollment request is not pending",
        );
      }
      this.database.raw
        .prepare(
          `UPDATE devices
           SET status = 'active', approved_by_user_id = ?, approved_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(context.userId, timestamp, timestamp, request.device_id);
      this.database.raw
        .prepare(
          `UPDATE device_enrollment_requests
           SET status = 'approved', reviewed_by_user_id = ?, reviewed_at = ?
           WHERE id = ?`,
        )
        .run(context.userId, timestamp, requestId);
      writeAudit(this.database, {
        actorUserId: context.userId,
        deviceId: context.deviceId,
        action: "device.enrollment.approve",
        entityType: "device",
        entityId: request.device_id,
        result: "success",
        metadata: { requestId },
      });
    });
    transaction();
  }

  public rejectDevice(
    context: SessionContext,
    requestId: string,
    reason: string,
  ): void {
    requireAdminContext(context);
    requireCapability(context, "device.manage");
    const cleanedReason = z.string().trim().min(3).max(500).parse(reason);
    const timestamp = now();
    const transaction = this.database.raw.transaction(() => {
      const request = this.database.raw
        .prepare(
          "SELECT id, device_id, status FROM device_enrollment_requests WHERE id = ?",
        )
        .get(requestId) as
        { id: string; device_id: string; status: string } | undefined;
      if (!request || request.status !== "pending") {
        throw new Error(
          "ELITE_DEVICE_ENROLLMENT_NOT_PENDING: enrollment request is not pending",
        );
      }
      this.database.raw
        .prepare(
          "UPDATE devices SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE id = ?",
        )
        .run(timestamp, timestamp, request.device_id);
      this.database.raw
        .prepare(
          `UPDATE device_enrollment_requests
           SET status = 'rejected', reviewed_by_user_id = ?, reviewed_at = ?, rejection_reason = ?
           WHERE id = ?`,
        )
        .run(context.userId, timestamp, cleanedReason, requestId);
      writeAudit(this.database, {
        actorUserId: context.userId,
        deviceId: context.deviceId,
        action: "device.enrollment.reject",
        entityType: "device",
        entityId: request.device_id,
        result: "success",
        metadata: { requestId, reason: cleanedReason },
      });
    });
    transaction();
  }

  public revokeDevice(
    context: SessionContext,
    deviceId: string,
    reason: string,
  ): void {
    requireAdminContext(context);
    requireCapability(context, "device.manage");
    const cleanedReason = z.string().trim().min(3).max(500).parse(reason);
    const timestamp = now();
    const result = this.database.raw
      .prepare(
        `UPDATE devices
         SET status = 'wipe-pending', revoked_at = ?, updated_at = ?
         WHERE id = ? AND status != 'revoked'`,
      )
      .run(timestamp, timestamp, deviceId);
    if (result.changes !== 1) {
      throw new Error(
        "ELITE_DEVICE_NOT_FOUND_OR_ALREADY_REVOKED: device cannot be revoked",
      );
    }
    this.database.raw
      .prepare(
        "UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE device_id = ? AND revoked_at IS NULL",
      )
      .run(timestamp, cleanedReason, deviceId);
    writeAudit(this.database, {
      actorUserId: context.userId,
      deviceId: context.deviceId,
      action: "device.revoke",
      entityType: "device",
      entityId: deviceId,
      result: "success",
      metadata: { reason: cleanedReason, wipe: "best-effort-on-reconnect" },
    });
  }
}

export { PatientIdentityService } from "./patient-service.js";
export type {
  PatientIdentityServiceOptions,
  PatientRelatedPersonLinkSummary,
  PatientSearchFilters,
  RelatedPersonInput,
  RelatedPersonLinkInput,
  RelatedPersonSummary,
} from "./patient-service.js";

export { ClinicalWorkflowService } from "./clinical-service.js";
export { MedicalHistoryService } from "./medical-history-service.js";
export type { MedicalHistoryServiceOptions } from "./medical-history-service.js";
export { EncounterService } from "./encounter-service.js";
export type { EncounterServiceOptions } from "./encounter-service.js";

export {
  PatientExportService,
  exportSigningData,
  hashExportPayload,
  verifyExportPackage,
  type ExportSignaturePort,
} from "./patient-export-service.js";
