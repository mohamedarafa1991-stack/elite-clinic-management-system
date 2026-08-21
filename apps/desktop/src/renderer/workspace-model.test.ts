import { describe, expect, it } from "vitest";
import type {
  Appointment,
  DoctorDirectoryEntry,
  Patient,
  Schedule,
  ScheduleException,
} from "@elite/contracts";
import {
  getPatientAge,
  getDoctorsScheduledToday,
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

  it("projects doctors scheduled today while honoring date exceptions", () => {
    const doctors: readonly DoctorDirectoryEntry[] = [
      {
        id: "doctor-a",
        displayNameEn: "Dr Amal",
        role: "doctor",
        isClinicalApprover: false,
        isActive: true,
      },
      {
        id: "doctor-b",
        displayNameEn: "Dr Bassem",
        role: "doctor",
        isClinicalApprover: false,
        isActive: true,
      },
    ];
    const schedules: readonly Schedule[] = [
      {
        id: "schedule-a",
        doctorId: "doctor-a",
        departmentId: "department-1",
        dayOfWeek: 3,
        startTime: "09:00",
        endTime: "17:00",
        slotDurationMinutes: 15,
        version: 1,
      },
      {
        id: "schedule-b",
        doctorId: "doctor-b",
        departmentId: "department-1",
        dayOfWeek: 3,
        startTime: "10:00",
        endTime: "18:00",
        slotDurationMinutes: 15,
        version: 1,
      },
    ];
    const exceptions: readonly ScheduleException[] = [
      {
        id: "exception-a",
        doctorId: "doctor-a",
        exceptionDate: "2026-08-19",
        kind: "closed",
        reason: "Leave",
        createdAt: "2026-08-01T08:00:00.000Z",
      },
    ];

    expect(
      getDoctorsScheduledToday(doctors, schedules, exceptions, referenceDate),
    ).toEqual([
      {
        doctor: doctors[1],
        windows: ["10:00–18:00"],
      },
    ]);
    expect(
      getDoctorsScheduledToday(
        doctors,
        schedules,
        [
          {
            id: "exception-open",
            exceptionDate: "2026-08-19",
            kind: "open",
            reason: "Extra clinic",
            createdAt: "2026-08-01T08:00:00.000Z",
          },
        ],
        referenceDate,
      ),
    ).toEqual([
      {
        doctor: doctors[0],
        windows: ["09:00–17:00"],
      },
      {
        doctor: doctors[1],
        windows: ["10:00–18:00"],
      },
    ]);
  });
});
