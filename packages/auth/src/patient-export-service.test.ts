import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@elite/database";
import { describe, expect, it } from "vitest";
import {
  AuthService,
  PatientExportService,
  exportSigningData,
  hashExportPayload,
  type SessionContext,
  verifyExportPackage,
} from "./index.js";
import { ClinicalWorkflowService } from "./clinical-service.js";
import { EncounterService } from "./encounter-service.js";
import { createDeterministicZip, readDeterministicZip } from "./zip-utils.js";
import { PatientIdentityService } from "./patient-service.js";

const bootstrapInput = {
  admins: [
    {
      username: "admin.export.primary",
      password: "Synthetic-Export-Primary-2026!",
      displayNameEn: "Synthetic Export Primary",
    },
    {
      username: "admin.export.backup",
      password: "Synthetic-Export-Backup-2026!",
      displayNameEn: "Synthetic Export Backup",
    },
  ],
  hubDevice: {
    friendlyName: "Synthetic Export Hub",
    appVersion: "0.1.0-test",
  },
};

function insertDoctor(database: ReturnType<typeof openDatabase>): void {
  const timestamp = "2030-01-01T00:00:00.000Z";
  database.raw
    .prepare(
      `INSERT INTO users (id, username, display_name_en, display_name_ar, role, capabilities_json, is_clinical_approver, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 'doctor', ?, 1, 1, ?, ?)`,
    )
    .run(
      "synthetic-export-doctor",
      "synthetic.export.doctor",
      "Synthetic Export Doctor",
      null,
      JSON.stringify([
        "patient.read",
        "clinical.read",
        "clinical.write",
        "clinical.sign",
        "clinical.approve",
        "appointment.read",
        "appointment.write",
        "export.manage",
      ]),
      timestamp,
      timestamp,
    );
}

function doctorContext(admin: SessionContext): SessionContext {
  return {
    ...admin,
    userId: "synthetic-export-doctor",
    username: "synthetic.export.doctor",
    role: "doctor",
    capabilities: [
      "patient.read",
      "clinical.read",
      "clinical.write",
      "clinical.sign",
      "clinical.approve",
      "appointment.read",
      "appointment.write",
      "export.manage",
    ],
  };
}

