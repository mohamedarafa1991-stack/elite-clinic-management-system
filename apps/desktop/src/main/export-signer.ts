import { generateKeyPairSync, sign as signBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import type { ExportSignaturePort } from "@elite/auth";
import type { SafeStoragePort } from "./key-provider.js";

const FILE_VERSION = 1;

interface WrappedSigningKeyFile {
  provider: "electron-safe-storage";
  version: typeof FILE_VERSION;
  publicKeyPem: string;
  privateKeyCiphertextBase64: string;
}

function atomicWrite(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = join(
    dirname(path),
    `.${path.split(/[\\/]/).pop() ?? "elite-export-key"}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
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
      // Best-effort cleanup only.
    }
    throw new Error(
      "ELITE_EXPORT_SIGNING_KEY_WRITE_FAILED: unable to persist export signing key",
      { cause: error },
    );
  }
}

export class ElectronExportSigner implements ExportSignaturePort {
  private privateKeyPem: string | undefined;
  private publicKeyPem: string | undefined;

  public constructor(
    private readonly safeStorage: SafeStoragePort,
    private readonly keyFilePath: string,
  ) {}

  public sign(data: Buffer): { publicKeyPem: string; signature: Buffer } {
    const keys = this.loadOrCreateKeys();
    return {
      publicKeyPem: keys.publicKeyPem,
      signature: signBytes(null, data, keys.privateKeyPem),
    };
  }

  private loadOrCreateKeys(): { privateKeyPem: string; publicKeyPem: string } {
    if (this.privateKeyPem && this.publicKeyPem) {
      return {
        privateKeyPem: this.privateKeyPem,
        publicKeyPem: this.publicKeyPem,
      };
    }
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_PROVIDER_UNAVAILABLE: OS-backed export signing is unavailable",
      );
    }
    if (existsSync(this.keyFilePath)) {
      const wrapped = JSON.parse(
        readFileSync(this.keyFilePath, "utf8"),
      ) as WrappedSigningKeyFile;
      if (
        wrapped.provider !== "electron-safe-storage" ||
        wrapped.version !== FILE_VERSION ||
        typeof wrapped.publicKeyPem !== "string" ||
        typeof wrapped.privateKeyCiphertextBase64 !== "string"
      ) {
        throw new Error(
          "ELITE_EXPORT_SIGNING_KEY_INVALID: stored signing key metadata is invalid",
        );
      }
      this.privateKeyPem = this.safeStorage.decryptString(
        Buffer.from(wrapped.privateKeyCiphertextBase64, "base64"),
      );
      this.publicKeyPem = wrapped.publicKeyPem;
      return {
        privateKeyPem: this.privateKeyPem,
        publicKeyPem: this.publicKeyPem,
      };
    }
    const generated = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    });
    const ciphertext = this.safeStorage.encryptString(generated.privateKey);
    atomicWrite(
      this.keyFilePath,
      `${JSON.stringify({
        provider: "electron-safe-storage",
        version: FILE_VERSION,
        publicKeyPem: generated.publicKey,
        privateKeyCiphertextBase64: ciphertext.toString("base64"),
      } satisfies WrappedSigningKeyFile)}\n`,
    );
    this.privateKeyPem = generated.privateKey;
    this.publicKeyPem = generated.publicKey;
    return {
      privateKeyPem: generated.privateKey,
      publicKeyPem: generated.publicKey,
    };
  }
}
