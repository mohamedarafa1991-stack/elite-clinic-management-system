import { describe, expect, it } from "vitest";
import {
  patientSchema,
  relatedPersonSchema,
  syncEventSchema,
} from "./index.js";

describe("Elite shared contracts", () => {
  it("accepts a patient whose phone is shared with a related person", () => {
    const relatedPerson = relatedPersonSchema.parse({
      id: "related-parent-01",
      displayNameEn: "Synthetic Parent",
      relationship: "parent",
      phoneNumbers: ["+201000000000"],
      isGuardian: true,
      isAuthorizedToConsent: true,
      isAuthorizedToContact: true,
      verificationStatus: "verified",
    });

    const patient = patientSchema.parse({
      id: "patient-internal-01",
      patientId: "EL-00001",
      nameEn: "Synthetic Child",
      dob: "2020-01-01",
      sex: "female",
      phone: "+201000000000",
      relatedPersonIds: [relatedPerson.id],
      registrationMode: "full",
      completenessStatus: "complete",
      status: "active",
      createdAt: "2026-01-01T10:00:00+00:00",
      createdByUserId: "admin-01",
      updatedAt: "2026-01-01T10:00:00+00:00",
      updatedByUserId: "admin-01",
      schemaVersion: 1,
    });

    expect(patient.patientId).toBe("EL-00001");
    expect(patient.phone).toBe(relatedPerson.phoneNumbers[0]);
  });

  it("requires a valid payload hash for synchronization events", () => {
    expect(() =>
      syncEventSchema.parse({
        id: "event-01",
        deviceId: "device-01",
        userId: "user-01",
        entityType: "patient",
        entityId: "patient-internal-01",
        baseVersion: 0,
        newVersion: 1,
        operation: "create",
        payloadHash: "not-a-sha256",
        occurredAt: "2026-01-01T10:00:00+00:00",
      }),
    ).toThrow();
  });
});
