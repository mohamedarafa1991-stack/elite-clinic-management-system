import { createHash, verify } from "node:crypto";
import {
  exportFormatSchema,
  exportRedactionPolicySchema,
  exportVerificationInputSchema,
  exportVerificationResultSchema,
  patientExportInputSchema,
  patientExportPayloadSchema,
  projectionSnapshotSchema,
  signedExportManifestSchema,
  type ExportFormat,
  type ExportRedactionPolicy,
  type ExportVerificationInput,
  type ExportVerificationResult,
  type PatientExportInput,
  type PatientExportPayload,
  type ProjectionSnapshot,
  type SignedExportManifest,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import { requireCapability, type SessionContext } from "./index.js";

export interface ExportSignaturePort {
  sign(data: Buffer): { publicKeyPem: string; signature: Buffer };
}

const FIELD_POLICIES = {
  minimal: {
    includeName: false,
    includeDateOfBirth: false,
    includeSex: false,
    includePhone: false,
    includeNationalId: false,
    includeMedicalHistory: false,
    includeEncounter: true,
  },
  clinical: {
    includeName: true,
    includeDateOfBirth: true,
    includeSex: true,
    includePhone: false,
    includeNationalId: false,
    includeMedicalHistory: true,
    includeEncounter: true,
  },
  full: {
    includeName: true,
    includeDateOfBirth: true,
    includeSex: true,
    includePhone: true,
    includeNationalId: true,
    includeMedicalHistory: true,
    includeEncounter: true,
  },
} as const;

export function exportSigningData(manifest: SignedExportManifest): Buffer {
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

export function hashExportPayload(payload: Buffer): string {
  return createHash("sha256").update(payload).digest("hex");
}

export function verifyExportPackage(
  input: ExportVerificationInput,
): ExportVerificationResult {
  try {
    const parsedInput = exportVerificationInputSchema.parse(input);
    const manifest = signedExportManifestSchema.parse(
      JSON.parse(parsedInput.manifestJson),
    );
    const payload = Buffer.from(parsedInput.payloadBase64, "base64");
    const payloadHashValid =
      hashExportPayload(payload) === manifest.payloadHash;
    const signatureValid = verify(
      null,
      exportSigningData(manifest),
      manifest.publicKeyPem,
      Buffer.from(manifest.signatureBase64, "base64"),
    );
    const decoded = payload.toString("utf8");
    const snapshotHashPresent =
      decoded.includes(manifest.snapshotPayloadHash) ||
      decoded.includes(
        `snapshot-payload-hash\\\":\\\"${manifest.snapshotPayloadHash}`,
      );
    return exportVerificationResultSchema.parse({
      verified: payloadHashValid && signatureValid && snapshotHashPresent,
      signatureValid,
      payloadHashValid,
      snapshotHashPresent,
      reason:
        payloadHashValid && signatureValid && snapshotHashPresent
          ? "Export payload hash, detached signature, and snapshot hash reference are valid."
          : "Export verification failed; inspect payload hash, detached signature, and snapshot hash reference.",
      manifest,
    });
  } catch (error) {
    return exportVerificationResultSchema.parse({
      verified: false,
      signatureValid: false,
      payloadHashValid: false,
      snapshotHashPresent: false,
      reason: error instanceof Error ? error.message : "Invalid export package",
    });
  }
}

export class PatientExportService {
  public constructor(
    private readonly database: EliteDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  public buildPayload(
    context: SessionContext,
    input: PatientExportInput,
  ): PatientExportPayload {
    requireCapability(context, "export.manage");
    const parsed = patientExportInputSchema.parse(input);
    const policy = exportRedactionPolicySchema.parse(parsed.redactionPolicy);
    if (policy === "full") requireCapability(context, "export.sensitive");
    const snapshot = this.getSnapshot(parsed.snapshotId);
    const patient = this.getPatient(snapshot.patientId);
    const history = this.listHistory(snapshot.patientId);
    const fieldPolicy = FIELD_POLICIES[policy];
    const payload = {
      schemaVersion: 1 as const,
      patientId: snapshot.patientId,
      identity: {
        patientId: snapshot.patientId,
        ...(fieldPolicy.includeName
          ? { nameEn: patient["name_en"] ?? undefined }
          : {}),
        ...(fieldPolicy.includeName && patient["name_ar"]
          ? { nameAr: patient["name_ar"] }
          : {}),
        ...(fieldPolicy.includeDateOfBirth && patient["dob"]
          ? { dob: patient["dob"] }
          : {}),
        ...(fieldPolicy.includeSex && patient["sex"]
          ? { sex: patient["sex"] }
          : {}),
        ...(fieldPolicy.includePhone
          ? { phone: patient["phone"] ?? undefined }
          : {}),
        ...(fieldPolicy.includeNationalId && patient["national_id"]
          ? { nationalId: patient["national_id"] }
          : {}),
      },
      medicalHistory: fieldPolicy.includeMedicalHistory ? history : [],
      effectiveEncounter: fieldPolicy.includeEncounter
        ? snapshot.effectiveEncounter
        : {
            ...snapshot.effectiveEncounter,
            subjective: undefined,
            objective: undefined,
            assessment: undefined,
            plan: undefined,
            followUp: undefined,
          },
      redactionPolicy: policy,
      fieldPolicy,
      snapshotId: snapshot.id,
      snapshotPayloadHash: snapshot.payloadHash,
    };
    return patientExportPayloadSchema.parse(payload);
  }

  public buildFhirBundle(
    context: SessionContext,
    input: PatientExportInput,
  ): Buffer {
    const parsed = patientExportInputSchema.parse(input);
    if (exportFormatSchema.parse(parsed.format) !== "fhir") {
      throw new Error(
        "ELITE_EXPORT_FORMAT_MISMATCH: FHIR builder requires fhir format",
      );
    }
    const payload = this.buildPayload(context, parsed);
    const fhir = {
      resourceType: "Bundle",
      type: "document",
      timestamp: this.now(),
      identifier: {
        system: "urn:elite-clinic:projection-snapshot",
        value: payload.snapshotId,
        extension: [
          {
            url: "urn:elite-clinic:snapshot-payload-hash",
            valueString: payload.snapshotPayloadHash,
          },
        ],
      },
      entry: [
        {
          resource: {
            resourceType: "Patient",
            id: payload.patientId,
            ...(payload.identity.nameEn
              ? { name: [{ text: payload.identity.nameEn }] }
              : {}),
            ...(payload.identity.dob
              ? { birthDate: payload.identity.dob }
              : {}),
            ...(payload.identity.sex ? { gender: payload.identity.sex } : {}),
            ...(payload.identity.phone
              ? {
                  telecom: [{ system: "phone", value: payload.identity.phone }],
                }
              : {}),
          },
        },
        {
          resource: {
            resourceType: "ClinicalImpression",
            id: payload.effectiveEncounter.id,
            subject: { reference: `Patient/${payload.patientId}` },
            date: payload.effectiveEncounter.encounterAt,
            description: [
              payload.effectiveEncounter.subjective,
              payload.effectiveEncounter.objective,
              payload.effectiveEncounter.assessment,
              payload.effectiveEncounter.plan,
              payload.effectiveEncounter.followUp,
            ]
              .filter(Boolean)
              .join("\\n"),
            extension: [
              {
                url: "urn:elite-clinic:effective-version",
                valueInteger: payload.effectiveEncounter.effectiveVersion,
              },
              {
                url: "urn:elite-clinic:redaction-policy",
                valueCode: payload.redactionPolicy,
              },
            ],
          },
        },
        ...payload.medicalHistory.map((entry) => ({
          resource: {
            resourceType: "FamilyMemberHistory",
            id: String(entry["id"]),
            patient: { reference: `Patient/${payload.patientId}` },
            name: String(entry["title"] ?? "Medical history"),
            note: [{ text: String(entry["details"] ?? "") }],
          },
        })),
      ],
    };
    return Buffer.from(JSON.stringify(fhir, null, 2), "utf8");
  }

  private getSnapshot(snapshotId: string): ProjectionSnapshot {
    const row = this.database.raw
      .prepare(
        `SELECT s.*, p.patient_id AS patient_display_id
         FROM encounter_projection_snapshots s JOIN patients p ON p.id = s.patient_id
         WHERE s.id = ?`,
      )
      .get(snapshotId) as Record<string, unknown> | undefined;
    if (!row)
      throw new Error(
        "ELITE_PROJECTION_SNAPSHOT_NOT_FOUND: snapshot does not exist",
      );
    const payload = JSON.parse(String(row["effective_payload_json"])) as {
      effectiveEncounter: unknown;
    };
    return projectionSnapshotSchema.parse({
      id: String(row["id"]),
      encounterId: String(row["encounter_id"]),
      patientId: String(row["patient_display_id"]),
      signedEncounterVersion: Number(row["signed_encounter_version"]),
      effectiveVersion: Number(row["effective_version"]),
      appliedAmendmentCount: Number(row["applied_amendment_count"]),
      effectiveEncounter: payload.effectiveEncounter,
      payloadHash: String(row["payload_hash"]),
      exportReason: String(row["export_reason"]),
      createdAt: String(row["created_at"]),
      createdByUserId: String(row["created_by_user_id"]),
    });
  }

  private getPatient(patientId: string): Record<string, string | null> {
    const row = this.database.raw
      .prepare(
        "SELECT patient_id, name_en, name_ar, dob, sex, phone, national_id FROM patients WHERE patient_id = ?",
      )
      .get(patientId) as Record<string, string | null> | undefined;
    if (!row)
      throw new Error("ELITE_PATIENT_NOT_FOUND: patient does not exist");
    return row;
  }

  private listHistory(patientId: string): Array<Record<string, unknown>> {
    const rows = this.database.raw
      .prepare(
        `         SELECT h.id, h.category, h.title, h.details, h.onset_date, h.status, h.source, h.recorded_at

         FROM patient_medical_history h JOIN patients p ON p.id = h.patient_id
         WHERE p.patient_id = ? AND h.status = 'active' ORDER BY h.recorded_at`,
      )
      .all(patientId) as Array<Record<string, unknown>>;
    return rows;
  }
}
