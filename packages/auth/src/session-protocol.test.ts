import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { canonicalJson } from "@elite/contracts";
import { describe, expect, it } from "vitest";
import {
  canonicalDescriptorHash,
  sha256Hex,
  verifyEnrollmentChallenge,
  verifyEnrollmentDeviceRequest,
  verifyEnrollmentResponse,
  verifySessionInit,
} from "./session-protocol.js";

const now = "2026-08-17T09:02:00.000Z";
const base64 = "A".repeat(32);
const hubKeys = generateKeyPairSync("ed25519");
const deviceKeys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const devicePublicKeySpki = deviceKeys.publicKey.export({
  type: "spki",
  format: "der",
});
const devicePublicKeySpkiBase64 = devicePublicKeySpki.toString("base64");
const devicePublicKeyFingerprint = sha256Hex(devicePublicKeySpki);
const requestNonce = "0123456789abcdef0123456789abcdef";
const responseNonce = "fedcba9876543210fedcba9876543210";
const fingerprint = "a".repeat(64);

function signDeviceDescriptor(descriptor: Record<string, unknown>): string {
  return sign(
    "sha256",
    Buffer.from(canonicalJson(descriptor), "utf8"),
    deviceKeys.privateKey,
  ).toString("base64");
}

function signHubDescriptor(descriptor: Record<string, unknown>): string {
  return sign(
    null,
    Buffer.from(canonicalJson(descriptor), "utf8"),
    hubKeys.privateKey,
  ).toString("base64");
}

describe("Step 22 protocol verification", () => {
  it("verifies Android device-key possession and rejects tampering", () => {
    const unsignedRequest = {
      protocolVersion: 1,
      messageType: "enrollment-request",
      requestId: "request-01",
      challengeId: "challenge-01",
      organizationId: "org-elite-cairo",
      deviceId: "android-device-01",
      deviceName: "Synthetic Android",
      devicePublicKeySpkiBase64,
      devicePublicKeyFingerprint,
      appVersion: "0.1.0",
      apiLevel: 29,
      requestedAt: now,
      requestNonce,
    } as const;
    const request = {
      ...unsignedRequest,
      deviceSignatureAlgorithm: "sha256with-ecdsa" as const,
      deviceSignatureBase64: signDeviceDescriptor(unsignedRequest),
    };

    expect(verifyEnrollmentDeviceRequest(request).deviceId).toBe(
      "android-device-01",
    );
    expect(() =>
      verifyEnrollmentDeviceRequest({
        ...request,
        deviceName: "Tampered Android",
      }),
    ).toThrow("ELITE_STEP22_DEVICE_SIGNATURE_INVALID");
  });

  it("verifies signed challenge and enrollment response hashes", () => {
    const unsignedChallengeWithoutHash = {
      protocolVersion: 1,
      messageType: "enrollment-challenge",
      challengeId: "challenge-01",
      organizationId: "org-elite-cairo",
      intendedUserId: "user-nurse-01",
      intendedRole: "nurse",
      requestedPolicyVersion: 1,
      requestedScopes: ["appointments", "patient-summary"] as Array<
        "appointments" | "patient-summary"
      >,
      issuedAt: "2026-08-17T09:00:00.000Z",
      expiresAt: "2026-08-18T09:00:00.000Z",
      responseNonce,
    } as const;
    const challengeUnsigned = {
      ...unsignedChallengeWithoutHash,
      responseHash: canonicalDescriptorHash(unsignedChallengeWithoutHash),
    };
    const challenge = {
      ...challengeUnsigned,
      signatureAlgorithm: "ed25519" as const,
      signatureBase64: signHubDescriptor(challengeUnsigned),
      signerKeyId: "hub-signing-key",
      signerKeyVersion: 1,
    };

    expect(
      verifyEnrollmentChallenge(
        challenge,
        hubKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
        now,
      ).challengeId,
    ).toBe("challenge-01");

    const unsignedResponseWithoutHash = {
      protocolVersion: 1,
      messageType: "enrollment-response",
      enrollmentId: "enrollment-01",
      challengeId: "challenge-01",
      organizationId: "org-elite-cairo",
      deviceId: "android-device-01",
      userId: "user-nurse-01",
      role: "nurse",
      deviceName: "Synthetic Android",
      devicePublicKeyFingerprint,
      policyVersion: 1,
      allowedScopes: ["appointments", "patient-summary"] as Array<
        "appointments" | "patient-summary"
      >,
      responseNonce,
      issuedAt: now,
      expiresAt: "2026-08-17T09:05:00.000Z",
      offlineAccessUntil: "2026-09-16T09:00:00.000Z",
      hubTrustAnchorId: "hub-signing-key",
      hubTrustAnchorVersion: 1,
    } as const;
    const responseUnsigned = {
      ...unsignedResponseWithoutHash,
      responseHash: canonicalDescriptorHash(unsignedResponseWithoutHash),
    };
    const response = {
      ...responseUnsigned,
      signatureAlgorithm: "ed25519" as const,
      signatureBase64: signHubDescriptor(responseUnsigned),
      signerKeyId: "hub-signing-key",
      signerKeyVersion: 1,
    };

    expect(
      verifyEnrollmentResponse(
        response,
        hubKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
        "org-elite-cairo",
        "android-device-01",
        "challenge-01",
        responseNonce,
        devicePublicKeyFingerprint,
        now,
      ).enrollmentId,
    ).toBe("enrollment-01");

    expect(() =>
      verifyEnrollmentResponse(
        { ...response, responseHash: fingerprint },
        hubKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
        "org-elite-cairo",
        "android-device-01",
        "challenge-01",
        responseNonce,
        devicePublicKeyFingerprint,
        now,
      ),
    ).toThrow("ELITE_STEP22_RESPONSE_HASH_INVALID");
  });

  it("verifies a signed session-init descriptor against the enrolled device key", () => {
    const unsignedInit = {
      protocolVersion: 1,
      messageType: "session-init",
      organizationId: "org-elite-cairo",
      enrollmentId: "enrollment-01",
      deviceId: "android-device-01",
      userId: "user-nurse-01",
      sessionId: "session-01",
      requestNonce,
      clientCounter: 0,
      deviceIdentityKeyFingerprint: devicePublicKeyFingerprint,
      deviceEphemeralPublicKeySpkiBase64: base64,
      deviceEphemeralKeyFingerprint: fingerprint,
      requestedScopes: ["appointments"] as Array<"appointments">,
      requestedAt: now,
    } as const;
    const request = {
      ...unsignedInit,
      deviceSignatureAlgorithm: "sha256with-ecdsa" as const,
      deviceSignatureBase64: signDeviceDescriptor(unsignedInit),
    };

    expect(
      verifySessionInit(request, devicePublicKeySpkiBase64).sessionId,
    ).toBe("session-01");
    expect(() =>
      verifySessionInit(
        { ...request, clientCounter: 1 },
        devicePublicKeySpkiBase64,
      ),
    ).toThrow("ELITE_STEP22_DEVICE_SIGNATURE_INVALID");
  });
});
