# Step 19 Plan: Android Signed Status Packages and Governance Synchronization

## Executive decision

Step 19 should close the most important remaining boundary in the clinic’s export-security architecture: **the offline Android client must be able to consume and verify signed export-status packages without receiving the Windows Hub’s private signing key or depending on the clinic database**.

The step should deliver a local-first Android status verifier and a controlled Windows Hub status-package issuer/import path. It should also carry the minimum governance synchronization metadata needed for Android to understand whether an export package is current, stale, revoked, superseded, or unavailable. Broad patient-record replication is explicitly deferred.

The design follows Android’s offline-first guidance: the local data source remains the source of truth for reads, network or Hub access is isolated behind repositories, and synchronization updates local state before UI consumers observe it [1]. Mobile storage and import controls are aligned with OWASP MASVS storage, cryptography, authentication, platform, and privacy concerns [2] [3].

## Objectives

Step 19 has five objectives. First, the Windows Hub must create deterministic, metadata-only signed status packages from the persistent export registry and governance ledger. Second, the desktop application and dependency-free verifier must distinguish cryptographic authenticity from freshness and package-status semantics. Third, the Android application must import, verify, persist, and display the last trusted status snapshot while remaining useful without LAN or internet access. Fourth, the system must make trust-anchor acceptance explicit and auditable without distributing private signing keys. Fifth, governance receipts and disclosure state must be represented as non-patient-identifying synchronization metadata where appropriate.

## Non-goals

The step will not replicate the full export registry, patient records, FHIR clinical payloads, or private signing keys to Android. It will not implement cloud synchronization, automatic external disclosure delivery, or remote wipe. It will not infer consent, recipient identity, or guardian authority from phone numbers or device ownership. It will not allow Android to issue, rotate, recover, or approve Windows signing keys.

## Threat model and trust boundaries

The Windows Hub remains the issuer and authoritative source for status assertions. Android is a verifier and cache. USB, LAN shares, Android document providers, and imported ZIP files are untrusted transport boundaries. The Android local store is protected at rest but must be treated as potentially stale or tampered with; every replacement requires signature, hash, issuer, sequence, and validity checks.

| Asset                    | Threat                                    | Required control                                                                                                                        |
| ------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Export status assertions | Forged or modified status package         | Ed25519 signature and SHA-256 member/hash verification before acceptance                                                                |
| Trust anchors            | Unauthorized issuer substitution          | Explicit organization-bound trust-anchor records, fingerprint checks, Admin acceptance, and audit trail                                 |
| Freshness state          | Replay of an old but valid package        | Monotonic sequence, `generatedAt`, `validUntil`, previous-status hash, and stale-state reporting                                        |
| Android local cache      | Unauthorized or corrupt local replacement | Encrypted local database, transactional replacement, integrity metadata, and quarantine on failure                                      |
| Patient privacy          | Status package reveals identity           | Status entries contain package IDs, manifest hashes, lifecycle status, and timestamps only; no patient ID, name, phone, or FHIR content |
| Synchronization events   | Replayed or conflicting governance events | Idempotent package hash handling, sequence conflict rejection, event IDs, and append-only local import events                           |
| Private issuer key       | Key extraction from a mobile device       | Never include private key material, recovery bundles, or signer-store files in Android artifacts                                        |

## Signed status-package profile

The recommended artifact is a deterministic ZIP with the following members:

