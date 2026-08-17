import { createHash, verify } from "node:crypto";
import { nanoid } from "nanoid";
import {
  exportConsentEvidenceCreateInputSchema,
  exportConsentEvidenceSchema,
  exportDisclosureDecisionSchema,
  exportDisclosureRequestSchema,
  exportDisclosureSchema,
  exportDeliveryMethodSchema,
  exportPackageLifecycleStatusSchema,
  exportPurposeOfUseSchema,
  exportReceiptSchema,
  exportRecipientCreateInputSchema,
  exportRecipientSchema,
  type ExportConsentEvidence,
  type ExportReceipt,
  type ExportConsentEvidenceCreateInput,
  type ExportDisclosure,
  type ExportDisclosureDecision,
  type ExportDisclosureRequest,
  type ExportRecipient,
  type ExportRecipientCreateInput,
  type ExportSigningKeyMetadata,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import { requireCapability, type SessionContext } from "./index.js";
import type { ExportSignaturePort } from "./patient-export-service.js";

const PURPOSES_REQUIRING_EVIDENCE = new Set([
  "referral",
  "patient-access",
  "legal-request",
  "administrative",
  "emergency",
]);

const EXTERNAL_RECIPIENT_CATEGORIES = new Set([
  "patient",
  "guardian",
  "treating-provider",
  "referral-provider",
  "legal-authority",
  "administrative-authority",
  "other",
]);

function now(): string {
  return new Date().toISOString();
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function opaqueId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length < 8) {
    throw new Error(`ELITE_EXPORT_GOVERNANCE_INVALID: ${field} is invalid`);
  }
  return value;
}

export function exportReceiptSigningData(receipt: ExportReceipt): Buffer {
  return Buffer.from(
    stableJson({
      schemaVersion: 1,
      receiptId: receipt.id,
      disclosureId: receipt.disclosureId,
      packageId: receipt.packageId,
      recipientId: receipt.recipientId,
      purposeOfUse: receipt.purposeOfUse,
      packageHash: receipt.packageHash,
      manifestHash: receipt.manifestHash,
      signerKeyId: receipt.signerKeyId,
      signerKeyVersion: receipt.signerKeyVersion,
      statusAtIssuance: receipt.statusAtIssuance,
      issuedAt: receipt.issuedAt,
      issuedByUserId: receipt.issuedByUserId,
    }),
    "utf8",
  );
}

export function verifyExportReceipt(
  receipt: ExportReceipt,
  publicKeyPem: string,
): boolean {
  try {
    const parsed = exportReceiptSchema.parse(receipt);
    const canonical = exportReceiptSigningData(parsed);
    const receiptHash = sha256(canonical.toString("utf8"));
    return (
      receiptHash === parsed.receiptHash &&
      verify(
        null,
        canonical,
        publicKeyPem,
        Buffer.from(parsed.signatureBase64, "base64"),
      )
    );
  } catch {
    return false;
  }
}

export class ExportGovernanceService {
  public constructor(
    private readonly database: EliteDatabase,
    private readonly signaturePort: ExportSignaturePort,
    private readonly clock: () => string = now,
  ) {}

