import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { nanoid } from "nanoid";
import {
  doctorDocumentContentSchema,
  doctorDocumentSchema,
  doctorDocumentUploadInputSchema,
  doctorDocumentViewRequestSchema,
  doctorProfileSchema,
  doctorProfileUpdateInputSchema,
  type DoctorDocument,
  type DoctorDocumentContent,
  type DoctorDocumentUploadInput,
  type DoctorProfile,
  type DoctorProfileUpdateInput,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import { requireCapability, type SessionContext } from "./index.js";

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const ENCRYPTION_VERSION = 1;
const SENSITIVE_DOCUMENT_TYPES = new Set([
  "national-id",
  "passport",
  "medical-degree",
  "professional-license",
  "employment-contract",
]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type Row = Record<string, unknown>;

export interface DoctorDocumentVault {
  write(relativePath: string, content: Buffer): Promise<void> | void;
  read(relativePath: string): Promise<Buffer> | Buffer;
  remove(relativePath: string): Promise<void> | void;
}

function now(): string {
  return new Date().toISOString();
}

function requireVaultKey(key: Buffer): Buffer {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error(
      "ELITE_DOCTOR_VAULT_KEY_INVALID: a 256-bit vault key is required",
    );
  }
  return key;
}

function deriveDocumentKey(masterKey: Buffer): Buffer {
  return createHmac("sha256", requireVaultKey(masterKey))
    .update("elite-clinic-doctor-document-vault-v1", "utf8")
    .digest();
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function jsonArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isDoctorRow(row: Row | undefined): boolean {
  return Boolean(
    row && row["role"] === "doctor" && Number(row["is_active"]) === 1,
  );
}

function sensitiveDocumentType(documentType: string): boolean {
  return SENSITIVE_DOCUMENT_TYPES.has(documentType);
}

function encodeEncryptedDocument(
  documentId: string,
  plaintext: Buffer,
  masterKey: Buffer,
): { ciphertext: Buffer; nonceBase64: string; authTagBase64: string } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveDocumentKey(masterKey),
    nonce,
  );
  cipher.setAAD(Buffer.from(documentId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext,
    nonceBase64: nonce.toString("base64"),
    authTagBase64: cipher.getAuthTag().toString("base64"),
  };
}

function decodeEncryptedDocument(
  documentId: string,
  ciphertext: Buffer,
  nonceBase64: string,
  authTagBase64: string,
  masterKey: Buffer,
): Buffer {
  const nonce = Buffer.from(nonceBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  if (nonce.length !== 12 || authTag.length !== 16) {
    throw new Error(
      "ELITE_DOCTOR_DOCUMENT_ENVELOPE_INVALID: encryption metadata is invalid",
    );
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveDocumentKey(masterKey),
    nonce,
  );
  decipher.setAAD(Buffer.from(documentId, "utf8"));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export class DoctorProfileService {
  public constructor(
    private readonly database: EliteDatabase,
    private readonly vault: DoctorDocumentVault,
    private readonly vaultKey: Buffer,
    private readonly clock: () => string = now,
  ) {
    requireVaultKey(vaultKey);
  }

  public listProfiles(context: SessionContext): readonly DoctorProfile[] {
    requireCapability(context, "doctor.profile.read");
    const includeInactive = context.role === "admin";
    const rows = this.database.raw
      .prepare(
        `SELECT users.id AS doctorId, users.display_name_en AS displayNameEn,
                users.display_name_ar AS displayNameAr, users.is_clinical_approver AS isClinicalApprover,
                users.is_active AS isActive, profiles.professional_registration_number AS professionalRegistrationNumber,
                profiles.license_expiry AS licenseExpiry, profiles.license_verification_status AS licenseVerificationStatus,
                profiles.specialty_ids_json AS specialtyIdsJson, profiles.department_ids_json AS departmentIdsJson,
                profiles.qualifications, profiles.biography, profiles.languages_json AS languagesJson,
                profiles.phone, profiles.email, profiles.clinic_room AS clinicRoom,
                profiles.consultation_fee_egp AS consultationFeeEgp, profiles.updated_at AS updatedAt
         FROM users LEFT JOIN doctor_profiles profiles ON profiles.doctor_id = users.id
         WHERE users.role = 'doctor' AND (? = 1 OR users.is_active = 1)
         ORDER BY users.display_name_en, users.id`,
      )
      .all(includeInactive ? 1 : 0) as Row[];
    return rows.map((row) => this.mapProfile(row));
  }

  public getProfile(context: SessionContext, doctorId: string): DoctorProfile {
    requireCapability(context, "doctor.profile.read");
    const row = this.database.raw
      .prepare(
        `SELECT users.id AS doctorId, users.display_name_en AS displayNameEn,
                users.display_name_ar AS displayNameAr, users.is_clinical_approver AS isClinicalApprover,
                users.is_active AS isActive, profiles.professional_registration_number AS professionalRegistrationNumber,
                profiles.license_expiry AS licenseExpiry, profiles.license_verification_status AS licenseVerificationStatus,
                profiles.specialty_ids_json AS specialtyIdsJson, profiles.department_ids_json AS departmentIdsJson,
                profiles.qualifications, profiles.biography, profiles.languages_json AS languagesJson,
                profiles.phone, profiles.email, profiles.clinic_room AS clinicRoom,
                profiles.consultation_fee_egp AS consultationFeeEgp, profiles.updated_at AS updatedAt
         FROM users LEFT JOIN doctor_profiles profiles ON profiles.doctor_id = users.id
         WHERE users.id = ? AND users.role = 'doctor'`,
      )
      .get(doctorId) as Row | undefined;
    if (!row || (context.role !== "admin" && Number(row["isActive"]) !== 1)) {
      throw new Error(
        "ELITE_DOCTOR_PROFILE_NOT_FOUND: doctor profile is unavailable",
      );
    }
    return this.mapProfile(row);
  }

  public updateProfile(
    context: SessionContext,
    input: DoctorProfileUpdateInput,
  ): DoctorProfile {
    requireCapability(context, "doctor.profile.write");
    const parsed = doctorProfileUpdateInputSchema.parse(input);
    if (context.role === "doctor" && context.userId !== parsed.doctorId) {
      throw new Error(
        "ELITE_DOCTOR_PROFILE_OWNER_REQUIRED: doctors may edit only their own profile",
      );
    }
    const user = this.database.raw
      .prepare("SELECT * FROM users WHERE id = ? AND role = 'doctor'")
      .get(parsed.doctorId) as Row | undefined;
    if (!isDoctorRow(user) && context.role !== "admin") {
      throw new Error(
        "ELITE_DOCTOR_PROFILE_NOT_FOUND: doctor account is unavailable",
      );
    }
    if (!user)
      throw new Error(
        "ELITE_DOCTOR_PROFILE_NOT_FOUND: doctor account is unavailable",
      );
    const adminOnlyFields: Array<keyof DoctorProfileUpdateInput> = [
      "licenseVerificationStatus",
      "specialtyIds",
      "departmentIds",
      "isClinicalApprover",
      "isActive",
      "consultationFeeEgp",
    ];
    if (
      context.role !== "admin" &&
      adminOnlyFields.some((field) => parsed[field] !== undefined)
    ) {
      throw new Error(
        "ELITE_DOCTOR_PROFILE_ADMIN_FIELD: this profile field requires an administrator",
      );
    }
    const current = this.getProfile(context, parsed.doctorId);
    const timestamp = this.clock();
    const next = {
      displayNameEn: parsed.displayNameEn ?? current.displayNameEn,
      displayNameAr:
        parsed.displayNameAr === null
          ? undefined
          : (parsed.displayNameAr ?? current.displayNameAr),
      professionalRegistrationNumber:
        parsed.professionalRegistrationNumber === null
          ? undefined
          : (parsed.professionalRegistrationNumber ??
            current.professionalRegistrationNumber),
      licenseExpiry:
        parsed.licenseExpiry === null
          ? undefined
          : (parsed.licenseExpiry ?? current.licenseExpiry),
      licenseVerificationStatus:
        parsed.licenseVerificationStatus ?? current.licenseVerificationStatus,
      specialtyIds: parsed.specialtyIds ?? current.specialtyIds,
      departmentIds: parsed.departmentIds ?? current.departmentIds,
      qualifications:
        parsed.qualifications === null
          ? undefined
          : (parsed.qualifications ?? current.qualifications),
      biography:
        parsed.biography === null
          ? undefined
          : (parsed.biography ?? current.biography),
      languages: parsed.languages ?? current.languages,
      phone:
        parsed.phone === null ? undefined : (parsed.phone ?? current.phone),
      email:
        parsed.email === null ? undefined : (parsed.email ?? current.email),
      clinicRoom:
        parsed.clinicRoom === null
          ? undefined
          : (parsed.clinicRoom ?? current.clinicRoom),
      consultationFeeEgp:
        parsed.consultationFeeEgp === null
          ? undefined
          : (parsed.consultationFeeEgp ?? current.consultationFeeEgp),
      isClinicalApprover:
        parsed.isClinicalApprover ?? current.isClinicalApprover,
      isActive: parsed.isActive ?? current.isActive,
    };
    this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          `INSERT INTO doctor_profiles
           (doctor_id, professional_registration_number, license_expiry, license_verification_status,
            specialty_ids_json, department_ids_json, qualifications, biography, languages_json, phone, email,
            clinic_room, consultation_fee_egp, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(doctor_id) DO UPDATE SET professional_registration_number = excluded.professional_registration_number,
             license_expiry = excluded.license_expiry, license_verification_status = excluded.license_verification_status,
             specialty_ids_json = excluded.specialty_ids_json, department_ids_json = excluded.department_ids_json,
             qualifications = excluded.qualifications, biography = excluded.biography, languages_json = excluded.languages_json,
             phone = excluded.phone, email = excluded.email, clinic_room = excluded.clinic_room,
             consultation_fee_egp = excluded.consultation_fee_egp, version = doctor_profiles.version + 1, updated_at = excluded.updated_at`,
        )
        .run(
          parsed.doctorId,
          next.professionalRegistrationNumber ?? null,
          next.licenseExpiry ?? null,
          next.licenseVerificationStatus,
          JSON.stringify(next.specialtyIds),
          JSON.stringify(next.departmentIds),
          next.qualifications ?? null,
          next.biography ?? null,
          JSON.stringify(next.languages),
          next.phone ?? null,
          next.email ?? null,
          next.clinicRoom ?? null,
          next.consultationFeeEgp ?? null,
          timestamp,
          timestamp,
        );
      if (context.role === "admin") {
        this.database.raw
          .prepare(
            "UPDATE users SET display_name_en = ?, display_name_ar = ?, is_clinical_approver = ?, is_active = ?, updated_at = ? WHERE id = ?",
          )
          .run(
            next.displayNameEn,
            next.displayNameAr ?? null,
            next.isClinicalApprover ? 1 : 0,
            next.isActive ? 1 : 0,
            timestamp,
            parsed.doctorId,
          );
      } else {
        this.database.raw
          .prepare(
            "UPDATE users SET display_name_en = ?, display_name_ar = ?, updated_at = ? WHERE id = ?",
          )
          .run(
            next.displayNameEn,
            next.displayNameAr ?? null,
            timestamp,
            parsed.doctorId,
          );
      }
    })();
    this.audit(context, "doctor.profile.updated", parsed.doctorId, {
      versioned: true,
    });
    return this.getProfile(context, parsed.doctorId);
  }

  public listDocuments(
    context: SessionContext,
    doctorId: string,
    includeArchived = false,
  ): readonly DoctorDocument[] {
    requireCapability(context, "doctor.document.read");
    this.assertDoctorVisible(context, doctorId);
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM doctor_documents WHERE doctor_id = ? AND (? = 1 OR status = 'active') ORDER BY uploaded_at DESC, version DESC`,
      )
      .all(
        doctorId,
        includeArchived && context.role === "admin" ? 1 : 0,
      ) as Row[];
    return rows
      .filter((row) => this.canViewDocument(context, row))
      .map((row) => this.mapDocument(row));
  }

  public async uploadDocument(
    context: SessionContext,
    input: DoctorDocumentUploadInput,
  ): Promise<DoctorDocument> {
    requireCapability(context, "doctor.document.write");
    const parsed = doctorDocumentUploadInputSchema.parse(input);
    if (context.role === "doctor" && context.userId !== parsed.doctorId) {
      throw new Error(
        "ELITE_DOCTOR_DOCUMENT_OWNER_REQUIRED: doctors may upload only to their own profile",
      );
    }
    const doctor = this.database.raw
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(parsed.doctorId) as Row | undefined;
    if (!isDoctorRow(doctor) && context.role !== "admin")
      throw new Error(
        "ELITE_DOCTOR_PROFILE_NOT_FOUND: doctor account is unavailable",
      );
    if (!doctor)
      throw new Error(
        "ELITE_DOCTOR_PROFILE_NOT_FOUND: doctor account is unavailable",
      );
    const content = Buffer.from(parsed.contentBase64, "base64");
    if (content.length === 0 || content.length > MAX_DOCUMENT_BYTES)
      throw new Error(
        "ELITE_DOCTOR_DOCUMENT_SIZE_INVALID: document exceeds 20 MB",
      );
    if (!ALLOWED_MIME_TYPES.has(parsed.mimeType))
      throw new Error(
        "ELITE_DOCTOR_DOCUMENT_MIME_INVALID: file type is not allowed",
      );
    const documentId = `doctor-doc-${nanoid(18)}`;
    const familyId = parsed.replacesDocumentId
      ? String(
          (
            this.database.raw
              .prepare(
                "SELECT family_id FROM doctor_documents WHERE document_id = ? AND doctor_id = ?",
              )
              .get(parsed.replacesDocumentId, parsed.doctorId) as
              Row | undefined
          )?.["family_id"] ?? "",
        )
      : `doctor-doc-family-${nanoid(18)}`;
    if (!familyId)
      throw new Error(
        "ELITE_DOCTOR_DOCUMENT_REPLACEMENT_NOT_FOUND: replacement target is unavailable",
      );
    const latest = this.database.raw
      .prepare(
        "SELECT MAX(version) AS version FROM doctor_documents WHERE family_id = ?",
      )
      .get(familyId) as { version?: number } | undefined;
    const version = Number(latest?.version ?? 0) + 1;
    const vaultRelpath = `doctor-documents/${documentId}.bin`;
    const encrypted = encodeEncryptedDocument(
      documentId,
      content,
      this.vaultKey,
    );
    await this.vault.write(vaultRelpath, encrypted.ciphertext);
    const timestamp = this.clock();
    try {
      this.database.raw.transaction(() => {
        if (parsed.replacesDocumentId) {
          this.database.raw
            .prepare(
              "UPDATE doctor_documents SET status = 'archived', archived_at = ?, archived_by_user_id = ?, updated_at = ? WHERE document_id = ? AND status = 'active'",
            )
            .run(
              timestamp,
              context.userId,
              timestamp,
              parsed.replacesDocumentId,
            );
        }
        this.database.raw
          .prepare(
            `INSERT INTO doctor_documents
           (document_id, family_id, doctor_id, document_type, display_name, file_name, mime_type, size_bytes,
            content_sha256, version, status, sensitive, vault_relpath, encryption_version, nonce_base64, auth_tag_base64,
            uploaded_by_user_id, uploaded_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            documentId,
            familyId,
            parsed.doctorId,
            parsed.documentType,
            parsed.displayName,
            parsed.fileName,
            parsed.mimeType,
            content.length,
            sha256(content),
            version,
            sensitiveDocumentType(parsed.documentType) ? 1 : 0,
            vaultRelpath,
            ENCRYPTION_VERSION,
            encrypted.nonceBase64,
            encrypted.authTagBase64,
            context.userId,
            timestamp,
            timestamp,
            timestamp,
          );
      })();
    } catch (error) {
      await this.vault.remove(vaultRelpath);
      throw error;
    }
    this.audit(context, "doctor.document.uploaded", documentId, {
      doctorId: parsed.doctorId,
      documentType: parsed.documentType,
      sizeBytes: content.length,
      version,
    });
    return this.getDocumentMetadata(context, documentId);
  }

  public async viewDocument(
    context: SessionContext,
    input: { documentId: string },
  ): Promise<DoctorDocumentContent> {
    requireCapability(context, "doctor.document.read");
    const parsed = doctorDocumentViewRequestSchema.parse(input);
    const row = this.database.raw
      .prepare("SELECT * FROM doctor_documents WHERE document_id = ?")
      .get(parsed.documentId) as Row | undefined;
    if (
      !row ||
      row["status"] !== "active" ||
      !this.canViewDocument(context, row)
    )
      throw new Error(
        "ELITE_DOCTOR_DOCUMENT_FORBIDDEN: document is unavailable",
      );
    const plaintext = decodeEncryptedDocument(
      String(row["document_id"]),
      await this.vault.read(String(row["vault_relpath"])),
      String(row["nonce_base64"]),
      String(row["auth_tag_base64"]),
      this.vaultKey,
    );
    if (
      plaintext.length !== Number(row["size_bytes"]) ||
      sha256(plaintext) !== String(row["content_sha256"])
    )
      throw new Error(
        "ELITE_DOCTOR_DOCUMENT_INTEGRITY_FAILURE: stored document hash does not match",
      );
    this.audit(context, "doctor.document.viewed", String(row["document_id"]), {
      doctorId: row["doctor_id"],
      streamed: true,
    });
    return doctorDocumentContentSchema.parse({
      ...this.mapDocument(row),
      contentBase64: plaintext.toString("base64"),
    });
  }

  public archiveDocument(
    context: SessionContext,
    documentId: string,
  ): DoctorDocument {
    requireCapability(context, "doctor.document.archive");
    const row = this.database.raw
      .prepare("SELECT * FROM doctor_documents WHERE document_id = ?")
      .get(documentId) as Row | undefined;
    if (
      !row ||
      row["status"] !== "active" ||
      (context.role === "doctor" && row["doctor_id"] !== context.userId)
    )
      throw new Error(
        "ELITE_DOCTOR_DOCUMENT_FORBIDDEN: document cannot be archived",
      );
    const timestamp = this.clock();
    this.database.raw
      .prepare(
        "UPDATE doctor_documents SET status = 'archived', archived_at = ?, archived_by_user_id = ?, updated_at = ? WHERE document_id = ? AND status = 'active'",
      )
      .run(timestamp, context.userId, timestamp, documentId);
    this.audit(context, "doctor.document.archived", documentId, {
      doctorId: row["doctor_id"],
    });
    return this.getDocumentMetadata(context, documentId);
  }

  private getDocumentMetadata(
    context: SessionContext,
    documentId: string,
  ): DoctorDocument {
    const row = this.database.raw
      .prepare("SELECT * FROM doctor_documents WHERE document_id = ?")
      .get(documentId) as Row | undefined;
    if (!row || !this.canViewDocument(context, row))
      throw new Error(
        "ELITE_DOCTOR_DOCUMENT_FORBIDDEN: document is unavailable",
      );
    return this.mapDocument(row);
  }

  private assertDoctorVisible(context: SessionContext, doctorId: string): void {
    const row = this.database.raw
      .prepare("SELECT id, role, is_active FROM users WHERE id = ?")
      .get(doctorId) as Row | undefined;
    if (
      !row ||
      row["role"] !== "doctor" ||
      (context.role !== "admin" && Number(row["is_active"]) !== 1)
    )
      throw new Error(
        "ELITE_DOCTOR_PROFILE_NOT_FOUND: doctor profile is unavailable",
      );
  }

  private canViewDocument(context: SessionContext, row: Row): boolean {
    if (context.role === "admin" || row["doctor_id"] === context.userId)
      return true;
    if (
      Number(row["sensitive"]) === 1 &&
      !context.capabilities.includes("doctor.document.sensitive-read")
    )
      return false;
    return true;
  }

  private mapProfile(row: Row): DoctorProfile {
    return doctorProfileSchema.parse({
      doctorId: String(row["doctorId"]),
      displayNameEn: String(row["displayNameEn"]),
      ...(row["displayNameAr"]
        ? { displayNameAr: String(row["displayNameAr"]) }
        : {}),
      ...(row["professionalRegistrationNumber"]
        ? {
            professionalRegistrationNumber: String(
              row["professionalRegistrationNumber"],
            ),
          }
        : {}),
      ...(row["licenseExpiry"]
        ? { licenseExpiry: String(row["licenseExpiry"]) }
        : {}),
      licenseVerificationStatus: String(
        row["licenseVerificationStatus"] ?? "unverified",
      ),
      specialtyIds: jsonArray(
        row["specialtyIdsJson"]
          ? JSON.parse(String(row["specialtyIdsJson"]))
          : [],
      ),
      departmentIds: jsonArray(
        row["departmentIdsJson"]
          ? JSON.parse(String(row["departmentIdsJson"]))
          : [],
      ),
      ...(row["qualifications"]
        ? { qualifications: String(row["qualifications"]) }
        : {}),
      ...(row["biography"] ? { biography: String(row["biography"]) } : {}),
      languages: jsonArray(
        row["languagesJson"] ? JSON.parse(String(row["languagesJson"])) : [],
      ),
      ...(row["phone"] ? { phone: String(row["phone"]) } : {}),
      ...(row["email"] ? { email: String(row["email"]) } : {}),
      ...(row["clinicRoom"] ? { clinicRoom: String(row["clinicRoom"]) } : {}),
      ...(row["consultationFeeEgp"] !== null &&
      row["consultationFeeEgp"] !== undefined
        ? { consultationFeeEgp: Number(row["consultationFeeEgp"]) }
        : {}),
      isClinicalApprover: Number(row["isClinicalApprover"]) === 1,
      isActive: Number(row["isActive"]) === 1,
      updatedAt: String(row["updatedAt"] ?? new Date(0).toISOString()),
    });
  }

  private mapDocument(row: Row): DoctorDocument {
    return doctorDocumentSchema.parse({
      documentId: String(row["document_id"]),
      familyId: String(row["family_id"]),
      doctorId: String(row["doctor_id"]),
      documentType: String(row["document_type"]),
      displayName: String(row["display_name"]),
      fileName: String(row["file_name"]),
      mimeType: String(row["mime_type"]),
      sizeBytes: Number(row["size_bytes"]),
      contentSha256: String(row["content_sha256"]),
      version: Number(row["version"]),
      status: String(row["status"]),
      sensitive: Number(row["sensitive"]) === 1,
      uploadedByUserId: String(row["uploaded_by_user_id"]),
      uploadedAt: String(row["uploaded_at"]),
      ...(row["archived_at"] ? { archivedAt: String(row["archived_at"]) } : {}),
      ...(row["archived_by_user_id"]
        ? { archivedByUserId: String(row["archived_by_user_id"]) }
        : {}),
    });
  }

  private audit(
    context: SessionContext,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): void {
    this.database.raw
      .prepare(
        `INSERT INTO audit_events (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?)`,
      )
      .run(
        nanoid(18),
        context.userId,
        context.deviceId,
        action,
        action.startsWith("doctor.document")
          ? "doctor-document"
          : "doctor-profile",
        entityId,
        JSON.stringify(metadata),
        this.clock(),
      );
  }
}

export function createDerivedDoctorVaultKey(databaseKey: Buffer): Buffer {
  return deriveDocumentKey(databaseKey);
}
