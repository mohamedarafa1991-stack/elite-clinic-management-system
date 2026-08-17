import {
  createHash,
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";
import {
  canonicalJson,
  enrollmentAcknowledgmentSchema,
  enrollmentChallengeSchema,
  enrollmentDeviceRequestSchema,
  enrollmentResponseSchema,
  sessionGrantSchema,
  sessionInitRequestSchema,
  type EnrollmentAcknowledgment,
  type EnrollmentChallenge,
  type EnrollmentDeviceRequest,
  type EnrollmentResponse,
  type SessionGrant,
  type SessionInitRequest,
} from "@elite/contracts";

const SIGNATURE_FIELDS = new Set([
  "deviceSignatureAlgorithm",
  "deviceSignatureBase64",
  "signatureAlgorithm",
  "signatureBase64",
  "signerKeyId",
  "signerKeyVersion",
]);

function removeFields(
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !fields.has(key)),
  );
}

function descriptorBytes(value: Record<string, unknown>): Buffer {
  return Buffer.from(canonicalJson(value), "utf8");
}

export function sha256Hex(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalDescriptorHash(
  descriptor: Record<string, unknown>,
): string {
  return sha256Hex(descriptorBytes(descriptor));
}

export function signingDescriptorHash(
  descriptor: Record<string, unknown>,
): string {
  return canonicalDescriptorHash(removeFields(descriptor, SIGNATURE_FIELDS));
}

function hashExcludingSelf(
  descriptor: Record<string, unknown>,
  selfField: string,
): string {
  const withoutSelf = removeFields(descriptor, SIGNATURE_FIELDS);
  delete withoutSelf[selfField];
  return canonicalDescriptorHash(withoutSelf);
}

function parseSpkiBase64(value: string): KeyObject {
  return createPublicKey({
    key: Buffer.from(value, "base64"),
    format: "der",
    type: "spki",
  });
}

function requireFreshWindow(
  issuedAt: string,
  validUntil: string,
  now: string,
): void {
  const issued = Date.parse(issuedAt);
  const until = Date.parse(validUntil);
  const current = Date.parse(now);
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(until) ||
    !Number.isFinite(current)
  ) {
    throw new Error("ELITE_STEP22_TIMESTAMP_INVALID");
  }
  if (until < issued) {
    throw new Error("ELITE_STEP22_VALIDITY_WINDOW_INVALID");
  }
  if (current > until) {
    throw new Error("ELITE_STEP22_MESSAGE_EXPIRED");
  }
}

function verifyHubSignature(
  value: Record<string, unknown>,
  publicKeyPem: string,
  signatureBase64: string,
): void {
  const valid = verifySignature(
    null,
    descriptorBytes(removeFields(value, SIGNATURE_FIELDS)),
    publicKeyPem,
    Buffer.from(signatureBase64, "base64"),
  );
  if (!valid) {
    throw new Error("ELITE_STEP22_HUB_SIGNATURE_INVALID");
  }
}

function verifyDeviceSignature(
  descriptor: Record<string, unknown>,
  publicKeySpkiBase64: string,
  signatureBase64: string,
): void {
  const valid = verifySignature(
    "sha256",
    descriptorBytes(removeFields(descriptor, SIGNATURE_FIELDS)),
    parseSpkiBase64(publicKeySpkiBase64),
    Buffer.from(signatureBase64, "base64"),
  );
  if (!valid) {
    throw new Error("ELITE_STEP22_DEVICE_SIGNATURE_INVALID");
  }
}

export function verifyEnrollmentChallenge(
  value: EnrollmentChallenge,
  trustedHubPublicKeyPem: string,
  now: string,
): EnrollmentChallenge {
  const parsed = enrollmentChallengeSchema.parse(value);
  const descriptor = parsed as unknown as Record<string, unknown>;
  if (parsed.responseHash !== hashExcludingSelf(descriptor, "responseHash")) {
    throw new Error("ELITE_STEP22_CHALLENGE_HASH_INVALID");
  }
  requireFreshWindow(parsed.issuedAt, parsed.expiresAt, now);
  verifyHubSignature(
    descriptor,
    trustedHubPublicKeyPem,
    parsed.signatureBase64,
  );
  return parsed;
}

