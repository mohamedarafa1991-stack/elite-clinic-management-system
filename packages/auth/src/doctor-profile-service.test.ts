import { describe, expect, it } from "vitest";
import { openDatabase } from "@elite/database";
import { roleCapabilities } from "@elite/contracts";
import { AuthService, type SessionContext } from "./index.js";
import {
  DoctorProfileService,
  type DoctorDocumentVault,
} from "./doctor-profile-service.js";

const bootstrapInput = {
  admins: [
    {
      username: "admin.doctor.profile.primary",
      password: "Synthetic-Doctor-Profile-Primary-2026!",
      displayNameEn: "Synthetic Doctor Profile Admin",
    },
    {
      username: "admin.doctor.profile.backup",
      password: "Synthetic-Doctor-Profile-Backup-2026!",
      displayNameEn: "Synthetic Doctor Profile Backup",
    },
  ],
  hubDevice: {
    friendlyName: "Synthetic Doctor Profile Hub",
    appVersion: "0.1.0-test",
  },
};

class MemoryVault implements DoctorDocumentVault {
  readonly files = new Map<string, Buffer>();
  write(path: string, content: Buffer): void {
    this.files.set(path, Buffer.from(content));
  }
  read(path: string): Buffer {
    const value = this.files.get(path);
    if (!value) throw new Error("missing file");
    return Buffer.from(value);
  }
  remove(path: string): void {
    this.files.delete(path);
  }
}

function insertUser(
  database: ReturnType<typeof openDatabase>,
  input: {
    id: string;
    username: string;
    displayName: string;
    role: "doctor" | "nurse";
  },
): void {
  const timestamp = "2030-01-01T00:00:00.000Z";
  database.raw
    .prepare(
      `INSERT INTO users (id, username, display_name_en, display_name_ar, role, capabilities_json, is_clinical_approver, is_active, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, '[]', 0, 1, ?, ?)`,
    )
    .run(
      input.id,
      input.username,
      input.displayName,
      input.role,
      timestamp,
      timestamp,
    );
}

function contextFor(
  base: SessionContext,
  userId: string,
  role: "doctor" | "nurse",
): SessionContext {
  return {
    ...base,
    userId,
    username: `${role}.synthetic`,
    role,
    capabilities: roleCapabilities[role],
  };
}

