# Step 16 — Persistent Export Registry and Signing-Key Lifecycle

## Executive summary

Step 16 adds the local control plane required to manage signed clinical exports after they are created. Every saved detached export or ZIP archive can now be represented by a persistent registry record, searched by patient or lifecycle status, advanced through an explicit state machine, and correlated with an immutable lifecycle event and audit trail. The registry stores the package and payload hashes, manifest hash, storage paths, expiration, redaction policy, FHIR profile provenance, and the signing-key generation used to produce the package.

The step also replaces the single-key signer model with a versioned key store. The active Ed25519 key is identified by a stable fingerprint-derived key ID and a monotonically increasing key version. Rotation retires the previous key while preserving its public metadata for historical verification. Recovery bundles contain encrypted private-key material protected by an administrator-supplied passphrase using AES-256-GCM with an scrypt-derived key. The private signing key remains in the Windows desktop signer store; the database and manifests retain public trust metadata only.

> **Scope boundary:** The registry records package custody and trust state. It does not erase archive bytes when a package becomes `destroyed`, and it does not distribute revocation status to external recipients. Those workflows remain future increments with separate approval and synchronization requirements.

## Delivered components

| Layer                 | Step 16 implementation                                                                                                                                    | Security and integrity purpose                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Shared contracts      | Lifecycle states, registry records, lifecycle events, key metadata, rotation input, passphrase, and recovery-bundle schemas                               | Keeps desktop, auth, database, and verifier behavior aligned                                                        |
| Database migration 14 | `export_signing_keys`, `export_packages`, `export_package_lifecycle_events`, and `export_signing_key_events`                                              | Provides durable inventory and append-only event references inside encrypted local storage                          |
| Auth service          | Registry registration, listing, transitions, expiration marking, key synchronization, rotation/recovery orchestration, and canonical signing-data updates | Enforces capabilities, validates state transitions, and joins public EL patient IDs to internal foreign keys safely |
| Windows signer        | Version 2 multi-key store, v1 migration, OS-wrapped private keys, rotation, recovery export/import, atomic writes, and path-safe recovery handling        | Protects private keys locally while retaining retired verification anchors                                          |
| Electron main/preload | Registers saved detached and ZIP exports and exposes typed registry/key IPC handlers                                                                      | Ensures the persisted record is created only after a file save succeeds                                             |
| Renderer              | Administrator registry loader, lifecycle transition controls, key-version display, rotation, and recovery bundle controls                                 | Makes the operational lifecycle visible without exposing private keys                                               |
| External verifier     | Includes `signerKeyId` and `signerKeyVersion` in canonical signature reconstruction                                                                       | Allows offline verification to identify the signing-key generation                                                  |

## Export registry data model

The registry API exposes the public EL-formatted patient identifier while the database stores the internal patient row ID required by the existing foreign-key model. Listing and lookup queries join the two representations so the public contract never leaks an internal database identifier.

| Registry field group    | Stored values                                                              | Rationale                                                                     |
| ----------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Identity                | Package ID, package type, snapshot ID, public patient ID                   | Correlates the file with the immutable clinical projection and patient record |
| Clinical export context | Format, redaction policy, export reason, FHIR profile bundle ID            | Makes minimum-necessary and interoperability decisions inspectable            |
| Time and actor          | Created time, creator, expiration, status-change time, status-change actor | Supports retention review and accountability in an offline clinic             |
| Integrity               | Package hash, payload hash, manifest hash                                  | Detects replacement or mismatch between saved bytes and recorded metadata     |
| Trust anchor            | Signer key ID and signer key version                                       | Identifies the public verification key generation used for the package        |
| Storage                 | Archive name/path or detached payload, manifest, and signature paths       | Permits inventory and retention operations without scanning the filesystem    |

Registration starts in the `stored` state and records an initial lifecycle event with a `NULL` source state. The Electron main process calls registration after the detached files or ZIP archive have been written and the in-process verification result has been obtained. A registry record is idempotent for identical package content and rejects a package-ID collision when any material content differs.

## Lifecycle state machine

The lifecycle is intentionally explicit rather than inferred from file presence. The state machine preserves history through `export_package_lifecycle_events`; each event references a corresponding audit event, actor, reason, and timestamp.

| From         | Allowed destinations                                                                |
| ------------ | ----------------------------------------------------------------------------------- |
| `issued`     | `stored`, `downloaded`, `expired`, `revoked`, `superseded`, `archived`, `destroyed` |
| `stored`     | `downloaded`, `expired`, `revoked`, `superseded`, `archived`, `destroyed`           |
| `downloaded` | `expired`, `revoked`, `superseded`, `archived`, `destroyed`                         |
| `expired`    | `revoked`, `archived`, `destroyed`                                                  |
| `revoked`    | `archived`, `destroyed`                                                             |
| `superseded` | `archived`, `destroyed`                                                             |
| `archived`   | `destroyed`                                                                         |
| `destroyed`  | No further transitions                                                              |

The service rejects invalid transitions instead of silently overwriting the current state. Repeating the current state is idempotent and returns the current record without creating a duplicate event. Expiration is evaluated when the registry is listed; eligible `issued`, `stored`, and `downloaded` packages are transitioned to `expired` with a generated audit and lifecycle event. Revocation continues to use the existing administrator-only revocation ledger and now synchronizes an eligible registry record to `revoked`. A package already archived is not moved backward to `revoked`, because archival is a later custody state; its cryptographic revocation ledger remains authoritative.

