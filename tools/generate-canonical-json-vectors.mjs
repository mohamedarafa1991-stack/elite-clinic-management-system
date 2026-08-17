import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || !Number.isFinite(value)) {
      throw new Error("vectors only support finite safe integers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error(`unsupported type ${typeof value}`);
}

const vectors = [
  {
    id: "object-key-order-and-nesting",
    purpose: "Sort object keys recursively while retaining array order.",
    input: {
      zulu: 0,
      alpha: 42,
      nested: { beta: true, alpha: null },
      unicodeKeys: { "😀": "emoji", é: "accent", e: "plain", z: "last" },
      list: [3, { zulu: "last", alpha: "first" }],
    },
  },
  {
    id: "unicode-escaping-and-boundaries",
    purpose:
      "Preserve Unicode and escape quotes, backslashes, and line breaks consistently.",
    input: {
      clinic: "ايليت Clinic",
      quote: 'A "synthetic" record',
      slash: "C:\\Elite\\Clinic",
      line: "first\nsecond",
      empty: "",
      negative: -7,
      enabled: false,
      absent: undefined,
    },
  },
  {
    id: "numeric-safe-integer-boundaries",
    purpose:
      "Keep exact integers at the JavaScript safe-integer boundary consistent with Kotlin Long parsing.",
    input: {
      maxSafeInteger: 9007199254740991,
      minSafeInteger: -9007199254740991,
      zero: 0,
      negativeOne: -1,
    },
  },
  {
    id: "appointment-payload",
    purpose: "Hash a minimum-necessary appointment synchronization payload.",
    input: {
      appointmentId: "appointment-001",
      patientId: "EL-00001",
      departmentId: "department-general",
      doctorId: "user-doctor-01",
      scheduledStart: "2026-08-17T09:00:00.000Z",
      scheduledEnd: "2026-08-17T09:15:00.000Z",
      status: "scheduled",
      visitType: "new",
      isWalkIn: false,
    },
  },
  {
    id: "enrollment-response-descriptor",
    purpose:
      "Canonicalize the signed Admin-approved enrollment response descriptor.",
    input: {
      protocolVersion: 1,
      schemaVersion: 1,
      enrollmentId: "enrollment-01",
      organizationId: "org-elite-cairo",
      deviceId: "android-device-01",
      userId: "user-nurse-01",
      role: "nurse",
      deviceName: "Front Desk Android",
      devicePublicKeyFingerprint:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      policyVersion: 1,
      allowedScopes: ["appointments", "patient-summary"],
      issuedAt: "2026-08-17T09:00:00.000Z",
      expiresAt: "2026-08-18T09:00:00.000Z",
      offlineAccessUntil: "2026-09-16T09:00:00.000Z",
    },
  },
  {
    id: "session-initiation-descriptor",
    purpose:
      "Canonicalize the signed session initiation transcript binding identity, keys, and nonces.",
    input: {
      protocolVersion: 1,
      organizationId: "org-elite-cairo",
      enrollmentId: "enrollment-01",
      deviceId: "android-device-01",
      userId: "user-nurse-01",
      sessionId: "session-01",
      requestNonce: "0123456789abcdef0123456789abcdef",
      deviceIdentityKeyFingerprint:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      deviceEphemeralKeyFingerprint:
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      serverEphemeralKeyFingerprint:
        "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      clientCounter: 0,
      issuedAt: "2026-08-17T09:01:00.000Z",
      validUntil: "2026-08-17T09:06:00.000Z",
    },
  },
];

const output = vectors.map(({ id, purpose, input }) => {
  const canonical = canonicalJson(input);
  return {
    id,
    purpose,
    input,
    canonical,
    sha256: createHash("sha256").update(canonical, "utf8").digest("hex"),
  };
});

const outputPath = new URL(
  "../test-vectors/canonical-json-vectors.json",
  import.meta.url,
);
await mkdir(new URL("../test-vectors/", import.meta.url), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify({ canonicalJsonVersion: 1, vectors: output }, null, 2)}\n`,
);
