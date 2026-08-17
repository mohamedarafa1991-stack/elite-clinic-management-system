import { describe, expect, it } from "vitest";
import {
  enrollmentChallengeSchema,
  enrollmentDeviceRequestSchema,
  enrollmentResponseSchema,
  sessionFrameSchema,
  sessionGrantSchema,
  sessionInitRequestSchema,
} from "./index.js";

const base64 = "A".repeat(32);
const fingerprint = "a".repeat(64);
const timestamp = "2026-08-17T09:00:00.000Z";

const enrollmentDescriptor = {
  protocolVersion: 1 as const,
  messageType: "enrollment-response" as const,
  enrollmentId: "enrollment-01",
  challengeId: "challenge-01",
  organizationId: "org-elite-cairo",
  deviceId: "android-device-01",
  userId: "user-nurse-01",
  role: "nurse" as const,
  deviceName: "Front Desk Android",
  devicePublicKeyFingerprint: fingerprint,
  policyVersion: 1,
  allowedScopes: ["appointments", "patient-summary"] as const,
  responseNonce: "0123456789abcdef0123456789abcdef",
  issuedAt: timestamp,
  expiresAt: "2026-08-18T09:00:00.000Z",
  offlineAccessUntil: "2026-09-16T09:00:00.000Z",
  hubTrustAnchorId: "hub-signing-key",
  hubTrustAnchorVersion: 1,
  responseHash: fingerprint,
};

describe("Step 22 enrollment and session contracts", () => {
  it("accepts the signed enrollment and session message shapes", () => {
    expect(
      enrollmentChallengeSchema.parse({
        protocolVersion: 1,
        messageType: "enrollment-challenge",
        challengeId: "challenge-01",
        organizationId: "org-elite-cairo",
        intendedUserId: "user-nurse-01",
        intendedRole: "nurse",
        requestedPolicyVersion: 1,
        requestedScopes: ["appointments", "patient-summary"],
        issuedAt: timestamp,
        expiresAt: "2026-08-18T09:00:00.000Z",
        responseNonce: "0123456789abcdef0123456789abcdef",
        responseHash: fingerprint,
        signatureAlgorithm: "ed25519",
        signatureBase64: base64,
        signerKeyId: "hub-signing-key",
        signerKeyVersion: 1,
      }),
    ).toBeTruthy();

    expect(
      enrollmentDeviceRequestSchema.parse({
        protocolVersion: 1,
        messageType: "enrollment-request",
        requestId: "request-01",
        challengeId: "challenge-01",
        organizationId: "org-elite-cairo",
        deviceId: "android-device-01",
        deviceName: "Front Desk Android",
        devicePublicKeySpkiBase64: base64,
        devicePublicKeyFingerprint: fingerprint,
        appVersion: "0.1.0",
        apiLevel: 29,
        requestedAt: timestamp,
        requestNonce: "0123456789abcdef0123456789abcdef",
        deviceSignatureAlgorithm: "sha256with-ecdsa",
        deviceSignatureBase64: base64,
      }),
    ).toBeTruthy();

    expect(
      enrollmentResponseSchema.parse({
        ...enrollmentDescriptor,
        signatureAlgorithm: "ed25519",
        signatureBase64: base64,
        signerKeyId: "hub-signing-key",
        signerKeyVersion: 1,
      }),
    ).toBeTruthy();

    expect(
      sessionInitRequestSchema.parse({
        protocolVersion: 1,
        messageType: "session-init",
        organizationId: "org-elite-cairo",
        enrollmentId: "enrollment-01",
        deviceId: "android-device-01",
        userId: "user-nurse-01",
        sessionId: "session-01",
        requestNonce: "0123456789abcdef0123456789abcdef",
        clientCounter: 0,
        deviceIdentityKeyFingerprint: fingerprint,
        deviceEphemeralPublicKeySpkiBase64: base64,
        deviceEphemeralKeyFingerprint: fingerprint,
        requestedScopes: ["appointments"],
        requestedAt: timestamp,
        deviceSignatureAlgorithm: "sha256with-ecdsa",
        deviceSignatureBase64: base64,
      }),
    ).toBeTruthy();

    expect(
      sessionGrantSchema.parse({
        protocolVersion: 1,
        messageType: "session-grant",
        organizationId: "org-elite-cairo",
        enrollmentId: "enrollment-01",
        deviceId: "android-device-01",
        userId: "user-nurse-01",
        sessionId: "session-01",
        requestNonce: "0123456789abcdef0123456789abcdef",
        clientCounter: 0,
        serverEphemeralPublicKeySpkiBase64: base64,
        serverEphemeralKeyFingerprint: fingerprint,
        grantedScopes: ["appointments"],
        issuedAt: timestamp,
        validUntil: "2026-08-17T09:05:00.000Z",
        transcriptHash: fingerprint,
        keyConfirmationMacBase64: base64,
        noncePrefixBase64: "AQIDBA==",
        signatureAlgorithm: "ed25519",
        signatureBase64: base64,
        signerKeyId: "hub-signing-key",
        signerKeyVersion: 1,
      }),
    ).toBeTruthy();

    expect(
      sessionFrameSchema.parse({
        protocolVersion: 1,
        messageType: "sync-request",
        sessionId: "session-01",
        direction: "client-to-hub",
        counter: 0,
        nonceBase64: base64,
        aadHash: fingerprint,
        ciphertextBase64: base64,
        tagBase64: base64,
      }),
    ).toBeTruthy();
  });

  it("rejects malformed signature metadata and protocol identity fields", () => {
    expect(() =>
      enrollmentResponseSchema.parse({
        ...enrollmentDescriptor,
        signatureAlgorithm: "rsa-sha256",
        signatureBase64: base64,
        signerKeyId: "hub-signing-key",
        signerKeyVersion: 1,
      }),
    ).toThrow();

    expect(() =>
      sessionFrameSchema.parse({
        protocolVersion: 1,
        messageType: "sync-request",
        sessionId: "session-01",
        direction: "client-to-hub",
        counter: -1,
        nonceBase64: base64,
        aadHash: "not-a-hash",
        ciphertextBase64: base64,
        tagBase64: base64,
      }),
    ).toThrow();
  });
});
