# Step 21: Minimum-Necessary Clinical Synchronization Implementation

## Purpose and security boundary

Step 21 establishes the first implementation increment for **minimum-necessary, conflict-safe synchronization** between the Windows Hub and enrolled Android devices. The Hub remains authoritative for shared clinical records. Android operates local-first and may retain only the scopes and resources explicitly granted by an administrator through a device policy.

The implementation deliberately separates **transport verification**, **authorization**, **cursor advancement**, and **clinical payload storage**. A device must not advance a cursor or treat a delta as trusted until identity, freshness, response integrity, payload hashes, and the Ed25519 signature have all been verified. The current Android repository persists verified resource metadata and cursors inside the encrypted Room database; encrypted clinical payload projections and the complete read-first UI remain subsequent increments.

> **Minimum-necessary principle:** a synchronization response contains only the fields required by its authorized scope and device policy. It is not a general-purpose patient export.

## Shared contracts

`packages/contracts/src/index.ts` now defines the synchronization vocabulary used by the Hub, Electron IPC boundary, tests, and future Android transport adapters. The contracts are Zod schemas, so runtime validation is applied at the service boundary rather than relying solely on TypeScript types.

| Contract area  | Implemented elements                                                                              | Security purpose                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Capabilities   | `sync.read`, `sync.write`, and `sync.manage`                                                      | Separates ordinary read synchronization, bounded Android-originated writes, and administrator device management. |
| Scopes         | `appointments`, `patient-summary`, `encounter-summary`, `clinical-notes`, and `export-governance` | Limits the categories of data a device can request.                                                              |
| Resources      | Appointment, Patient, Encounter, and ExportPackage                                                | Prevents arbitrary table or entity access through the sync protocol.                                             |
| Delta protocol | Request, response, change operation, cursor, nonce, validity window, conflicts, and redactions    | Supports bounded, replay-resistant, signed responses.                                                            |
| Device policy  | Registration input and persisted policy                                                           | Binds a device to one organization, owner, policy version, and allow-listed scope set.                           |
| Outbox         | Queue input, acknowledgment, state, and conflict schemas                                          | Restricts Android-originated writes to explicit operations with auditable acknowledgments.                       |
| Integrity      | SHA-256 payload/response hashes and Ed25519 metadata                                              | Allows Android to verify both content and signer identity before applying data.                                  |

The capability and delta response contracts include `signatureAlgorithm`, `signatureBase64`, `signerKeyId`, and `signerKeyVersion`. The response signer is the existing versioned Ed25519 export signer, so synchronization does not introduce an unrelated key-management path.

## Migration 17 and Android schema integration

The Windows database migration 17 creates the synchronization state required by the Hub:

| Table                     | Role                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sync_devices`            | Enrolled Android device, organization, owner, policy version, scope policy, state, and last-seen/sync timestamps.                                |
| `sync_cursors`            | Per-device, per-scope cursor state and the corresponding server sequence.                                                                        |
| `sync_resource_versions`  | Hub-side resource-version tracking for synchronization decisions.                                                                                |
| `sync_audit_events`       | Structured synchronization audit results, counts, reason codes, and linkage to ordinary audit events.                                            |
| `sync_outbox`             | Android-originated appointment operations awaiting Hub processing.                                                                               |
| `clinical_sync_conflicts` | Conflict records for rejected or divergent resource writes. This name avoids collision with the pre-existing migration 1 `sync_conflicts` table. |

Migration 16 remains the preceding status-package and trust-anchor migration. Migration regression tests now assert migration versions 1 through 17 and verify the complete set of Step 19 and Step 21 tables.

The Android encrypted Room database has also been extended from version 1 to version 2. Its explicit migration creates `sync_cursors`, `sync_resource_metadata`, and `sync_import_events` inside the same encrypted `EliteDatabase` boundary as local patient data. No standalone unencrypted synchronization database is opened. The application continues to defer database initialization until a Keystore-backed encrypted Room factory is supplied.

## Hub synchronization service

`packages/auth/src/synchronization-service.ts` contains `SynchronizationService`. It receives the existing `EliteDatabase`, the existing `ExportSignaturePort`, and an injectable clock for deterministic tests.

### Device registration and policy

`registerDevice()` requires `sync.manage`, validates that the device is an active Android enrollment, confirms the owner matches the enrollment record, and stores the administrator-approved scope policy. Re-registering a device updates its enrollment and policy version rather than creating an unbounded duplicate. `getDevicePolicy()` returns the policy only to an administrator or the enrolled owner with an appropriate synchronization capability.

Capability and delta requests must match the authenticated session’s `userId` and `deviceId`. Organization identifiers, policy version, requested scopes, and device state are checked before any data query is performed. A suspended device or stale policy is rejected rather than silently downgraded.

### Minimum-necessary allow-list

The first delta builder is explicitly allow-listed:

| Scope               | Returned content in this increment                                                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appointments`      | Appointment and scheduling identifiers, patient identifier, department and doctor identifiers, time window, status, visit type, walk-in flag, version, and update time. Appointment notes are not returned. |
| `patient-summary`   | Patient identifier, names according to role policy, date of birth/sex for authorized clinical roles, phone, status, version, and update time.                                                               |
| `encounter-summary` | Encounter identity and appointment/patient linkage, author, time, status, signing metadata, version, and update time.                                                                                       |
| `clinical-notes`    | Encounter summary plus subjective, objective, assessment, plan, and follow-up fields; restricted to Admin and Doctor roles.                                                                                 |
| `export-governance` | Export package identifiers, lifecycle status, status-change time, package hash, and manifest hash.                                                                                                          |

