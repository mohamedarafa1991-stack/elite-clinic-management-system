# Step 17 — Signed Export Status Packages Technical Specification

## 1. Purpose and scope

Step 17 introduces a portable, signed status package for offline recipients of Elite Clinic exports. The status package answers a question that the signed export archive alone cannot answer: whether the clinic later marked the package as revoked or superseded. The feature must operate over USB and LAN without cloud access, must not include patient identity data, and must preserve the distinction between original cryptographic authenticity and later operational status.

This specification covers the status-package contract, deterministic serialization, signing and verification, local persistence, import acceptance, freshness evaluation, desktop IPC, external verification, and synthetic testing. It also defines the signer-hardening prerequisites that must land before status packages become a production trust channel.

The feature does **not** distribute private signing keys, delete export bytes, provide a cloud status endpoint, or replicate the full export registry to Android. The recommended Android role remains verification and status-package consumption.

## 2. Design principles

The design follows five principles.

First, a status assertion is separate from package authenticity. A valid package signature proves that the archive was signed by a trusted clinic key; it does not prove that the package is still authorized for use. Second, offline freshness must be explicit. A stale status list must never be silently treated as current. Third, status packages must contain no patient name, phone, national ID, date of birth, or clinical payload. Fourth, imports must be idempotent and conflict-safe. Fifth, every status-package action must be attributable to an administrator or explicitly authorized import actor.

The status package is a signed trust artifact. Key-management lifecycle controls therefore apply to its issuer key, package retention, recovery, compromise response, and trust-anchor changes [1].

## 3. Threat model and trust assumptions

The system protects against status-file tampering, package-entry substitution, replay of older status lists, sequence forks, wrong-organization imports, stale-list ambiguity, malformed archive inputs, and unauthorized role-level operations. It assumes that an administrator can transfer files through a trusted USB device or clinic LAN and that the recipient can identify the clinic’s initial public trust anchor through an administrator-approved process.

The system does not protect against a fully compromised Windows account running as the same user as the clinic application. Electron documents that Windows DPAPI protects against other Windows users but not other applications in the same user session [2]. The hub must therefore use standard-user operation, endpoint protection, Windows screen lock, and application re-authentication for key-management operations.

## 4. Status-package contents

The recommended physical format is a deterministic ZIP containing four members. The same canonical manifest and status payload can also be emitted as a detached three-file package if a later workflow requires it.

| ZIP member             | Required content                                        | Purpose                                                                            |
| ---------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `status-manifest.json` | Signed status-package manifest                          | Describes issuer, sequence, validity, content hashes, and signature                |
| `status-entries.json`  | Canonical status-entry array                            | Contains package IDs, manifest hashes, lifecycle states, and event metadata only   |
| `status-signature.sig` | Raw Ed25519 signature bytes or canonical Base64 wrapper | Detached signature over canonical status signing data                              |
| `README.txt`           | Human-readable verification instructions                | Explains offline verification and stale-status semantics without adding trust data |

The ZIP writer must reject duplicate names, traversal segments, absolute paths, unsupported members, and oversized status payloads. Member timestamps and compression settings must be deterministic so identical logical status lists produce identical archive hashes.

## 5. Contract definitions

### 5.1 Status-package manifest

The shared contract should add `exportStatusPackageManifestSchema` with the following fields.

| Field                | Type and rule                             | Notes                                                      |
| -------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `schemaVersion`      | Positive integer, initially `1`           | Versioned canonicalization and parser profile              |
| `packageType`        | Literal `status-zip` or `status-detached` | Prevents cross-format ambiguity                            |
| `statusPackageId`    | Opaque ID                                 | Unique package instance identifier                         |
| `organizationId`     | Stable clinic organization identifier     | Must match local trusted organization identity             |
| `issuerKeyId`        | Opaque key ID                             | Matches the public issuer trust anchor                     |
| `issuerKeyVersion`   | Positive integer                          | Matches the key generation used for signing                |
| `sequence`           | Positive integer                          | Strictly increasing for an organization and issuer lineage |
| `generatedAt`        | ISO timestamp                             | Hub generation time                                        |
| `validFrom`          | ISO timestamp                             | Start of current validity window                           |
| `validUntil`         | ISO timestamp                             | End of current validity window                             |
| `statusEntryCount`   | Non-negative integer with upper bound     | Prevents resource-exhaustion imports                       |
| `entriesHash`        | 64-character lowercase SHA-256            | Hash of canonical `status-entries.json` bytes              |
| `packageContentHash` | 64-character lowercase SHA-256            | Hash of all signed logical members excluding signature     |
| `signatureAlgorithm` | Literal `ed25519`                         | Algorithm profile                                          |
| `signatureBase64`    | Strict Base64                             | Signature over canonical signing data                      |
| `previousStatusHash` | Optional SHA-256                          | Detects missing or unexpected sequence links               |

### 5.2 Status entry

Each `exportStatusEntrySchema` record should contain:

