import { describe, expect, it } from "vitest";
import { openDatabase } from "@elite/database";
import { AuthService } from "./index.js";
import { PatientIdentityService } from "./patient-service.js";

const bootstrapInput = {
  admins: [
    {
      username: "admin.identity.primary",
      password: "Synthetic-Identity-Primary-2026!",
      displayNameEn: "Synthetic Identity Primary",
    },
    {
      username: "admin.identity.backup",
      password: "Synthetic-Identity-Backup-2026!",
      displayNameEn: "Synthetic Identity Backup",
    },
  ],
  hubDevice: {
    friendlyName: "Synthetic Identity Hub",
    appVersion: "0.1.0-test",
  },
};

async function createFixture() {
  const database = openDatabase({ filename: ":memory:", mode: "test" });
  const auth = new AuthService(database);
  const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
  const context = await auth.login({
    username: bootstrapInput.admins[0]!.username,
    password: bootstrapInput.admins[0]!.password,
    deviceId: bootstrap.hubDeviceId,
  });
  return { database, context, service: new PatientIdentityService(database) };
}

describe("Step 4 patient identity service", () => {
  it("allocates sequential IDs and models a shared guardian contact", async () => {
    const fixture = await createFixture();
    try {
      const guardian = fixture.service.createRelatedPerson(fixture.context, {
        displayNameEn: "Synthetic Guardian",
        relationship: "parent",
        phoneNumbers: ["+201000000001"],
        isGuardian: true,
        isAuthorizedToConsent: true,
        isAuthorizedToContact: true,
        preferredContactMethod: "phone",
      });
      const first = fixture.service.registerPatient(fixture.context, {
        registrationMode: "full",
        nameEn: "Synthetic Child One",
        dob: "2018-05-01",
        sex: "female",
        phone: "+201000000001",
        relatedPersons: [
          {
            relatedPersonId: guardian.id,
            relationshipRole: "parent",
            isPrimary: true,
            consentAuthority: "consent",
          },
        ],
      });
      const second = fixture.service.registerPatient(
        fixture.context,
        {
          registrationMode: "full",
          nameEn: "Synthetic Child Two",
          dob: "2020-06-02",
          sex: "male",
          phone: "+201000000001",
          relatedPersons: [
            {
              relatedPersonId: guardian.id,
              relationshipRole: "parent",
              isPrimary: true,
              consentAuthority: "consent",
            },
          ],
        },
        "Synthetic siblings share a guardian phone",
      );

      expect(first.patient.patientId).toBe("EL-00001");
      expect(second.patient.patientId).toBe("EL-00002");
      expect(
        second.duplicateCandidates[0]?.signals.map((signal) => signal.code),
      ).toContain("phone");
      expect(
        fixture.service.listRelatedPersons(
          fixture.context,
          first.patient.patientId,
        ),
      ).toHaveLength(1);
      expect(
        fixture.service.listRelatedPersons(
          fixture.context,
          second.patient.patientId,
        ),
      ).toHaveLength(1);
    } finally {
      fixture.database.close();
    }
  });

  it("requires explicit duplicate review, then supports archive and unarchive", async () => {
    const fixture = await createFixture();
    try {
      fixture.service.registerPatient(fixture.context, {
        registrationMode: "quick",
        nameEn: "Synthetic Archive Patient",
        phone: "+201000000002",
      });
      expect(() =>
        fixture.service.registerPatient(fixture.context, {
          registrationMode: "quick",
          nameEn: "Synthetic Archive Patient",
          phone: "+201000000002",
        }),
      ).toThrow("ELITE_PATIENT_DUPLICATE_REVIEW_REQUIRED");

      fixture.service.archivePatient(fixture.context, {
        patientId: "EL-00001",
        reason: "Synthetic archive workflow test",
      });
      expect(fixture.service.searchPatients(fixture.context)).toHaveLength(0);
      fixture.service.unarchivePatient(
        fixture.context,
        "EL-00001",
        "Synthetic restore workflow test",
      );
      expect(fixture.service.searchPatients(fixture.context)).toHaveLength(1);
    } finally {
      fixture.database.close();
    }
  });

  it("preserves the source record through an approved transactional merge", async () => {
    const fixture = await createFixture();
    try {
      const first = fixture.service.registerPatient(fixture.context, {
        registrationMode: "full",
        nameEn: "Synthetic Merge Target",
        phone: "+201000000003",
      });
      const second = fixture.service.registerPatient(
        fixture.context,
        {
          registrationMode: "full",
          nameEn: "Synthetic Merge Source",
          phone: "+201000000004",
        },
        "Synthetic duplicate review test",
      );
      const mergeCase = fixture.service.requestMerge(fixture.context, {
        sourcePatientId: second.patient.patientId,
        targetPatientId: first.patient.patientId,
        reason: "Synthetic controlled merge test",
        fieldDecisions: { nameEn: "target", phone: "target" },
      });
      expect(mergeCase.status).toBe("pending");
      fixture.service.reviewMergeCase(
        fixture.context,
        mergeCase.id,
        "approve",
        "Synthetic Admin approval",
      );
      const executed = fixture.service.executeMerge(
        fixture.context,
        mergeCase.id,
      );
      expect(executed.status).toBe("executed");
      expect(
        fixture.service.getPatient(fixture.context, second.patient.patientId)
          .status,
      ).toBe("merged");
      expect(
        fixture.service.getPatient(fixture.context, first.patient.patientId)
          .status,
      ).toBe("active");
    } finally {
      fixture.database.close();
    }
  });
});

