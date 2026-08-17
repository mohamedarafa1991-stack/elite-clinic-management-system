# Step 16 Signer Security Audit

## Executive assessment

The Step 16 signer implementation has a sound cryptographic foundation for the clinic’s local-first threat model. It uses Node.js Ed25519 key generation and signing, cryptographically random salts and IVs, AES-256-GCM authenticated encryption for recovery bundles, OS-backed Electron protection for the normal private-key store, administrator-only authorization in the auth service, key-version metadata, retired-key retention, and recovery-time public/private-key consistency checks.

The implementation should **not yet be treated as a completed production key-management system**. The most important gaps are concentrated in recovery-bundle governance and metadata authentication rather than in the Ed25519 primitive itself. Before production rollout, the project should add authenticated metadata binding, stronger and explicitly versioned KDF parameters, safer secret-memory handling, tamper-evident store validation, and an operational recovery approval process.

> **Audit conclusion:** No direct Ed25519 algorithm misuse was found in the reviewed code. The primary risks are lifecycle integrity, offline passphrase attack resistance, same-user desktop compromise, plaintext key residency in the JavaScript heap, and insufficient recovery workflow governance.

## Scope and evidence

The review covered the following implementation surfaces:

| Area                    | Reviewed files and behavior                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Key store               | `apps/desktop/src/main/export-signer.ts`, including generation, signing, rotation, v1 migration, persistence, and restoration |
| OS wrapping             | `apps/desktop/src/main/key-provider.ts` and the Electron `safeStorage` integration                                            |
| Contracts               | `packages/contracts/src/index.ts`, including signer metadata and recovery-bundle schemas                                      |
| Authorization and audit | `packages/auth/src/patient-export-service.ts` and Step 16 IPC handlers in `apps/desktop/src/main/index.ts`                    |
| Renderer handling       | `apps/desktop/src/renderer/main.tsx`, especially recovery passphrase and bundle state                                         |
| Tests                   | `apps/desktop/src/main/key-provider.test.ts` and `packages/auth/src/patient-export-service.test.ts`                           |
| Verification            | Canonical signer key ID/version handling in `tools/verify-export.mjs`                                                         |

The audit is a source review and synthetic-test review. It is not a penetration test, Windows DPAPI forensic assessment, malware-resistance assessment, or formal FIPS validation. NIST treats key management as a lifecycle covering generation, protection, backup, recovery, compromise response, and destruction rather than as a choice of algorithm alone [1].

## Controls that are working well

| Control                    | Assessment                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ed25519 implementation     | Node’s supported Ed25519 primitive is used for generation and signing; no custom elliptic-curve code is present.                                                                           |
| Randomness                 | `randomBytes(16)` supplies recovery salt and `randomBytes(12)` supplies the GCM IV. This matches the requirement for unique, unpredictable security-critical randomness [3] [4].           |
| Authenticated encryption   | AES-256-GCM is used and the authentication tag is stored and checked before plaintext is accepted. Authenticated modes are the preferred choice for encrypted storage [3].                 |
| Public/private consistency | Recovery derives the public key from the recovered private key and checks the derived public key, fingerprint, and key ID against the bundle metadata.                                     |
| Key separation             | Normal private key material is OS-wrapped in a desktop file while the database stores public signer metadata. This follows the useful separation of keys and data described by OWASP [2].  |
| Rotation semantics         | Rotation retires the previous active key, creates a new version, and retains old public metadata so historical exports remain verifiable.                                                  |
| Revocation guard           | A recovery bundle for a key already marked revoked cannot be restored.                                                                                                                     |
| Authorization              | Rotation and recovery are routed through the administrator-only `export.key.manage` capability.                                                                                            |
| Audit trail                | The auth layer records rotation and recovery events; export manifests bind signer key ID and version into canonical signed data.                                                           |
| File handling              | The key store uses a temporary sibling file, exclusive creation, restrictive file mode, and rename-based replacement. Recovery paths are kept within the configured signer-store location. |
| Test foundation            | Synthetic tests cover rotation, retired-key retention, successful recovery, signature verification after recovery, and wrong-passphrase rejection.                                         |

Electron documents that Windows `safeStorage` uses DPAPI and protects data from other Windows users, but not from other applications running as the same user [4]. That limitation is correctly treated as an architectural boundary, but it must be explicit in the clinic’s threat model.

