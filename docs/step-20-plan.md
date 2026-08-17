# Step 20 Plan: Android Secure Session and Device-Enrollment Foundation

## Executive decision

Step 20 should turn the current Android scaffold into a secure, usable local-first client foundation. The focus is **named-device enrollment, secure local session management, encrypted Room storage, inactivity locking, offline-access expiry, and optional biometric unlock**. It should establish the security boundary required before the Android client receives any patient data or performs broad synchronization.

Step 19 will provide signed status-package verification. Step 20 should consume that trust model and add device-local identity and storage protections without making Android an issuer, signer-key administrator, or cloud client.

Android Keystore is the correct platform boundary for non-exportable local encryption keys and user-authentication restrictions [1]. BiometricPrompt should be used for system-managed authentication, with the exact supported authenticator set checked at runtime and a PIN or device credential retained as the recovery path [2].

## Objectives

Step 20 has six objectives. First, an administrator must be able to approve a named Android device and bind it to an enrolled staff account and role. Second, the Android client must establish an Elite PIN or equivalent local unlock secret without storing the secret itself. Third, protected Room data must be encrypted at rest with key material protected by Android Keystore. Fourth, the app must enforce the existing ten-minute inactivity lock and thirty-day offline-access expiry defaults. Fifth, optional strong biometric unlock must be bound to the local encryption/session boundary and must fail closed when biometric enrollment or key state changes. Sixth, the app must expose safe lifecycle, recovery, and “offline device cannot be remotely wiped” warnings to users and administrators.

## Non-goals

Step 20 will not implement full patient-record synchronization, clinical encounter editing, remote wipe, mobile signing-key rotation, cloud authentication, or background upload of patient data. It will not silently bypass an expired offline-access window because a device has cached data. It will not use a shared phone number or hardware identifier as sufficient enrollment proof.

## Security and trust model

The Windows Hub remains authoritative for user, device, role, and session policy. The Android device maintains a local, signed enrollment record and local policy snapshot. The device may continue to display limited local status information while offline, but access to protected patient data requires a valid local session and an unexpired offline-access grant.

| Boundary         | Threat                                                    | Step 20 control                                                                                                                        |
| ---------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Enrollment       | Unapproved phone obtains clinic access                    | Admin-approved named-device enrollment code or USB/LAN enrollment package, one-time use, expiration, role binding, and audit event     |
| Local unlock     | PIN interception or offline guessing                      | Slow, bounded verifier; rate limiting and lockout; never store the PIN; key release only after successful local authentication         |
| Device storage   | Database copied from the phone                            | Encrypted Room database and Keystore-protected data key; `allowBackup=false`; no sensitive plaintext logs                              |
| Biometric change | New biometric enrolled after device compromise            | Biometric-bound key invalidation or explicit re-enrollment policy; require Elite PIN/device credential fallback                        |
| Session          | Data visible after inactivity or process backgrounding    | Ten-minute inactivity lock, lifecycle-triggered lock, explicit logout, and memory-clearing for session secrets                         |
| Offline expiry   | Device uses data indefinitely without Hub reauthorization | Signed or authenticated offline-access expiry, monotonic time checks, visible expired state, and no silent extension                   |
| Device loss      | Admin assumes remote wipe works offline                   | Persistent user warning; next-connectivity revocation workflow is a later feature; local logout and local destruction remain available |
| App update       | Untrusted APK replaces the client                         | Admin-owned signing keystore, signed APK verification, version policy, update prompt, and rollback runbook                             |

## Android module changes

The current Android module targets API 29 provisionally, uses Compose, Room, WorkManager, and security libraries, and disables application backup in the manifest. Step 20 should add the biometric dependency and the secure-session source tree while preserving the current target and backup posture.

Recommended package layout:

```text
apps/android/app/src/main/java/com/elite/clinic/
├── EliteApplication.kt
├── MainActivity.kt
├── auth/
│   ├── EnrollmentRepository.kt
│   ├── LocalSessionManager.kt
│   ├── PinVerifier.kt
│   ├── BiometricUnlockController.kt
│   └── SessionPolicy.kt
├── crypto/
│   ├── AndroidKeyStoreManager.kt
│   ├── ProtectedDatabaseKey.kt
│   └── KeyInvalidationHandler.kt
├── data/local/
│   ├── EliteRoomDatabase.kt
│   ├── EnrollmentDao.kt
│   ├── SessionPolicyDao.kt
│   ├── SecureStatusDao.kt
│   └── entities/
├── sync/
│   ├── EnrollmentImportWorker.kt
│   └── PolicyRefreshWorker.kt
└── ui/
    ├── enrollment/
    ├── lock/
    ├── security/
    └── dashboard/
```

## Enrollment contract

The Hub must issue an enrollment package that is safe to transport through Admin-controlled USB or LAN exchange. The package must be signed by an accepted Hub key or be protected by a one-time enrollment secret delivered through a separate channel. It must not contain the Windows private signing key.

| Field                 | Requirement                                                       |
| --------------------- | ----------------------------------------------------------------- |
| `schemaVersion`       | Literal `1`                                                       |
| `enrollmentId`        | Opaque one-time identifier                                        |
| `organizationId`      | Elite Clinic organization identity                                |
| `userId`              | Approved staff account identifier                                 |
| `role`                | Admin, Doctor, Nurse, or Receptionist                             |
| `deviceName`          | Admin-assigned human-readable device name                         |
| `devicePublicKey`     | Android-generated public key or enrollment challenge binding      |
| `issuedAt`            | Hub timestamp                                                     |
| `expiresAt`           | Short enrollment window, recommended 24 hours                     |
| `offlineAccessUntil`  | Initial signed policy expiry, default 30 days                     |
| `allowedFeatures`     | Explicit capability subset; never infer from role alone on device |
| `issuerKeyId/version` | Hub trust metadata                                                |
| `signature`           | Ed25519 signature over canonical enrollment descriptor            |

The preferred flow is device-generated key material followed by Admin approval. The device generates a non-exportable Keystore key pair or protected enrollment key, displays a short code or QR/USB request, and the Hub signs an enrollment response bound to the device public-key fingerprint. If the current deployment cannot support device-generated key exchange, a first increment may use a one-time Admin-approved enrollment package with explicit manual confirmation and a mandatory device-key generation immediately afterward.

## Local data protection

The protected Room database must use an application-level encryption design with a randomly generated database key. The database key is wrapped or made accessible only through an Android Keystore key. The Keystore key should be non-exportable and, where supported, hardware-backed. StrongBox is an optional preference; unsupported devices must use the strongest available Keystore level and record the resulting security level for diagnostics [1].

The database layer must separate public bootstrap metadata from protected clinical data. Public or low-sensitivity metadata may include app version, enrollment state, key alias, device name, and last status-package sequence. Protected tables must include session policy, user capability snapshot, local patient data, and any queued clinical writes.

| Data class       | Storage rule                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Enrollment state | Protected Room row; integrity-bound to device key and organization                                                        |
| Local session    | Memory-first; persist only minimal expiry and lock metadata                                                               |
| Elite PIN        | Never persist plaintext or reversible secret; store only a memory-hard verifier and failure counters in protected storage |
| Database key     | Keystore-protected or wrapped; never in source, preferences, logs, or exported files                                      |
| Status metadata  | Room storage may retain metadata-only status packages from Step 19                                                        |
| Patient data     | Protected Room tables; no backup; clear on local destruction or de-enrollment                                             |
| Diagnostics      | Redacted; no patient IDs, tokens, signatures, private keys, or raw package content                                        |

The implementation must choose and document the exact Room encryption mechanism before coding. If the selected library cannot provide a maintained, compatible encrypted Room driver for API 29, use an application-level envelope-encryption layer for sensitive records rather than claiming that ordinary Room storage is encrypted.

## Session and lock policy

The `LocalSessionManager` must expose observable state to Compose and make state transitions explicit:

