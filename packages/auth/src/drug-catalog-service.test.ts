import { describe, expect, it } from "vitest";
import { openDatabase } from "@elite/database";
import type { Capability } from "@elite/contracts";
import { DrugCatalogService, type SessionContext } from "./index.js";

const sourceUrl = "https://github.com/mahmoudfalous/eg-drugs";

function seedAdmin(database: ReturnType<typeof openDatabase>): void {
  database.raw
    .prepare(
      `INSERT INTO users
       (id, username, display_name_en, role, capabilities_json, is_clinical_approver, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', ?, 1, 1, ?, ?)`,
    )
    .run(
      "admin-user-1",
      "admin",
      "Synthetic Admin",
      JSON.stringify(["module.manage"]),
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
  database.raw
    .prepare(
      `INSERT INTO devices
       (id, friendly_name, platform, app_version, owner_user_id, status, approved_by_user_id, approved_at, created_at, updated_at)
       VALUES (?, ?, 'windows', ?, ?, 'active', ?, ?, ?, ?)`,
    )
    .run(
      "device-1",
      "Synthetic Hub",
      "0.1.0-test",
      "admin-user-1",
      "admin-user-1",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
}

function context(
  capabilities: readonly Capability[] = ["module.manage"],
): SessionContext {
  return {
    sessionId: "session-1",
    token: "synthetic-token",
    userId: "admin-user-1",
    username: "admin",
    role: "admin",
    deviceId: "device-1",
    capabilities,
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

function sourceContent(name = "Paracetamol", commitDuplicate = false): string {
  return JSON.stringify([
    {
      id: "drug-1",
      name,
      arabic: "باراسيتامول",
      active: "Paracetamol 500 mg",
      company: "Synthetic Pharma",
      price: "25.50",
      oldprice: "30",
      availability: "available",
      barcode: "622000000001",
      slug: "paracetamol-500",
      units: "20 tablets",
      description: "Analgesic",
      uses: "للاستخدام التجريبي فقط",
      matched_fda_ingredients: "Paracetamol",
      uses_summary: "ملخص تجريبي",
      uses_summary_en: "Synthetic summary",
      warning_high_blood_pressure: 0,
      warning_diabetes: 1,
      warning_pregnancy: "0",
      warning_lactation: false,
      warning_kidney: 1,
      warning_liver: 0,
      warning_heart: 0,
      warnings_summary: "تحذير تجريبي",
      warnings_summary_en: "Synthetic warning",
    },
    {
      id: commitDuplicate ? "drug-2" : "drug-1",
      name: "Invalid duplicate",
      active: "",
      price: "not-a-price",
    },
  ]);
}

function importInput(content: string, sourceCommit: string) {
  return {
    sourceKind: "local-json" as const,
    sourceUrl,
    sourceCommit,
    sourceFile: "data/eg_drugs.json" as const,
    sourceVersion: "June 2026",
    licenseAcknowledged: true as const,
    content,
  };
}

describe("DrugCatalogService", () => {
  it("stages normalized entries, records invalid rows, and is idempotent", () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    seedAdmin(database);
    const service = new DrugCatalogService(database);
    const admin = context();

    const staged = service.stageImport(
      admin,
      importInput(sourceContent(), "e19709c"),
    );
    const repeated = service.stageImport(
      admin,
      importInput(sourceContent(), "e19709c"),
    );
    const entries = service.listEntries(admin, staged.id);

    expect(repeated.id).toBe(staged.id);
    expect(staged.totalRecords).toBe(2);
    expect(staged.validRecords).toBe(1);
    expect(staged.invalidRecords).toBe(1);
    expect(entries).toHaveLength(2);
    expect(
      entries.find((entry) => entry.externalId === "drug-1"),
    ).toMatchObject({
      externalId: "drug-1",
      nameEn: "Paracetamol",
      priceEgp: 25.5,
      oldPriceEgp: 30,
      validationStatus: "valid",
      warnings: { diabetes: true, kidney: true },
    });
    expect(entries.some((entry) => entry.validationStatus === "invalid")).toBe(
      true,
    );
    expect(
      database.raw
        .prepare("SELECT COUNT(*) AS count FROM drug_catalog_snapshots")
        .get(),
    ).toEqual({ count: 1 });
    database.close();
  });

  it("requires module management for staging and promotes only valid snapshots", () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    seedAdmin(database);
    const service = new DrugCatalogService(database);
    const admin = context();

    expect(() =>
      service.stageImport(context([]), importInput(sourceContent(), "e19709c")),
    ).toThrow("ELITE_AUTH_CAPABILITY_REQUIRED: module.manage");

    const invalidOnly = service.stageImport(
      admin,
      importInput(
        JSON.stringify([{ id: "bad", name: "", active: "", price: "x" }]),
        "invalid-commit",
      ),
    );
    expect(invalidOnly.validRecords).toBe(0);
    expect(() =>
      service.promoteSnapshot(admin, {
        snapshotId: invalidOnly.id,
        reason: "Do not promote invalid synthetic source",
      }),
    ).toThrow("ELITE_DRUG_CATALOG_NO_VALID_RECORDS");
    expect(
      service.rejectSnapshot(admin, {
        snapshotId: invalidOnly.id,
        reason: "Rejected synthetic invalid source",
      }).status,
    ).toBe("rejected");
    database.close();
  });

  it("keeps one active snapshot and supports audited rollback to the previous version", () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    seedAdmin(database);
    const service = new DrugCatalogService(database);
    const admin = context();

    const first = service.stageImport(
      admin,
      importInput(sourceContent("First catalog", true), "commit-001"),
    );
    expect(
      service.promoteSnapshot(admin, {
        snapshotId: first.id,
        reason: "Approve first synthetic catalog",
      }).status,
    ).toBe("active");

    const second = service.stageImport(
      admin,
      importInput(sourceContent("Second catalog", true), "commit-002"),
    );
    const activeSecond = service.promoteSnapshot(admin, {
      snapshotId: second.id,
      reason: "Approve second synthetic catalog",
    });
    expect(activeSecond.status).toBe("active");
    expect(activeSecond.previousSnapshotId).toBe(first.id);
    expect(
      database.raw
        .prepare(
          "SELECT COUNT(*) AS count FROM drug_catalog_snapshots WHERE status = 'active'",
        )
        .get(),
    ).toEqual({ count: 1 });

    const rolledBack = service.rollbackSnapshot(admin, {
      snapshotId: first.id,
      reason: "Rollback second synthetic catalog",
    });
    expect(rolledBack.status).toBe("active");
    expect(
      database.raw
        .prepare("SELECT status FROM drug_catalog_snapshots WHERE id = ?")
        .get(second.id),
    ).toEqual({ status: "superseded" });
    expect(
      database.raw
        .prepare(
          "SELECT action FROM audit_events WHERE entity_type = 'drug-catalog' ORDER BY occurred_at",
        )
        .all()
        .map((row: any) => row.action),
    ).toEqual([
      "drug-catalog.snapshot.staged",
      "drug-catalog.snapshot.promoted",
      "drug-catalog.snapshot.staged",
      "drug-catalog.snapshot.promoted",
      "drug-catalog.snapshot.rolled-back",
    ]);
    database.close();
  });
});
