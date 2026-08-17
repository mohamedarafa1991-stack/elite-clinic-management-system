# Step 23 Verification: SecureSyncCoordinator and Desktop LAN TLS

## Executive conclusion

The desktop LAN TLS implementation is structurally correct and was verified with a real temporary certificate against the compiled `LanSyncHttpServer`. The server successfully accepted an HTTPS `POST /sync/lan` request with certificate verification enabled and returned HTTP 200. The Android client’s certificate-pinning design is compatible with this configuration, provided the persisted certificate PEM matches the Hub certificate exactly and the certificate SAN contains the address used by Android.

The coordinator has sound state restoration for most outbox failures and closes the session in a `finally` block. However, one important error-classification issue remains: a `SecurityException` thrown while opening a session is caught by the broad `Exception` handler and converted into `retry = true`. Authentication, enrollment, certificate, grant, and session-expiry failures should not silently retry forever. They should be surfaced as a terminal security failure, or be classified explicitly as a non-retryable synchronization result.

## SecureSyncCoordinator findings

| Path                                 | Current behavior                                                                                                       | Assessment                                                                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid batch size                   | `require` throws before session creation; `SyncWorker` catches it as a generic exception and returns `Result.retry()`. | A permanent configuration error can retry indefinitely. Classify as terminal failure or validate at construction.                                                                                       |
| No profile and no pending events     | Returns success without opening transport.                                                                             | Correct and efficient.                                                                                                                                                                                  |
| Missing transport                    | Returns `retry = true`.                                                                                                | Correct for an unavailable or not-yet-provisioned profile, although the reason should be observable.                                                                                                    |
| `openSession()` cancellation         | Rethrows cancellation.                                                                                                 | Correct; cancellation should not be converted into a normal retry or failure.                                                                                                                           |
| `openSession()` security failure     | Caught by `catch (_: Exception)` and converted to `retry = true`.                                                      | **High-priority issue.** Authentication, certificate pinning, invalid grants, revoked enrollment, and expired sessions may retry indefinitely and are hidden from `SyncWorker`’s security-failure path. |
| Delta verification security failure  | Re-throws `SecurityException("SECURE_DELTA_VERIFICATION_FAILED")`.                                                     | Correct terminal classification, but the original reason code is discarded. Preserve a safe reason code for diagnostics.                                                                                |
| Delta transport/business exception   | Sets `retry = true`, stops further scopes, then closes the session.                                                    | Correct retry behavior; already-applied cursor changes remain transactional in `SyncRepository`.                                                                                                        |
| Outbox claim                         | Transitions `pending → sending` with a compare-and-set update before submission.                                       | Correct against duplicate local claims.                                                                                                                                                                 |
| Outbox cancellation/security failure | Restores `sending → pending`, then rethrows.                                                                           | Correct recovery behavior.                                                                                                                                                                              |
| Outbox transient exception           | Restores `sending → pending`, sets retry, and stops the batch.                                                         | Correct.                                                                                                                                                                                                |
| Accepted/already-applied result      | Transitions `sending → acknowledged`.                                                                                  | Correct idempotent acknowledgment behavior.                                                                                                                                                             |
| Conflict/rejected result             | Transitions `sending` to the corresponding terminal state.                                                             | Correct, assuming the UI exposes the resulting state.                                                                                                                                                   |
| Final close                          | `session.close()` executes in `finally`.                                                                               | Correct containment, but an exception from `close()` can replace an otherwise successful result. Close should be best-effort and non-masking.                                                           |
| Pending-event query                  | Queries the first pending rows globally, then skips events whose device ID differs.                                    | Safe from cross-device submission, but multiple-device deployments can starve one device. Prefer a DAO query filtered by `deviceId`.                                                                    |
| WorkManager mapping                  | `retry=true` becomes `Result.retry()`, `SecurityException` becomes terminal failure, other exceptions retry.           | Good overall policy, but it depends on the coordinator preserving the security exception from `openSession()`.                                                                                          |

### Recommended coordinator correction

The session-opening block should classify security failures separately:

```kotlin
val session = try {
    transport.openSession()
} catch (error: CancellationException) {
    throw error
} catch (error: SecurityException) {
    throw error
} catch (_: Exception) {
    return SyncRunResult(0, 0, 0, 0, retry = true)
}
```

The next refinement should also change `pendingEvents(limit)` to a device-filtered DAO method such as `pendingEvents(deviceId, limit)`, preserve a safe reason code when delta verification fails, and make `close()` non-masking:

```kotlin
try {
    session.close()
} catch (_: Exception) {
    // Do not replace the synchronization result with a cleanup failure.
}
```

## Desktop LAN TLS verification

`LanSyncHttpServer.start()` reads the following environment variables at startup:

| Variable                       | Meaning                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `ELITE_SYNC_TLS_CERT_PATH`     | PEM-encoded Hub certificate.                                 |
| `ELITE_SYNC_TLS_KEY_PATH`      | PEM-encoded private key corresponding to the certificate.    |
| `ELITE_SYNC_TLS_REQUIRED=true` | Refuses to start if both certificate paths are not supplied. |
| `ELITE_SYNC_BIND_ADDRESS`      | Listener address; defaults to `0.0.0.0`.                     |
| `ELITE_SYNC_PORT`              | Listener port; defaults to `8787`.                           |

