import { readFileSync } from "node:fs";
import { createHash, verify } from "node:crypto";
import { inflateRawSync } from "node:zlib";

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function stableJson(value) {
  return JSON.stringify(value);
}

function signingData(manifest) {
  return Buffer.from(
    stableJson({
      schemaVersion: manifest.schemaVersion,
      packageType: manifest.packageType ?? "detached",
      packageId: manifest.packageId,
      snapshotId: manifest.snapshotId,
      snapshotPayloadHash: manifest.snapshotPayloadHash,
      payloadHash: manifest.payloadHash,
      signatureAlgorithm: manifest.signatureAlgorithm,
      format: manifest.format,
      redactionPolicy: manifest.redactionPolicy,
      exportReason: manifest.exportReason,
      createdAt: manifest.createdAt,
      createdByUserId: manifest.createdByUserId,
      orgIdentifier: manifest.orgIdentifier,
      expiresAt: manifest.expiresAt,
      expirationPolicy: manifest.expirationPolicy,
      fhirValidation: manifest.fhirValidation,
      memberHashes: manifest.memberHashes,
      packageContentHash: manifest.packageContentHash,
    }),
    "utf8",
  );
}

function legacySigningData(manifest) {
  return Buffer.from(
    stableJson({
      schemaVersion: manifest.schemaVersion,
      packageId: manifest.packageId,
      snapshotId: manifest.snapshotId,
      snapshotPayloadHash: manifest.snapshotPayloadHash,
      payloadHash: manifest.payloadHash,
      signatureAlgorithm: manifest.signatureAlgorithm,
      format: manifest.format,
      redactionPolicy: manifest.redactionPolicy,
      exportReason: manifest.exportReason,
      createdAt: manifest.createdAt,
      createdByUserId: manifest.createdByUserId,
    }),
    "utf8",
  );
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function safeName(name) {
  if (
    !name ||
    name.includes("\\") ||
    name.startsWith("/") ||
    name.split("/").some((part) => part === ".." || part === ".")
  ) {
    throw new Error(`Unsafe ZIP member name: ${name}`);
  }
}

function readZip(archive) {
  let endOffset = -1;
  for (
    let offset = archive.length - 22;
    offset >= Math.max(0, archive.length - 0xffff - 22);
    offset -= 1
  ) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0)
    throw new Error("ZIP end-of-central-directory record not found");
  const count = archive.readUInt16LE(endOffset + 10);
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  if (centralOffset + centralSize > archive.length)
    throw new Error("ZIP central directory is outside archive");
  const members = new Map();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error("Invalid ZIP central directory entry");
    const flags = archive.readUInt16LE(cursor + 8);
    const compression = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");
    safeName(name);
    if (flags !== 0 || compression !== 8)
      throw new Error(`Unsupported ZIP encoding for ${name}`);
    if (archive.readUInt32LE(localOffset) !== 0x04034b50)
      throw new Error(`Missing local ZIP header for ${name}`);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(
      dataOffset,
      dataOffset + compressedSize,
    );
    const data = inflateRawSync(compressed);
    if (
      data.length !== uncompressedSize ||
      crc32(data) !== archive.readUInt32LE(cursor + 16)
    )
      throw new Error(`ZIP checksum mismatch for ${name}`);
    if (members.has(name)) throw new Error(`Duplicate ZIP member: ${name}`);
    members.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return members;
}

function loadRevocations(path) {
  if (!path) return new Set();
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.revocations;
  if (!Array.isArray(rows))
    throw new Error(
      "Revocation ledger must be an array or { revocations: [] }",
    );
  return new Set(rows.map((row) => String(row.packageId)));
}

function verifyPayload(manifest, payload, signatureDataCandidates) {
  const payloadHash = sha256(payload);
  const payloadHashValid = payloadHash === manifest.payloadHash;
  const signatureValid = signatureDataCandidates.some((data) =>
    verify(
      null,
      data,
      manifest.publicKeyPem,
      Buffer.from(manifest.signatureBase64, "base64"),
    ),
  );
  const snapshotHashPresent =
    manifest.format === "fhir"
      ? JSON.stringify(JSON.parse(payload.toString("utf8"))).includes(
          manifest.snapshotPayloadHash,
        )
      : payload.toString("latin1").includes(manifest.snapshotPayloadHash);
  return { payloadHash, payloadHashValid, signatureValid, snapshotHashPresent };
}

