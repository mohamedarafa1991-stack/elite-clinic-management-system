import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@elite/database";
import { roleCapabilities } from "@elite/contracts";
import type { SessionContext } from "@elite/auth";
import { DesktopBackupRestoreService } from "./backup-restore.js";

describe("DesktopBackupRestoreService", () => {
  it("creates a hashed encrypted-at-rest package and restores its vault", () => {
    const root = mkdtempSync(join(tmpdir(), "elite-backup-test-"));
    const databasePath = join(root, "elite-clinic.db");
    const vaultPath = join(root, "doctor-documents");
    mkdirSync(vaultPath, { recursive: true });
    writeFileSync(
      join(vaultPath, "synthetic-document.bin"),
      Buffer.from("encrypted-synthetic-document"),
    );
    const database = openDatabase({ filename: databasePath, mode: "test" });
    const admin: SessionContext = {
      sessionId: "synthetic-backup-session",
      token: "synthetic-backup-token",
      userId: "synthetic-admin",
      username: "synthetic-admin",
      role: "admin",
      deviceId: "synthetic-device",
      capabilities: roleCapabilities.admin,
      expiresAt: "2099-01-01T00:00:00.000Z",
    };
    try {
      const service = new DesktopBackupRestoreService(
        database,
        databasePath,
        vaultPath,
        "0.1.0-test",
      );
      const packagePath = join(root, "elite-clinic-backup-test");
      const backup = service.createBackup(admin, packagePath);
      expect(backup.manifest.files.map((file) => file.path)).toEqual(
        expect.arrayContaining([
          "elite-clinic.db",
          "doctor-documents/synthetic-document.bin",
        ]),
      );
      writeFileSync(
        join(vaultPath, "synthetic-document.bin"),
        Buffer.from("changed"),
      );
      const restored = service.restoreBackup(admin, packagePath);
      expect(restored.manifest.formatVersion).toBe(1);
      expect(
        readFileSync(join(vaultPath, "synthetic-document.bin"), "utf8"),
      ).toBe("encrypted-synthetic-document");
    } finally {
      // restoreBackup closes the database; this is idempotent only for the test cleanup path.
      try {
        database.close();
      } catch {
        // already closed by restore
      }
    }
  });

  it("rejects backup creation without backup.manage", () => {
    const root = mkdtempSync(join(tmpdir(), "elite-backup-auth-test-"));
    const databasePath = join(root, "elite-clinic.db");
    const database = openDatabase({ filename: databasePath, mode: "test" });
    const receptionist: SessionContext = {
      sessionId: "synthetic-reception-session",
      token: "synthetic-reception-token",
      userId: "synthetic-receptionist",
      username: "synthetic-receptionist",
      role: "receptionist",
      deviceId: "synthetic-device",
      capabilities: roleCapabilities.receptionist,
      expiresAt: "2099-01-01T00:00:00.000Z",
    };
    try {
      const service = new DesktopBackupRestoreService(
        database,
        databasePath,
        join(root, "doctor-documents"),
        "0.1.0-test",
      );
      expect(() =>
        service.createBackup(receptionist, join(root, "backup")),
      ).toThrow("ELITE_AUTH_CAPABILITY_REQUIRED: backup.manage");
    } finally {
      database.close();
    }
  });
});
