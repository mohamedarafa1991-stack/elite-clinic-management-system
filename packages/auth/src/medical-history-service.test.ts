import { describe, expect, it } from "vitest";
import { openDatabase } from "@elite/database";
import { AuthService } from "./index.js";
import { MedicalHistoryService } from "./medical-history-service.js";
import { PatientIdentityService } from "./patient-service.js";

const bootstrapInput = {
  admins: [
    {
      username: "admin.history.primary",
      password: "Synthetic-History-Primary-2026!",
      displayNameEn: "Synthetic History Primary",
    },
    {
      username: "admin.history.backup",
      password: "Synthetic-History-Backup-2026!",
      displayNameEn: "Synthetic History Backup",
    },
  ],
  hubDevice: {
    friendlyName: "Synthetic History Hub",
    appVersion: "0.1.0-test",
  },
};

describe("MedicalHistoryService", () => {
  it("creates, updates, lists, and soft-inactivates patient history with audit linkage", async () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    try {
      const auth = new AuthService(database);
      const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
      const context = await auth.login({
        username: bootstrapInput.admins[0]!.username,
        password: bootstrapInput.admins[0]!.password,
        deviceId: bootstrap.hubDeviceId,
      });
      const patients = new PatientIdentityService(database);
      const history = new MedicalHistoryService(database, {
        now: () => "2030-01-01T10:00:00.000Z",
      });
      const patient = patients.registerPatient(context, {
        registrationMode: "full",
        nameEn: "Synthetic History Patient",
        phone: "+201000000077",
      });

      const created = history.create(context, patient.patient.patientId, {
        category: "allergy",
        title: "Synthetic penicillin allergy",
        details: "Synthetic rash reported after prior exposure.",
        onsetDate: "2028-04-12",
        status: "active",
        source: "patient-reported",
      });
      expect(created.patientId).toBe(patient.patient.patientId);
      expect(created.version).toBe(1);
      expect(history.list(context, patient.patient.patientId)).toHaveLength(1);

      const updated = history.update(
        context,
        patient.patient.patientId,
        created.id,
        {
          category: "allergy",
          title: "Synthetic penicillin allergy",
          details: "Updated synthetic reaction details.",
          onsetDate: "2028-04-12",
          status: "active",
          source: "clinician-recorded",
        },
        created.version,
      );
      expect(updated.version).toBe(2);
      expect(updated.source).toBe("clinician-recorded");
      expect(() =>
        history.update(
          context,
          patient.patient.patientId,
          created.id,
          {
            category: "allergy",
            title: "Stale synthetic update",
            details: "Should not overwrite the newer version.",
            status: "active",
            source: "clinician-recorded",
          },
          created.version,
        ),
      ).toThrow("ELITE_MEDICAL_HISTORY_VERSION_CONFLICT");

      expect(() =>
        history.archive(
          context,
          patient.patient.patientId,
          created.id,
          updated.version,
          "x",
        ),
      ).toThrow();
      history.archive(
        context,
        patient.patient.patientId,
        created.id,
        updated.version,
        "Synthetic correction completed",
      );
      expect(history.list(context, patient.patient.patientId)[0]?.status).toBe(
        "inactive",
      );
      const audit = database.raw
        .prepare(
          "SELECT action, patient_id FROM audit_events WHERE entity_type = 'medical-history' ORDER BY occurred_at",
        )
        .all() as Array<{ action: string; patient_id: string }>;
      expect(audit.map((row) => row.action)).toEqual([
        "medical-history.create",
        "medical-history.update",
        "medical-history.archive",
      ]);
      expect(audit.every((row) => row.patient_id === patient.patient.id)).toBe(
        true,
      );
    } finally {
      database.close();
    }
  });
});
