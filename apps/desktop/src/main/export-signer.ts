import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  scryptSync,
  sign as signBytes,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  exportSigningKeyMetadataSchema,
  exportSigningKeyPassphraseSchema,
  exportSigningKeyRecoveryBundleSchema,
  type ExportSigningKeyMetadata,
  type ExportSigningKeyRecoveryBundle,
} from "@elite/contracts";
import type { ExportSignaturePort } from "@elite/auth";
import type { SafeStoragePort } from "./key-provider.js";

const LEGACY_FILE_VERSION = 1;
const STORE_FILE_VERSION = 2;
const RECOVERY_SCHEMA_VERSION = 1;
const ALGORITHM = "ed25519" as const;

type StoredKeyStatus = "active" | "retired" | "revoked";

interface LegacyWrappedSigningKeyFile {
  provider: "electron-safe-storage";
  version: typeof LEGACY_FILE_VERSION;
  publicKeyPem: string;
  privateKeyCiphertextBase64: string;
}

interface WrappedSigningKeyEntry {
  keyId: string;
  keyVersion: number;
  algorithm: typeof ALGORITHM;
  publicKeyPem: string;
  publicKeyFingerprint: string;
  status: StoredKeyStatus;
  createdAt: string;
  retiredAt: string | null;
  revokedAt: string | null;
  privateKeyCiphertextBase64: string;
}

interface WrappedSigningKeyStore {
  provider: "electron-safe-storage";
  version: typeof STORE_FILE_VERSION;
  activeKeyId: string;
  keys: WrappedSigningKeyEntry[];
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
      "ELITE_EXPORT_SIGNING_KEY_WRITE_FAILED: unable to persist export signing key store",
      { cause: error },
    );
  }
}

function fingerprint(publicKeyPem: string): string {
  return createHash("sha256").update(publicKeyPem, "utf8").digest("hex");
}

function keyIdForFingerprint(publicKeyFingerprint: string): string {
  return `esk-${publicKeyFingerprint.slice(0, 24)}`;
}

function metadataFromEntry(
  entry: WrappedSigningKeyEntry,
): ExportSigningKeyMetadata {
  return exportSigningKeyMetadataSchema.parse({
    keyId: entry.keyId,
    keyVersion: entry.keyVersion,
    algorithm: entry.algorithm,
    publicKeyPem: entry.publicKeyPem,
    publicKeyFingerprint: entry.publicKeyFingerprint,
    status: entry.status,
    createdAt: entry.createdAt,
    retiredAt: entry.retiredAt,
    revokedAt: entry.revokedAt,
  });
}

function publicKeyFromPrivate(privateKeyPem: string): string {
  return createPublicKey(
    createPrivateKey({ key: privateKeyPem, format: "pem", type: "pkcs8" }),
  )
    .export({ format: "pem", type: "spki" })
    .toString();
}

export class ElectronExportSigner implements ExportSignaturePort {
  private store: WrappedSigningKeyStore | undefined;
  private readonly privateKeys = new Map<string, string>();

