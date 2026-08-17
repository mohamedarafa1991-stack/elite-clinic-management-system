# Step 25 Plan: Cross-Platform TLS Recovery End-to-End Verification

## Review result

The Step 24 recovery plan is directionally correct but is now partly stale. Typed Android failure classification, Room sync-health persistence, terminal-versus-retryable coordinator behavior, and the explicit `retrySecureSyncNow()` operation are implemented and committed in `a0d0284`. The remaining work is verification and testability rather than another failure-taxonomy change.

The current desktop tests validate safe message redaction and fail-closed TLS startup configuration, but they do not drive the actual Electron main-process IPC or renderer state. The current Android JVM test validates the classifier, but Android Gradle execution is still unavailable in the repository sandbox. The existing TypeScript LAN loopback test verifies encrypted synchronization but does not use the Android certificate-pinned HTTPS client or the desktop Admin recovery state machine.

## Recommended next development step

The next step should be **Step 25: Cross-platform TLS recovery end-to-end verification and Android build reproducibility**. It should establish testable seams, run the complete synthetic recovery matrix, and produce a release-gate report.

| Workstream                    | Deliverable                                                                                                                   | Acceptance criterion                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Android build reproducibility | Add or restore a Gradle wrapper and verify the Android project on a workstation with Android SDK/API 29+ support.             | `./gradlew test` and the relevant Android build tasks execute reproducibly without manual dependency substitution.                                                             |
| Desktop recovery seam         | Extract the LAN startup/restart state machine from Electron bootstrap into a small injectable controller or factory boundary. | Unit tests can exercise failed start, sanitized status, authenticated restart, successful ready state, and cleanup without launching a full GUI.                               |
| Android transport seam        | Inject the HTTPS connection or transport boundary used by `LanTlsConnection` and `LanSyncSessionFactory`.                     | JVM tests can simulate wrong pin, hostname mismatch, HTTP 503, HTTP 401, redirect, and successful TLS handshake deterministically.                                             |
| Admin authorization           | Test the main-process retry IPC with Admin/device-management, non-admin, expired-session, and invalid-token contexts.         | Only an authorized Admin can transition desktop LAN status from `failed` to `ready`.                                                                                           |
| Cross-platform recovery       | Connect the recovered desktop server to the Android session client using synthetic certificate and signing material.          | Wrong pin is terminal and health becomes `blocked`; corrected pin establishes a fresh grant and encrypted session.                                                             |
| Data recovery                 | Pull a signed synthetic delta and submit a synthetic outbox event before and after a listener outage.                         | Delta cursor and resource metadata remain correct; the outbox event returns to `pending` during outage and becomes `acknowledged` after recovery, including idempotent replay. |
| Health and WorkManager        | Verify `running`, `blocked`, `retry-scheduled`, and `ready` transitions plus `retrySecureSyncNow()` replacement semantics.    | Permanent errors do not request retry; transient errors do; explicit retry-now replaces stale immediate work without disturbing periodic work.                                 |

## Required end-to-end scenarios

The test matrix must cover the following transitions using synthetic data only.

| Scenario                               | Expected Android classification                                                                                           | Expected desktop/health result                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| TLS required with no certificate paths | Terminal configuration failure if the client can observe the profile/configuration error; otherwise no successful session | Desktop status `failed`; no LAN listener; Android health `blocked` when the profile is invalid. |
| Wrong certificate pin                  | Terminal `SYNC_TLS_CERTIFICATE_FAILURE` or equivalent safe pin reason                                                     | Android health `blocked`; no repeated WorkManager retry.                                        |
| Correct certificate and trust anchor   | Successful session-init and grant verification                                                                            | Android health progresses `running` → `ready`; desktop remains `ready`.                         |
| Wrong certificate SAN/hostname         | Terminal TLS security failure                                                                                             | Android health `blocked`; remediation requires corrected profile/certificate.                   |
| Hub listener stopped                   | Retryable transport failure                                                                                               | Android health `retry-scheduled`; pending outbox remains pending.                               |
| Hub returns HTTP 503                   | Retryable session/request failure                                                                                         | WorkManager receives `Result.retry()`.                                                          |
| Hub returns HTTP 401/403               | Terminal session rejection                                                                                                | WorkManager receives `Result.failure()` with a safe reason code.                                |
| Hub returns redirect                   | Terminal protocol/security failure                                                                                        | No downgrade or redirect follow; health becomes `blocked`.                                      |
| Admin corrects TLS and presses retry   | Desktop restart succeeds                                                                                                  | Status transitions to `ready`; `retrySecureSyncNow()` launches a replacement one-time request.  |
| Replayed outbox event after recovery   | Accepted or already-applied                                                                                               | Event is not duplicated; final state is `acknowledged`.                                         |

