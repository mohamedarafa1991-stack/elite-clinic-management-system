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
