import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseKeyProvider } from "@elite/database";

const KEY_FILE_VERSION = 1;
const KEY_BYTES = 32;

export interface SafeStoragePort {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface WrappedDatabaseKeyFile {
  provider: "electron-safe-storage";
  version: typeof KEY_FILE_VERSION;
  ciphertextBase64: string;
}

function parseWrappedKeyFile(value: string): WrappedDatabaseKeyFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      "ELITE_DB_KEY_FILE_INVALID: the wrapped database-key file is not valid JSON",
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Record<string, unknown>)["provider"] !==
      "electron-safe-storage" ||
    (parsed as Record<string, unknown>)["version"] !== KEY_FILE_VERSION ||
    typeof (parsed as Record<string, unknown>)["ciphertextBase64"] !==
      "string" ||
    ((parsed as Record<string, unknown>)["ciphertextBase64"] as string).length <
      16
  ) {
    throw new Error(
      "ELITE_DB_KEY_FILE_INVALID: the wrapped database-key file has an invalid shape",
    );
  }
  return parsed as WrappedDatabaseKeyFile;
}

function atomicWrite(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = join(
    dirname(path),
    `.${path.split(/[\\/]/).pop() ?? "elite-db-key"}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    writeFileSync(temporaryPath, value, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporaryPath, path);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Best-effort cleanup only. The original error is more useful to the caller.
    }
    throw new Error(
      "ELITE_DB_KEY_FILE_WRITE_FAILED: unable to persist the wrapped database key",
      { cause: error },
    );
  }
}

export class ElectronSafeStorageKeyProvider implements DatabaseKeyProvider {
  public readonly providerName = "electron-safe-storage";
  public readonly storageScheme = "os-wrapped-random-key" as const;

  public constructor(
    private readonly safeStorage: SafeStoragePort,
    private readonly keyFilePath: string,
  ) {}

  public getOrCreateKey(): Buffer {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "ELITE_DB_OS_KEY_PROVIDER_UNAVAILABLE: Electron safeStorage is not available for this user session",
      );
    }

    if (existsSync(this.keyFilePath)) {
      const wrapped = parseWrappedKeyFile(
        readFileSync(this.keyFilePath, "utf8"),
      );
      let decoded: string;
      try {
        decoded = this.safeStorage.decryptString(
          Buffer.from(wrapped.ciphertextBase64, "base64"),
        );
      } catch (error) {
        throw new Error(
          "ELITE_DB_KEY_UNWRAP_FAILED: the OS could not unwrap the database key",
          { cause: error },
        );
      }
      const key = Buffer.from(decoded, "base64");
      if (key.length !== KEY_BYTES) {
        key.fill(0);
        throw new Error(
          "ELITE_DB_KEY_INVALID: unwrapped database key is not 256 bits",
        );
      }
      return key;
    }

    const key = randomBytes(KEY_BYTES);
    try {
      const ciphertext = this.safeStorage.encryptString(key.toString("base64"));
      const wrapped: WrappedDatabaseKeyFile = {
        provider: "electron-safe-storage",
        version: KEY_FILE_VERSION,
        ciphertextBase64: ciphertext.toString("base64"),
      };
      atomicWrite(this.keyFilePath, `${JSON.stringify(wrapped)}\n`);
      return key;
    } catch (error) {
      key.fill(0);
      if (
        error instanceof Error &&
        error.message.startsWith("ELITE_DB_KEY_FILE_WRITE_FAILED")
      ) {
        throw error;
      }
      throw new Error(
        "ELITE_DB_KEY_WRAP_FAILED: unable to create the OS-wrapped database key",
        { cause: error },
      );
    }
  }
}
