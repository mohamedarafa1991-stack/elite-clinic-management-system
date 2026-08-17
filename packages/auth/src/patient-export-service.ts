import { createHash, sign, verify } from "node:crypto";
import { nanoid } from "nanoid";
import {
  exportExpirationPolicySchema,
  exportFormatSchema,
  exportPackageLifecycleEventSchema,
  exportPackageLifecycleStatusSchema,
  exportPackageRegistryRecordSchema,
  exportRegistryCreateInputSchema,
  exportRegistryListInputSchema,
  exportRegistryTransitionInputSchema,
  exportSigningKeyMetadataSchema,
  exportSigningKeyPassphraseSchema,
  exportSigningKeyRecoveryBundleSchema,
  exportRedactionPolicySchema,
  exportRevocationSchema,
  exportVerificationInputSchema,
  exportVerificationResultSchema,
  exportZipPackageSchema,
  fhirProfileBundleRecordSchema,
  fhirProfileBundleSchema,
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
  type ExportPackageLifecycleEvent,
  type ExportPackageLifecycleStatus,
  type ExportPackageRegistryRecord,
  type ExportRegistryCreateInput,
  type ExportRegistryListInput,
  type ExportRegistryTransitionInput,
  type ExportSigningKeyMetadata,
  type ExportSigningKeyRecoveryBundle,
  type ExportRedactionPolicy,
  type ExportRevocation,
  type ExportVerificationInput,
  type ExportVerificationResult,
  type ExportZipPackage,
  type FhirProfileBundle,
  type FhirProfileBundleRecord,
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
  BUILTIN_FHIR_PROFILE_BUNDLES,
  canonicalizeProfileBundle,
  getBuiltinFhirProfileBundle,
  hashFhirProfileBundle,
} from "./fhir-profile-bundles.js";
import {
  createDeterministicZip,
  readDeterministicZip,
  type ZipMember,
} from "./zip-utils.js";

export interface ExportSignaturePort {
  sign(data: Buffer): {
    publicKeyPem: string;
    signature: Buffer;
    keyId?: string;
    keyVersion?: number;
  };
  getActiveKeyMetadata?: () => ExportSigningKeyMetadata;
  listKeyMetadata?: () => readonly ExportSigningKeyMetadata[];
  rotate?: () => ExportSigningKeyMetadata;
  exportRecoveryBundle?: (passphrase: string) => ExportSigningKeyRecoveryBundle;
  restoreRecoveryBundle?: (
    bundle: ExportSigningKeyRecoveryBundle,
    passphrase: string,
  ) => ExportSigningKeyMetadata;
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

const FHIR_VALIDATOR_VERSION = "elite-fhir-r4-2";
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
      signerKeyId: manifest.signerKeyId,
      signerKeyVersion: manifest.signerKeyVersion,
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
      fhirProfileBundleId: manifest.fhirProfileBundleId,
      fhirProfileBundleHash: manifest.fhirProfileBundleHash,
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

