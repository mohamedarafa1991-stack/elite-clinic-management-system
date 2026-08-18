# Step 26 Plan: Durable Outbox Claims and Sync Observability

## Current implementation review

The Android sync-health repository persists a single row per device in `sync_health`. `markAttempt()` records `running`, clears the prior reason, and preserves the last successful timestamp. `markFailure()` stores only a safe reason code, retryability, state, and a local next-retry timestamp. `markSuccess()` records `ready` and updates the success timestamp. Health persistence is deliberately best-effort: failures in health telemetry are swallowed so local-first clinical synchronization is not blocked.

The outbox coordinator first pulls verified deltas for every allowed scope, then reads a bounded list of pending events. Each event is claimed with a compare-and-set transition from `pending` to `sending`. Accepted and already-applied operations become `acknowledged`; conflicts become `conflict`; rejected operations become `rejected`; and retryable responses restore the event to `pending`. Transport or cancellation failures also restore the currently sending event before the exception is propagated or converted into a retry result.

## Findings requiring the next step

The most important remaining risk is that the pending query is not device-scoped. `pendingEvents(limit)` returns all pending events and the coordinator filters by `deviceId` only after loading the batch. In a multi-device database, one device’s older or larger queue can consume the batch and starve another device. The local outbox also has no attempt counter, claim timestamp, lease expiration, or stale-`sending` recovery operation. A process crash after the claim and before the `finally` path could leave an event in `sending` indefinitely.

The sync-health repository uses untyped string state values and a fixed 30-second retry hint. It does not record an attempt count, terminal transition timestamp, or the operation-level failure that caused a retry. Concurrent health updates are last-write-wins, and there is no explicit monotonic version or transaction boundary coupling health state to outbox transitions. These limitations are acceptable for the current Step 25 verification slice but should be resolved before clinical pilot use.

## Recommended next development step

The next step should be **Step 26: Durable outbox claims, multi-device fairness, and sync-health observability**. It should make outbox processing crash-safe and device-fair while converting sync health into a typed, auditable operational state model.

| Workstream           | Deliverable                                                                                                | Acceptance criterion                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Device fairness      | Add a `deviceId` predicate and supporting index to the pending-event query.                                | A device processes only its own events, and another device’s queue cannot consume its batch.                                             |
| Durable claims       | Add claim timestamp, attempt count, and last safe failure code, with a bounded lease.                      | A crashed `sending` event becomes eligible for recovery after lease expiry without duplicate acknowledgment.                             |
| Atomic transitions   | Centralize claim, restore, acknowledge, conflict, and rejection transitions and check affected-row counts. | No result is reported for an event whose compare-and-set transition did not succeed.                                                     |
| Typed health state   | Replace free-form state strings with a sealed/value-object model and a finite reason-code registry.        | Only known states and safe reason codes can be persisted or exposed to UI/telemetry.                                                     |
| Health observability | Persist attempt count, terminal timestamp, last completed timestamp, and next retry time.                  | Administrators can distinguish running, ready, retry-scheduled, blocked, and stale-claim recovery.                                       |
| Recovery scheduling  | Add stale-claim recovery before each run and preserve explicit retry-now behavior.                         | Process death, cancellation, and device restart do not strand events permanently.                                                        |
| Test coverage        | Add fake-DAO coordinator tests and SQLite migration tests for multi-device and crash recovery.             | The matrix covers fairness, stale claims, cancellation, transient failure, permanent failure, idempotent replay, and health transitions. |

## Proposed test matrix

The test suite should use synthetic events for two device IDs and verify that each coordinator sees only its own pending events. It should claim an event, simulate process interruption, advance the injected clock beyond the lease, and confirm that the next run safely reclaims it. It should verify that a late acknowledgment from the first attempt cannot overwrite a newer claim or duplicate the final state.

The health matrix should verify `running → ready`, `running → retry-scheduled`, `running → blocked`, and stale-claim recovery transitions. It should verify that cancellation restores a sending event, transient network failure schedules retry, terminal TLS failure blocks the profile, and a successful explicit retry clears the reason and records a new success timestamp. Every failure exposed to UI or logs must use a safe reason code and must exclude paths, private keys, raw exception text, and clinical payloads.

## Release gates

Step 26 should not be considered complete until the Room migration has a forward-only test from version 4, device-scoped outbox queries are covered, stale claims recover deterministically under an injected clock, all compare-and-set transitions assert affected-row counts, and the Android Gradle test suite executes on an API 29+ build environment. The existing TypeScript and desktop verification must continue to pass, and the local-only GitHub workflow must remain excluded from commits.

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/a0d0284ed5bd4fd64241456094bc9c2b354bb058/apps/android/app/src/main/java/com/elite/clinic/sync/SyncHealthRepository.kt "Android sync-health repository"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/a0d0284ed5bd4fd64241456094bc9c2b354bb058/apps/android/app/src/main/java/com/elite/clinic/sync/SecureSyncCoordinator.kt "Android secure synchronization coordinator"
[3]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/a0d0284ed5bd4fd64241456094bc9c2b354bb058/apps/android/app/src/main/java/com/elite/clinic/data/EliteDatabase.kt "Android local outbox and Room database"
[4]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/6449c5cd57762f24d0e09abaa5a3de27ae8fde67/docs/step-25-cross-platform-tls-recovery-e2e-plan.md "Step 25 cross-platform TLS recovery plan"
