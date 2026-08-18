import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { createServer, request as httpRequest, type Server } from "node:http";
import { canonicalJson, syncDeltaResponseSchema } from "@elite/contracts";
import { openDatabase } from "@elite/database";
import { describe, expect, it } from "vitest";
import {
  AuthService,
  LanSessionService,
  LanSyncFrameRouter,
  SessionFrameChannel,
  SynchronizationService,
  type ExportSignaturePort,
} from "./index.js";
import {
  deriveEcdhSharedSecret,
  deriveSessionKeys,
  keyConfirmationMac,
} from "./session-key-derivation.js";
import { buildDeltaRequest } from "./lan-request-factories.js";

const NOW = "2030-03-02T10:00:00.000Z";
const ORGANIZATION_ID = "elite-clinic";
const DEVICE_ID = "loopback-android-device";
const USER_ID = "loopback-admin-user";
const ENROLLMENT_ID = "loopback-enrollment-01";
const REQUEST_ID = "loopback-request-01";
const CHALLENGE_ID = "loopback-challenge-01";
const REQUEST_NONCE = "loopback-session-request-nonce-01";

const bootstrapInput = {
  admins: [
    {
      username: "admin.loopback.primary",
      password: "Synthetic-Loopback-Primary-2030!",
      displayNameEn: "Loopback Primary",
    },
    {
      username: "admin.loopback.backup",
      password: "Synthetic-Loopback-Backup-2030!",
      displayNameEn: "Loopback Backup",
    },
  ],
  hubDevice: {
    friendlyName: "Loopback Hub",
    appVersion: "0.1.0-test",
  },
};