  public validateFhirBundle(
    bundle: unknown,
    profileBundleId = "elite-clinic-r4",
  ): FhirValidationResult {
    const profileBundle = this.resolveFhirProfileBundle(profileBundleId);
    const profileBundleHash = hashFhirProfileBundle(profileBundle);
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
        profileBundleId: profileBundle.id,
        profileBundleHash,
        profileIds: [
          ...FHIR_PROFILE_IDS,
          ...profileBundle.profiles.map((profile) => profile.canonicalUrl),
        ],
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

    const profileResources: Array<{
      path: string;
      resource: Record<string, unknown>;
    }> = [{ path: "$", resource: bundle }];
    if (Array.isArray(entries)) {
      entries.forEach((entry, index) => {
        if (isObject(entry) && isObject(entry["resource"])) {
          profileResources.push({
            path: `$.entry[${index}].resource`,
            resource: entry["resource"],
          });
        }
      });
    }
    const readPath = (
      resource: Record<string, unknown>,
      path: string,
    ): unknown => {
      let current: unknown = resource;
      for (const segment of path.split(".")) {
        if (!isObject(current) || !(segment in current)) return undefined;
        current = current[segment];
      }
      return current;
    };
    const hasValue = (value: unknown): boolean =>
      value !== undefined &&
      value !== null &&
      value !== "" &&
      (!Array.isArray(value) || value.length > 0);
    for (const item of profileResources) {
      const resourceType = String(item.resource["resourceType"] ?? "");
      for (const profile of profileBundle.profiles.filter(
        (candidate) => candidate.resourceType === resourceType,
      )) {
        for (const requiredPath of profile.requiredPaths) {
          if (!hasValue(readPath(item.resource, requiredPath))) {
            issue(
              "error",
              `${item.path}.${requiredPath}`,
              "profile-required",
              `${profile.canonicalUrl} requires ${requiredPath}.`,
            );
          }
        }
        for (const [fixedPath, expected] of Object.entries(
          profile.fixedValues,
        )) {
          if (readPath(item.resource, fixedPath) !== expected) {
            issue(
              "error",
              `${item.path}.${fixedPath}`,
              "profile-fixed-value",
              `${profile.canonicalUrl} requires ${fixedPath}=${String(expected)}.`,
            );
          }
        }
      }
    }

    return fhirValidationResultSchema.parse({
      valid: !issues.some((entry) => entry.severity === "error"),
      fhirVersion: "R4",
      validatorVersion: FHIR_VALIDATOR_VERSION,
      profileBundleId: profileBundle.id,
      profileBundleHash,
      profileIds: [
        ...FHIR_PROFILE_IDS,
        ...profileBundle.profiles.map((profile) => profile.canonicalUrl),
      ],
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
    const profileBundleId =
      parsed.fhirProfileBundleId ??
      org.fhirProfileBundleId ??
      "elite-clinic-r4";
    const fhir = this.buildFhirBundleObject(payload, org.fhirSystemUrl);
    const validation = this.validateFhirBundle(fhir, profileBundleId);
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
    const profileBundleId =
      parsed.fhirProfileBundleId ??
      org.fhirProfileBundleId ??
      "elite-clinic-r4";
    const profileBundle = this.resolveFhirProfileBundle(profileBundleId);
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
      fhirValidation = this.validateFhirBundle(parsedFhir, profileBundleId);
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
    const profileBundleFileName = `${profileBundle.id}.fhir-profile.json`;
    const profileBundleBytes = Buffer.from(
      canonicalizeProfileBundle(profileBundle),
      "utf8",
    );
    const memberHashes = {
      [payloadFileName]: hashExportPayload(payloadBytes),
      [readmeFileName]: hashExportPayload(readme),
      ...(parsed.format === "fhir"
        ? { [profileBundleFileName]: hashExportPayload(profileBundleBytes) }
        : {}),
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
      fhirProfileBundleId: profileBundleId,
      fhirProfileBundleHash: fhirValidation?.profileBundleHash,
      memberHashes,
      packageContentHash,
    });
    const signer = this.signaturePort;
    const activeSignerKey = signer.getActiveKeyMetadata?.();
    const firstSignature = signer.sign(exportSigningData(signingManifest));
    const signerKeyId =
      activeSignerKey?.keyId ??
      firstSignature.keyId ??
      `esk-${hashExportPayload(Buffer.from(firstSignature.publicKeyPem)).slice(0, 24)}`;
    const signerKeyVersion =
      activeSignerKey?.keyVersion ?? firstSignature.keyVersion ?? 1;
    const manifestToSign = signedExportManifestSchema.parse({
      ...signingManifest,
      signerKeyId,
      signerKeyVersion,
    });
    const signed = signer.sign(exportSigningData(manifestToSign));
    const manifest = signedExportManifestSchema.parse({
      ...manifestToSign,
      signerKeyId: signed.keyId ?? signerKeyId,
      signerKeyVersion: signed.keyVersion ?? signerKeyVersion,
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
      ...(parsed.format === "fhir"
        ? [{ name: profileBundleFileName, data: profileBundleBytes }]
        : []),
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
      const profileBundleMember = members.find((member) =>
        member.name.endsWith(".fhir-profile.json"),
      );
      const profileBundleMemberValid =
        manifest.format !== "fhir"
          ? true
          : Boolean(profileBundleMember) &&
            hashExportPayload(profileBundleMember!.data) ===
              manifest.fhirProfileBundleHash;
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
      const archiveIntegrityValid =
        memberHashesValid && contentHashValid && profileBundleMemberValid;
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
    const registered = this.findExportPackage(normalizedPackageId);
    if (
      registered &&
      ["issued", "stored", "downloaded", "expired"].includes(registered.status)
    ) {
      this.transitionExportPackage(context, {
        packageId: normalizedPackageId,
        toStatus: "revoked",
        reason: normalizedReason,
      });
    }
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

  public registerExportPackage(
    context: SessionContext,
    input: ExportRegistryCreateInput,
  ): ExportPackageRegistryRecord {
    requireCapability(context, "export.manage");
    const parsed = exportRegistryCreateInputSchema.parse(input);
    const existing = this.findExportPackage(parsed.packageId);
    if (existing) {
      if (
        existing.packageHash !== parsed.packageHash ||
        existing.manifestHash !== parsed.manifestHash
      ) {
        throw new Error(
          "ELITE_EXPORT_REGISTRY_PACKAGE_CONFLICT: package ID already exists with different content",
        );
      }
      return existing;
    }
    const patientRow = this.database.raw
      .prepare("SELECT id FROM patients WHERE patient_id = ?")
      .get(parsed.patientId) as { id: string } | undefined;
    if (!patientRow) {
      throw new Error(
        "ELITE_EXPORT_REGISTRY_PATIENT_NOT_FOUND: patient was not found",
      );
    }
    const now = this.now();
    const auditEventId = nanoid(18);
    const lifecycleId = nanoid(18);
    const signerMetadata = this.ensureSignerKeyMetadata(
      context,
      parsed.signerKeyId,
      parsed.signerKeyVersion,
      undefined,
      parsed.createdAt,
    );
    const record = exportPackageRegistryRecordSchema.parse({
      ...parsed,
      signerKeyId: signerMetadata.keyId,
      signerKeyVersion: signerMetadata.keyVersion,
      status: "stored",
      statusChangedAt: now,
      statusChangedByUserId: context.userId,
    });
    const transaction = this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          "INSERT INTO audit_events (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?)",
        )
        .run(
          auditEventId,
          context.userId,
          context.deviceId,
          "export.registry.created",
          "export-package",
          record.packageId,
          JSON.stringify({
            packageType: record.packageType,
            status: record.status,
          }),
          now,
        );
      this.database.raw
        .prepare(
          `INSERT INTO export_packages (
            package_id, package_type, snapshot_id, patient_id, format, redaction_policy,
            export_reason, created_at, created_by_user_id, expires_at, status,
            status_changed_at, status_changed_by_user_id, package_hash, payload_hash,
            manifest_hash, signer_key_id, signer_key_version, archive_file_name,
            archive_path, payload_path, manifest_path, signature_path, fhir_profile_bundle_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.packageId,
          record.packageType,
          record.snapshotId,
          patientRow.id,
          record.format,
          record.redactionPolicy,
          record.exportReason,
          record.createdAt,
          record.createdByUserId,
          record.expiresAt,
          record.status,
          record.statusChangedAt,
          record.statusChangedByUserId,
          record.packageHash,
          record.payloadHash,
          record.manifestHash,
          record.signerKeyId,
          record.signerKeyVersion,
          record.archiveFileName ?? null,
          record.archivePath ?? null,
          record.payloadPath ?? null,
          record.manifestPath ?? null,
          record.signaturePath ?? null,
          record.fhirProfileBundleId ?? null,
        );
      this.database.raw
        .prepare(
          "INSERT INTO export_package_lifecycle_events (id, package_id, from_status, to_status, reason, changed_at, changed_by_user_id, audit_event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          lifecycleId,
          record.packageId,
          null,
          record.status,
          "Export package registered after successful save.",
          now,
          context.userId,
          auditEventId,
        );
    });
    transaction();
    return record;
  }

  public listExportPackages(
    context: SessionContext,
    input: ExportRegistryListInput = { limit: 100 },
  ): readonly ExportPackageRegistryRecord[] {
    requireCapability(context, "export.manage");
    const parsed = exportRegistryListInputSchema.parse(input);
    this.markExpiredPackages(context);
    const clauses: string[] = [];
    const parameters: unknown[] = [];
    if (parsed.patientId) {
      clauses.push("patients.patient_id = ?");
      parameters.push(parsed.patientId);
    }
    if (parsed.status) {
      clauses.push("status = ?");
      parameters.push(parsed.status);
    }
    parameters.push(parsed.limit);
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.database.raw
      .prepare(
        `SELECT export_packages.*, patients.patient_id AS patient_display_id
         FROM export_packages
         INNER JOIN patients ON patients.id = export_packages.patient_id
         ${where}
         ORDER BY export_packages.created_at DESC, export_packages.package_id DESC LIMIT ?`,
      )
      .all(...parameters)
      .map((row) =>
        this.parseExportPackageRecord(row as Record<string, unknown>),
      );
  }

  public transitionExportPackage(
    context: SessionContext,
    input: ExportRegistryTransitionInput,
  ): ExportPackageRegistryRecord {
    requireCapability(context, "export.manage");
    const parsed = exportRegistryTransitionInputSchema.parse(input);
    if (parsed.toStatus === "revoked" || parsed.toStatus === "destroyed") {
      requireCapability(context, "export.revoke");
    }
    const current = this.findExportPackage(parsed.packageId);
    if (!current) {
      throw new Error(
        "ELITE_EXPORT_REGISTRY_NOT_FOUND: export package was not found",
      );
    }
    if (current.status === parsed.toStatus) return current;
    if (!this.isAllowedExportTransition(current.status, parsed.toStatus)) {
      throw new Error(
        `ELITE_EXPORT_REGISTRY_TRANSITION_INVALID: cannot move ${current.status} to ${parsed.toStatus}`,
      );
    }
    const changedAt = this.now();
    const auditEventId = nanoid(18);
    const lifecycleId = nanoid(18);
    const next = {
      ...current,
      status: parsed.toStatus,
      statusChangedAt: changedAt,
      statusChangedByUserId: context.userId,
    };
    const transaction = this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          "INSERT INTO audit_events (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?)",
        )
        .run(
          auditEventId,
          context.userId,
          context.deviceId,
          "export.lifecycle.changed",
          "export-package",
          current.packageId,
          JSON.stringify({
            fromStatus: current.status,
            toStatus: parsed.toStatus,
            reason: parsed.reason,
          }),
          changedAt,
        );
      this.database.raw
        .prepare(
          "UPDATE export_packages SET status = ?, status_changed_at = ?, status_changed_by_user_id = ? WHERE package_id = ?",
        )
        .run(
          next.status,
          next.statusChangedAt,
          next.statusChangedByUserId,
          next.packageId,
        );
      this.database.raw
        .prepare(
          "INSERT INTO export_package_lifecycle_events (id, package_id, from_status, to_status, reason, changed_at, changed_by_user_id, audit_event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          lifecycleId,
          current.packageId,
          current.status,
          parsed.toStatus,
          parsed.reason,
          changedAt,
          context.userId,
          auditEventId,
        );
    });
    transaction();
    return next;
  }

  public listExportPackageLifecycle(
    context: SessionContext,
    packageId: string,
  ): readonly ExportPackageLifecycleEvent[] {
    requireCapability(context, "export.manage");
    const current = this.findExportPackage(packageId);
    if (!current)
      throw new Error(
        "ELITE_EXPORT_REGISTRY_NOT_FOUND: export package was not found",
      );
    return this.database.raw
      .prepare(
        "SELECT id, package_id, from_status, to_status, reason, changed_at, changed_by_user_id, audit_event_id FROM export_package_lifecycle_events WHERE package_id = ? ORDER BY changed_at ASC, id ASC",
      )
      .all(packageId)
      .map((row) => {
        const record = row as Record<string, unknown>;
        return exportPackageLifecycleEventSchema.parse({
          id: String(record["id"]),
          packageId: String(record["package_id"]),
          fromStatus:
            record["from_status"] === null
              ? null
              : String(record["from_status"]),
          toStatus: String(record["to_status"]),
          reason: String(record["reason"]),
          changedAt: String(record["changed_at"]),
          changedByUserId: String(record["changed_by_user_id"]),
          auditEventId: String(record["audit_event_id"]),
        });
      });
  }

  public listSigningKeys(
    context: SessionContext,
  ): readonly ExportSigningKeyMetadata[] {
    requireCapability(context, "export.key.manage");
    const keys = this.signaturePort.listKeyMetadata?.() ?? [];
    for (const key of keys)
      this.ensureSignerKeyMetadata(context, key.keyId, key.keyVersion, key);
    return keys.map((key) => exportSigningKeyMetadataSchema.parse(key));
  }

  public rotateSigningKey(
    context: SessionContext,
    reason: string,
  ): ExportSigningKeyMetadata {
    requireCapability(context, "export.key.manage");
    if (context.role !== "admin")
      throw new Error(
        "ELITE_EXPORT_KEY_ADMIN_ONLY: only administrators can rotate signing keys",
      );
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 1000)
      throw new Error(
        "ELITE_EXPORT_KEY_REASON_INVALID: reason must be 3-1000 characters",
      );
    if (!this.signaturePort.rotate)
      throw new Error(
        "ELITE_EXPORT_SIGNER_ROTATION_UNAVAILABLE: signer does not support rotation",
      );
    const rotated = this.signaturePort.rotate();
    this.recordSigningKeyEvent(context, rotated, "rotated", normalizedReason);
    return rotated;
  }

  public exportSigningKeyRecoveryBundle(
    context: SessionContext,
    passphrase: string,
  ): ExportSigningKeyRecoveryBundle {
    requireCapability(context, "export.key.manage");
    if (context.role !== "admin")
      throw new Error(
        "ELITE_EXPORT_KEY_ADMIN_ONLY: only administrators can recover signing keys",
      );
    const parsedPassphrase = exportSigningKeyPassphraseSchema.parse(passphrase);
    if (!this.signaturePort.exportRecoveryBundle)
      throw new Error(
        "ELITE_EXPORT_SIGNER_RECOVERY_UNAVAILABLE: signer does not support recovery export",
      );
    const bundle = exportSigningKeyRecoveryBundleSchema.parse(
      this.signaturePort.exportRecoveryBundle(parsedPassphrase),
    );
    const metadata = this.signaturePort.getActiveKeyMetadata?.();
    if (metadata)
      this.recordSigningKeyEvent(
        context,
        metadata,
        "recovery-exported",
        "Encrypted signing-key recovery bundle exported.",
      );
    return bundle;
  }

  public restoreSigningKeyRecoveryBundle(
    context: SessionContext,
    bundle: ExportSigningKeyRecoveryBundle,
    passphrase: string,
  ): ExportSigningKeyMetadata {
    requireCapability(context, "export.key.manage");
    if (context.role !== "admin")
      throw new Error(
        "ELITE_EXPORT_KEY_ADMIN_ONLY: only administrators can recover signing keys",
      );
    const parsedPassphrase = exportSigningKeyPassphraseSchema.parse(passphrase);
    if (!this.signaturePort.restoreRecoveryBundle)
      throw new Error(
        "ELITE_EXPORT_SIGNER_RECOVERY_UNAVAILABLE: signer does not support recovery import",
      );
    const restored = exportSigningKeyMetadataSchema.parse(
      this.signaturePort.restoreRecoveryBundle(
        exportSigningKeyRecoveryBundleSchema.parse(bundle),
        parsedPassphrase,
      ),
    );
    this.recordSigningKeyEvent(
      context,
      restored,
      "recovery-imported",
      "Encrypted signing-key recovery bundle imported.",
    );
    return restored;
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
    const fhirProfileBundleId = parsed.fhirProfileBundleId ?? "elite-clinic-r4";
    this.resolveFhirProfileBundle(fhirProfileBundleId);
    const normalized = { ...parsed, fhirProfileBundleId };
    const updatedAt = this.now();
    const auditEventId = nanoid(18);
    const transaction = this.database.raw.transaction(() => {
      for (const [key, value] of Object.entries(normalized)) {
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
          JSON.stringify({
            keys: Object.keys(normalized),
            fhirProfileBundleId,
          }),
          updatedAt,
        );
    });
    transaction();
    return orgSettingsSchema.parse({
      ...normalized,
      updatedAt,
      updatedByUserId: context.userId,
    });
  }

  private parseExportPackageRecord(
    row: Record<string, unknown>,
  ): ExportPackageRegistryRecord {
    return exportPackageRegistryRecordSchema.parse({
      packageId: String(row["package_id"]),
      packageType: String(row["package_type"]),
      snapshotId: String(row["snapshot_id"]),
      patientId: String(row["patient_display_id"] ?? row["patient_id"]),
      format: String(row["format"]),
      redactionPolicy: String(row["redaction_policy"]),
      exportReason: String(row["export_reason"]),
      createdAt: String(row["created_at"]),
      createdByUserId: String(row["created_by_user_id"]),
      expiresAt: row["expires_at"] === null ? null : String(row["expires_at"]),
      status: String(row["status"]),
      statusChangedAt: String(row["status_changed_at"]),
      statusChangedByUserId: String(row["status_changed_by_user_id"]),
      packageHash: String(row["package_hash"]),
      payloadHash: String(row["payload_hash"]),
      manifestHash: String(row["manifest_hash"]),
      signerKeyId: String(row["signer_key_id"]),
      signerKeyVersion: Number(row["signer_key_version"]),
      archiveFileName:
        row["archive_file_name"] === null
          ? undefined
          : String(row["archive_file_name"]),
      archivePath:
        row["archive_path"] === null ? undefined : String(row["archive_path"]),
      payloadPath:
        row["payload_path"] === null ? undefined : String(row["payload_path"]),
      manifestPath:
        row["manifest_path"] === null
          ? undefined
          : String(row["manifest_path"]),
      signaturePath:
        row["signature_path"] === null
          ? undefined
          : String(row["signature_path"]),
      fhirProfileBundleId:
        row["fhir_profile_bundle_id"] === null
          ? undefined
          : String(row["fhir_profile_bundle_id"]),
    });
  }

  private findExportPackage(
    packageId: string,
  ): ExportPackageRegistryRecord | undefined {
    const row = this.database.raw
      .prepare(
        "SELECT export_packages.*, patients.patient_id AS patient_display_id FROM export_packages INNER JOIN patients ON patients.id = export_packages.patient_id WHERE export_packages.package_id = ?",
      )
      .get(packageId) as Record<string, unknown> | undefined;
    return row ? this.parseExportPackageRecord(row) : undefined;
  }

  private isAllowedExportTransition(
    from: ExportPackageLifecycleStatus,
    to: ExportPackageLifecycleStatus,
  ): boolean {
    const allowed: Record<
      ExportPackageLifecycleStatus,
      readonly ExportPackageLifecycleStatus[]
    > = {
      issued: [
        "stored",
        "downloaded",
        "expired",
        "revoked",
        "superseded",
        "archived",
        "destroyed",
      ],
      stored: [
        "downloaded",
        "expired",
        "revoked",
        "superseded",
        "archived",
        "destroyed",
      ],
      downloaded: ["expired", "revoked", "superseded", "archived", "destroyed"],
      expired: ["revoked", "archived", "destroyed"],
      revoked: ["archived", "destroyed"],
      superseded: ["archived", "destroyed"],
      archived: ["destroyed"],
      destroyed: [],
    };
    return allowed[from].includes(to);
  }

  private markExpiredPackages(context: SessionContext): void {
    const now = this.now();
    const rows = this.database.raw
      .prepare(
        "SELECT package_id FROM export_packages WHERE expires_at IS NOT NULL AND expires_at <= ? AND status IN ('issued', 'stored', 'downloaded')",
      )
      .all(now) as Array<{ package_id: string }>;
    for (const row of rows) {
      try {
        this.transitionExportPackage(context, {
          packageId: row.package_id,
          toStatus: "expired",
          reason: "Export expiration time elapsed.",
        });
      } catch {
        // A concurrent state transition is safe to ignore during refresh.
      }
    }
  }

  private ensureSignerKeyMetadata(
    context: SessionContext,
    keyId: string,
    keyVersion: number,
    metadata?: ExportSigningKeyMetadata,
    createdAt = this.now(),
  ): ExportSigningKeyMetadata {
    const source = metadata ?? {
      keyId,
      keyVersion,
      algorithm: "ed25519" as const,
      publicKeyPem:
        this.signaturePort.getActiveKeyMetadata?.().publicKeyPem ??
        "unknown-public-key".padEnd(64, "-"),
      publicKeyFingerprint: createHash("sha256")
        .update(
          this.signaturePort.getActiveKeyMetadata?.().publicKeyPem ??
            "unknown-public-key",
        )
        .digest("hex"),
      status: "active" as const,
      createdAt,
      retiredAt: null,
      revokedAt: null,
    };
    const parsed = exportSigningKeyMetadataSchema.parse(source);
    const existing = this.database.raw
      .prepare("SELECT key_id FROM export_signing_keys WHERE key_id = ?")
      .get(parsed.keyId) as { key_id: string } | undefined;
    if (!existing) {
      this.database.raw
        .prepare(
          "INSERT INTO export_signing_keys (key_id, key_version, algorithm, public_key_pem, public_key_fingerprint, status, created_at, created_by_user_id, retired_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          parsed.keyId,
          parsed.keyVersion,
          parsed.algorithm,
          parsed.publicKeyPem,
          parsed.publicKeyFingerprint,
          parsed.status,
          parsed.createdAt,
          context.userId,
          parsed.retiredAt,
          parsed.revokedAt,
        );
    }
    return parsed;
  }

  private synchronizeSigningKeyMetadata(
    context: SessionContext,
    keys: readonly ExportSigningKeyMetadata[],
  ): void {
    const normalized = keys.map((key) =>
      exportSigningKeyMetadataSchema.parse(key),
    );
    const transaction = this.database.raw.transaction(() => {
      for (const key of normalized.filter(
        (entry) => entry.status !== "active",
      )) {
        this.database.raw
          .prepare(
            "UPDATE export_signing_keys SET public_key_pem = ?, public_key_fingerprint = ?, status = ?, retired_at = ?, revoked_at = ? WHERE key_id = ?",
          )
          .run(
            key.publicKeyPem,
            key.publicKeyFingerprint,
            key.status,
            key.retiredAt,
            key.revokedAt,
            key.keyId,
          );
      }
      for (const key of normalized.filter(
        (entry) => entry.status === "active",
      )) {
        const existing = this.database.raw
          .prepare("SELECT key_id FROM export_signing_keys WHERE key_id = ?")
          .get(key.keyId) as { key_id: string } | undefined;
        if (existing) {
          this.database.raw
            .prepare(
              "UPDATE export_signing_keys SET key_version = ?, public_key_pem = ?, public_key_fingerprint = ?, status = ?, retired_at = ?, revoked_at = ? WHERE key_id = ?",
            )
            .run(
              key.keyVersion,
              key.publicKeyPem,
              key.publicKeyFingerprint,
              key.status,
              key.retiredAt,
              key.revokedAt,
              key.keyId,
            );
        } else {
          this.database.raw
            .prepare(
              "INSERT INTO export_signing_keys (key_id, key_version, algorithm, public_key_pem, public_key_fingerprint, status, created_at, created_by_user_id, retired_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .run(
              key.keyId,
              key.keyVersion,
              key.algorithm,
              key.publicKeyPem,
              key.publicKeyFingerprint,
              key.status,
              key.createdAt,
              context.userId,
              key.retiredAt,
              key.revokedAt,
            );
        }
      }
    });
    transaction();
  }

  private recordSigningKeyEvent(
    context: SessionContext,
    metadata: ExportSigningKeyMetadata,
    eventType:
      | "created"
      | "rotated"
      | "retired"
      | "revoked"
      | "recovery-exported"
      | "recovery-imported",
    reason: string,
  ): void {
    const now = this.now();
    this.ensureSignerKeyMetadata(
      context,
      metadata.keyId,
      metadata.keyVersion,
      metadata,
      metadata.createdAt,
    );
    const auditEventId = nanoid(18);
    const eventId = nanoid(18);
    const transaction = this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          "INSERT INTO audit_events (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?)",
        )
        .run(
          auditEventId,
          context.userId,
          context.deviceId,
          `export.signing-key.${eventType}`,
          "export-signing-key",
          metadata.keyId,
          JSON.stringify({ keyVersion: metadata.keyVersion, reason }),
          now,
        );
      this.database.raw
        .prepare(
          "INSERT INTO export_signing_key_events (id, key_id, event_type, reason, occurred_at, occurred_by_user_id, audit_event_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          eventId,
          metadata.keyId,
          eventType,
          reason,
          now,
          context.userId,
          auditEventId,
        );
      this.database.raw
        .prepare(
          "UPDATE export_signing_keys SET public_key_pem = ?, public_key_fingerprint = ?, status = ?, retired_at = ?, revoked_at = ? WHERE key_id = ?",
        )
        .run(
          metadata.publicKeyPem,
          metadata.publicKeyFingerprint,
          metadata.status,
          metadata.retiredAt,
          metadata.revokedAt,
          metadata.keyId,
        );
    });
    transaction();
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
      fhirProfileBundleId: "elite-clinic-r4",
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

  public listFhirProfileBundles(
    context: SessionContext,
  ): readonly FhirProfileBundleRecord[] {
    requireCapability(context, "export.manage");
    const timestamp = this.now();
    const builtin = BUILTIN_FHIR_PROFILE_BUNDLES.map((bundle) =>
      fhirProfileBundleRecordSchema.parse({
        ...bundle,
        bundleHash: hashFhirProfileBundle(bundle),
        status: "active",
        installedAt: timestamp,
        installedByUserId: context.userId,
        updatedAt: timestamp,
        updatedByUserId: context.userId,
      }),
    );
    const stored = this.database.raw
      .prepare(
        "SELECT id, bundle_json, bundle_hash, status, installed_at, installed_by_user_id, updated_at, updated_by_user_id FROM fhir_profile_bundles ORDER BY id",
      )
      .all() as Array<Record<string, unknown>>;
    const records = stored.map((row) =>
      fhirProfileBundleRecordSchema.parse({
        ...fhirProfileBundleSchema.parse(
          JSON.parse(String(row["bundle_json"])),
        ),
        bundleHash: String(row["bundle_hash"]),
        status: String(row["status"]),
        installedAt: String(row["installed_at"]),
        installedByUserId: String(row["installed_by_user_id"]),
        updatedAt: String(row["updated_at"]),
        updatedByUserId: String(row["updated_by_user_id"]),
      }),
    );
    return [
      ...builtin,
      ...records.filter(
        (record) => !builtin.some((item) => item.id === record.id),
      ),
    ];
  }

  public installFhirProfileBundle(
    context: SessionContext,
    input: FhirProfileBundle,
  ): FhirProfileBundleRecord {
    requireCapability(context, "module.manage");
    if (context.role !== "admin")
      throw new Error(
        "ELITE_FHIR_PROFILE_ADMIN_ONLY: only administrators can install profile bundles",
      );
    const bundle = fhirProfileBundleSchema.parse(input);
    const timestamp = this.now();
    const bundleHash = hashFhirProfileBundle(bundle);
    this.database.raw
      .prepare(
        "INSERT INTO fhir_profile_bundles (id, bundle_json, bundle_hash, status, installed_at, installed_by_user_id, updated_at, updated_by_user_id) VALUES (?, ?, ?, 'active', ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET bundle_json = excluded.bundle_json, bundle_hash = excluded.bundle_hash, status = 'active', updated_at = excluded.updated_at, updated_by_user_id = excluded.updated_by_user_id",
      )
      .run(
        bundle.id,
        JSON.stringify(bundle),
        bundleHash,
        timestamp,
        context.userId,
        timestamp,
        context.userId,
      );
    this.database.raw
      .prepare(
        "INSERT INTO audit_events (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?)",
      )
      .run(
        nanoid(18),
        context.userId,
        context.deviceId,
        "fhir-profile-bundle.installed",
        "fhir-profile-bundle",
        bundle.id,
        JSON.stringify({
          bundleHash,
          jurisdiction: bundle.jurisdiction,
          version: bundle.version,
        }),
        timestamp,
      );
    return fhirProfileBundleRecordSchema.parse({
      ...bundle,
      bundleHash,
      status: "active",
      installedAt: timestamp,
      installedByUserId: context.userId,
      updatedAt: timestamp,
      updatedByUserId: context.userId,
    });
  }

  private resolveFhirProfileBundle(id: string): FhirProfileBundle {
    const builtin = getBuiltinFhirProfileBundle(id);
    if (builtin) return builtin;
    const row = this.database.raw
      .prepare(
        "SELECT bundle_json, status FROM fhir_profile_bundles WHERE id = ?",
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row || String(row["status"]) !== "active")
      throw new Error(`ELITE_FHIR_PROFILE_BUNDLE_NOT_FOUND: ${id}`);
    return fhirProfileBundleSchema.parse(
      JSON.parse(String(row["bundle_json"])),
    );
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
