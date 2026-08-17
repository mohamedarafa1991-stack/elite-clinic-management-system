# Step 24 Plan: Android TLS Failure Handling and End-to-End LAN Recovery

## Audit conclusion

The Android client fails closed when it cannot establish the desktop Hub’s certificate-pinned HTTPS connection. `LanTlsConnection` rejects non-HTTPS endpoints, malformed PEM certificates, untrusted certificates, hostname mismatches, and peer certificates whose DER bytes do not exactly match the persisted certificate pin. `LanSyncSessionFactory` rejects invalid session grants, server ephemeral-key fingerprint mismatches, transcript mismatches, invalid key confirmation, stale validity windows, and enrollment-policy expiry. `LanSyncHttpSession` rejects redirects, unauthorized/forbidden responses, expired sessions, and closed sessions.

This is the correct security posture for a local clinic system: Android does not downgrade to HTTP and does not bypass certificate validation when the Hub is unavailable or misconfigured. The current error paths also ensure that encrypted session keys are not used after a closed or expired session.

## Android behavior by desktop failure state

| Desktop condition                                       | Android result                                                                                                                                              | Current scheduling consequence                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Hub TLS required but certificate/key missing            | Session creation fails before session-init with a desktop-availability error when the endpoint cannot be reached, or the profile’s TLS setup fails locally. | `SecureSyncCoordinator` retries because all `openSession()` exceptions are currently treated as transient.             |
| Hub certificate PEM malformed                           | `LanTlsConnection.configure()` throws `ELITE_LAN_TLS_CERTIFICATE_INVALID`.                                                                                  | Coordinator currently returns `retry = true`; the same permanent profile error can repeat indefinitely.                |
| Hub certificate differs from Android pin                | TLS trust or exact peer-certificate comparison fails.                                                                                                       | Coordinator currently returns `retry = true`; this should be terminal until an administrator reprovisions the profile. |
| Hub hostname/IP absent from certificate SAN             | Hostname verifier rejects the connection.                                                                                                                   | Coordinator currently returns `retry = true`; this is a permanent endpoint/certificate configuration error.            |
| Hub listener is down or network path is unavailable     | Connection exception is treated as transient.                                                                                                               | Correctly retries through WorkManager backoff.                                                                         |
| Hub returns HTTP 401/403                                | `SECURE_SESSION_REJECTED` is thrown.                                                                                                                        | WorkManager returns terminal failure, but the coordinator’s `openSession()` catch currently masks this as retry.       |
| Hub returns HTTP 408, 429, or 5xx                       | `IOException` is thrown.                                                                                                                                    | Correctly becomes a retry path.                                                                                        |
| Hub returns a redirect                                  | `SECURE_LAN_REDIRECT_REJECTED` is thrown.                                                                                                                   | Should be terminal; currently masked as retry during session opening.                                                  |
| Hub TLS is repaired and Android profile remains correct | A subsequent session attempt can establish a new grant and resume verified sync.                                                                            | Recovery depends on WorkManager retry still being scheduled; there is no explicit Android “retry now” control yet.     |

## Primary cross-platform gap

The key defect is in `SecureSyncCoordinator.runOnce()`. The `transport.openSession()` block catches `CancellationException` separately but catches every other `Exception`, including `SecurityException`, and converts it to `SyncRunResult(retry = true)`. This means permanent failures such as certificate-pin mismatch, invalid local PEM, invalid Hub grant, revoked enrollment, redirect rejection, and expired policy may be retried indefinitely. It also prevents `SyncWorker` from reaching its intended terminal `SecurityException → Result.failure(...)` branch.

The next implementation should introduce a typed failure taxonomy or, at minimum, rethrow `SecurityException` from `openSession()` while preserving ordinary I/O exceptions as retryable. The same distinction should be retained for delta and outbox requests. Permanent profile or trust-anchor errors should be surfaced as terminal and require administrator reprovisioning; connection refusal, timeout, HTTP 408, HTTP 429, and HTTP 5xx should remain retryable.

## Existing admin recovery coverage

The desktop recovery implementation currently has unit-level coverage for safe error redaction and two startup configuration failures. The renderer and main-process capability check are implemented, but there is no automated test that launches the Electron main process, observes the failed status in the renderer, authenticates an Admin, edits or supplies corrected TLS configuration, presses the retry action, and confirms that the server becomes ready.

