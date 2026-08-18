# Step 26: Durable Outbox Claims and Sync Observability

## Implementation summary

The Android local outbox is now device-scoped and lease-based. Pending events are selected by `deviceId`, `state`, `occurredAt`, and ID ordering. A claim transition atomically moves an event from `pending` to `sending`, increments `attemptCount`, and records a random claim token, claim time, and two-minute expiration. Every completion or release transition requires the same device ID and claim token, preventing a late worker from overwriting a newer claim.

Before each synchronization run, expired `sending` claims for the current device are restored to `pending` and receive the safe `SYNC_CLAIM_EXPIRED` failure code. Accepted and already-applied operations become `acknowledged`; conflicts and rejections retain their final states; transient responses release the claim back to `pending`; and terminal failures release the claim before propagating the failure. If any compare-and-set transition affects zero rows, the coordinator reports a retryable `SYNC_OUTBOX_CLAIM_LOST` condition rather than claiming success.

## Room migration 4→5

`EliteDatabase` is now version 5. Migration 4→5 adds four observability columns to `sync_health`, six claim/failure columns to `local_outbox`, and the Room-declared index `index_local_outbox_deviceId_state_occurredAt_id`. Existing rows receive `attemptCount = 0`; all other new metadata columns are nullable. The migration is forward-only and remains compatible with the encrypted Room/SQLCipher factory.

## Sync-health observability

`SyncHealthState` provides the persisted states `running`, `ready`, `retry-scheduled`, and `blocked`. The health record now includes an attempt count, last failure timestamp, terminal timestamp, and last completed timestamp in addition to the existing safe reason code and retry timestamps. No raw exception text, certificate path, private key, synchronization payload, or clinical data is stored in health metadata.

The coordinator accepts an injected clock for deterministic lease and health tests. The shared `OutboxClaimLease` policy defines the two-minute lease and its exact expiration boundary. Health telemetry remains best-effort and cannot prevent local-first synchronization from proceeding.

## Verification status

The available workspace verification passed: 66 TypeScript tests, typechecking, desktop production build, formatting, and whitespace checks. A temporary SQLite smoke test also applied the complete migration 4→5 SQL and verified the new columns, defaults, and outbox index. Android JVM tests were added for sync-health transitions and lease boundaries, but execution remains pending because the sandbox has no Kotlin compiler, Gradle wrapper, system Gradle, or Android SDK.

## Remaining Android build gate

The Android build workstation must run the Gradle test suite and Room schema validation against a real API 29+ environment. It should specifically verify migration 4→5 from a v4 database, claim/release/finalize affected-row behavior, multi-device fairness, stale-claim recovery after process death, cancellation restoration, and idempotent acknowledgment.
