import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationVersions, openDatabase } from "./index.js";

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

      expect(migrationVersions()).toEqual([1]);
      expect(tables).toContain("patients");
      expect(tables).toContain("related_persons");
      expect(tables).toContain("appointments");
      expect(tables).toContain("outbox_events");
      expect(tables).toContain("audit_events");
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
});