Permanent destruction is a lifecycle decision only at this step. It is not a file deletion operation. Future implementation must require the existing administrator destruction workflow, preserve the audit trail, and provide a recovery/backup policy before deleting local bytes.

## Signing-key versioning and rotation

The Windows signer uses a version 2 JSON store containing multiple key entries and one active key ID. Each key entry stores the public key PEM, SHA-256 public-key fingerprint, key version, status, creation time, retirement time, revocation time, and an OS-wrapped private-key ciphertext. The stable key ID is `esk-` followed by the first 24 hexadecimal characters of the public-key fingerprint. The key version is a positive monotonically increasing integer and is unique in the database.

| Key status | Can sign new exports? | Retained for verification? | Meaning                                             |
| ---------- | --------------------: | -------------------------: | --------------------------------------------------- |
| `active`   |                   Yes |                        Yes | Current signer selected for newly created packages  |
| `retired`  |                    No |                        Yes | Historical signer preserved after rotation          |
| `revoked`  |                    No |              Metadata only | Key must not be restored or trusted for new signing |

Rotation is administrator-only through the `export.key.manage` capability. The signer atomically creates the next key, marks the previous active key as retired, persists the new active-key pointer, and returns public metadata. Existing manifests remain verifiable because their key ID, key version, public key, and signature are unchanged. The auth service records the key in `export_signing_keys` and writes a `rotated` signing-key event with an audit reference.

ZIP signing uses a two-pass process. The first pass obtains active-key metadata and constructs the package descriptor; the second pass signs canonical data that includes the signer key ID and version. The resulting manifest therefore binds the package to both the public key and the key generation. The standalone verifier reconstructs the same canonical descriptor, so verification is independent of the application database.

## Encrypted recovery bundles

A recovery bundle is a JSON document containing schema metadata, key identity, key version, public key material, KDF parameters, salt, nonce, authentication tag, and encrypted private-key bytes. The private key is encrypted with AES-256-GCM. The encryption key is derived from the passphrase with scrypt; the bundle carries the salt and cost parameters needed for an offline restore. The passphrase is validated as a minimum 12-character secret by the shared contract.

Recovery export and import are administrator-only. Import verifies the authenticated ciphertext before altering the signer store, rejects revoked keys, rejects key ID/public-key mismatches, and rejects version conflicts except when replacing the automatically generated bootstrap key in a fresh store. The file is written through a temporary sibling file followed by an atomic rename, and recovery paths are restricted to the configured signer-store directory to prevent path traversal. Wrong passphrases fail closed without changing the target store.

The operational policy is:

1. Create a recovery bundle only on a trusted administrator workstation.
2. Store it offline on an access-controlled USB device or equivalent protected medium; do not send it through ordinary email or place it in the export archive.
3. Record the key ID and version in the clinic’s administrator recovery log without recording the passphrase.
4. Test restoration into a separate temporary store before relying on the bundle for disaster recovery.
5. Rotate the signing key after a suspected passphrase disclosure or private-key compromise, then revoke the affected trust anchor through the administrator workflow.

These controls follow the principle that key-management procedures must address the complete key lifecycle, including generation, use, backup, recovery, retirement, and compromise response [1]. The AES-GCM and scrypt construction is implemented with the platform’s built-in cryptographic primitives; the application still depends on Windows OS protection for the normal private-key store and on administrator handling for the recovery passphrase.

## Authorization and audit behavior

Basic export management remains available to administrators and doctors through `export.manage`. Revocation remains restricted to `export.revoke`, and signing-key listing, rotation, and recovery remain restricted to the administrator-only `export.key.manage` capability. Every registry creation and transition creates an audit event. Signing-key rotation, recovery export, and recovery import create corresponding signing-key lifecycle events tied to audit records.

The renderer does not receive private key material. It receives only public metadata and an encrypted recovery bundle that the administrator explicitly requested. The recovery textarea is a transport surface for an already encrypted bundle, not a place where the application stores or displays a plaintext private key.

## Verification and tests

Step 16 adds synthetic coverage for the security-critical workflows. The auth integration test builds a signed ZIP, confirms signer ID/version propagation, registers the package, advances it through `stored`, `downloaded`, and `archived`, verifies lifecycle event persistence, and confirms that revoking a separately stored package synchronizes its registry state. The desktop signer tests verify key rotation, retired-key retention, encrypted recovery export/import, signature verification after restoration, and wrong-passphrase rejection.

The existing end-to-end ZIP verifier test remains in place. It still rejects tampered payload members and trusted-ledger revocations without modifying the original archive bytes. No real patient data is used by the Step 16 tests; all patients, users, snapshots, keys, paths, and timestamps are synthetic.

## Operational limitations and next steps

Step 16 intentionally does not implement signed revocation/status-list distribution, Android registry replication, recipient/consent records, or permanent file deletion. These should be separate increments because they introduce trust-distribution, synchronization-conflict, clinical-governance, and data-destruction risks. The recommended next security increment is a signed offline status package with issuer key ID, sequence number, generated-at time, validity window, and stale-list reporting. A subsequent increment can extend the registry to Android while keeping private signing keys hub-only by default.

## References

[1]: https://csrc.nist.gov/projects/key-management/key-management-guidelines "NIST Key Management Guidelines"
[2]: https://nodejs.org/api/crypto.html "Node.js Crypto API"
[3]: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html "OWASP File Upload Cheat Sheet"