describe("Step 22 LAN loopback integration", () => {
  it("establishes a signed session and completes encrypted delta and outbox flows", async () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    let server: Server | undefined;
    try {
      const auth = new AuthService(database);
      const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
      const admin = await auth.login({
        username: bootstrapInput.admins[0]!.username,
        password: bootstrapInput.admins[0]!.password,
        deviceId: bootstrap.hubDeviceId,
      });
      const deviceKeys = generateKeyPairSync("ec", {
        namedCurve: "prime256v1",
      });
      const devicePublicSpki = deviceKeys.publicKey.export({
        format: "der",
        type: "spki",
      });
      const devicePublicSpkiBase64 = devicePublicSpki.toString("base64");
      const deviceFingerprint = sha256Hex(devicePublicSpki);
      seedActiveEnrollment(
        database,
        admin.userId,
        devicePublicSpkiBase64,
        deviceFingerprint,
      );

      const signer = syntheticSigner();
      const synchronization = new SynchronizationService(
        database,
        signer,
        () => NOW,
      );
      const policy = synchronization.registerDevice(admin, {
        deviceId: DEVICE_ID,
        enrollmentId: ENROLLMENT_ID,
        organizationId: ORGANIZATION_ID,
        ownerUserId: admin.userId,
        policyVersion: 1,
        allowedScopes: ["appointments"],
      });
      expect(policy.state).toBe("active");

      const router = new LanSyncFrameRouter(synchronization);
      const sessionService = new LanSessionService(database, signer);
      server = await startLoopbackServer(router, sessionService);
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("LOOPBACK_PORT_UNAVAILABLE");
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const ephemeral = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      const ephemeralSpki = ephemeral.publicKey.export({
        format: "der",
        type: "spki",
      });
      const sessionId = "loopback-session-01";
      const unsignedInit = {
        protocolVersion: 1 as const,
        messageType: "session-init" as const,
        organizationId: ORGANIZATION_ID,
        enrollmentId: ENROLLMENT_ID,
        deviceId: DEVICE_ID,
        userId: admin.userId,
        sessionId,
        requestNonce: REQUEST_NONCE,
        clientCounter: 0,
        deviceIdentityKeyFingerprint: deviceFingerprint,
        deviceEphemeralPublicKeySpkiBase64: ephemeralSpki.toString("base64"),
        deviceEphemeralKeyFingerprint: sha256Hex(ephemeralSpki),
        requestedScopes: ["appointments"] as const,
        requestedAt: NOW,
      };
      const sessionInit = {
        ...unsignedInit,
        deviceSignatureAlgorithm: "sha256with-ecdsa" as const,
        deviceSignatureBase64: sign(
          "sha256",
          Buffer.from(canonicalJson(unsignedInit), "utf8"),
          deviceKeys.privateKey,
        ).toString("base64"),
      };
      const grantResponse = await postJson(
        `${baseUrl}/sync/session-init`,
        sessionInit,
      );
      expect(grantResponse.status, JSON.stringify(grantResponse.body)).toBe(
        200,
      );
      const grant = grantResponse.body as Record<string, unknown>;
      expect(grant["messageType"]).toBe("session-grant");
      expect(verifyGrant(grant, signer.publicKeyPem)).toBe(true);
      const replayResponse = await postJson(
        `${baseUrl}/sync/session-init`,
        sessionInit,
      );
      expect(replayResponse.status).toBe(400);
      expect(replayResponse.body).toEqual({
        error: "ELITE_LAN_SESSION_INIT_REPLAYED",
      });

      const transcriptHash = sessionTranscriptHash(unsignedInit, grant);
      expect(grant["transcriptHash"]).toBe(transcriptHash);
      const keys = deriveSessionKeys(
        deriveEcdhSharedSecret(
          ephemeral.privateKey,
          String(grant["serverEphemeralPublicKeySpkiBase64"]),
        ),
        Buffer.from(transcriptHash, "hex"),
      );
      expect(
        keyConfirmationMac(
          keys.keyConfirmationKey,
          sessionId,
          transcriptHash,
          "hub",
        ).toString("base64"),
      ).toBe(grant["keyConfirmationMacBase64"]);

      const clientChannel = new SessionFrameChannel({
        sessionId,
        noncePrefix: Buffer.from(String(grant["noncePrefixBase64"]), "base64"),
        sendKey: keys.clientToHubKey,
        receiveKey: keys.hubToClientKey,
        sendDirection: "client-to-hub",
        receiveDirection: "hub-to-client",
      });
      const deltaRequest = buildDeltaRequest(
        policy,
        "appointments",
        undefined,
        "loopback-sync-session-01",
        "loopback-delta-request-nonce-01",
        NOW,
      );
      const deltaResponseFrame = await postJson(
        `${baseUrl}/sync/lan`,
        clientChannel.encrypt(
          "sync-request",
          Buffer.from(canonicalJson({ request: deltaRequest }), "utf8"),
        ),
      );
      expect(deltaResponseFrame.status).toBe(200);
      const deltaEnvelope = JSON.parse(
        clientChannel
          .decrypt(
            deltaResponseFrame.body as Parameters<
              SessionFrameChannel["decrypt"]
            >[0],
          )
          .plaintext.toString("utf8"),
      ) as { response: unknown };
      const delta = syncDeltaResponseSchema.parse(deltaEnvelope.response);
      expect(delta.organizationId).toBe(ORGANIZATION_ID);
      expect(delta.deviceId).toBe(DEVICE_ID);
      expect(verifyDelta(delta, signer.publicKeyPem)).toBe(true);

      const outboxRequest = {
        operationId: "loopback-operation-01",
        organizationId: ORGANIZATION_ID,
        deviceId: DEVICE_ID,
        userId: admin.userId,
        scope: "appointments" as const,
        operation: "appointment-acknowledge" as const,
        resourceType: "Appointment" as const,
        resourceId: "loopback-appointment-01",
        baseVersion: 1,
        payload: { acknowledged: true },
        reason: "Synthetic loopback acknowledgment",
        createdAt: NOW,
      };
      const outboxResponseFrame = await postJson(
        `${baseUrl}/sync/lan`,
        clientChannel.encrypt(
          "outbox-request",
          Buffer.from(canonicalJson({ request: outboxRequest }), "utf8"),
        ),
      );
      expect(outboxResponseFrame.status).toBe(200);
      const outboxResponse = JSON.parse(
        clientChannel
          .decrypt(
            outboxResponseFrame.body as Parameters<
              SessionFrameChannel["decrypt"]
            >[0],
          )
          .plaintext.toString("utf8"),
      ) as Record<string, unknown>;
      expect(outboxResponse).toMatchObject({
        operationId: outboxRequest.operationId,
        state: "accepted",
      });
      expect(
        database.raw
          .prepare("SELECT state FROM sync_outbox WHERE operation_id = ?")
          .get(outboxRequest.operationId),
      ).toEqual({ state: "pending" });
    } finally {
      await stopServer(server);
      database.close();
    }
  });
});

function syntheticSigner(): ExportSignaturePort & { publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" },
  });
  return {
    publicKeyPem: publicKey,
    sign(data: Buffer) {
      return {
        publicKeyPem: publicKey,
        signature: sign(null, data, privateKey),
        keyId: "loopback-hub-key",
        keyVersion: 1,
      };
    },
  };
}