describe("DoctorProfileService", () => {
  it("supports owner/admin profile edits and encrypted versioned documents", async () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    const vault = new MemoryVault();
    try {
      const auth = new AuthService(database);
      const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
      const admin = await auth.login({
        username: bootstrapInput.admins[0]!.username,
        password: bootstrapInput.admins[0]!.password,
        deviceId: bootstrap.hubDeviceId,
      });
      const doctorId = "synthetic-doctor-profile";
      const nurseId = "synthetic-nurse-profile";
      insertUser(database, {
        id: doctorId,
        username: "synthetic.doctor.profile",
        displayName: "Synthetic Doctor Profile",
        role: "doctor",
      });
      insertUser(database, {
        id: nurseId,
        username: "synthetic.nurse.profile",
        displayName: "Synthetic Nurse Profile",
        role: "nurse",
      });
      const doctor = contextFor(admin, doctorId, "doctor");
      const nurse = contextFor(admin, nurseId, "nurse");
      const service = new DoctorProfileService(
        database,
        vault,
        Buffer.alloc(32, 9),
        () => "2030-01-02T00:00:00.000Z",
      );

      const initial = service.getProfile(admin, doctorId);
      expect(initial.licenseVerificationStatus).toBe("unverified");
      const editedByDoctor = service.updateProfile(doctor, {
        doctorId,
        displayNameEn: "Synthetic Consultant Doctor",
        professionalRegistrationNumber: "EG-SYNTH-123",
        qualifications: "Synthetic medical degree",
        biography: "Synthetic profile only",
        languages: ["English", "Arabic"],
        email: "doctor@example.test",
      });
      expect(editedByDoctor.displayNameEn).toBe("Synthetic Consultant Doctor");
      expect(() =>
        service.updateProfile(doctor, {
          doctorId,
          licenseVerificationStatus: "verified",
        }),
      ).toThrow("ELITE_DOCTOR_PROFILE_ADMIN_FIELD");
      const editedByAdmin = service.updateProfile(admin, {
        doctorId,
        licenseVerificationStatus: "verified",
        specialtyIds: ["specialty-synthetic"],
        consultationFeeEgp: 500,
      });
      expect(editedByAdmin.licenseVerificationStatus).toBe("verified");
      expect(editedByAdmin.consultationFeeEgp).toBe(500);

      const first = await service.uploadDocument(doctor, {
        doctorId,
        documentType: "national-id",
        displayName: "Synthetic National ID",
        fileName: "synthetic-id.pdf",
        mimeType: "application/pdf",
        contentBase64: Buffer.from("synthetic national id").toString("base64"),
      });
      expect(first.version).toBe(1);
      expect(
        vault.files.get(`doctor-documents/${first.documentId}.bin`),
      ).not.toEqual(Buffer.from("synthetic national id"));
      expect(
        (await service.viewDocument(doctor, { documentId: first.documentId }))
          .contentBase64,
      ).toBe(Buffer.from("synthetic national id").toString("base64"));
      await expect(
        service.viewDocument(nurse, { documentId: first.documentId }),
      ).rejects.toThrow("ELITE_DOCTOR_DOCUMENT_FORBIDDEN");
      expect(service.listDocuments(nurse, doctorId)).toHaveLength(0);
      expect(service.listDocuments(admin, doctorId)).toHaveLength(1);

      const replacement = await service.uploadDocument(doctor, {
        doctorId,
        documentType: "national-id",
        displayName: "Synthetic National ID replacement",
        fileName: "synthetic-id-v2.pdf",
        mimeType: "application/pdf",
        contentBase64: Buffer.from("replacement national id").toString(
          "base64",
        ),
        replacesDocumentId: first.documentId,
      });
      expect(replacement.familyId).toBe(first.familyId);
      expect(replacement.version).toBe(2);
      expect(service.listDocuments(admin, doctorId, true)).toHaveLength(2);
      expect(
        service.archiveDocument(admin, replacement.documentId).status,
      ).toBe("archived");
    } finally {
      database.close();
    }
  });

  it("rejects tampered encrypted files and unsupported payload sizes", async () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    const vault = new MemoryVault();
    try {
      const auth = new AuthService(database);
      const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
      const admin = await auth.login({
        username: bootstrapInput.admins[0]!.username,
        password: bootstrapInput.admins[0]!.password,
        deviceId: bootstrap.hubDeviceId,
      });
      const doctorId = "synthetic-doctor-tamper";
      insertUser(database, {
        id: doctorId,
        username: "synthetic.doctor.tamper",
        displayName: "Synthetic Tamper Doctor",
        role: "doctor",
      });
      const doctor = contextFor(admin, doctorId, "doctor");
      const service = new DoctorProfileService(
        database,
        vault,
        Buffer.alloc(32, 4),
      );
      const document = await service.uploadDocument(doctor, {
        doctorId,
        documentType: "cv",
        displayName: "Synthetic CV",
        fileName: "synthetic-cv.pdf",
        mimeType: "application/pdf",
        contentBase64: Buffer.from("tamper target").toString("base64"),
      });
      const path = `doctor-documents/${document.documentId}.bin`;
      vault.files.set(
        path,
        Buffer.from(
          Buffer.from(vault.files.get(path)!).map((byte) => byte ^ 0xff),
        ),
      );
      await expect(
        service.viewDocument(doctor, { documentId: document.documentId }),
      ).rejects.toThrow();
      await expect(
        service.uploadDocument(doctor, {
          doctorId,
          documentType: "cv",
          displayName: "Too large",
          fileName: "too-large.pdf",
          mimeType: "application/pdf",
          contentBase64: "A".repeat(28_000_000),
        }),
      ).rejects.toThrow();
    } finally {
      database.close();
    }
  });
});
