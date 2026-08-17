# Step 17 — Signed Export Status Distribution and Trust Hardening Plan

## Planning objective

Step 17 should extend the Step 16 export control plane from local lifecycle management to **portable, signed status distribution and hardened trust recovery**. The clinic must be able to export a status package over USB or LAN, allow an offline recipient to verify whether an export is currently revoked or superseded, and preserve clear distinctions between cryptographic authenticity, current status, expiration, and stale status information.

The step should also implement the highest-priority findings from the Step 16 signer audit before adding more trust-distribution features. Key-management work must cover the complete lifecycle of generation, protection, rotation, backup, recovery, compromise response, and retirement [1].

## Why Step 17 is next

Step 16 records package state locally, but an external recipient still needs a trusted, portable answer to the question: “Was this package revoked or superseded after it left the clinic?” A recipient who has only the ZIP archive can verify the original signature, but cannot learn about later local status changes without a separately transferred trust artifact.

The next release should therefore provide a signed status list with an issuer key ID, monotonic sequence, generation time, validity window, and package-status entries. The package verifier should report `authentic`, `expired`, `revoked`, `superseded`, `status-current`, `status-stale`, and `status-unavailable` separately rather than collapsing them into one Boolean.

## Release goals and non-goals

| Area                  | Step 17 goal                                                                            | Explicit non-goal                                         |
| --------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Signed status package | Export and verify a deterministic, signed status list offline                           | No cloud service or mandatory internet dependency         |
| Status freshness      | Report generated-at, valid-until, sequence, and stale-list conditions                   | No assumption that a stale list proves a package is valid |
| Trust hardening       | Authenticate recovery metadata, harden store validation, and add bounded KDF parameters | No hardware HSM requirement for the first local release   |
| Admin governance      | Add explicit recovery replacement and retired-key reactivation workflows                | No silent rollback to an older signer key                 |
| Cross-device workflow | Define USB/LAN import/export boundaries for status packages                             | No private signing-key distribution to Android devices    |
| Auditability          | Record status package issuance/import and key-recovery decisions                        | No deletion of historical audit evidence                  |

## Threat model

The design assumes a local Windows hub with fewer than 20 clinic users, multiple administrators, offline operation, and USB/LAN exchange. It protects against accidental package-status ambiguity, tampered status files, malformed recovery bundles, stale status data, and unauthorized role-level operations. It does not claim to protect a fully compromised Windows user account or a malicious process running with the same user’s privileges; Electron documents that Windows DPAPI protects against other users but not other applications operating as the same user [2].

The primary trust anchors are the clinic organization identifier, the signer key ID/version, the public key recorded in the package manifest, and the public key used to verify the status list. The system must make trust-anchor changes visible and auditable.

## Proposed status-package contract

A status package should be a deterministic ZIP or detached three-file package with a manifest, canonical status payload, signature, and human-readable README. The status manifest should include the following fields.

| Field                                | Purpose                                                           |
| ------------------------------------ | ----------------------------------------------------------------- |
| `schemaVersion`                      | Versioned parser and canonicalization profile                     |
| `statusPackageId`                    | Unique package identifier                                         |
| `organizationId`                     | Binds the list to Elite Clinic’s organization identity            |
| `issuerKeyId` and `issuerKeyVersion` | Identifies the signing-key generation                             |
| `sequence`                           | Monotonically increasing status revision                          |
| `generatedAt`                        | Status creation time from the hub                                 |
| `validFrom` and `validUntil`         | Freshness window for offline verification                         |
| `previousStatusHash`                 | Optional chain link to detect unexpected gaps                     |
| `entriesHash`                        | Hash of the canonical status-entry member                         |
| `signatureAlgorithm`                 | Initially Ed25519                                                 |
| `signatureBase64`                    | Detached signature over canonical manifest and payload descriptor |

Each status entry should contain a package ID, package manifest hash, status, status-changed-at time, lifecycle event ID, and optional reason code. Sensitive patient data must not be included. The default status package should therefore be safe to transfer without patient identity fields.

The verifier should validate the package signature and content hashes first, then evaluate status freshness and package status. A status list with a valid signature but an expired `validUntil` must produce a stale result, not a current revocation assertion.

## Database and service changes

Migration 15 should add a local registry for imported and exported status packages. The design should retain both the package metadata and event history.

| Table                    | Key fields                                                                                                         | Purpose                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `export_status_packages` | ID, organization ID, sequence, issuer key ID/version, generated-at, valid-until, package hash, status, source path | Tracks local status artifacts and freshness                       |
| `export_status_entries`  | Status package ID, export package ID, manifest hash, status, changed-at, lifecycle event ID                        | Provides queryable status assertions without patient data         |
| `export_status_events`   | ID, status package ID, event type, actor, reason, audit ID                                                         | Records creation, import, acceptance, rejection, and supersession |
| `export_trust_anchors`   | Organization ID, key ID/version, public key fingerprint, status, source, accepted-at                               | Makes trust-anchor acceptance explicit rather than implicit       |