## Findings

### Finding F-01 — Recovery metadata is not authenticated as a whole

**Severity: Medium, security-integrity concern.** The bundle encrypts only the private-key PEM. The recovery metadata, including `keyVersion`, `schemaVersion`, `algorithm`, and the KDF label, is not supplied as AES-GCM additional authenticated data. Import does validate the recovered public key, fingerprint, and key ID, so an attacker cannot freely substitute a different private key without detection. However, an attacker who can modify a bundle can change unauthenticated lifecycle metadata such as `keyVersion` before an administrator imports it. That can create version rollback, artificial version gaps, or misleading recovery records.

**Evidence:** `export-signer.ts:175-203` creates GCM without `setAAD`; `export-signer.ts:206-296` authenticates ciphertext and then checks selected public metadata, but does not cryptographically bind `keyVersion` or the complete bundle descriptor.

**Remediation:** Define a canonical recovery-header encoding containing `schemaVersion`, `keyId`, `keyVersion`, `algorithm`, `publicKeyFingerprint`, KDF parameters, and an installation or organization identifier. Supply it to `cipher.setAAD()` during export and `decipher.setAAD()` during import. Reject any header change before key restoration. Include a versioned `aadProfile` field so future changes are explicit.

### Finding F-02 — KDF strength and parameter agility are under-specified

**Severity: High when recovery bundles may be stored outside the protected clinic workstation.** The code calls `scryptSync(passphrase, salt, 32)` without explicit cost parameters. Node documents factory defaults of `cost/N=16384`, `blockSize/r=8`, `parallelization/p=1`, and `maxmem=32 MiB` [5]. The bundle stores only `kdf: "scrypt"`, so it cannot describe the exact work factor or support a controlled future increase. The only passphrase rule is a minimum of 12 characters, which does not guarantee sufficient entropy against offline guessing.

**Evidence:** `export-signer.ts:175-183` and `206-216`; `packages/contracts/src/index.ts:664-685`.

**Remediation:** Add explicit KDF parameters to the bundle, benchmark a Windows clinic workstation, and choose a memory-hard profile that materially raises offline cost while preserving acceptable recovery time. Require a longer administrator passphrase or a generated recovery secret, add confirmation and entropy guidance, and reject unsupported or excessive parameters before derivation to prevent denial-of-service. Keep the current profile as a legacy decoder only and migrate to a new recovery schema version.

### Finding F-03 — Private key material remains as JavaScript strings and cached PEMs

**Severity: High for a compromised or instrumented same-user desktop; Medium for ordinary local threats.** The signer stores decrypted private-key PEM strings in `privateKeys: Map<string, string>`. `privateKeyFor()` returns and caches a string for the lifetime of the process, and recovery creates additional plaintext strings before re-wrapping them. JavaScript strings are immutable and cannot be reliably zeroized. Node recommends importing repeatedly used material into `KeyObject`s rather than passing serialized PEM strings [5], although `KeyObject` memory is not a complete zeroization guarantee either.

**Evidence:** `export-signer.ts:123-125`, `311-319`, and `206-296`.

**Remediation:** Replace the PEM cache with a `KeyObject` cache where practical, minimize the lifetime of decrypted values, use `Buffer` only for transient serialized material, overwrite temporary buffers in `finally` blocks, and add an explicit `clearKeyCache()` on logout, lock, rotation, and shutdown. Do not expose private key text to the renderer. Treat this as risk reduction, not a guarantee against a fully compromised Electron process.

### Finding F-04 — Electron synchronous `safeStorage` is a documented platform boundary

**Severity: Medium.** The normal private-key store is protected with Electron’s synchronous `safeStorage` API. Electron currently recommends the asynchronous API and documents that Windows DPAPI protects against other users on the machine but not other applications in the same user session [4]. A malicious process running as the logged-in clinic user may therefore be able to invoke or abuse the application context, inspect process memory, or use the same-user protection boundary.

**Evidence:** `apps/desktop/src/main/key-provider.ts:16-20`, `export-signer.ts:273-284`, and the Electron initialization in `apps/desktop/src/main/index.ts`.

