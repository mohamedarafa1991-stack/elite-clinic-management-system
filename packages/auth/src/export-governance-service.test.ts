import { generateKeyPairSync, sign } from "node:crypto";
import { createHash } from "node:crypto";
import { openDatabase } from "@elite/database";
import { describe, expect, it } from "vitest";
import {
  AuthService,
  ClinicalWorkflowService,
  EncounterService,
  ExportGovernanceService,
  PatientExportService,
  PatientIdentityService,
  exportReceiptSigningData,
  verifyExportReceipt,
  type SessionContext,
} from "./index.js";

const bootstrapInput = {
  admins: [
    {
      username: "admin.governance.primary",
      password: "Synthetic-Governance-Primary-2026!",
      displayNameEn: "Synthetic Governance Primary",
    },
    {
      username: "admin.governance.backup",
      password: "Synthetic-Governance-Backup-2026!",
      displayNameEn: "Synthetic Governance Backup",
    },
  ],
  hubDevice: {
    friendlyName: "Synthetic Governance Hub",
    appVersion: "0.1.0-test",
  },
};

function insertDoctor(database: ReturnType<typeof openDatabase>): void {
  const timestamp = "2030-01-01T00:00:00.000Z";
  database.raw
    .prepare(
      `INSERT INTO users
       (id, username, display_name_en, display_name_ar, role, capabilities_json,
        is_clinical_approver, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'doctor', ?, 1, 1, ?, ?)`,
    )
    .run(
      "synthetic-governance-doctor",
      "synthetic.governance.doctor",
      "Synthetic Governance Doctor",
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
        "export.governance.request",
      ]),
      timestamp,
      timestamp,
    );
}

function doctorContext(admin: SessionContext): SessionContext {
  return {
    ...admin,
    userId: "synthetic-governance-doctor",
    username: "synthetic.governance.doctor",
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
      "export.governance.request",
    ],
  };
}