export function verifyEnrollmentDeviceRequest(
  value: EnrollmentDeviceRequest,
): EnrollmentDeviceRequest {
  const parsed = enrollmentDeviceRequestSchema.parse(value);
  const descriptor = parsed as unknown as Record<string, unknown>;
  const publicKeyBytes = Buffer.from(
    parsed.devicePublicKeySpkiBase64,
    "base64",
  );
  if (sha256Hex(publicKeyBytes) !== parsed.devicePublicKeyFingerprint) {
    throw new Error("ELITE_STEP22_DEVICE_KEY_FINGERPRINT_INVALID");
  }
  verifyDeviceSignature(
    descriptor,
    parsed.devicePublicKeySpkiBase64,
    parsed.deviceSignatureBase64,
  );
  return parsed;
}

export function verifyEnrollmentResponse(
  value: EnrollmentResponse,
  trustedHubPublicKeyPem: string,
  expectedOrganizationId: string,
  expectedDeviceId: string,
  expectedChallengeId: string,
  expectedResponseNonce: string,
  expectedDeviceKeyFingerprint: string,
  now: string,
): EnrollmentResponse {
  const parsed = enrollmentResponseSchema.parse(value);
  if (parsed.organizationId !== expectedOrganizationId) {
    throw new Error("ELITE_STEP22_ORGANIZATION_MISMATCH");
  }
  if (parsed.deviceId !== expectedDeviceId) {
    throw new Error("ELITE_STEP22_DEVICE_MISMATCH");
  }
  if (parsed.challengeId !== expectedChallengeId) {
    throw new Error("ELITE_STEP22_CHALLENGE_MISMATCH");
  }
  if (parsed.responseNonce !== expectedResponseNonce) {
    throw new Error("ELITE_STEP22_RESPONSE_NONCE_MISMATCH");
  }
  if (parsed.devicePublicKeyFingerprint !== expectedDeviceKeyFingerprint) {
    throw new Error("ELITE_STEP22_DEVICE_KEY_MISMATCH");
  }
  const descriptor = parsed as unknown as Record<string, unknown>;
  if (parsed.responseHash !== hashExcludingSelf(descriptor, "responseHash")) {
    throw new Error("ELITE_STEP22_RESPONSE_HASH_INVALID");
  }
  requireFreshWindow(parsed.issuedAt, parsed.expiresAt, now);
  if (Date.parse(parsed.offlineAccessUntil) < Date.parse(parsed.issuedAt)) {
    throw new Error("ELITE_STEP22_OFFLINE_EXPIRY_INVALID");
  }
  verifyHubSignature(
    descriptor,
    trustedHubPublicKeyPem,
    parsed.signatureBase64,
  );
  return parsed;
}

export function verifyEnrollmentAcknowledgment(
  value: EnrollmentAcknowledgment,
  devicePublicKeySpkiBase64: string,
): EnrollmentAcknowledgment {
  const parsed = enrollmentAcknowledgmentSchema.parse(value);
  verifyDeviceSignature(
    parsed as unknown as Record<string, unknown>,
    devicePublicKeySpkiBase64,
    parsed.deviceSignatureBase64,
  );
  return parsed;
}

export function verifySessionInit(
  value: SessionInitRequest,
  devicePublicKeySpkiBase64: string,
): SessionInitRequest {
  const parsed = sessionInitRequestSchema.parse(value);
  verifyDeviceSignature(
    parsed as unknown as Record<string, unknown>,
    devicePublicKeySpkiBase64,
    parsed.deviceSignatureBase64,
  );
  return parsed;
}

export function verifySessionGrant(
  value: SessionGrant,
  trustedHubPublicKeyPem: string,
  expectedOrganizationId: string,
  expectedDeviceId: string,
  expectedSessionId: string,
  expectedRequestNonce: string,
  now: string,
): SessionGrant {
  const parsed = sessionGrantSchema.parse(value);
  if (parsed.organizationId !== expectedOrganizationId) {
    throw new Error("ELITE_STEP22_ORGANIZATION_MISMATCH");
  }
  if (parsed.deviceId !== expectedDeviceId) {
    throw new Error("ELITE_STEP22_DEVICE_MISMATCH");
  }
  if (parsed.sessionId !== expectedSessionId) {
    throw new Error("ELITE_STEP22_SESSION_MISMATCH");
  }
  if (parsed.requestNonce !== expectedRequestNonce) {
    throw new Error("ELITE_STEP22_REQUEST_NONCE_MISMATCH");
  }
  requireFreshWindow(parsed.issuedAt, parsed.validUntil, now);
  verifyHubSignature(
    parsed as unknown as Record<string, unknown>,
    trustedHubPublicKeyPem,
    parsed.signatureBase64,
  );
  return parsed;
}
