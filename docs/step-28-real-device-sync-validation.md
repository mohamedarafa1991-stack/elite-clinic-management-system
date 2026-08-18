# Step 28: Real-Device Secure LAN Synchronization Validation

## Purpose

Step 28 validates the complete path between the Windows Hub and Android devices under realistic but synthetic clinic conditions. The scope includes administrator-approved enrollment, HTTPS trust, encrypted session establishment, offline local operation, outbox recovery, retry classification, multi-device fairness, process termination, hub outage, hub restart, and idempotent synchronization outcomes.

This step does not use real patient data. Every test record, user, device, appointment, and clinical payload must be synthetic and clearly marked as test data.

## Repository harness

The new `scripts/step28-real-device-sync-e2e.mjs` harness starts from the built desktop server and performs the desktop-controlled portion of the matrix using temporary self-signed certificates. It verifies that TLS-required startup fails closed without certificate configuration, that the port remains closed after the failed startup, that the correct trust anchor succeeds, that a wrong trust anchor fails closed, that a stopped Hub produces a retryable connection failure, and that the HTTPS listener recovers after restart.

Run the desktop-controlled smoke matrix from the repository root:

```bash
pnpm desktop:build
ELITE_STEP28_REPORT=/tmp/step28-report.json node scripts/step28-real-device-sync-e2e.mjs
```

The harness returns a structured JSON report when `ELITE_STEP28_REPORT` is set. A report is marked `syntheticOnly: true`. Without the Android hook, desktop checks pass while the physical-device item is explicitly marked `pending`; this prevents the repository from claiming that Android hardware validation occurred.

## Android hook contract

To run the Android-side portion, set `ELITE_ANDROID_E2E_COMMAND` to a workstation command that installs or launches the test build and executes the device scenario suite, then pass `--run-android`:

```bash
ELITE_ANDROID_E2E_COMMAND="<workstation Android test command>" \
ELITE_STEP28_REPORT=/tmp/step28-report.json \
node scripts/step28-real-device-sync-e2e.mjs --run-android
```

The harness supplies these environment variables to the Android command:

