import { nanoid } from "nanoid";
import { z } from "zod";
import {
  duplicateCandidateSchema,
  patientArchiveInputSchema,
  patientIdSchema,
  patientMergeCaseSchema,
  patientMergeFieldDecisionsSchema,
  patientMergeRequestSchema,
  patientRegistrationInputSchema,
  patientSchema,
  patientUpdateInputSchema,
  type DuplicateCandidate,
  type Patient,
  type PatientMergeCase,
  type PatientMergeRequest,
  type PatientRegistrationInput,
  type PatientUpdateInput,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import {
  hasCapability,
  requireCapability,
  type SessionContext,
} from "./index.js";

export interface RelatedPersonInput {
  displayNameEn: string;
  displayNameAr?: string;
  relationship: string;
  phoneNumbers: string[];
  nationalId?: string;
  isGuardian: boolean;
  isAuthorizedToConsent: boolean;
  isAuthorizedToContact: boolean;
  verificationStatus?: "unverified" | "verified" | "rejected";
  preferredContactMethod?: "phone" | "sms" | "whatsapp" | "email" | "none";
}

export interface RelatedPersonSummary extends RelatedPersonInput {
  id: string;
  verificationStatus: NonNullable<RelatedPersonInput["verificationStatus"]>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RelatedPersonLinkInput {
  relationshipRole: string;
  isPrimary: boolean;
  consentAuthority: "none" | "inform" | "consent";
  verificationStatus: "unverified" | "verified";
}

export interface PatientRelatedPersonLinkSummary extends RelatedPersonLinkInput {
  patientId: string;
  relatedPersonId: string;
  relatedPerson: RelatedPersonSummary;
  verifiedAt?: string;
  verifiedByUserId?: string;
  endedAt?: string;
}

export interface PatientSearchFilters {
  query?: string;
  includeArchived?: boolean;
  limit?: number;
}

export const patientSearchFiltersSchema = z
  .object({
    query: z.string().trim().max(160).optional(),
    includeArchived: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .transform((value): PatientSearchFilters => ({
    ...(value.query !== undefined ? { query: value.query } : {}),
    ...(value.includeArchived !== undefined
      ? { includeArchived: value.includeArchived }
      : {}),
    ...(value.limit !== undefined ? { limit: value.limit } : {}),
  }));

export interface PatientIdentityServiceOptions {
  now?: () => string;
}

const SCORE_THRESHOLDS = { high: 60, possible: 35 } as const;
export const relatedPersonInputSchema = z
  .object({
    displayNameEn: z.string().trim().min(1).max(160),
    displayNameAr: z.string().trim().max(160).optional(),
    relationship: z.string().trim().min(1).max(80),
    phoneNumbers: z.array(z.string().trim().min(3).max(32)).min(1).max(10),
    nationalId: z.string().trim().max(64).optional(),
    isGuardian: z.boolean(),
    isAuthorizedToConsent: z.boolean(),
    isAuthorizedToContact: z.boolean(),
    verificationStatus: z
      .enum(["unverified", "verified", "rejected"])
      .default("unverified"),
    preferredContactMethod: z
      .enum(["phone", "sms", "whatsapp", "email", "none"])
      .optional(),
  })
  .transform((value): RelatedPersonInput => ({
    displayNameEn: value.displayNameEn,
    ...(value.displayNameAr !== undefined
      ? { displayNameAr: value.displayNameAr }
      : {}),
    relationship: value.relationship,
    phoneNumbers: value.phoneNumbers,
    ...(value.nationalId !== undefined ? { nationalId: value.nationalId } : {}),
    isGuardian: value.isGuardian,
    isAuthorizedToConsent: value.isAuthorizedToConsent,
    isAuthorizedToContact: value.isAuthorizedToContact,
    verificationStatus: value.verificationStatus,
    ...(value.preferredContactMethod !== undefined
      ? { preferredContactMethod: value.preferredContactMethod }
      : {}),
  }));
export const relatedPersonLinkInputSchema = z.object({
  relationshipRole: z.string().trim().min(1).max(80),
  isPrimary: z.boolean(),
  consentAuthority: z.enum(["none", "inform", "consent"]),
  verificationStatus: z.enum(["unverified", "verified"]),
});
const SIGNAL_WEIGHTS = {
  nationalId: 45,
  nameEn: 25,
  dob: 20,
  phone: 15,
  nameAr: 10,
  sex: 5,
} as const;

function defaultNow(): string {
  return new Date().toISOString();
}

function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizePhone(value: string): string {
  return value.replace(/[^0-9+]/gu, "").replace(/^00/gu, "+");
}

function normalizeNationalId(value: string | undefined): string | null {
  return normalizeText(value)?.replace(/[^a-z0-9]/gu, "") ?? null;
}

function patientNumber(value: string): number {
  const match = /^EL-(\d+)$/u.exec(value);
  return match ? Number(match[1]) : 0;
}

function mask(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function writeAudit(
  database: EliteDatabase,
  context: SessionContext,
  input: {
    action: string;
    entityType?: string;
    entityId?: string;
    patientId?: string;
    result: "success" | "failure" | "denied";
    metadata?: Record<string, unknown>;
  },
  now: string,
): void {
  database.raw
    .prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, device_id, action, entity_type, entity_id, patient_id, result, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      nanoid(18),
      context.userId,
      context.deviceId,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.patientId ?? null,
      input.result,
      JSON.stringify(input.metadata ?? {}),
      now,
    );
}

function rowToPatient(
  database: EliteDatabase,
  row: Record<string, unknown>,
): Patient {
  const relatedPersonIds = database.raw
    .prepare(
      "SELECT related_person_id FROM patient_related_persons WHERE patient_id = ? AND ended_at IS NULL ORDER BY is_primary DESC, created_at",
    )
    .all(String(row["id"]))
    .map((link) =>
      String((link as { related_person_id: string }).related_person_id),
    );

  const result: Patient = {
    id: String(row["id"]),
    patientId: String(row["patient_id"]),
    nameEn: String(row["name_en"]),
    relatedPersonIds,
    phone: String(row["phone"]),
    registrationMode: row["registration_mode"] as Patient["registrationMode"],
    completenessStatus: row[
      "completeness_status"
    ] as Patient["completenessStatus"],
    status: row["status"] as Patient["status"],
    createdAt: String(row["created_at"]),
    createdByUserId: String(row["created_by_user_id"]),
    updatedAt: String(row["updated_at"]),
    updatedByUserId: String(row["updated_by_user_id"]),
    version: Number(row["version"]),
    schemaVersion: Number(row["schema_version"]),
  };
  for (const [key, value] of [
    ["nameAr", row["name_ar"]],
    ["dob", row["dob"]],
    ["sex", row["sex"]],
    ["nationalId", row["national_id"]],
    ["primaryDepartmentId", row["primary_department_id"]],
    ["archivedAt", row["archived_at"]],
    ["archiveReason", row["archive_reason"]],
    ["mergedIntoPatientId", row["merged_into_patient_id"]],
  ] as const) {
    if (value !== null && value !== undefined) {
      (result as Record<string, unknown>)[key] =
        key === "mergedIntoPatientId"
          ? (
              database.raw
                .prepare("SELECT patient_id FROM patients WHERE id = ?")
                .get(value) as { patient_id: string } | undefined
            )?.patient_id
          : value;
    }
  }
  return patientSchema.parse(result);
}

function duplicateSignals(
  candidate: Record<string, unknown>,
  input: PatientRegistrationInput | PatientUpdateInput,
): DuplicateCandidate["signals"] {
  const signals: DuplicateCandidate["signals"] = [];
  if (
    input.nationalId &&
    normalizeNationalId(input.nationalId) ===
      normalizeNationalId(String(candidate["national_id"] ?? ""))
  )
    signals.push({ code: "national-id", weight: SIGNAL_WEIGHTS.nationalId });
  if (
    normalizeText(input.nameEn) ===
    normalizeText(String(candidate["name_en"] ?? ""))
  )
    signals.push({ code: "name-en", weight: SIGNAL_WEIGHTS.nameEn });
  if (input.dob && input.dob === candidate["dob"]) {
    signals.push({ code: "dob", weight: SIGNAL_WEIGHTS.dob });
  }
  if (
    normalizePhone(input.phone) ===
    normalizePhone(String(candidate["phone"] ?? ""))
  )
    signals.push({ code: "phone", weight: SIGNAL_WEIGHTS.phone });
  if (
    input.nameAr &&
    normalizeText(input.nameAr) ===
      normalizeText(String(candidate["name_ar"] ?? ""))
  )
    signals.push({ code: "name-ar", weight: SIGNAL_WEIGHTS.nameAr });
  if (input.sex && input.sex === candidate["sex"]) {
    signals.push({ code: "sex", weight: SIGNAL_WEIGHTS.sex });
  }
  return signals;
}

export class PatientIdentityService {
  private readonly now: () => string;

  public constructor(
    private readonly database: EliteDatabase,
    options: PatientIdentityServiceOptions = {},
  ) {
    this.now = options.now ?? defaultNow;
  }

  public createRelatedPerson(
    context: SessionContext,
    input: RelatedPersonInput,
  ): RelatedPersonSummary {
    requireCapability(context, "patient.write");
    const parsed = relatedPersonInputSchema.parse(input);
    const timestamp = this.now();
    const id = nanoid(18);
    this.database.raw
      .prepare(
        `INSERT INTO related_persons
          (id, display_name_en, display_name_ar, relationship, phone_numbers_json, national_id, is_guardian,
           is_authorized_to_consent, is_authorized_to_contact, verification_status, preferred_contact_method,
           created_by_user_id, updated_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        parsed.displayNameEn,
        parsed.displayNameAr ?? null,
        parsed.relationship,
        JSON.stringify(parsed.phoneNumbers),
        parsed.nationalId ?? null,
        parsed.isGuardian ? 1 : 0,
        parsed.isAuthorizedToConsent ? 1 : 0,
        parsed.isAuthorizedToContact ? 1 : 0,
        parsed.verificationStatus,
        parsed.preferredContactMethod ?? null,
        context.userId,
        context.userId,
        timestamp,
        timestamp,
      );
    writeAudit(
      this.database,
      context,
      {
        action: "related-person.create",
        entityType: "related-person",
        entityId: id,
        result: "success",
        metadata: { isGuardian: parsed.isGuardian },
      },
      timestamp,
    );
    return this.getRelatedPerson(id);
  }

  public listRelatedPersons(
    context: SessionContext,
    patientId: string,
  ): readonly RelatedPersonSummary[] {
    requireCapability(context, "patient.read");
    const parsedId = patientIdSchema.parse(patientId);
    const rows = this.database.raw
      .prepare(
        `SELECT r.* FROM related_persons r
         JOIN patient_related_persons link ON link.related_person_id = r.id
         JOIN patients p ON p.id = link.patient_id
         WHERE p.patient_id = ? AND link.ended_at IS NULL
         ORDER BY link.is_primary DESC, r.display_name_en`,
      )
      .all(parsedId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapRelatedPerson(row));
  }

  public updateRelatedPerson(
    context: SessionContext,
    relatedPersonId: string,
    input: RelatedPersonInput,
    expectedVersion: number,
  ): RelatedPersonSummary {
    requireCapability(context, "patient.write");
    const parsed = relatedPersonInputSchema.parse(input);
    const timestamp = this.now();
    const result = this.database.raw
      .prepare(
        `UPDATE related_persons SET display_name_en = ?, display_name_ar = ?, relationship = ?, phone_numbers_json = ?, national_id = ?,
         is_guardian = ?, is_authorized_to_consent = ?, is_authorized_to_contact = ?, verification_status = ?, preferred_contact_method = ?,
         updated_by_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?`,
      )
      .run(
        parsed.displayNameEn,
        parsed.displayNameAr ?? null,
        parsed.relationship,
        JSON.stringify(parsed.phoneNumbers),
        parsed.nationalId ?? null,
        parsed.isGuardian ? 1 : 0,
        parsed.isAuthorizedToConsent ? 1 : 0,
        parsed.isAuthorizedToContact ? 1 : 0,
        parsed.verificationStatus,
        parsed.preferredContactMethod ?? null,
        context.userId,
        timestamp,
        relatedPersonId,
        expectedVersion,
      );
    if (result.changes !== 1)
      throw new Error(
        "ELITE_RELATED_PERSON_VERSION_CONFLICT: related person was changed by another device",
      );
    writeAudit(
      this.database,
      context,
      {
        action: "related-person.update",
        entityType: "related-person",
        entityId: relatedPersonId,
        result: "success",
        metadata: { expectedVersion },
      },
      timestamp,
    );
    return this.getRelatedPerson(relatedPersonId);
  }

  public listPatientRelatedLinks(
    context: SessionContext,
    patientId: string,
  ): readonly PatientRelatedPersonLinkSummary[] {
    requireCapability(context, "patient.read");
    const parsedPatientId = patientIdSchema.parse(patientId);
    const rows = this.database.raw
      .prepare(
        `SELECT p.patient_id, link.related_person_id, link.relationship_role, link.is_primary, link.consent_authority,
                link.verified_at, link.verified_by_user_id, link.ended_at,
                r.*
         FROM patients p
         JOIN patient_related_persons link ON link.patient_id = p.id
         JOIN related_persons r ON r.id = link.related_person_id
         WHERE p.patient_id = ? AND link.ended_at IS NULL
         ORDER BY link.is_primary DESC, r.display_name_en`,
      )
      .all(parsedPatientId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapPatientRelatedLink(row));
  }

  public linkRelatedPerson(
    context: SessionContext,
    patientId: string,
    relatedPersonId: string,
    input: RelatedPersonLinkInput,
  ): PatientRelatedPersonLinkSummary {
    requireCapability(context, "patient.write");
    const parsedPatientId = patientIdSchema.parse(patientId);
    const parsedRelatedPersonId = z
      .string()
      .trim()
      .min(1)
      .parse(relatedPersonId);
    const parsed = relatedPersonLinkInputSchema.parse(input);
    const patient = this.database.raw
      .prepare("SELECT id, status FROM patients WHERE patient_id = ?")
      .get(parsedPatientId) as { id: string; status: string } | undefined;
    if (!patient)
      throw new Error("ELITE_PATIENT_NOT_FOUND: patient does not exist");
    if (patient.status !== "active")
      throw new Error(
        "ELITE_PATIENT_LINK_REQUIRES_ACTIVE: patient is not active",
      );
    if (
      !this.database.raw
        .prepare("SELECT id FROM related_persons WHERE id = ?")
        .get(parsedRelatedPersonId)
    )
      throw new Error(
        "ELITE_RELATED_PERSON_NOT_FOUND: related person does not exist",
      );
    const timestamp = this.now();
    const verifiedAt =
      parsed.verificationStatus === "verified" ? timestamp : null;
    this.database.raw
      .prepare(
        `INSERT INTO patient_related_persons
           (patient_id, related_person_id, relationship_role, is_primary, created_at, consent_authority, verified_at, verified_by_user_id, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(patient_id, related_person_id) DO UPDATE SET
           relationship_role = excluded.relationship_role,
           is_primary = excluded.is_primary,
           consent_authority = excluded.consent_authority,
           verified_at = excluded.verified_at,
           verified_by_user_id = excluded.verified_by_user_id,
           ended_at = NULL`,
      )
      .run(
        patient.id,
        parsedRelatedPersonId,
        parsed.relationshipRole,
        parsed.isPrimary ? 1 : 0,
        timestamp,
        parsed.consentAuthority,
        verifiedAt,
        parsed.verificationStatus === "verified" ? context.userId : null,
      );
    writeAudit(
      this.database,
      context,
      {
        action: "patient.related-person.link",
        entityType: "patient-related-person",
        entityId: `${patient.id}:${parsedRelatedPersonId}`,
        patientId: parsedPatientId,
        result: "success",
        metadata: parsed,
      },
      timestamp,
    );
    return this.getPatientRelatedLink(parsedPatientId, parsedRelatedPersonId);
  }

  public updatePatientRelatedLink(
    context: SessionContext,
    patientId: string,
    relatedPersonId: string,
    input: RelatedPersonLinkInput,
  ): PatientRelatedPersonLinkSummary {
    requireCapability(context, "patient.write");
    const parsedPatientId = patientIdSchema.parse(patientId);
    const parsedRelatedPersonId = z
      .string()
      .trim()
      .min(1)
      .parse(relatedPersonId);
    const parsed = relatedPersonLinkInputSchema.parse(input);
    const patient = this.database.raw
      .prepare("SELECT id, status FROM patients WHERE patient_id = ?")
      .get(parsedPatientId) as { id: string; status: string } | undefined;
    if (!patient)
      throw new Error("ELITE_PATIENT_NOT_FOUND: patient does not exist");
    const timestamp = this.now();
    const result = this.database.raw
      .prepare(
        `UPDATE patient_related_persons SET relationship_role = ?, is_primary = ?, consent_authority = ?, verified_at = ?, verified_by_user_id = ?
         WHERE patient_id = ? AND related_person_id = ? AND ended_at IS NULL`,
      )
      .run(
        parsed.relationshipRole,
        parsed.isPrimary ? 1 : 0,
        parsed.consentAuthority,
        parsed.verificationStatus === "verified" ? timestamp : null,
        parsed.verificationStatus === "verified" ? context.userId : null,
        patient.id,
        parsedRelatedPersonId,
      );
    if (result.changes !== 1)
      throw new Error(
        "ELITE_PATIENT_LINK_NOT_FOUND: active related-person link does not exist",
      );
    writeAudit(
      this.database,
      context,
      {
        action: "patient.related-person.update",
        entityType: "patient-related-person",
        entityId: `${patient.id}:${parsedRelatedPersonId}`,
        patientId: parsedPatientId,
        result: "success",
        metadata: parsed,
      },
      timestamp,
    );
    return this.getPatientRelatedLink(parsedPatientId, parsedRelatedPersonId);
  }

  public unlinkRelatedPerson(
    context: SessionContext,
    patientId: string,
    relatedPersonId: string,
    reason: string,
  ): void {
    requireCapability(context, "patient.write");
    const parsedPatientId = patientIdSchema.parse(patientId);
    const parsedRelatedPersonId = z
      .string()
      .trim()
      .min(1)
      .parse(relatedPersonId);
    const parsedReason = z.string().trim().min(3).max(500).parse(reason);
    const patient = this.database.raw
      .prepare("SELECT id FROM patients WHERE patient_id = ?")
      .get(parsedPatientId) as { id: string } | undefined;
    if (!patient)
      throw new Error("ELITE_PATIENT_NOT_FOUND: patient does not exist");
    const timestamp = this.now();
    const result = this.database.raw
      .prepare(
        "UPDATE patient_related_persons SET ended_at = ? WHERE patient_id = ? AND related_person_id = ? AND ended_at IS NULL",
      )
      .run(timestamp, patient.id, parsedRelatedPersonId);
    if (result.changes !== 1)
      throw new Error(
        "ELITE_PATIENT_LINK_NOT_FOUND: active related-person link does not exist",
      );
    writeAudit(
      this.database,
      context,
      {
        action: "patient.related-person.unlink",
        entityType: "patient-related-person",
        entityId: `${patient.id}:${parsedRelatedPersonId}`,
        patientId: parsedPatientId,
        result: "success",
        metadata: { reason: parsedReason },
      },
      timestamp,
    );
  }

  public searchPatients(
    context: SessionContext,
    filters: PatientSearchFilters = {},
  ): readonly Patient[] {
    requireCapability(context, "patient.read");
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
    const query = filters.query?.trim();
    const includeArchived = filters.includeArchived ?? false;
    const rows = query
      ? this.database.raw
          .prepare(
            `SELECT * FROM patients
             WHERE (? = 1 OR status = 'active')
               AND (patient_id LIKE ? OR name_en LIKE ? OR COALESCE(name_ar, '') LIKE ? OR phone LIKE ? OR COALESCE(national_id, '') LIKE ?)
             ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, patient_id
             LIMIT ?`,
          )
          .all(
            includeArchived ? 1 : 0,
            `%${query}%`,
            `%${query}%`,
            `%${query}%`,
            `%${query}%`,
            `%${query}%`,
            limit,
          )
      : this.database.raw
          .prepare(
            `SELECT * FROM patients
             WHERE (? = 1 OR status = 'active')
             ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, patient_id
             LIMIT ?`,
          )
          .all(includeArchived ? 1 : 0, limit);
    return (rows as Array<Record<string, unknown>>).map((row) =>
      rowToPatient(this.database, row),
    );
  }

  public getPatient(context: SessionContext, patientId: string): Patient {
    requireCapability(context, "patient.read");
    const parsedId = patientIdSchema.parse(patientId);
    const row = this.database.raw
      .prepare("SELECT * FROM patients WHERE patient_id = ?")
      .get(parsedId) as Record<string, unknown> | undefined;
    if (!row)
      throw new Error("ELITE_PATIENT_NOT_FOUND: patient does not exist");
    return rowToPatient(this.database, row);
  }

  public findDuplicateCandidates(
    context: SessionContext,
    input: PatientRegistrationInput | PatientUpdateInput,
    excludePatientId?: string,
  ): readonly DuplicateCandidate[] {
    requireCapability(context, "patient.read");
    const parsed = patientRegistrationInputSchema
      .or(patientUpdateInputSchema)
      .parse(input);
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM patients
         WHERE status = 'active'
           AND (? IS NULL OR patient_id != ?)
           AND (normalized_name_en = ? OR normalized_phone = ? OR (? IS NOT NULL AND normalized_national_id = ?))
         ORDER BY patient_id
         LIMIT 100`,
      )
      .all(
        excludePatientId ?? null,
        excludePatientId ?? null,
        normalizeText(parsed.nameEn) ?? "",
        normalizePhone(parsed.phone),
        normalizeNationalId(parsed.nationalId),
        normalizeNationalId(parsed.nationalId),
      ) as Array<Record<string, unknown>>;
    return rows
      .map((row) => {
        const signals = duplicateSignals(row, parsed);
        const score = signals.reduce((sum, signal) => sum + signal.weight, 0);
        const candidate = {
          patient: rowToPatient(this.database, row),
          score,
          severity: score >= SCORE_THRESHOLDS.high ? "high" : "possible",
          signals,
        } satisfies DuplicateCandidate;
        return duplicateCandidateSchema.parse(candidate);
      })
      .filter(
        (candidate) =>
          candidate.score >= SCORE_THRESHOLDS.possible ||
          candidate.signals.some((signal) => signal.code === "phone"),
      );
  }

  public registerPatient(
    context: SessionContext,
    input: PatientRegistrationInput,
    decisionReason?: string,
  ): { patient: Patient; duplicateCandidates: readonly DuplicateCandidate[] } {
    requireCapability(context, "patient.write");
    const parsed = patientRegistrationInputSchema.parse(input);
    const candidates = this.findDuplicateCandidates(context, parsed);
    if (candidates.length > 0 && !decisionReason) {
      throw new Error(
        "ELITE_PATIENT_DUPLICATE_REVIEW_REQUIRED: review duplicate candidates before registration",
      );
    }
    const timestamp = this.now();
    const internalId = nanoid(18);
    const registrationTransaction = this.database.raw.transaction(() => {
      const sequence = this.database.raw
        .prepare(
          "SELECT next_number FROM patient_identity_sequence WHERE id = 1",
        )
        .get() as { next_number: number } | undefined;
      if (!sequence)
        throw new Error(
          "ELITE_PATIENT_SEQUENCE_UNAVAILABLE: patient identifier sequence is missing",
        );
      this.database.raw
        .prepare(
          "UPDATE patient_identity_sequence SET next_number = next_number + 1, updated_at = ? WHERE id = 1",
        )
        .run(timestamp);
      const displayId = `EL-${String(sequence.next_number).padStart(5, "0")}`;
      this.database.raw
        .prepare(
          `INSERT INTO patients
            (id, patient_id, name_en, name_ar, dob, sex, phone, national_id, primary_department_id, status,
             created_at, created_by_user_id, updated_at, updated_by_user_id, schema_version, registration_mode,
             completeness_status, normalized_name_en, normalized_name_ar, normalized_phone, normalized_national_id, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          internalId,
          displayId,
          parsed.nameEn,
          parsed.nameAr ?? null,
          parsed.dob ?? null,
          parsed.sex ?? null,
          parsed.phone,
          parsed.nationalId ?? null,
          parsed.primaryDepartmentId ?? null,
          timestamp,
          context.userId,
          timestamp,
          context.userId,
          parsed.registrationMode,
          parsed.registrationMode === "full" ? "complete" : "minimal",
          normalizeText(parsed.nameEn),
          normalizeText(parsed.nameAr),
          normalizePhone(parsed.phone),
          normalizeNationalId(parsed.nationalId),
        );
      this.replaceRelatedLinks(
        internalId,
        parsed.relatedPersons,
        context,
        timestamp,
      );
      if (candidates.length > 0) {
        const reviewStatement = this.database.raw.prepare(
          "INSERT INTO patient_duplicate_reviews (id, patient_id, candidate_patient_id, score, signals_json, status, decision_reason, requested_by_user_id, requested_at, decided_by_user_id, decided_at) VALUES (?, ?, ?, ?, ?, 'created-another', ?, ?, ?, ?, ?)",
        );
        for (const candidate of candidates) {
          reviewStatement.run(
            nanoid(18),
            internalId,
            candidate.patient.id,
            candidate.score,
            JSON.stringify(candidate.signals),
            decisionReason,
            context.userId,
            timestamp,
            context.userId,
            timestamp,
          );
        }
      }
      this.recordIdentityHistory(
        internalId,
        "created",
        { registrationMode: parsed.registrationMode },
        context,
        timestamp,
      );
      writeAudit(
        this.database,
        context,
        {
          action: "patient.create",
          entityType: "patient",
          entityId: internalId,
          patientId: displayId,
          result: "success",
          metadata: {
            duplicateCandidateCount: candidates.length,
            decisionReason: decisionReason ? "recorded" : "none",
          },
        },
        timestamp,
      );
      return displayId;
    });
    const patientId = registrationTransaction.immediate();
    const patient = this.getPatient(context, patientId);
    return { patient, duplicateCandidates: candidates };
  }

  public updatePatient(
    context: SessionContext,
    patientId: string,
    input: PatientUpdateInput,
    expectedVersion: number,
    decisionReason?: string,
  ): Patient {
    requireCapability(context, "patient.write");
    const parsedId = patientIdSchema.parse(patientId);
    const parsed = patientUpdateInputSchema.parse(input);
    const current = this.database.raw
      .prepare("SELECT * FROM patients WHERE patient_id = ?")
      .get(parsedId) as Record<string, unknown> | undefined;
    if (!current)
      throw new Error("ELITE_PATIENT_NOT_FOUND: patient does not exist");
    const candidates = this.findDuplicateCandidates(context, parsed, parsedId);
    if (candidates.length > 0 && !decisionReason) {
      throw new Error(
        "ELITE_PATIENT_DUPLICATE_REVIEW_REQUIRED: review duplicate candidates before updating",
      );
    }
    const timestamp = this.now();
    const registrationMode =
      parsed.registrationMode ??
      (current["registration_mode"] as Patient["registrationMode"]);
    const completenessStatus =
      registrationMode === "full" ? "complete" : "minimal";
    const result = this.database.raw
      .prepare(
        `UPDATE patients SET name_en = ?, name_ar = ?, dob = ?, sex = ?, phone = ?, national_id = ?, primary_department_id = ?,
         registration_mode = ?, completeness_status = ?, normalized_name_en = ?, normalized_name_ar = ?, normalized_phone = ?, normalized_national_id = ?,
         updated_at = ?, updated_by_user_id = ?, version = version + 1
         WHERE patient_id = ? AND version = ? AND status = 'active'`,
      )
      .run(
        parsed.nameEn,
        parsed.nameAr ?? null,
        parsed.dob ?? null,
        parsed.sex ?? null,
        parsed.phone,
        parsed.nationalId ?? null,
        parsed.primaryDepartmentId ?? null,
        registrationMode,
        completenessStatus,
        normalizeText(parsed.nameEn),
        normalizeText(parsed.nameAr),
        normalizePhone(parsed.phone),
        normalizeNationalId(parsed.nationalId),
        timestamp,
        context.userId,
        parsedId,
        expectedVersion,
      );
    if (result.changes !== 1)
      throw new Error(
        "ELITE_PATIENT_VERSION_CONFLICT: patient was changed by another device",
      );
    const row = this.database.raw
      .prepare("SELECT id FROM patients WHERE patient_id = ?")
      .get(parsedId) as { id: string };
    if (parsed.relatedPersons)
      this.replaceRelatedLinks(
        row.id,
        parsed.relatedPersons,
        context,
        timestamp,
      );
    if (candidates.length > 0) {
      const reviewStatement = this.database.raw.prepare(
        "INSERT INTO patient_duplicate_reviews (id, patient_id, candidate_patient_id, score, signals_json, status, decision_reason, requested_by_user_id, requested_at, decided_by_user_id, decided_at) VALUES (?, ?, ?, ?, ?, 'created-another', ?, ?, ?, ?, ?)",
      );
      for (const candidate of candidates) {
        reviewStatement.run(
          nanoid(18),
          row.id,
          candidate.patient.id,
          candidate.score,
          JSON.stringify(candidate.signals),
          decisionReason,
          context.userId,
          timestamp,
          context.userId,
          timestamp,
        );
      }
    }
    this.recordIdentityHistory(
      row.id,
      "updated",
      {
        fields: [
          "nameEn",
          "nameAr",
          "dob",
          "sex",
          "phone",
          "nationalId",
          "primaryDepartmentId",
        ],
      },
      context,
      timestamp,
    );
    writeAudit(
      this.database,
      context,
      {
        action: "patient.update",
        entityType: "patient",
        entityId: row.id,
        patientId: parsedId,
        result: "success",
        metadata: {
          duplicateCandidateCount: candidates.length,
          decisionReason: decisionReason ? "recorded" : "none",
        },
      },
      timestamp,
    );
    return this.getPatient(context, parsedId);
  }

  public archivePatient(
    context: SessionContext,
    input: { patientId: string; reason: string },
  ): void {
    requireCapability(context, "patient.archive");
    const parsed = patientArchiveInputSchema.parse(input);
    const timestamp = this.now();
    const result = this.database.raw
      .prepare(
        "UPDATE patients SET status = 'archived', archived_at = ?, archived_by_user_id = ?, archive_reason = ?, updated_at = ?, updated_by_user_id = ?, version = version + 1 WHERE patient_id = ? AND status = 'active'",
      )
      .run(
        timestamp,
        context.userId,
        parsed.reason,
        timestamp,
        context.userId,
        parsed.patientId,
      );
    if (result.changes !== 1)
      throw new Error(
        "ELITE_PATIENT_NOT_ACTIVE: patient is missing or already archived",
      );
    const row = this.database.raw
      .prepare("SELECT id FROM patients WHERE patient_id = ?")
      .get(parsed.patientId) as { id: string };
    this.recordIdentityHistory(
      row.id,
      "archived",
      { reasonRecorded: true },
      context,
      timestamp,
    );
    writeAudit(
      this.database,
      context,
      {
        action: "patient.archive",
        entityType: "patient",
        entityId: row.id,
        patientId: parsed.patientId,
        result: "success",
      },
      timestamp,
    );
  }

  public unarchivePatient(
    context: SessionContext,
    patientId: string,
    reason: string,
  ): void {
    requireCapability(context, "patient.archive");
    const parsedId = patientIdSchema.parse(patientId);
    const parsedReason = z.string().trim().min(3).max(500).parse(reason);
    const timestamp = this.now();
    const result = this.database.raw
      .prepare(
        "UPDATE patients SET status = 'active', archived_at = NULL, archived_by_user_id = NULL, archive_reason = NULL, updated_at = ?, updated_by_user_id = ?, version = version + 1 WHERE patient_id = ? AND status = 'archived'",
      )
      .run(timestamp, context.userId, parsedId);
    if (result.changes !== 1)
      throw new Error("ELITE_PATIENT_NOT_ARCHIVED: patient is not archived");
    const row = this.database.raw
      .prepare("SELECT id FROM patients WHERE patient_id = ?")
      .get(parsedId) as { id: string };
    this.recordIdentityHistory(
      row.id,
      "unarchived",
      { reasonRecorded: true, reason: parsedReason },
      context,
      timestamp,
    );
    writeAudit(
      this.database,
      context,
      {
        action: "patient.unarchive",
        entityType: "patient",
        entityId: row.id,
        patientId: parsedId,
        result: "success",
      },
      timestamp,
    );
  }

  public requestMerge(
    context: SessionContext,
    input: PatientMergeRequest,
  ): PatientMergeCase {
    requireCapability(context, "patient.merge");
    const parsed = patientMergeRequestSchema.parse(input);
    if (parsed.sourcePatientId === parsed.targetPatientId)
      throw new Error(
        "ELITE_PATIENT_MERGE_SELF_FORBIDDEN: source and target must differ",
      );
    const source = this.getPatient(context, parsed.sourcePatientId);
    const target = this.getPatient(context, parsed.targetPatientId);
    if (source.status !== "active" || target.status !== "active")
      throw new Error(
        "ELITE_PATIENT_MERGE_REQUIRES_ACTIVE: both patients must be active",
      );
    const timestamp = this.now();
    const id = nanoid(18);
    const correlationId = nanoid(18);
    this.database.raw
      .prepare(
        "INSERT INTO patient_merge_cases (id, source_patient_id, target_patient_id, status, reason, field_decisions_json, correlation_id, requested_by_user_id, requested_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        source.id,
        target.id,
        parsed.reason,
        JSON.stringify(parsed.fieldDecisions),
        correlationId,
        context.userId,
        timestamp,
      );
    this.recordIdentityHistory(
      source.id,
      "merge-requested",
      { targetPatientId: target.patientId },
      context,
      timestamp,
      correlationId,
    );
    writeAudit(
      this.database,
      context,
      {
        action: "patient.merge.request",
        entityType: "patient-merge-case",
        entityId: id,
        patientId: source.patientId,
        result: "success",
        metadata: { targetPatientId: target.patientId, correlationId },
      },
      timestamp,
    );
    return this.getMergeCase(context, id);
  }

  public listMergeCases(context: SessionContext): readonly PatientMergeCase[] {
    requireCapability(context, "patient.merge");
    const rows = this.database.raw
      .prepare("SELECT * FROM patient_merge_cases ORDER BY requested_at DESC")
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapMergeCase(row));
  }

  public reviewMergeCase(
    context: SessionContext,
    caseId: string,
    decision: "approve" | "reject",
    reason: string,
    fieldDecisions?: unknown,
  ): PatientMergeCase {
    requireCapability(context, "patient.merge");
    if (!hasCapability(context, "patient.merge"))
      throw new Error("ELITE_AUTH_CAPABILITY_REQUIRED: patient.merge");
    const parsedReason = z.string().trim().min(3).max(500).parse(reason);
    const merge = this.database.raw
      .prepare(
        "SELECT status, field_decisions_json FROM patient_merge_cases WHERE id = ?",
      )
      .get(caseId) as
      { status: string; field_decisions_json: string } | undefined;
    if (!merge || merge.status !== "pending")
      throw new Error(
        "ELITE_PATIENT_MERGE_CASE_NOT_PENDING: merge case is not pending",
      );
    const parsedFieldDecisions = patientMergeFieldDecisionsSchema.parse(
      fieldDecisions ?? JSON.parse(merge.field_decisions_json),
    );
    const timestamp = this.now();
    const nextStatus = decision === "approve" ? "approved" : "rejected";
    const result = this.database.raw
      .prepare(
        "UPDATE patient_merge_cases SET status = ?, field_decisions_json = ?, reviewed_by_user_id = ?, reviewed_at = ?, review_reason = ? WHERE id = ? AND status = 'pending'",
      )
      .run(
        nextStatus,
        JSON.stringify(parsedFieldDecisions),
        context.userId,
        timestamp,
        parsedReason,
        caseId,
      );
    if (result.changes !== 1)
      throw new Error(
        "ELITE_PATIENT_MERGE_CASE_NOT_PENDING: merge case is not pending",
      );
    writeAudit(
      this.database,
      context,
      {
        action: `patient.merge.${decision}`,
        entityType: "patient-merge-case",
        entityId: caseId,
        result: "success",
      },
      timestamp,
    );
    return this.getMergeCase(context, caseId);
  }

  public executeMerge(
    context: SessionContext,
    caseId: string,
  ): PatientMergeCase {
    requireCapability(context, "patient.merge");
    const timestamp = this.now();
    this.database.raw.transaction(() => {
      const merge = this.database.raw
        .prepare("SELECT * FROM patient_merge_cases WHERE id = ?")
        .get(caseId) as Record<string, unknown> | undefined;
      if (!merge || merge["status"] !== "approved")
        throw new Error(
          "ELITE_PATIENT_MERGE_NOT_APPROVED: merge case must be approved",
        );
      const source = this.database.raw
        .prepare("SELECT * FROM patients WHERE id = ?")
        .get(merge["source_patient_id"]) as Record<string, unknown> | undefined;
      const target = this.database.raw
        .prepare("SELECT * FROM patients WHERE id = ?")
        .get(merge["target_patient_id"]) as Record<string, unknown> | undefined;
      if (
        !source ||
        !target ||
        source["status"] !== "active" ||
        target["status"] !== "active"
      )
        throw new Error(
          "ELITE_PATIENT_MERGE_REQUIRES_ACTIVE: source and target must be active",
        );
      const fieldDecisions = JSON.parse(
        String(merge["field_decisions_json"]),
      ) as Record<string, "source" | "target">;
      const choose = (field: string, column: string): unknown =>
        fieldDecisions[field] === "source" ? source[column] : target[column];
      this.database.raw
        .prepare(
          `UPDATE patients SET name_en = ?, name_ar = ?, dob = ?, sex = ?, phone = ?, national_id = ?, primary_department_id = ?,
           normalized_name_en = ?, normalized_name_ar = ?, normalized_phone = ?, normalized_national_id = ?,
           updated_at = ?, updated_by_user_id = ?, version = version + 1
           WHERE id = ? AND status = 'active'`,
        )
        .run(
          choose("nameEn", "name_en"),
          choose("nameAr", "name_ar"),
          choose("dob", "dob"),
          choose("sex", "sex"),
          choose("phone", "phone"),
          choose("nationalId", "national_id"),
          choose("primaryDepartmentId", "primary_department_id"),
          normalizeText(String(choose("nameEn", "name_en") ?? "")),
          normalizeText(choose("nameAr", "name_ar") as string | null),
          normalizePhone(String(choose("phone", "phone") ?? "")),
          normalizeNationalId(
            choose("nationalId", "national_id") as string | undefined,
          ),
          timestamp,
          context.userId,
          target["id"],
        );
      this.database.raw
        .prepare(
          "UPDATE patients SET status = 'merged', merged_into_patient_id = ?, merged_at = ?, merged_by_user_id = ?, updated_at = ?, updated_by_user_id = ?, version = version + 1 WHERE id = ? AND status = 'active'",
        )
        .run(
          target["id"],
          timestamp,
          context.userId,
          timestamp,
          context.userId,
          source["id"],
        );
      this.database.raw
        .prepare(
          "UPDATE patient_related_persons SET patient_id = ? WHERE patient_id = ? AND ended_at IS NULL AND NOT EXISTS (SELECT 1 FROM patient_related_persons existing WHERE existing.patient_id = ? AND existing.related_person_id = patient_related_persons.related_person_id AND existing.ended_at IS NULL)",
        )
        .run(target["id"], source["id"], target["id"]);
      this.database.raw
        .prepare(
          "UPDATE patient_merge_cases SET status = 'executed', executed_by_user_id = ?, executed_at = ? WHERE id = ? AND status = 'approved'",
        )
        .run(context.userId, timestamp, caseId);
      this.recordIdentityHistory(
        String(source["id"]),
        "merged",
        { targetPatientId: target["patient_id"], caseId },
        context,
        timestamp,
        String(merge["correlation_id"]),
      );
      writeAudit(
        this.database,
        context,
        {
          action: "patient.merge.execute",
          entityType: "patient-merge-case",
          entityId: caseId,
          patientId: String(source["patient_id"]),
          result: "success",
          metadata: {
            targetPatientId: target["patient_id"],
            correlationId: merge["correlation_id"],
          },
        },
        timestamp,
      );
    })();
    return this.getMergeCase(context, caseId);
  }

  private getRelatedPerson(id: string): RelatedPersonSummary {
    const row = this.database.raw
      .prepare("SELECT * FROM related_persons WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row)
      throw new Error(
        "ELITE_RELATED_PERSON_NOT_FOUND: related person does not exist",
      );
    return this.mapRelatedPerson(row);
  }

  private getPatientRelatedLink(
    patientId: string,
    relatedPersonId: string,
  ): PatientRelatedPersonLinkSummary {
    const row = this.database.raw
      .prepare(
        `SELECT p.patient_id, link.related_person_id, link.relationship_role, link.is_primary, link.consent_authority,
                link.verified_at, link.verified_by_user_id, link.ended_at,
                r.*
         FROM patients p
         JOIN patient_related_persons link ON link.patient_id = p.id
         JOIN related_persons r ON r.id = link.related_person_id
         WHERE p.patient_id = ? AND link.related_person_id = ? AND link.ended_at IS NULL`,
      )
      .get(patientId, relatedPersonId) as Record<string, unknown> | undefined;
    if (!row)
      throw new Error(
        "ELITE_PATIENT_LINK_NOT_FOUND: active related-person link does not exist",
      );
    return this.mapPatientRelatedLink(row);
  }

  private mapPatientRelatedLink(
    row: Record<string, unknown>,
  ): PatientRelatedPersonLinkSummary {
    const result: Record<string, unknown> = {
      patientId: String(row["patient_id"]),
      relatedPersonId: String(row["related_person_id"]),
      relationshipRole: String(row["relationship_role"]),
      isPrimary: Number(row["is_primary"]) === 1,
      consentAuthority: row[
        "consent_authority"
      ] as RelatedPersonLinkInput["consentAuthority"],
      verificationStatus: row["verified_at"] ? "verified" : "unverified",
      relatedPerson: this.mapRelatedPerson(row),
    };
    for (const [key, column] of [
      ["verifiedAt", "verified_at"],
      ["verifiedByUserId", "verified_by_user_id"],
      ["endedAt", "ended_at"],
    ] as Array<[string, string]>) {
      if (row[column] !== null && row[column] !== undefined)
        result[key] = row[column];
    }
    return result as unknown as PatientRelatedPersonLinkSummary;
  }

  private mapRelatedPerson(row: Record<string, unknown>): RelatedPersonSummary {
    const result: Record<string, unknown> = {
      id: String(row["id"]),
      displayNameEn: String(row["display_name_en"]),
      relationship: String(row["relationship"]),
      phoneNumbers: JSON.parse(String(row["phone_numbers_json"])) as string[],
      isGuardian: Number(row["is_guardian"]) === 1,
      isAuthorizedToConsent: Number(row["is_authorized_to_consent"]) === 1,
      isAuthorizedToContact: Number(row["is_authorized_to_contact"]) === 1,
      verificationStatus: row[
        "verification_status"
      ] as RelatedPersonSummary["verificationStatus"],
      version: Number(row["version"] ?? 1),
      createdAt: String(row["created_at"]),
      updatedAt: String(row["updated_at"]),
    };
    for (const [key, value] of [
      ["displayNameAr", row["display_name_ar"]],
      ["nationalId", row["national_id"]],
      ["preferredContactMethod", row["preferred_contact_method"]],
    ] as Array<[string, unknown]>) {
      if (value !== null && value !== undefined) result[key] = value;
    }
    return result as unknown as RelatedPersonSummary;
  }

  private getMergeCase(
    context: SessionContext,
    caseId: string,
  ): PatientMergeCase {
    requireCapability(context, "patient.merge");
    const row = this.database.raw
      .prepare("SELECT * FROM patient_merge_cases WHERE id = ?")
      .get(caseId) as Record<string, unknown> | undefined;
    if (!row)
      throw new Error(
        "ELITE_PATIENT_MERGE_CASE_NOT_FOUND: merge case does not exist",
      );
    return this.mapMergeCase(row);
  }

  private mapMergeCase(row: Record<string, unknown>): PatientMergeCase {
    const source = this.database.raw
      .prepare("SELECT patient_id FROM patients WHERE id = ?")
      .get(row["source_patient_id"]) as { patient_id: string };
    const target = this.database.raw
      .prepare("SELECT patient_id FROM patients WHERE id = ?")
      .get(row["target_patient_id"]) as { patient_id: string };
    const result: Record<string, unknown> = {
      id: row["id"],
      sourcePatientId: source.patient_id,
      targetPatientId: target.patient_id,
      status: row["status"],
      reason: row["reason"],
      fieldDecisions: JSON.parse(String(row["field_decisions_json"])),
      correlationId: row["correlation_id"],
      requestedByUserId: row["requested_by_user_id"],
      requestedAt: row["requested_at"],
    };
    for (const [key, column] of [
      ["reviewedByUserId", "reviewed_by_user_id"],
      ["reviewedAt", "reviewed_at"],
      ["reviewReason", "review_reason"],
      ["executedByUserId", "executed_by_user_id"],
      ["executedAt", "executed_at"],
    ] as Array<[string, string]>) {
      if (row[column] !== null && row[column] !== undefined)
        result[key] = row[column];
    }
    return patientMergeCaseSchema.parse(result);
  }

  private replaceRelatedLinks(
    patientInternalId: string,
    links: PatientRegistrationInput["relatedPersons"],
    context: SessionContext,
    timestamp: string,
  ): void {
    if (!links) return;
    this.database.raw
      .prepare(
        "UPDATE patient_related_persons SET ended_at = ? WHERE patient_id = ? AND ended_at IS NULL",
      )
      .run(timestamp, patientInternalId);
    const statement = this.database.raw.prepare(
      "INSERT INTO patient_related_persons (patient_id, related_person_id, relationship_role, is_primary, created_at, consent_authority) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const link of links) {
      const exists = this.database.raw
        .prepare("SELECT id FROM related_persons WHERE id = ?")
        .get(link.relatedPersonId);
      if (!exists)
        throw new Error(
          "ELITE_RELATED_PERSON_NOT_FOUND: related person does not exist",
        );
      statement.run(
        patientInternalId,
        link.relatedPersonId,
        link.relationshipRole,
        link.isPrimary ? 1 : 0,
        timestamp,
        link.consentAuthority,
      );
    }
    void context;
  }

  private recordIdentityHistory(
    patientInternalId: string,
    action: string,
    summary: Record<string, unknown>,
    context: SessionContext,
    timestamp: string,
    correlationId?: string,
  ): void {
    this.database.raw
      .prepare(
        "INSERT INTO patient_identity_history (id, patient_id, action, change_summary_json, correlation_id, actor_user_id, device_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        nanoid(18),
        patientInternalId,
        action,
        JSON.stringify(summary),
        correlationId ?? null,
        context.userId,
        context.deviceId,
        timestamp,
      );
  }
}
