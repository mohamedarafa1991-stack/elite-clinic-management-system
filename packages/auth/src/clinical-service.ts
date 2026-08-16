import { nanoid } from "nanoid";
import { z } from "zod";
import {
  appointmentCreateInputSchema,
  appointmentSchema,
  appointmentStatusUpdateSchema,
  type Appointment,
  type AppointmentCreateInput,
  type AppointmentStatusUpdate,
  departmentSchema,
  scheduleExceptionInputSchema,
  scheduleExceptionSchema,
  scheduleInputSchema,
  scheduleSchema,
  serviceSchema,
  specialtySchema,
  type Department,
  type Schedule,
  type ScheduleException,
  type ScheduleExceptionInput,
  type ScheduleInput,
  type Service,
  type Specialty,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import { requireCapability, type SessionContext } from "./index.js";

const specialtyInputSchema = z.object({
  code: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().max(160).optional(),
  sortOrder: z.number().int().default(0),
});
const departmentInputSchema = z.object({
  specialtyId: z.string().min(8).max(128),
  code: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().max(160).optional(),
});
const serviceInputSchema = z.object({
  departmentId: z.string().min(8).max(128),
  code: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().min(1).max(160),
  nameAr: z.string().trim().max(160).optional(),
  durationMinutes: z.number().int().min(5).max(480).default(15),
  priceEgp: z.number().int().nonnegative().default(0),
});

function now(): string {
  return new Date().toISOString();
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function mapSpecialty(row: Record<string, any>): Specialty {
  return specialtySchema.parse({
    id: String(row["id"]),
    code: String(row["code"]),
    nameEn: String(row["name_en"]),
    ...(row["name_ar"] ? { nameAr: String(row["name_ar"]) } : {}),
    status: row["status"],
    sortOrder: Number(row["sort_order"]),
    version: Number(row["version"]),
  });
}

function mapDepartment(row: Record<string, any>): Department {
  return departmentSchema.parse({
    id: String(row["id"]),
    specialtyId: String(row["specialty_id"]),
    code: String(row["code"]),
    nameEn: String(row["name_en"]),
    ...(row["name_ar"] ? { nameAr: String(row["name_ar"]) } : {}),
    status: row["status"],
    version: Number(row["version"]),
  });
}

function mapService(row: Record<string, any>): Service {
  return serviceSchema.parse({
    id: String(row["id"]),
    departmentId: String(row["department_id"]),
    code: String(row["code"]),
    nameEn: String(row["name_en"]),
    ...(row["name_ar"] ? { nameAr: String(row["name_ar"]) } : {}),
    durationMinutes: Number(row["duration_minutes"]),
    priceEgp: Number(row["price_egp"]),
    status: row["status"],
    version: Number(row["version"]),
  });
}

function mapAppointment(row: Record<string, any>): Appointment {
  return appointmentSchema.parse({
    id: String(row["id"]),
    patientId: String(row["patient_display_id"] ?? row["patient_id"]),
    departmentId: String(row["department_id"]),
    ...(row["doctor_id"] ? { doctorId: String(row["doctor_id"]) } : {}),
    ...(row["service_id"] ? { serviceId: String(row["service_id"]) } : {}),
    scheduledStart: String(row["scheduled_start"]),
    scheduledEnd: String(row["scheduled_end"]),
    durationMinutes: Number(row["duration_minutes"] ?? 15),
    status: row["status"],
    visitType: String(row["visit_type"]),
    isWalkIn: Number(row["is_walk_in"]) === 1,
    ...(row["notes"] ? { notes: String(row["notes"]) } : {}),
    createdAt: String(row["created_at"]),
    createdByUserId: String(row["created_by_user_id"]),
    updatedAt: String(row["updated_at"]),
    updatedByUserId: String(row["updated_by_user_id"]),
    version: Number(row["version"]),
  });
}

export class ClinicalWorkflowService {
  public constructor(private readonly database: EliteDatabase) {}

  public createSpecialty(context: SessionContext, input: unknown): Specialty {
    requireCapability(context, "module.manage");
    const parsed = specialtyInputSchema.parse(input);
    const timestamp = now();
    const id = nanoid(18);
    this.database.raw
      .prepare(
        `INSERT INTO specialties (id, code, name_en, name_ar, sort_order, created_at, created_by_user_id, updated_at, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        parsed.code,
        parsed.nameEn,
        parsed.nameAr ?? null,
        parsed.sortOrder,
        timestamp,
        context.userId,
        timestamp,
        context.userId,
      );
    return this.getSpecialty(id);
  }

  public listSpecialties(context: SessionContext): readonly Specialty[] {
    requireCapability(context, "clinical.read");
    return (
      this.database.raw
        .prepare("SELECT * FROM specialties ORDER BY sort_order, name_en")
        .all() as Array<Record<string, any>>
    ).map(mapSpecialty);
  }

  public archiveSpecialty(
    context: SessionContext,
    id: string,
    reason: string,
  ): void {
    requireCapability(context, "module.manage");
    const parsedReason = z.string().trim().min(3).max(500).parse(reason);
    const result = this.database.raw
      .prepare(
        "UPDATE specialties SET status = 'archived', updated_at = ?, updated_by_user_id = ?, version = version + 1 WHERE id = ? AND status = 'active'",
      )
      .run(now(), context.userId, id);
    if (result.changes !== 1)
      throw new Error(
        "ELITE_SPECIALTY_NOT_ACTIVE: specialty is missing or archived",
      );
    this.writeClinicalAudit(context, "specialty.archive", id, {
      reason: parsedReason,
    });
  }

  public createDepartment(context: SessionContext, input: unknown): Department {
    requireCapability(context, "module.manage");
    const parsed = departmentInputSchema.parse(input);
    if (
      !this.database.raw
        .prepare(
          "SELECT id FROM specialties WHERE id = ? AND status = 'active'",
        )
        .get(parsed.specialtyId)
    )
      throw new Error(
        "ELITE_SPECIALTY_NOT_ACTIVE: specialty is missing or archived",
      );
    const timestamp = now();
    const id = nanoid(18);
    this.database.raw
      .prepare(
        `INSERT INTO departments (id, specialty_id, code, name_en, name_ar, created_at, created_by_user_id, updated_at, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        parsed.specialtyId,
        parsed.code,
        parsed.nameEn,
        parsed.nameAr ?? null,
        timestamp,
        context.userId,
        timestamp,
        context.userId,
      );
    return this.getDepartment(id);
  }

  public listDepartments(context: SessionContext): readonly Department[] {
    requireCapability(context, "clinical.read");
    return (
      this.database.raw
        .prepare("SELECT * FROM departments ORDER BY name_en")
        .all() as Array<Record<string, any>>
    ).map(mapDepartment);
  }

  public createService(context: SessionContext, input: unknown): Service {
    requireCapability(context, "module.manage");
    const parsed = serviceInputSchema.parse(input);
    if (
      !this.database.raw
        .prepare(
          "SELECT id FROM departments WHERE id = ? AND status = 'active'",
        )
        .get(parsed.departmentId)
    )
      throw new Error(
        "ELITE_DEPARTMENT_NOT_ACTIVE: department is missing or archived",
      );
    const timestamp = now();
    const id = nanoid(18);
    this.database.raw
      .prepare(
        `INSERT INTO services (id, department_id, code, name_en, name_ar, duration_minutes, price_egp, created_at, created_by_user_id, updated_at, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        parsed.departmentId,
        parsed.code,
        parsed.nameEn,
        parsed.nameAr ?? null,
        parsed.durationMinutes,
        parsed.priceEgp,
        timestamp,
        context.userId,
        timestamp,
        context.userId,
      );
    return this.getService(id);
  }

  public listServices(context: SessionContext): readonly Service[] {
    requireCapability(context, "clinical.read");
    return (
      this.database.raw
        .prepare("SELECT * FROM services ORDER BY name_en")
        .all() as Array<Record<string, any>>
    ).map(mapService);
  }

  public listSchedules(context: SessionContext): readonly Schedule[] {
    requireCapability(context, "clinical.read");
    return (
      this.database.raw
        .prepare(
          "SELECT * FROM doctor_schedules ORDER BY doctor_id, day_of_week, start_time",
        )
        .all() as Array<Record<string, any>>
    ).map((row) =>
      scheduleSchema.parse({
        id: String(row["id"]),
        doctorId: String(row["doctor_id"]),
        departmentId: String(row["department_id"]),
        dayOfWeek: Number(row["day_of_week"]),
        startTime: String(row["start_time"]),
        endTime: String(row["end_time"]),
        slotDurationMinutes: Number(row["slot_duration_minutes"]),
        version: Number(row["version"]),
      }),
    );
  }

  public listScheduleExceptions(
    context: SessionContext,
  ): readonly ScheduleException[] {
    requireCapability(context, "clinical.read");
    return (
      this.database.raw
        .prepare(
          "SELECT * FROM schedule_exceptions ORDER BY exception_date, start_time",
        )
        .all() as Array<Record<string, any>>
    ).map((row) =>
      scheduleExceptionSchema.parse({
        id: String(row["id"]),
        ...(row["doctor_id"] ? { doctorId: String(row["doctor_id"]) } : {}),
        ...(row["department_id"]
          ? { departmentId: String(row["department_id"]) }
          : {}),
        exceptionDate: String(row["exception_date"]),
        kind: row["kind"],
        ...(row["start_time"] ? { startTime: String(row["start_time"]) } : {}),
        ...(row["end_time"] ? { endTime: String(row["end_time"]) } : {}),
        reason: String(row["reason"]),
        createdAt: String(row["created_at"]),
      }),
    );
  }

  public deleteSchedule(
    context: SessionContext,
    id: string,
    reason: string,
  ): void {
    requireCapability(context, "module.manage");
    const parsedReason = z.string().trim().min(3).max(500).parse(reason);
    const result = this.database.raw
      .prepare("DELETE FROM doctor_schedules WHERE id = ?")
      .run(id);
    if (result.changes !== 1)
      throw new Error("ELITE_SCHEDULE_NOT_FOUND: schedule does not exist");
    this.writeClinicalAudit(context, "schedule.delete", id, {
      reason: parsedReason,
    });
  }

  public deleteScheduleException(
    context: SessionContext,
    id: string,
    reason: string,
  ): void {
    requireCapability(context, "module.manage");
    const parsedReason = z.string().trim().min(3).max(500).parse(reason);
    const result = this.database.raw
      .prepare("DELETE FROM schedule_exceptions WHERE id = ?")
      .run(id);
    if (result.changes !== 1)
      throw new Error(
        "ELITE_SCHEDULE_EXCEPTION_NOT_FOUND: exception does not exist",
      );
    this.writeClinicalAudit(context, "schedule-exception.delete", id, {
      reason: parsedReason,
    });
  }

  public createSchedule(context: SessionContext, input: ScheduleInput): void {
    requireCapability(context, "module.manage");
    const parsed = scheduleInputSchema.parse(input);
    if (parsed.startTime >= parsed.endTime)
      throw new Error("ELITE_SCHEDULE_INVALID_RANGE: start must be before end");
    if (
      !this.database.raw
        .prepare("SELECT id FROM users WHERE id = ?")
        .get(parsed.doctorId)
    )
      throw new Error("ELITE_DOCTOR_NOT_FOUND: doctor does not exist");
    if (
      !this.database.raw
        .prepare(
          "SELECT id FROM departments WHERE id = ? AND status = 'active'",
        )
        .get(parsed.departmentId)
    )
      throw new Error(
        "ELITE_DEPARTMENT_NOT_ACTIVE: department is missing or archived",
      );
    const overlap = this.database.raw
      .prepare(
        "SELECT id FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ? AND start_time < ? AND end_time > ? LIMIT 1",
      )
      .get(parsed.doctorId, parsed.dayOfWeek, parsed.endTime, parsed.startTime);
    if (overlap)
      throw new Error(
        "ELITE_SCHEDULE_OVERLAP: doctor schedule overlaps an existing interval",
      );
    const timestamp = now();
    this.database.raw
      .prepare(
        `INSERT INTO doctor_schedules (id, doctor_id, department_id, day_of_week, start_time, end_time, slot_duration_minutes, created_at, created_by_user_id, updated_at, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nanoid(18),
        parsed.doctorId,
        parsed.departmentId,
        parsed.dayOfWeek,
        parsed.startTime,
        parsed.endTime,
        parsed.slotDurationMinutes,
        timestamp,
        context.userId,
        timestamp,
        context.userId,
      );
  }

  public createScheduleException(
    context: SessionContext,
    input: ScheduleExceptionInput,
  ): void {
    requireCapability(context, "module.manage");
    const parsed = scheduleExceptionInputSchema.parse(input);
    if (!parsed.doctorId && !parsed.departmentId)
      throw new Error(
        "ELITE_SCHEDULE_EXCEPTION_SCOPE_REQUIRED: doctor or department is required",
      );
    if (parsed.kind === "open" && (!parsed.startTime || !parsed.endTime))
      throw new Error(
        "ELITE_SCHEDULE_EXCEPTION_RANGE_REQUIRED: open exceptions require a time range",
      );
    if (
      parsed.startTime &&
      parsed.endTime &&
      parsed.startTime >= parsed.endTime
    )
      throw new Error("ELITE_SCHEDULE_INVALID_RANGE: start must be before end");
    const timestamp = now();
    this.database.raw
      .prepare(
        `INSERT INTO schedule_exceptions (id, doctor_id, department_id, exception_date, kind, start_time, end_time, reason, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nanoid(18),
        parsed.doctorId ?? null,
        parsed.departmentId ?? null,
        parsed.exceptionDate,
        parsed.kind,
        parsed.startTime ?? null,
        parsed.endTime ?? null,
        parsed.reason,
        timestamp,
        context.userId,
      );
  }

  public createAppointment(
    context: SessionContext,
    input: AppointmentCreateInput,
  ): Appointment {
    requireCapability(context, "appointment.write");
    const parsed = appointmentCreateInputSchema.parse(input);
    const patient = this.database.raw
      .prepare("SELECT id, status FROM patients WHERE patient_id = ?")
      .get(parsed.patientId) as { id: string; status: string } | undefined;
    if (!patient || patient.status !== "active")
      throw new Error(
        "ELITE_PATIENT_NOT_ACTIVE: patient is missing or archived",
      );
    if (
      !this.database.raw
        .prepare(
          "SELECT id FROM departments WHERE id = ? AND status = 'active'",
        )
        .get(parsed.departmentId)
    )
      throw new Error(
        "ELITE_DEPARTMENT_NOT_ACTIVE: department is missing or archived",
      );
    let duration = parsed.durationMinutes ?? 15;
    if (parsed.serviceId) {
      const service = this.database.raw
        .prepare("SELECT duration_minutes, status FROM services WHERE id = ?")
        .get(parsed.serviceId) as
        { duration_minutes: number; status: string } | undefined;
      if (!service || service.status !== "active")
        throw new Error(
          "ELITE_SERVICE_NOT_ACTIVE: service is missing or archived",
        );
      duration = service.duration_minutes;
    }
    const end =
      parsed.scheduledEnd ?? addMinutes(parsed.scheduledStart, duration);
    if (new Date(end).getTime() <= new Date(parsed.scheduledStart).getTime())
      throw new Error(
        "ELITE_APPOINTMENT_INVALID_RANGE: end must be after start",
      );
    if (parsed.doctorId) {
      const conflict = this.database.raw
        .prepare(
          "SELECT id FROM appointments WHERE doctor_id = ? AND status NOT IN ('cancelled', 'no-show') AND scheduled_start < ? AND scheduled_end > ? LIMIT 1",
        )
        .get(parsed.doctorId, end, parsed.scheduledStart);
      if (conflict)
        throw new Error(
          "ELITE_APPOINTMENT_CONFLICT: doctor already has an overlapping appointment",
        );
    }
    const timestamp = now();
    const id = nanoid(18);
    this.database.raw
      .prepare(
        `INSERT INTO appointments (id, patient_id, department_id, doctor_id, scheduled_start, scheduled_end, status, visit_type, is_walk_in, notes, created_at, created_by_user_id, updated_at, updated_by_user_id, version, service_id, duration_minutes) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        patient.id,
        parsed.departmentId,
        parsed.doctorId ?? null,
        parsed.scheduledStart,
        end,
        parsed.visitType,
        parsed.isWalkIn ? 1 : 0,
        parsed.notes ?? null,
        timestamp,
        context.userId,
        timestamp,
        context.userId,
        parsed.serviceId ?? null,
        duration,
      );
    this.recordAppointmentHistory(context, id, "created", null, "scheduled", {
      durationMinutes: duration,
    });
    return this.getAppointment(context, id);
  }

  public listAppointments(
    context: SessionContext,
    from?: string,
    to?: string,
  ): readonly Appointment[] {
    requireCapability(context, "appointment.read");
    const rows = this.database.raw
      .prepare(
        "SELECT a.*, p.patient_id AS patient_display_id FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE (? IS NULL OR a.scheduled_start >= ?) AND (? IS NULL OR a.scheduled_start < ?) ORDER BY a.scheduled_start",
      )
      .all(from ?? null, from ?? null, to ?? null, to ?? null) as Array<
      Record<string, any>
    >;
    return rows.map(mapAppointment);
  }

  public updateAppointmentStatus(
    context: SessionContext,
    appointmentId: string,
    input: AppointmentStatusUpdate,
  ): Appointment {
    requireCapability(context, "appointment.write");
    const parsed = appointmentStatusUpdateSchema.parse(input);
    const current = this.database.raw
      .prepare("SELECT * FROM appointments WHERE id = ?")
      .get(appointmentId) as Record<string, any> | undefined;
    if (!current)
      throw new Error(
        "ELITE_APPOINTMENT_NOT_FOUND: appointment does not exist",
      );
    const allowed: Record<string, readonly string[]> = {
      scheduled: ["arrived", "cancelled", "no-show", "rescheduled"],
      arrived: ["in-consultation", "cancelled", "no-show"],
      "in-consultation": ["completed", "cancelled"],
      completed: [],
      cancelled: [],
      "no-show": [],
      rescheduled: ["scheduled", "cancelled"],
    };
    const previous = String(current["status"]);
    if (!allowed[previous]?.includes(parsed.status))
      throw new Error(
        "ELITE_APPOINTMENT_INVALID_STATUS_TRANSITION: transition is not permitted",
      );
    const timestamp = now();
    this.database.raw
      .prepare(
        "UPDATE appointments SET status = ?, updated_at = ?, updated_by_user_id = ?, version = version + 1 WHERE id = ? AND version = ?",
      )
      .run(
        parsed.status,
        timestamp,
        context.userId,
        appointmentId,
        Number(current["version"]),
      );
    this.recordAppointmentHistory(
      context,
      appointmentId,
      "status-changed",
      previous,
      parsed.status,
      { reason: parsed.reason ?? null },
    );
    return this.getAppointment(context, appointmentId);
  }

  private getSpecialty(id: string): Specialty {
    const row = this.database.raw
      .prepare("SELECT * FROM specialties WHERE id = ?")
      .get(id) as Record<string, any>;
    return mapSpecialty(row);
  }
  private getDepartment(id: string): Department {
    const row = this.database.raw
      .prepare("SELECT * FROM departments WHERE id = ?")
      .get(id) as Record<string, any>;
    return mapDepartment(row);
  }
  private getService(id: string): Service {
    const row = this.database.raw
      .prepare("SELECT * FROM services WHERE id = ?")
      .get(id) as Record<string, any>;
    return mapService(row);
  }
  private getAppointment(context: SessionContext, id: string): Appointment {
    requireCapability(context, "appointment.read");
    const row = this.database.raw
      .prepare(
        "SELECT a.*, p.patient_id AS patient_display_id FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.id = ?",
      )
      .get(id) as Record<string, any>;
    return mapAppointment(row);
  }
  private recordAppointmentHistory(
    context: SessionContext,
    appointmentId: string,
    action: string,
    previousStatus: string | null,
    newStatus: string | null,
    payload: Record<string, any>,
  ): void {
    this.database.raw
      .prepare(
        "INSERT INTO appointment_history (id, appointment_id, action, previous_status, new_status, payload_json, actor_user_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        nanoid(18),
        appointmentId,
        action,
        previousStatus,
        newStatus,
        JSON.stringify(payload),
        context.userId,
        now(),
      );
  }
  private writeClinicalAudit(
    context: SessionContext,
    action: string,
    entityId: string,
    metadata: Record<string, any>,
  ): void {
    this.database.raw
      .prepare(
        "INSERT INTO audit_events (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?)",
      )
      .run(
        nanoid(18),
        context.userId,
        context.deviceId,
        action,
        "clinical",
        entityId,
        JSON.stringify(metadata),
        now(),
      );
  }
}