The auth service should expose typed methods for creating a status package from the local registry, listing status packages, importing a candidate package, accepting or rejecting it, and querying the effective status for a package ID. Imports should be idempotent by package hash and reject conflicting sequence or organization data.

## Step 17 security hardening workstream

### Recovery schema version 2

Recovery bundles should add explicit `kdfParameters`, exact encoded-length validation, a canonical authenticated header, an organization/install binding, a recovery bundle ID, and an optional expiry. AES-GCM additional authenticated data should cover all metadata that affects restoration decisions, including key version and organization binding. Unsupported cost parameters must be rejected before scrypt runs to prevent resource-exhaustion attacks.

Node documents default scrypt parameters of cost 16,384, block size 8, parallelization 1, and a 32 MiB memory ceiling [3]. Step 17 should replace implicit defaults with a benchmarked, explicit clinic profile and preserve the parameters in the bundle for future migration.

### Signer-store integrity

On load, recompute every public-key fingerprint and key ID, enforce unique IDs and versions, enforce exactly one active key, validate timestamp/status relationships, and quarantine invalid metadata without exposing private material. A key should be imported into a reusable `KeyObject` before repeated signing where practical, while acknowledging that in-process memory remains part of the same-user threat boundary [3].

### Recovery governance

Separate normal recovery of the current key from reactivation of a retired key. Reactivation should require a reason, target-version confirmation, and a second administrator approval in the production workflow. The system should record the recovery bundle ID, import result, target installation, actor, and decision in the audit trail.

### Renderer and platform hardening

Clear passphrases after every recovery operation, clear the encrypted bundle after successful restoration, avoid displaying private-key material, and consider moving to Electron’s asynchronous safe-storage APIs. Electron recommends the asynchronous interface and documents support for key rotation and temporary-unavailability handling [2].

## Proposed implementation phases

| Phase | Deliverable                                              | Acceptance criteria                                                                                                      |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 17A   | Recovery schema v2 and signer-store validation           | Metadata tampering, KDF downgrade, duplicate-version, multi-active, and bad-fingerprint tests fail closed                |
| 17B   | Recovery governance and secret cleanup                   | Retired-key reactivation is explicit; renderer clears passphrase/bundle; audit events identify bundle and target version |
| 17C   | Signed status-package contracts and deterministic writer | Status ZIP is reproducible; external verifier validates signature, content hash, organization, and sequence              |
| 17D   | Status registry and import workflow                      | Imports are idempotent, conflicting lists are rejected, stale lists are reported, and no patient identity is included    |
| 17E   | UI and offline exchange runbook                          | Admin can create/export/import/accept/reject status packages using USB/LAN paths with clear status indicators            |
| 17F   | End-to-end integration and recovery drills               | Full test suite covers rotation, recovery, status distribution, stale lists, compromise response, and backup restoration |

## Acceptance criteria

Step 17 should be considered complete only when the following conditions hold.

1. An administrator can export a signed status package containing only package identifiers, manifest hashes, lifecycle statuses, timestamps, and trust metadata.
2. An offline verifier can validate the status package without access to the clinic database or internet.
3. The verifier distinguishes a valid package from a package with a current, stale, missing, revoked, or superseded status assertion.
4. The status package is bound to the Elite Clinic organization identity and the accepted public issuer key.
5. A lower sequence, conflicting organization, invalid previous hash, or unsupported key version is rejected or reported as a trust conflict.
6. Recovery-bundle metadata changes fail authenticated decryption before any key is restored.
7. Recovery KDF parameters are explicit, bounded, benchmarked, and versioned.
8. Invalid signer-store relationships fail closed and cannot be used to sign a package.
9. Retired-key reactivation is explicit and auditable; revoked keys cannot be restored.
10. All tests use synthetic users, patients, snapshots, packages, keys, and paths only.

## Decisions to confirm before implementation

| Decision                | Recommended default                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Status-package format   | Deterministic ZIP with manifest, canonical JSON entries, signature, and README                                 |
| Status-list validity    | 30 days by default, configurable by administrator, with stale reporting rather than silent acceptance          |
| Sequence policy         | Strictly increasing per organization and issuer key generation; imports reject conflicting sequence/hash pairs |
| Trust-anchor onboarding | Admin acceptance of the initial organization key; later key changes require an explicit trust event            |
| Android private keys    | Never distribute private signing keys; Android verifies and requests status packages only                      |
| Retired-key policy      | Preserve public verification metadata for the export retention period; no automatic deletion                   |
| Cross-install recovery  | Disabled by default; enable only with organization-bound recovery mode and administrator approval              |
| Dual control            | Required for retired-key reactivation, revoked-key recovery attempts, and permanent destruction workflows      |

## References

[1]: https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final "NIST SP 800-57 Part 1 Revision 5 — Recommendation for Key Management"
[2]: https://www.electronjs.org/docs/latest/api/safe-storage "Electron safeStorage API"
[3]: https://nodejs.org/api/crypto.html#cryptoscryptsyncpassword-salt-keylen-options "Node.js Crypto API — scryptSync"
