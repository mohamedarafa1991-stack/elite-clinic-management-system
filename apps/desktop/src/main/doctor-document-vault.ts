import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import type { DoctorDocumentVault } from "@elite/auth";

function assertSafeRelativePath(root: string, relativePath: string): string {
  if (
    isAbsolute(relativePath) ||
    basename(relativePath) !== relativePath.split(/[\\/]/).pop()
  ) {
    throw new Error(
      "ELITE_DOCTOR_VAULT_PATH_INVALID: vault path must be relative",
    );
  }
  const resolvedRoot = resolve(root);
  const resolved = resolve(root, relativePath);
  const escaped = relative(resolvedRoot, resolved).startsWith("..");
  if (escaped || resolved === resolvedRoot) {
    throw new Error(
      "ELITE_DOCTOR_VAULT_PATH_INVALID: vault path escapes the private vault",
    );
  }
  return resolved;
}

export class FileSystemDoctorDocumentVault implements DoctorDocumentVault {
  public constructor(private readonly root: string) {}

  public async write(relativePath: string, content: Buffer): Promise<void> {
    const destination = assertSafeRelativePath(this.root, relativePath);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temporary, content, { mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new Error(
        "ELITE_DOCTOR_VAULT_WRITE_FAILED: document could not be stored",
        {
          cause: error,
        },
      );
    }
  }

  public read(relativePath: string): Promise<Buffer> {
    return readFile(assertSafeRelativePath(this.root, relativePath));
  }

  public async remove(relativePath: string): Promise<void> {
    await rm(assertSafeRelativePath(this.root, relativePath), { force: true });
  }
}
