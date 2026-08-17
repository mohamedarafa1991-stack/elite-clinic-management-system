import { createHash } from "node:crypto";
import {
  fhirProfileBundleSchema,
  type FhirProfileBundle,
} from "@elite/contracts";

export const BUILTIN_FHIR_PROFILE_BUNDLES: readonly FhirProfileBundle[] = [
  fhirProfileBundleSchema.parse({
    id: "elite-clinic-r4",
    displayName: "Elite Clinic Patient Record Document R4",
    jurisdiction: "EG",
    version: "1.0.0",
    fhirVersion: "R4",
    publisher: "Elite Clinic Management System",
    sourceUri: "urn:elite-clinic:profile-bundle:elite-clinic-r4",
    profiles: [
      {
        resourceType: "Bundle",
        canonicalUrl: "urn:elite-clinic:StructureDefinition:document-bundle-r4",
        requiredPaths: ["type", "timestamp", "identifier", "entry"],
        fixedValues: { type: "document" },
      },
      {
        resourceType: "Patient",
        canonicalUrl: "urn:elite-clinic:StructureDefinition:patient-r4",
        requiredPaths: ["id"],
      },
      {
        resourceType: "ClinicalImpression",
        canonicalUrl:
          "urn:elite-clinic:StructureDefinition:clinical-impression-r4",
        requiredPaths: ["id", "subject", "date"],
      },
      {
        resourceType: "FamilyMemberHistory",
        canonicalUrl:
          "urn:elite-clinic:StructureDefinition:family-member-history-r4",
        requiredPaths: ["id", "patient", "name"],
      },
    ],
  }),
];

export function canonicalizeProfileBundle(bundle: FhirProfileBundle): string {
  return JSON.stringify(fhirProfileBundleSchema.parse(bundle));
}

export function hashFhirProfileBundle(bundle: FhirProfileBundle): string {
  return createHash("sha256")
    .update(canonicalizeProfileBundle(bundle), "utf8")
    .digest("hex");
}

export function getBuiltinFhirProfileBundle(
  id: string,
): FhirProfileBundle | undefined {
  return BUILTIN_FHIR_PROFILE_BUNDLES.find((bundle) => bundle.id === id);
}