| Field              | Type and rule                                                                          | Notes                                                        |
| ------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `packageId`        | Opaque package ID                                                                      | Links to the exported package without patient data           |
| `manifestHash`     | SHA-256                                                                                | Binds the entry to the exact export manifest                 |
| `status`           | `stored`, `downloaded`, `expired`, `revoked`, `superseded`, `archived`, or `destroyed` | Current status asserted by the clinic                        |
| `statusChangedAt`  | ISO timestamp                                                                          | Effective status time                                        |
| `lifecycleEventId` | Opaque ID                                                                              | Links the assertion to the registry event                    |
| `reasonCode`       | Short non-sensitive code                                                               | Optional machine-readable reason; no free-text clinical data |

The status entry must not contain `patientId`, patient demographics, export reason, redaction policy, snapshot content, file paths, or clinical data. The recipient can use the package manifest hash and package ID to match an archive already in their possession.

## 6. Canonical signing profile

The signer must sign a canonical UTF-8 JSON descriptor with stable property ordering. The descriptor should include the manifest schema version, package type, status package ID, organization ID, issuer key ID/version, sequence, generated-at, validity window, entry count, entries hash, package content hash, and previous status hash. It must exclude `signatureBase64` itself.

The canonical status-entry member must be serialized as a JSON array sorted by `packageId`, then `manifestHash`. Each object must use the contract’s stable property order. The ZIP member bytes must be UTF-8 JSON followed by one newline. The external verifier must reconstruct exactly the same signing descriptor and member hashes.

A status package is cryptographically valid only when all of the following are true:

1. The ZIP has exactly the allowed members and passes safe-member validation.
2. The manifest parses and its `organizationId`, `issuerKeyId`, and `issuerKeyVersion` match a trusted anchor.
3. The entries hash and package content hash match the declared values.
4. The Ed25519 signature verifies against the canonical descriptor.
5. The sequence and previous-hash relationship are acceptable for the selected trust context.

## 7. Freshness and verification semantics

The verifier must return independent result dimensions rather than a single Boolean.

| Result field         | Meaning                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| `signatureValid`     | The status package was signed correctly by the trusted issuer key                     |
| `contentHashesValid` | The status member and package-content hashes match                                    |
| `organizationValid`  | The package belongs to the expected clinic organization                               |
| `sequenceValid`      | The sequence is accepted for the selected status lineage                              |
| `statusCurrent`      | Current time is within `validFrom` and `validUntil`                                   |
| `statusStale`        | The package is cryptographically valid but outside its validity window                |
| `statusUnavailable`  | No trusted status package was supplied                                                |
| `packageStatus`      | Matching status assertion, if present                                                 |
| `verified`           | Signature and content are valid; freshness and package status are separately reported |

A package with a valid export signature but a revoked status entry must be reported as cryptographically authentic and currently revoked. A package with a valid status package whose `validUntil` has passed must be reported as status-stale; it must not be reported as currently clear. A missing status list must be reported as status-unavailable, not as a positive validity result.

## 8. Local persistence and migration 15

Migration 15 should add the following tables.

| Table                    | Required columns                                                                                                                                                                     | Constraints                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `export_status_packages` | ID, organization ID, issuer key ID/version, sequence, generated-at, validity window, previous hash, entries hash, content hash, archive hash, status, source, imported/created actor | Unique organization/sequence/hash identity; bounded status values        |
| `export_status_entries`  | Status package ID, export package ID, manifest hash, status, status-changed-at, lifecycle event ID, reason code                                                                      | Unique status package/export package pair; foreign key to status package |
| `export_status_events`   | ID, status package ID, event type, actor, reason, occurred-at, audit event ID                                                                                                        | Append-only audit-linked actions                                         |
| `export_trust_anchors`   | Organization ID, issuer key ID/version, public key, fingerprint, status, accepted-at, accepted-by                                                                                    | Explicit trust-anchor acceptance and retirement                          |

The local service should store an imported status package before acceptance as `candidate`. An administrator may accept it if organization, issuer trust, sequence, previous hash, and validity rules pass. Re-importing the same package hash is idempotent. A package with a conflicting sequence and different content hash is rejected and recorded as a trust conflict.

## 9. Auth service API

The auth package should expose typed methods with capability enforcement.

| Method                      | Capability                                      | Behavior                                                        |
| --------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| `createExportStatusPackage` | `export.revoke` or a new `export.status.manage` | Builds a deterministic package from effective registry status   |
| `listExportStatusPackages`  | `export.manage`                                 | Lists local status artifacts and freshness state                |
| `importExportStatusPackage` | `export.status.manage`                          | Parses and stores a candidate without trusting it automatically |
| `acceptExportStatusPackage` | Admin-only status capability                    | Accepts a candidate after trust and sequence validation         |
| `rejectExportStatusPackage` | Admin-only status capability                    | Records reason and preserves the candidate metadata             |
| `getEffectiveExportStatus`  | `export.manage`                                 | Returns the best accepted current/stale assertion for a package |
| `listExportStatusEvents`    | Admin-only or audit capability                  | Returns status-package event history                            |