function seedActiveEnrollment(
  database: ReturnType<typeof openDatabase>,
  ownerUserId: string,
  devicePublicKeySpkiBase64: string,
  deviceFingerprint: string,
): void {
  database.raw
    .prepare(
      `INSERT INTO devices
       (id, friendly_name, platform, app_version, api_level, owner_user_id, status, created_at, updated_at)
       VALUES (?, ?, 'android', ?, ?, ?, 'active', ?, ?)`,
    )
    .run(
      DEVICE_ID,
      "Loopback Android",
      "0.1.0-test",
      35,
      ownerUserId,
      NOW,
      NOW,
    );
  database.raw
    .prepare(
      `INSERT INTO android_enrollment_challenges
       (id, organization_id, intended_user_id, intended_role, requested_policy_version, requested_scopes_json,
        response_nonce, issued_at, expires_at, status, response_hash, signer_key_id, signer_key_version,
        descriptor_json, created_by_user_id, accepted_at, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 1, ?, ?, ?, ?, 'accepted', ?, ?, 1, ?, ?, ?, ?, ?)`,
    )
    .run(
      CHALLENGE_ID,
      ORGANIZATION_ID,
      ownerUserId,
      JSON.stringify(["appointments"]),
      "loopback-challenge-response-nonce",
      NOW,
      "2030-04-01T00:00:00.000Z",
      "a".repeat(64),
      "loopback-hub-key",
      "{}",
      ownerUserId,
      NOW,
      NOW,
      NOW,
    );
  database.raw
    .prepare(
      `INSERT INTO android_enrollment_requests
       (id, challenge_id, organization_id, device_id, device_name, app_version, api_level,
        device_public_key_spki_base64, device_public_key_fingerprint, request_nonce, request_hash,
        descriptor_json, status, requested_at, reviewed_by_user_id, reviewed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?)`,
    )
    .run(
      REQUEST_ID,
      CHALLENGE_ID,
      ORGANIZATION_ID,
      DEVICE_ID,
      "Loopback Android",
      "0.1.0-test",
      35,
      devicePublicKeySpkiBase64,
      deviceFingerprint,
      "loopback-enrollment-request-nonce",
      "b".repeat(64),
      "{}",
      NOW,
      ownerUserId,
      NOW,
      NOW,
      NOW,
    );
  database.raw
    .prepare(
      `INSERT INTO android_enrollment_records
       (id, request_id, challenge_id, device_id, organization_id, owner_user_id, role, device_name,
        device_public_key_fingerprint, policy_version, allowed_scopes_json, patient_scope_json, response_hash,
        response_json, status, issued_at, expires_at, offline_access_until, acknowledged_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'admin', ?, ?, 1, ?, NULL, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ENROLLMENT_ID,
      REQUEST_ID,
      CHALLENGE_ID,
      DEVICE_ID,
      ORGANIZATION_ID,
      ownerUserId,
      "Loopback Android",
      deviceFingerprint,
      JSON.stringify(["appointments"]),
      "c".repeat(64),
      "{}",
      NOW,
      "2030-04-01T00:00:00.000Z",
      "2030-04-01T00:00:00.000Z",
      NOW,
      NOW,
      NOW,
    );
}

function startLoopbackServer(
  router: LanSyncFrameRouter,
  sessionService: LanSessionService,
): Promise<Server> {
  const server = createServer(async (request, response) => {
    try {
      const body = await readBody(request);
      if (request.url === "/sync/session-init") {
        const established = sessionService.establishAndRegister(
          router,
          JSON.parse(body) as Parameters<LanSessionService["establish"]>[0],
          NOW,
        );
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(established.grant));
        return;
      }
      if (request.url !== "/sync/lan") {
        response.writeHead(404).end();
        return;
      }
      const frame = JSON.parse(body) as Parameters<
        LanSyncFrameRouter["route"]
      >[0];
      const result = await router.route(frame);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "LOOPBACK_FAILED",
        }),
      );
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function postJson(
  url: string,
  value: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(value);
    const request = httpRequest(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port),
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: response.statusCode ?? 0,
            body: text ? JSON.parse(text) : undefined,
          });
        });
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}

function readBody(
  request: import("node:http").IncomingMessage,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function stopServer(server: Server | undefined): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function sha256Hex(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sessionTranscriptHash(
  init: Record<string, unknown>,
  grant: Record<string, unknown>,
): string {
  return sha256Hex(
    Buffer.from(
      canonicalJson({
        protocolVersion: 1,
        messageType: "session-transcript",
        init,
        serverEphemeralPublicKeySpkiBase64:
          grant["serverEphemeralPublicKeySpkiBase64"],
        serverEphemeralKeyFingerprint: grant["serverEphemeralKeyFingerprint"],
        grantedScopes: grant["grantedScopes"],
        issuedAt: grant["issuedAt"],
        validUntil: grant["validUntil"],
        noncePrefixBase64: grant["noncePrefixBase64"],
      }),
      "utf8",
    ),
  );
}

function verifyGrant(
  grant: Record<string, unknown>,
  publicKeyPem: string,
): boolean {
  return verify(
    null,
    Buffer.from(canonicalJson(stripSignatureFields(grant)), "utf8"),
    publicKeyPem,
    Buffer.from(String(grant["signatureBase64"]), "base64"),
  );
}

function verifyDelta(
  delta: ReturnType<typeof syncDeltaResponseSchema.parse>,
  publicKeyPem: string,
): boolean {
  return verify(
    null,
    Buffer.from(
      canonicalJson(
        stripSignatureFields(delta as unknown as Record<string, unknown>),
      ),
      "utf8",
    ),
    publicKeyPem,
    Buffer.from(delta.signatureBase64, "base64"),
  );
}

function stripSignatureFields(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) =>
        ![
          "deviceSignatureAlgorithm",
          "deviceSignatureBase64",
          "signatureAlgorithm",
          "signatureBase64",
          "signerKeyId",
          "signerKeyVersion",
        ].includes(key),
    ),
  );
}
