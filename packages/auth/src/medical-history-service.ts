import { nanoid } from "nanoid";
import { z } from "zod";
import {
  medicalHistoryInputSchema,
  medicalHistorySchema,
  patientIdSchema,
  type MedicalHistoryEntry,
  type MedicalHistoryInput,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import { requireCapability, type SessionContext } from "./index.js";

const entryIdSchema = z.string().trim().min(8).max(128);

function defaultNow(): string {
  return new Date().toISOString();
}

export interface MedicalHistoryServiceOptions {
  now?: () => string;
}

export class MedicalHistoryService {
  private readonly now: () => string;

  public constructor(
    private readonly database: EliteDatabase,
    options: MedicalHistoryServiceOptions = {},
  ) {
    this.now = options.now ?? defaultNow;
  }

  public list(
    context: SessionContext,
    patientId: string,
  ): readonly MedicalHistoryEntry[] {
    requireCapability(context, "clinical.read");
    const parsedPatientId = patientIdSchema.parse(patientId);
    this.requirePatient(parsedPatientId);
    const rows = this.database.raw
      .prepare(
        `SELECT h.*, p.patient_id AS patient_display_id
         FROM patient_medical_history h
         JOIN patients p ON p.id = h.patient_id
         WHERE p.patient_id = ?
         ORDER BY CASE h.status WHEN 'active' THEN 0 WHEN 'resolved' THEN 1 ELSE 2 END,
                  h.updated_at DESC`,
      )
      .all(parsedPatientId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapEntry(row));
  }

  public create(
    context: SessionContext,
    patientId: string,
    input: MedicalHistoryInput,
  ): MedicalHistoryEntry {
    requireCapability(context, "clinical.write");
    const parsedPatientId = patientIdSchema.parse(patientId);
    const parsed = medicalHistoryInputSchema.parse(input);
    const patient = this.requireActivePatient(parsedPatientId);
    const timestamp = this.now();
    const id = nanoid(18);
    this.database.raw
      .prepare(
        `INSERT INTO patient_medical_history
          (id, patient_id, category, title, details, onset_date, status, source,
           recorded_at, recorded_by_user_id, updated_at, updated_by_user_id, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        id,
        patient.id,
        parsed.category,
        parsed.title,
        parsed.details ?? null,
        parsed.onsetDate ?? null,
        parsed.status,
        parsed.source,
        timestamp,
        context.userId,
        timestamp,
        context.userId,
      );
    this.writeAudit(context, "medical-history.create", id, parsedPatientId, {
      category: parsed.category,
      source: parsed.source,
    });
    return this.getById(context, parsedPatientId, id);
  }

  public update(
    context: SessionContext,
    patientId: string,
    entryId: string,
    input: MedicalHistoryInput,
    expectedVersion: number,
  ): MedicalHistoryEntry {
    requireCapability(context, "clinical.write");
    const parsedPatientId = patientIdSchema.parse(patientId);
    const parsedEntryId = entryIdSchema.parse(entryId);
    const parsed = medicalHistoryInputSchema.parse(input);
    const patient = this.requireActivePatient(parsedPatientId);
    const timestamp = this.now();
    const result = this.database.raw
      .prepare(
        `UPDATE patient_medical_history
         SET category = ?, title = ?, details = ?, onset_date = ?, status = ?, source = ?,
             updated_at = ?, updated_by_user_id = ?, version = version + 1
         WHERE id = ? AND patient_id = ? AND version = ?`,
      )
      .run(
        parsed.category,
        parsed.title,
        parsed.details ?? null,
        parsed.onsetDate ?? null,
        parsed.status,
        parsed.source,
        timestamp,
        context.userId,
        parsedEntryId,
        patient.id,
        expectedVersion,
      );
    if (result.changes !== 1)
      throw new Error(
        "ELITE_MEDICAL_HISTORY_VERSION_CONFLICT: history entry was changed by another device",
      );
    this.writeAudit(
      context,
      "medical-history.update",
      parsedEntryId,
      parsedPatientId,
      {
        expectedVersion,
        status: parsed.status,
      },
    );
    return this.getById(context, parsedPatientId, parsedEntryId);
  }

  public archive(
    context: SessionContext,
    patientId: string,
    entryId: string,
    expectedVersion: number,
    reason: string,
  ): void {
    requireCapability(context, "clinical.write");
    const parsedPatientId = patientIdSchema.parse(patientId);
    const parsedEntryId = entryIdSchema.parse(entryId);
    const parsedReason = z.string().trim().min(3).max(500).parse(reason);
    const patient = this.requireActivePatient(parsedPatientId);
    const timestamp = this.now();
    const result = this.database.raw
      .prepare(
        `UPDATE patient_medical_history
         SET status = 'inactive', updated_at = ?, updated_by_user_id = ?, version = version + 1
         WHERE id = ? AND patient_id = ? AND version = ? AND status != 'inactive'`,
      )
      .run(
        timestamp,
        context.userId,
        parsedEntryId,
        patient.id,
        expectedVersion,
      );
    if (result.changes !== 1)
      throw new Error(
        "ELITE_MEDICAL_HISTORY_NOT_ACTIVE_OR_VERSION_CONFLICT: history entry cannot be archived",
      );
    this.writeAudit(
      context,
      "medical-history.archive",
      parsedEntryId,
      parsedPatientId,
      {
        reason: parsedReason,
        expectedVersion,
      },
    );
  }

  private getById(
    context: SessionContext,
    patientId: string,
    entryId: string,
  ): MedicalHistoryEntry {
    requireCapability(context, "clinical.read");
    const row = this.database.raw
      .prepare(
        `SELECT h.*, p.patient_id AS patient_display_id
         FROM patient_medical_history h
         JOIN patients p ON p.id = h.patient_id
         WHERE p.patient_id = ? AND h.id = ?`,
      )
      .get(patientId, entryId) as Record<string, unknown> | undefined;
    if (!row)
      throw new Error(
        "ELITE_MEDICAL_HISTORY_NOT_FOUND: history entry not found",
      );
    return this.mapEntry(row);
  }

  private requirePatient(patientId: string): { id: string; status: string } {
    const patient = this.database.raw
      .prepare("SELECT id, status FROM patients WHERE patient_id = ?")
      .get(patientId) as { id: string; status: string } | undefined;
    if (!patient)
      throw new Error("ELITE_PATIENT_NOT_FOUND: patient does not exist");
    return patient;
  }

  private requireActivePatient(patientId: string): {
    id: string;
    status: string;
  } {
    const patient = this.requirePatient(patientId);
    if (patient.status !== "active")
      throw new Error(
        "ELITE_PATIENT_NOT_ACTIVE: patient is missing or archived",
      );
    return patient;
  }

  private mapEntry(row: Record<string, unknown>): MedicalHistoryEntry {
    return medicalHistorySchema.parse({
      id: String(row["id"]),
      patientId: String(row["patient_display_id"]),
      category: row["category"],
      title: String(row["title"]),
      ...(row["details"] ? { details: String(row["details"]) } : {}),
      ...(row["onset_date"] ? { onsetDate: String(row["onset_date"]) } : {}),
      status: row["status"],
      source: row["source"],
      recordedAt: String(row["recorded_at"]),
      recordedByUserId: String(row["recorded_by_user_id"]),
      updatedAt: String(row["updated_at"]),
      updatedByUserId: String(row["updated_by_user_id"]),
      version: Number(row["version"]),
    });
  }

  private writeAudit(
    context: SessionContext,
    action: string,
    entityId: string,
    patientId: string,
    metadata: Record<string, unknown>,
  ): void {
    const patient = this.requirePatient(patientId);
    this.database.raw
      .prepare(
        `INSERT INTO audit_events
          (id, actor_user_id, device_id, action, entity_type, entity_id, patient_id, result, metadata_json, occurred_at)
         VALUES (?, ?, ?, ?, 'medical-history', ?, ?, 'success', ?, ?)`,
      )
      .run(
        nanoid(18),
        context.userId,
        context.deviceId,
        action,
        entityId,
        patient.id,
        JSON.stringify(metadata),
        this.now(),
      );
  }
}
