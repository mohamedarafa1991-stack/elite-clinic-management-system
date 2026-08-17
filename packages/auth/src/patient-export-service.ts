import { createHash, sign, verify } from "node:crypto";
import { nanoid } from "nanoid";
import {
  exportExpirationPolicySchema,
  exportFormatSchema,
  exportRedactionPolicySchema,
  exportRevocationSchema,
  exportVerificationInputSchema,
  exportVerificationResultSchema,
  exportZipPackageSchema,
  fhirValidationResultSchema,
  isoDateTimeSchema,
  orgIdentifierSchema,
  orgSettingsInputSchema,
  orgSettingsSchema,
  patientExportInputSchema,
  patientExportPayloadSchema,
  projectionSnapshotSchema,
  signedExportManifestSchema,
  type ExportFormat,
  type ExportRedactionPolicy,
  type ExportRevocation,
  type ExportVerificationInput,
  type ExportVerificationResult,
  type ExportZipPackage,
  type FhirValidationResult,
  type OrgIdentifier,
  type OrgSettings,
  type OrgSettingsInput,
  type PatientExportInput,
  type PatientExportPayload,
  type ProjectionSnapshot,
  type SignedExportManifest,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import { requireCapability, type SessionContext } from "./index.js";
import {
  createDeterministicZip,
  readDeterministicZip,
  type ZipMember,
} from "./zip-utils.js";

export interface ExportSignaturePort {
  sign(data: Buffer): { publicKeyPem: string; signature: Buffer };
}

export interface ZipExportBuildResult {
  archive: Buffer;
  package: ExportZipPackage;
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

const FHIR_VALIDATOR_VERSION = "elite-fhir-r4-1";
const FHIR_PROFILE_IDS = [
  "http://hl7.org/fhir/StructureDefinition/Bundle",
  "http://hl7.org/fhir/StructureDefinition/Patient",
  "http://hl7.org/fhir/StructureDefinition/ClinicalImpression",
  "http://hl7.org/fhir/StructureDefinition/FamilyMemberHistory",
  "urn:elite-clinic:fhir-profile:patient-record-document-r4",
] as const;

const DEFAULT_ORG_IDENTIFIER: OrgIdentifier = {
  clinicNameEn: "Elite Clinic Management System",
  countryCode: "EG",
  oid: "1.3.6.1.4.1.99999.1",
  fhirSystemUrl: "https://fhir.elite-clinic.local",
};

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function fhirResourceId(value: string): string {
  return value.replace(/[^A-Za-z0-9.-]/g, "-").slice(0, 64) || "resource";
}

export function exportSigningData(manifest: SignedExportManifest): Buffer {
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

export function hashExportPayload(payload: Buffer): string {
  return createHash("sha256").update(payload).digest("hex");
}

export function verifyExportPackage(
  input: ExportVerificationInput,
  now: () => string = () => new Date().toISOString(),
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
    const expired = Boolean(
      manifest.expiresAt && Date.parse(manifest.expiresAt) <= Date.parse(now()),
    );
    const revoked = Boolean(manifest.revokedAt);
    const cryptographicallyValid =
      payloadHashValid && signatureValid && snapshotHashPresent;
    const verified = cryptographicallyValid && !expired && !revoked;
    return exportVerificationResultSchema.parse({
      verified,
      signatureValid,
      payloadHashValid,
      snapshotHashPresent,
      archiveIntegrityValid: false,
      expired,
      revoked,
      reason: verified
        ? "Export payload hash, detached signature, snapshot hash reference, and current validity are valid."
        : expired
          ? "Export verification succeeded cryptographically but the export has expired."
          : revoked
            ? "Export verification succeeded cryptographically but the export is revoked."
            : "Export verification failed; inspect payload hash, detached signature, and snapshot hash reference.",
      manifest,
    });
  } catch (error) {
    return exportVerificationResultSchema.parse({
      verified: false,
      signatureValid: false,
      payloadHashValid: false,
      snapshotHashPresent: false,
      archiveIntegrityValid: false,
      expired: false,
      revoked: false,
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

  public validateFhirBundle(bundle: unknown): FhirValidationResult {
    const issues: FhirValidationResult["issues"] = [];
    const issue = (
      severity: "error" | "warning",
      path: string,
      code: string,
      message: string,
    ) => issues.push({ severity, path, code, message });
    const isObject = (value: unknown): value is Record<string, unknown> =>
      typeof value === "object" && value !== null && !Array.isArray(value);
    const isValidDateTime = (value: unknown): boolean =>
      typeof value === "string" && isoDateTimeSchema.safeParse(value).success;
    const isValidId = (value: unknown): boolean =>
      typeof value === "string" && /^[A-Za-z0-9.-]{1,64}$/.test(value);

    if (!isObject(bundle)) {
      issue("error", "$", "invalid-type", "FHIR Bundle must be a JSON object.");
      return fhirValidationResultSchema.parse({
        valid: false,
        fhirVersion: "R4",
        validatorVersion: FHIR_VALIDATOR_VERSION,
        profileIds: [...FHIR_PROFILE_IDS],
        issues,
      });
    }
    if (bundle["resourceType"] !== "Bundle") {
      issue(
        "error",
        "$.resourceType",
        "required-value",
        "resourceType must be Bundle.",
      );
    }
    if (bundle["type"] !== "document") {
      issue(
        "error",
        "$.type",
        "invalid-value",
        "Document export Bundle type must be document.",
      );
    }
    if (!isValidDateTime(bundle["timestamp"])) {
      issue(
        "error",
        "$.timestamp",
        "invalid-datetime",
        "Bundle timestamp must be an ISO-8601 date-time with offset.",
      );
    }
    const identifier = bundle["identifier"];
    if (!isObject(identifier)) {
      issue(
        "error",
        "$.identifier",
        "required",
        "Document Bundle identifier is required.",
      );
    } else {
      if (
        typeof identifier["system"] !== "string" ||
        identifier["system"].length === 0
      ) {
        issue(
          "error",
          "$.identifier.system",
          "required",
          "Bundle identifier system is required.",
        );
      }
      if (
        typeof identifier["value"] !== "string" ||
        identifier["value"].length === 0
      ) {
        issue(
          "error",
          "$.identifier.value",
          "required",
          "Bundle identifier value is required.",
        );
      }
    }
    const entries = bundle["entry"];
    if (!Array.isArray(entries) || entries.length === 0) {
      issue(
        "error",
        "$.entry",
        "required",
        "Document Bundle must contain at least one entry.",
      );
    }

    const resources = new Map<string, Record<string, unknown>>();
    if (Array.isArray(entries)) {
      entries.forEach((entry, index) => {
        const entryPath = `$.entry[${index}]`;
        if (!isObject(entry) || !isObject(entry["resource"])) {
          issue(
            "error",
            `${entryPath}.resource`,
            "required",
            "Bundle entry resource is required.",
          );
          return;
        }
        const resource = entry["resource"];
        const resourceType = resource["resourceType"];
        const resourceId = resource["id"];
        if (typeof resourceType !== "string") {
          issue(
            "error",
            `${entryPath}.resource.resourceType`,
            "required",
            "FHIR resourceType is required.",
          );
        }
        if (!isValidId(resourceId)) {
          issue(
            "error",
            `${entryPath}.resource.id`,
            "invalid-id",
            "FHIR resource id must use the R4 id format.",
          );
        } else if (typeof resourceType === "string") {
          const key = `${resourceType}/${resourceId}`;
          if (resources.has(key)) {
            issue(
              "error",
              `${entryPath}.resource.id`,
              "duplicate-id",
              `Duplicate resource ${key}.`,
            );
          }
          resources.set(key, resource);
        }
        if (resourceType === "Patient") {
          if (!isValidId(resourceId))
            issue(
              "error",
              `${entryPath}.resource.id`,
              "required",
              "Patient.id is required.",
            );
          if (
            resource["birthDate"] !== undefined &&
            (typeof resource["birthDate"] !== "string" ||
              !/^\d{4}-\d{2}-\d{2}$/.test(resource["birthDate"]))
          ) {
            issue(
              "error",
              `${entryPath}.resource.birthDate`,
              "invalid-date",
              "Patient.birthDate must be YYYY-MM-DD.",
            );
          }
          if (
            resource["gender"] !== undefined &&
            !["male", "female", "other", "unknown"].includes(
              String(resource["gender"]),
            )
          ) {
            issue(
              "error",
              `${entryPath}.resource.gender`,
              "invalid-code",
              "Patient.gender must be a valid R4 administrative gender code.",
            );
          }
        } else if (resourceType === "ClinicalImpression") {
          if (!isValidId(resourceId))
            issue(
              "error",
              `${entryPath}.resource.id`,
              "required",
              "ClinicalImpression.id is required.",
            );
          const subject = resource["subject"];
          if (
            !isObject(subject) ||
            typeof subject["reference"] !== "string" ||
            !subject["reference"].startsWith("Patient/")
          ) {
            issue(
              "error",
              `${entryPath}.resource.subject`,
              "required-reference",
              "ClinicalImpression.subject must reference a Patient.",
            );
          }
          if (!isValidDateTime(resource["date"]))
            issue(
              "error",
              `${entryPath}.resource.date`,
              "invalid-datetime",
              "ClinicalImpression.date must be an ISO-8601 date-time with offset.",
            );
        } else if (resourceType === "FamilyMemberHistory") {
          if (!isValidId(resourceId))
            issue(
              "error",
              `${entryPath}.resource.id`,
              "required",
              "FamilyMemberHistory.id is required.",
            );
          const patient = resource["patient"];
          if (
            !isObject(patient) ||
            typeof patient["reference"] !== "string" ||
            !patient["reference"].startsWith("Patient/")
          ) {
            issue(
              "error",
              `${entryPath}.resource.patient`,
              "required-reference",
              "FamilyMemberHistory.patient must reference a Patient.",
            );
          }
          if (
            typeof resource["name"] !== "string" ||
            resource["name"].length === 0
          ) {
            issue(
              "error",
              `${entryPath}.resource.name`,
              "required",
              "FamilyMemberHistory.name is required for this export profile.",
            );
          }
        } else if (
          resourceType !== "Patient" &&
          resourceType !== "ClinicalImpression" &&
          resourceType !== "FamilyMemberHistory"
        ) {
          issue(
            "error",
            `${entryPath}.resource.resourceType`,
            "unsupported-resource",
            `Resource type ${String(resourceType)} is not supported by this export profile.`,
          );
        }
      });
    }

    const patientIds = [...resources.keys()].filter((key) =>
      key.startsWith("Patient/"),
    );
    if (patientIds.length !== 1) {
      issue(
        "error",
        "$.entry",
        "patient-cardinality",
        "The export profile requires exactly one Patient resource.",
      );
    }
    const patientReference = patientIds[0];
    if (patientReference && Array.isArray(entries)) {
      entries.forEach((entry, index) => {
        if (!isObject(entry) || !isObject(entry["resource"])) return;
        const resource = entry["resource"];
        if (
          resource["resourceType"] === "ClinicalImpression" ||
          resource["resourceType"] === "FamilyMemberHistory"
        ) {
          const referenceField =
            resource["resourceType"] === "ClinicalImpression"
              ? "subject"
              : "patient";
          const reference = resource[referenceField];
          if (
            isObject(reference) &&
            reference["reference"] !== patientReference
          ) {
            issue(
              "error",
              `$.entry[${index}].resource.${referenceField}.reference`,
              "reference-target",
              "Resource reference must target the Bundle Patient resource.",
            );
          }
        }
      });
    }

    return fhirValidationResultSchema.parse({
      valid: !issues.some((entry) => entry.severity === "error"),
      fhirVersion: "R4",
      validatorVersion: FHIR_VALIDATOR_VERSION,
      profileIds: [...FHIR_PROFILE_IDS],
      issues,
    });
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
    const org = this.getOrgSettingsInternal(context.userId);
    const fhir = this.buildFhirBundleObject(payload, org.fhirSystemUrl);
    const validation = this.validateFhirBundle(fhir);
    if (!validation.valid) {
      throw new Error(
        `ELITE_FHIR_VALIDATION_FAILED: ${validation.issues.map((entry) => `${entry.path} ${entry.message}`).join("; ")}`,
      );
    }
    return Buffer.from(JSON.stringify(fhir, null, 2), "utf8");
  }

  public buildZipPackage(
    context: SessionContext,
    input: PatientExportInput,
    payloadBytes: Buffer,
  ): ZipExportBuildResult {
    requireCapability(context, "export.manage");
    const parsed = patientExportInputSchema.parse(input);
    const payload = this.buildPayload(context, parsed);
    const org = this.getOrgSettingsInternal(context.userId);
    let fhirValidation: FhirValidationResult | undefined;
    if (parsed.format === "fhir") {
      let parsedFhir: unknown;
      try {
        parsedFhir = JSON.parse(payloadBytes.toString("utf8"));
      } catch {
        throw new Error(
          "ELITE_FHIR_VALIDATION_FAILED: FHIR payload is not valid JSON",
        );
      }
      fhirValidation = this.validateFhirBundle(parsedFhir);
      if (!fhirValidation.valid) {
        throw new Error(
          `ELITE_FHIR_VALIDATION_FAILED: ${fhirValidation.issues.map((entry) => `${entry.path} ${entry.message}`).join("; ")}`,
        );
      }
    }
    const packageId = nanoid(18);
    const createdAt = this.now();
    const expiresAt = new Date(
      Date.parse(createdAt) + org.exportExpirationDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const payloadFileName = `${payload.patientId}.${parsed.format === "fhir" ? "fhir.json" : "pdf"}`;
    const manifestFileName = `${payload.patientId}.manifest.json`;
    const signatureFileName = `${payload.patientId}.sig`;
    const readmeFileName = "README.txt";
    const readme = Buffer.from(
      [
        "Elite Clinic signed clinical export package",
        `Package ID: ${packageId}`,
        `Patient ID: ${payload.patientId}`,
        `Format: ${parsed.format.toUpperCase()}`,
        `Redaction policy: ${parsed.redactionPolicy}`,
        `Created at: ${createdAt}`,
        `Expires at: ${expiresAt}`,
        "The archive is cryptographically signed. Verify it before clinical use.",
        "Revocation status requires the originating clinic's trusted revocation ledger.",
      ].join("\n") + "\n",
      "utf8",
    );
    const memberHashes = {
      [payloadFileName]: hashExportPayload(payloadBytes),
      [readmeFileName]: hashExportPayload(readme),
    };
    const packageContentHash = hashExportPayload(
      Buffer.from(stableJson(memberHashes), "utf8"),
    );
    const signingManifest = signedExportManifestSchema.parse({
      schemaVersion: 2,
      packageType: "zip",
      packageId,
      snapshotId: payload.snapshotId,
      snapshotPayloadHash: payload.snapshotPayloadHash,
      payloadHash: hashExportPayload(payloadBytes),
      signatureAlgorithm: "ed25519",
      publicKeyPem: "pending-public-key-".padEnd(64, "-"),
      signatureBase64: "pending-signature",
      format: parsed.format,
      redactionPolicy: parsed.redactionPolicy,
      exportReason: parsed.exportReason,
      createdAt,
      createdByUserId: context.userId,
      orgIdentifier: org,
      expiresAt,
      expirationPolicy:
        org.exportExpirationDays === 30 ? "30-days" : "custom-days",
      fhirValidation,
      memberHashes,
      packageContentHash,
    });
    const signer = this.signaturePort;
    const signed = signer.sign(exportSigningData(signingManifest));
    const manifest = signedExportManifestSchema.parse({
      ...signingManifest,
      publicKeyPem: signed.publicKeyPem,
      signatureBase64: signed.signature.toString("base64"),
    });
    const members: ZipMember[] = [
      { name: payloadFileName, data: payloadBytes },
      {
        name: manifestFileName,
        data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
      },
      {
        name: signatureFileName,
        data: Buffer.from(manifest.signatureBase64, "utf8"),
      },
      { name: readmeFileName, data: readme },
    ];
    const archive = createDeterministicZip(members);
    const archiveFileName = `${payload.patientId}.${packageId}.zip`;
    const metadata = exportZipPackageSchema.parse({
      packageId,
      archiveFileName,
      manifest,
      memberNames: members.map((member) => member.name),
      archivePath: archiveFileName,
    });
    return { archive, package: metadata };
  }

  public verifyZipPackage(archive: Buffer): ExportVerificationResult {
    try {
      const members = readDeterministicZip(archive);
      const memberMap = new Map(
        members.map((member) => [member.name, member.data]),
      );
      const manifestName = members.find((member) =>
        member.name.endsWith(".manifest.json"),
      )?.name;
      const signatureName = members.find((member) =>
        member.name.endsWith(".sig"),
      )?.name;
      const payloadName = members.find(
        (member) =>
          member.name.endsWith(".fhir.json") || member.name.endsWith(".pdf"),
      )?.name;
      const readmeName = "README.txt";
      if (
        !manifestName ||
        !signatureName ||
        !payloadName ||
        !memberMap.has(readmeName)
      ) {
        throw new Error(
          "ELITE_EXPORT_ZIP_INVALID: required archive members are missing",
        );
      }
      const manifest = signedExportManifestSchema.parse(
        JSON.parse(memberMap.get(manifestName)!.toString("utf8")),
      );
      if (manifest.packageType !== "zip")
        throw new Error(
          "ELITE_EXPORT_ZIP_INVALID: manifest is not a ZIP package",
        );
      if (
        memberMap.get(signatureName)!.toString("utf8") !==
        manifest.signatureBase64
      ) {
        throw new Error(
          "ELITE_EXPORT_ZIP_INVALID: detached signature member does not match manifest",
        );
      }
      const memberHashes = manifest.memberHashes ?? {};
      const memberHashesValid = Object.entries(memberHashes).every(
        ([name, expected]) => {
          const data = memberMap.get(name);
          return Boolean(data) && hashExportPayload(data!) === expected;
        },
      );
      const contentHashValid =
        manifest.packageContentHash ===
        hashExportPayload(Buffer.from(stableJson(memberHashes), "utf8"));
      const base = verifyExportPackage(
        {
          manifestJson: JSON.stringify(manifest),
          payloadBase64: memberMap.get(payloadName)!.toString("base64"),
        },
        this.now,
      );
      const revocation = this.findRevocation(manifest.packageId);
      const revoked = Boolean(revocation) || base.revoked;
      const archiveIntegrityValid = memberHashesValid && contentHashValid;
      const verified = base.verified && archiveIntegrityValid && !revoked;
      return exportVerificationResultSchema.parse({
        ...base,
        verified,
        archiveIntegrityValid,
        revoked,
        revocation: revocation ?? undefined,
        reason: !archiveIntegrityValid
          ? "ZIP archive member hashes or package content hash are invalid."
          : revoked
            ? "ZIP package is revoked in the originating clinic ledger."
            : base.reason,
      });
    } catch (error) {
      return exportVerificationResultSchema.parse({
        verified: false,
        signatureValid: false,
        payloadHashValid: false,
        snapshotHashPresent: false,
        archiveIntegrityValid: false,
        expired: false,
        revoked: false,
        reason:
          error instanceof Error ? error.message : "Invalid ZIP export package",
      });
    }
  }

  public revokeExport(
    context: SessionContext,
    packageId: string,
    reason: string,
  ): ExportRevocation {
    requireCapability(context, "export.revoke");
    const normalizedPackageId = packageId.trim();
    const normalizedReason = reason.trim();
    if (normalizedPackageId.length < 8)
      throw new Error(
        "ELITE_EXPORT_REVOCATION_PACKAGE_INVALID: package ID is invalid",
      );
    if (normalizedReason.length < 3 || normalizedReason.length > 1000)
      throw new Error(
        "ELITE_EXPORT_REVOCATION_REASON_INVALID: reason must be 3-1000 characters",
      );
    const existing = this.findRevocation(normalizedPackageId);
    if (existing)
      throw new Error(
        "ELITE_EXPORT_ALREADY_REVOKED: export package is already revoked",
      );
    const revocationId = nanoid(18);
    const auditEventId = nanoid(18);
    const revokedAt = this.now();
    const transaction = this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          "INSERT INTO audit_events (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?)",
        )
        .run(
          auditEventId,
          context.userId,
          context.deviceId,
          "export.revoked",
          "export-package",
          normalizedPackageId,
          JSON.stringify({ reason: normalizedReason, revocationId }),
          revokedAt,
        );
      this.database.raw
        .prepare(
          "INSERT INTO export_revocations (id, package_id, reason, revoked_at, revoked_by_user_id, audit_event_id) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          revocationId,
          normalizedPackageId,
          normalizedReason,
          revokedAt,
          context.userId,
          auditEventId,
        );
    });
    transaction();
    return exportRevocationSchema.parse({
      id: revocationId,
      packageId: normalizedPackageId,
      reason: normalizedReason,
      revokedByUserId: context.userId,
      revokedAt,
      auditEventId,
    });
  }

  public listRevocations(context: SessionContext): readonly ExportRevocation[] {
    requireCapability(context, "export.revoke");
    return this.database.raw
      .prepare(
        "SELECT id, package_id, reason, revoked_by_user_id, revoked_at, audit_event_id FROM export_revocations ORDER BY revoked_at DESC, id DESC",
      )
      .all()
      .map((row) => {
        const record = row as Record<string, unknown>;
        return exportRevocationSchema.parse({
          id: String(record["id"]),
          packageId: String(record["package_id"]),
          reason: String(record["reason"]),
          revokedByUserId: String(record["revoked_by_user_id"]),
          revokedAt: String(record["revoked_at"]),
          auditEventId: String(record["audit_event_id"]),
        });
      });
  }

  public isRevoked(packageId: string): boolean {
    return Boolean(this.findRevocation(packageId));
  }

  private findRevocation(packageId: string): ExportRevocation | undefined {
    const record = this.database.raw
      .prepare(
        "SELECT id, package_id, reason, revoked_by_user_id, revoked_at, audit_event_id FROM export_revocations WHERE package_id = ?",
      )
      .get(packageId) as Record<string, unknown> | undefined;
    if (!record) return undefined;
    return exportRevocationSchema.parse({
      id: String(record["id"]),
      packageId: String(record["package_id"]),
      reason: String(record["reason"]),
      revokedByUserId: String(record["revoked_by_user_id"]),
      revokedAt: String(record["revoked_at"]),
      auditEventId: String(record["audit_event_id"]),
    });
  }

  public getOrgSettings(context: SessionContext): OrgSettings {
    requireCapability(context, "export.manage");
    return this.getOrgSettingsInternal(context.userId);
  }

  public updateOrgSettings(
    context: SessionContext,
    input: OrgSettingsInput,
  ): OrgSettings {
    if (context.role !== "admin") {
      throw new Error(
        "ELITE_ORG_SETTINGS_ADMIN_ONLY: only administrators can update organization settings",
      );
    }
    requireCapability(context, "module.manage");
    const parsed = orgSettingsInputSchema.parse(input);
    const updatedAt = this.now();
    const auditEventId = nanoid(18);
    const transaction = this.database.raw.transaction(() => {
      for (const [key, value] of Object.entries(parsed)) {
        this.database.raw
          .prepare(
            "INSERT INTO org_settings (key, value, updated_at, updated_by_user_id) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by_user_id = excluded.updated_by_user_id",
          )
          .run(key, String(value), updatedAt, context.userId);
      }
      this.database.raw
        .prepare(
          "INSERT INTO audit_events (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?)",
        )
        .run(
          auditEventId,
          context.userId,
          context.deviceId,
          "organization-settings.updated",
          "org-settings",
          "organization",
          JSON.stringify({ keys: Object.keys(parsed) }),
          updatedAt,
        );
    });
    transaction();
    return orgSettingsSchema.parse({
      ...parsed,
      updatedAt,
      updatedByUserId: context.userId,
    });
  }

  private signaturePort: ExportSignaturePort = {
    sign: (data) => {
      throw new Error(`ELITE_EXPORT_SIGNER_NOT_CONFIGURED: ${data.length}`);
    },
  };

  public setSignaturePort(port: ExportSignaturePort): void {
    this.signaturePort = port;
  }

  private getOrgSettingsInternal(userId: string): OrgSettings {
    const rows = this.database.raw
      .prepare(
        "SELECT key, value, updated_at, updated_by_user_id FROM org_settings",
      )
      .all() as Array<Record<string, unknown>>;
    const values: Record<string, unknown> = {
      ...DEFAULT_ORG_IDENTIFIER,
      exportExpirationDays: 30,
    };
    let updatedAt = this.now();
    let updatedByUserId = userId;
    for (const row of rows) {
      values[String(row["key"])] =
        row["key"] === "exportExpirationDays"
          ? Number(row["value"])
          : String(row["value"]);
      updatedAt = String(row["updated_at"]);
      updatedByUserId = String(row["updated_by_user_id"]);
    }
    return orgSettingsSchema.parse({ ...values, updatedAt, updatedByUserId });
  }

  private buildFhirBundleObject(
    payload: PatientExportPayload,
    fhirSystemUrl: string,
  ): Record<string, unknown> {
    return {
      resourceType: "Bundle",
      type: "document",
      timestamp: this.now(),
      identifier: {
        system: `${fhirSystemUrl}/projection-snapshot`,
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
            ...(payload.identity.sex
              ? {
                  gender:
                    payload.identity.sex === "intersex"
                      ? "other"
                      : payload.identity.sex,
                }
              : {}),
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
            id: fhirResourceId(payload.effectiveEncounter.id),
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
              .join("\n"),
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
            id: fhirResourceId(String(entry["id"])),
            patient: { reference: `Patient/${payload.patientId}` },
            name: String(entry["title"] ?? "Medical history"),
            note: [{ text: String(entry["details"] ?? "") }],
          },
        })),
      ],
    };
  }

  private getSnapshot(snapshotId: string): ProjectionSnapshot {
    const row = this.database.raw
      .prepare(
        `SELECT s.*, p.patient_id AS patient_display_id FROM encounter_projection_snapshots s JOIN patients p ON p.id = s.patient_id WHERE s.id = ?`,
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
    return this.database.raw
      .prepare(
        `SELECT h.id, h.category, h.title, h.details, h.onset_date, h.status, h.source, h.recorded_at FROM patient_medical_history h JOIN patients p ON p.id = h.patient_id WHERE p.patient_id = ? AND h.status = 'active' ORDER BY h.recorded_at`,
      )
      .all(patientId) as Array<Record<string, unknown>>;
  }
}