## Test architecture

The desktop side should expose a test-only injectable `LanSyncLifecycleController` or equivalent abstraction around the existing `LanSyncHttpServer`. It should accept a server factory and an authorization boundary, retain the sanitized public state, and make `start`, `stop`, and `restart` deterministic. The production Electron bootstrap should remain the only place that supplies real environment variables and the real server factory.

The Android side should retain the real certificate and host-verification logic for instrumented tests while adding an injectable connection factory for JVM tests. The test fixture should use a temporary self-signed certificate with explicit SANs, a synthetic Ed25519 Hub signing key, synthetic enrollment policy, and an in-memory or temporary encrypted database. Private keys must be deleted during teardown and must never enter Git or test output.

The final integrated test should start the desktop Hub in a failed TLS configuration, assert the sanitized status, authenticate a synthetic Admin, apply corrected certificate paths, invoke the recovery operation, and assert that the server is ready. Android should first attempt with the wrong public certificate and record a terminal health failure. After installing the matching public certificate, Android should establish a signed session, verify the transcript and key confirmation, pull a signed delta, and submit an outbox event. The Hub should then be stopped to prove retry behavior and restarted through the Admin flow to prove recovery and idempotent acknowledgment.

## Local harness

The drafted harness is `scripts/step25-tls-recovery-e2e.mjs`. After building the workspace and desktop server, run it with:

```bash
node scripts/step25-tls-recovery-e2e.mjs
```

The harness generates temporary RSA-3072 certificates with `localhost` and `127.0.0.1` SANs, starts the real compiled `LanSyncHttpServer`, verifies that TLS-required startup fails without certificate paths, verifies a trusted HTTPS probe after recovery, verifies that a wrong trust anchor fails closed, verifies connection failure while the listener is stopped, and verifies HTTPS recovery after restart. Temporary certificates and private keys are deleted during teardown. An optional `ELITE_ANDROID_E2E_COMMAND` environment variable invokes the Android Gradle/device portion with the Hub URL and temporary certificate paths; it was not configured in the local sandbox, so Android scenarios remain pending for the Android build workstation.

The local desktop smoke matrix passed all of those available scenarios. The result was: missing TLS configuration failed closed; recovered HTTPS accepted a certificate-trusted probe; the wrong trust anchor failed closed; listener outage produced a connection failure; and listener restart recovered HTTPS successfully.

## Release gates

Step 25 should not be considered complete until the Android Gradle build executes, the desktop recovery controller has direct tests, the Android classifier and sync-health tests execute, and the cross-platform matrix passes without real patient data. The final report should include exact commit hashes, test counts, the Android SDK/API level used, certificate-generation parameters excluding private key contents, and any limitations that remain specific to physical-device LAN validation.

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/a0d0284ed5bd4fd64241456094bc9c2b354bb058/apps/android/app/src/main/java/com/elite/clinic/sync/SyncFailure.kt "Typed Android synchronization failure classifier"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/a0d0284ed5bd4fd64241456094bc9c2b354bb058/apps/android/app/src/main/java/com/elite/clinic/sync/SecureSyncCoordinator.kt "Android secure synchronization coordinator"
[3]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/a0d0284ed5bd4fd64241456094bc9c2b354bb058/apps/android/app/src/main/java/com/elite/clinic/sync/SyncWorker.kt "Android WorkManager synchronization worker"
[4]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/a0d0284ed5bd4fd64241456094bc9c2b354bb058/docs/step-24-android-sync-failure-classification.md "Step 24 Android sync failure implementation note"
[5]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/a0d0284ed5bd4fd64241456094bc9c2b354bb058/docs/step-24-android-tls-failure-and-end-to-end-recovery-plan.md "Step 24 Android TLS recovery plan"
