# Step 24: Android Sync Failure Classification and Recovery State

## Implemented behavior

Android synchronization now uses `SyncFailureException` with a safe `reasonCode` and explicit `retryable` flag. Terminal failures include invalid TLS certificates, certificate pin or peer verification failures, hostname/security failures, malformed profiles, invalid session grants, redirects, unauthorized responses, expired sessions, and encrypted-frame authentication failures. Retryable failures include connection refusal, timeouts, HTTP 408, HTTP 429, and HTTP 5xx responses.

The coordinator preserves cancellation, restores outbox events from `sending` to `pending` when a request fails, rethrows terminal typed failures to WorkManager, returns retry results for transient failures, and closes sessions without allowing cleanup errors to replace the synchronization result.

## Durable sync health

Room database version 4 adds `sync_health`, keyed by Android device ID. The health record stores only safe operational fields: state, reason code, retryability, last attempt time, last successful sync time, next retry time, and updated time. It does not store certificate paths, private keys, raw exception messages, or patient payloads.

The state values are `running`, `ready`, `retry-scheduled`, and `blocked`. Retryable failures receive a next-retry timestamp based on the local 30-second backoff hint. Terminal failures remain `blocked` until the profile or desktop configuration is corrected and an explicit retry is requested.

## Explicit retry-now operation

`SyncWorker.enqueueRetryNow(context)` uses `ExistingWorkPolicy.REPLACE`, ensuring an administrator- or application-triggered recovery attempt is not suppressed by a stale immediate work request. `EliteApplication.retrySecureSyncNow()` exposes this operation to the Android application boundary while preserving the existing periodic three-hour WorkManager schedule.

## Verification status

The Android JVM test suite now includes typed failure-classification coverage for I/O retryability, terminal security exceptions, TLS handshake failures, unsafe reason-code fallback, and cancellation preservation. Android Gradle execution remains pending because the current sandbox has no Android SDK, Gradle executable, or Gradle wrapper. TypeScript and desktop verification should be rerun after the source change; the local-only GitHub workflow remains excluded from commits.
