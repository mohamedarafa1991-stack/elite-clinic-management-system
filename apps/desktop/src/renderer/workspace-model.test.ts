import { describe, expect, it } from "vitest";
import type { Appointment, Patient } from "@elite/contracts";
import {
  getPatientAge,
  getPatientContextModel,
  getTodayAppointmentMetrics,
  sortAppointmentsByStart,
} from "./workspace-model.js";

const referenceDate = new Date("2026-08-19T12:00:00.000Z");

const patientFixture: Patient = {
  id: "patient-1",
  patientId: "EL-00001",
  nameEn: "Mariam Hassan",
  nameAr: "مريم حسن",
  dob: "2000-08-20",
  sex: "female",
  phone: "+201000000001",
  relatedPersonIds: [],
  registrationMode: "full",
  completenessStatus: "complete",
  status: "active",
  createdAt: "2026-01-01T08:00:00.000Z",
  createdByUserId: "user-1",
  updatedAt: "2026-01-01T08:00:00.000Z",
  updatedByUserId: "user-1",
  version: 1,
  schemaVersion: 1,
};

function appointmentFixture(
  id: string,
  scheduledStart: string,
  status: Appointment["status"],
): Appointment {
  return {
    id,
    patientId: "EL-00001",
    departmentId: "department-1",
    doctorId: "doctor-1",
    scheduledStart,
    scheduledEnd: new Date(
      new Date(scheduledStart).getTime() + 30 * 60 * 1000,
    ).toISOString(),
    durationMinutes: 30,
    status,
    visitType: "Consultation",
    isWalkIn: false,
    createdAt: "2026-01-01T08:00:00.000Z",
    createdByUserId: "user-1",
    updatedAt: "2026-01-01T08:00:00.000Z",
    updatedByUserId: "user-1",
    version: 1,
  };
}

describe("workspace model", () => {
  it("keeps age calculation deterministic around the birthday boundary", () => {
    expect(getPatientAge("2000-08-20", referenceDate)).toBe(25);
    expect(getPatientAge("2000-08-19", referenceDate)).toBe(26);
    expect(getPatientAge(undefined, referenceDate)).toBeNull();
    expect(getPatientAge("not-a-date", referenceDate)).toBeNull();
  });

  it("prefers Arabic names in Arabic locale and exposes a warning status for archived patients", () => {
    const context = getPatientContextModel(
      { ...patientFixture, status: "archived" },
      "ar-EG",
      referenceDate,
    );

    expect(context).toEqual({
      primaryName: "مريم حسن",
      secondaryName: "Mariam Hassan",
      age: 25,
      statusClass: "warn",
    });
  });

  it("falls back to the English name when Arabic is missing", () => {
    const context = getPatientContextModel(
      { ...patientFixture, nameAr: undefined },
      "ar-EG",
      referenceDate,
    );

    expect(context.primaryName).toBe("Mariam Hassan");
    expect(context.secondaryName).toBeUndefined();
  });

  it("sorts without mutating the source appointment collection", () => {
    const late = appointmentFixture(
      "appointment-late",
      "2026-08-19T11:00:00.000Z",
      "scheduled",
    );
    const early = appointmentFixture(
      "appointment-early",
      "2026-08-19T09:00:00.000Z",
      "arrived",
    );
    const source = [late, early] as const;

    expect(sortAppointmentsByStart(source).map((item) => item.id)).toEqual([
      "appointment-early",
      "appointment-late",
    ]);
    expect(source.map((item) => item.id)).toEqual([
      "appointment-late",
      "appointment-early",
    ]);
  });

  it("computes waiting, completed, and next actionable appointment counts", () => {
    const appointments = [
      appointmentFixture("completed", "2026-08-19T08:00:00.000Z", "completed"),
      appointmentFixture("arrived", "2026-08-19T09:00:00.000Z", "arrived"),
      appointmentFixture("cancelled", "2026-08-19T10:00:00.000Z", "cancelled"),
      appointmentFixture("next", "2026-08-19T13:00:00.000Z", "scheduled"),
    ];

    const metrics = getTodayAppointmentMetrics(appointments, referenceDate);

    expect(metrics.waitingCount).toBe(1);
    expect(metrics.completedCount).toBe(1);
    expect(metrics.nextAppointment?.id).toBe("next");
  });
});