it("promotes a quick record to full registration and rejects stale profile edits", async () => {
  const fixture = await createFixture();
  try {
    const created = fixture.service.registerPatient(fixture.context, {
      registrationMode: "quick",
      nameEn: "Synthetic Profile Patient",
      phone: "+201000000005",
    });
    const updated = fixture.service.updatePatient(
      fixture.context,
      created.patient.patientId,
      {
        registrationMode: "full",
        nameEn: "Synthetic Profile Patient Updated",
        nameAr: "مريض تجريبي",
        dob: "1990-02-03",
        sex: "female",
        phone: "+201000000005",
        nationalId: "SYNTHETIC-ID-005",
      },
      created.patient.version,
    );
    expect(updated.registrationMode).toBe("full");
    expect(updated.completenessStatus).toBe("complete");
    expect(updated.version).toBe(2);
    expect(() =>
      fixture.service.updatePatient(
        fixture.context,
        created.patient.patientId,
        {
          registrationMode: "full",
          nameEn: "Stale Synthetic Edit",
          phone: "+201000000005",
        },
        created.patient.version,
      ),
    ).toThrow("ELITE_PATIENT_VERSION_CONFLICT");
  } finally {
    fixture.database.close();
  }
});

it("edits a related person and manages guardian-link metadata safely", async () => {
  const fixture = await createFixture();
  try {
    const patient = fixture.service.registerPatient(fixture.context, {
      registrationMode: "full",
      nameEn: "Synthetic Guardian Link Patient",
      phone: "+201000000006",
    });
    const relatedPerson = fixture.service.createRelatedPerson(fixture.context, {
      displayNameEn: "Synthetic Guardian One",
      relationship: "parent",
      phoneNumbers: ["+201000000007"],
      isGuardian: true,
      isAuthorizedToConsent: true,
      isAuthorizedToContact: true,
      verificationStatus: "unverified",
    });
    const linked = fixture.service.linkRelatedPerson(
      fixture.context,
      patient.patient.patientId,
      relatedPerson.id,
      {
        relationshipRole: "mother",
        isPrimary: true,
        consentAuthority: "consent",
        verificationStatus: "verified",
      },
    );
    expect(linked.relatedPersonId).toBe(relatedPerson.id);
    expect(linked.isPrimary).toBe(true);
    expect(linked.consentAuthority).toBe("consent");
    expect(linked.verificationStatus).toBe("verified");

    const editedPerson = fixture.service.updateRelatedPerson(
      fixture.context,
      relatedPerson.id,
      {
        displayNameEn: "Synthetic Guardian One Updated",
        relationship: "parent",
        phoneNumbers: ["+201000000008"],
        isGuardian: true,
        isAuthorizedToConsent: true,
        isAuthorizedToContact: true,
        verificationStatus: "verified",
      },
      relatedPerson.version,
    );
    expect(editedPerson.displayNameEn).toBe("Synthetic Guardian One Updated");
    expect(editedPerson.version).toBe(2);

    const updatedLink = fixture.service.updatePatientRelatedLink(
      fixture.context,
      patient.patient.patientId,
      relatedPerson.id,
      {
        relationshipRole: "legal guardian",
        isPrimary: false,
        consentAuthority: "inform",
        verificationStatus: "verified",
      },
    );
    expect(updatedLink.relationshipRole).toBe("legal guardian");
    expect(updatedLink.isPrimary).toBe(false);
    expect(updatedLink.consentAuthority).toBe("inform");

    expect(
      fixture.service.listPatientRelatedLinks(
        fixture.context,
        patient.patient.patientId,
      ),
    ).toHaveLength(1);
    fixture.service.unlinkRelatedPerson(
      fixture.context,
      patient.patient.patientId,
      relatedPerson.id,
      "Synthetic unlink workflow",
    );
    expect(
      fixture.service.listPatientRelatedLinks(
        fixture.context,
        patient.patient.patientId,
      ),
    ).toHaveLength(0);
    expect(() =>
      fixture.service.updateRelatedPerson(
        fixture.context,
        relatedPerson.id,
        {
          displayNameEn: "Stale Guardian Edit",
          relationship: "parent",
          phoneNumbers: ["+201000000009"],
          isGuardian: true,
          isAuthorizedToConsent: true,
          isAuthorizedToContact: true,
          verificationStatus: "verified",
        },
        relatedPerson.version,
      ),
    ).toThrow("ELITE_RELATED_PERSON_VERSION_CONFLICT");
  } finally {
    fixture.database.close();
  }
});