**Remediation:** Move to `encryptStringAsync` and `decryptStringAsync` where the application lifecycle permits it, handle temporary unavailability and `shouldReEncrypt`, and document that DPAPI is not an application-isolation boundary. Add workstation controls: standard-user operation, Windows Defender and endpoint protection, restricted administrator access, screen lock, and an application lock or re-authentication gate before key rotation and recovery. A future stronger design could keep the private key in a dedicated signing helper or hardware-backed provider.

### Finding F-05 — Key-store load validation does not verify all cryptographic relationships

**Severity: Medium.** Version 2 parsing checks field types and allowed statuses but does not recompute the fingerprint from the public key, verify that `keyId` matches the fingerprint-derived ID, enforce unique key versions, enforce exactly one active key, or validate that the encrypted private key derives the stored public key before the key becomes signable. A malformed or tampered metadata file can therefore load into memory. The resulting signature may fail external verification, but the failure is detected late and the store is not automatically quarantined.

**Evidence:** `export-signer.ts:414-445` performs shape checks and calls `activeEntry()`, but does not perform cryptographic relationship checks.

**Remediation:** Validate the full store before assigning `this.store`: recompute every fingerprint and key ID, enforce unique versions and IDs, enforce exactly one active entry, validate timestamp/status invariants, and verify each private key lazily on first use before signing. On mismatch, fail closed, preserve the original file, and write a diagnostic-safe quarantine copy without private material.

### Finding F-06 — Recovery can reactivate retired keys without an explicit rollback workflow

**Severity: Medium.** `restoreRecoveryBundle()` can replace an existing matching key entry and set it active, even when the existing entry is retired. This is convenient for recovery but also permits an old backup to move the signer backward to a previous key generation. The code blocks revoked keys, but it does not distinguish “restore the current active key after loss” from “reactivate a historical key.”

**Evidence:** `export-signer.ts:245-296`.

**Remediation:** Separate operations into `restoreIntoEmptyStore` and `reactivateRetiredKey`. The latter should require an explicit administrator reason, a second-admin approval for production, a confirmation showing the target key version, and an audit event recording the rollback. Prefer importing the newest non-revoked active backup only when the current store is missing or demonstrably corrupt.

### Finding F-07 — Recovery bundle handling lacks replay, expiry, and organizational binding

**Severity: Medium.** A valid recovery bundle can be imported repeatedly. The bundle has a creation time but no expiration, one-time-use marker, bundle ID, installation ID, clinic organization ID, or recovery generation. A copied bundle and passphrase could therefore be reused on another installation that accepts the same signer contract. This is especially important because the system is intended for a local clinic with multiple administrator accounts.

**Evidence:** `packages/contracts/src/index.ts:673-685`; `export-signer.ts:175-203` and `206-296`; renderer state in `main.tsx:2592-2635`.

**Remediation:** Bind the recovery header to a clinic organization identifier and installation identity, add a recovery bundle ID and optional expiry, record imported bundle IDs in the encrypted local audit/database registry, and require an explicit “recovery replacement” workflow. If cross-installation disaster recovery is required, make that an intentional mode with a trusted organization recovery code rather than an implicit default.

### Finding F-08 — Renderer retains the passphrase and bundle after successful operations

**Severity: Low to Medium.** The renderer keeps `recoveryPassphrase` and `recoveryBundleJson` in React state after export and restore. This is not a plaintext private key, but it leaves a sensitive passphrase and encrypted key material in the renderer heap and potentially in snapshots or diagnostics. The current success path does not clear either value.

**Evidence:** `apps/desktop/src/renderer/main.tsx:2592-2635`.

**Remediation:** Clear the passphrase after every success or failure, clear the bundle after successful restore, add a deliberate “copy once” or file-save flow instead of a long-lived textarea, prevent accidental clipboard retention, and ensure error messages never include the passphrase, bundle, or decrypted key.

### Finding F-09 — Recovery schema does not preserve KDF parameters or strict encoded-length validation

**Severity: Low to Medium.** The schema checks minimum string lengths but does not enforce canonical Base64, exact salt/IV/tag lengths, ciphertext size limits, or a bounded maximum ciphertext size. `Buffer.from(value, "base64")` is permissive. A malformed or oversized bundle can cause unnecessary CPU or memory work before the cryptographic checks fail.

**Evidence:** `packages/contracts/src/index.ts:673-685` and `export-signer.ts:212-224`.

