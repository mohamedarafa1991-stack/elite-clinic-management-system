import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ElectronSafeStorageKeyProvider,
  type SafeStoragePort,
} from "./key-provider.js";

class SyntheticSafeStorage implements SafeStoragePort {
  public encryptCalls = 0;
  public decryptCalls = 0;
  public available = true;

  public isEncryptionAvailable(): boolean {
    return this.available;
  }

  public encryptString(value: string): Buffer {
    this.encryptCalls += 1;
    return Buffer.from(`synthetic:${value}`, "utf8");
  }

  public decryptString(value: Buffer): string {
    this.decryptCalls += 1;
    const decoded = value.toString("utf8");
    if (!decoded.startsWith("synthetic:")) {
      throw new Error("synthetic unwrap failed");
    }
    return decoded.slice("synthetic:".length);
  }
}

describe("ElectronSafeStorageKeyProvider", () => {
  it("creates, persists, and reuses an OS-wrapped 256-bit key", () => {
    const directory = mkdtempSync(join(tmpdir(), "elite-key-provider-"));
    const keyPath = join(directory, "elite-clinic.db.key");
    const storage = new SyntheticSafeStorage();
    try {
      const firstProvider = new ElectronSafeStorageKeyProvider(
        storage,
        keyPath,
      );
      const firstKey = firstProvider.getOrCreateKey();
      const savedKey = Buffer.from(firstKey);
      firstKey.fill(0);
      expect(savedKey).toHaveLength(32);
      expect(storage.encryptCalls).toBe(1);
      expect(JSON.parse(readFileSync(keyPath, "utf8"))).toMatchObject({
        provider: "electron-safe-storage",
        version: 1,
      });

      const secondProvider = new ElectronSafeStorageKeyProvider(
        storage,
        keyPath,
      );
      const secondKey = secondProvider.getOrCreateKey();
      expect(secondKey).toEqual(savedKey);
      expect(storage.decryptCalls).toBe(1);
      secondKey.fill(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when OS-backed encryption is unavailable", () => {
    const directory = mkdtempSync(join(tmpdir(), "elite-key-provider-"));
    const storage = new SyntheticSafeStorage();
    storage.available = false;
    try {
      const provider = new ElectronSafeStorageKeyProvider(
        storage,
        join(directory, "elite-clinic.db.key"),
      );
      expect(() => provider.getOrCreateKey()).toThrow(
        "ELITE_DB_OS_KEY_PROVIDER_UNAVAILABLE",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a corrupted wrapped-key file", () => {
    const directory = mkdtempSync(join(tmpdir(), "elite-key-provider-"));
    const keyPath = join(directory, "elite-clinic.db.key");
    const storage = new SyntheticSafeStorage();
    try {
      const provider = new ElectronSafeStorageKeyProvider(storage, keyPath);
      provider.getOrCreateKey().fill(0);
      const corrupted = JSON.parse(readFileSync(keyPath, "utf8")) as Record<
        string,
        unknown
      >;
      corrupted["version"] = 999;
      writeFileSync(keyPath, `${JSON.stringify(corrupted)}\n`, "utf8");
      expect(() => provider.getOrCreateKey()).toThrow(
        "ELITE_DB_KEY_FILE_INVALID",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
