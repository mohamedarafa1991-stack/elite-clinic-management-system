import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import {
  drugCatalogEntrySchema,
  drugCatalogImportInputSchema,
  drugCatalogSnapshotSchema,
  drugCatalogSnapshotTransitionInputSchema,
  type DrugCatalogEntry,
  type DrugCatalogImportInput,
  type DrugCatalogSnapshot,
  type DrugCatalogSnapshotTransitionInput,
  type DrugCatalogWarning,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import { requireCapability, type SessionContext } from "./index.js";

type Row = any;

type RawDrugRow = any;

function now(): string {
  return new Date().toISOString();
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized.slice(0, maxLength) : undefined;
}

function requiredString(
  value: unknown,
  fallback: string,
  maxLength: number,
): string {
  const normalized = optionalString(value, maxLength);
  return normalized ?? fallback;
}

function parsePrice(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function parseWarning(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function parseWarnings(row: RawDrugRow): DrugCatalogWarning {
  return {
    highBloodPressure: parseWarning(row.warning_high_blood_pressure),
    diabetes: parseWarning(row.warning_diabetes),
    pregnancy: parseWarning(row.warning_pregnancy),
    lactation: parseWarning(row.warning_lactation),
    kidney: parseWarning(row.warning_kidney),
    liver: parseWarning(row.warning_liver),
    heart: parseWarning(row.warning_heart),
  };
}

function parseJsonArray(content: string): RawDrugRow[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(content) as unknown;
  } catch {
    throw new Error(
      "ELITE_DRUG_CATALOG_JSON_INVALID: source is not valid JSON",
    );
  }
  if (!Array.isArray(decoded)) {
    throw new Error(
      "ELITE_DRUG_CATALOG_FORMAT_INVALID: source JSON must be an array",
    );
  }
  return decoded.filter(
    (value): value is RawDrugRow =>
      typeof value === "object" && value !== null && !Array.isArray(value),
  );
}

export function hashDrugCatalogContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function normalizeDrugCatalogRows(
  rows: readonly RawDrugRow[],
  snapshotId: string,
): readonly DrugCatalogEntry[] {
  const seenExternalIds = new Set<string>();
  return rows.map((row, index) => {
    const baseExternalId = requiredString(row.id, `row-${index + 1}`, 160);
    const duplicate = seenExternalIds.has(baseExternalId);
    const externalId = duplicate
      ? `${baseExternalId}#duplicate-${index + 1}`.slice(0, 160)
      : baseExternalId;
    seenExternalIds.add(baseExternalId);

    const errors: string[] = [];
    const nameEn = optionalString(row.name, 240);
    const activeIngredients = optionalString(row.active, 2000);
    const priceEgp = parsePrice(row.price);
    const oldPriceEgp = parsePrice(row.oldprice);
    if (!nameEn) errors.push("name is required");
    if (!activeIngredients) errors.push("active ingredient data is required");
    if (
      row.price !== null &&
      row.price !== undefined &&
      row.price !== "" &&
      priceEgp === undefined
    ) {
      errors.push("price is not a nonnegative number");
    }
    if (
      row.oldprice !== null &&
      row.oldprice !== undefined &&
      row.oldprice !== "" &&
      oldPriceEgp === undefined
    ) {
      errors.push("oldprice is not a nonnegative number");
    }
    if (duplicate) errors.push("duplicate external id in source snapshot");

    return drugCatalogEntrySchema.parse({
      id: nanoid(18),
      snapshotId,
      externalId,
      nameEn: nameEn ?? `[invalid source row ${index + 1}]`,
      nameAr: optionalString(row.arabic, 240),
      activeIngredients:
        activeIngredients ?? "[missing active ingredient data]",
      company: optionalString(row.company, 240),
      priceEgp,
      oldPriceEgp,
      availability: optionalString(row.availability, 80),
      barcode: optionalString(row.barcode, 80),
      slug: optionalString(row.slug, 240),
      units: optionalString(row.units, 240),
      description: optionalString(row.description, 1000),
      usesAr: optionalString(row.uses, 5000),
      matchedFdaIngredients: optionalString(row.matched_fda_ingredients, 2000),
      usesSummaryAr: optionalString(row.uses_summary, 2000),
      usesSummaryEn: optionalString(row.uses_summary_en, 2000),
      warnings: parseWarnings(row),
      warningsSummaryAr: optionalString(row.warnings_summary, 5000),
      warningsSummaryEn: optionalString(row.warnings_summary_en, 5000),
      validationStatus: errors.length === 0 ? "valid" : "invalid",
      validationErrors: errors,
    });
  });
}

function mapSnapshot(row: Row): DrugCatalogSnapshot {
  return drugCatalogSnapshotSchema.parse({
    id: String(row.id),
    sourceKind: row.source_kind,
    sourceUrl: row.source_url,
    sourceCommit: row.source_commit,
    sourceFile: row.source_file,
    sourceVersion: row.source_version,
    licenseAcknowledged: Number(row.license_acknowledged) === 1,
    contentSha256: row.content_sha256,
    status: row.status,
    totalRecords: Number(row.total_records),
    validRecords: Number(row.valid_records),
    invalidRecords: Number(row.invalid_records),
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    promotedAt: row.promoted_at ?? undefined,
    promotedByUserId: row.promoted_by_user_id ?? undefined,
    supersededAt: row.superseded_at ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    previousSnapshotId: row.previous_snapshot_id ?? undefined,
  });
}

function mapEntry(row: Row): DrugCatalogEntry {
  return drugCatalogEntrySchema.parse({
    id: row.id,
    snapshotId: row.snapshot_id,
    externalId: row.external_id,
    nameEn: row.name_en,
    nameAr: row.name_ar ?? undefined,
    activeIngredients: row.active_ingredients,
    company: row.company ?? undefined,
    priceEgp: row.price_egp ?? undefined,
    oldPriceEgp: row.old_price_egp ?? undefined,
    availability: row.availability ?? undefined,
    barcode: row.barcode ?? undefined,
    slug: row.slug ?? undefined,
    units: row.units ?? undefined,
    description: row.description ?? undefined,
    usesAr: row.uses_ar ?? undefined,
    matchedFdaIngredients: row.matched_fda_ingredients ?? undefined,
    usesSummaryAr: row.uses_summary_ar ?? undefined,
    usesSummaryEn: row.uses_summary_en ?? undefined,
    warnings: JSON.parse(String(row.warnings_json)) as DrugCatalogWarning,
    warningsSummaryAr: row.warnings_summary_ar ?? undefined,
    warningsSummaryEn: row.warnings_summary_en ?? undefined,
    validationStatus: row.validation_status,
    validationErrors: JSON.parse(
      String(row.validation_errors_json),
    ) as string[],
  });
}

export class DrugCatalogService {
  public constructor(private readonly database: EliteDatabase) {}

  public stageImport(
    context: SessionContext,
    input: DrugCatalogImportInput,
  ): DrugCatalogSnapshot {
    requireCapability(context, "module.manage");
    const parsed = drugCatalogImportInputSchema.parse(input);
    const contentSha256 = hashDrugCatalogContent(parsed.content);
    const existing = this.database.raw
      .prepare(
        "SELECT * FROM drug_catalog_snapshots WHERE source_commit = ? AND source_file = ? AND content_sha256 = ?",
      )
      .get(parsed.sourceCommit, parsed.sourceFile, contentSha256) as
      Row | undefined;
    if (existing) return mapSnapshot(existing);

    const snapshotId = nanoid(18);
    const entries = normalizeDrugCatalogRows(
      parseJsonArray(parsed.content),
      snapshotId,
    );
    const timestamp = now();
    const validRecords = entries.filter(
      (entry) => entry.validationStatus === "valid",
    ).length;
    const snapshot: DrugCatalogSnapshot = drugCatalogSnapshotSchema.parse({
      id: snapshotId,
      sourceKind: parsed.sourceKind,
      sourceUrl: parsed.sourceUrl,
      sourceCommit: parsed.sourceCommit,
      sourceFile: parsed.sourceFile,
      sourceVersion: parsed.sourceVersion,
      licenseAcknowledged: parsed.licenseAcknowledged,
      contentSha256,
      status: "staged",
      totalRecords: entries.length,
      validRecords,
      invalidRecords: entries.length - validRecords,
      createdAt: timestamp,
      createdByUserId: context.userId,
    });

    const transaction = this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          `INSERT INTO drug_catalog_snapshots
           (id, source_kind, source_url, source_commit, source_file, source_version,
            license_acknowledged, content_sha256, status, total_records, valid_records,
            invalid_records, created_at, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          snapshot.id,
          snapshot.sourceKind,
          snapshot.sourceUrl,
          snapshot.sourceCommit,
          snapshot.sourceFile,
          snapshot.sourceVersion,
          1,
          snapshot.contentSha256,
          snapshot.status,
          snapshot.totalRecords,
          snapshot.validRecords,
          snapshot.invalidRecords,
          snapshot.createdAt,
          snapshot.createdByUserId,
        );
      const insertEntry = this.database.raw.prepare(
        `INSERT INTO drug_catalog_entries
         (id, snapshot_id, external_id, name_en, name_ar, active_ingredients, company,
          price_egp, old_price_egp, availability, barcode, slug, units, description,
          uses_ar, matched_fda_ingredients, uses_summary_ar, uses_summary_en,
          warnings_json, warnings_summary_ar, warnings_summary_en,
          validation_status, validation_errors_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const entry of entries) {
        insertEntry.run(
          entry.id,
          entry.snapshotId,
          entry.externalId,
          entry.nameEn,
          entry.nameAr ?? null,
          entry.activeIngredients,
          entry.company ?? null,
          entry.priceEgp ?? null,
          entry.oldPriceEgp ?? null,
          entry.availability ?? null,
          entry.barcode ?? null,
          entry.slug ?? null,
          entry.units ?? null,
          entry.description ?? null,
          entry.usesAr ?? null,
          entry.matchedFdaIngredients ?? null,
          entry.usesSummaryAr ?? null,
          entry.usesSummaryEn ?? null,
          JSON.stringify(entry.warnings),
          entry.warningsSummaryAr ?? null,
          entry.warningsSummaryEn ?? null,
          entry.validationStatus,
          JSON.stringify(entry.validationErrors),
        );
      }
    });
    transaction();
    this.writeAudit(context, "drug-catalog.snapshot.staged", snapshot.id, {
      sourceCommit: snapshot.sourceCommit,
      sourceFile: snapshot.sourceFile,
      sourceVersion: snapshot.sourceVersion,
      contentSha256: snapshot.contentSha256,
      totalRecords: snapshot.totalRecords,
      validRecords: snapshot.validRecords,
      invalidRecords: snapshot.invalidRecords,
    });
    return snapshot;
  }

  public listSnapshots(
    context: SessionContext,
  ): readonly DrugCatalogSnapshot[] {
    requireCapability(context, "module.manage");
    return (
      this.database.raw
        .prepare(
          "SELECT * FROM drug_catalog_snapshots ORDER BY created_at DESC",
        )
        .all() as Row[]
    ).map(mapSnapshot);
  }

  public listEntries(
    context: SessionContext,
    snapshotId: string,
  ): readonly DrugCatalogEntry[] {
    requireCapability(context, "module.manage");
    return (
      this.database.raw
        .prepare(
          "SELECT * FROM drug_catalog_entries WHERE snapshot_id = ? ORDER BY validation_status, name_en LIMIT 2000",
        )
        .all(snapshotId) as Row[]
    ).map(mapEntry);
  }

  public promoteSnapshot(
    context: SessionContext,
    input: DrugCatalogSnapshotTransitionInput,
  ): DrugCatalogSnapshot {
    requireCapability(context, "module.manage");
    const parsed = drugCatalogSnapshotTransitionInputSchema.parse(input);
    const snapshot = this.getSnapshot(parsed.snapshotId);
    if (snapshot.status !== "staged") {
      throw new Error("ELITE_DRUG_CATALOG_NOT_STAGED: snapshot is not staged");
    }
    if (snapshot.validRecords === 0) {
      throw new Error(
        "ELITE_DRUG_CATALOG_NO_VALID_RECORDS: snapshot has no valid records",
      );
    }
    const previous = this.database.raw
      .prepare("SELECT * FROM drug_catalog_snapshots WHERE status = 'active'")
      .get() as Row | undefined;
    const timestamp = now();
    const transaction = this.database.raw.transaction(() => {
      if (previous) {
        this.database.raw
          .prepare(
            "UPDATE drug_catalog_snapshots SET status = 'superseded', superseded_at = ? WHERE id = ?",
          )
          .run(timestamp, previous.id);
      }
      this.database.raw
        .prepare(
          "UPDATE drug_catalog_snapshots SET status = 'active', promoted_at = ?, promoted_by_user_id = ?, previous_snapshot_id = ? WHERE id = ? AND status = 'staged'",
        )
        .run(timestamp, context.userId, previous?.id ?? null, snapshot.id);
    });
    transaction();
    this.writeAudit(context, "drug-catalog.snapshot.promoted", snapshot.id, {
      reason: parsed.reason,
      previousSnapshotId: previous?.id ?? null,
    });
    return this.getSnapshot(snapshot.id);
  }

  public rejectSnapshot(
    context: SessionContext,
    input: DrugCatalogSnapshotTransitionInput,
  ): DrugCatalogSnapshot {
    requireCapability(context, "module.manage");
    const parsed = drugCatalogSnapshotTransitionInputSchema.parse(input);
    const snapshot = this.getSnapshot(parsed.snapshotId);
    if (snapshot.status !== "staged") {
      throw new Error("ELITE_DRUG_CATALOG_NOT_STAGED: snapshot is not staged");
    }
    const timestamp = now();
    this.database.raw
      .prepare(
        "UPDATE drug_catalog_snapshots SET status = 'rejected', rejected_at = ?, rejection_reason = ? WHERE id = ? AND status = 'staged'",
      )
      .run(timestamp, parsed.reason, snapshot.id);
    this.writeAudit(context, "drug-catalog.snapshot.rejected", snapshot.id, {
      reason: parsed.reason,
    });
    return this.getSnapshot(snapshot.id);
  }

  public rollbackSnapshot(
    context: SessionContext,
    input: DrugCatalogSnapshotTransitionInput,
  ): DrugCatalogSnapshot {
    requireCapability(context, "module.manage");
    const parsed = drugCatalogSnapshotTransitionInputSchema.parse(input);
    const active = this.database.raw
      .prepare("SELECT * FROM drug_catalog_snapshots WHERE status = 'active'")
      .get() as Row | undefined;
    const target = this.getSnapshot(parsed.snapshotId);
    if (!active || active.previous_snapshot_id !== target.id) {
      throw new Error(
        "ELITE_DRUG_CATALOG_ROLLBACK_UNAVAILABLE: target is not the previous active snapshot",
      );
    }
    const timestamp = now();
    const transaction = this.database.raw.transaction(() => {
      this.database.raw
        .prepare(
          "UPDATE drug_catalog_snapshots SET status = 'superseded', superseded_at = ? WHERE id = ? AND status = 'active'",
        )
        .run(timestamp, active.id);
      this.database.raw
        .prepare(
          "UPDATE drug_catalog_snapshots SET status = 'active', promoted_at = ?, promoted_by_user_id = ? WHERE id = ? AND status = 'superseded'",
        )
        .run(timestamp, context.userId, target.id);
    });
    transaction();
    this.writeAudit(context, "drug-catalog.snapshot.rolled-back", target.id, {
      reason: parsed.reason,
      supersededSnapshotId: active.id,
    });
    return this.getSnapshot(target.id);
  }

  public getActiveEntries(
    context: SessionContext,
  ): readonly DrugCatalogEntry[] {
    requireCapability(context, "module.manage");
    const active = this.database.raw
      .prepare("SELECT id FROM drug_catalog_snapshots WHERE status = 'active'")
      .get() as Row | undefined;
    if (!active) return [];
    return this.listEntries(context, String(active.id));
  }

  private getSnapshot(snapshotId: string): DrugCatalogSnapshot {
    const row = this.database.raw
      .prepare("SELECT * FROM drug_catalog_snapshots WHERE id = ?")
      .get(snapshotId) as Row | undefined;
    if (!row) {
      throw new Error(
        "ELITE_DRUG_CATALOG_SNAPSHOT_NOT_FOUND: snapshot does not exist",
      );
    }
    return mapSnapshot(row);
  }

  private writeAudit(
    context: SessionContext,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
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
        "drug-catalog",
        entityId,
        JSON.stringify(metadata),
        now(),
      );
  }
}