There is also no cross-platform test connecting an Android session factory to the recovered desktop server. The earlier TypeScript loopback test validates encrypted LAN sync, but it does not exercise the desktop admin recovery state machine or Android’s certificate-pinned HTTPS implementation. Android Gradle/device validation is still pending because the repository environment lacks the Android SDK, Gradle executable, and wrapper.

## Recommended next development step

The next step should be **Step 24: Cross-platform TLS failure classification and end-to-end LAN recovery verification**. It should be implemented in the following order.

| Priority | Deliverable                             | Acceptance criterion                                                                                                                                                                       |
| -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | Typed Android sync failure taxonomy     | Certificate, hostname, pin, grant, enrollment, redirect, and expiry failures are terminal; connection/timeouts/408/429/5xx are retryable.                                                  |
| 2        | Coordinator classification fix          | `SecurityException` from `openSession()` reaches `SyncWorker` as terminal failure; I/O exceptions still produce WorkManager retry.                                                         |
| 3        | Android sync-health persistence         | Persist last attempt, state, safe reason code, retryability, and next retry time without storing certificate/private-key data.                                                             |
| 4        | Android recovery trigger                | After desktop recovery, WorkManager can run an immediate sync through an explicit app-level retry operation; periodic scheduling remains intact.                                           |
| 5        | Desktop admin recovery integration test | Missing TLS configuration produces a sanitized failed status; authorized Admin retry after corrected configuration produces `ready`; unauthorized retry is rejected.                       |
| 6        | Android/desktop TLS integration test    | Wrong certificate pin fails terminally; corrected pin establishes HTTPS session-init, verifies the signed grant, performs encrypted delta pull, and acknowledges a synthetic outbox event. |
| 7        | Failure/recovery matrix                 | Listener down, TLS misconfiguration, wrong pin, wrong SAN, HTTP 401, HTTP 503, corrected TLS, and idempotent retry are each covered.                                                       |

## Proposed end-to-end test sequence

The test harness should generate synthetic certificate material in a temporary directory and never commit or attach the private key. It should start the desktop Hub with `ELITE_SYNC_TLS_REQUIRED=true` and no certificate paths, assert that the main process exposes a sanitized failed status, and verify that the LAN port is not accepting connections. The test should then set matching certificate and key paths, authenticate a synthetic Admin with `device.manage`, invoke the restart IPC operation, and assert a `ready` status.

Next, the harness should create an Android connection profile with the wrong certificate pin and run a session attempt. The Android side must return a typed terminal pin/trust failure and must not schedule unbounded retries. The profile should then be replaced with the correct public certificate PEM and trust anchor. A second session attempt must complete the signed session-init handshake, establish the AES-GCM frame channel, pull a signed synthetic delta, and submit an outbox event that becomes acknowledged.

Finally, the harness should stop the Hub listener and run Android synchronization again. This path must be retryable and must preserve the pending outbox event. After the desktop Admin restarts LAN TLS, an immediate retry must reconnect, verify a fresh grant, apply the delta, and acknowledge the same operation idempotently.

## Security and operational constraints

The Android client must never fall back to HTTP or disable hostname and certificate validation. The desktop renderer must never receive TLS file paths or raw exception messages. The Admin retry IPC remains protected by the main-process capability check. All patient and synchronization payloads in the tests must be synthetic. The private key must remain only in the temporary desktop test directory and be deleted during teardown.

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/1fdba700c4733ece32e77ed49f613b2e44be4a04/apps/android/app/src/main/java/com/elite/clinic/sync/LanSyncSessionFactory.kt "Android LAN session factory"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/1fdba700c4733ece32e77ed49f613b2e44be4a04/apps/android/app/src/main/java/com/elite/clinic/sync/LanSyncHttpSession.kt "Android encrypted HTTP session"
[3]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/1fdba700c4733ece32e77ed49f613b2e44be4a04/apps/android/app/src/main/java/com/elite/clinic/sync/SecureSyncCoordinator.kt "Android secure synchronization coordinator"
[4]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/1fdba700c4733ece32e77ed49f613b2e44be4a04/apps/desktop/src/main/lan-sync-status.test.ts "Desktop TLS recovery regression tests"
[5]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/1fdba700c4733ece32e77ed49f613b2e44be4a04/docs/step-23-tls-startup-notification-and-recovery.md "Desktop TLS startup notification and recovery note"
