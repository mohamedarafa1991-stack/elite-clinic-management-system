import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verify as verifySignature } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ElectronSafeStorageKeyProvider,
  type SafeStoragePort,
} from "./key-provider.js";
import { ElectronExportSigner } from "./export-signer.js";

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

describe("ElectronExportSigner", () => {
  it("versions keys and keeps retired public keys available after rotation", () => {
    const directory = mkdtempSync(join(tmpdir(), "elite-export-signer-"));
    const storage = new SyntheticSafeStorage();
    try {
      const signer = new ElectronExportSigner(
        storage,
        join(directory, "signer.json"),
      );
      const first = signer.getActiveKeyMetadata();
      const firstData = Buffer.from("first signed payload", "utf8");
      const firstSignature = signer.sign(firstData);
      expect(firstSignature.keyId).toBe(first.keyId);
      expect(firstSignature.keyVersion).toBe(1);
      expect(
        verifySignature(
          null,
          firstData,
          first.publicKeyPem,
          firstSignature.signature,
        ),
      ).toBe(true);

      const rotated = signer.rotate();
      expect(rotated.keyVersion).toBe(2);
      expect(rotated.keyId).not.toBe(first.keyId);
      expect(signer.listKeyMetadata().map((key) => key.status)).toEqual([
        "active",
        "retired",
      ]);
      const secondSignature = signer.sign(
        Buffer.from("second signed payload", "utf8"),
      );
      expect(secondSignature.keyId).toBe(rotated.keyId);
      expect(secondSignature.keyVersion).toBe(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("exports an encrypted recovery bundle and restores it into a new signer store", () => {
    const sourceDirectory = mkdtempSync(
      join(tmpdir(), "elite-export-recovery-source-"),
    );
    const targetDirectory = mkdtempSync(
      join(tmpdir(), "elite-export-recovery-target-"),
    );
    const storage = new SyntheticSafeStorage();
    try {
      const source = new ElectronExportSigner(
        storage,
        join(sourceDirectory, "signer.json"),
      );
      const sourceKey = source.getActiveKeyMetadata();
      const bundle = source.exportRecoveryBundle(
        "synthetic recovery passphrase",
      );
      const target = new ElectronExportSigner(
        storage,
        join(targetDirectory, "signer.json"),
      );
      const restored = target.restoreRecoveryBundle(
        bundle,
        "synthetic recovery passphrase",
      );
      expect(restored.keyId).toBe(sourceKey.keyId);
      expect(restored.keyVersion).toBe(sourceKey.keyVersion);
      const data = Buffer.from("recovered signed payload", "utf8");
      const signature = target.sign(data);
      expect(
        verifySignature(
          null,
          data,
          sourceKey.publicKeyPem,
          signature.signature,
        ),
      ).toBe(true);
    } finally {
      rmSync(sourceDirectory, { recursive: true, force: true });
      rmSync(targetDirectory, { recursive: true, force: true });
    }
  });

  it("rejects an incorrect recovery passphrase", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "elite-export-recovery-invalid-"),
    );
    const storage = new SyntheticSafeStorage();
    try {
      const signer = new ElectronExportSigner(
        storage,
        join(directory, "signer.json"),
      );
      const bundle = signer.exportRecoveryBundle(
        "synthetic recovery passphrase",
      );
      const target = new ElectronExportSigner(
        storage,
        join(directory, "restored.json"),
      );
      expect(() =>
        target.restoreRecoveryBundle(bundle, "wrong recovery passphrase"),
      ).toThrow("ELITE_EXPORT_SIGNING_KEY_RECOVERY_INVALID");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