```text
Unenrolled
EnrolledLocked
Unlocking
Unlocked
OfflineExpired
Suspended
De-enrolled
```

The default policy is a ten-minute inactivity timeout and a thirty-day offline-access expiry. Both values are signed or authenticated policy fields and are bounded by Admin-configured minimum and maximum values. The device must lock when the app backgrounds, when the screen is locked, when the inactivity timer expires, or when a local security event invalidates the key.

A locked device may display a generic lock screen and non-sensitive app version/device state. It must not display patient names, diagnoses, encounter notes, export contents, or decrypted database values. An expired device must require a successful Hub reauthorization or Admin-approved policy refresh; local time changes must not extend access silently. The app should record last successful authenticated time and a monotonic elapsed-time reference where available, while treating large wall-clock rollback as a security event.

## PIN and biometric policy

The Elite PIN is a local unlock factor and must not be treated as a replacement for Hub authentication or Admin approval. The verifier must use a memory-hard password verifier with a versioned parameter record, a bounded retry counter, exponential delay, and a clear recovery/de-enrollment path. Failed attempts must not reveal whether the enrollment identifier or user account exists.

Biometric unlock is optional and must use `BiometricPrompt`. The app must call `canAuthenticate()` with the configured authenticator set, handle API 29 and lower limitations, and keep a PIN or device credential fallback [2]. High-value actions such as accepting a trust anchor, accepting an enrollment response, changing offline-access policy, or destroying local protected data should require explicit confirmation and step-up authentication.

Recommended key classes:

| Key                   | Purpose                                                         | Authentication                                                    |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| Database-wrapping key | Protects the randomly generated database key                    | Keystore-protected; user authentication required where compatible |
| Session-unlock key    | Releases or unwraps session material after local authentication | Auth-per-use or short validity window                             |
| Device identity key   | Binds enrollment and future Hub requests                        | Non-exportable; not used as a clinical signing key                |

If biometric enrollment changes invalidate the key, the app must require the Elite PIN or Admin re-enrollment and must not silently generate a replacement that decrypts old data. This follows the platform’s documented key invalidation behavior and makes the recovery decision explicit [1] [2].

## WorkManager and policy refresh

Step 20 should add a persistent worker for optional policy and enrollment refresh. It must be safe to run when no network or LAN exists. The worker should:

1. Read the local policy and enrollment state.
2. Check connectivity before attempting Hub access.
3. Use bounded exponential backoff for transient connection failures.
4. Stop retrying malformed, unauthorized, revoked, or expired responses without a new user/Admin action.
5. Verify any signed policy or enrollment response before changing local state.
6. Commit local policy changes transactionally.
7. Never upload patient records as part of the secure-session foundation.

## Implementation task list

| ID  | Task                                                | Deliverable                                                                                 | Acceptance criteria                                                                     |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 20A | Freeze enrollment and policy contracts              | Kotlin/TypeScript schemas and canonical descriptors                                         | Cross-language enrollment vectors verify identically                                    |
| 20B | Add Android dependencies and security configuration | Biometric library, Room/crypto decision record, manifest hardening                          | API 29 build succeeds; backup remains disabled                                          |
| 20C | Implement Android Keystore manager                  | Non-exportable key creation, alias metadata, security-level detection                       | Hardware-backed/StrongBox capability is detected without requiring it                   |
| 20D | Implement encrypted local store                     | Protected Room database or envelope-encryption layer                                        | Database copy without Keystore access cannot reveal protected data                      |
| 20E | Implement PIN verifier                              | Versioned verifier, retry counter, delay, reset/de-enrollment behavior                      | Correct PIN unlocks; wrong PIN never reveals secret or bypasses lockout                 |
| 20F | Implement device enrollment                         | Admin-approved named device, role/capability snapshot, signed expiry                        | Unapproved, expired, wrong-organization, and wrong-device responses are rejected        |
| 20G | Implement session manager                           | Lock state machine, inactivity timer, background lock, offline expiry                       | Ten-minute default and thirty-day expiry are enforced in tests                          |
| 20H | Implement biometric unlock                          | BiometricPrompt integration with authenticated Keystore operation                           | Strong biometric or supported device credential unlocks; enrollment change fails closed |
| 20I | Add policy refresh worker                           | WorkManager job with bounded retry and signed-response validation                           | Offline execution is safe; invalid responses never replace current policy               |
| 20J | Add Compose security screens                        | Enrollment, PIN setup, lock screen, security settings, expiry warning                       | No protected data is visible in locked/expired states                                   |
| 20K | Add security and lifecycle tests                    | Unit, instrumentation, migration, and adversarial tests                                     | Tests cover storage, lock, key invalidation, backup, logs, and process death            |
| 20L | Write enrollment and lost-device runbook            | Admin procedure for approval, revocation-on-reconnect, de-enrollment, and local destruction | Staff understand that offline devices cannot be remotely wiped                          |