| Variable                    | Meaning                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ELITE_E2E_HUB_URL`         | Temporary HTTPS Hub URL for the test run.                                                                         |
| `ELITE_E2E_HUB_CERT_PATH`   | Correct synthetic Hub certificate/trust-anchor path.                                                              |
| `ELITE_E2E_WRONG_CERT_PATH` | Intentionally incorrect certificate path for fail-closed testing.                                                 |
| `ELITE_E2E_SCENARIO`        | Required scenario label: `enrollment-offline-write-concurrent-devices-process-death-tls-recovery-idempotent-ack`. |

The hook must exit with status zero only when the Android test command completes all configured scenarios successfully. It must not upload data or use production endpoints.

## Device setup

Use one Windows 10/11 Hub workstation and at least two Android devices running API 29 or newer. The Hub and devices should be connected to the same isolated test LAN, with internet access disabled during the offline scenarios. Enable USB debugging only on test devices, install a debug or dedicated synthetic-data build, and use test administrator credentials that are not used in production.

The test certificate and trust anchor must be distributed only to the test devices for the duration of the run. Confirm that the Android connection profile points to an HTTPS URL and that the expected trust-anchor identity and version are persisted. A wrong trust anchor must never be bypassed through cleartext HTTP or a permissive certificate policy.

## Required scenario matrix

| ID     | Scenario                                                                       | Expected result                                                                                                    | Evidence                                                               |
| ------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| S28-01 | Fresh synthetic Hub startup with TLS required but no certificate configuration | Startup fails closed and the LAN port remains unavailable.                                                         | Sanitized Hub startup status and harness report.                       |
| S28-02 | Correct certificate and trust anchor                                           | Android establishes a secure session and receives the expected grant.                                              | Device log with identifiers redacted and Hub request status.           |
| S28-03 | Wrong trust anchor                                                             | Android rejects the connection as a terminal security failure and does not retry indefinitely.                     | Persisted safe reason code and no successful sync.                     |
| S28-04 | Admin-approved enrollment                                                      | The named device is accepted only after administrator approval and receives its connection profile.                | Enrollment state, device ID, policy version, and approval audit entry. |
| S28-05 | Offline without LAN or internet                                                | Local patient and appointment test writes remain usable and are placed in the encrypted outbox.                    | Synthetic record IDs, outbox count, and offline UI result.             |
| S28-06 | LAN recovery                                                                   | Pending local writes synchronize after the Hub becomes reachable.                                                  | Acknowledgment state, cursor/delta result, and health transition.      |
| S28-07 | Two-device concurrent synchronization                                          | Device-scoped ordering and claims prevent one device from monopolizing the queue.                                  | Per-device counts, timestamps, claim outcomes, and final states.       |
| S28-08 | Android process death during transmission                                      | The lease eventually expires, the event returns to `pending`, and a later run can claim it.                        | Before/after outbox rows and attempt count.                            |
| S28-09 | Cancellation during transmission                                               | The matching claim is released; a stale worker cannot release a newer claim.                                       | Claim token and affected-row transition evidence.                      |
| S28-10 | Hub outage                                                                     | Android records a retryable failure and WorkManager schedules retry without losing local writes.                   | Sync-health state, reason code, retry timestamp, and outbox state.     |
| S28-11 | Hub restart and TLS recovery                                                   | Android reconnects using the correct trust anchor and resumes synchronization.                                     | Restart timestamps, successful session, and final acknowledgment.      |
| S28-12 | Duplicate acknowledgment or repeated delivery                                  | The operation remains idempotent and does not create a duplicate clinical or appointment record.                   | Server version, operation ID, and final local state.                   |
| S28-13 | Conflict or rejection                                                          | The event enters the documented conflict or terminal state and remains available for the appropriate workflow.     | Conflict/rejection metadata without clinical payload leakage.          |
| S28-14 | Offline-access expiry                                                          | The device blocks protected synchronization or access according to policy while preserving safe recovery behavior. | Policy expiry state and administrator recovery result.                 |

## Fairness and crash-safety procedure

Create at least ten synthetic outbox events for each Android device, with distinct device IDs and monotonic occurrence times. Start synchronization on both devices within the same short interval. Verify that each device selects only its own events, that event order is `occurredAt` then ID, and that a device’s queue cannot claim another device’s rows.

Terminate one Android process after a claim is recorded but before the acknowledgment is finalized. Wait beyond the configured 120-second lease, or use a controlled test clock where available. Start synchronization again and verify that the event is recovered to `pending`, receives a higher attempt count on the next claim, and is eventually finalized exactly once.

For a stale-worker test, claim an event with token A, allow or simulate token A’s expiry, claim it again with token B, and attempt a release using token A. The release must affect zero rows and must not alter token B’s active claim.

## Evidence and privacy requirements

Every run should produce a small manifest containing the test-run ID, application version, Hub build, Android model/API level, synthetic-data marker, certificate/trust-anchor version, scenario ID, start and finish times, expected result, observed result, and pass/fail status. Logs must redact usernames, passwords, private keys, certificate filesystem paths, session secrets, patient payloads, and full clinical text.

A failed scenario should preserve the sanitized report and the minimal database metadata necessary to reproduce it. Do not copy production databases into the test process. Do not connect the harness to a production Hub or production Android profile.

## Completion gate

Step 28 is complete only when the desktop harness passes, the Android build gate from Step 27 passes, all required scenarios execute on at least two physical Android devices, no real patient data is used, and the resulting sanitized evidence is reviewed. Until then, the repository harness is preparation and desktop-controlled validation—not proof of full real-device readiness.

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/41e8a79/scripts/step27-android-build-gate.mjs "Elite Clinic Step 27 Android build gate"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/6449c5c/scripts/step25-tls-recovery-e2e.mjs "Elite Clinic Step 25 TLS recovery harness"
[3]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/6c2d9f8/apps/android/app/src/main/java/com/elite/clinic/sync/SecureSyncCoordinator.kt "Elite Clinic Android secure synchronization coordinator"
