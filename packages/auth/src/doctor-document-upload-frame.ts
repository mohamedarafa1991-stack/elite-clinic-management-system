import { createHash } from "node:crypto";
import {
  canonicalJson,
  doctorDocumentUploadMetadataSchema,
  type DoctorDocumentUploadMetadata,
} from "@elite/contracts";

const MAGIC = Buffer.from("ELITE-DOC-UPLOAD-V1", "ascii");
const HEADER_BYTES = MAGIC.length + 4;
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_METADATA_BYTES = 4096;

export interface DoctorDocumentUploadFrame {
  metadata: DoctorDocumentUploadMetadata;
  content: Buffer;
}

export function encodeDoctorDocumentUploadFrame(
  metadata: DoctorDocumentUploadMetadata,
  content: Buffer,
): Buffer {
  const parsed = doctorDocumentUploadMetadataSchema.parse(metadata);
  if (content.length !== parsed.sizeBytes) {
    throw new Error(
      "ELITE_DOCTOR_DOCUMENT_SIZE_MISMATCH: content size does not match metadata",
    );
  }
  const metadataBytes = Buffer.from(canonicalJson(parsed), "utf8");
  if (metadataBytes.length > MAX_METADATA_BYTES) {
    throw new Error("ELITE_DOCTOR_DOCUMENT_METADATA_TOO_LARGE");
  }
  const frame = Buffer.allocUnsafe(
    HEADER_BYTES + metadataBytes.length + content.length,
  );
  MAGIC.copy(frame, 0);
  frame.writeUInt32BE(metadataBytes.length, MAGIC.length);
  metadataBytes.copy(frame, HEADER_BYTES);
  content.copy(frame, HEADER_BYTES + metadataBytes.length);
  metadataBytes.fill(0);
  return frame;
}

export function decodeDoctorDocumentUploadFrame(
  plaintext: Buffer,
): DoctorDocumentUploadFrame {
  if (plaintext.length < HEADER_BYTES) {
    throw new Error("ELITE_DOCTOR_DOCUMENT_UPLOAD_FRAME_INVALID");
  }
  if (!plaintext.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("ELITE_DOCTOR_DOCUMENT_UPLOAD_FRAME_INVALID");
  }
  const metadataLength = plaintext.readUInt32BE(MAGIC.length);
  if (metadataLength <= 0 || metadataLength > MAX_METADATA_BYTES) {
    throw new Error("ELITE_DOCTOR_DOCUMENT_UPLOAD_METADATA_INVALID");
  }
  const contentOffset = HEADER_BYTES + metadataLength;
  if (contentOffset > plaintext.length) {
    throw new Error("ELITE_DOCTOR_DOCUMENT_UPLOAD_FRAME_INVALID");
  }
  const metadataBytes = plaintext.subarray(HEADER_BYTES, contentOffset);
  let metadata: DoctorDocumentUploadMetadata;
  try {
    metadata = doctorDocumentUploadMetadataSchema.parse(
      JSON.parse(metadataBytes.toString("utf8")),
    );
  } catch {
    throw new Error("ELITE_DOCTOR_DOCUMENT_UPLOAD_METADATA_INVALID");
  } finally {
    metadataBytes.fill(0);
  }
  const content = Buffer.from(plaintext.subarray(contentOffset));
  if (
    content.length === 0 ||
    content.length > MAX_DOCUMENT_BYTES ||
    content.length !== metadata.sizeBytes
  ) {
    content.fill(0);
    throw new Error("ELITE_DOCTOR_DOCUMENT_SIZE_INVALID");
  }
  const actualHash = createHash("sha256").update(content).digest("hex");
  if (actualHash !== metadata.contentSha256) {
    content.fill(0);
    throw new Error("ELITE_DOCTOR_DOCUMENT_INTEGRITY_FAILURE");
  }
  return { metadata, content };
}

export function clearDoctorDocumentUploadFrame(
  frame: DoctorDocumentUploadFrame,
): void {
  frame.content.fill(0);
}
