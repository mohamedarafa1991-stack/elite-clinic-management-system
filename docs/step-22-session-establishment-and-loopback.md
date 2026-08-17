# Step 22: Signed LAN Session Establishment and Loopback Verification

## Scope

This increment connects the Android enrollment identity to the Hub LAN session registry. The session-init message is signed by the enrolled Android P-256 identity key. The Hub validates the enrollment record and device signature, performs an ephemeral P-256 ECDH exchange, derives directional AES-256-GCM keys with HKDF-SHA-256, binds all values to a canonical transcript, and signs a short-lived `SessionGrant` with the Hub Ed25519 signing key.

The signed grant carries the server ephemeral public key, transcript hash, key-confirmation MAC, granted scopes, validity window, and the four-byte frame nonce prefix. The nonce prefix is part of the signed grant because both peers must construct the same deterministic `prefix || uint64-big-endian counter` nonce sequence. The generic base64 contract is not used for this field; the dedicated schema accepts the exact eight-character base64 representation of four bytes.

## Handshake and registration

The plaintext handshake endpoint is `POST /sync/session-init`. It accepts only a device-signed `SessionInitRequest`; no session state is registered until the Hub validates the enrollment, identity tuple, requested scopes, and ECDSA signature. The endpoint returns a signed `SessionGrant`. The encrypted data endpoint remains `POST /sync/lan` and accepts only AES-GCM session frames whose session ID is already present in the router registry.

| Stage                 | Hub action                                                                                                                  | Android action                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Session-init          | Load the active enrollment record and its enrolled public key.                                                              | Generate an in-memory P-256 ephemeral key and build the canonical unsigned descriptor.  |
| Device authentication | Verify the `SHA256withECDSA` signature and bind organization, enrollment, device, and user IDs.                             | Sign the descriptor with the non-exportable Android Keystore identity key.              |
| Key agreement         | Generate the Hub ephemeral P-256 key and derive the ECDH shared secret.                                                     | Derive the same shared secret using the ephemeral private key and Hub public key.       |
| Transcript binding    | Hash the canonical transcript containing both ephemeral keys, identities, scopes, timestamps, session ID, and nonce prefix. | Reconstruct and compare the transcript hash from the returned grant.                    |
| Key confirmation      | Compute the `hub` HMAC and include it in the signed grant.                                                                  | Derive the same confirmation key and verify the Hub MAC in constant time.               |
| Registry handoff      | Verify the signed grant again through `registerSignedSession()` and register the Hub-side frame channel.                    | Create `SessionFrameCodec` with client-to-Hub send keys and Hub-to-client receive keys. |

The first session validity window is five minutes, additionally bounded by the enrollment `expires_at` and `offline_access_until` values. The Hub session context is restricted to synchronization capabilities and is not treated as a general interactive desktop login session.

## Request factories

`buildDeltaRequest()` validates the requested scope against the enrolled device policy, carries the current cursor, and creates a fresh synchronization session ID and request nonce by default. `buildOutboxRequest()` enforces the organization, device, user, active-policy, and scope bindings before converting a local event into the shared `SyncOutboxInput` shape. The Android implementation performs the same checks before creating its JSON envelope for WorkManager-driven synchronization.

| Factory        | Required identity bindings                                      | Output guarantees                                                                          |
| -------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Delta request  | Organization, device, owner user, policy version, allowed scope | Protocol version, fresh nonce, cursor, client base version, and bounded change count       |
| Outbox request | Organization, device, owner user, active policy, allowed scope  | Operation ID, resource identity, positive base version, payload, reason, and creation time |

## Android session factory

`LanSyncSessionFactory` uses `AndroidIdentityKeyStore` for the long-lived device identity and generates the ephemeral P-256 key in memory. It posts the signed request to `/sync/session-init`, validates all grant identity fields and granted scopes, verifies the Hub Ed25519 signature against the configured trust anchor, reconstructs the transcript, validates key confirmation, and creates `LanSyncHttpSession` with directional AES-GCM keys. The factory does not persist ephemeral private key material.

The resulting HTTP session uses request-scoped connections. Session counters and frame keys remain in memory for the session owner and are discarded when the session is closed. Outbox payload construction is delegated to the policy-bound Android request factory, while delta requests can be created with the same policy and cursor factory before invoking `requestDelta()`.

## Loopback integration test

`packages/auth/src/lan-loopback.test.ts` starts an ephemeral `node:http` server bound only to `127.0.0.1`, creates an in-memory encrypted-storage-compatible test database, bootstraps synthetic administrators, inserts an active Android enrollment record, and registers a synchronization policy. The test then performs the complete signed session-init flow, derives the client-side session keys, sends encrypted delta and outbox frames, decrypts both responses, verifies the Ed25519 delta signature, and confirms that the outbox operation was accepted and persisted as pending on the Hub.

| Verification                          | Result                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Device ECDSA session-init signature   | Verified by the Hub before registry insertion                                                       |
| Hub Ed25519 session grant signature   | Verified by the loopback client                                                                     |
| ECDH/HKDF transcript-derived keys     | Matched on both sides                                                                               |
| Key-confirmation HMAC                 | Matched for the `hub` role                                                                          |
| AES-GCM frame directions and counters | Delta and outbox request/response round trips succeeded                                             |
| Signed synchronization delta          | Parsed and signature-verified                                                                       |
| Outbox acknowledgment                 | Returned as `accepted`; Hub row remained `pending` until the normal acknowledgment state transition |

## Verification note

The TypeScript build, workspace typecheck, auth tests, and loopback integration test are executable in the current sandbox. The Android project does not contain a Gradle wrapper, and no system `gradle` executable is available in the sandbox; therefore Android compilation and device tests remain pending for an environment with the Android SDK and Gradle toolchain. The Kotlin implementation is aligned with the existing Android cryptographic and canonical-JSON helpers and should be compiled on the Windows/Android build workstation before release packaging.