function verifyZip(zipPath, revocationPath) {
  const archive = readFileSync(zipPath);
  const members = readZip(archive);
  const manifestName = [...members.keys()].find((name) =>
    name.endsWith(".manifest.json"),
  );
  const signatureName = [...members.keys()].find((name) =>
    name.endsWith(".sig"),
  );
  const payloadName = [...members.keys()].find(
    (name) => name.endsWith(".fhir.json") || name.endsWith(".pdf"),
  );
  if (
    !manifestName ||
    !signatureName ||
    !payloadName ||
    !members.has("README.txt")
  )
    throw new Error("ZIP package is missing required members");
  const manifest = JSON.parse(members.get(manifestName).toString("utf8"));
  if (manifest.packageType !== "zip")
    throw new Error("Manifest does not declare a ZIP package");
  if (members.get(signatureName).toString("utf8") !== manifest.signatureBase64)
    throw new Error("Signature member does not match manifest");
  const memberHashes = manifest.memberHashes ?? {};
  const memberHashesValid = Object.entries(memberHashes).every(
    ([name, expected]) =>
      members.has(name) && sha256(members.get(name)) === expected,
  );
  const packageContentHashValid =
    manifest.packageContentHash ===
    sha256(Buffer.from(stableJson(memberHashes), "utf8"));
  const payload = members.get(payloadName);
  const payloadResult = verifyPayload(manifest, payload, [
    signingData(manifest),
  ]);
  const expired = Boolean(
    manifest.expiresAt && Date.parse(manifest.expiresAt) <= Date.now(),
  );
  const ledger = loadRevocations(revocationPath);
  const revoked =
    Boolean(manifest.revokedAt) || ledger.has(String(manifest.packageId));
  const archiveIntegrityValid = memberHashesValid && packageContentHashValid;
  const verified =
    archiveIntegrityValid &&
    payloadResult.payloadHashValid &&
    payloadResult.signatureValid &&
    payloadResult.snapshotHashPresent &&
    !expired &&
    !revoked;
  return {
    verified,
    signatureValid: payloadResult.signatureValid,
    payloadHashValid: payloadResult.payloadHashValid,
    snapshotHashPresent: payloadResult.snapshotHashPresent,
    archiveIntegrityValid,
    expired,
    revoked,
    manifestPath: manifestName,
    payloadPath: payloadName,
    archivePath: zipPath,
    snapshotId: manifest.snapshotId,
    snapshotPayloadHash: manifest.snapshotPayloadHash,
    payloadHash: payloadResult.payloadHash,
    reason: !archiveIntegrityValid
      ? "ZIP member or package-content hash verification failed."
      : revoked
        ? "Package is revoked in the supplied or embedded revocation ledger."
        : expired
          ? "Package is cryptographically valid but expired."
          : verified
            ? "Signed ZIP export is valid and currently trusted."
            : "Export signature, payload hash, or snapshot hash verification failed.",
  };
}

function verifyDetached(manifestPath, payloadPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const payload = readFileSync(payloadPath);
  const candidates = [signingData(manifest)];
  if (!manifest.packageType && manifest.schemaVersion === 1)
    candidates.push(legacySigningData(manifest));
  const payloadResult = verifyPayload(manifest, payload, candidates);
  const expired = Boolean(
    manifest.expiresAt && Date.parse(manifest.expiresAt) <= Date.now(),
  );
  const revoked = Boolean(manifest.revokedAt);
  const verified =
    payloadResult.payloadHashValid &&
    payloadResult.signatureValid &&
    payloadResult.snapshotHashPresent &&
    !expired &&
    !revoked;
  return {
    verified,
    signatureValid: payloadResult.signatureValid,
    payloadHashValid: payloadResult.payloadHashValid,
    snapshotHashPresent: payloadResult.snapshotHashPresent,
    archiveIntegrityValid: false,
    expired,
    revoked,
    manifestPath,
    payloadPath,
    snapshotId: manifest.snapshotId,
    snapshotPayloadHash: manifest.snapshotPayloadHash,
    payloadHash: payloadResult.payloadHash,
    reason: revoked
      ? "Detached export is cryptographically valid but revoked."
      : expired
        ? "Detached export is cryptographically valid but expired."
        : verified
          ? "Detached export is valid and currently trusted."
          : "Export signature, payload hash, or snapshot hash verification failed.",
  };
}

const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2) {
  console.error(
    "Usage: node tools/verify-export.mjs <package.zip> [trusted-revocations.json] OR <manifest.json> <payload.pdf|payload.fhir.json>",
  );
  process.exit(2);
}

try {
  const result = args[0].toLowerCase().endsWith(".zip")
    ? verifyZip(args[0], args[1])
    : verifyDetached(args[0], args[1]);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.verified ? 0 : 1);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Unable to verify export",
  );
  process.exit(1);
}