The service queries active patients and joins only the tables needed for the requested scope. It does not expose arbitrary SQL, table names, or unrestricted row payloads through the request. The scope and role checks are performed before the corresponding clinical query.

### Cursor and idempotency model

A delta request includes a scope cursor, a bounded `maxChanges`, a request nonce, and a synchronization session identifier. The Hub derives `serverSequence` from a SHA-256 fingerprint of stable resource counts, latest update timestamps, and maximum versions. This sequence is content-based and therefore remains stable when synchronization audit rows are written.

If the supplied cursor equals the current content-derived sequence, the Hub returns an empty delta with the same next cursor. Otherwise it builds a bounded snapshot for the requested scope. The response includes `generatedAt`, a five-minute `validUntil` window, `responseNonce`, `responseIntegrity`, payload hashes, and the next cursor. The response integrity hash covers the complete response body except its integrity field; the detached Ed25519 signature covers the canonical response descriptor with signature fields excluded.

This cursor model is intentionally conservative in the foundation increment. It provides deterministic replay behavior and a safe no-op for a current cursor. A later increment can replace the snapshot builder with a journal-based change feed while preserving the contract and signature envelope.

## Outbox and conflict policy

Android-originated writes are not accepted as arbitrary record mutations. `queueOutbox()` requires `sync.write`, validates the operation schema, requires the appointment resource type in this increment, checks the device policy scope, computes a canonical payload hash, and persists the operation as `pending`.

The initial bounded operation set is appointment acknowledgment, arrival, and queue-note behavior as represented by the shared contracts. Every operation carries an operation identifier, base version, resource identity, reason, and payload hash. The Hub returns or records an explicit acknowledgment state rather than implying that a queued operation succeeded.

`recordOutboxAcknowledgment()` updates the operation state and, when supplied, inserts a `clinical_sync_conflicts` record in the same SQLite transaction. The conflict record preserves the client base version, server version, conflict type, and resolution state. The operation identifier is unique, so repeated acknowledgments are idempotent and do not create duplicate conflict records. The current policy is **no silent last-write-wins** for clinical resources: conflicts remain visible for Hub review and later resolution workflow.

## Electron boundary

The Windows main process initializes `SynchronizationService` alongside the existing export signer and exposes a guarded IPC surface:

| IPC channel            | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `sync:device-register` | Administrator enrollment and policy registration.        |
| `sync:device-policy`   | Read the policy for an enrolled device.                  |
| `sync:capabilities`    | Request the signed, policy-filtered capability response. |
| `sync:delta`           | Request a signed, bounded delta for one allowed scope.   |
| `sync:outbox-queue`    | Submit a bounded Android-originated operation.           |
| `sync:outbox-ack`      | Record Hub acknowledgment or conflict state.             |
| `sync:outbox-list`     | List pending operations for the enrolled device.         |

The preload bridge exposes the same operations under a typed `sync` namespace. The main process rejects use of the service if initialization has not completed, following the existing service-guard pattern.

## Android verification and local transaction boundary

`CanonicalJson.kt` recursively sorts object keys and preserves array order so the Android verifier can reproduce the Hub’s canonical JSON hash input. `SyncResponseVerifier.kt` verifies, in order, protocol version, organization identity, device identity, nonce equality, validity timestamps, response integrity, every payload hash, Ed25519 algorithm and signature, and the trusted public key.

`SyncRepository.applyDelta()` invokes the verifier before entering a Room transaction. A rejected response produces no cursor update. An accepted response with `fullSyncRequired` is held for a future full-resynchronization workflow rather than being applied speculatively. For the current metadata-only increment, each verified change records resource type, resource identifier, version, update time, operation, redaction marker, and payload hash; the clinical payload itself is not copied into the metadata table. Only after all changes have been processed does the repository advance the per-device, per-scope cursor and append an import event.

The repository is wired to `EliteDatabase`, not the temporary standalone `SyncDatabase` abstraction. This ensures synchronization metadata is protected by the same encrypted Room database and Keystore-backed key boundary as other Android local data.

## Tests and verification status

The Step 21 TypeScript tests cover the most important authorization and idempotency properties:

1. Appointment synchronization is minimum-necessary and excludes the `notes` field.
2. Unauthorized scopes are rejected, and repeated outbox acknowledgments do not duplicate conflict records.
3. Typed integration fixtures preserve the expected session context shape.

Before committing, the workspace verification command is:

```bash
pnpm typecheck && pnpm test && pnpm desktop:build && pnpm format:check && git diff --check
```

The Android source includes the verifier, canonical serializer, encrypted Room schema integration, and repository boundary. The repository does not contain a Gradle wrapper, and no system Gradle executable is available in the sandbox, so an Android Gradle build must be run in the Android development environment. The Android build should be treated as a required release gate before installing an APK.

## Remaining implementation increments

Step 21’s Windows Hub foundation is complete after the workspace checks and commit. The next Android increment should add secure session establishment and device enrollment handoff, Room entities/DAOs for actual minimum-necessary appointment and patient-summary projections, a WorkManager job with bounded retries, and Compose screens for synchronization status, appointment list, and patient lookup. Cross-platform canonical JSON test vectors should be shared between TypeScript and Kotlin before clinical payload storage is enabled.

A later increment should add LAN/USB transport adapters, key rotation and trust-anchor refresh, administrator review screens for devices and conflicts, explicit full-resynchronization handling, and a runbook covering enrollment, revocation, offline exchange, backup, and recovery.
