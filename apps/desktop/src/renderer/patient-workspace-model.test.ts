import { describe, expect, it } from "vitest";
import type { PatientRelatedPersonLinkSummary } from "@elite/auth";
import type { DuplicateCandidate, Patient } from "@elite/contracts";
import {
  buildRelatedPersonInputs,
  createNewRelatedPersonForm,
  getDuplicateReviewState,
  getPatientWorkspaceCapabilities,
  getRelatedPersonFormState,
} from "./patient-workspace-model.js";

const patientFixture: Patient = {
  id: "patient-1",
  patientId: "EL-00001",
  nameEn: "Mariam Hassan",
  nameAr: "مريم حسن",
  dob: "2015-08-20",
  sex: "female",
  phone: "+201000000001",
  relatedPersonIds: ["related-1"],
  registrationMode: "full",
  completenessStatus: "complete",
  status: "active",
  createdAt: "2026-01-01T08:00:00.000Z",
  createdByUserId: "user-1",
  updatedAt: "2026-01-01T08:00:00.000Z",
  updatedByUserId: "user-1",
  version: 1,
  schemaVersion: 1,
};

const candidateFixture: DuplicateCandidate = {
  patient: patientFixture,
  score: 82,
  severity: "high",
  signals: [
    { code: "phone", weight: 45 },
    { code: "name-en", weight: 37 },
  ],
};

const linkFixture: PatientRelatedPersonLinkSummary = {
  patientId: "EL-00001",
  relatedPersonId: "related-1",
  relationshipRole: "guardian",
  isPrimary: true,
  consentAuthority: "consent",
  verificationStatus: "verified",
  relatedPerson: {
    id: "related-1",
    displayNameEn: "Hassan Ali",
    displayNameAr: "حسن علي",
    relationship: "Father",
    phoneNumbers: ["+201000000002"],
    isGuardian: true,
    isAuthorizedToConsent: true,
    isAuthorizedToContact: true,
    verificationStatus: "verified",
    version: 2,
    createdAt: "2026-01-01T08:00:00.000Z",
    updatedAt: "2026-01-01T08:00:00.000Z",
  },
};

describe("PatientWorkspace decision model", () => {
  it("maps capabilities to explicit patient-workspace controls", () => {
    expect(getPatientWorkspaceCapabilities([])).toEqual({
      canEditPatient: false,
      canArchivePatient: false,
      canReadClinical: false,
      canWriteClinical: false,
      canManageRelatedPersons: false,
      canManageMergeReview: false,
    });

    expect(
      getPatientWorkspaceCapabilities([
        "patient.write",
        "patient.archive",
        "patient.merge",
        "clinical.read",
        "clinical.write",
      ]),
    ).toEqual({
      canEditPatient: true,
      canArchivePatient: true,
      canReadClinical: true,
      canWriteClinical: true,
      canManageRelatedPersons: true,
      canManageMergeReview: true,
    });
  });

  it("shows duplicate review only for a pending operation and requires an audit reason", () => {
    expect(
      getDuplicateReviewState({
        candidates: [candidateFixture],
        hasPendingInput: true,
        hasPendingEdit: false,
        decisionReason: "  ",
        isBusy: false,
      }),
    ).toMatchObject({ visible: true, mode: "create", canConfirm: false });

    expect(
      getDuplicateReviewState({
        candidates: [candidateFixture],
        hasPendingInput: true,
        hasPendingEdit: false,
        decisionReason: "Confirmed separate child record",
        isBusy: false,
      }),
    ).toMatchObject({ visible: true, mode: "create", canConfirm: true });

    expect(
      getDuplicateReviewState({
        candidates: [candidateFixture],
        hasPendingInput: true,
        hasPendingEdit: false,
        decisionReason: "Confirmed separate child record",
        isBusy: true,
      }).canConfirm,
    ).toBe(false);
  });

  it("gives pending profile edits precedence over pending registration", () => {
    expect(
      getDuplicateReviewState({
        candidates: [candidateFixture],
        hasPendingInput: true,
        hasPendingEdit: true,
        decisionReason: "Reviewed profile change",
        isBusy: false,
      }),
    ).toMatchObject({ visible: true, mode: "update", canConfirm: true });

    expect(
      getDuplicateReviewState({
        candidates: [],
        hasPendingInput: true,
        hasPendingEdit: false,
        decisionReason: "Reviewed",
        isBusy: false,
      }).visible,
    ).toBe(false);
  });

  it("defaults a new related person to guardian and consent-authorized state", () => {
    expect(createNewRelatedPersonForm()).toMatchObject({
      isGuardian: true,
      isAuthorizedToConsent: true,
      isAuthorizedToContact: true,
      relationshipRole: "guardian",
      consentAuthority: "consent",
      verificationStatus: "unverified",
    });
  });

  it("round-trips an existing guardian link and trims optional Arabic input", () => {
    const form = getRelatedPersonFormState(linkFixture);
    expect(form).toEqual({
      displayNameEn: "Hassan Ali",
      displayNameAr: "حسن علي",
      relationship: "Father",
      phone: "+201000000002",
      isGuardian: true,
      isAuthorizedToConsent: true,
      isAuthorizedToContact: true,
      verificationStatus: "verified",
      relationshipRole: "guardian",
      isPrimary: true,
      consentAuthority: "consent",
    });

    const inputs = buildRelatedPersonInputs({
      ...form,
      displayNameAr: "  ولي الأمر  ",
    });
    expect(inputs.personInput.displayNameAr).toBe("ولي الأمر");
    expect(inputs.personInput.phoneNumbers).toEqual(["+201000000002"]);
    expect(inputs.linkInput).toEqual({
      relationshipRole: "guardian",
      isPrimary: true,
      consentAuthority: "consent",
      verificationStatus: "verified",
    });
  });
});
