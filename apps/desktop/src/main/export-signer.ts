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
  type KeyObject,
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
const RECOVERY_SCHEMA_VERSION = 2;
const ALGORITHM = "ed25519" as const;
const RECOVERY_KDF_PARAMETERS = {
  cost: 65_536,
  blockSize: 8,
  parallelization: 1,
  maxMemoryBytes: 128 * 1024 * 1024,
} as const;

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

function publicKeyFromPrivateKeyObject(privateKey: KeyObject): string {
  return createPublicKey(privateKey)
    .export({ format: "pem", type: "spki" })
    .toString();
}

function recoveryAdditionalData(
  bundle: Pick<
    ExportSigningKeyRecoveryBundle,
    | "schemaVersion"
    | "keyId"
    | "keyVersion"
    | "algorithm"
    | "publicKeyPem"
    | "publicKeyFingerprint"
    | "kdf"
    | "kdfParameters"
    | "saltBase64"
    | "ivBase64"
    | "createdAt"
  >,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: bundle.schemaVersion,
      keyId: bundle.keyId,
      keyVersion: bundle.keyVersion,
      algorithm: bundle.algorithm,
      publicKeyPem: bundle.publicKeyPem,
      publicKeyFingerprint: bundle.publicKeyFingerprint,
      kdf: bundle.kdf,
      kdfParameters: bundle.kdfParameters,
      saltBase64: bundle.saltBase64,
      ivBase64: bundle.ivBase64,
      createdAt: bundle.createdAt,
    }),
    "utf8",
  );
}

function decodeRecoveryField(
  value: string,
  fieldName: string,
  expectedLength: number | undefined,
  maxLength: number,
): Buffer {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new Error(
      `ELITE_EXPORT_SIGNING_KEY_RECOVERY_INVALID: ${fieldName} is not canonical Base64`,
    );
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.length > maxLength ||
    (expectedLength && decoded.length !== expectedLength)
  ) {
    throw new Error(
      `ELITE_EXPORT_SIGNING_KEY_RECOVERY_INVALID: ${fieldName} has an invalid length`,
    );
  }
  return decoded;
}