describe("PatientExportService", () => {
  it("redacts identity fields, builds FHIR, and verifies detached signatures", async () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    try {
      const auth = new AuthService(database);
      const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
      const admin = await auth.login({
        username: bootstrapInput.admins[0]!.username,
        password: bootstrapInput.admins[0]!.password,
        deviceId: bootstrap.hubDeviceId,
      });
      insertDoctor(database);
      const doctor = doctorContext(admin);
      const patients = new PatientIdentityService(database);
      const clinical = new ClinicalWorkflowService(database);
      const encounters = new EncounterService(database, {
        now: () => "2030-02-01T10:00:00.000Z",
      });
      const exporter = new PatientExportService(
        database,
        () => "2030-02-01T10:00:00.000Z",
      );
      const specialty = clinical.createSpecialty(admin, {
        code: "EXP",
        nameEn: "Export Specialty",
      });
      const department = clinical.createDepartment(admin, {
        specialtyId: specialty.id,
        code: "EXP-OPD",
        nameEn: "Export Outpatient",
      });
      const patient = patients.registerPatient(admin, {
        registrationMode: "full",
        nameEn: "Synthetic Export Patient",
        phone: "+201000000099",
        nationalId: "29901011234567",
      });
      const appointment = clinical.createAppointment(admin, {
        patientId: patient.patient.patientId,
        departmentId: department.id,
        doctorId: doctor.userId,
        scheduledStart: "2030-02-01T10:00:00.000Z",
        durationMinutes: 30,
        visitType: "synthetic export visit",
        isWalkIn: false,
      });
      const draft = encounters.createEncounter(admin, appointment.id, {
        subjective: "Synthetic export symptom.",
        assessment: "Synthetic export assessment.",
      });
      const signed = encounters.signEncounter(doctor, draft.id, draft.version);
      const snapshot = encounters.createProjectionSnapshot(admin, signed.id, {
        exportReason: "Synthetic export snapshot",
      });

      const clinicalPayload = exporter.buildPayload(admin, {
        snapshotId: snapshot.id,
        format: "fhir",
        redactionPolicy: "clinical",
        exportReason: "Synthetic clinical export",
      });
      expect(clinicalPayload.identity.nameEn).toBe("Synthetic Export Patient");
      expect(clinicalPayload.identity.phone).toBeUndefined();
      expect(clinicalPayload.identity.nationalId).toBeUndefined();

      const minimalPayload = exporter.buildPayload(admin, {
        snapshotId: snapshot.id,
        format: "fhir",
        redactionPolicy: "minimal",
        exportReason: "Synthetic minimal export",
      });
      expect(minimalPayload.identity.nameEn).toBeUndefined();

      const fhir = exporter.buildFhirBundle(admin, {
        snapshotId: snapshot.id,
        format: "fhir",
        redactionPolicy: "clinical",
        exportReason: "Synthetic FHIR export",
      });
      expect(fhir.toString("utf8")).toContain(snapshot.payloadHash);
      const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
        privateKeyEncoding: { format: "pem", type: "pkcs8" },
        publicKeyEncoding: { format: "pem", type: "spki" },
      });
      const unsigned = {
        schemaVersion: 1 as const,
        packageId: "synthetic-export-package",
        snapshotId: snapshot.id,
        snapshotPayloadHash: snapshot.payloadHash,
        payloadHash: hashExportPayload(fhir),
        signatureAlgorithm: "ed25519" as const,
        publicKeyPem: publicKey,
        signatureBase64: "placeholder-signature",
        format: "fhir" as const,
        redactionPolicy: "clinical" as const,
        exportReason: "Synthetic FHIR export",
        createdAt: "2030-02-01T10:00:00.000Z",
        createdByUserId: admin.userId,
      };
      const signature = sign(
        null,
        exportSigningData(unsigned),
        privateKey,
      ).toString("base64");
      const verified = verifyExportPackage({
        manifestJson: JSON.stringify({
          ...unsigned,
          signatureBase64: signature,
        }),
        payloadBase64: fhir.toString("base64"),
      });
      expect(verified.verified).toBe(true);
      const tampered = verifyExportPackage({
        manifestJson: JSON.stringify({
          ...unsigned,
          signatureBase64: signature,
        }),
        payloadBase64: Buffer.from(`${fhir.toString("utf8")}tampered`).toString(
          "base64",
        ),
      });
      expect(tampered.verified).toBe(false);

      const validation = exporter.validateFhirBundle(
        JSON.parse(fhir.toString("utf8")),
      );
      expect(validation.valid).toBe(true);
      expect(validation.fhirVersion).toBe("R4");
      expect(validation.profileIds).toContain(
        "urn:elite-clinic:fhir-profile:patient-record-document-r4",
      );

      const installedProfile = exporter.installFhirProfileBundle(admin, {
        id: "national-eg-demo-r4",
        displayName: "Synthetic National EG Patient Document R4",
        jurisdiction: "EG",
        version: "2026.1.0",
        fhirVersion: "R4",
        publisher: "Synthetic National Standards Authority",
        sourceUri: "urn:synthetic:national-eg-r4",
        profiles: [
          {
            resourceType: "Bundle",
            canonicalUrl:
              "urn:synthetic:national-eg-r4:StructureDefinition:document-bundle",
            requiredPaths: ["type", "timestamp", "identifier", "entry"],
            fixedValues: { type: "document" },
          },
          {
            resourceType: "Patient",
            canonicalUrl:
              "urn:synthetic:national-eg-r4:StructureDefinition:patient",
            requiredPaths: ["id", "name"],
            fixedValues: {},
          },
        ],
      });
      expect(installedProfile.bundleHash).toMatch(/^[a-f0-9]{64}$/);
      expect(
        exporter
          .listFhirProfileBundles(admin)
          .some((profile) => profile.id === installedProfile.id),
      ).toBe(true);

      const updatedSettings = exporter.updateOrgSettings(admin, {
        clinicNameEn: "Elite Clinic Synthetic Branch",
        countryCode: "EG",
        oid: "1.3.6.1.4.1.99999.42",
        fhirSystemUrl: "https://synthetic.elite-clinic.local/fhir",
        exportExpirationDays: 7,
        fhirProfileBundleId: "national-eg-demo-r4",
      });
      expect(updatedSettings.exportExpirationDays).toBe(7);
      expect(exporter.getOrgSettings(admin).oid).toBe("1.3.6.1.4.1.99999.42");
      expect(exporter.getOrgSettings(admin).fhirProfileBundleId).toBe(
        "national-eg-demo-r4",
      );
      const customFhir = exporter.buildFhirBundle(admin, {
        snapshotId: snapshot.id,
        format: "fhir",
        redactionPolicy: "clinical",
        exportReason: "Synthetic national profile export",
      });
      expect(JSON.parse(customFhir.toString("utf8")).resourceType).toBe(
        "Bundle",
      );
      const minimalProfileFailure = () =>
        exporter.buildFhirBundle(admin, {
          snapshotId: snapshot.id,
          format: "fhir",
          redactionPolicy: "minimal",
          exportReason: "Synthetic national profile minimal export",
        });
      expect(minimalProfileFailure).toThrow(/requires name/);

      exporter.setSignaturePort({
        sign(data) {
          return {
            publicKeyPem: publicKey,
            signature: sign(null, data, privateKey),
          };
        },
      });
      const zip = exporter.buildZipPackage(
        admin,
        {
          snapshotId: snapshot.id,
          format: "fhir",
          redactionPolicy: "clinical",
          exportReason: "Synthetic signed ZIP export",
        },
        fhir,
      );
      expect(zip.package.manifest.packageType).toBe("zip");
      expect(zip.package.manifest.fhirProfileBundleId).toBe(
        "national-eg-demo-r4",
      );
      expect(zip.package.manifest.fhirProfileBundleHash).toBe(
        installedProfile.bundleHash,
      );
      expect(zip.package.manifest.expiresAt).toBe("2030-02-08T10:00:00.000Z");
      expect(zip.package.manifest.orgIdentifier?.clinicNameEn).toBe(
        "Elite Clinic Synthetic Branch",
      );
      expect(exporter.verifyZipPackage(zip.archive).verified).toBe(true);

      const tempDirectory = mkdtempSync(
        join(tmpdir(), "elite-export-integration-"),
      );
      try {
        const archivePath = join(tempDirectory, "synthetic-export.zip");
        writeFileSync(archivePath, zip.archive);
        const verifierPath = fileURLToPath(
          new URL("../../../tools/verify-export.mjs", import.meta.url),
        );
        const validOutput = execFileSync(
          process.execPath,
          [verifierPath, archivePath],
          { encoding: "utf8" },
        );
        expect(JSON.parse(validOutput).verified).toBe(true);

        const members = readDeterministicZip(zip.archive);
        const tamperedMembers = members.map((member) =>
          member.name.endsWith(".fhir.json")
            ? {
                ...member,
                data: Buffer.from(
                  `${member.data.toString("utf8")}tampered`,
                  "utf8",
                ),
              }
            : member,
        );
        const tamperedPath = join(
          tempDirectory,
          "synthetic-export-tampered.zip",
        );
        writeFileSync(tamperedPath, createDeterministicZip(tamperedMembers));
        expect(() =>
          execFileSync(process.execPath, [verifierPath, tamperedPath], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          }),
        ).toThrow();

        const ledgerPath = join(tempDirectory, "revocations.json");
        writeFileSync(
          ledgerPath,
          JSON.stringify([
            {
              packageId: zip.package.packageId,
              reason: "Synthetic trusted-ledger revocation",
            },
          ]),
        );
        expect(() =>
          execFileSync(
            process.execPath,
            [verifierPath, archivePath, ledgerPath],
            { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
          ),
        ).toThrow();
        expect(readFileSync(archivePath).equals(zip.archive)).toBe(true);
      } finally {
        rmSync(tempDirectory, { recursive: true, force: true });
      }

      const revocation = exporter.revokeExport(
        admin,
        zip.package.packageId,
        "Synthetic test revocation",
      );
      expect(revocation.packageId).toBe(zip.package.packageId);
      expect(exporter.isRevoked(zip.package.packageId)).toBe(true);
      const revokedVerification = exporter.verifyZipPackage(zip.archive);
      expect(revokedVerification.verified).toBe(false);
      expect(revokedVerification.revoked).toBe(true);
      expect(exporter.listRevocations(admin)).toHaveLength(1);
      expect(() =>
        exporter.revokeExport(
          admin,
          zip.package.packageId,
          "Duplicate synthetic revocation",
        ),
      ).toThrow(/ALREADY_REVOKED/);
    } finally {
      database.close();
    }
  });
});
