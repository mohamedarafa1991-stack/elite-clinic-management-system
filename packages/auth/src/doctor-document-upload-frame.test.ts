import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  clearDoctorDocumentUploadFrame,
  decodeDoctorDocumentUploadFrame,
  encodeDoctorDocumentUploadFrame,
} from "./doctor-document-upload-frame.js";

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function metadata(content: Buffer) {
  return {
    doctorId: "doctor-synthetic-01",
    documentType: "cv" as const,
    displayName: "Synthetic CV",
    fileName: "synthetic-cv.pdf",
    mimeType: "application/pdf" as const,
    sizeBytes: content.length,
    contentSha256: sha256(content),
  };
}

describe("doctor document upload binary frame", () => {
  it("round-trips canonical metadata and mutable content", () => {
    const content = Buffer.from("synthetic upload bytes");
    const frame = encodeDoctorDocumentUploadFrame(metadata(content), content);
    const decoded = decodeDoctorDocumentUploadFrame(frame);

    expect(decoded.metadata).toEqual(metadata(content));
    expect(decoded.content).toEqual(content);
    clearDoctorDocumentUploadFrame(decoded);
    expect(decoded.content.equals(Buffer.alloc(content.length))).toBe(true);
  });

  it("rejects content size and hash mismatches before service use", () => {
    const content = Buffer.from("synthetic upload bytes");
    expect(() =>
      encodeDoctorDocumentUploadFrame(
        { ...metadata(content), sizeBytes: content.length + 1 },
        content,
      ),
    ).toThrow("ELITE_DOCTOR_DOCUMENT_SIZE_MISMATCH");
    expect(() =>
      decodeDoctorDocumentUploadFrame(
        encodeDoctorDocumentUploadFrame(
          { ...metadata(content), contentSha256: "a".repeat(64) },
          content,
        ),
      ),
    ).toThrow("ELITE_DOCTOR_DOCUMENT_INTEGRITY_FAILURE");
  });

  it("rejects a truncated or non-binary frame", () => {
    const content = Buffer.from("synthetic upload bytes");
    const frame = encodeDoctorDocumentUploadFrame(metadata(content), content);
    expect(() => decodeDoctorDocumentUploadFrame(frame.subarray(0, 8))).toThrow(
      "ELITE_DOCTOR_DOCUMENT_UPLOAD_FRAME_INVALID",
    );
    expect(() =>
      decodeDoctorDocumentUploadFrame(Buffer.from('{"request":{}}')),
    ).toThrow("ELITE_DOCTOR_DOCUMENT_UPLOAD_FRAME_INVALID");
  });
});
