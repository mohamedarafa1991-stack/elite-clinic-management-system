# Step 22 Enrollment State and Session-Key Implementation

## Status

This increment adds executable state-changing enrollment persistence on the Windows Hub and the Android cryptographic primitives required before encrypted synchronization sessions can be enabled. All test inputs remain synthetic. The implementation does not store real patient data in fixtures and does not export Android private keys.

## Hub enrollment state machine

The Hub now stores four migration-18 tables: `android_enrollment_challenges`, `android_enrollment_requests`, `android_enrollment_records`, and `android_enrollment_events`. The first three hold the current state and immutable protocol descriptors; the event table records each state transition for audit and incident review.

| Entity                        | States and transitions                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Challenge                     | `pending` → `accepted` after Admin approval, `expired` when its validity window closes, or `revoked` when the resulting enrollment is revoked.                               |
| Device request                | `pending` → `approved` during Admin approval. Exact request replay is idempotent; reuse of the request ID with different content is rejected.                                |
| Enrollment record             | `approved` → `active` after a valid device acknowledgment, or either state → `revoked` through the Admin revocation workflow. A revoked record cannot be acknowledged again. |
| Synchronization device policy | Created as `suspended` with the approved enrollment and changed to `active` only after acknowledgment. Revocation changes it to `revoked` in the same transaction.           |

Challenge creation, request intake, approval, acknowledgment, and revocation use SQLite transactions. Approval atomically updates the request and device, creates the enrollment record, changes the challenge, creates a suspended synchronization policy, appends an enrollment event, and writes an audit event. Acknowledgment atomically activates the enrollment and sync policy. Revocation atomically disables the enrollment, device, and sync policy and appends the reason.

The Electron main process exposes guarded enrollment IPC methods for challenge creation, device-request submission, Admin approval, device acknowledgment, summary retrieval, and revocation. Device-originated request submission and acknowledgment do not accept a bearer session token; they are accepted only after the protocol signature and device-key binding validators succeed.

## Android identity key

`AndroidIdentityKeyStore` creates and loads a non-exportable P-256 identity key in the Android Keystore. The exported identity consists only of the DER SubjectPublicKeyInfo bytes, Base64 encoding, and a SHA-256 fingerprint of those bytes. Enrollment requests and session-init messages are signed with `SHA256withECDSA`; the private key is never returned to application code as encoded key material. Android Keystore use is bounded by the platform security provider and is kept separate from the encrypted Room database key boundary.[1]

The application exposes this manager through `EliteApplication.identityKeyStore`; initialization does not automatically enroll a device or create a clinical session. Enrollment remains an explicit, Admin-approved workflow.

## ECDH and HKDF

`SessionKeyDerivation` uses P-256 ECDH to derive a shared secret from the local private key and the peer’s SPKI public key. The shared secret is not used directly as an AES key. HKDF-SHA-256 first uses the session transcript hash as salt and the protocol label `elite-clinic/session-key/v1` as context. It then derives separate 256-bit `client-to-hub` and `hub-to-client` keys from the root key. The same algorithm is implemented in TypeScript for Hub-side test vectors and reference verification.

The implementation includes the RFC 5869 SHA-256 test case 1 and a P-256 ECDH symmetry test. The Android JVM test source contains corresponding HKDF and ECDH assertions so the Android build can confirm cross-platform behavior.[2]

> The derived keys are not yet connected to AES-GCM frame processing. Session frames must not be enabled until transcript binding, key-confirmation, direction counters, nonce construction, and replay rejection are implemented and tested together.

## Verification and limitations

The TypeScript workspace currently passes the full contracts, database, auth, and desktop test suites, including the new migration, enrollment transition, request-replay, signature, ECDH, and HKDF tests. TypeScript typechecking and the Electron desktop build also pass.

The Android Gradle test suite remains pending in this sandbox because the repository has no Gradle wrapper and the environment has no system Gradle or Kotlin compiler. Android source review is therefore not a substitute for compilation on the project’s Android build machine. The next increment should execute these JVM tests, then add encrypted AES-GCM frames and WorkManager session renewal only after the Android build is green.

## References

[1]: https://developer.android.com/privacy-and-security/keystore "Android Developers: The Android Keystore system"
[2]: https://www.rfc-editor.org/rfc/rfc5869 "RFC 5869: HMAC-based Extract-and-Expand Key Derivation Function (HKDF)"
