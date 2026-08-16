import { describe, expect, it } from "vitest";
import { openDatabase } from "@elite/database";
import { AuthService, type SessionContext } from "./index.js";
import { ClinicalWorkflowService } from "./clinical-service.js";
import { EncounterService } from "./encounter-service.js";
import { PatientIdentityService } from "./patient-service.js";

const bootstrapInput = {
  admins: [
    {
      username: "admin.encounter.primary",
      password: "Synthetic-Encounter-Primary-2026!",
      displayNameEn: "Synthetic Encounter Primary",
    },
    {
      username: "admin.encounter.backup",
      password: "Synthetic-Encounter-Backup-2026!",
      displayNameEn: "Synthetic Encounter Backup",
    },
  ],
  hubDevice: {
    friendlyName: "Synthetic Encounter Hub",
    appVersion: "0.1.0-test",
  },
};

function insertDoctor(
  database: ReturnType<typeof openDatabase>,
  id: string,
  username: string,
  name: string,
): void {
  const timestamp = "2030-01-01T00:00:00.000Z";
  database.raw
    .prepare(
      `INSERT INTO users (id, username, display_name_en, display_name_ar, role, capabilities_json, is_clinical_approver, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 'doctor', ?, 1, 1, ?, ?)`,
    )
    .run(
      id,
      username,
      name,
      null,
      JSON.stringify([
        "clinical.read",
        "clinical.write",
        "clinical.sign",
        "clinical.approve",
        "appointment.read",
        "appointment.write",
      ]),
      timestamp,
      timestamp,
    );
}

function doctorContext(
  adminContext: SessionContext,
  userId: string,
  username: string,
): SessionContext {
  return {
    ...adminContext,
    userId,
    username,
    role: "doctor",
    capabilities: [
      "clinical.read",
      "clinical.write",
      "clinical.sign",
      "clinical.approve",
      "appointment.read",
      "appointment.write",
    ],
  };
}

describe("EncounterService", () => {
  it("supports ICD-10-linked diagnosis approval and immutable signed encounters", async () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    try {
      const auth = new AuthService(database);
      const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
      const adminContext = await auth.login({
        username: bootstrapInput.admins[0]!.username,
        password: bootstrapInput.admins[0]!.password,
        deviceId: bootstrap.hubDeviceId,
      });
      insertDoctor(
        database,
        "synthetic-encounter-doctor-1",
        "synthetic.encounter.doctor1",
        "Synthetic Encounter Doctor One",
      );
      insertDoctor(
        database,
        "synthetic-encounter-doctor-2",
        "synthetic.encounter.doctor2",
        "Synthetic Encounter Doctor Two",
      );
      const author = doctorContext(
        adminContext,
        "synthetic-encounter-doctor-1",
        "synthetic.encounter.doctor1",
      );
      const approver = doctorContext(
        adminContext,
        "synthetic-encounter-doctor-2",
        "synthetic.encounter.doctor2",
      );
      const patients = new PatientIdentityService(database);
      const clinical = new ClinicalWorkflowService(database);
      const encounters = new EncounterService(database, {
        now: () => "2030-01-05T10:00:00.000Z",
      });
      const specialty = clinical.createSpecialty(adminContext, {
        code: "ENC",
        nameEn: "Encounter Specialty",
      });
      const department = clinical.createDepartment(adminContext, {
        specialtyId: specialty.id,
        code: "ENC-OPD",
        nameEn: "Encounter Outpatient",
      });
      const patient = patients.registerPatient(adminContext, {
        registrationMode: "full",
        nameEn: "Synthetic Encounter Patient",
        phone: "+201000000088",
      });
      const appointment = clinical.createAppointment(adminContext, {
        patientId: patient.patient.patientId,
        departmentId: department.id,
        doctorId: author.userId,
        scheduledStart: "2030-01-05T10:00:00.000Z",
        durationMinutes: 30,
        visitType: "synthetic consultation",
        isWalkIn: false,
      });
      const code = encounters.createIcd10Code(adminContext, {
        code: "J06.9",
        titleEn: "Acute upper respiratory infection, unspecified",
        releaseVersion: "synthetic-2026",
      });
      expect(encounters.listIcd10Codes(author)).toHaveLength(1);

      const draft = encounters.createEncounter(author, appointment.id, {
        subjective: "Synthetic cough for three days.",
        assessment: "Synthetic upper respiratory symptoms.",
      });
      expect(draft.status).toBe("draft");
      const updated = encounters.updateEncounter(
        author,
        draft.id,
        {
          subjective: "Updated synthetic cough history.",
          assessment: "Synthetic upper respiratory symptoms.",
          plan: "Synthetic supportive care.",
        },
        draft.version,
      );
      expect(updated.version).toBe(2);
      expect(() =>
        encounters.updateEncounter(
          author,
          draft.id,
          { assessment: "Stale synthetic update" },
          draft.version,
        ),
      ).toThrow("ELITE_ENCOUNTER_VERSION_CONFLICT");

      const diagnosis = encounters.createDiagnosis(author, draft.id, {
        icd10CodeId: code.id,
        diagnosisTextEn: "Acute upper respiratory infection",
        isPrimary: true,
      });
      expect(diagnosis.approvalStatus).toBe("pending");
      const approved = encounters.approveDiagnosis(
        approver,
        diagnosis.id,
        "approved",
        "Synthetic second-Doctor approval",
        diagnosis.version,
      );
      expect(approved.approvalStatus).toBe("approved");
      const signed = encounters.signEncounter(
        author,
        draft.id,
        updated.version,
      );
      expect(signed.status).toBe("signed");
      expect(() =>
        encounters.updateEncounter(
          author,
          draft.id,
          { assessment: "Attempted signed overwrite" },
          signed.version,
        ),
      ).toThrow("ELITE_ENCOUNTER_SIGNED_IMMUTABLE");

      const amendment = encounters.createAmendment(author, signed.id, {
        subjective: "Corrected synthetic cough history.",
        objective: "Corrected synthetic examination.",
        assessment: "Corrected synthetic assessment.",
        plan: "Corrected synthetic plan.",
        correctionReason: "Corrected an omission in the signed clinical note",
      });
      expect(amendment.status).toBe("pending");
      expect(amendment.baseEncounterVersion).toBe(signed.version);
      expect(() =>
        encounters.reviewAmendment(
          author,
          amendment.id,
          "approved",
          "Self review is not permitted",
          amendment.version,
        ),
      ).toThrow("ELITE_AMENDMENT_SEPARATION_REQUIRED");
      const approvedAmendment = encounters.reviewAmendment(
        approver,
        amendment.id,
        "approved",
        "Synthetic independent Doctor review",
        amendment.version,
      );
      expect(approvedAmendment.status).toBe("approved");
      const appliedAmendment = encounters.applyAmendment(
        approver,
        amendment.id,
        approvedAmendment.version,
      );
      expect(appliedAmendment.status).toBe("applied");
      expect(encounters.listAmendments(author, signed.id)[0]?.status).toBe(
        "applied",
      );
      const original = encounters.getEncounterForAppointment(
        author,
        appointment.id,
      );
      expect(original?.status).toBe("signed");
      expect(original?.version).toBe(signed.version);
    } finally {
      database.close();
    }
  });
});