describe("ExportGovernanceService", () => {
  it("verifies signed receipts and rejects descriptor tampering", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    });
    const unsigned = {
      id: "synthetic-receipt",
      disclosureId: "synthetic-disclosure",
      packageId: "synthetic-package",
      recipientId: "synthetic-recipient",
      purposeOfUse: "referral" as const,
      packageHash: "1".repeat(64),
      manifestHash: "2".repeat(64),
      signerKeyId: "esk-synthetic-receipt-key",
      signerKeyVersion: 1,
      statusAtIssuance: "downloaded" as const,
      issuedAt: "2030-02-01T10:00:00.000Z",
      issuedByUserId: "synthetic-admin",
      receiptHash: "0".repeat(64),
      signatureBase64: "placeholder-signature-0000",
    };
    const canonical = exportReceiptSigningData(unsigned);
    const receipt = {
      ...unsigned,
      receiptHash: createHash("sha256").update(canonical).digest("hex"),
      signatureBase64: sign(null, canonical, privateKey).toString("base64"),
    };
    expect(verifyExportReceipt(receipt, publicKey)).toBe(true);
    expect(
      verifyExportReceipt(
        { ...receipt, packageHash: "9".repeat(64) },
        publicKey,
      ),
    ).toBe(false);
  });

  it("enforces evidence, completes disclosure, and issues an acknowledged receipt", async () => {
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
      const signer = {
        getActiveKeyMetadata: () => ({
          keyId: "esk-synthetic-governance-key",
          keyVersion: 1,
          algorithm: "ed25519" as const,
          publicKeyPem: "synthetic-public-key-pem-".padEnd(80, "x"),
          publicKeyFingerprint: "a".repeat(64),
          status: "active" as const,
          createdAt: "2030-01-01T00:00:00.000Z",
          retiredAt: null,
          revokedAt: null,
        }),
        sign: () => ({
          publicKeyPem: "synthetic-public-key-pem-".padEnd(80, "x"),
          signature: Buffer.alloc(64, 7),
          keyId: "esk-synthetic-governance-key",
          keyVersion: 1,
        }),
      };
      exporter.setSignaturePort(signer);
      const governance = new ExportGovernanceService(
        database,
        signer,
        () => "2030-02-01T10:00:00.000Z",
      );
      const specialty = clinical.createSpecialty(admin, {
        code: "GOV",
        nameEn: "Governance Specialty",
      });
      const department = clinical.createDepartment(admin, {
        specialtyId: specialty.id,
        code: "GOV-OPD",
        nameEn: "Governance Outpatient",
      });
      const patient = patients.registerPatient(admin, {
        registrationMode: "full",
        nameEn: "Synthetic Governance Patient",
        phone: "+201000000088",
      });
      const appointment = clinical.createAppointment(admin, {
        patientId: patient.patient.patientId,
        departmentId: department.id,
        doctorId: doctor.userId,
        scheduledStart: "2030-02-01T10:00:00.000Z",
        durationMinutes: 30,
        visitType: "synthetic governance visit",
        isWalkIn: false,
      });
      const draft = encounters.createEncounter(admin, appointment.id, {
        subjective: "Synthetic governance symptom.",
        assessment: "Synthetic governance assessment.",
      });
      const signed = encounters.signEncounter(doctor, draft.id, draft.version);
      const snapshot = encounters.createProjectionSnapshot(admin, signed.id, {
        exportReason: "Synthetic governance snapshot",
      });
      const packageRecord = exporter.registerExportPackage(admin, {
        packageId: "synthetic-governance-package",
        packageType: "zip",
        snapshotId: snapshot.id,
        patientId: patient.patient.patientId,
        format: "fhir",
        redactionPolicy: "clinical",
        exportReason: "Synthetic governance export",
        createdAt: "2030-02-01T10:00:00.000Z",
        expiresAt: "2030-03-01T10:00:00.000Z",
        packageHash: "1".repeat(64),
        payloadHash: "2".repeat(64),
        manifestHash: "3".repeat(64),
        signerKeyId: "esk-synthetic-governance-key",
        signerKeyVersion: 1,
        createdByUserId: admin.userId,
      });
      expect(packageRecord.status).toBe("stored");

      const recipient = governance.createRecipient(admin, {
        displayName: "Synthetic Referral Provider",
        organizationName: "Synthetic Referral Clinic",
        category: "referral-provider",
        contactChannel: "USB handoff",
      });
      expect(recipient.verificationStatus).toBe("unverified");
      const verifiedRecipient = governance.verifyRecipient(
        admin,
        recipient.id,
        "verified",
        "Synthetic recipient verification",
      );
      expect(verifiedRecipient.verificationStatus).toBe("verified");

      const evidence = governance.recordConsentEvidence(admin, {
        patientId: patient.patient.patientId,
        evidenceType: "patient-consent",
        sourceReference: "synthetic-consent-record-001",
        sourceHash: "4".repeat(64),
      });
      expect(evidence.status).toBe("pending");
      expect(() =>
        governance.decideDisclosure(admin, {
          disclosureId: "synthetic-missing-disclosure",
          decision: "approve",
          reason: "Synthetic missing disclosure",
        }),
      ).toThrow("DISCLOSURE_NOT_FOUND");
      const approvedEvidence = governance.reviewConsentEvidence(
        admin,
        evidence.id,
        "approve",
        "Synthetic consent evidence reviewed",
      );
      expect(approvedEvidence.status).toBe("approved");

      const requested = governance.requestDisclosure(admin, {
        packageId: packageRecord.packageId,
        recipientId: verifiedRecipient.id,
        purposeOfUse: "referral",
        deliveryMethod: "usb",
        consentEvidenceId: approvedEvidence.id,
        reason: "Synthetic referral disclosure request",
      });
      expect(requested.status).toBe("requested");
      const approved = governance.decideDisclosure(admin, {
        disclosureId: requested.id,
        decision: "approve",
        reason: "Synthetic referral approved",
      });
      expect(approved.status).toBe("approved");
      const sent = governance.sendDisclosure(
        admin,
        requested.id,
        "Synthetic USB handoff completed",
      );
      expect(sent.status).toBe("sent");
      const receipt = governance.issueReceipt(admin, requested.id);
      expect(receipt.packageHash).toBe("1".repeat(64));
      expect(receipt.signatureBase64).toBeTruthy();
      const acknowledged = governance.acknowledgeReceipt(
        admin,
        receipt.id,
        "Synthetic recipient acknowledged receipt",
      );
      expect(acknowledged.acknowledgedAt).toBe("2030-02-01T10:00:00.000Z");
      expect(governance.listDisclosures(admin)[0]?.status).toBe("acknowledged");
      expect(governance.listReceipts(admin)[0]?.id).toBe(receipt.id);
    } finally {
      database.close();
    }
  });
});