**Remediation:** Add bounded Base64 helpers, enforce a 16-byte salt, 12-byte IV, 16-byte GCM tag, a small maximum ciphertext length for a private-key PEM, and explicit scrypt parameter bounds before `scryptSync`. Add malformed-input tests for every field.

### Finding F-10 — Fingerprints are based on PEM text rather than canonical public-key bytes

**Severity: Low to Medium.** The fingerprint is `SHA-256(publicKeyPem)`. PEM is an encoding, so equivalent public keys could have different textual representations. The current generated and derived PEM paths are internally consistent, but a canonical trust-anchor identity should hash DER or the raw Ed25519 public-key bytes.

**Evidence:** `export-signer.ts:91-97` and `233-239`.

**Remediation:** Define a canonical fingerprint profile, preferably SHA-256 over the DER SubjectPublicKeyInfo or raw Ed25519 public key, include `fingerprintProfile` in metadata, and migrate legacy PEM-text fingerprints as a versioned compatibility path.

### Finding F-11 — Persistence is atomic at the file-operation level but not durable against power loss

**Severity: Low availability concern.** The temporary file is created exclusively and renamed, which prevents partial JSON writes in normal operation. The implementation does not explicitly flush file contents and directory metadata before rename. A power loss can therefore leave either the old store or a missing/new store depending on filesystem behavior. On Windows, replacement semantics also need an integration test because rename behavior differs from POSIX assumptions.

**Evidence:** `export-signer.ts:65-89` and `447-449`.

**Remediation:** Add Windows-specific persistence tests, use a platform-appropriate replace strategy, consider an fsync-backed durability sequence, retain a versioned backup of the last valid store without private plaintext, and fail closed if the active store cannot be parsed.

## Risk prioritization

| Priority                                  | Findings               | Release decision                                                                          |
| ----------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| P0 before production recovery use         | F-01, F-02, F-05       | Must be addressed before recovery bundles are treated as a dependable production control. |
| P1 before multi-admin operational rollout | F-03, F-04, F-06, F-07 | Required for a defensible local-clinic operational model and compromise response.         |
| P2 hardening increment                    | F-08, F-09, F-10, F-11 | Should be included in the next security increment and covered by regression tests.        |

## Recommended remediation sequence

First, introduce recovery schema version 2 with explicit scrypt parameters, strict bounds, canonical authenticated AAD, an organization/install binding, and a recovery bundle ID. Second, harden store loading and signing by validating key relationships and replacing long-lived PEM strings with a minimized `KeyObject` cache. Third, separate ordinary restore from retired-key reactivation and add second-admin approval or an equivalent dual-control policy. Fourth, clear renderer secrets and migrate to asynchronous Electron safe storage with documented DPAPI assumptions. Finally, add tamper, downgrade, replay, malformed-input, crash-recovery, and Windows persistence tests.

## Test gaps to add

| Test category           | Required cases                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata authentication | Mutate key version, algorithm, key ID, fingerprint, KDF parameters, organization binding, and schema version; every mutation must fail before restoration.                |
| Store integrity         | Mutate key ID, fingerprint, active pointer, duplicate version, multiple active keys, status timestamps, public key, and ciphertext; every invalid store must fail closed. |
| KDF defense             | Reject unsupported cost, memory, parallelism, salt, IV, tag, and ciphertext sizes before derivation.                                                                      |
| Replay and rollback     | Import the same bundle twice, import an older retired key, import a revoked key, and import a bundle into the wrong installation.                                         |
| Secret lifecycle        | Verify passphrase and bundle UI state are cleared after success and failure; verify no error contains secret material.                                                    |
| Durability              | Simulate failure before rename, after rename, and during recovery; verify the previous valid store remains usable or the application fails closed.                        |
| Platform                | Run Windows integration tests for DPAPI availability, same-user behavior documentation, and file replacement semantics.                                                   |

## References

[1]: https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final "NIST SP 800-57 Part 1 Revision 5 — Recommendation for Key Management"
[2]: https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html "OWASP Key Management Cheat Sheet"
[3]: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html "OWASP Cryptographic Storage Cheat Sheet"
[4]: https://www.electronjs.org/docs/latest/api/safe-storage "Electron safeStorage API"
[5]: https://nodejs.org/api/crypto.html#cryptoscryptsyncpassword-salt-keylen-options "Node.js Crypto API — scryptSync and key formats"
