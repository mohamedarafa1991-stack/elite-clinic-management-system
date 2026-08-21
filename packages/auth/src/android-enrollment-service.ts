import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import {
  canonicalJson,
  enrollmentAcknowledgmentSchema,
  enrollmentChallengeCreateInputSchema,
  enrollmentChallengeSchema,
  enrollmentDeviceRequestSchema,
  enrollmentResponseSchema,
  enrollmentStateSummarySchema,
  syncScopeSchema,
  type EnrollmentAcknowledgment,
  type EnrollmentChallenge,
  type EnrollmentChallengeCreateInput,
  type EnrollmentDeviceRequest,
  type EnrollmentResponse,
  type EnrollmentStateSummary,
  type SyncScope,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import { requireCapability, type SessionContext } from "./index.js";
import type { ExportSignaturePort } from "./patient-export-service.js";
import {
  canonicalDescriptorHash,
  signingDescriptorHash,
  verifyEnrollmentAcknowledgment,
  verifyEnrollmentDeviceRequest,
} from "./session-protocol.js";

const DEFAULT_OFFLINE_ACCESS_DAYS = 30;
const ENROLLMENT_RESPONSE_VALIDITY_MS = 5 * 60 * 1000;

type Row = Record<string, unknown>;

function now(): string {
  return new Date().toISOString();
}

function opaqueId(prefix: string): string {
  return `${prefix}-${nanoid(18)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function addMilliseconds(iso: string, milliseconds: number): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) {
    throw new Error(
      "ELITE_ENROLLMENT_CLOCK_INVALID: clock returned invalid time",
    );
  }
  return new Date(time + milliseconds).toISOString();
}

function parseScopes(value: string): SyncScope[] {
  const parsed = syncScopeSchema.array().max(7).safeParse(JSON.parse(value));
  if (!parsed.success) {
    throw new Error(
      "ELITE_ENROLLMENT_POLICY_INVALID: stored scopes are invalid",
    );
  }
  return parsed.data;
}

function stringValue(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`ELITE_ENROLLMENT_ROW_INVALID: ${key} is invalid`);
  }
  return value;
}

function optionalString(row: Row, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" ? value : undefined;
}

function numberValue(row: Row, key: string): number {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`ELITE_ENROLLMENT_ROW_INVALID: ${key} is invalid`);
  }
  return value;
}

export class AndroidEnrollmentService {
  public constructor(
    private readonly database: EliteDatabase,
    private readonly signaturePort: ExportSignaturePort,
    private readonly clock: () => string = now,
  ) {}

  public createChallenge(
    context: SessionContext,
    input: EnrollmentChallengeCreateInput,
  ): EnrollmentChallenge {
    this.requireAdmin(context);
    const parsed = enrollmentChallengeCreateInputSchema.parse(input);
    const issuedAt = this.clock();
    const expiresAt = addMilliseconds(issuedAt, parsed.validitySeconds * 1000);
    const challengeId = opaqueId("enrollment-challenge");
    const responseNonce = randomBytes(16).toString("hex");
    const descriptorWithoutHash = {
      protocolVersion: 1 as const,
      messageType: "enrollment-challenge" as const,
      challengeId,
      organizationId: parsed.organizationId,
      intendedUserId: parsed.intendedUserId,
      intendedRole: parsed.intendedRole,
      requestedPolicyVersion: parsed.requestedPolicyVersion,
      requestedScopes: parsed.requestedScopes,
      issuedAt,
      expiresAt,
      responseNonce,
    };
    const body = {
      ...descriptorWithoutHash,
      responseHash: canonicalDescriptorHash(descriptorWithoutHash),
    };
    const challenge = this.signChallenge(body);
    const timestamp = this.clock();
    const descriptorJson = canonicalJson(challenge);

    const transaction = this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          `INSERT INTO android_enrollment_challenges
           (id, organization_id, intended_user_id, intended_role, requested_policy_version,
            requested_scopes_json, response_nonce, issued_at, expires_at, status, response_hash,
            signer_key_id, signer_key_version, descriptor_json, created_by_user_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          challenge.challengeId,
          challenge.organizationId,
          challenge.intendedUserId,
          challenge.intendedRole,
          challenge.requestedPolicyVersion,
          JSON.stringify(challenge.requestedScopes),
          challenge.responseNonce,
          challenge.issuedAt,
          challenge.expiresAt,
          challenge.responseHash,
          challenge.signerKeyId,
          challenge.signerKeyVersion,
          descriptorJson,
          context.userId,
          timestamp,
          timestamp,
        );
      this.insertEvent({
        challengeId: challenge.challengeId,
        action: "challenge-created",
        toState: "pending",
        actorUserId: context.userId,
        metadata: { organizationId: challenge.organizationId },
      });
      this.writeAudit(
        context,
        "android.enrollment.challenge.created",
        "challenge",
        challenge.challengeId,
        {
          organizationId: challenge.organizationId,
          intendedUserId: challenge.intendedUserId,
        },
      );
    });
    transaction();
    return challenge;
  }

  public submitDeviceRequest(
    input: EnrollmentDeviceRequest,
  ): EnrollmentStateSummary {
    const parsed = enrollmentDeviceRequestSchema.parse(input);
    const verified = verifyEnrollmentDeviceRequest(parsed);
    const timestamp = this.clock();
    const requestHash = signingDescriptorHash(
      verified as unknown as Record<string, unknown>,
    );
    const descriptorJson = canonicalJson(verified);
    const existing = this.database.raw
      .prepare(
        `SELECT r.*, c.status AS challenge_status, c.intended_user_id, c.intended_role,
                c.requested_policy_version, c.requested_scopes_json
         FROM android_enrollment_requests r
         INNER JOIN android_enrollment_challenges c ON c.id = r.challenge_id
         WHERE r.id = ?`,
      )
      .get(verified.requestId) as Row | undefined;
    if (existing) {
      if (stringValue(existing, "request_hash") !== requestHash) {
        throw new Error(
          "ELITE_ENROLLMENT_REQUEST_REPLAY: request id was reused with different content",
        );
      }
      return this.summaryFromRequest(existing);
    }

    const challenge = this.database.raw
      .prepare("SELECT * FROM android_enrollment_challenges WHERE id = ?")
      .get(verified.challengeId) as Row | undefined;
    if (!challenge) {
      throw new Error(
        "ELITE_ENROLLMENT_CHALLENGE_NOT_FOUND: challenge does not exist",
      );
    }
    if (stringValue(challenge, "status") !== "pending") {
      throw new Error(
        "ELITE_ENROLLMENT_CHALLENGE_NOT_PENDING: challenge is not pending",
      );
    }
    if (
      Date.parse(stringValue(challenge, "expires_at")) <= Date.parse(timestamp)
    ) {
      this.expireChallenge(verified.challengeId, timestamp);
      throw new Error(
        "ELITE_ENROLLMENT_CHALLENGE_EXPIRED: challenge has expired",
      );
    }
    if (stringValue(challenge, "organization_id") !== verified.organizationId) {
      throw new Error(
        "ELITE_ENROLLMENT_REQUEST_BINDING_INVALID: request is not bound to the challenge",
      );
    }

    const transaction = this.database.raw.transaction(() => {
      const device = this.database.raw
        .prepare("SELECT id, status FROM devices WHERE id = ?")
        .get(verified.deviceId) as Row | undefined;
      if (device) {
        throw new Error(
          "ELITE_ENROLLMENT_DEVICE_EXISTS: device identifier is already registered",
        );
      }
      this.database.raw
        .prepare(
          `INSERT INTO devices
           (id, friendly_name, platform, app_version, api_level, owner_user_id, status, created_at, updated_at)
           VALUES (?, ?, 'android', ?, ?, ?, 'pending', ?, ?)`,
        )
        .run(
          verified.deviceId,
          verified.deviceName,
          verified.appVersion,
          verified.apiLevel ?? null,
          stringValue(challenge, "intended_user_id"),
          timestamp,
          timestamp,
        );
      this.database.raw
        .prepare(
          `INSERT INTO android_enrollment_requests
           (id, challenge_id, organization_id, device_id, device_name, app_version, api_level,
            device_public_key_spki_base64, device_public_key_fingerprint, request_nonce, request_hash,
            descriptor_json, status, requested_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        )
        .run(
          verified.requestId,
          verified.challengeId,
          verified.organizationId,
          verified.deviceId,
          verified.deviceName,
          verified.appVersion,
          verified.apiLevel ?? null,
          verified.devicePublicKeySpkiBase64,
          verified.devicePublicKeyFingerprint,
          verified.requestNonce,
          requestHash,
          descriptorJson,
          verified.requestedAt,
          timestamp,
          timestamp,
        );
      this.insertEvent({
        challengeId: verified.challengeId,
        requestId: verified.requestId,
        action: "device-request-received",
        toState: "pending",
        metadata: { deviceId: verified.deviceId },
      });
      this.writeAuditWithoutContext(
        "android.enrollment.request.received",
        "device",
        verified.deviceId,
        { requestId: verified.requestId, challengeId: verified.challengeId },
      );
    });
    transaction();
    return {
      challengeId: verified.challengeId,
      requestId: verified.requestId,
      deviceId: verified.deviceId,
      organizationId: verified.organizationId,
      ownerUserId: stringValue(challenge, "intended_user_id"),
      role: stringValue(
        challenge,
        "intended_role",
      ) as EnrollmentStateSummary["role"],
      deviceName: verified.deviceName,
      state: "pending",
      policyVersion: numberValue(challenge, "requested_policy_version"),
      allowedScopes: parseScopes(
        stringValue(challenge, "requested_scopes_json"),
      ),
    };
  }

  public approveDeviceRequest(
    context: SessionContext,
    requestId: string,
    offlineAccessDays = DEFAULT_OFFLINE_ACCESS_DAYS,
  ): EnrollmentResponse {
    this.requireAdmin(context);
    if (
      !Number.isInteger(offlineAccessDays) ||
      offlineAccessDays < 1 ||
      offlineAccessDays > 365
    ) {
      throw new Error(
        "ELITE_ENROLLMENT_OFFLINE_POLICY_INVALID: offline access duration is invalid",
      );
    }
    const request = this.database.raw
      .prepare(
        `SELECT r.*, c.intended_user_id, c.intended_role, c.requested_policy_version,
                c.requested_scopes_json, c.status AS challenge_status
         FROM android_enrollment_requests r
         INNER JOIN android_enrollment_challenges c ON c.id = r.challenge_id
         WHERE r.id = ?`,
      )
      .get(requestId) as Row | undefined;
    if (!request) {
      throw new Error(
        "ELITE_ENROLLMENT_REQUEST_NOT_FOUND: request does not exist",
      );
    }
    if (stringValue(request, "status") !== "pending") {
      throw new Error(
        "ELITE_ENROLLMENT_REQUEST_NOT_PENDING: request is not pending",
      );
    }
    if (stringValue(request, "challenge_status") !== "pending") {
      throw new Error(
        "ELITE_ENROLLMENT_CHALLENGE_NOT_PENDING: challenge is not pending",
      );
    }

    const requestDescriptor = enrollmentDeviceRequestSchema.parse(
      JSON.parse(stringValue(request, "descriptor_json")),
    );
    const issuedAt = this.clock();
    const expiresAt = addMilliseconds(
      issuedAt,
      ENROLLMENT_RESPONSE_VALIDITY_MS,
    );
    const offlineAccessUntil = addMilliseconds(
      issuedAt,
      offlineAccessDays * 24 * 60 * 60 * 1000,
    );
    const enrollmentId = opaqueId("enrollment");
    const activeSigner = this.signaturePort.getActiveKeyMetadata?.();
    const hubTrustAnchorId = activeSigner?.keyId ?? "hub-anchor-pending";
    const hubTrustAnchorVersion = activeSigner?.keyVersion ?? 1;
    const responseWithoutHash = {
      protocolVersion: 1 as const,
      messageType: "enrollment-response" as const,
      enrollmentId,
      challengeId: requestDescriptor.challengeId,
      organizationId: requestDescriptor.organizationId,
      deviceId: requestDescriptor.deviceId,
      userId: stringValue(request, "intended_user_id"),
      role: stringValue(request, "intended_role") as EnrollmentResponse["role"],
      deviceName: requestDescriptor.deviceName,
      devicePublicKeyFingerprint: requestDescriptor.devicePublicKeyFingerprint,
      policyVersion: numberValue(request, "requested_policy_version"),
      allowedScopes: parseScopes(stringValue(request, "requested_scopes_json")),
      responseNonce: randomBytes(16).toString("hex"),
      issuedAt,
      expiresAt,
      offlineAccessUntil,
      hubTrustAnchorId,
      hubTrustAnchorVersion,
    };
    const responseBody = {
      ...responseWithoutHash,
      responseHash: canonicalDescriptorHash(responseWithoutHash),
    };
    const signed = this.signHub(responseBody);
    const response = enrollmentResponseSchema.parse(signed);
    const timestamp = this.clock();
    const responseJson = canonicalJson(response);

    const transaction = this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          `UPDATE android_enrollment_requests
           SET status = 'approved', reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ?
           WHERE id = ? AND status = 'pending'`,
        )
        .run(context.userId, timestamp, timestamp, requestId);
      this.database.raw
        .prepare(
          `UPDATE devices
           SET status = 'active', approved_by_user_id = ?, approved_at = ?, updated_at = ?
           WHERE id = ? AND status = 'pending'`,
        )
        .run(context.userId, timestamp, timestamp, requestDescriptor.deviceId);
      this.database.raw
        .prepare(
          `INSERT INTO android_enrollment_records
           (id, request_id, challenge_id, device_id, organization_id, owner_user_id, role,
            device_name, device_public_key_fingerprint, policy_version, allowed_scopes_json,
            response_hash, response_json, status, issued_at, expires_at, offline_access_until,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?)`,
        )
        .run(
          enrollmentId,
          requestId,
          response.challengeId,
          response.deviceId,
          response.organizationId,
          response.userId,
          response.role,
          response.deviceName,
          response.devicePublicKeyFingerprint,
          response.policyVersion,
          JSON.stringify(response.allowedScopes),
          response.responseHash,
          responseJson,
          response.issuedAt,
          response.expiresAt,
          response.offlineAccessUntil,
          timestamp,
          timestamp,
        );
      this.database.raw
        .prepare(
          `UPDATE android_enrollment_challenges
           SET status = 'accepted', response_hash = ?, signer_key_id = ?, signer_key_version = ?,
               accepted_at = ?, updated_at = ?
           WHERE id = ? AND status = 'pending'`,
        )
        .run(
          response.responseHash,
          response.signerKeyId,
          response.signerKeyVersion,
          timestamp,
          timestamp,
          response.challengeId,
        );
      const syncDeviceId = opaqueId("sync-device");
      this.database.raw
        .prepare(
          `INSERT INTO sync_devices
           (id, device_id, enrollment_id, organization_id, owner_user_id, policy_version, state,
            allowed_scopes_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'suspended', ?, ?, ?)`,
        )
        .run(
          syncDeviceId,
          response.deviceId,
          response.enrollmentId,
          response.organizationId,
          response.userId,
          response.policyVersion,
          JSON.stringify(response.allowedScopes),
          timestamp,
          timestamp,
        );
      this.insertEvent({
        enrollmentId,
        challengeId: response.challengeId,
        requestId,
        action: "admin-approved",
        fromState: "pending",
        toState: "approved",
        actorUserId: context.userId,
        metadata: { responseHash: response.responseHash },
      });
      this.writeAudit(
        context,
        "android.enrollment.approved",
        "enrollment",
        enrollmentId,
        { deviceId: response.deviceId, responseHash: response.responseHash },
      );
    });
    transaction();
    return response;
  }

  public acknowledgeEnrollment(
    value: EnrollmentAcknowledgment,
  ): EnrollmentStateSummary {
    const acknowledgment = enrollmentAcknowledgmentSchema.parse(value);
    const record = this.database.raw
      .prepare(
        `SELECT r.*, q.device_public_key_spki_base64, q.device_name, q.organization_id,
                r.request_id, q.status AS request_status, c.intended_role, c.requested_policy_version,
                c.requested_scopes_json
         FROM android_enrollment_records r
         INNER JOIN android_enrollment_requests q ON q.id = r.request_id
         INNER JOIN android_enrollment_challenges c ON c.id = r.challenge_id
         WHERE r.id = ?`,
      )
      .get(acknowledgment.enrollmentId) as Row | undefined;
    if (!record) {
      throw new Error(
        "ELITE_ENROLLMENT_RECORD_NOT_FOUND: enrollment does not exist",
      );
    }
    if (stringValue(record, "device_id") !== acknowledgment.deviceId) {
      throw new Error(
        "ELITE_ENROLLMENT_DEVICE_MISMATCH: acknowledgment device is not enrolled",
      );
    }
    if (stringValue(record, "response_hash") !== acknowledgment.responseHash) {
      throw new Error(
        "ELITE_ENROLLMENT_RESPONSE_HASH_MISMATCH: acknowledgment is for another response",
      );
    }
    const verified = verifyEnrollmentAcknowledgment(
      acknowledgment,
      stringValue(record, "device_public_key_spki_base64"),
    );
    if (stringValue(record, "status") === "revoked") {
      throw new Error("ELITE_ENROLLMENT_REVOKED: enrollment has been revoked");
    }
    if (stringValue(record, "status") === "active") {
      return this.summaryFromRecord(record);
    }
    if (stringValue(record, "status") !== "approved") {
      throw new Error(
        "ELITE_ENROLLMENT_NOT_APPROVED: enrollment is not awaiting acknowledgment",
      );
    }

    const timestamp = this.clock();
    const transaction = this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          `UPDATE android_enrollment_records
           SET status = 'active', acknowledged_at = ?, updated_at = ?
           WHERE id = ? AND status = 'approved'`,
        )
        .run(verified.acceptedAt, timestamp, acknowledgment.enrollmentId);
      this.database.raw
        .prepare(
          `UPDATE sync_devices
           SET state = 'active', last_seen_at = ?, updated_at = ?
           WHERE enrollment_id = ? AND state = 'suspended'`,
        )
        .run(timestamp, timestamp, acknowledgment.enrollmentId);
      this.insertEvent({
        enrollmentId: acknowledgment.enrollmentId,
        requestId: stringValue(record, "request_id"),
        action: "device-acknowledged",
        fromState: "approved",
        toState: "active",
        metadata: { responseHash: acknowledgment.responseHash },
      });
      this.writeAuditWithoutContext(
        "android.enrollment.acknowledged",
        "enrollment",
        acknowledgment.enrollmentId,
        { deviceId: acknowledgment.deviceId },
      );
    });
    transaction();
    return this.getEnrollmentSummary(acknowledgment.enrollmentId);
  }

  public revokeEnrollment(
    context: SessionContext,
    enrollmentId: string,
    reason: string,
  ): EnrollmentStateSummary {
    this.requireAdmin(context);
    const cleanedReason = reason.trim();
    if (cleanedReason.length < 3 || cleanedReason.length > 500) {
      throw new Error(
        "ELITE_ENROLLMENT_REASON_REQUIRED: revocation reason is invalid",
      );
    }
    const record = this.database.raw
      .prepare("SELECT * FROM android_enrollment_records WHERE id = ?")
      .get(enrollmentId) as Row | undefined;
    if (!record) {
      throw new Error(
        "ELITE_ENROLLMENT_RECORD_NOT_FOUND: enrollment does not exist",
      );
    }
    if (stringValue(record, "status") === "revoked") {
      return this.summaryFromRecord(record);
    }
    const timestamp = this.clock();
    const transaction = this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          `UPDATE android_enrollment_records
           SET status = 'revoked', revoked_at = ?, updated_at = ?
           WHERE id = ? AND status <> 'revoked'`,
        )
        .run(timestamp, timestamp, enrollmentId);
      this.database.raw
        .prepare(
          "UPDATE sync_devices SET state = 'revoked', updated_at = ? WHERE enrollment_id = ?",
        )
        .run(timestamp, enrollmentId);
      this.database.raw
        .prepare(
          "UPDATE devices SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE id = ?",
        )
        .run(timestamp, timestamp, stringValue(record, "device_id"));
      this.database.raw
        .prepare(
          `UPDATE android_enrollment_challenges
           SET status = 'revoked', revoked_at = ?, updated_at = ?
           WHERE id = ? AND status <> 'revoked'`,
        )
        .run(timestamp, timestamp, stringValue(record, "challenge_id"));
      this.insertEvent({
        enrollmentId,
        requestId: stringValue(record, "request_id"),
        action: "enrollment-revoked",
        fromState: stringValue(record, "status"),
        toState: "revoked",
        actorUserId: context.userId,
        reasonCode: cleanedReason,
        metadata: {},
      });
      this.writeAudit(
        context,
        "android.enrollment.revoked",
        "enrollment",
        enrollmentId,
        { reason: cleanedReason, deviceId: record["device_id"] },
      );
    });
    transaction();
    return this.getEnrollmentSummary(enrollmentId);
  }

  public getEnrollmentSummary(enrollmentId: string): EnrollmentStateSummary {
    const row = this.database.raw
      .prepare("SELECT * FROM android_enrollment_records WHERE id = ?")
      .get(enrollmentId) as Row | undefined;
    if (!row) {
      throw new Error(
        "ELITE_ENROLLMENT_RECORD_NOT_FOUND: enrollment does not exist",
      );
    }
    return this.summaryFromRecord(row);
  }

  private signChallenge(body: Record<string, unknown>): EnrollmentChallenge {
    const signed = this.signHub(body);
    return enrollmentChallengeSchema.parse(signed);
  }

  private signHub<T extends Record<string, unknown>>(
    body: T,
  ): T & {
    signatureAlgorithm: "ed25519";
    signatureBase64: string;
    signerKeyId: string;
    signerKeyVersion: number;
  } {
    const signed = this.signaturePort.sign(
      Buffer.from(canonicalJson(body), "utf8"),
    );
    if (!signed.keyId || !signed.keyVersion) {
      throw new Error(
        "ELITE_ENROLLMENT_SIGNER_METADATA_REQUIRED: signer metadata is unavailable",
      );
    }
    return {
      ...body,
      signatureAlgorithm: "ed25519",
      signatureBase64: signed.signature.toString("base64"),
      signerKeyId: signed.keyId,
      signerKeyVersion: signed.keyVersion,
    };
  }

  private requireAdmin(context: SessionContext): void {
    if (context.role !== "admin") {
      throw new Error(
        "ELITE_ENROLLMENT_ADMIN_REQUIRED: administrator privileges are required",
      );
    }
    requireCapability(context, "sync.manage");
  }

  private expireChallenge(challengeId: string, timestamp: string): void {
    const transaction = this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          `UPDATE android_enrollment_challenges
           SET status = 'expired', updated_at = ?
           WHERE id = ? AND status = 'pending'`,
        )
        .run(timestamp, challengeId);
      this.insertEvent({
        challengeId,
        action: "challenge-expired",
        fromState: "pending",
        toState: "expired",
        metadata: {},
      });
    });
    transaction();
  }

  private summaryFromRequest(row: Row): EnrollmentStateSummary {
    return enrollmentStateSummarySchema.parse({
      challengeId: stringValue(row, "challenge_id"),
      requestId: stringValue(row, "id"),
      deviceId: stringValue(row, "device_id"),
      organizationId: stringValue(row, "organization_id"),
      ownerUserId: stringValue(row, "intended_user_id"),
      role: stringValue(row, "intended_role"),
      deviceName: stringValue(row, "device_name"),
      state: stringValue(row, "status"),
      policyVersion: numberValue(row, "requested_policy_version"),
      allowedScopes: parseScopes(stringValue(row, "requested_scopes_json")),
    });
  }

  private summaryFromRecord(row: Row): EnrollmentStateSummary {
    const result: Record<string, unknown> = {
      enrollmentId: stringValue(row, "id"),
      challengeId: stringValue(row, "challenge_id"),
      requestId: stringValue(row, "request_id"),
      deviceId: stringValue(row, "device_id"),
      organizationId: stringValue(row, "organization_id"),
      ownerUserId: stringValue(row, "owner_user_id"),
      role: stringValue(row, "role"),
      deviceName: stringValue(row, "device_name"),
      state: stringValue(row, "status"),
      policyVersion: numberValue(row, "policy_version"),
      allowedScopes: parseScopes(stringValue(row, "allowed_scopes_json")),
    };
    for (const [target, source] of [
      ["issuedAt", "issued_at"],
      ["expiresAt", "expires_at"],
      ["offlineAccessUntil", "offline_access_until"],
      ["acknowledgedAt", "acknowledged_at"],
      ["revokedAt", "revoked_at"],
    ] as const) {
      const value = optionalString(row, source);
      if (value) result[target] = value;
    }
    return enrollmentStateSummarySchema.parse(result);
  }

  private insertEvent(input: {
    enrollmentId?: string;
    challengeId?: string;
    requestId?: string;
    action: string;
    fromState?: string;
    toState: string;
    actorUserId?: string;
    reasonCode?: string;
    metadata: Record<string, unknown>;
  }): void {
    this.database.raw
      .prepare(
        `INSERT INTO android_enrollment_events
         (id, enrollment_id, challenge_id, request_id, action, from_state, to_state,
          actor_user_id, reason_code, metadata_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        opaqueId("enrollment-event"),
        input.enrollmentId ?? null,
        input.challengeId ?? null,
        input.requestId ?? null,
        input.action,
        input.fromState ?? null,
        input.toState,
        input.actorUserId ?? null,
        input.reasonCode ?? null,
        JSON.stringify(input.metadata),
        this.clock(),
      );
  }

  private writeAudit(
    context: SessionContext,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): void {
    this.writeAuditWithoutContext(
      action,
      entityType,
      entityId,
      metadata,
      context,
    );
  }

  private writeAuditWithoutContext(
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
    context?: SessionContext,
  ): void {
    this.database.raw
      .prepare(
        `INSERT INTO audit_events
         (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?)`,
      )
      .run(
        opaqueId("audit"),
        context?.userId ?? null,
        context?.deviceId ?? null,
        action,
        entityType,
        entityId,
        JSON.stringify(metadata),
        this.clock(),
      );
  }
}