When both certificate paths are set, the server creates an HTTPS server. If exactly one path is set, startup is rejected. If neither is set, the server falls back to HTTP unless `ELITE_SYNC_TLS_REQUIRED=true`. The HTTP server still enforces the 1 MiB request-body limit and retains the signed session-init and encrypted-frame routes.

The Electron startup currently catches a LAN-server startup rejection and silently sets `lanSyncServer = undefined`. This prevents a crash but makes a TLS configuration error difficult for an administrator to diagnose. The production UI or structured local log should expose a generic message such as “LAN synchronization could not start because TLS configuration is invalid,” without revealing key paths or private-key data.

The server binds to `0.0.0.0` by default for LAN access. Windows Defender Firewall must allow the configured TCP port, and the certificate SAN must include the exact IP address or DNS name that Android uses. A certificate containing only `localhost` is valid for loopback testing but is not valid for a phone connecting to the Hub’s LAN IP.

## Verified certificate-generation workflow

The following command generated the temporary test certificate used for verification. It used RSA-3072, SHA-256, a 30-day lifetime, and SANs for `localhost` and `127.0.0.1`:

```powershell
openssl req -x509 -newkey rsa:3072 -sha256 -nodes `
  -keyout hub-key.pem `
  -out hub-cert.pem `
  -days 30 `
  -subj "/CN=Elite Clinic Hub (loopback)" `
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

For a real Windows Hub, replace the loopback SANs with the stable Hub DNS name and every LAN IP address that Android will use. For example:

```powershell
openssl req -x509 -newkey rsa:3072 -sha256 -nodes `
  -keyout C:\EliteClinic\certs\hub-key.pem `
  -out C:\EliteClinic\certs\hub-cert.pem `
  -days 365 `
  -subj "/CN=Elite Clinic Hub" `
  -addext "subjectAltName=DNS:elite-hub.local,IP:192.168.1.20"
```

Verify the certificate before installing it:

```powershell
openssl x509 -in C:\EliteClinic\certs\hub-cert.pem -noout `
  -subject -issuer -dates -fingerprint -sha256
openssl x509 -in C:\EliteClinic\certs\hub-cert.pem -noout -text |
  Select-String -Pattern "Subject Alternative Name" -Context 0,1
openssl verify -CAfile C:\EliteClinic\certs\hub-cert.pem `
  C:\EliteClinic\certs\hub-cert.pem
```

The temporary certificate produced during this audit had the expected SANs and passed self-verification. A Node HTTPS loopback test succeeded with `rejectUnauthorized=true`, and the real compiled `LanSyncHttpServer` accepted an HTTPS `POST /sync/lan` request and returned HTTP 200. No private key was copied into the repository or Android profile.

Configure the Hub process with:

```powershell
[Environment]::SetEnvironmentVariable(
  "ELITE_SYNC_TLS_CERT_PATH",
  "C:\EliteClinic\certs\hub-cert.pem",
  "User"
)
[Environment]::SetEnvironmentVariable(
  "ELITE_SYNC_TLS_KEY_PATH",
  "C:\EliteClinic\certs\hub-key.pem",
  "User"
)
[Environment]::SetEnvironmentVariable(
  "ELITE_SYNC_TLS_REQUIRED",
  "true",
  "User"
)
```

Restart the desktop application after setting environment variables. Keep the private key on the Windows Hub only, protect its filesystem ACL so only the clinic application account and administrators can read it, and back up the certificate and private key through the clinic’s controlled recovery process. The Android profile receives only the public certificate PEM and the independent Ed25519 Hub trust anchor.

## Verification results

| Check                                              | Result                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Temporary certificate generation                   | Passed                                                                                         |
| SAN inspection                                     | Passed for `localhost` and `127.0.0.1`                                                         |
| OpenSSL self-verification                          | Passed                                                                                         |
| Generic Node HTTPS trust/hostname test             | Passed with certificate verification enabled                                                   |
| Real compiled `LanSyncHttpServer` HTTPS smoke test | Passed; `/sync/lan` returned HTTP 200                                                          |
| TypeScript tests and typecheck                     | Previously passed: 66 tests, workspace typecheck, and desktop build                            |
| Android Gradle build                               | Not available in the sandbox because there is no Gradle wrapper, system Gradle, or Android SDK |

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/322f881ec3f8dbffee240f7df2aa1b91847c4eb4/apps/android/app/src/main/java/com/elite/clinic/sync/SecureSyncCoordinator.kt "SecureSyncCoordinator at Step 23 commit"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/322f881ec3f8dbffee240f7df2aa1b91847c4eb4/apps/desktop/src/main/lan-sync-server.ts "Desktop LAN server at Step 23 commit"
[3]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/322f881ec3f8dbffee240f7df2aa1b91847c4eb4/apps/desktop/src/main/index.ts "Desktop startup lifecycle at Step 23 commit"
