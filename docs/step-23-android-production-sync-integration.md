# Step 23: Android Production Sync Integration

## Implementation slice

This increment connects the previously isolated Android LAN session factory to production-oriented application boundaries. The Android app now has a Room entity and DAO for an active encrypted connection profile, a Keystore-wrapped SQLCipher passphrase path, a profile repository that converts verified enrollment data into a validated `SyncDevicePolicy`, certificate-pinned HTTPS helpers, stricter session-grant validation, explicit frame-codec close semantics, and a bidirectional `SecureSyncCoordinator` path.

The implementation intentionally requires `https://` for Android LAN sessions. The desktop LAN server now supports certificate-backed HTTPS through `ELITE_SYNC_TLS_CERT_PATH` and `ELITE_SYNC_TLS_KEY_PATH`, with `ELITE_SYNC_TLS_REQUIRED=true` available to fail closed when TLS material is missing. Android stores the PEM certificate pin in the encrypted connection profile and configures a per-connection trust manager and certificate comparison before sending session-init or encrypted frames.

## Runtime flow

| Stage                   | Implementation                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encrypted local storage | `DeviceKeyStore.databasePassphrase()` generates a random 32-byte SQLCipher passphrase, wraps it with the Android Keystore AES-GCM key, and stores only the wrapped value and IV in private preferences.                   |
| Room opening            | `EncryptedRoomFactory` loads the SQLCipher native library and creates `SupportOpenHelperFactory`; `EliteApplication.onCreate()` opens the version-3 Room database with migrations.                                        |
| Profile installation    | `SyncConnectionProfileRepository.installEnrollment()` validates enrollment deadlines and persists organization, enrollment, device, user, scope, Hub URL, TLS certificate PEM, Ed25519 trust anchor, and policy validity. |
| Session construction    | `EliteApplication.configureLanSecureSyncCoordinator()` loads the active profile and creates `LanSyncSessionFactory` through `SecureSessionTransport`.                                                                     |
| HTTPS protection        | `LanTlsConnection` trusts and compares the exact persisted Hub certificate and rejects non-HTTPS endpoints. Redirects are disabled.                                                                                       |
| Session lifecycle       | The factory validates request freshness, duplicate scopes, server ephemeral-key fingerprint, grant time bounds, enrollment deadlines, and offline-access deadlines. `LanSyncHttpSession` rejects expired/closed sessions. |
| Pull synchronization    | `SecureSyncCoordinator` loads each scope cursor, creates a fresh request nonce, requests a delta, and passes that same nonce to `VerifiedDeltaSynchronizer` for response verification before applying it transactionally. |
| Push synchronization    | After successful pulls, the coordinator drains pending outbox events and restores events to `pending` on transport failures.                                                                                              |

## Important operational requirement

The desktop Hub must be started with a certificate and private key when Android synchronization is enabled. The minimum production configuration is equivalent to:

```text
ELITE_SYNC_TLS_CERT_PATH=C:\Path\To\hub-cert.pem
ELITE_SYNC_TLS_KEY_PATH=C:\Path\To\hub-key.pem
ELITE_SYNC_TLS_REQUIRED=true
ELITE_SYNC_BIND_ADDRESS=0.0.0.0
ELITE_SYNC_PORT=8787
```

The Android connection profile must contain the matching certificate PEM and an independently verified Hub Ed25519 public-key trust anchor. The application-level signed `SessionGrant` verification remains mandatory even when TLS succeeds.

## Verification status

The TypeScript contracts, database, auth, and desktop test suites pass, as do workspace typechecking, desktop production build, formatting, and whitespace checks. Android compilation remains pending because the current sandbox has no Android SDK, system Gradle executable, or Gradle wrapper. The project now declares the official SQLCipher Android AAR and AndroidX SQLite dependency, so the next build-workstation run must generate or add the Gradle wrapper and execute the Android compile and JVM tests.

## Remaining release gates

The Android build workstation must compile the application and validate the exact `SupportOpenHelperFactory` dependency coordinates. It must add JVM tests for connection-profile expiry and malformed profile rejection, certificate-pin mismatch, session expiry/close, request-scoped nonce verification, and coordinator behavior when the outbox is empty. A device or emulator test must then demonstrate a synthetic signed delta pull and synthetic outbox acknowledgment over the certificate-backed LAN Hub.
