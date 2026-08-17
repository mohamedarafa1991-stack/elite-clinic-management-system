import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import {
  canonicalJson,
  sessionGrantSchema,
  sessionInitDescriptorSchema,
  sessionInitRequestSchema,
  type Capability,
  type SessionGrant,
  type SessionInitRequest,
  type SyncScope,
  type UserRole,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import type { SessionContext } from "./index.js";
import type { ExportSignaturePort } from "./patient-export-service.js";
import { verifySessionInit } from "./session-protocol.js";
import {
  deriveEcdhSharedSecret,
  deriveSessionKeys,
  keyConfirmationMac,
} from "./session-key-derivation.js";
import type { SessionFrameChannelOptions } from "./session-frame-codec.js";
import type { LanSyncFrameRouter } from "./lan-sync-frame-router.js";

const SESSION_VALIDITY_MS = 5 * 60 * 1000;

type Row = Record<string, unknown>;

export interface EstablishedLanSession {
  grant: SessionGrant;
  hubPublicKeyPem: string;
  context: SessionContext;
  channel: SessionFrameChannelOptions;
}

export class LanSessionService {
  private readonly seenRequestNonces = new Map<string, number>();

  public constructor(
    private readonly database: EliteDatabase,
    private readonly signaturePort: ExportSignaturePort,
  ) {}

  public establish(
    input: SessionInitRequest,
    now = new Date().toISOString(),
  ): EstablishedLanSession {
    const record = this.loadActiveEnrollment(input, now);
    const verified = verifySessionInit(
      sessionInitRequestSchema.parse(input),
      String(record["device_public_key_spki_base64"]),
    );
    const descriptor = sessionInitDescriptorSchema.parse(verified);
    if (descriptor.organizationId !== String(record["organization_id"])) {
      throw new Error("ELITE_LAN_SESSION_ORGANIZATION_MISMATCH");
    }
    if (descriptor.deviceId !== String(record["device_id"])) {
      throw new Error("ELITE_LAN_SESSION_DEVICE_MISMATCH");
    }
    if (descriptor.enrollmentId !== String(record["enrollment_id"])) {
      throw new Error("ELITE_LAN_SESSION_ENROLLMENT_MISMATCH");
    }
    if (descriptor.userId !== String(record["owner_user_id"])) {
      throw new Error("ELITE_LAN_SESSION_USER_MISMATCH");
    }
    this.assertFreshAndUnusedInit(
      descriptor.requestNonce,
      descriptor.requestedAt,
      now,
    );
    if (String(record["sync_state"]) !== "active") {
      throw new Error("ELITE_LAN_SYNC_POLICY_NOT_ACTIVE");
    }
    if (String(record["sync_organization_id"]) !== descriptor.organizationId) {
      throw new Error("ELITE_LAN_SYNC_POLICY_ORGANIZATION_MISMATCH");
    }
    if (String(record["sync_owner_user_id"]) !== descriptor.userId) {
      throw new Error("ELITE_LAN_SYNC_POLICY_USER_MISMATCH");
    }
    const enrollmentScopes = parseScopes(String(record["allowed_scopes_json"]));
    const syncScopes = parseScopes(String(record["sync_allowed_scopes_json"]));
    if (
      descriptor.requestedScopes.some(
        (scope) =>
          !enrollmentScopes.includes(scope) || !syncScopes.includes(scope),
      )
    ) {
      throw new Error("ELITE_LAN_SESSION_SCOPE_DENIED");
    }

    const serverEphemeral = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const serverPublicDer = serverEphemeral.publicKey.export({
      format: "der",
      type: "spki",
    });
    const serverPublicBase64 = serverPublicDer.toString("base64");
    const serverFingerprint = sha256Hex(serverPublicDer);
    const sharedSecret = deriveEcdhSharedSecret(
      serverEphemeral.privateKey,
      descriptor.deviceEphemeralPublicKeySpkiBase64,
    );
    const noncePrefixBase64 = randomBytes(4).toString("base64");
    const issuedAt = now;
    const validUntil = new Date(
      Math.min(
        Date.parse(issuedAt) + SESSION_VALIDITY_MS,
        Date.parse(String(record["expires_at"])),
        Date.parse(String(record["offline_access_until"])),
      ),
    ).toISOString();
    const transcriptHash = sha256Hex(
      Buffer.from(
        canonicalJson({
          protocolVersion: 1,
          messageType: "session-transcript",
          init: descriptor,
          serverEphemeralPublicKeySpkiBase64: serverPublicBase64,
          serverEphemeralKeyFingerprint: serverFingerprint,
          grantedScopes: descriptor.requestedScopes,
          issuedAt,
          validUntil,
          noncePrefixBase64,
        }),
        "utf8",
      ),
    );
    const keys = deriveSessionKeys(
      sharedSecret,
      Buffer.from(transcriptHash, "hex"),
    );
    const sessionId = descriptor.sessionId;
    const responseWithoutSignature = {
      protocolVersion: 1 as const,
      messageType: "session-grant" as const,
      organizationId: descriptor.organizationId,
      enrollmentId: descriptor.enrollmentId,
      deviceId: descriptor.deviceId,
      userId: descriptor.userId,
      sessionId,
      requestNonce: descriptor.requestNonce,
      clientCounter: descriptor.clientCounter,
      serverEphemeralPublicKeySpkiBase64: serverPublicBase64,
      serverEphemeralKeyFingerprint: serverFingerprint,
      grantedScopes: descriptor.requestedScopes,
      issuedAt,
      validUntil,
      transcriptHash,
      keyConfirmationMacBase64: keyConfirmationMac(
        keys.keyConfirmationKey,
        sessionId,
        transcriptHash,
        "hub",
      ).toString("base64"),
      noncePrefixBase64,
    };
    const signed = this.signaturePort.sign(
      Buffer.from(canonicalJson(responseWithoutSignature), "utf8"),
    );
    if (!signed.keyId || signed.keyVersion === undefined) {
      throw new Error("ELITE_LAN_HUB_SIGNER_METADATA_MISSING");
    }
    const grant = sessionGrantSchema.parse({
      ...responseWithoutSignature,
      signatureAlgorithm: "ed25519",
      signatureBase64: signed.signature.toString("base64"),
      signerKeyId: signed.keyId,
      signerKeyVersion: signed.keyVersion,
    });
    const context: SessionContext = {
      sessionId,
      token: `lan-${randomBytes(24).toString("hex")}`,
      userId: descriptor.userId,
      username: descriptor.userId,
      role: String(record["role"]) as UserRole,
      deviceId: descriptor.deviceId,
      capabilities: ["sync.read", "sync.write"] as Capability[],
      expiresAt: validUntil,
    };
    return {
      grant,
      hubPublicKeyPem: signed.publicKeyPem,
      context,
      channel: {
        sessionId,
        noncePrefix: Buffer.from(noncePrefixBase64, "base64"),
        sendKey: keys.hubToClientKey,
        receiveKey: keys.clientToHubKey,
        sendDirection: "hub-to-client",
        receiveDirection: "client-to-hub",
      },
    };
  }

  public establishAndRegister(
    router: LanSyncFrameRouter,
    input: SessionInitRequest,
    now = new Date().toISOString(),
  ): EstablishedLanSession {
    const established = this.establish(input, now);
    router.registerSignedSession({
      grant: established.grant,
      trustedHubPublicKeyPem: established.hubPublicKeyPem,
      expectedOrganizationId: established.grant.organizationId,
      expectedRequestNonce: established.grant.requestNonce,
      now,
      context: established.context,
      sessionChannel: established.channel,
    });
    return established;
  }

  private assertFreshAndUnusedInit(
    requestNonce: string,
    requestedAt: string,
    now: string,
  ): void {
    const currentTime = Date.parse(now);
    const requestedTime = Date.parse(requestedAt);
    if (
      !Number.isFinite(currentTime) ||
      !Number.isFinite(requestedTime) ||
      requestedTime > currentTime + 30_000 ||
      currentTime - requestedTime > SESSION_VALIDITY_MS
    ) {
      throw new Error("ELITE_LAN_SESSION_INIT_STALE");
    }
    for (const [nonce, expiresAt] of this.seenRequestNonces) {
      if (expiresAt <= currentTime) this.seenRequestNonces.delete(nonce);
    }
    if (this.seenRequestNonces.has(requestNonce)) {
      throw new Error("ELITE_LAN_SESSION_INIT_REPLAYED");
    }
    this.seenRequestNonces.set(requestNonce, currentTime + SESSION_VALIDITY_MS);
  }

  private loadActiveEnrollment(input: SessionInitRequest, now: string): Row {
    const row = this.database.raw
      .prepare(
        `SELECT r.id AS enrollment_id, r.device_id, r.organization_id, r.owner_user_id, r.role,
                r.allowed_scopes_json, r.expires_at, r.offline_access_until, r.status,
                q.device_public_key_spki_base64,
                s.organization_id AS sync_organization_id,
                s.owner_user_id AS sync_owner_user_id,
                s.state AS sync_state,
                s.allowed_scopes_json AS sync_allowed_scopes_json
         FROM android_enrollment_records r
         INNER JOIN android_enrollment_requests q ON q.id = r.request_id
         LEFT JOIN sync_devices s ON s.device_id = r.device_id
         WHERE r.id = ? AND r.device_id = ?`,
      )
      .get(input.enrollmentId, input.deviceId) as Row | undefined;
    if (!row) throw new Error("ELITE_LAN_ENROLLMENT_NOT_FOUND");
    if (String(row["status"]) !== "active") {
      throw new Error("ELITE_LAN_ENROLLMENT_NOT_ACTIVE");
    }
    const currentTime = Date.parse(now);
    const expiresAt = Date.parse(String(row["expires_at"]));
    const offlineAccessUntil = Date.parse(String(row["offline_access_until"]));
    if (
      !Number.isFinite(currentTime) ||
      !Number.isFinite(expiresAt) ||
      !Number.isFinite(offlineAccessUntil) ||
      expiresAt <= currentTime
    ) {
      throw new Error("ELITE_LAN_ENROLLMENT_EXPIRED");
    }
    if (offlineAccessUntil <= currentTime) {
      throw new Error("ELITE_LAN_OFFLINE_ACCESS_EXPIRED");
    }
    return row;
  }
}

function parseScopes(value: string): SyncScope[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error("ELITE_LAN_POLICY_INVALID");
  return parsed as SyncScope[];
}

function sha256Hex(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
