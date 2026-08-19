import type {
  PatientRelatedPersonLinkSummary,
  RelatedPersonInput,
  RelatedPersonLinkInput,
} from "@elite/auth";
import type { DuplicateCandidate } from "@elite/contracts";

export interface RelatedPersonFormState {
  displayNameEn: string;
  displayNameAr: string;
  relationship: string;
  phone: string;
  isGuardian: boolean;
  isAuthorizedToConsent: boolean;
  isAuthorizedToContact: boolean;
  verificationStatus: "unverified" | "verified";
  relationshipRole: string;
  isPrimary: boolean;
  consentAuthority: "none" | "inform" | "consent";
}

export interface PatientWorkspaceCapabilities {
  canEditPatient: boolean;
  canArchivePatient: boolean;
  canReadClinical: boolean;
  canWriteClinical: boolean;
  canManageRelatedPersons: boolean;
  canManageMergeReview: boolean;
}

export interface DuplicateReviewState {
  visible: boolean;
  mode: "create" | "update" | null;
  candidates: readonly DuplicateCandidate[];
  canConfirm: boolean;
}

export interface RelatedPersonInputs {
  personInput: RelatedPersonInput;
  linkInput: RelatedPersonLinkInput;
}

export function getPatientWorkspaceCapabilities(
  capabilities: readonly string[],
): PatientWorkspaceCapabilities {
  const has = (capability: string): boolean =>
    capabilities.includes(capability);
  return {
    canEditPatient: has("patient.write"),
    canArchivePatient: has("patient.archive"),
    canReadClinical: has("clinical.read"),
    canWriteClinical: has("clinical.write"),
    canManageRelatedPersons: has("patient.write"),
    canManageMergeReview: has("patient.merge"),
  };
}

export function getDuplicateReviewState({
  candidates,
  hasPendingInput,
  hasPendingEdit,
  decisionReason,
  isBusy,
}: {
  candidates: readonly DuplicateCandidate[];
  hasPendingInput: boolean;
  hasPendingEdit: boolean;
  decisionReason: string;
  isBusy: boolean;
}): DuplicateReviewState {
  const mode = hasPendingEdit ? "update" : hasPendingInput ? "create" : null;
  const visible = candidates.length > 0 && mode !== null;
  return {
    visible,
    mode,
    candidates,
    canConfirm: visible && decisionReason.trim().length >= 3 && !isBusy,
  };
}

export function createNewRelatedPersonForm(): RelatedPersonFormState {
  return {
    displayNameEn: "",
    displayNameAr: "",
    relationship: "",
    phone: "",
    isGuardian: true,
    isAuthorizedToConsent: true,
    isAuthorizedToContact: true,
    verificationStatus: "unverified",
    relationshipRole: "guardian",
    isPrimary: false,
    consentAuthority: "consent",
  };
}

export function getRelatedPersonFormState(
  link: PatientRelatedPersonLinkSummary,
): RelatedPersonFormState {
  return {
    displayNameEn: link.relatedPerson.displayNameEn,
    displayNameAr: link.relatedPerson.displayNameAr ?? "",
    relationship: link.relatedPerson.relationship,
    phone: link.relatedPerson.phoneNumbers[0] ?? "",
    isGuardian: link.relatedPerson.isGuardian,
    isAuthorizedToConsent: link.relatedPerson.isAuthorizedToConsent,
    isAuthorizedToContact: link.relatedPerson.isAuthorizedToContact,
    verificationStatus: link.verificationStatus,
    relationshipRole: link.relationshipRole,
    isPrimary: link.isPrimary,
    consentAuthority: link.consentAuthority,
  };
}

export function buildRelatedPersonInputs(
  form: RelatedPersonFormState,
): RelatedPersonInputs {
  const personInput: RelatedPersonInput = {
    displayNameEn: form.displayNameEn,
    ...(form.displayNameAr.trim()
      ? { displayNameAr: form.displayNameAr.trim() }
      : {}),
    relationship: form.relationship,
    phoneNumbers: [form.phone],
    isGuardian: form.isGuardian,
    isAuthorizedToConsent: form.isAuthorizedToConsent,
    isAuthorizedToContact: form.isAuthorizedToContact,
    verificationStatus: form.verificationStatus,
  };
  const linkInput: RelatedPersonLinkInput = {
    relationshipRole: form.relationshipRole,
    isPrimary: form.isPrimary,
    consentAuthority: form.consentAuthority,
    verificationStatus: form.verificationStatus,
  };
  return { personInput, linkInput };
}
