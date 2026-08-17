import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { openDatabase } from "@elite/database";
import { canonicalJson } from "@elite/contracts";
import { describe, expect, it } from "vitest";
import {
  AndroidEnrollmentService,
  AuthService,
  type ExportSignaturePort,
} from "./index.js";

const bootstrapInput = {
  admins: [
    {
      username: "admin.enrollment.primary",
      password: "Synthetic-Enrollment-Primary-2026!",
      displayNameEn: "Synthetic Enrollment Primary",
    },
    {
      username: "admin.enrollment.backup",
      password: "Synthetic-Enrollment-Backup-2026!",
      displayNameEn: "Synthetic Enrollment Backup",
    },
  ],
  hubDevice: {
    friendlyName: "Synthetic Enrollment Hub",
    appVersion: "0.1.0-test",
  },
};

function syntheticSigner(): ExportSignaturePort {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" },
  });
  return {
    sign(data: Buffer) {
      return {
        publicKeyPem: publicKey,
        signature: sign(null, data, privateKey),
        keyId: "hub-enrollment-test-key",
        keyVersion: 1,
      };
    },
  };
}

describe("AndroidEnrollmentService", () => {
  it("transitions enrollment atomically from challenge to active and revoked", async () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    try {
      const auth = new AuthService(database);
      const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
      const admin = await auth.login({
        username: bootstrapInput.admins[0]!.username,
        password: bootstrapInput.admins[0]!.password,
        deviceId: bootstrap.hubDeviceId,
      });
      const signer = syntheticSigner();
      const service = new AndroidEnrollmentService(
        database,
        signer,
        () => "2030-03-02T10:00:00.000Z",
      );
      const challenge = service.createChallenge(admin, {
        organizationId: "org-elite-cairo",
        intendedUserId: admin.userId,
        intendedRole: "admin",
        requestedPolicyVersion: 1,
        requestedScopes: ["appointments", "patient-summary"],
        validitySeconds: 3600,
      });

      const deviceKeys = generateKeyPairSync("ec", {
        namedCurve: "prime256v1",
      });
      const publicKeySpki = deviceKeys.publicKey.export({
        format: "der",
        type: "spki",
      });
      const devicePublicKeySpkiBase64 = publicKeySpki.toString("base64");
      const devicePublicKeyFingerprint = createSha256(publicKeySpki);
      const unsignedRequest = {
        protocolVersion: 1 as const,
        messageType: "enrollment-request" as const,
        requestId: "request-enrollment-01",
        challengeId: challenge.challengeId,
        organizationId: challenge.organizationId,
        deviceId: "android-enrollment-device-01",
        deviceName: "Synthetic Enrollment Android",
        devicePublicKeySpkiBase64,
        devicePublicKeyFingerprint,
        appVersion: "0.1.0-test",
        apiLevel: 35,
        requestedAt: "2030-03-02T10:00:30.000Z",
        requestNonce: "request-nonce-0123456789abcdef",
      };
      const request = {
        ...unsignedRequest,
        deviceSignatureAlgorithm: "sha256with-ecdsa" as const,
        deviceSignatureBase64: sign(
          "sha256",
          Buffer.from(canonicalJson(unsignedRequest), "utf8"),
          deviceKeys.privateKey,
        ).toString("base64"),
      };

      const pending = service.submitDeviceRequest(request);
      expect(pending.state).toBe("pending");
      expect(service.submitDeviceRequest(request).state).toBe("pending");
      expect(
        database.raw
          .prepare(
            "SELECT status FROM android_enrollment_requests WHERE id = ?",
          )
          .get(request.requestId),
      ).toEqual({ status: "pending" });

      const response = service.approveDeviceRequest(admin, request.requestId);
      expect(response.deviceId).toBe(unsignedRequest.deviceId);
      expect(
        database.raw
          .prepare("SELECT status FROM android_enrollment_records WHERE id = ?")
          .get(response.enrollmentId),
      ).toEqual({ status: "approved" });

      const unsignedAcknowledgment = {
        protocolVersion: 1 as const,
        messageType: "enrollment-acknowledgment" as const,
        enrollmentId: response.enrollmentId,
        responseHash: response.responseHash,
        deviceId: response.deviceId,
        acceptedAt: "2030-03-02T10:01:00.000Z",
        acknowledgmentNonce: "ack-nonce-0123456789abcdef",
      };
      const acknowledgment = {
        ...unsignedAcknowledgment,
        deviceSignatureAlgorithm: "sha256with-ecdsa" as const,
        deviceSignatureBase64: sign(
          "sha256",
          Buffer.from(canonicalJson(unsignedAcknowledgment), "utf8"),
          deviceKeys.privateKey,
        ).toString("base64"),
      };
      const active = service.acknowledgeEnrollment(acknowledgment);
      expect(active.state).toBe("active");
      expect(
        database.raw
          .prepare("SELECT state FROM sync_devices WHERE enrollment_id = ?")
          .get(response.enrollmentId),
      ).toEqual({ state: "active" });
      expect(service.acknowledgeEnrollment(acknowledgment).state).toBe(
        "active",
      );

      const revoked = service.revokeEnrollment(
        admin,
        response.enrollmentId,
        "Synthetic device retirement",
      );
      expect(revoked.state).toBe("revoked");
      expect(
        database.raw
          .prepare("SELECT status FROM devices WHERE id = ?")
          .get(response.deviceId),
      ).toEqual({ status: "revoked" });
      expect(
        database.raw
          .prepare("SELECT state FROM sync_devices WHERE enrollment_id = ?")
          .get(response.enrollmentId),
      ).toEqual({ state: "revoked" });
    } finally {
      database.close();
    }
  });
});

function createSha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
