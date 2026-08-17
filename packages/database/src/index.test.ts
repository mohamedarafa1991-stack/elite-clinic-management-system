import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationVersions, openDatabase } from "./index.js";

class SyntheticKeyProvider {
  public readonly providerName = "synthetic-test-provider";
  public readonly storageScheme = "os-wrapped-random-key" as const;
  public readonly key = Buffer.alloc(32, 0x42);

  public getOrCreateKey(): Buffer {
    return Buffer.from(this.key);
  }
}

describe("Elite database foundation", () => {
  it("opens synthetic test storage and applies the foundation migration", () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    try {
      const tables = database.raw
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all()
        .map((row) => (row as { name: string }).name);

      expect(migrationVersions()).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ]);
      expect(tables).toContain("patients");
      expect(tables).toContain("related_persons");
      expect(tables).toContain("appointments");
      expect(tables).toContain("outbox_events");
      expect(tables).toContain("audit_events");
      expect(tables).toContain("patient_identity_sequence");
      expect(tables).toContain("patient_duplicate_reviews");
      expect(tables).toContain("patient_merge_cases");
      expect(tables).toContain("patient_identity_history");
      expect(tables).toContain("specialties");
      expect(tables).toContain("departments");
      expect(tables).toContain("services");
      expect(tables).toContain("doctor_schedules");
      expect(tables).toContain("schedule_exceptions");
      expect(tables).toContain("appointment_history");
      expect(tables).toContain("patient_medical_history");
      expect(tables).toContain("icd10_codes");
      expect(tables).toContain("encounters");
      expect(tables).toContain("diagnoses");
      expect(tables).toContain("encounter_amendments");
      expect(tables).toContain("encounter_projection_snapshots");
      expect(tables).toContain("export_revocations");
      expect(tables).toContain("org_settings");
      const amendmentColumns = database.raw
        .prepare("PRAGMA table_info(encounter_amendments)")
        .all() as Array<{ name: string }>;
      expect(amendmentColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "base_amendment_id",
          "conflict_reason",
          "conflict_resolved_at",
          "applied_sequence",
        ]),
      );
      const relatedPersonColumns = database.raw
        .prepare("PRAGMA table_info(related_persons)")
        .all() as Array<{ name: string }>;
      expect(relatedPersonColumns.map((column) => column.name)).toContain(
        "version",
      );
    } finally {
      database.close();
    }
  });

  it("keeps the installation identity stable across openings", () => {
    const directory = mkdtempSync(join(tmpdir(), "elite-db-"));
    const filename = join(directory, "foundation.db");
    try {
      const database = openDatabase({ filename, mode: "test" });
      const first = database.raw
        .prepare("SELECT value FROM app_meta WHERE key = 'installation_id'")
        .get() as { value: string };
      database.close();

      const reopened = openDatabase({ filename, mode: "test" });
      try {
        const second = reopened.raw
          .prepare("SELECT value FROM app_meta WHERE key = 'installation_id'")
          .get() as { value: string };
        expect(first.value).toBeTruthy();
        expect(second.value).toBe(first.value);
      } finally {
        reopened.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("records a migration checksum", () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    try {
      const migration = database.raw
        .prepare("SELECT version, name, checksum FROM migration_history")
        .get() as { version: number; name: string; checksum: string };
      expect(migration.version).toBe(1);
      expect(migration.name).toBe("foundation");
      expect(migration.checksum).toMatch(/^[0-9a-f]+$/);
    } finally {
      database.close();
    }
  });

  it("enables foreign-key enforcement", () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    try {
      const result = database.raw.pragma("foreign_keys", { simple: true });
      expect(result).toBe(1);
    } finally {
      database.close();
    }
  });

  it("rejects production storage without an explicit encryption driver and key", () => {
    expect(() =>
      openDatabase({ filename: ":memory:", mode: "production" }),
    ).toThrow("ELITE_DB_ENCRYPTION_REQUIRED");
  });

  it("opens encrypted production storage through the key-provider contract", () => {
    const directory = mkdtempSync(join(tmpdir(), "elite-encrypted-db-"));
    const filename = join(directory, "encrypted.db");
    const provider = new SyntheticKeyProvider();
    try {
      const database = openDatabase({
        filename,
        mode: "production",
        keyProvider: provider,
      });
      database.raw
        .prepare(
          "INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)",
        )
        .run("synthetic-test", "ok", new Date().toISOString());
      database.close();

      const reopened = openDatabase({
        filename,
        mode: "production",
        keyProvider: provider,
      });
      try {
        const row = reopened.raw
          .prepare("SELECT value FROM app_meta WHERE key = 'synthetic-test'")
          .get() as { value: string } | undefined;
        expect(row?.value).toBe("ok");
      } finally {
        reopened.close();
      }
      expect(provider.key.equals(Buffer.alloc(32, 0x42))).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