export class ElectronExportSigner implements ExportSignaturePort {
  private store: WrappedSigningKeyStore | undefined;
  private readonly privateKeys = new Map<string, KeyObject>();

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
    const privateKeyPem = Buffer.from(
      this.privateKeyFor(entry)
        .export({
          format: "pem",
          type: "pkcs8",
        })
        .toString(),
      "utf8",
    );
    const bundleWithoutCiphertext = {
      schemaVersion: RECOVERY_SCHEMA_VERSION as 2,
      keyId: entry.keyId,
      keyVersion: entry.keyVersion,
      algorithm: ALGORITHM,
      publicKeyPem: entry.publicKeyPem,
      publicKeyFingerprint: entry.publicKeyFingerprint,
      kdf: "scrypt" as const,
      kdfParameters: RECOVERY_KDF_PARAMETERS,
      saltBase64: salt.toString("base64"),
      ivBase64: iv.toString("base64"),
      createdAt: this.now(),
    };
    const aad = recoveryAdditionalData(bundleWithoutCiphertext);
    const derivedKey = scryptSync(parsedPassphrase, salt, 32, {
      N: RECOVERY_KDF_PARAMETERS.cost,
      r: RECOVERY_KDF_PARAMETERS.blockSize,
      p: RECOVERY_KDF_PARAMETERS.parallelization,
      maxmem: RECOVERY_KDF_PARAMETERS.maxMemoryBytes,
    });
    try {
      const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
      cipher.setAAD(aad);
      const ciphertext = Buffer.concat([
        cipher.update(privateKeyPem),
        cipher.final(),
      ]);
      return exportSigningKeyRecoveryBundleSchema.parse({
        ...bundleWithoutCiphertext,
        authTagBase64: cipher.getAuthTag().toString("base64"),
        ciphertextBase64: ciphertext.toString("base64"),
      });
    } finally {
      derivedKey.fill(0);
      privateKeyPem.fill(0);
      aad.fill(0);
    }
  }

  public restoreRecoveryBundle(
    input: ExportSigningKeyRecoveryBundle,
    passphrase: string,
  ): ExportSigningKeyMetadata {
    const bundle = exportSigningKeyRecoveryBundleSchema.parse(input);
    const parsedPassphrase = exportSigningKeyPassphraseSchema.parse(passphrase);
    const salt = decodeRecoveryField(bundle.saltBase64, "salt", 16, 16);
    const iv = decodeRecoveryField(bundle.ivBase64, "iv", 12, 12);
    const authTag = decodeRecoveryField(
      bundle.authTagBase64,
      "auth tag",
      16,
      16,
    );
    const ciphertext = decodeRecoveryField(
      bundle.ciphertextBase64,
      "ciphertext",
      undefined,
      8192,
    );
    const aad = recoveryAdditionalData(bundle);
    const derivedKey = scryptSync(parsedPassphrase, salt, 32, {
      N: bundle.kdfParameters.cost,
      r: bundle.kdfParameters.blockSize,
      p: bundle.kdfParameters.parallelization,
      maxmem: bundle.kdfParameters.maxMemoryBytes,
    });
    let privateKeyPem: Buffer | undefined;
    let privateKey: KeyObject | undefined;
    try {
      const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(authTag);
      privateKeyPem = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      privateKey = createPrivateKey({
        key: privateKeyPem,
        format: "pem",
        type: "pkcs8",
      });
    } catch (error) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_RECOVERY_INVALID: recovery passphrase or bundle is invalid",
        { cause: error },
      );
    } finally {
      derivedKey.fill(0);
      salt.fill(0);
      iv.fill(0);
      authTag.fill(0);
      ciphertext.fill(0);
      aad.fill(0);
    }
    if (!privateKey || !privateKeyPem) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_RECOVERY_INVALID: recovered private key is unavailable",
      );
    }
    try {
      const derivedPublicKeyPem = publicKeyFromPrivateKeyObject(privateKey);
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
      if (existing?.status === "retired") {
        throw new Error(
          "ELITE_EXPORT_SIGNING_KEY_RECOVERY_REACTIVATION_REQUIRES_APPROVAL: retired signing keys require an explicit reactivation workflow",
        );
      }
      const versionConflict = store.keys.find(
        (entry) =>
          entry.keyVersion === bundle.keyVersion &&
          entry.keyId !== bundle.keyId,
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
      const wrappedPrivateKey = this.safeStorage.encryptString(
        privateKeyPem.toString("utf8"),
      );
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
      this.clearKeyCache();
      this.privateKeys.set(bundle.keyId, privateKey);
      return metadataFromEntry(restoredEntry);
    } finally {
      privateKeyPem.fill(0);
    }
  }

  public clearKeyCache(): void {
    this.privateKeys.clear();
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

  private privateKeyFor(entry: WrappedSigningKeyEntry): KeyObject {
    const cached = this.privateKeys.get(entry.keyId);
    if (cached) return cached;
    let privateKey: KeyObject;
    let privateKeyPemBytes: Buffer | undefined;
    try {
      const privateKeyPem = this.safeStorage.decryptString(
        Buffer.from(entry.privateKeyCiphertextBase64, "base64"),
      );
      privateKeyPemBytes = Buffer.from(privateKeyPem, "utf8");
      privateKey = createPrivateKey({
        key: privateKeyPemBytes,
        format: "pem",
        type: "pkcs8",
      });
    } catch (error) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_PRIVATE_KEY_INVALID: stored private key is invalid",
        { cause: error },
      );
    } finally {
      privateKeyPemBytes?.fill(0);
    }
    const derivedPublicKeyPem = publicKeyFromPrivateKeyObject(privateKey);
    if (
      derivedPublicKeyPem !== entry.publicKeyPem ||
      fingerprint(derivedPublicKeyPem) !== entry.publicKeyFingerprint
    ) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_PRIVATE_KEY_MISMATCH: stored private key does not match public metadata",
      );
    }
    this.privateKeys.set(entry.keyId, privateKey);
    return privateKey;
  }

  private createStoredKey(
    keyVersion: number,
    createdAt: string,
  ): WrappedSigningKeyEntry {
    const generated = generateKeyPairSync(ALGORITHM);
    const publicKeyPem = generated.publicKey
      .export({ format: "pem", type: "spki" })
      .toString();
    const privateKeyPem = Buffer.from(
      generated.privateKey
        .export({
          format: "pem",
          type: "pkcs8",
        })
        .toString(),
      "utf8",
    );
    const publicKeyFingerprint = fingerprint(publicKeyPem);
    const ciphertext = this.safeStorage.encryptString(
      privateKeyPem.toString("utf8"),
    );
    this.privateKeys.set(
      keyIdForFingerprint(publicKeyFingerprint),
      generated.privateKey,
    );
    privateKeyPem.fill(0);
    return {
      keyId: keyIdForFingerprint(publicKeyFingerprint),
      keyVersion,
      algorithm: ALGORITHM,
      publicKeyPem,
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
      this.validateStore(this.store);
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
      this.validateStore(this.store);
      // Fail closed during migration if the legacy private key does not match its public key.
      this.privateKeyFor(entry);
      this.persistStore(this.store);
      return this.store;
    }
    const candidate = parsed as Partial<WrappedSigningKeyStore>;
    if (
      candidate.provider !== "electron-safe-storage" ||
      candidate.version !== STORE_FILE_VERSION ||
      typeof candidate.activeKeyId !== "string" ||
      !Array.isArray(candidate.keys) ||
      candidate.keys.length === 0
    ) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_INVALID: stored signing key metadata is invalid",
      );
    }
    const store = candidate as WrappedSigningKeyStore;
    this.validateStore(store);
    this.store = store;
    this.activeEntry(this.store);
    return this.store;
  }

  private validateStore(store: WrappedSigningKeyStore): void {
    const ids = new Set<string>();
    const fingerprints = new Set<string>();
    const versions = new Set<number>();
    let activeCount = 0;
    for (const entry of store.keys) {
      if (
        typeof entry.keyId !== "string" ||
        !Number.isInteger(entry.keyVersion) ||
        entry.keyVersion < 1 ||
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
      let derivedPublicKeyPem: string;
      try {
        const publicKey = createPublicKey(entry.publicKeyPem);
        if (publicKey.asymmetricKeyType !== ALGORITHM)
          throw new Error("wrong algorithm");
        derivedPublicKeyPem = publicKey
          .export({ format: "pem", type: "spki" })
          .toString();
      } catch (error) {
        throw new Error(
          "ELITE_EXPORT_SIGNING_KEY_INVALID: stored public key is invalid",
          { cause: error },
        );
      }
      const expectedFingerprint = fingerprint(derivedPublicKeyPem);
      if (
        entry.publicKeyPem !== derivedPublicKeyPem ||
        entry.publicKeyFingerprint !== expectedFingerprint ||
        entry.keyId !== keyIdForFingerprint(expectedFingerprint)
      ) {
        throw new Error(
          "ELITE_EXPORT_SIGNING_KEY_INVALID: public key fingerprint or key ID does not match",
        );
      }
      if (
        ids.has(entry.keyId) ||
        fingerprints.has(entry.publicKeyFingerprint) ||
        versions.has(entry.keyVersion)
      ) {
        throw new Error(
          "ELITE_EXPORT_SIGNING_KEY_INVALID: duplicate signing key identity or version",
        );
      }
      ids.add(entry.keyId);
      fingerprints.add(entry.publicKeyFingerprint);
      versions.add(entry.keyVersion);
      if (entry.status === "active") {
        activeCount += 1;
        if (entry.retiredAt !== null || entry.revokedAt !== null) {
          throw new Error(
            "ELITE_EXPORT_SIGNING_KEY_INVALID: active key has retirement or revocation metadata",
          );
        }
      } else if (entry.status === "retired") {
        if (typeof entry.retiredAt !== "string" || entry.revokedAt !== null) {
          throw new Error(
            "ELITE_EXPORT_SIGNING_KEY_INVALID: retired key has invalid lifecycle metadata",
          );
        }
      } else if (typeof entry.revokedAt !== "string") {
        throw new Error(
          "ELITE_EXPORT_SIGNING_KEY_INVALID: revoked key has invalid lifecycle metadata",
        );
      }
    }
    if (
      activeCount !== 1 ||
      !store.keys.some(
        (entry) =>
          entry.keyId === store.activeKeyId && entry.status === "active",
      )
    ) {
      throw new Error(
        "ELITE_EXPORT_SIGNING_KEY_INVALID: signing key store must contain exactly one active key",
      );
    }
  }

  private persistStore(store: WrappedSigningKeyStore): void {
    atomicWrite(this.keyFilePath, `${JSON.stringify(store)}\n`);
  }
}
