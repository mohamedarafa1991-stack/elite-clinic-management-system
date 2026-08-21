import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import type { EliteDatabase } from "@elite/database";
import { requireCapability, type SessionContext } from "@elite/auth";

const FORMAT_VERSION = 1;
const DATABASE_FILE = "elite-clinic.db";
const VAULT_DIRECTORY = "doctor-documents";
const MANIFEST_FILE = "manifest.json";

type BackupFile = {
  path: string;
  size: number;
  sha256: string;
};

type BackupManifest = {
  formatVersion: number;
  createdAt: string;
  operatorUserId: string;
  databaseMigrationVersion: number;
  files: readonly BackupFile[];
};

export type BackupResult = {
  packagePath: string;
  manifest: BackupManifest;
};

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function collectFiles(root: string, relative = ""): BackupFile[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = relative ? join(relative, entry.name) : entry.name;
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) return collectFiles(absolutePath, relativePath);
    const stats = statSync(absolutePath);
    return [
      { path: relativePath, size: stats.size, sha256: sha256(absolutePath) },
    ];
  });
}

function assertSafePackagePath(path: string): string {
  const resolved = resolve(path);
  if (resolved === resolve("/") || resolved.length < 4) {
    throw new Error("ELITE_BACKUP_DESTINATION_INVALID: destination is unsafe");
  }
  return resolved;
}

export class DesktopBackupRestoreService {
  public constructor(
    private readonly database: EliteDatabase,
    private readonly databasePath: string,
    private readonly vaultPath: string,
    private readonly releaseVersion: string,
  ) {}

  public createBackup(
    context: SessionContext,
    destinationPath: string,
  ): BackupResult {
    requireCapability(context, "backup.manage");
    const packagePath = assertSafePackagePath(destinationPath);
    if (existsSync(packagePath)) {
      throw new Error(
        "ELITE_BACKUP_DESTINATION_EXISTS: choose a new empty destination",
      );
    }
    mkdirSync(packagePath, { recursive: true });
    this.database.raw.pragma("wal_checkpoint(TRUNCATE)");
    const databaseTarget = join(packagePath, DATABASE_FILE);
    cpSync(this.databasePath, databaseTarget, { force: false });
    const vaultTarget = join(packagePath, VAULT_DIRECTORY);
    if (existsSync(this.vaultPath))
      cpSync(this.vaultPath, vaultTarget, { recursive: true });
    const migration = Number(
      (
        this.database.raw
          .prepare(
            "SELECT COALESCE(MAX(version), 0) AS version FROM migration_history",
          )
          .get() as { version: number }
      ).version,
    );
    const manifest: BackupManifest = {
      formatVersion: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      operatorUserId: context.userId,
      databaseMigrationVersion: migration,
      files: [
        ...collectFiles(packagePath).filter(
          (file) => file.path !== MANIFEST_FILE,
        ),
      ],
    };
    writeFileSync(
      join(packagePath, MANIFEST_FILE),
      JSON.stringify(
        {
          ...manifest,
          releaseVersion: this.releaseVersion,
        },
        null,
        2,
      ),
      { encoding: "utf8", flag: "wx" },
    );
    return { packagePath, manifest };
  }

  public restoreBackup(
    context: SessionContext,
    packagePath: string,
  ): BackupResult {
    requireCapability(context, "backup.manage");
    const source = assertSafePackagePath(packagePath);
    const manifestPath = join(source, MANIFEST_FILE);
    if (!existsSync(manifestPath))
      throw new Error("ELITE_BACKUP_MANIFEST_MISSING");
    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as BackupManifest;
    if (
      manifest.formatVersion !== FORMAT_VERSION ||
      !Array.isArray(manifest.files)
    ) {
      throw new Error("ELITE_BACKUP_MANIFEST_INVALID");
    }
    for (const file of manifest.files) {
      const filePath = join(source, file.path);
      if (
        !existsSync(filePath) ||
        statSync(filePath).size !== file.size ||
        sha256(filePath) !== file.sha256
      ) {
        throw new Error(`ELITE_BACKUP_CHECKSUM_MISMATCH: ${file.path}`);
      }
    }
    const databaseSource = join(source, DATABASE_FILE);
    if (!existsSync(databaseSource))
      throw new Error("ELITE_BACKUP_DATABASE_MISSING");
    this.database.raw.pragma("wal_checkpoint(TRUNCATE)");
    this.database.close();
    cpSync(databaseSource, this.databasePath, { force: true });
    const vaultSource = join(source, VAULT_DIRECTORY);
    rmSync(this.vaultPath, { recursive: true, force: true });
    if (existsSync(vaultSource))
      cpSync(vaultSource, this.vaultPath, { recursive: true });
    return { packagePath: source, manifest };
  }
}

export function defaultBackupPackageName(): string {
  return `elite-clinic-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

export function isBackupPackage(path: string): boolean {
  return basename(path).startsWith("elite-clinic-backup-");
}