  public createRecipient(
    context: SessionContext,
    input: ExportRecipientCreateInput,
  ): ExportRecipient {
    requireCapability(context, "export.governance.request");
    const parsed = exportRecipientCreateInputSchema.parse(input);
    const id = nanoid(18);
    const createdAt = this.clock();
    const auditEventId = nanoid(18);
    const record = exportRecipientSchema.parse({
      ...parsed,
      id,
      verificationStatus: "unverified",
      createdAt,
      createdByUserId: context.userId,
    });
    const transaction = this.database.raw.transaction(() => {
      this.insertAudit({
        id: auditEventId,
        context,
        action: "export.recipient.created",
        entityType: "export-recipient",
        entityId: id,
        metadata: { category: record.category },
        occurredAt: createdAt,
      });
      this.database.raw
        .prepare(
          `INSERT INTO export_recipients
           (id, display_name, organization_name, category, contact_channel, verification_status, created_at, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          record.displayName,
          record.organizationName ?? null,
          record.category,
          record.contactChannel ?? null,
          record.verificationStatus,
          record.createdAt,
          record.createdByUserId,
        );
      this.insertGovernanceEvent({
        id: nanoid(18),
        eventType: "recipient-created",
        reason: "Recipient created for export governance.",
        occurredAt: createdAt,
        context,
        auditEventId,
        recipientId: id,
      });
    });
    transaction();
    return record;
  }

  public listRecipients(context: SessionContext): readonly ExportRecipient[] {
    requireCapability(context, "export.governance.request");
    return this.database.raw
      .prepare(
        `SELECT id, display_name, organization_name, category, contact_channel,
                verification_status, created_at, created_by_user_id
         FROM export_recipients ORDER BY display_name COLLATE NOCASE, id`,
      )
      .all()
      .map((row) => this.parseRecipient(row as Record<string, unknown>));
  }

  public verifyRecipient(
    context: SessionContext,
    recipientId: string,
    status: "verified" | "rejected",
    reason: string,
  ): ExportRecipient {
    requireCapability(context, "export.governance.review");
    this.requireClinicalOrAdminReviewer(context);
    const normalizedId = opaqueId(recipientId, "recipientId");
    const normalizedReason = this.requireReason(reason);
    const existing = this.findRecipient(normalizedId);
    if (!existing) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_RECIPIENT_NOT_FOUND: recipient was not found",
      );
    }
    const updated = { ...existing, verificationStatus: status };
    const timestamp = this.clock();
    const auditEventId = nanoid(18);
    const transaction = this.database.raw.transaction(() => {
      this.insertAudit({
        id: auditEventId,
        context,
        action: "export.recipient.verified",
        entityType: "export-recipient",
        entityId: normalizedId,
        metadata: { status, reason: normalizedReason },
        occurredAt: timestamp,
      });
      this.database.raw
        .prepare(
          "UPDATE export_recipients SET verification_status = ? WHERE id = ?",
        )
        .run(status, normalizedId);
      this.insertGovernanceEvent({
        id: nanoid(18),
        eventType: "recipient-verified",
        reason: `Recipient verification changed: ${normalizedReason}`,
        occurredAt: timestamp,
        context,
        auditEventId,
        recipientId: normalizedId,
      });
    });
    transaction();
    return exportRecipientSchema.parse(updated);
  }

  public recordConsentEvidence(
    context: SessionContext,
    input: ExportConsentEvidenceCreateInput,
  ): ExportConsentEvidence {
    requireCapability(context, "export.governance.request");
    const parsed = exportConsentEvidenceCreateInputSchema.parse(input);
    const patient = this.findPatient(parsed.patientId);
    if (!patient) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_PATIENT_NOT_FOUND: patient was not found",
      );
    }
    if (parsed.evidenceType === "guardian-consent") {
      this.requireVerifiedGuardian(patient.id, parsed.relatedPersonId);
    }
    const id = nanoid(18);
    const recordedAt = this.clock();
    const auditEventId = nanoid(18);
    const record = exportConsentEvidenceSchema.parse({
      ...parsed,
      id,
      status: "pending",
      recordedByUserId: context.userId,
      recordedAt,
    });
    const transaction = this.database.raw.transaction(() => {
      this.insertAudit({
        id: auditEventId,
        context,
        action: "export.consent-evidence.recorded",
        entityType: "export-consent-evidence",
        entityId: id,
        metadata: {
          patientId: record.patientId,
          evidenceType: record.evidenceType,
        },
        occurredAt: recordedAt,
      });
      this.database.raw
        .prepare(
          `INSERT INTO export_consent_evidence
           (id, patient_id, evidence_type, status, source_reference, source_hash,
            related_person_id, effective_from, effective_until, recorded_by_user_id,
            recorded_at, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          patient.id,
          record.evidenceType,
          record.status,
          record.sourceReference,
          record.sourceHash ?? null,
          record.relatedPersonId ?? null,
          record.effectiveFrom ?? null,
          record.effectiveUntil ?? null,
          record.recordedByUserId,
          record.recordedAt,
          record.notes ?? null,
        );
      this.insertGovernanceEvent({
        id: nanoid(18),
        eventType: "evidence-recorded",
        reason: "Consent or disclosure evidence recorded.",
        occurredAt: recordedAt,
        context,
        auditEventId,
        evidenceId: id,
      });
    });
    transaction();
    return record;
  }

  public listConsentEvidence(
    context: SessionContext,
    patientId?: string,
  ): readonly ExportConsentEvidence[] {
    requireCapability(context, "export.governance.request");
    const normalizedPatientId = patientId?.trim();
    const parameters: unknown[] = [];
    const where = normalizedPatientId ? "WHERE patients.patient_id = ?" : "";
    if (normalizedPatientId) parameters.push(normalizedPatientId);
    return this.database.raw
      .prepare(
        `SELECT export_consent_evidence.*, patients.patient_id AS patient_display_id
         FROM export_consent_evidence
         INNER JOIN patients ON patients.id = export_consent_evidence.patient_id
         ${where}
         ORDER BY export_consent_evidence.recorded_at DESC, export_consent_evidence.id DESC`,
      )
      .all(...parameters)
      .map((row) => this.parseConsentEvidence(row as Record<string, unknown>));
  }

  public reviewConsentEvidence(
    context: SessionContext,
    evidenceId: string,
    decision: "approve" | "reject",
    reason: string,
  ): ExportConsentEvidence {
    requireCapability(context, "export.governance.review");
    this.requireClinicalOrAdminReviewer(context);
    const normalizedId = opaqueId(evidenceId, "evidenceId");
    const normalizedReason = this.requireReason(reason);
    const existing = this.findConsentEvidence(normalizedId);
    if (!existing) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_EVIDENCE_NOT_FOUND: evidence was not found",
      );
    }
    if (existing.status !== "pending") {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_EVIDENCE_FINAL: evidence has already been decided",
      );
    }
    if (
      decision === "approve" &&
      existing.evidenceType === "guardian-consent"
    ) {
      const patient = this.findPatient(existing.patientId);
      if (!patient)
        throw new Error("ELITE_EXPORT_GOVERNANCE_PATIENT_NOT_FOUND");
      this.requireVerifiedGuardian(patient.id, existing.relatedPersonId);
    }
    const status = decision === "approve" ? "approved" : "rejected";
    const reviewedAt = this.clock();
    const auditEventId = nanoid(18);
    const transaction = this.database.raw.transaction(() => {
      this.insertAudit({
        id: auditEventId,
        context,
        action: "export.consent-evidence.reviewed",
        entityType: "export-consent-evidence",
        entityId: normalizedId,
        metadata: { status, reason: normalizedReason },
        occurredAt: reviewedAt,
      });
      this.database.raw
        .prepare(
          "UPDATE export_consent_evidence SET status = ?, reviewed_by_user_id = ?, reviewed_at = ?, notes = ? WHERE id = ?",
        )
        .run(
          status,
          context.userId,
          reviewedAt,
          normalizedReason,
          normalizedId,
        );
      this.insertGovernanceEvent({
        id: nanoid(18),
        eventType: "evidence-reviewed",
        reason: normalizedReason,
        occurredAt: reviewedAt,
        context,
        auditEventId,
        evidenceId: normalizedId,
      });
    });
    transaction();
    return this.findConsentEvidence(normalizedId)!;
  }

  public requestDisclosure(
    context: SessionContext,
    input: ExportDisclosureRequest,
  ): ExportDisclosure {
    requireCapability(context, "export.governance.request");
    const parsed = exportDisclosureRequestSchema.parse(input);
    const packageRecord = this.findPackage(parsed.packageId);
    if (!packageRecord) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_PACKAGE_NOT_FOUND: export package was not found",
      );
    }
    if (["revoked", "destroyed", "expired"].includes(packageRecord.status)) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_PACKAGE_UNAVAILABLE: export package cannot be disclosed in its current status",
      );
    }
    const recipient = this.findRecipient(parsed.recipientId);
    if (!recipient || recipient.verificationStatus !== "verified") {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_RECIPIENT_UNVERIFIED: recipient must be verified before disclosure",
      );
    }
    if (parsed.consentEvidenceId) {
      const evidence = this.findConsentEvidence(parsed.consentEvidenceId);
      if (!evidence || evidence.patientId !== packageRecord.patientIdDisplay) {
        throw new Error(
          "ELITE_EXPORT_GOVERNANCE_EVIDENCE_MISMATCH: evidence does not match the export patient",
        );
      }
    }
    const id = nanoid(18);
    const requestedAt = this.clock();
    const auditEventId = nanoid(18);
    const disclosure = exportDisclosureSchema.parse({
      id,
      packageId: packageRecord.packageId,
      patientId: packageRecord.patientIdDisplay,
      recipientId: recipient.id,
      purposeOfUse: parsed.purposeOfUse,
      deliveryMethod: parsed.deliveryMethod,
      status: "requested",
      requestedByUserId: context.userId,
      requestedAt,
      consentEvidenceId: parsed.consentEvidenceId,
    });
    const transaction = this.database.raw.transaction(() => {
      this.insertAudit({
        id: auditEventId,
        context,
        action: "export.disclosure.requested",
        entityType: "export-disclosure",
        entityId: id,
        metadata: {
          packageId: disclosure.packageId,
          recipientId: disclosure.recipientId,
          purposeOfUse: disclosure.purposeOfUse,
        },
        occurredAt: requestedAt,
      });
      this.database.raw
        .prepare(
          `INSERT INTO export_disclosures
           (id, package_id, patient_id, recipient_id, purpose_of_use, delivery_method,
            status, requested_by_user_id, requested_at, consent_evidence_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          disclosure.id,
          disclosure.packageId,
          packageRecord.patientInternalId,
          disclosure.recipientId,
          disclosure.purposeOfUse,
          disclosure.deliveryMethod,
          disclosure.status,
          disclosure.requestedByUserId,
          disclosure.requestedAt,
          disclosure.consentEvidenceId ?? null,
          requestedAt,
        );
      this.insertGovernanceEvent({
        id: nanoid(18),
        eventType: "disclosure-requested",
        reason: parsed.reason,
        occurredAt: requestedAt,
        context,
        auditEventId,
        disclosureId: id,
      });
    });
    transaction();
    return disclosure;
  }

  public listDisclosures(context: SessionContext): readonly ExportDisclosure[] {
    requireCapability(context, "export.governance.request");
    return this.database.raw
      .prepare(
        `SELECT export_disclosures.*, patients.patient_id AS patient_display_id,
                export_receipts.id AS receipt_id
         FROM export_disclosures
         INNER JOIN patients ON patients.id = export_disclosures.patient_id
         LEFT JOIN export_receipts ON export_receipts.disclosure_id = export_disclosures.id
         ORDER BY export_disclosures.requested_at DESC, export_disclosures.id DESC`,
      )
      .all()
      .map((row) => this.parseDisclosure(row as Record<string, unknown>));
  }

  public decideDisclosure(
    context: SessionContext,
    input: ExportDisclosureDecision,
  ): ExportDisclosure {
    requireCapability(context, "export.governance.review");
    this.requireClinicalOrAdminReviewer(context);
    const parsed = exportDisclosureDecisionSchema.parse(input);
    const existing = this.findDisclosure(parsed.disclosureId);
    if (!existing) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_DISCLOSURE_NOT_FOUND: disclosure was not found",
      );
    }
    if (existing.status !== "requested") {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_DISCLOSURE_FINAL: disclosure is no longer awaiting review",
      );
    }
    if (parsed.decision === "approve") {
      this.validateDisclosureApproval(existing);
    }
    const status =
      parsed.decision === "approve"
        ? "approved"
        : parsed.decision === "reject"
          ? "rejected"
          : "cancelled";
    const decidedAt = this.clock();
    const auditEventId = nanoid(18);
    const eventType =
      status === "approved"
        ? "disclosure-approved"
        : status === "rejected"
          ? "disclosure-rejected"
          : "disclosure-cancelled";
    const transaction = this.database.raw.transaction(() => {
      this.insertAudit({
        id: auditEventId,
        context,
        action: `export.disclosure.${status}`,
        entityType: "export-disclosure",
        entityId: existing.id,
        metadata: { reason: parsed.reason },
        occurredAt: decidedAt,
      });
      this.database.raw
        .prepare(
          "UPDATE export_disclosures SET status = ?, approved_by_user_id = ?, approved_at = ?, decision_reason = ? WHERE id = ?",
        )
        .run(status, context.userId, decidedAt, parsed.reason, existing.id);
      this.insertGovernanceEvent({
        id: nanoid(18),
        eventType,
        reason: parsed.reason,
        occurredAt: decidedAt,
        context,
        auditEventId,
        disclosureId: existing.id,
      });
    });
    transaction();
    return this.findDisclosure(existing.id)!;
  }

  public sendDisclosure(
    context: SessionContext,
    disclosureId: string,
    reason: string,
  ): ExportDisclosure {
    requireCapability(context, "export.governance.send");
    const normalizedId = opaqueId(disclosureId, "disclosureId");
    const normalizedReason = this.requireReason(reason);
    const existing = this.findDisclosure(normalizedId);
    if (!existing) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_DISCLOSURE_NOT_FOUND: disclosure was not found",
      );
    }
    if (existing.status !== "approved") {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_DISCLOSURE_NOT_APPROVED: only approved disclosures can be sent",
      );
    }
    const packageRecord = this.findPackage(existing.packageId);
    if (
      !packageRecord ||
      ["revoked", "expired", "destroyed"].includes(packageRecord.status)
    ) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_PACKAGE_UNAVAILABLE: package cannot be sent",
      );
    }
    const sentAt = this.clock();
    const auditEventId = nanoid(18);
    const lifecycleAuditEventId = nanoid(18);
    const transaction = this.database.raw.transaction(() => {
      this.insertAudit({
        id: auditEventId,
        context,
        action: "export.disclosure.sent",
        entityType: "export-disclosure",
        entityId: existing.id,
        metadata: { deliveryMethod: existing.deliveryMethod },
        occurredAt: sentAt,
      });
      this.database.raw
        .prepare(
          "UPDATE export_disclosures SET status = 'sent', sent_at = ? WHERE id = ?",
        )
        .run(sentAt, existing.id);
      if (["issued", "stored"].includes(packageRecord.status)) {
        this.insertAudit({
          id: lifecycleAuditEventId,
          context,
          action: "export.lifecycle.changed",
          entityType: "export-package",
          entityId: packageRecord.packageId,
          metadata: {
            fromStatus: packageRecord.status,
            toStatus: "downloaded",
            reason: normalizedReason,
            disclosureId: existing.id,
          },
          occurredAt: sentAt,
        });
        this.database.raw
          .prepare(
            "UPDATE export_packages SET status = 'downloaded', status_changed_at = ?, status_changed_by_user_id = ? WHERE package_id = ?",
          )
          .run(sentAt, context.userId, packageRecord.packageId);
        this.database.raw
          .prepare(
            "INSERT INTO export_package_lifecycle_events (id, package_id, from_status, to_status, reason, changed_at, changed_by_user_id, audit_event_id) VALUES (?, ?, ?, 'downloaded', ?, ?, ?, ?)",
          )
          .run(
            nanoid(18),
            packageRecord.packageId,
            packageRecord.status,
            normalizedReason,
            sentAt,
            context.userId,
            lifecycleAuditEventId,
          );
      }
      this.insertGovernanceEvent({
        id: nanoid(18),
        eventType: "disclosure-sent",
        reason: normalizedReason,
        occurredAt: sentAt,
        context,
        auditEventId,
        disclosureId: existing.id,
      });
    });
    transaction();
    return this.findDisclosure(existing.id)!;
  }

  public issueReceipt(
    context: SessionContext,
    disclosureId: string,
  ): ExportReceipt {
    requireCapability(context, "export.receipt.manage");
    const normalizedId = opaqueId(disclosureId, "disclosureId");
    const disclosure = this.findDisclosure(normalizedId);
    if (!disclosure) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_DISCLOSURE_NOT_FOUND: disclosure was not found",
      );
    }
    if (!["sent", "acknowledged"].includes(disclosure.status)) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_RECEIPT_NOT_READY: disclosure must be sent before issuing a receipt",
      );
    }
    if (disclosure.receiptId) {
      const existing = this.findReceipt(disclosure.receiptId);
      if (existing) return existing;
    }
    const packageRecord = this.findPackage(disclosure.packageId);
    if (!packageRecord)
      throw new Error("ELITE_EXPORT_GOVERNANCE_PACKAGE_NOT_FOUND");
    const signerMetadata = this.getActiveSignerMetadata();
    const issuedAt = this.clock();
    const receiptId = nanoid(18);
    const descriptor = {
      id: receiptId,
      disclosureId: disclosure.id,
      packageId: disclosure.packageId,
      recipientId: disclosure.recipientId,
      purposeOfUse: disclosure.purposeOfUse,
      packageHash: packageRecord.packageHash,
      manifestHash: packageRecord.manifestHash,
      signerKeyId: signerMetadata.keyId,
      signerKeyVersion: signerMetadata.keyVersion,
      statusAtIssuance: packageRecord.status,
      issuedAt,
      issuedByUserId: context.userId,
      receiptHash: "0".repeat(64),
      signatureBase64: "placeholder-signature-0000",
    };
    const receiptTemplate = exportReceiptSchema.parse(descriptor);
    const canonicalReceipt = exportReceiptSigningData(receiptTemplate);
    const canonical = canonicalReceipt.toString("utf8");
    const receiptHash = sha256(canonical);
    const signed = this.signaturePort.sign(Buffer.from(canonical, "utf8"));
    if (
      signed.keyId !== signerMetadata.keyId ||
      signed.keyVersion !== signerMetadata.keyVersion
    ) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_SIGNER_METADATA_MISMATCH: receipt signer metadata changed during signing",
      );
    }
    const auditEventId = nanoid(18);
    const transaction = this.database.raw.transaction(() => {
      this.insertAudit({
        id: auditEventId,
        context,
        action: "export.receipt.issued",
        entityType: "export-receipt",
        entityId: receiptId,
        metadata: {
          disclosureId: disclosure.id,
          packageId: disclosure.packageId,
        },
        occurredAt: issuedAt,
      });
      this.database.raw
        .prepare(
          `INSERT INTO export_receipts
           (id, disclosure_id, package_id, recipient_id, purpose_of_use, package_hash,
            manifest_hash, signer_key_id, signer_key_version, status_at_issuance,
            issued_at, issued_by_user_id, receipt_hash, signature_base64, acknowledged_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          receiptId,
          disclosure.id,
          disclosure.packageId,
          disclosure.recipientId,
          disclosure.purposeOfUse,
          packageRecord.packageHash,
          packageRecord.manifestHash,
          signerMetadata.keyId,
          signerMetadata.keyVersion,
          packageRecord.status,
          issuedAt,
          context.userId,
          receiptHash,
          signed.signature.toString("base64"),
          disclosure.status === "acknowledged"
            ? (disclosure.acknowledgedAt ?? null)
            : null,
        );
      this.insertGovernanceEvent({
        id: nanoid(18),
        eventType: "receipt-issued",
        reason: "Signed export receipt issued.",
        occurredAt: issuedAt,
        context,
        auditEventId,
        disclosureId: disclosure.id,
        receiptId,
      });
    });
    transaction();
    return this.findReceipt(receiptId)!;
  }

  public acknowledgeReceipt(
    context: SessionContext,
    receiptId: string,
    reason: string,
  ): ExportReceipt {
    requireCapability(context, "export.receipt.manage");
    const normalizedId = opaqueId(receiptId, "receiptId");
    const normalizedReason = this.requireReason(reason);
    const existing = this.findReceipt(normalizedId);
    if (!existing) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_RECEIPT_NOT_FOUND: receipt was not found",
      );
    }
    if (existing.acknowledgedAt) return existing;
    const acknowledgedAt = this.clock();
    const auditEventId = nanoid(18);
    const transaction = this.database.raw.transaction(() => {
      this.insertAudit({
        id: auditEventId,
        context,
        action: "export.receipt.acknowledged",
        entityType: "export-receipt",
        entityId: normalizedId,
        metadata: { reason: normalizedReason },
        occurredAt: acknowledgedAt,
      });
      this.database.raw
        .prepare("UPDATE export_receipts SET acknowledged_at = ? WHERE id = ?")
        .run(acknowledgedAt, normalizedId);
      this.database.raw
        .prepare(
          "UPDATE export_disclosures SET status = 'acknowledged', acknowledged_at = ? WHERE id = ?",
        )
        .run(acknowledgedAt, existing.disclosureId);
      this.insertGovernanceEvent({
        id: nanoid(18),
        eventType: "receipt-acknowledged",
        reason: normalizedReason,
        occurredAt: acknowledgedAt,
        context,
        auditEventId,
        disclosureId: existing.disclosureId,
        receiptId: normalizedId,
      });
    });
    transaction();
    return this.findReceipt(normalizedId)!;
  }

  public listReceipts(context: SessionContext): readonly ExportReceipt[] {
    requireCapability(context, "export.receipt.manage");
    return this.database.raw
      .prepare("SELECT * FROM export_receipts ORDER BY issued_at DESC, id DESC")
      .all()
      .map((row) => this.parseReceipt(row as Record<string, unknown>));
  }

  private getActiveSignerMetadata(): ExportSigningKeyMetadata {
    if (!this.signaturePort.getActiveKeyMetadata) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_SIGNER_METADATA_UNAVAILABLE: active signer metadata is unavailable",
      );
    }
    return this.signaturePort.getActiveKeyMetadata();
  }

  private validateDisclosureApproval(disclosure: ExportDisclosure): void {
    const recipient = this.findRecipient(disclosure.recipientId);
    if (!recipient || recipient.verificationStatus !== "verified") {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_RECIPIENT_UNVERIFIED: recipient must be verified",
      );
    }
    const packageRecord = this.findPackage(disclosure.packageId);
    if (
      !packageRecord ||
      ["revoked", "expired", "destroyed"].includes(packageRecord.status)
    ) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_PACKAGE_UNAVAILABLE: package cannot be approved",
      );
    }
    const requiresEvidence =
      packageRecord.redactionPolicy === "full" ||
      EXTERNAL_RECIPIENT_CATEGORIES.has(recipient.category) ||
      PURPOSES_REQUIRING_EVIDENCE.has(disclosure.purposeOfUse);
    if (requiresEvidence) {
      if (!disclosure.consentEvidenceId) {
        throw new Error(
          "ELITE_EXPORT_GOVERNANCE_EVIDENCE_REQUIRED: approved consent or policy evidence is required",
        );
      }
      const evidence = this.findConsentEvidence(disclosure.consentEvidenceId);
      if (!evidence || evidence.status !== "approved") {
        throw new Error(
          "ELITE_EXPORT_GOVERNANCE_EVIDENCE_NOT_APPROVED: evidence must be approved before disclosure",
        );
      }
      if (evidence.patientId !== packageRecord.patientIdDisplay) {
        throw new Error(
          "ELITE_EXPORT_GOVERNANCE_EVIDENCE_MISMATCH: evidence does not match the export patient",
        );
      }
    }
  }

  private requireVerifiedGuardian(
    patientInternalId: string,
    relatedPersonId: string | undefined,
  ): void {
    if (!relatedPersonId) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_GUARDIAN_REQUIRED: guardian evidence requires a related person",
      );
    }
    const row = this.database.raw
      .prepare(
        `SELECT related_persons.id
         FROM related_persons
         INNER JOIN patient_related_persons
           ON patient_related_persons.related_person_id = related_persons.id
         WHERE patient_related_persons.patient_id = ?
           AND patient_related_persons.related_person_id = ?
           AND patient_related_persons.ended_at IS NULL
           AND related_persons.is_guardian = 1
           AND related_persons.is_authorized_to_consent = 1
           AND related_persons.verification_status = 'verified'`,
      )
      .get(patientInternalId, relatedPersonId) as { id: string } | undefined;
    if (!row) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_GUARDIAN_UNVERIFIED: guardian relationship and authorization must be verified",
      );
    }
  }

  private requireClinicalOrAdminReviewer(context: SessionContext): void {
    if (context.role === "admin") return;
    const row = this.database.raw
      .prepare(
        "SELECT is_clinical_approver FROM users WHERE id = ? AND is_active = 1",
      )
      .get(context.userId) as { is_clinical_approver: number } | undefined;
    if (!row || Number(row.is_clinical_approver) !== 1) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_APPROVER_REQUIRED: an administrator or clinical approver is required",
      );
    }
  }

  private requireReason(reason: string): string {
    const normalized = reason.trim();
    if (normalized.length < 3 || normalized.length > 1000) {
      throw new Error(
        "ELITE_EXPORT_GOVERNANCE_REASON_INVALID: reason must be 3-1000 characters",
      );
    }
    return normalized;
  }

  private findRecipient(id: string): ExportRecipient | undefined {
    const row = this.database.raw
      .prepare("SELECT * FROM export_recipients WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRecipient(row) : undefined;
  }

  private findPatient(
    patientId: string,
  ): { id: string; patientId: string } | undefined {
    const row = this.database.raw
      .prepare("SELECT id, patient_id FROM patients WHERE patient_id = ?")
      .get(patientId) as { id: string; patient_id: string } | undefined;
    return row ? { id: row.id, patientId: row.patient_id } : undefined;
  }

  private findConsentEvidence(id: string): ExportConsentEvidence | undefined {
    const row = this.database.raw
      .prepare(
        `SELECT export_consent_evidence.*, patients.patient_id AS patient_display_id
         FROM export_consent_evidence
         INNER JOIN patients ON patients.id = export_consent_evidence.patient_id
         WHERE export_consent_evidence.id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.parseConsentEvidence(row) : undefined;
  }

  private findPackage(id: string):
    | {
        packageId: string;
        patientInternalId: string;
        patientIdDisplay: string;
        packageHash: string;
        manifestHash: string;
        signerKeyId: string;
        signerKeyVersion: number;
        status: string;
        redactionPolicy: string;
      }
    | undefined {
    const row = this.database.raw
      .prepare(
        `SELECT export_packages.package_id, export_packages.patient_id,
                patients.patient_id AS patient_display_id, export_packages.package_hash,
                export_packages.manifest_hash, export_packages.signer_key_id,
                export_packages.signer_key_version, export_packages.status,
                export_packages.redaction_policy
         FROM export_packages
         INNER JOIN patients ON patients.id = export_packages.patient_id
         WHERE export_packages.package_id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      packageId: String(row["package_id"]),
      patientInternalId: String(row["patient_id"]),
      patientIdDisplay: String(row["patient_display_id"]),
      packageHash: String(row["package_hash"]),
      manifestHash: String(row["manifest_hash"]),
      signerKeyId: String(row["signer_key_id"]),
      signerKeyVersion: Number(row["signer_key_version"]),
      status: String(row["status"]),
      redactionPolicy: String(row["redaction_policy"]),
    };
  }

  private findDisclosure(id: string): ExportDisclosure | undefined {
    const row = this.database.raw
      .prepare(
        `SELECT export_disclosures.*, patients.patient_id AS patient_display_id,
                export_receipts.id AS receipt_id
         FROM export_disclosures
         INNER JOIN patients ON patients.id = export_disclosures.patient_id
         LEFT JOIN export_receipts ON export_receipts.disclosure_id = export_disclosures.id
         WHERE export_disclosures.id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.parseDisclosure(row) : undefined;
  }

  private findReceipt(id: string): ExportReceipt | undefined {
    const row = this.database.raw
      .prepare("SELECT * FROM export_receipts WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.parseReceipt(row) : undefined;
  }

  private parseRecipient(row: Record<string, unknown>): ExportRecipient {
    return exportRecipientSchema.parse({
      id: String(row["id"]),
      displayName: String(row["display_name"]),
      organizationName: row["organization_name"] ?? undefined,
      category: String(row["category"]),
      contactChannel: row["contact_channel"] ?? undefined,
      verificationStatus: String(row["verification_status"]),
      createdAt: String(row["created_at"]),
      createdByUserId: String(row["created_by_user_id"]),
    });
  }

  private parseConsentEvidence(
    row: Record<string, unknown>,
  ): ExportConsentEvidence {
    return exportConsentEvidenceSchema.parse({
      id: String(row["id"]),
      patientId: String(row["patient_display_id"]),
      evidenceType: String(row["evidence_type"]),
      status: String(row["status"]),
      sourceReference: String(row["source_reference"]),
      sourceHash: row["source_hash"] ?? undefined,
      relatedPersonId: row["related_person_id"] ?? undefined,
      effectiveFrom: row["effective_from"] ?? undefined,
      effectiveUntil: row["effective_until"] ?? undefined,
      recordedByUserId: String(row["recorded_by_user_id"]),
      recordedAt: String(row["recorded_at"]),
      reviewedByUserId: row["reviewed_by_user_id"] ?? undefined,
      reviewedAt: row["reviewed_at"] ?? undefined,
      notes: row["notes"] ?? undefined,
    });
  }

  private parseDisclosure(row: Record<string, unknown>): ExportDisclosure {
    return exportDisclosureSchema.parse({
      id: String(row["id"]),
      packageId: String(row["package_id"]),
      patientId: String(row["patient_display_id"]),
      recipientId: String(row["recipient_id"]),
      purposeOfUse: String(row["purpose_of_use"]),
      deliveryMethod: exportDeliveryMethodSchema.parse(row["delivery_method"]),
      status: String(row["status"]),
      requestedByUserId: String(row["requested_by_user_id"]),
      requestedAt: String(row["requested_at"]),
      approvedByUserId: row["approved_by_user_id"] ?? undefined,
      approvedAt: row["approved_at"] ?? undefined,
      decisionReason: row["decision_reason"] ?? undefined,
      sentAt: row["sent_at"] ?? undefined,
      acknowledgedAt: row["acknowledged_at"] ?? undefined,
      consentEvidenceId: row["consent_evidence_id"] ?? undefined,
      receiptId: row["receipt_id"] ?? undefined,
    });
  }

  private parseReceipt(row: Record<string, unknown>): ExportReceipt {
    return exportReceiptSchema.parse({
      id: String(row["id"]),
      disclosureId: String(row["disclosure_id"]),
      packageId: String(row["package_id"]),
      recipientId: String(row["recipient_id"]),
      purposeOfUse: exportPurposeOfUseSchema.parse(row["purpose_of_use"]),
      packageHash: String(row["package_hash"]),
      manifestHash: String(row["manifest_hash"]),
      signerKeyId: String(row["signer_key_id"]),
      signerKeyVersion: Number(row["signer_key_version"]),
      statusAtIssuance: exportPackageLifecycleStatusSchema.parse(
        row["status_at_issuance"],
      ),
      issuedAt: String(row["issued_at"]),
      issuedByUserId: String(row["issued_by_user_id"]),
      receiptHash: String(row["receipt_hash"]),
      signatureBase64: String(row["signature_base64"]),
      acknowledgedAt: row["acknowledged_at"] ?? undefined,
    });
  }

  private insertAudit(input: {
    id: string;
    context: SessionContext;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
    occurredAt: string;
  }): void {
    this.database.raw
      .prepare(
        `INSERT INTO audit_events
         (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?)`,
      )
      .run(
        input.id,
        input.context.userId,
        input.context.deviceId,
        input.action,
        input.entityType,
        input.entityId,
        JSON.stringify(input.metadata),
        input.occurredAt,
      );
  }

  private insertGovernanceEvent(input: {
    id: string;
    eventType: string;
    reason: string;
    occurredAt: string;
    context: SessionContext;
    auditEventId: string;
    recipientId?: string;
    evidenceId?: string;
    disclosureId?: string;
    receiptId?: string;
  }): void {
    this.database.raw
      .prepare(
        `INSERT INTO export_governance_events
         (id, disclosure_id, evidence_id, receipt_id, event_type, reason, occurred_at, occurred_by_user_id, audit_event_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.disclosureId ?? null,
        input.evidenceId ?? null,
        input.receiptId ?? null,
        input.eventType,
        input.reason,
        input.occurredAt,
        input.context.userId,
        input.auditEventId,
      );
  }
}
