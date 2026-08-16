import { describe, expect, it } from "vitest";
import { openDatabase } from "@elite/database";
import { AuthService } from "./index.js";
import { ClinicalWorkflowService } from "./clinical-service.js";
import { PatientIdentityService } from "./patient-service.js";

const bootstrapInput = {
  admins: [
    {
      username: "admin.clinical.primary",
      password: "Synthetic-Clinical-Primary-2026!",
      displayNameEn: "Synthetic Clinical Primary",
    },
    {
      username: "admin.clinical.backup",
      password: "Synthetic-Clinical-Backup-2026!",
      displayNameEn: "Synthetic Clinical Backup",
    },
  ],
  hubDevice: {
    friendlyName: "Synthetic Clinical Hub",
    appVersion: "0.1.0-test",
  },
};

async function createFixture() {
  const database = openDatabase({ filename: ":memory:", mode: "test" });
  const auth = new AuthService(database);
  const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
  const context = await auth.login({
    username: bootstrapInput.admins[0]!.username,
    password: bootstrapInput.admins[0]!.password,
    deviceId: bootstrap.hubDeviceId,
  });
  return {
    database,
    context,
    clinical: new ClinicalWorkflowService(database),
    patients: new PatientIdentityService(database),
  };
}

describe("Step 5 clinical workflow service", () => {
  it("configures a specialty, department, service, and books with service duration", async () => {
    const fixture = await createFixture();
    try {
      const specialty = fixture.clinical.createSpecialty(fixture.context, {
        code: "CARD",
        nameEn: "Cardiology",
      });
      const department = fixture.clinical.createDepartment(fixture.context, {
        specialtyId: specialty.id,
        code: "CARD-OPD",
        nameEn: "Cardiology Outpatient",
      });
      const service = fixture.clinical.createService(fixture.context, {
        departmentId: department.id,
        code: "CARD-CONSULT",
        nameEn: "Cardiology consultation",
        durationMinutes: 30,
        priceEgp: 500,
      });
      const patient = fixture.patients.registerPatient(fixture.context, {
        registrationMode: "full",
        nameEn: "Synthetic Clinical Patient",
        phone: "+201000000012",
      });
      const appointment = fixture.clinical.createAppointment(fixture.context, {
        patientId: patient.patient.patientId,
        departmentId: department.id,
        serviceId: service.id,
        scheduledStart: "2030-01-05T10:00:00.000Z",
        visitType: "consultation",
        isWalkIn: false,
      });
      expect(appointment.durationMinutes).toBe(30);
      expect(new Date(appointment.scheduledEnd).toISOString()).toBe(
        "2030-01-05T10:30:00.000Z",
      );
      expect(fixture.clinical.listAppointments(fixture.context)).toHaveLength(
        1,
      );
    } finally {
      fixture.database.close();
    }
  });

  it("rejects overlapping doctor appointments and enforces status transitions", async () => {
    const fixture = await createFixture();
    try {
      const specialty = fixture.clinical.createSpecialty(fixture.context, {
        code: "DERM",
        nameEn: "Dermatology",
      });
      const department = fixture.clinical.createDepartment(fixture.context, {
        specialtyId: specialty.id,
        code: "DERM-OPD",
        nameEn: "Dermatology",
      });
      const doctorId = fixture.context.userId;
      const patientOne = fixture.patients.registerPatient(fixture.context, {
        registrationMode: "full",
        nameEn: "Synthetic Appointment One",
        phone: "+201000000013",
      });
      const patientTwo = fixture.patients.registerPatient(fixture.context, {
        registrationMode: "full",
        nameEn: "Synthetic Appointment Two",
        phone: "+201000000014",
      });
      const first = fixture.clinical.createAppointment(fixture.context, {
        patientId: patientOne.patient.patientId,
        departmentId: department.id,
        doctorId,
        scheduledStart: "2030-01-06T10:00:00.000Z",
        durationMinutes: 15,
        visitType: "consultation",
        isWalkIn: false,
      });
      expect(() =>
        fixture.clinical.createAppointment(fixture.context, {
          patientId: patientTwo.patient.patientId,
          departmentId: department.id,
          doctorId,
          scheduledStart: "2030-01-06T10:05:00.000Z",
          durationMinutes: 15,
          visitType: "consultation",
          isWalkIn: false,
        }),
      ).toThrow("ELITE_APPOINTMENT_CONFLICT");
      const arrived = fixture.clinical.updateAppointmentStatus(
        fixture.context,
        first.id,
        { status: "arrived", reason: "Synthetic check-in" },
      );
      expect(arrived.status).toBe("arrived");
      const started = fixture.clinical.updateAppointmentStatus(
        fixture.context,
        first.id,
        { status: "in-consultation", reason: "Synthetic start" },
      );
      expect(started.status).toBe("in-consultation");
      const completed = fixture.clinical.updateAppointmentStatus(
        fixture.context,
        first.id,
        { status: "completed", reason: "Synthetic completion" },
      );
      expect(completed.status).toBe("completed");
      expect(() =>
        fixture.clinical.updateAppointmentStatus(fixture.context, first.id, {
          status: "cancelled",
          reason: "Too late",
        }),
      ).toThrow("ELITE_APPOINTMENT_INVALID_STATUS_TRANSITION");
    } finally {
      fixture.database.close();
    }
  });
});
