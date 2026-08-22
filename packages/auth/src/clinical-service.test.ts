import { describe, expect, it } from "vitest";
import { openDatabase } from "@elite/database";
import { AuthService, type SessionContext } from "./index.js";
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

function insertSyntheticDoctor(
  database: ReturnType<typeof openDatabase>,
  id: string,
  username: string,
  displayNameEn: string,
): void {
  const timestamp = "2030-01-01T00:00:00.000Z";
  database.raw
    .prepare(
      `INSERT INTO users (id, username, display_name_en, display_name_ar, role, capabilities_json, is_clinical_approver, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 'doctor', ?, 1, 1, ?, ?)`,
    )
    .run(id, username, displayNameEn, null, "[]", timestamp, timestamp);
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
      const doctorId = "synthetic-doctor-appointment";
      insertSyntheticDoctor(
        fixture.database,
        doctorId,
        "synthetic.doctor.appointment",
        "Synthetic Appointment Doctor",
      );
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

it("manages recurring schedules and scoped exceptions with overlap guards", async () => {
  const fixture = await createFixture();
  try {
    const specialty = fixture.clinical.createSpecialty(fixture.context, {
      code: "ENT",
      nameEn: "ENT",
    });
    const department = fixture.clinical.createDepartment(fixture.context, {
      specialtyId: specialty.id,
      code: "ENT-OPD",
      nameEn: "ENT outpatient",
    });
    const doctorId = "synthetic-doctor-schedule";
    insertSyntheticDoctor(
      fixture.database,
      doctorId,
      "synthetic.doctor.schedule",
      "Synthetic Schedule Doctor",
    );
    const schedule = {
      doctorId,

      departmentId: department.id,
      dayOfWeek: 6,
      startTime: "09:00",
      endTime: "13:00",
      slotDurationMinutes: 15,
    } as const;
    fixture.clinical.createSchedule(fixture.context, schedule);
    expect(fixture.clinical.listSchedules(fixture.context)).toHaveLength(1);
    expect(() =>
      fixture.clinical.createSchedule(fixture.context, {
        ...schedule,
        startTime: "12:00",
        endTime: "14:00",
      }),
    ).toThrow("ELITE_SCHEDULE_OVERLAP");
    expect(() =>
      fixture.clinical.createScheduleException(fixture.context, {
        departmentId: department.id,
        exceptionDate: "2030-01-11",
        kind: "open",
        reason: "Missing open hours",
      }),
    ).toThrow("ELITE_SCHEDULE_EXCEPTION_RANGE_REQUIRED");
    fixture.clinical.createScheduleException(fixture.context, {
      departmentId: department.id,
      exceptionDate: "2030-01-11",
      kind: "closed",
      reason: "Synthetic clinic closure",
    });
    expect(
      fixture.clinical.listScheduleExceptions(fixture.context),
    ).toHaveLength(1);
    const listed = fixture.clinical.listSchedules(fixture.context)[0]!;
    fixture.clinical.deleteSchedule(
      fixture.context,
      listed.id,
      "Synthetic schedule cleanup",
    );
    const exception = fixture.clinical.listScheduleExceptions(
      fixture.context,
    )[0]!;
    fixture.clinical.deleteScheduleException(
      fixture.context,
      exception.id,
      "Synthetic exception cleanup",
    );
    expect(fixture.clinical.listSchedules(fixture.context)).toHaveLength(0);
    expect(
      fixture.clinical.listScheduleExceptions(fixture.context),
    ).toHaveLength(0);
  } finally {
    fixture.database.close();
  }
});

it("lists active doctors and filters calendar appointments by doctor and range", async () => {
  const fixture = await createFixture();
  try {
    const timestamp = "2030-01-01T00:00:00.000Z";
    fixture.database.raw
      .prepare(
        `INSERT INTO users (id, username, display_name_en, display_name_ar, role, capabilities_json, is_clinical_approver, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 'doctor', ?, 1, 1, ?, ?)`,
      )
      .run(
        "synthetic-doctor-001",
        "synthetic.doctor.one",
        "Synthetic Doctor One",
        null,
        "[]",
        timestamp,
        timestamp,
      );
    fixture.database.raw
      .prepare(
        `INSERT INTO users (id, username, display_name_en, display_name_ar, role, capabilities_json, is_clinical_approver, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 'doctor', ?, 0, 0, ?, ?)`,
      )
      .run(
        "synthetic-doctor-002",
        "synthetic.doctor.two",
        "Synthetic Inactive Doctor",
        null,
        "[]",
        timestamp,
        timestamp,
      );

    const doctors = fixture.clinical.listDoctors(fixture.context);
    expect(doctors).toEqual([
      expect.objectContaining({
        id: "synthetic-doctor-001",
        displayNameEn: "Synthetic Doctor One",
        role: "doctor",
        isClinicalApprover: true,
        isActive: true,
      }),
    ]);

    const specialty = fixture.clinical.createSpecialty(fixture.context, {
      code: "CAL",
      nameEn: "Calendar Specialty",
    });
    const department = fixture.clinical.createDepartment(fixture.context, {
      specialtyId: specialty.id,
      code: "CAL-OPD",
      nameEn: "Calendar Outpatient",
    });
    const patient = fixture.patients.registerPatient(fixture.context, {
      registrationMode: "full",
      nameEn: "Synthetic Calendar Patient",
      phone: "+201000000099",
    });
    fixture.clinical.createAppointment(fixture.context, {
      patientId: patient.patient.patientId,
      departmentId: department.id,
      doctorId: "synthetic-doctor-001",
      scheduledStart: "2030-01-05T10:00:00.000Z",
      durationMinutes: 30,
      visitType: "calendar consultation",
      isWalkIn: false,
    });
    fixture.clinical.createAppointment(fixture.context, {
      patientId: patient.patient.patientId,
      departmentId: department.id,
      scheduledStart: "2030-01-06T10:00:00.000Z",
      durationMinutes: 15,
      visitType: "unassigned consultation",
      isWalkIn: false,
    });

    const filtered = fixture.clinical.listAppointments(
      fixture.context,
      "2030-01-05T00:00:00.000Z",
      "2030-01-06T00:00:00.000Z",
      "synthetic-doctor-001",
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.doctorId).toBe("synthetic-doctor-001");
    expect(
      fixture.clinical.listAppointments(
        fixture.context,
        "2030-01-06T00:00:00.000Z",
        "2030-01-07T00:00:00.000Z",
        "synthetic-doctor-001",
      ),
    ).toHaveLength(0);
  } finally {
    fixture.database.close();
  }
});

it("separates front-desk scheduling metadata from clinical records", async () => {
  const fixture = await createFixture();
  try {
    const specialty = fixture.clinical.createSpecialty(fixture.context, {
      code: "FRONT",
      nameEn: "Front Desk Specialty",
    });
    const department = fixture.clinical.createDepartment(fixture.context, {
      specialtyId: specialty.id,
      code: "FRONT-OPD",
      nameEn: "Front Desk Outpatient",
    });
    fixture.clinical.createService(fixture.context, {
      departmentId: department.id,
      code: "FRONT-CONSULT",
      nameEn: "Front Desk Consultation",
      durationMinutes: 15,
      priceEgp: 200,
    });
    const receptionistContext: SessionContext = {
      ...fixture.context,
      role: "receptionist",
      capabilities: ["appointment.read", "appointment.write"],
    };
    expect(fixture.clinical.listDepartments(receptionistContext)).toHaveLength(
      1,
    );
    expect(fixture.clinical.listServices(receptionistContext)).toHaveLength(1);
    expect(() => fixture.clinical.listSpecialties(receptionistContext)).toThrow(
      "ELITE_AUTH_CAPABILITY_REQUIRED: clinical.read",
    );
    expect(() => fixture.clinical.listSchedules(receptionistContext)).toThrow(
      "ELITE_AUTH_CAPABILITY_REQUIRED: clinical.read",
    );
    expect(() =>
      fixture.clinical.listScheduleExceptions(receptionistContext),
    ).toThrow("ELITE_AUTH_CAPABILITY_REQUIRED: clinical.read");
  } finally {
    fixture.database.close();
  }
});

describe("Appointment waitlist", () => {
  it("creates, lists, transitions, and audits a waitlist entry", async () => {
    const fixture = await createFixture();
    try {
      const specialty = fixture.clinical.createSpecialty(fixture.context, {
        code: "WAIT",
        nameEn: "Waitlist specialty",
      });
      const department = fixture.clinical.createDepartment(fixture.context, {
        specialtyId: specialty.id,
        code: "WAIT-OPD",
        nameEn: "Waitlist outpatient",
      });
      const patient = fixture.patients.registerPatient(fixture.context, {
        registrationMode: "quick",
        nameEn: "Synthetic Waitlist Patient",
        phone: "+201000000099",
      });
      const entry = fixture.clinical.createWaitlistEntry(fixture.context, {
        patientId: patient.patient.patientId,
        departmentId: department.id,
        preferredDate: "2030-02-01",
        preferredStartTime: "10:30",
        notes: "Synthetic morning preference",
      });
      expect(entry.status).toBe("active");
      expect(fixture.clinical.listWaitlist(fixture.context, "active")).toEqual([
        entry,
      ]);

      const contacted = fixture.clinical.updateWaitlistStatus(
        fixture.context,
        entry.id,
        { status: "contacted", reason: "Synthetic patient contacted" },
      );
      expect(contacted.status).toBe("contacted");
      const cancelled = fixture.clinical.updateWaitlistStatus(
        fixture.context,
        entry.id,
        { status: "cancelled", reason: "Synthetic waitlist cleanup" },
      );
      expect(cancelled.status).toBe("cancelled");
      expect(
        fixture.clinical.listWaitlist(fixture.context, "active"),
      ).toHaveLength(0);
      expect(() =>
        fixture.clinical.updateWaitlistStatus(fixture.context, entry.id, {
          status: "contacted",
          reason: "Invalid terminal transition",
        }),
      ).toThrow("ELITE_WAITLIST_INVALID_STATUS_TRANSITION");
      const audit = fixture.database.raw
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_events WHERE action LIKE 'waitlist.%'",
        )
        .get() as { count: number };
      expect(Number(audit.count)).toBe(3);
    } finally {
      fixture.database.close();
    }
  });
});