  public constructor(
    private readonly safeStorage: SafeStoragePort,
    private readonly keyFilePath: string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  public sign(data: Buffer): {
    publicKeyPem: string;
    signature: Buffer;
    keyId: string;
    keyVersion: number;
  } {
    const entry = this.activeEntry();
    return {
      publicKeyPem: entry.publicKeyPem,
      signature: signBytes(null, data, this.privateKeyFor(entry)),
      keyId: entry.keyId,
      keyVersion: entry.keyVersion,
    };
  }

  public getActiveKeyMetadata(): ExportSigningKeyMetadata {
    return metadataFromEntry(this.activeEntry());
  }

  public listKeyMetadata(): readonly ExportSigningKeyMetadata[] {
    return this.loadStore()
      .keys.slice()
      .sort((left, right) => right.keyVersion - left.keyVersion)
      .map(metadataFromEntry);
  }

  public rotate(): ExportSigningKeyMetadata {
    const store = this.loadStore();
    const current = this.activeEntry(store);
    const rotatedAt = this.now();
    current.status = "retired";
    current.retiredAt = rotatedAt;
    const generated = this.createStoredKey(
      Math.max(...store.keys.map((entry) => entry.keyVersion), 0) + 1,
      rotatedAt,
    );
    store.keys.push(generated);
    store.activeKeyId = generated.keyId;
    this.persistStore(store);
    return metadataFromEntry(generated);
  }

  public exportRecoveryBundle(
    passphrase: string,
  ): ExportSigningKeyRecoveryBundle {
    const parsedPassphrase = exportSigningKeyPassphraseSchema.parse(passphrase);
    const entry = this.activeEntry();
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const derivedKey = scryptSync(parsedPassphrase, salt, 32);
    const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(this.privateKeyFor(entry), "utf8"),
      cipher.final(),
    ]);
    const bundle = exportSigningKeyRecoveryBundleSchema.parse({
      schemaVersion: RECOVERY_SCHEMA_VERSION,
      keyId: entry.keyId,
      keyVersion: entry.keyVersion,
      algorithm: ALGORITHM,
      publicKeyPem: entry.publicKeyPem,
      publicKeyFingerprint: entry.publicKeyFingerprint,
      kdf: "scrypt",
      saltBase64: salt.toString("base64"),
      ivBase64: iv.toString("base64"),
      authTagBase64: cipher.getAuthTag().toString("base64"),
      ciphertextBase64: ciphertext.toString("base64"),
      createdAt: this.now(),
    });
    derivedKey.fill(0);
    return bundle;
  }

  public restoreRecoveryBundle(
    input: ExportSigningKeyRecoveryBundle,
    passphrase: string,
  ): ExportSigningKeyMetadata {
    const bundle = exportSigningKeyRecoveryBundleSchema.parse(input);
    const parsedPassphrase = exportSigningKeyPassphraseSchema.parse(passphrase);
    const salt = Buffer.from(bundle.saltBase64, "base64");
    const iv = Buffer.from(bundle.ivBase64, "base64");
    const authTag = Buffer.from(bundle.authTagBase64, "base64");
    const ciphertext = Buffer.from(bundle.ciphertextBase64, "base64");
    const derivedKey = scryptSync(parsedPassphrase, salt, 32);
    let privateKeyPem: string;
    try {
      const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
      decipher.setAuthTag(authTag);
      privateKeyPem = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
    } catch (error) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_RECOVERY_INVALID: recovery passphrase or bundle is invalid",
        { cause: error },
      );
    } finally {
      derivedKey.fill(0);
    }
    const derivedPublicKeyPem = publicKeyFromPrivate(privateKeyPem);
    const derivedFingerprint = fingerprint(derivedPublicKeyPem);
    if (
      derivedPublicKeyPem !== bundle.publicKeyPem ||
      derivedFingerprint !== bundle.publicKeyFingerprint ||
      keyIdForFingerprint(derivedFingerprint) !== bundle.keyId
    ) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_RECOVERY_INVALID: recovered private key does not match the public key metadata",
      );
    }

    const store = this.loadStore();
    const existing = store.keys.find((entry) => entry.keyId === bundle.keyId);
    if (existing?.status === "revoked") {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_RECOVERY_REVOKED: a revoked signing key cannot be restored",
      );
    }
    const versionConflict = store.keys.find(
      (entry) =>
        entry.keyVersion === bundle.keyVersion && entry.keyId !== bundle.keyId,
    );
    const replaceBootstrapKey =
      Boolean(versionConflict) &&
      store.keys.length === 1 &&
      versionConflict?.status === "active" &&
      versionConflict.keyVersion === 1;
    if (versionConflict && !replaceBootstrapKey) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_RECOVERY_VERSION_CONFLICT: key version is already assigned to another key",
      );
    }
    const restoredAt = this.now();
    for (const entry of store.keys) {
      if (entry.status === "active" && entry.keyId !== bundle.keyId) {
        entry.status = "retired";
        entry.retiredAt = restoredAt;
      }
    }
    const wrappedPrivateKey = this.safeStorage.encryptString(privateKeyPem);
    const restoredEntry: WrappedSigningKeyEntry = {
      keyId: bundle.keyId,
      keyVersion: bundle.keyVersion,
      algorithm: ALGORITHM,
      publicKeyPem: bundle.publicKeyPem,
      publicKeyFingerprint: bundle.publicKeyFingerprint,
      status: "active",
      createdAt: existing?.createdAt ?? bundle.createdAt,
      retiredAt: null,
      revokedAt: null,
      privateKeyCiphertextBase64: wrappedPrivateKey.toString("base64"),
    };
    store.keys = existing
      ? store.keys.map((entry) =>
          entry.keyId === bundle.keyId ? restoredEntry : entry,
        )
      : replaceBootstrapKey
        ? [restoredEntry]
        : [...store.keys, restoredEntry];
    store.activeKeyId = bundle.keyId;
    this.persistStore(store);
    this.privateKeys.set(bundle.keyId, privateKeyPem);
    return metadataFromEntry(restoredEntry);
  }

  private activeEntry(store = this.loadStore()): WrappedSigningKeyEntry {
    const active = store.keys.find(
      (entry) => entry.keyId === store.activeKeyId && entry.status === "active",
    );
    if (!active) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_ACTIVE_MISSING: no active export signing key is available",
      );
    }
    return active;
  }

  private privateKeyFor(entry: WrappedSigningKeyEntry): string {
    const cached = this.privateKeys.get(entry.keyId);
    if (cached) return cached;
    const privateKeyPem = this.safeStorage.decryptString(
      Buffer.from(entry.privateKeyCiphertextBase64, "base64"),
    );
    this.privateKeys.set(entry.keyId, privateKeyPem);
    return privateKeyPem;
  }

  private createStoredKey(
    keyVersion: number,
    createdAt: string,
  ): WrappedSigningKeyEntry {
    const generated = generateKeyPairSync(ALGORITHM, {
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    });
    const publicKeyFingerprint = fingerprint(generated.publicKey);
    const ciphertext = this.safeStorage.encryptString(generated.privateKey);
    this.privateKeys.set(
      keyIdForFingerprint(publicKeyFingerprint),
      generated.privateKey,
    );
    return {
      keyId: keyIdForFingerprint(publicKeyFingerprint),
      keyVersion,
      algorithm: ALGORITHM,
      publicKeyPem: generated.publicKey,
      publicKeyFingerprint,
      status: "active",
      createdAt,
      retiredAt: null,
      revokedAt: null,
      privateKeyCiphertextBase64: ciphertext.toString("base64"),
    };
  }

  private loadStore(): WrappedSigningKeyStore {
    if (this.store) return this.store;
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_PROVIDER_UNAVAILABLE: OS-backed export signing is unavailable",
      );
    }
    if (!existsSync(this.keyFilePath)) {
      const createdAt = this.now();
      const initial = this.createStoredKey(1, createdAt);
      this.store = {
        provider: "electron-safe-storage",
        version: STORE_FILE_VERSION,
        activeKeyId: initial.keyId,
        keys: [initial],
      };
      this.persistStore(this.store);
      return this.store;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.keyFilePath, "utf8"));
    } catch (error) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_INVALID: stored signing key metadata is invalid",
        { cause: error },
      );
    }
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { version?: unknown }).version === LEGACY_FILE_VERSION
    ) {
      const legacy = parsed as LegacyWrappedSigningKeyFile;
      if (
        legacy.provider !== "electron-safe-storage" ||
        typeof legacy.publicKeyPem !== "string" ||
        typeof legacy.privateKeyCiphertextBase64 !== "string"
      ) {
        throw new Error(
          "ELITE_EXPORT_SIGNING_KEY_INVALID: stored signing key metadata is invalid",
        );
      }
      const publicKeyFingerprint = fingerprint(legacy.publicKeyPem);
      const entry: WrappedSigningKeyEntry = {
        keyId: keyIdForFingerprint(publicKeyFingerprint),
        keyVersion: 1,
        algorithm: ALGORITHM,
        publicKeyPem: legacy.publicKeyPem,
        publicKeyFingerprint,
        status: "active",
        createdAt: this.now(),
        retiredAt: null,
        revokedAt: null,
        privateKeyCiphertextBase64: legacy.privateKeyCiphertextBase64,
      };
      this.store = {
        provider: "electron-safe-storage",
        version: STORE_FILE_VERSION,
        activeKeyId: entry.keyId,
        keys: [entry],
      };
      this.persistStore(this.store);
      return this.store;
    }
    const store = parsed as Partial<WrappedSigningKeyStore>;
    if (
      store.provider !== "electron-safe-storage" ||
      store.version !== STORE_FILE_VERSION ||
      typeof store.activeKeyId !== "string" ||
      !Array.isArray(store.keys) ||
      store.keys.length === 0
    ) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_INVALID: stored signing key metadata is invalid",
      );
    }
    for (const entry of store.keys) {
      if (
        typeof entry.keyId !== "string" ||
        typeof entry.keyVersion !== "number" ||
        entry.algorithm !== ALGORITHM ||
        typeof entry.publicKeyPem !== "string" ||
        typeof entry.publicKeyFingerprint !== "string" ||
        !["active", "retired", "revoked"].includes(entry.status) ||
        typeof entry.createdAt !== "string" ||
        typeof entry.privateKeyCiphertextBase64 !== "string"
      ) {
        throw new Error(
          "ELITE_EXPORT_SIGNING_KEY_INVALID: stored signing key metadata is invalid",
        );
      }
    }
    this.store = store as WrappedSigningKeyStore;
    this.activeEntry(this.store);
    return this.store;
  }

  private persistStore(store: WrappedSigningKeyStore): void {
    atomicWrite(this.keyFilePath, `${JSON.stringify(store)}\n`);
  }
}