A new `export.status.manage` capability is preferable to overloading revocation authority. If the project keeps the existing capability matrix, acceptance must remain administrator-only and status generation must require access to the registry’s revocation/supersession state.

## 10. Desktop IPC and renderer tasks

The main process should add typed handlers for status-package creation, import, candidate listing, acceptance, rejection, effective-status lookup, and event listing. Every handler must create its service context from the authenticated session token and must not accept a caller-supplied user ID or organization ID as an authority input.

The renderer should add an administrator export-status panel with a file-save action, import path selection, candidate review, trust-conflict display, freshness indicators, and a package lookup by ID or manifest hash. The UI must avoid patient identity fields because the status package is intentionally metadata-only.

## 11. External verifier tasks

`tools/verify-export.mjs` should accept an optional status package path and optional trusted organization/key configuration. It must report machine-readable JSON with separate export-authenticity, status-signature, freshness, sequence, and package-status fields. When no status package is supplied, it must state `statusUnavailable: true` and retain the original export verification result.

The verifier must not trust a public key merely because it appears inside the status package. The trusted issuer key must come from an explicit local trust configuration, the original package’s accepted organization trust, or a separately supplied administrator-approved trust file.

## 12. Security hardening prerequisites

Before status packages are treated as an external trust channel, the signer implementation must complete the following high-priority remediations.

| Finding                             | Required remediation                                                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recovery metadata not authenticated | Use recovery schema v2 and AES-GCM AAD covering all restoration-relevant metadata                                                                                          |
| Implicit/default scrypt parameters  | Store explicit bounded cost, block size, parallelization, and max-memory parameters; reject unsupported values before derivation                                           |
| Store relationships not validated   | Recompute fingerprints and key IDs, enforce one active key and unique versions, validate status/timestamp invariants, and verify private/public consistency before signing |
| Plaintext key cache                 | Minimize PEM lifetime, cache `KeyObject` instances rather than strings, and provide cache clearing on lock/shutdown                                                        |
| Renderer secret retention           | Clear recovery passphrases after every attempt and clear the encrypted bundle after successful restore                                                                     |

## 13. Implementation task breakdown

### Task 17.1 — Contracts and capability matrix

Add status manifest, status entry, status result, status event, trust-anchor, and import/acceptance schemas. Add `export.status.manage` if approved. Add strict bounds for sequence, entry count, validity window, reason code, and Base64 fields. Add contract tests for missing, malformed, duplicate, and conflicting values.

### Task 17.2 — Migration 15

Create the four status tables and indexes. Add migration regression tests for version 15, table names, foreign keys, unique constraints, and safe re-open behavior.

### Task 17.3 — Deterministic status writer

Implement canonical status-entry serialization, manifest construction, member hashing, deterministic ZIP creation, and signer integration. Add tests showing repeated builds with the same data produce identical logical member bytes and package-content hash.

### Task 17.4 — Status import and acceptance service

Implement candidate persistence, organization binding, issuer trust checks, sequence/previous-hash checks, idempotent re-import, conflicting-fork rejection, stale evaluation, and audit-linked acceptance/rejection events.

### Task 17.5 — External verifier

Extend the standalone verifier to verify a status package independently, accept explicit trust configuration, and return separate authenticity/freshness/status fields. Add tamper, wrong-issuer, wrong-organization, stale, replay, and fork tests.

### Task 17.6 — Desktop workflow

Add main-process handlers, preload methods, administrator renderer controls, safe file selection, status review, and clear stale/unavailable indicators. Do not expose private signing keys or patient identity data.

### Task 17.7 — Signer hardening

Implement recovery schema v2, AAD, explicit KDF parameters, bounded decoding, full signer-store validation, `KeyObject` caching, cache clearing, renderer cleanup, and regression tests. This task is a prerequisite for final Step 17 acceptance.

### Task 17.8 — Offline exchange runbook

Document USB/LAN transfer, initial trust-anchor acceptance, stale-list handling, sequence conflict resolution, compromise response, backup/recovery, and administrator dual-control decisions. Test the runbook with synthetic packages and a disconnected workstation.

## 14. Acceptance criteria

Step 17 is complete when an administrator can create a signed status package without patient identity data, transfer it offline, verify it independently against a trusted issuer key, import it idempotently, accept it with audit evidence, and obtain a separate current/stale/unavailable/revoked/superseded result for a known export package. All signer-hardening prerequisites must pass tamper, downgrade, replay, malformed-input, store-integrity, and recovery tests. The full monorepo typecheck, test suite, desktop build, formatting check, and diff check must pass.

## 15. References

[1]: https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final "NIST SP 800-57 Part 1 Revision 5 — Recommendation for Key Management"
[2]: https://www.electronjs.org/docs/latest/api/safe-storage "Electron safeStorage API"
