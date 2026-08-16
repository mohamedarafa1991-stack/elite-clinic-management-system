import { nanoid } from "nanoid";
import { z } from "zod";
import {
  diagnosisApprovalStatusSchema,
  diagnosisInputSchema,
  encounterAmendmentInputSchema,
  encounterAmendmentSchema,
  diagnosisSchema,
  encounterInputSchema,
  encounterSchema,
  icd10CodeInputSchema,
  icd10CodeSchema,
  patientIdSchema,
  type Diagnosis,
  type DiagnosisInput,
  type EncounterAmendment,
  type EncounterAmendmentInput,
  type Encounter,
  type EncounterInput,
  type Icd10Code,
  type Icd10CodeInput,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import { requireCapability, type SessionContext } from "./index.js";

const entityIdSchema = z.string().trim().min(8).max(128);

function defaultNow(): string {
  return new Date().toISOString();
}

export interface EncounterServiceOptions {
  now?: () => string;
}

export class EncounterService {
  private readonly now: () => string;

  public constructor(
    private readonly database: EliteDatabase,
    options: EncounterServiceOptions = {},
  ) {
    this.now = options.now ?? defaultNow;
  }

  public listIcd10Codes(context: SessionContext): readonly Icd10Code[] {
    requireCapability(context, "clinical.read");
    const rows = this.database.raw
      .prepare(
        "SELECT * FROM icd10_codes WHERE is_active = 1 ORDER BY code, title_en",
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapIcd10Code(row));
  }

  public createIcd10Code(
    context: SessionContext,
    input: Icd10CodeInput,
  ): Icd10Code {
    requireCapability(context, "module.manage");
    const parsed = icd10CodeInputSchema.parse(input);
    const timestamp = this.now();
    const id = nanoid(18);
    this.database.raw
      .prepare(
        `INSERT INTO icd10_codes
          (id, code, title_en, title_ar, release_version, source_url, is_active, created_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        parsed.code,
        parsed.titleEn,
        parsed.titleAr ?? null,
        parsed.releaseVersion,
        parsed.sourceUrl ?? null,
        timestamp,
        context.userId,
      );
    this.writeAudit(context, "icd10-code.create", id, null, {
      code: parsed.code,
      releaseVersion: parsed.releaseVersion,
    });
    return this.getIcd10Code(id);
  }

  public getEncounterForAppointment(
    context: SessionContext,
    appointmentId: string,
  ): Encounter | null {
    requireCapability(context, "clinical.read");
    const parsedAppointmentId = entityIdSchema.parse(appointmentId);
    const row = this.database.raw
      .prepare(
        `SELECT e.*, p.patient_id AS patient_display_id
         FROM encounters e
         JOIN patients p ON p.id = e.patient_id
         WHERE e.appointment_id = ?`,
      )
      .get(parsedAppointmentId) as Record<string, unknown> | undefined;
    return row ? this.mapEncounter(row) : null;
  }

  public createEncounter(
    context: SessionContext,
    appointmentId: string,
    input: EncounterInput,
  ): Encounter {
    requireCapability(context, "clinical.write");
    const parsedAppointmentId = entityIdSchema.parse(appointmentId);
    const parsed = encounterInputSchema.parse(input);
    const appointment = this.getAppointmentForEncounter(parsedAppointmentId);
    if (["cancelled", "no-show"].includes(appointment.status))
      throw new Error(
        "ELITE_ENCOUNTER_APPOINTMENT_INVALID: cancelled or no-show appointments cannot receive encounter notes",
      );
    const existing = this.database.raw
      .prepare("SELECT id FROM encounters WHERE appointment_id = ?")
      .get(parsedAppointmentId);
    if (existing)
      throw new Error(
        "ELITE_ENCOUNTER_ALREADY_EXISTS: appointment already has an encounter",
      );
    const timestamp = this.now();
    const id = nanoid(18);
    this.database.raw
      .prepare(
        `INSERT INTO encounters
          (id, patient_id, appointment_id, author_user_id, encounter_at, subjective, objective, assessment, plan, follow_up, status, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, 1)`,
      )
      .run(
        id,
        appointment.patient_id,
        parsedAppointmentId,
        context.userId,
        appointment.scheduled_start,
        parsed.subjective ?? null,
        parsed.objective ?? null,
        parsed.assessment ?? null,
        parsed.plan ?? null,
        parsed.followUp ?? null,
        timestamp,
        timestamp,
      );
    this.writeAudit(
      context,
      "encounter.create",
      id,
      appointment.patient_display_id,
      {
        appointmentId: parsedAppointmentId,
        status: "draft",
      },
    );
    return this.getEncounter(context, id);
  }

  public updateEncounter(
    context: SessionContext,
    encounterId: string,
    input: EncounterInput,
    expectedVersion: number,
  ): Encounter {
    requireCapability(context, "clinical.write");
    const parsedEncounterId = entityIdSchema.parse(encounterId);
    const parsed = encounterInputSchema.parse(input);
    const current = this.getEncounterRow(parsedEncounterId);
    if (current.status !== "draft")
      throw new Error(
        "ELITE_ENCOUNTER_SIGNED_IMMUTABLE: signed encounters require an amendment workflow",
      );
    const timestamp = this.now();
    const result = this.database.raw
      .prepare(
        `UPDATE encounters
         SET subjective = ?, objective = ?, assessment = ?, plan = ?, follow_up = ?, updated_at = ?, version = version + 1
         WHERE id = ? AND version = ? AND status = 'draft'`,
      )
      .run(
        parsed.subjective ?? null,
        parsed.objective ?? null,
        parsed.assessment ?? null,
        parsed.plan ?? null,
        parsed.followUp ?? null,
        timestamp,
        parsedEncounterId,
        expectedVersion,
      );
    if (result.changes !== 1)
      throw new Error(
        "ELITE_ENCOUNTER_VERSION_CONFLICT: encounter was changed by another device",
      );
    this.writeAudit(
      context,
      "encounter.update",
      parsedEncounterId,
      current.patient_display_id,
      {
        expectedVersion,
        status: "draft",
      },
    );
    return this.getEncounter(context, parsedEncounterId);
  }

  public signEncounter(
    context: SessionContext,
    encounterId: string,
    expectedVersion: number,
  ): Encounter {
    requireCapability(context, "clinical.sign");
    if (context.role !== "doctor")
      throw new Error(
        "ELITE_CLINICAL_DOCTOR_REQUIRED: only a Doctor can sign an encounter",
      );
    const parsedEncounterId = entityIdSchema.parse(encounterId);
    const current = this.getEncounterRow(parsedEncounterId);
    if (current.status !== "draft")
      throw new Error(
        "ELITE_ENCOUNTER_ALREADY_SIGNED: encounter is already signed",
      );
    const timestamp = this.now();
    const result = this.database.raw
      .prepare(
        `UPDATE encounters
         SET status = 'signed', signed_at = ?, signed_by_user_id = ?, updated_at = ?, version = version + 1
         WHERE id = ? AND version = ? AND status = 'draft'`,
      )
      .run(
        timestamp,
        context.userId,
        timestamp,
        parsedEncounterId,
        expectedVersion,
      );
    if (result.changes !== 1)
      throw new Error(
        "ELITE_ENCOUNTER_VERSION_CONFLICT: encounter was changed by another device",
      );
    this.writeAudit(
      context,
      "encounter.sign",
      parsedEncounterId,
      current.patient_display_id,
      {
        signedByUserId: context.userId,
      },
    );
    return this.getEncounter(context, parsedEncounterId);
  }

  public listAmendments(
    context: SessionContext,
    encounterId: string,
  ): readonly EncounterAmendment[] {
    requireCapability(context, "clinical.read");
    const parsedEncounterId = entityIdSchema.parse(encounterId);
    const rows = this.database.raw
      .prepare(
        `SELECT a.*, p.patient_id AS patient_display_id
         FROM encounter_amendments a
         JOIN patients p ON p.id = a.patient_id
         WHERE a.encounter_id = ?
         ORDER BY a.requested_at DESC`,
      )
      .all(parsedEncounterId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapAmendment(row));
  }

  public createAmendment(
    context: SessionContext,
    encounterId: string,
    input: EncounterAmendmentInput,
  ): EncounterAmendment {
    requireCapability(context, "clinical.write");
    if (context.role !== "doctor")
      throw new Error(
        "ELITE_CLINICAL_DOCTOR_REQUIRED: only a Doctor can request an encounter amendment",
      );
    const parsedEncounterId = entityIdSchema.parse(encounterId);
    const parsed = encounterAmendmentInputSchema.parse(input);
    const encounter = this.getEncounterRow(parsedEncounterId);
    if (encounter.status !== "signed")
      throw new Error(
        "ELITE_ENCOUNTER_AMENDMENT_SIGNED_REQUIRED: amendments apply only to signed encounters",
      );
    const timestamp = this.now();
    const id = nanoid(18);
    this.database.raw
      .prepare(
        `INSERT INTO encounter_amendments
          (id, encounter_id, patient_id, base_encounter_version, subjective, objective, assessment, plan, follow_up, correction_reason, status, requested_by_user_id, requested_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 1)`,
      )
      .run(
        id,
        parsedEncounterId,
        encounter.patient_id,
        encounter.version,
        parsed.subjective ?? null,
        parsed.objective ?? null,
        parsed.assessment ?? null,
        parsed.plan ?? null,
        parsed.followUp ?? null,
        parsed.correctionReason,
        context.userId,
        timestamp,
      );
    this.writeAudit(
      context,
      "encounter-amendment.create",
      id,
      encounter.patient_display_id,
      { baseEncounterVersion: encounter.version, status: "pending" },
    );
    return this.getAmendment(context, id);
  }

  public reviewAmendment(
    context: SessionContext,
    amendmentId: string,
    decision: "approved" | "rejected",
    reason: string,
    expectedVersion: number,
  ): EncounterAmendment {
    requireCapability(context, "clinical.approve");
    if (context.role !== "doctor")
      throw new Error(
        "ELITE_CLINICAL_DOCTOR_REQUIRED: only a Doctor can review an encounter amendment",
      );
    const parsedAmendmentId = entityIdSchema.parse(amendmentId);
    const parsedDecision = z.enum(["approved", "rejected"]).parse(decision);
    const parsedReason = z.string().trim().min(3).max(1000).parse(reason);
    const current = this.getAmendmentRow(parsedAmendmentId);
    if (current.requested_by_user_id === context.userId)
      throw new Error(
        "ELITE_AMENDMENT_SEPARATION_REQUIRED: a different Doctor must review the amendment",
      );
    if (current.status !== "pending")
      throw new Error(
        "ELITE_AMENDMENT_ALREADY_REVIEWED: amendment is already reviewed",
      );
    const timestamp = this.now();
    const result = this.database.raw
      .prepare(
        `UPDATE encounter_amendments
         SET status = ?, reviewed_by_user_id = ?, reviewed_at = ?, review_reason = ?, version = version + 1
         WHERE id = ? AND version = ? AND status = 'pending'`,
      )
      .run(
        parsedDecision,
        context.userId,
        timestamp,
        parsedReason,
        parsedAmendmentId,
        expectedVersion,
      );
    if (result.changes !== 1)
      throw new Error(
        "ELITE_AMENDMENT_VERSION_CONFLICT: amendment was changed by another device",
      );
    this.writeAudit(
      context,
      `encounter-amendment.${parsedDecision}`,
      parsedAmendmentId,
      current.patient_display_id,
      { reason: parsedReason },
    );
    return this.getAmendment(context, parsedAmendmentId);
  }

  public applyAmendment(
    context: SessionContext,
    amendmentId: string,
    expectedVersion: number,
  ): EncounterAmendment {
    requireCapability(context, "clinical.approve");
    if (context.role !== "doctor")
      throw new Error(
        "ELITE_CLINICAL_DOCTOR_REQUIRED: only a Doctor can apply an encounter amendment",
      );
    const parsedAmendmentId = entityIdSchema.parse(amendmentId);
    const current = this.getAmendmentRow(parsedAmendmentId);
    if (current.status !== "approved")
      throw new Error(
        "ELITE_AMENDMENT_APPROVAL_REQUIRED: only approved amendments can be applied",
      );
    const applied = this.database.raw
      .prepare(
        "SELECT id FROM encounter_amendments WHERE encounter_id = ? AND status = 'applied' LIMIT 1",
      )
      .get(current.encounter_id);
    if (applied)
      throw new Error(
        "ELITE_ENCOUNTER_AMENDMENT_ALREADY_APPLIED: an applied amendment already exists for this encounter",
      );
    const encounter = this.getEncounterRow(current.encounter_id);
    if (
      encounter.status !== "signed" ||
      encounter.version !== current.base_encounter_version
    )
      throw new Error(
        "ELITE_AMENDMENT_BASE_VERSION_CONFLICT: the signed encounter base no longer matches",
      );
    const timestamp = this.now();
    const result = this.database.raw
      .prepare(
        `UPDATE encounter_amendments
         SET status = 'applied', applied_by_user_id = ?, applied_at = ?, version = version + 1
         WHERE id = ? AND version = ? AND status = 'approved'`,
      )
      .run(context.userId, timestamp, parsedAmendmentId, expectedVersion);
    if (result.changes !== 1)
      throw new Error(
        "ELITE_AMENDMENT_VERSION_CONFLICT: amendment was changed by another device",
      );
    this.writeAudit(
      context,
      "encounter-amendment.apply",
      parsedAmendmentId,
      current.patient_display_id,
      { baseEncounterVersion: current.base_encounter_version },
    );
    return this.getAmendment(context, parsedAmendmentId);
  }

  public listDiagnoses(
    context: SessionContext,
    encounterId: string,
  ): readonly Diagnosis[] {
    requireCapability(context, "clinical.read");
    const parsedEncounterId = entityIdSchema.parse(encounterId);
    const rows = this.database.raw
      .prepare(
        `SELECT d.*, p.patient_id AS patient_display_id, c.code AS icd10_code, c.title_en AS icd10_title_en
         FROM diagnoses d
         JOIN patients p ON p.id = d.patient_id
         JOIN icd10_codes c ON c.id = d.icd10_code_id
         WHERE d.encounter_id = ?
         ORDER BY d.is_primary DESC, d.recorded_at`,
      )
      .all(parsedEncounterId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapDiagnosis(row));
  }

  public createDiagnosis(
    context: SessionContext,
    encounterId: string,
    input: DiagnosisInput,
  ): Diagnosis {
    requireCapability(context, "clinical.write");
    if (context.role !== "doctor")
      throw new Error(
        "ELITE_CLINICAL_DOCTOR_REQUIRED: only a Doctor can record an ICD-10 diagnosis",
      );
    const parsedEncounterId = entityIdSchema.parse(encounterId);
    const parsed = diagnosisInputSchema.parse(input);
    const encounter = this.getEncounterRow(parsedEncounterId);
    if (encounter.status !== "draft")
      throw new Error(
        "ELITE_ENCOUNTER_SIGNED_IMMUTABLE: diagnoses cannot be added to a signed encounter",
      );
    const icd = this.database.raw
      .prepare(
        "SELECT id, code, title_en FROM icd10_codes WHERE id = ? AND is_active = 1",
      )
      .get(parsed.icd10CodeId) as
      { id: string; code: string; title_en: string } | undefined;
    if (!icd)
      throw new Error(
        "ELITE_ICD10_CODE_NOT_ACTIVE: ICD-10 code is unavailable",
      );
    if (parsed.isPrimary) {
      this.database.raw
        .prepare("UPDATE diagnoses SET is_primary = 0 WHERE encounter_id = ?")
        .run(parsedEncounterId);
    }
    const timestamp = this.now();
    const id = nanoid(18);
    this.database.raw
      .prepare(
        `INSERT INTO diagnoses
          (id, encounter_id, patient_id, icd10_code_id, diagnosis_text_en, is_primary, approval_status, recorded_by_user_id, recorded_at, version)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, 1)`,
      )
      .run(
        id,
        parsedEncounterId,
        encounter.patient_id,
        icd.id,
        parsed.diagnosisTextEn,
        parsed.isPrimary ? 1 : 0,
        context.userId,
        timestamp,
      );
    this.writeAudit(
      context,
      "diagnosis.create",
      id,
      encounter.patient_display_id,
      {
        encounterId: parsedEncounterId,
        icd10Code: icd.code,
        approvalStatus: "pending",
      },
    );
    return this.getDiagnosis(context, id);
  }

  public approveDiagnosis(
    context: SessionContext,
    diagnosisId: string,
    decision: "approved" | "rejected",
    reason: string,
    expectedVersion: number,
  ): Diagnosis {
    requireCapability(context, "clinical.approve");
    if (context.role !== "doctor")
      throw new Error(
        "ELITE_CLINICAL_DOCTOR_REQUIRED: only a Doctor can approve an ICD-10 diagnosis",
      );
    const parsedDiagnosisId = entityIdSchema.parse(diagnosisId);
    const parsedDecision = diagnosisApprovalStatusSchema
      .exclude(["pending"])
      .parse(decision);
    const parsedReason = z.string().trim().min(3).max(500).parse(reason);
    const current = this.getDiagnosisRow(parsedDiagnosisId);
    if (current.recorded_by_user_id === context.userId)
      throw new Error(
        "ELITE_DIAGNOSIS_SEPARATION_REQUIRED: a different Doctor must approve the diagnosis",
      );
    if (current.approval_status !== "pending")
      throw new Error(
        "ELITE_DIAGNOSIS_ALREADY_REVIEWED: diagnosis is already reviewed",
      );
    const timestamp = this.now();
    const result = this.database.raw
      .prepare(
        `UPDATE diagnoses
         SET approval_status = ?, approved_by_user_id = ?, approved_at = ?, approval_reason = ?, version = version + 1
         WHERE id = ? AND version = ? AND approval_status = 'pending'`,
      )
      .run(
        parsedDecision,
        context.userId,
        timestamp,
        parsedReason,
        parsedDiagnosisId,
        expectedVersion,
      );
    if (result.changes !== 1)
      throw new Error(
        "ELITE_DIAGNOSIS_VERSION_CONFLICT: diagnosis was changed by another device",
      );
    this.writeAudit(
      context,
      `diagnosis.${parsedDecision}`,
      parsedDiagnosisId,
      current.patient_display_id,
      {
        reason: parsedReason,
        approvedByUserId: context.userId,
      },
    );
    return this.getDiagnosis(context, parsedDiagnosisId);
  }

  private getAppointmentForEncounter(appointmentId: string): {
    patient_id: string;
    patient_display_id: string;
    scheduled_start: string;
    status: string;
  } {
    const row = this.database.raw
      .prepare(
        `SELECT a.patient_id, p.patient_id AS patient_display_id, a.scheduled_start, a.status
         FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.id = ?`,
      )
      .get(appointmentId) as
      | {
          patient_id: string;
          patient_display_id: string;
          scheduled_start: string;
          status: string;
        }
      | undefined;
    if (!row)
      throw new Error(
        "ELITE_APPOINTMENT_NOT_FOUND: appointment does not exist",
      );
    return row;
  }

  private getEncounterRow(id: string): {
    id: string;
    patient_display_id: string;
    patient_id: string;
    status: string;
    version: number;
  } {
    const row = this.database.raw
      .prepare(
        `SELECT e.id, e.patient_id, e.status, e.version, p.patient_id AS patient_display_id
         FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE e.id = ?`,
      )
      .get(id) as
      | {
          id: string;
          patient_display_id: string;
          patient_id: string;
          status: string;
          version: number;
        }
      | undefined;
    if (!row)
      throw new Error("ELITE_ENCOUNTER_NOT_FOUND: encounter does not exist");
    return row;
  }

  private getEncounter(context: SessionContext, id: string): Encounter {
    requireCapability(context, "clinical.read");
    const row = this.database.raw
      .prepare(
        `SELECT e.*, p.patient_id AS patient_display_id
         FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE e.id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row)
      throw new Error("ELITE_ENCOUNTER_NOT_FOUND: encounter does not exist");
    return this.mapEncounter(row);
  }

  private getAmendmentRow(id: string): {
    id: string;
    encounter_id: string;
    patient_id: string;
    patient_display_id: string;
    base_encounter_version: number;
    requested_by_user_id: string;
    status: string;
    version: number;
  } {
    const row = this.database.raw
      .prepare(
        `SELECT a.id, a.encounter_id, a.patient_id, a.base_encounter_version, a.requested_by_user_id, a.status, a.version,
                p.patient_id AS patient_display_id
         FROM encounter_amendments a JOIN patients p ON p.id = a.patient_id WHERE a.id = ?`,
      )
      .get(id) as
      | {
          id: string;
          encounter_id: string;
          patient_id: string;
          patient_display_id: string;
          base_encounter_version: number;
          requested_by_user_id: string;
          status: string;
          version: number;
        }
      | undefined;
    if (!row)
      throw new Error("ELITE_AMENDMENT_NOT_FOUND: amendment does not exist");
    return row;
  }

  private getAmendment(
    context: SessionContext,
    id: string,
  ): EncounterAmendment {
    requireCapability(context, "clinical.read");
    const row = this.database.raw
      .prepare(
        `SELECT a.*, p.patient_id AS patient_display_id
         FROM encounter_amendments a JOIN patients p ON p.id = a.patient_id WHERE a.id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row)
      throw new Error("ELITE_AMENDMENT_NOT_FOUND: amendment does not exist");
    return this.mapAmendment(row);
  }

  private getDiagnosisRow(id: string): {
    patient_display_id: string;
    recorded_by_user_id: string;
    approval_status: string;
    version: number;
  } {
    const row = this.database.raw
      .prepare(
        `SELECT d.recorded_by_user_id, d.approval_status, d.version, p.patient_id AS patient_display_id
         FROM diagnoses d JOIN patients p ON p.id = d.patient_id WHERE d.id = ?`,
      )
      .get(id) as
      | {
          patient_display_id: string;
          recorded_by_user_id: string;
          approval_status: string;
          version: number;
        }
      | undefined;
    if (!row)
      throw new Error("ELITE_DIAGNOSIS_NOT_FOUND: diagnosis does not exist");
    return row;
  }

  private getDiagnosis(context: SessionContext, id: string): Diagnosis {
    requireCapability(context, "clinical.read");
    const row = this.database.raw
      .prepare(
        `SELECT d.*, p.patient_id AS patient_display_id, c.code AS icd10_code, c.title_en AS icd10_title_en
         FROM diagnoses d JOIN patients p ON p.id = d.patient_id JOIN icd10_codes c ON c.id = d.icd10_code_id
         WHERE d.id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row)
      throw new Error("ELITE_DIAGNOSIS_NOT_FOUND: diagnosis does not exist");
    return this.mapDiagnosis(row);
  }

  private getIcd10Code(id: string): Icd10Code {
    const row = this.database.raw
      .prepare("SELECT * FROM icd10_codes WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row)
      throw new Error("ELITE_ICD10_CODE_NOT_FOUND: code does not exist");
    return this.mapIcd10Code(row);
  }

  private mapIcd10Code(row: Record<string, unknown>): Icd10Code {
    return icd10CodeSchema.parse({
      id: String(row["id"]),
      code: String(row["code"]),
      titleEn: String(row["title_en"]),
      ...(row["title_ar"] ? { titleAr: String(row["title_ar"]) } : {}),
      releaseVersion: String(row["release_version"]),
      ...(row["source_url"] ? { sourceUrl: String(row["source_url"]) } : {}),
      isActive: Number(row["is_active"]) === 1,
      createdAt: String(row["created_at"]),
      createdByUserId: String(row["created_by_user_id"]),
    });
  }

  private mapEncounter(row: Record<string, unknown>): Encounter {
    return encounterSchema.parse({
      id: String(row["id"]),
      patientId: String(row["patient_display_id"]),
      appointmentId: String(row["appointment_id"]),
      authorUserId: String(row["author_user_id"]),
      encounterAt: String(row["encounter_at"]),
      ...(row["subjective"] ? { subjective: String(row["subjective"]) } : {}),
      ...(row["objective"] ? { objective: String(row["objective"]) } : {}),
      ...(row["assessment"] ? { assessment: String(row["assessment"]) } : {}),
      ...(row["plan"] ? { plan: String(row["plan"]) } : {}),
      ...(row["follow_up"] ? { followUp: String(row["follow_up"]) } : {}),
      status: row["status"],
      ...(row["signed_at"] ? { signedAt: String(row["signed_at"]) } : {}),
      ...(row["signed_by_user_id"]
        ? { signedByUserId: String(row["signed_by_user_id"]) }
        : {}),
      createdAt: String(row["created_at"]),
      updatedAt: String(row["updated_at"]),
      version: Number(row["version"]),
    });
  }

  private mapAmendment(row: Record<string, unknown>): EncounterAmendment {
    return encounterAmendmentSchema.parse({
      id: String(row["id"]),
      encounterId: String(row["encounter_id"]),
      patientId: String(row["patient_display_id"]),
      baseEncounterVersion: Number(row["base_encounter_version"]),
      ...(row["subjective"] ? { subjective: String(row["subjective"]) } : {}),
      ...(row["objective"] ? { objective: String(row["objective"]) } : {}),
      ...(row["assessment"] ? { assessment: String(row["assessment"]) } : {}),
      ...(row["plan"] ? { plan: String(row["plan"]) } : {}),
      ...(row["follow_up"] ? { followUp: String(row["follow_up"]) } : {}),
      correctionReason: String(row["correction_reason"]),
      status: row["status"],
      requestedByUserId: String(row["requested_by_user_id"]),
      requestedAt: String(row["requested_at"]),
      ...(row["reviewed_by_user_id"]
        ? { reviewedByUserId: String(row["reviewed_by_user_id"]) }
        : {}),
      ...(row["reviewed_at"] ? { reviewedAt: String(row["reviewed_at"]) } : {}),
      ...(row["review_reason"]
        ? { reviewReason: String(row["review_reason"]) }
        : {}),
      ...(row["applied_by_user_id"]
        ? { appliedByUserId: String(row["applied_by_user_id"]) }
        : {}),
      ...(row["applied_at"] ? { appliedAt: String(row["applied_at"]) } : {}),
      version: Number(row["version"]),
    });
  }

  private mapDiagnosis(row: Record<string, unknown>): Diagnosis {
    return diagnosisSchema.parse({
      id: String(row["id"]),
      encounterId: String(row["encounter_id"]),
      patientId: String(row["patient_display_id"]),
      icd10CodeId: String(row["icd10_code_id"]),
      icd10Code: String(row["icd10_code"]),
      icd10TitleEn: String(row["icd10_title_en"]),
      diagnosisTextEn: String(row["diagnosis_text_en"]),
      isPrimary: Number(row["is_primary"]) === 1,
      approvalStatus: row["approval_status"],
      recordedByUserId: String(row["recorded_by_user_id"]),
      recordedAt: String(row["recorded_at"]),
      ...(row["approved_by_user_id"]
        ? { approvedByUserId: String(row["approved_by_user_id"]) }
        : {}),
      ...(row["approved_at"] ? { approvedAt: String(row["approved_at"]) } : {}),
      ...(row["approval_reason"]
        ? { approvalReason: String(row["approval_reason"]) }
        : {}),
      version: Number(row["version"]),
    });
  }

  private writeAudit(
    context: SessionContext,
    action: string,
    entityId: string,
    patientId: string | null,
    metadata: Record<string, unknown>,
  ): void {
    const patient = patientId
      ? (this.database.raw
          .prepare("SELECT id FROM patients WHERE patient_id = ?")
          .get(patientId) as { id: string } | undefined)
      : undefined;
    this.database.raw
      .prepare(
        `INSERT INTO audit_events
          (id, actor_user_id, device_id, action, entity_type, entity_id, patient_id, result, metadata_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?, ?)`,
      )
      .run(
        nanoid(18),
        context.userId,
        context.deviceId,
        action,
        action.startsWith("icd10")
          ? "icd10-code"
          : action.startsWith("encounter-amendment")
            ? "encounter-amendment"
            : action.startsWith("encounter")
              ? "encounter"
              : "diagnosis",
        entityId,
        patient?.id ?? null,
        JSON.stringify(metadata),
        this.now(),
      );
  }
}