| Member                 | Contents                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status-manifest.json` | Schema version, organization identifier, issuer key ID/version, sequence, generated time, validity window, previous status hash, entries hash, package hash, signature metadata, and format declaration |
| `status-entries.json`  | Canonical array of package ID, manifest hash, lifecycle status, status-changed-at, lifecycle event ID, optional reason code, and optional receipt/disclosure state code                                 |
| `status-signature.sig` | Detached Ed25519 signature over the canonical status descriptor and entries hash                                                                                                                        |
| `README.txt`           | Human-readable verification and freshness instructions without patient identifiers                                                                                                                      |

The canonical descriptor must include the organization identity, status-package ID, sequence, `generatedAt`, `validUntil`, `previousStatusHash`, `entriesHash`, issuer key ID/version, and schema version. It must not include filesystem paths, local usernames, or nondeterministic ZIP metadata. The default validity window should be 30 days, configurable by an administrator, with stale status reported separately from cryptographic failure.

The verifier result should expose independent dimensions:

| Result dimension    | Meaning                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `signatureValid`    | The status package was signed by the trusted public key for the declared issuer key ID/version |
| `contentHashValid`  | Entries, manifest, and ZIP member hashes match                                                 |
| `organizationValid` | The organization identifier matches the configured Elite Clinic trust scope                    |
| `sequenceValid`     | The candidate is not an unauthorized rollback or conflicting sequence                          |
| `freshness`         | `current`, `stale`, `not-yet-valid`, or `unknown`                                              |
| `statusAssertion`   | `current`, `revoked`, `superseded`, `expired`, or `unavailable` for a queried package          |
| `accepted`          | The candidate replaced the local trusted snapshot only when every acceptance rule passed       |

## Migration 16: local status and trust records

The Windows database should add migration 16. Android should use a separate Room schema with equivalent semantics rather than sharing SQLite files or database encryption keys.

| Windows/Android logical table | Required fields                                                                                                                                                                     | Purpose                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `export_status_packages`      | ID, organization ID, sequence, issuer key ID/version, generated-at, valid-until, previous hash, entries hash, package hash, source, acceptance state, accepted-at, rejection reason | Tracks candidates and the effective trusted snapshot                                        |
| `export_status_entries`       | Status package ID, export package ID, manifest hash, lifecycle status, status-changed-at, lifecycle event ID, disclosure/receipt state                                              | Provides queryable, non-patient-identifying status assertions                               |
| `export_status_events`        | ID, status package ID, event type, actor/device, reason, occurred-at, audit/import event ID                                                                                         | Records creation, import, verification, acceptance, rejection, supersession, and quarantine |
| `export_trust_anchors`        | Organization ID, key ID/version, fingerprint, public key, status, source, accepted-by, accepted-at, retired-at                                                                      | Makes trust-anchor acceptance explicit and prevents silent issuer substitution              |
| `export_status_import_queue`  | Candidate path/content hash, received-at, source, state, retry count, last error                                                                                                    | Supports idempotent USB/LAN import and quarantine without overwriting trusted state         |

The database must enforce unique package hashes, unique `(organization_id, sequence)`, unique entry identifiers within a status package, and one effective trusted package per organization. Rejection and quarantine records must remain auditable.

## Windows Hub implementation tasks

| Task                                 | Deliverable                                                                                                        | Acceptance criteria                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 19A. Shared status contracts         | Zod schemas and TypeScript types for manifest, entries, verifier result, trust anchor, import event, and freshness | Malformed fields, oversized input, invalid timestamps, unsupported algorithms, and unknown status values are rejected |
| 19B. Deterministic status writer     | Service method that reads the export registry and governance state and writes the canonical ZIP                    | Same logical input yields the same canonical descriptor and member hashes; no patient identity fields are emitted     |
| 19C. Status database migration       | Migration 16 and migration regression tests                                                                        | Fresh and upgraded databases create all status and trust tables with foreign keys and indexes                         |
| 19D. Trust-anchor management         | Admin-only add, accept, retire, and list operations                                                                | Public-key fingerprint and key ID are recomputed; acceptance is audited; private key material is never accepted       |
| 19E. Candidate import and acceptance | Desktop service and IPC handlers for USB/LAN status-package import                                                 | Candidate verification happens before database replacement; conflicts and rollbacks are quarantined                   |
| 19F. External verifier               | Extend `tools/verify-export.mjs` or add a dedicated `tools/verify-status-package.mjs`                              | Verification works without the application database or internet and reports independent result dimensions             |
| 19G. Desktop governance UI           | Status package creation, import, trust-anchor review, freshness, and quarantine history                            | Admin can export/import/accept/reject with clear reason codes and no sensitive package content displayed              |

## Android implementation tasks

The existing Android module already targets API 29 provisionally, uses Jetpack Compose, Room, WorkManager, and Android security libraries, and declares backup exclusion in its manifest. Step 19 should add the local verifier without turning Android into an issuer.

| Task                                 | Deliverable                                                                                                                                  | Acceptance criteria                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 19H. Room status schema              | Entities and DAOs for trusted status package, entries, trust anchors, import events, and quarantine records                                  | UI reads only from Room; failed imports do not replace the last trusted state                                            |
| 19I. Kotlin canonicalization         | Byte-for-byte canonical descriptor and entries serialization matching the TypeScript profile                                                 | Cross-language test vectors verify identical hashes and signatures                                                       |
| 19J. Ed25519 verification            | Android verifier using platform/provider-supported public-key verification                                                                   | Valid current, valid stale, wrong-key, tampered, wrong-organization, and unsupported-version cases are distinct          |
| 19K. Secure import boundary          | User-initiated document/ZIP import with size, path, member, schema, and decompression limits                                                 | Zip-slip, oversized, duplicate-member, unknown-member, malformed-JSON, and resource-exhaustion cases are rejected        |
| 19L. Local-first repository          | Repository, ViewModel, and Compose screens for status dashboard and package lookup                                                           | Dashboard works with no network; latest trusted snapshot is visible immediately; refresh does not block reads            |
| 19M. Persistent synchronization work | WorkManager job for optional LAN status fetch or queued import processing                                                                    | Retries transient failures with bounded backoff; does not retry authorization or malformed-package failures indefinitely |
| 19N. Mobile security hardening       | Keystore-protected local secrets, backup exclusions, log redaction, screenshot policy for status details, and explicit file-sharing controls | MASVS-oriented tests cover storage, cryptography, authentication, platform interaction, and sensitive-data exposure      |

## Acceptance policy

A candidate status package may replace the trusted local snapshot only when all of the following conditions hold:

1. The ZIP is structurally valid, within configured size/member limits, and contains only the declared members.
2. The manifest and entries satisfy the supported schema and canonicalization profile.
3. The organization identifier is an accepted Elite Clinic identity.
4. The issuer key ID/version resolves to an accepted non-revoked trust anchor, and the public-key fingerprint matches the trust record.
5. The signature and all content hashes verify.
6. The sequence is greater than the trusted sequence, or is an explicitly authorized same-sequence idempotent re-import with the same package hash.
7. The validity window and generated timestamp are evaluated and surfaced; stale packages are not silently treated as current.
8. The candidate contains no patient identity fields or clinical payload members.
9. Acceptance and supersession are committed transactionally with an import event.

A valid but stale package may be retained for historical verification, but it must not overwrite a newer trusted package or be presented as a current revocation assertion.

## Cross-language test vectors

Step 19 must include checked-in synthetic vectors containing a canonical status manifest, entries, organization identity, issuer key metadata, signature, expected hashes, and expected result dimensions. The TypeScript writer, external verifier, and Kotlin verifier must all consume the same vectors.

Required vector cases include a valid current package, a valid stale package, a tampered entry, a changed organization ID, a wrong issuer key, a retired key, a lower sequence rollback, a same-sequence conflicting package, a duplicate ZIP member, a path traversal member, an oversized member, and a package with a patient identifier field.

## Operational workflow

The Admin creates a status package on the Windows Hub after export registry or governance changes. The package is copied through an approved USB or LAN path. The Android user imports it manually or receives it through a controlled local repository. The app verifies it locally, retains the last trusted snapshot if verification fails, and displays the package sequence, generation time, validity state, issuer key version, and import result. The Android device does not upload patient data as part of this workflow.

When a signing key is rotated or revoked, the Hub must issue a status package signed by the active trusted key and distribute updated trust-anchor metadata through an explicit Admin-controlled workflow. A retired key remains available for historical verification but cannot silently become the active trust anchor.

## Dependencies and sequencing

Step 19 should be implemented in the following order:

1. Freeze the cross-language canonicalization profile and test vectors.
2. Add shared contracts and migration 16 on the Windows side.
3. Implement the deterministic writer and dependency-free verifier.
4. Implement trust-anchor and candidate-import workflows on Windows.
5. Implement the Android Room schema and Kotlin verification core.
6. Add Android import UI, status dashboard, and WorkManager processing.
7. Add cross-platform integration tests and security tests.
8. Document the USB/LAN exchange runbook and perform key-rotation and rollback drills.

The critical dependency is canonicalization. No Android or external-verifier implementation should begin against an unstable status-package byte profile.

## Open decisions for the clinic

| Decision                | Recommended default                                                               | Why it matters                                                             |
| ----------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Status-package validity | 30 days                                                                           | Allows offline operation while limiting stale revocation assertions        |
| Distribution            | Admin-controlled USB first; LAN pull later                                        | Reduces network-service scope and supports disconnected devices            |
| Trust-anchor onboarding | Admin approval on each Android device or signed clinic trust bundle               | Prevents silent issuer substitution                                        |
| Android package lookup  | Package ID and manifest hash only                                                 | Avoids patient identity leakage in the status artifact                     |
| Stale status UX         | Visible warning and separate `status-stale` result                                | A valid signature does not prove current revocation state                  |
| Android offline expiry  | Existing 30-day policy                                                            | Aligns with the current Android security requirements in the module README |
| Conflict policy         | Reject rollback and same-sequence hash conflicts; retain all candidates for audit | Preserves monotonic status semantics and forensic history                  |

## Definition of done

Step 19 is complete when a synthetic status package created on the Windows Hub can be copied to an Android API 29 test device, verified without internet or LAN, accepted into encrypted local storage, queried by package ID, and displayed with separate authenticity, freshness, and status-assertion results. A tampered, stale, rollback, wrong-key, wrong-organization, or patient-identifying package must be rejected or clearly quarantined without replacing the last trusted state. The external verifier and Kotlin verifier must agree on all checked-in cross-language vectors.

## References

[1]: https://developer.android.com/topic/architecture/data-layer/offline-first "Android Developers — Build an offline-first app"
[2]: https://mas.owasp.org/MASVS/05-MASVS-STORAGE/ "OWASP MASVS — Storage"
[3]: https://mas.owasp.org/MASVS/ "OWASP Mobile Application Security Verification Standard"