it("rejects self-merges and records Admin review decisions", async () => {
  const fixture = await createFixture();
  try {
    const source = fixture.service.registerPatient(fixture.context, {
      registrationMode: "full",
      nameEn: "Synthetic Merge Source",
      phone: "+201000000010",
    });
    const target = fixture.service.registerPatient(fixture.context, {
      registrationMode: "full",
      nameEn: "Synthetic Merge Target",
      phone: "+201000000011",
    });
    expect(() =>
      fixture.service.requestMerge(fixture.context, {
        sourcePatientId: source.patient.patientId,
        targetPatientId: source.patient.patientId,
        reason: "Invalid self merge",
        fieldDecisions: { nameEn: "source" },
      }),
    ).toThrow("ELITE_PATIENT_MERGE_SELF_FORBIDDEN");

    const pending = fixture.service.requestMerge(fixture.context, {
      sourcePatientId: source.patient.patientId,
      targetPatientId: target.patient.patientId,
      reason: "Synthetic duplicate review",
      fieldDecisions: { nameEn: "source", phone: "target" },
    });
    expect(fixture.service.listMergeCases(fixture.context)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: pending.id, status: "pending" }),
      ]),
    );
    const rejected = fixture.service.reviewMergeCase(
      fixture.context,
      pending.id,
      "reject",
      "Synthetic rejection reason",
    );
    expect(rejected.status).toBe("rejected");
    expect(rejected.reviewReason).toBe("Synthetic rejection reason");
    expect(() =>
      fixture.service.reviewMergeCase(
        fixture.context,
        pending.id,
        "approve",
        "Second review should fail",
      ),
    ).toThrow("ELITE_PATIENT_MERGE_CASE_NOT_PENDING");
  } finally {
    fixture.database.close();
  }
});