## Acceptance criteria

Step 20 is complete when:

1. A synthetic Admin-approved enrollment response can be imported on an API 29 test device and is rejected when expired, wrong-organization, wrong-role, wrong-device, malformed, or tampered.
2. The Android app creates and uses non-exportable Keystore-protected local key material without exporting the Windows private signing key.
3. Protected local data remains unreadable or unusable after copying the database without the Keystore boundary.
4. The app locks after ten minutes of inactivity and immediately on backgrounding or explicit lock.
5. Offline access expires after the signed policy window and cannot be extended by wall-clock rollback or repeated app restart.
6. Biometric unlock works only through supported system authentication and falls back to the Elite PIN or device credential according to policy.
7. Biometric enrollment changes, Keystore invalidation, and de-enrollment require explicit recovery and do not silently discard or expose protected patient data.
8. WorkManager retries only transient connectivity failures and never replaces valid local policy with an unverified response.
9. Locked, expired, unenrolled, and suspended states expose no patient data in the UI, logs, notifications, or screenshots where platform controls permit.
10. The Android application remains usable offline for its permitted local functions and displays a clear warning that an offline device cannot be remotely wiped.

## Dependencies and sequencing

Implementation should proceed in this order:

1. Finalize the Step 19 status-package trust-anchor and enrollment response canonicalization profiles.
2. Decide the maintained Room encryption approach and document its API 29 compatibility.
3. Implement Keystore and local data protection before building clinical screens.
4. Implement enrollment and session state machines with synthetic-only fixtures.
5. Add PIN and biometric unlock, then background/inactivity/expiry enforcement.
6. Add WorkManager policy refresh and de-enrollment/lost-device workflows.
7. Perform Android instrumentation and security testing on API 29 and a current supported API.
8. Only after these controls pass should later steps add patient-record synchronization.

## Open decisions

| Decision             | Recommended default                                                   | Reason                                                                     |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Enrollment transport | Admin-controlled USB first; LAN exchange later                        | Supports disconnected deployment and keeps the initial trust surface small |
| Device identity      | Device-generated non-exportable key bound to signed Hub response      | Avoids treating hardware IDs or phone numbers as identity proof            |
| Local unlock         | Elite PIN required; strong biometric optional                         | Works across devices and preserves an explicit recovery path               |
| Biometric validity   | Auth-per-use for high-value actions; short window for ordinary unlock | Separates convenience from approval/destruction operations                 |
| Offline expiry       | 30 days, Admin-configurable within bounded limits                     | Matches existing clinic requirements while limiting stale access           |
| Inactivity lock      | 10 minutes by default, Admin-configurable within bounded limits       | Matches current Android requirements                                       |
| Lost device          | Revoke on next Hub contact plus local de-enrollment/destruction       | Remote wipe cannot operate while the device is offline                     |
| StrongBox            | Optional preference with recorded fallback                            | StrongBox is not universal and has performance/algorithm constraints [1]   |

## References

[1]: https://developer.android.com/privacy-and-security/keystore "Android Developers — Android Keystore system"
[2]: https://developer.android.com/identity/sign-in/biometric-auth "Android Developers — Show a biometric authentication dialog"
