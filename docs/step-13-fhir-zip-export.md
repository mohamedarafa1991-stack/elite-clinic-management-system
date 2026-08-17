# Step 13 — Validated and Revocable Signed Clinical Export Packages

## Overview

Step 13 extends Elite Clinic’s Step 12 signed patient-record exports with an **offline FHIR R4 structural validator**, a deterministic **signed ZIP archive**, configurable organization identifiers, export expiration, and administrator-controlled revocation. The implementation remains local-first: it does not call a remote FHIR server, terminology service, cloud API, or LAN service while creating or verifying an export.

The export remains based on an immutable encounter projection snapshot. The snapshot hash is carried into the payload and manifest, while the Ed25519 signature covers the canonical manifest and package metadata. The application therefore distinguishes the integrity of the historical record from the current operational status of a package.

## FHIR validation scope

The generated clinical export is a FHIR R4 `Bundle` with `type=document`. The validator checks the R4 base structural rules needed by the Elite Clinic document profile: Bundle metadata and entries, one Patient resource, resource IDs, supported resource types, date/dateTime formats, Patient gender codes, ClinicalImpression subject/date fields, FamilyMemberHistory patient/name fields, and references back to the Bundle Patient. It also checks the Elite Clinic extensions used to carry the snapshot hash, effective encounter version, and redaction policy.

> The validator is an **offline structural/profile validator**, not a claim that the package has passed an external national implementation guide, terminology server, or partner-specific conformance test. External implementation-guide validation can be added later by bundling the relevant StructureDefinitions and value sets with the application.

The validator records the FHIR version (`R4`), validator implementation version, profile identifiers, and structured issues in the manifest. An error-severity issue blocks ZIP creation. Warning-severity issues are retained for review but do not block packaging.

The resource references are based on the official FHIR R4 definitions for [Bundle][1], [Patient][2], [ClinicalImpression][3], and [FamilyMemberHistory][4].

## Signed ZIP layout

A ZIP package contains exactly four logical members. Member names are normalized to safe, flat UTF-8 filenames and the archive reader rejects absolute paths, backslash paths, `.` components, and `..` traversal components.

| Member                                       | Contents                                                                                           |                   Signed/integrity checked |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- | -----------------------------------------: |
| `{patientId}.fhir.json` or `{patientId}.pdf` | The redacted FHIR Bundle or signed PDF payload                                                     | Yes; SHA-256 `payloadHash` and member hash |
| `{patientId}.manifest.json`                  | Versioned manifest containing package, snapshot, organization, expiration, and validation metadata |         Yes through canonical signing data |
| `{patientId}.sig`                            | Base64 Ed25519 detached signature copied from the manifest                                         |               Checked against the manifest |
| `README.txt`                                 | Non-sensitive human-readable package instructions and status caveat                                |                        SHA-256 member hash |

The archive is built with fixed ZIP timestamps, fixed compression settings, deterministic member ordering, and normalized metadata. Verification does not rely only on raw archive-byte equality. It recomputes each logical member hash and the package-content hash, then verifies the Ed25519 signature over the canonical package descriptor.

The canonical descriptor contains the schema version, package type, package ID, snapshot identifiers and hashes, payload hash, signature algorithm, export format, redaction policy, export reason, creator, organization identifiers, expiration fields, FHIR validation metadata, member hashes, and package-content hash. The public key is retained in the manifest for independent verification but is not included in the signed descriptor, preserving compatibility with the detached Step 12 signing convention.

## Expiration

New packages default to a **30-day expiration**. An administrator can change the configured expiration duration in the organization settings panel, from 1 through 3650 days. The effective organization settings are copied into each new manifest, so later setting changes do not alter an existing package’s meaning.

Expiration is represented by a UTC ISO-8601 `expiresAt` timestamp and an `expirationPolicy` value. A package may remain cryptographically authentic after expiration; however, the in-application and external verifiers report it as expired and do not mark it currently trusted.

## Revocation

Revocation is an administrator-only operation requiring the `export.revoke` capability. The application writes a unique revocation record keyed by package ID and writes a corresponding immutable audit event containing the actor, device, reason, timestamp, and correlation identifiers. Revocation is monotonic in Step 13: an already revoked package cannot be unrevoked.

A revocation does not rewrite the signed ZIP archive. Rewriting it would invalidate the evidence of what was originally signed. Instead, the desktop application consults the local `export_revocations` ledger during verification and reports separate values for cryptographic validity and current revocation status.

The dependency-free external verifier can also accept a trusted revocation ledger as a second argument:

```text
node tools/verify-export.mjs <package.zip> <trusted-revocations.json>
```

The ledger may be a JSON array of revocation records or an object shaped as `{ "revocations": [] }`. Without a trusted ledger, an external verifier can establish archive integrity, signature validity, payload hash validity, snapshot hash presence, and expiration, but it cannot independently know a later local revocation that was not included in the package.

## Organization identifiers

The default local settings identify the clinic as **Elite Clinic Management System**, country `EG`, with the local FHIR system URL `https://fhir.elite-clinic.local` and a clearly clinic-scoped placeholder OID. The placeholder must not be represented to an external partner as a government-issued or nationally assigned identifier. An administrator can replace it with the clinic’s authoritative OID when one is available.

The following values are validated before saving and are copied into every new manifest:

| Setting                | Validation                                                |
| ---------------------- | --------------------------------------------------------- |
| Clinic name            | 1–160 trimmed characters                                  |
| Country code           | Two uppercase ISO-style letters, such as `EG`             |
| OID                    | Numeric dotted identifier, such as `1.3.6.1.4.1.99999.42` |
| FHIR system URL        | Valid absolute URL                                        |
| Export expiration days | Integer from 1 through 3650                               |

Only administrators can update these values. Doctors can create exports according to the existing redaction and capability rules, but cannot change organization identifiers or revoke packages.

## Verification results

Verification reports the following dimensions separately:

| Result                  | Meaning                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `signatureValid`        | The Ed25519 signature matches the canonical manifest descriptor and public key     |
| `payloadHashValid`      | The payload matches the manifest SHA-256 hash                                      |
| `snapshotHashPresent`   | The payload still carries the referenced immutable snapshot hash                   |
| `archiveIntegrityValid` | ZIP members and package-content hash match the manifest                            |
| `expired`               | `expiresAt` is at or before the verifier clock                                     |
| `revoked`               | The package is marked in the local or supplied trusted revocation ledger           |
| `verified`              | Integrity and signature checks pass and the package is neither expired nor revoked |

A failed `verified` result does not by itself mean the original record was altered. The detailed fields identify whether the failure is due to tampering, malformed packaging, expiration, or current revocation status.

## Operational cautions

Clinical exports contain sensitive medical information even when a redaction policy is selected. Save archives only to approved encrypted storage, protect the ZIP file during transfer, and verify the package before clinical use. Do not commit generated exports, production identifiers, private signing keys, or real patient data to source control.

The Step 13 validator is intentionally limited to the resources Elite Clinic currently emits. When future modules add Observation, MedicationRequest, AllergyIntolerance, DiagnosticReport, or other resources, each resource must receive explicit generation and validation rules before being allowed into the clinical export profile.

## References

[1]: https://hl7.org/fhir/R4/bundle.html "HL7 FHIR R4 Bundle"
[2]: https://hl7.org/fhir/R4/patient.html "HL7 FHIR R4 Patient"
[3]: https://hl7.org/fhir/R4/clinicalimpression.html "HL7 FHIR R4 ClinicalImpression"
[4]: http://hl7.org/fhir/R4/familymemberhistory.html "HL7 FHIR R4 FamilyMemberHistory"
