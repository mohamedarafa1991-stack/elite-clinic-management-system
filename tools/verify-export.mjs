#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createHash, verify } from "node:crypto";

const [manifestPath, payloadPath] = process.argv.slice(2);
if (!manifestPath || !payloadPath) {
  console.error(
    "Usage: node tools/verify-export.mjs <manifest.json> <payload.pdf|payload.fhir.json>",
  );
  process.exit(2);
}

function signingData(manifest) {
  return Buffer.from(
    JSON.stringify({
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

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const payload = readFileSync(payloadPath);
const payloadHash = createHash("sha256").update(payload).digest("hex");
const payloadHashValid = payloadHash === manifest.payloadHash;
const signatureValid = verify(
  null,
  signingData(manifest),
  manifest.publicKeyPem,
  Buffer.from(manifest.signatureBase64, "base64"),
);
let snapshotHashPresent = false;
if (manifest.format === "fhir") {
  const fhir = JSON.parse(payload.toString("utf8"));
  snapshotHashPresent = JSON.stringify(fhir).includes(
    manifest.snapshotPayloadHash,
  );
} else {
  snapshotHashPresent = payload
    .toString("latin1")
    .includes(manifest.snapshotPayloadHash);
}
const result = {
  verified: payloadHashValid && signatureValid && snapshotHashPresent,
  signatureValid,
  payloadHashValid,
  snapshotHashPresent,
  manifestPath,
  payloadPath,
  snapshotId: manifest.snapshotId,
  snapshotPayloadHash: manifest.snapshotPayloadHash,
  payloadHash,
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.verified ? 0 : 1);
