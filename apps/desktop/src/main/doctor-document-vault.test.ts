import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileSystemDoctorDocumentVault } from "./doctor-document-vault.js";

describe("FileSystemDoctorDocumentVault", () => {
  it("stores and removes document ciphertext inside the private vault", async () => {
    const root = await mkdtemp(join(tmpdir(), "elite-doctor-vault-"));
    try {
      const vault = new FileSystemDoctorDocumentVault(root);
      const ciphertext = Buffer.from("synthetic encrypted document");
      await vault.write("doctor-documents/document-01.bin", ciphertext);
      expect(await vault.read("doctor-documents/document-01.bin")).toEqual(
        ciphertext,
      );
      expect(
        await readFile(join(root, "doctor-documents/document-01.bin")),
      ).toEqual(ciphertext);
      await vault.remove("doctor-documents/document-01.bin");
      await expect(
        vault.read("doctor-documents/document-01.bin"),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects absolute and traversal paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "elite-doctor-vault-path-"));
    try {
      const vault = new FileSystemDoctorDocumentVault(root);
      await expect(
        vault.write("../outside.bin", Buffer.from("x")),
      ).rejects.toThrow("ELITE_DOCTOR_VAULT_PATH_INVALID");
      expect(() => vault.read(join(root, "outside.bin"))).toThrow(
        "ELITE_DOCTOR_VAULT_PATH_INVALID",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
